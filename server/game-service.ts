import type { Database, Queryable } from './db.js';
import {
  ApiError,
  BASE_POINTS,
  calculatePoints,
  gameDate,
  normalizeAcronym,
  normalizeLanguage,
} from './domain.js';
import type {
  DailyChallenge,
  Difficulty,
  Game,
  GameStatus,
  Mode,
  Profile,
  Ranking,
  RankingEntry,
} from '../shared/contracts.js';

export type Principal = { actorKey: string; profileId: string | null; visitorId: string };
type DailyRow = {
  id: string;
  day: string;
  challenge_id: string;
  mode: Mode;
  difficulty: Difficulty;
  prompt: string | null;
  source_code: string | null;
};
type SessionRow = {
  id: string;
  daily_id: string;
  actor_key: string;
  profile_id: string | null;
  ranked: boolean;
  practice: boolean;
  status: GameStatus;
  attempts: number;
  points: number;
  started_at: Date;
  finished_at: Date | null;
};
const dailySql = `SELECT d.id, d.day::text, d.challenge_id, c.mode, c.difficulty, c.prompt, s.source_code
  FROM game.daily_challenges d JOIN game.challenges c ON c.id = d.challenge_id
  LEFT JOIN game.code_snippets s ON s.id = c.snippet_id`;

export class GameService {
  constructor(
    public db: Database,
    private clock: () => Date = () => new Date(),
  ) {}
  now() {
    return this.clock();
  }

  async profile(id: string | null): Promise<Profile | null> {
    if (!id) return null;
    const {
      rows: [row],
    } = await this.db.query<{
      id: string;
      display_name: string;
      provider: 'google' | 'local';
      total: string;
      monthly: string;
    }>(
      `
      SELECT p.id, p.display_name, p.provider, COALESCE(SUM(s.points),0)::text AS total,
        COALESCE(SUM(s.points) FILTER (WHERE to_char(s.challenge_day,'YYYY-MM') = $2),0)::text AS monthly
      FROM game.profiles p LEFT JOIN game.score_events s ON s.profile_id = p.id WHERE p.id = $1 GROUP BY p.id`,
      [id, gameDate(this.now()).slice(0, 7)],
    );
    return row
      ? {
          id: row.id,
          name: row.display_name,
          provider: row.provider,
          totalPoints: Number(row.total),
          monthlyPoints: Number(row.monthly),
        }
      : null;
  }

  async listDaily(principal: Principal, day: string): Promise<DailyChallenge[]> {
    if (day > gameDate(this.now()))
      throw new ApiError(404, 'Essa edição ainda não está disponível.');
    const { rows } = await this.db.query<
      DailyRow & { status: GameStatus | null; points: number | null }
    >(
      `
      SELECT d.id, d.day::text, c.mode, c.difficulty, latest.status, latest.points
      FROM game.daily_challenges d JOIN game.challenges c ON c.id = d.challenge_id
      LEFT JOIN LATERAL (SELECT status, points FROM game.game_sessions g
        WHERE g.daily_id = d.id AND g.actor_key = $2 ORDER BY g.started_at DESC LIMIT 1) latest ON true
      WHERE d.day = $1 ORDER BY CASE d.slot WHEN 'code-easy' THEN 1 WHEN 'code-medium' THEN 2 WHEN 'code-hard' THEN 3 WHEN 'acronym' THEN 4 ELSE 5 END`,
      [day, principal.actorKey],
    );
    return rows.map((row) => ({
      id: row.id,
      date: row.day,
      mode: row.mode,
      difficulty: row.difficulty,
      maxPoints: BASE_POINTS[row.difficulty] * 1.25,
      status: row.status,
      points: row.points || 0,
    }));
  }

  async start(principal: Principal, dailyId: string, restart = false): Promise<Game> {
    return this.db.transaction(async (tx) => {
      const daily = await this.daily(tx, dailyId);
      const today = gameDate(this.now());
      if (daily.day > today) throw new ApiError(404, 'Essa edição ainda não está disponível.');
      const practice = daily.day < today;
      // Histórico competitivo não vira treino nem volta a pontuar na mudança de dia.
      if (practice)
        await tx.query(
          `UPDATE game.game_sessions SET status='expired', finished_at=$3
        WHERE actor_key=$1 AND daily_id=$2 AND status='playing' AND NOT practice`,
          [principal.actorKey, dailyId, this.now()],
        );
      const {
        rows: [previous],
      } = await tx.query<SessionRow>(
        `SELECT * FROM game.game_sessions
        WHERE actor_key=$1 AND daily_id=$2 AND practice=$3 ORDER BY started_at DESC LIMIT 1`,
        [principal.actorKey, dailyId, practice],
      );
      if (previous && (!practice || !restart || previous.status === 'playing'))
        return this.publicGame(tx, previous, daily);
      const {
        rows: [created],
      } = await tx.query<SessionRow>(
        `INSERT INTO game.game_sessions
        (daily_id,actor_key,profile_id,ranked,practice,started_at) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT DO NOTHING RETURNING *`,
        [
          dailyId,
          principal.actorKey,
          principal.profileId,
          !!principal.profileId && !practice,
          practice,
          this.now(),
        ],
      );
      const session =
        created ||
        (
          await tx.query<SessionRow>(
            'SELECT * FROM game.game_sessions WHERE actor_key=$1 AND daily_id=$2 ORDER BY started_at DESC LIMIT 1',
            [principal.actorKey, dailyId],
          )
        ).rows[0];
      return this.publicGame(tx, session, daily);
    });
  }

  async guess(
    principal: Principal,
    sessionId: string,
    text: string,
    requestId: string,
  ): Promise<Game> {
    return this.db.transaction(async (tx) => {
      const {
        rows: [session],
      } = await tx.query<SessionRow>(
        'SELECT * FROM game.game_sessions WHERE id=$1 AND actor_key=$2 FOR UPDATE',
        [sessionId, principal.actorKey],
      );
      if (!session) throw new ApiError(404, 'Partida não encontrada.');
      const daily = await this.daily(tx, session.daily_id);
      const {
        rows: [repeated],
      } = await tx.query<{ submitted_text: string }>(
        'SELECT submitted_text FROM game.guesses WHERE session_id=$1 AND request_id=$2',
        [sessionId, requestId],
      );
      if (repeated) {
        if (repeated.submitted_text !== text.trim())
          throw new ApiError(409, 'Identificador de envio já utilizado.');
        return this.publicGame(tx, session, daily);
      }
      if (session.status !== 'playing') throw new ApiError(409, 'Essa partida já foi encerrada.');
      const now = this.now();
      if (!session.practice && daily.day !== gameDate(now)) {
        await tx.query(
          `UPDATE game.game_sessions SET status='expired', finished_at=$2 WHERE id=$1`,
          [sessionId, now],
        );
        return this.publicGame(tx, { ...session, status: 'expired', finished_at: now }, daily);
      }
      let normalized: string, correct: boolean;
      if (daily.mode === 'acronym') {
        normalized = normalizeAcronym(text);
        if (!normalized) throw new ApiError(422, 'Escreva o significado da sigla.');
        const { rows } = await tx.query(
          'SELECT 1 FROM game.challenge_answers WHERE challenge_id=$1 AND normalized_text=$2',
          [daily.challenge_id, normalized],
        );
        correct = rows.length > 0;
      } else {
        const {
          rows: [language],
        } = await tx.query<{ language_id: string }>(
          'SELECT language_id FROM game.language_aliases WHERE normalized_alias=$1',
          [normalizeLanguage(text)],
        );
        if (!language)
          throw new ApiError(422, 'Escolha uma linguagem da lista ou use um nome reconhecido.');
        normalized = `language:${language.language_id}`;
        const { rows } = await tx.query(
          `SELECT 1 FROM game.challenges c LEFT JOIN game.code_snippets s ON s.id=c.snippet_id
          WHERE c.id=$1 AND (s.language_id=$2 OR EXISTS (SELECT 1 FROM game.challenge_answers a WHERE a.challenge_id=c.id AND a.language_id=$2))`,
          [daily.challenge_id, language.language_id],
        );
        correct = rows.length > 0;
      }
      const duplicates = await tx.query(
        'SELECT 1 FROM game.guesses WHERE session_id=$1 AND normalized_text=$2',
        [sessionId, normalized],
      );
      if (duplicates.rows.length)
        throw new ApiError(
          409,
          'Você já tentou essa resposta. Escolha outra sem perder uma tentativa.',
        );
      const attempt = session.attempts + 1;
      const elapsed = Math.max(0, now.getTime() - new Date(session.started_at).getTime());
      const points =
        correct && session.ranked ? calculatePoints(daily.difficulty, attempt, elapsed) : 0;
      const status: GameStatus = correct ? 'won' : attempt === 3 ? 'lost' : 'playing';
      await tx.query(
        'INSERT INTO game.guesses (session_id,request_id,attempt,submitted_text,normalized_text,correct,submitted_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [sessionId, requestId, attempt, text.trim(), normalized, correct, now],
      );
      const {
        rows: [updated],
      } = await tx.query<SessionRow>(
        'UPDATE game.game_sessions SET attempts=$2,status=$3,points=$4,finished_at=$5 WHERE id=$1 RETURNING *',
        [sessionId, attempt, status, points, status === 'playing' ? null : now],
      );
      if (points > 0)
        await tx.query(
          `INSERT INTO game.score_events (session_id,profile_id,challenge_day,points,attempts,elapsed_ms,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (session_id) DO NOTHING`,
          [sessionId, principal.profileId, daily.day, points, attempt, elapsed, now],
        );
      return this.publicGame(tx, updated, daily);
    });
  }

  async archive(principal: Principal) {
    const { rows } = await this.db.query<{ day: string }>(
      'SELECT DISTINCT day::text FROM game.daily_challenges WHERE day < $1 ORDER BY day DESC LIMIT 30',
      [gameDate(this.now())],
    );
    return Promise.all(
      rows.map(async ({ day }) => ({
        date: day,
        challenges: await this.listDaily(principal, day),
      })),
    );
  }

  async ranking(profileId: string | null, period: 'month' | 'all'): Promise<Ranking> {
    const month = gameDate(this.now()).slice(0, 7);
    const { rows } = await this.db.query<{
      id: string;
      name: string;
      points: string;
      wins: string;
      position: string;
      players: string;
    }>(
      `
      WITH totals AS (
        SELECT p.id, p.display_name AS name, SUM(s.points) AS points, COUNT(*) AS wins, MIN(s.created_at) AS first_score
        FROM game.score_events s JOIN game.profiles p ON p.id=s.profile_id
        WHERE ($1 = 'all' OR to_char(s.challenge_day,'YYYY-MM')=$2) GROUP BY p.id
      ), ranked AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY points DESC, wins DESC, first_score ASC, id) AS position, COUNT(*) OVER () AS players FROM totals
      ) SELECT * FROM ranked WHERE position <= 100 OR id=$3 ORDER BY position`,
      [period, month, profileId],
    );
    const entries: RankingEntry[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      points: Number(row.points),
      wins: Number(row.wins),
      position: Number(row.position),
      isYou: row.id === profileId,
    }));
    return {
      period,
      month,
      entries: entries.filter((row) => row.position <= 100),
      own: entries.find((row) => row.isYou) || null,
      players: Number(rows[0]?.players || 0),
    };
  }

  private async daily(db: Queryable, id: string) {
    const {
      rows: [daily],
    } = await db.query<DailyRow>(`${dailySql} WHERE d.id=$1`, [id]);
    if (!daily) throw new ApiError(404, 'Desafio não encontrado.');
    return daily;
  }

  private async publicGame(db: Queryable, session: SessionRow, daily: DailyRow): Promise<Game> {
    const { rows } = await db.query<{ attempt: number; submitted_text: string; correct: boolean }>(
      'SELECT attempt,submitted_text,correct FROM game.guesses WHERE session_id=$1 ORDER BY attempt',
      [session.id],
    );
    // Lista explícita: nunca espalhar linhas SQL no JSON público.
    return {
      id: session.id,
      dailyId: daily.id,
      date: daily.day,
      mode: daily.mode,
      difficulty: daily.difficulty,
      content: daily.mode === 'code' ? daily.source_code! : daily.prompt!,
      status: session.status,
      ranked: session.ranked,
      startedAt: new Date(session.started_at).toISOString(),
      finishedAt: session.finished_at ? new Date(session.finished_at).toISOString() : null,
      serverTime: this.now().toISOString(),
      points: session.points,
      maxPoints: BASE_POINTS[daily.difficulty] * 1.25,
      attemptsLeft: 3 - session.attempts,
      guesses: rows.map((row) => ({
        number: row.attempt,
        text: row.submitted_text,
        correct: row.correct,
      })),
    };
  }
}
