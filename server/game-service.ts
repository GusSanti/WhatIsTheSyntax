import type { Database } from './db.js';
import {
  ApiError,
  BASE_POINTS,
  calculatePoints,
  gameDate,
  normalizeAcronym,
  resolveLanguage,
  normalizePublicName,
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

export type Principal = { actorKey: string; profileId: string | null };
type DailyRow = {
  id: string;
  day: string;
  challenge_id: string;
  mode: Mode;
  difficulty: Difficulty;
  prompt: string | null;
  source_code: string | null;
  language_hint: string | null;
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
  guesses: StoredGuess[];
  points: number;
  started_at: Date;
  finished_at: Date | null;
};
type StoredGuess = {
  requestId: string;
  text: string;
  normalized: string;
  correct: boolean;
};
type GuessContext = SessionRow &
  DailyRow & {
    resolved_daily_id: string;
    candidate_language_id: string | null;
    acronym_definition: string | null;
    answer_correct: boolean;
  };
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
      avatar_url: string | null;
      provider: 'google' | 'local';
      points: number;
      monthly: string;
    }>(
      `
      SELECT p.id, p.display_name, p.avatar_url, p.provider, p.points,
        COALESCE((SELECT SUM(g.points) FROM game.game_sessions g
          JOIN game.daily_challenges d ON d.id=g.daily_id
          WHERE g.profile_id=p.id AND g.ranked AND g.status='won'
          AND to_char(d.day,'YYYY-MM')=$2),0)::text AS monthly
      FROM game.profiles p WHERE p.id = $1`,
      [id, gameDate(this.now()).slice(0, 7)],
    );
    return row
      ? {
          id: row.id,
          name: row.display_name,
          avatarUrl: row.avatar_url,
          provider: row.provider,
          totalPoints: row.points,
          monthlyPoints: Number(row.monthly),
        }
      : null;
  }

  async updateDisplayName(profileId: string | null, value: string): Promise<Profile> {
    if (!profileId) throw new ApiError(401, 'Entre na sua conta para mudar o nome público.');
    const name = normalizePublicName(value);
    await this.db.query('UPDATE game.profiles SET display_name=$2 WHERE id=$1', [profileId, name]);
    const profile = await this.profile(profileId);
    if (!profile) throw new ApiError(404, 'Perfil não encontrado.');
    return profile;
  }

  async listDaily(principal: Principal, day: string): Promise<DailyChallenge[]> {
    if (day > gameDate(this.now()))
      throw new ApiError(404, 'Essa edição ainda não está disponível.');
    const { rows } = await this.db.query<
      DailyRow & { status: GameStatus | null; points: number | null }
    >(
      `
      SELECT d.id, d.day::text, c.mode, COALESCE(l.difficulty,'standard') AS difficulty, latest.status, latest.points
      FROM game.daily_challenges d JOIN game.challenges c ON c.id = d.challenge_id
      LEFT JOIN game.code_snippets s ON s.id=c.snippet_id
      LEFT JOIN game.languages l ON l.id=s.language_id
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
      const today = gameDate(this.now());
      const {
        rows: [found],
      } = await tx.query<DailyRow & { previous_session: SessionRow | null }>(
        `SELECT d.id, d.day::text, d.challenge_id, c.mode,
          COALESCE(l.difficulty,'standard') AS difficulty,
          COALESCE(f.name,a.acronym) AS prompt,
          s.source_code, h.description AS language_hint,
          to_jsonb(previous) AS previous_session
        FROM game.daily_challenges d
        JOIN game.challenges c ON c.id=d.challenge_id
        LEFT JOIN game.code_snippets s ON s.id=c.snippet_id
        LEFT JOIN game.languages l ON l.id=s.language_id
        LEFT JOIN game.frameworks f ON f.id=c.framework_id
        LEFT JOIN game.language_hints h ON h.language_id=COALESCE(s.language_id,f.language_id)
        LEFT JOIN game.acronyms a ON a.id=c.acronym_id
        LEFT JOIN LATERAL (
          SELECT * FROM game.game_sessions g WHERE g.actor_key=$2 AND g.daily_id=d.id
            AND g.practice=(d.day < $3::date)
          ORDER BY g.started_at DESC LIMIT 1
        ) previous ON true WHERE d.id=$1`,
        [dailyId, principal.actorKey, today],
      );
      if (!found) throw new ApiError(404, 'Desafio não encontrado.');
      const daily: DailyRow = found;
      if (daily.day > today) throw new ApiError(404, 'Essa edição ainda não está disponível.');
      const practice = daily.day < today;
      // Histórico competitivo não vira treino nem volta a pontuar na mudança de dia.
      if (practice)
        await tx.query(
          `UPDATE game.game_sessions SET status='expired', finished_at=$3
        WHERE actor_key=$1 AND daily_id=$2 AND status='playing' AND NOT practice`,
          [principal.actorKey, dailyId, this.now()],
        );
      const previous = found.previous_session;
      if (previous && (!practice || !restart || previous.status === 'playing'))
        return this.formatGame(previous, daily);
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
      if (created) return this.formatGame(created, daily);
      const {
        rows: [session],
      } = await tx.query<SessionRow>(
        'SELECT * FROM game.game_sessions WHERE actor_key=$1 AND daily_id=$2 ORDER BY started_at DESC LIMIT 1',
        [principal.actorKey, dailyId],
      );
      return this.formatGame(session, daily);
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
        rows: [row],
      } = await tx.query<GuessContext>(
        `SELECT g.*, d.id AS resolved_daily_id, d.day::text, d.challenge_id,
          c.mode, COALESCE(primary_language.difficulty,'standard') AS difficulty,
          COALESCE(f.name,a.acronym) AS prompt, s.source_code,
          h.description AS language_hint,
          candidate.id AS candidate_language_id, a.definition AS acronym_definition,
          CASE WHEN c.mode='framework' THEN
            f.language_id=candidate.id OR candidate.name=ANY(f.accepted_language_names)
            ELSE s.language_id=candidate.id OR candidate.name=ANY(s.accepted_language_names)
          END AS answer_correct
        FROM game.game_sessions g
        JOIN game.daily_challenges d ON d.id=g.daily_id
        JOIN game.challenges c ON c.id=d.challenge_id
        LEFT JOIN game.code_snippets s ON s.id=c.snippet_id
        LEFT JOIN game.languages primary_language ON primary_language.id=s.language_id
        LEFT JOIN game.frameworks f ON f.id=c.framework_id
        LEFT JOIN game.language_hints h ON h.language_id=COALESCE(s.language_id,f.language_id)
        LEFT JOIN game.acronyms a ON a.id=c.acronym_id
        LEFT JOIN game.languages candidate ON lower(candidate.name)=$3
        WHERE g.id=$1 AND g.actor_key=$2 FOR UPDATE OF g`,
        [sessionId, principal.actorKey, resolveLanguage(text)],
      );
      if (!row) throw new ApiError(404, 'Partida não encontrada.');
      const session: SessionRow = row;
      const daily: DailyRow = { ...row, id: row.resolved_daily_id };
      const guesses = row.guesses;
      const repeated = guesses.find((guess) => guess.requestId === requestId);
      if (repeated) {
        if (repeated.text !== text.trim())
          throw new ApiError(409, 'Identificador de envio já utilizado.');
        return this.formatGame(session, daily);
      }
      if (session.status !== 'playing') throw new ApiError(409, 'Essa partida já foi encerrada.');
      const now = this.now();
      if (!session.practice && daily.day !== gameDate(now)) {
        await tx.query(
          `UPDATE game.game_sessions SET status='expired', finished_at=$2 WHERE id=$1`,
          [sessionId, now],
        );
        return this.formatGame({ ...session, status: 'expired', finished_at: now }, daily);
      }
      let normalized: string, correct: boolean;
      if (daily.mode === 'acronym') {
        normalized = normalizeAcronym(text);
        if (!normalized) throw new ApiError(422, 'Escreva o significado da sigla.');
        correct = normalized.toUpperCase() === normalizeAcronym(row.acronym_definition || '').toUpperCase();
      } else {
        if (!row.candidate_language_id)
          throw new ApiError(422, 'Escolha uma linguagem da lista ou use um nome reconhecido.');
        normalized = `language:${row.candidate_language_id}`;
        correct = row.answer_correct;
      }
      if (guesses.some((guess) => guess.normalized === normalized))
        throw new ApiError(
          409,
          'Você já tentou essa resposta. Escolha outra sem perder uma tentativa.',
        );
      const attempt = session.attempts + 1;
      const elapsed = Math.max(0, now.getTime() - new Date(session.started_at).getTime());
      const points =
        correct && session.ranked ? calculatePoints(daily.difficulty, attempt, elapsed) : 0;
      const status: GameStatus = correct ? 'won' : attempt === 5 ? 'lost' : 'playing';
      const savedGuess: StoredGuess = { requestId, text: text.trim(), normalized, correct };
      const {
        rows: [updated],
      } = await tx.query<SessionRow>(
        `UPDATE game.game_sessions SET attempts=$2, status=$3, points=$4,
          finished_at=$5, guesses=guesses || $6::jsonb
        WHERE id=$1 RETURNING *`,
        [sessionId, attempt, status, points, status === 'playing' ? null : now,
          JSON.stringify([savedGuess])],
      );
      if (points > 0)
        await tx.query('UPDATE game.profiles SET points=points+$2 WHERE id=$1', [
          principal.profileId, points,
        ]);
      return this.formatGame(updated, daily);
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
      avatar_url: string | null;
      points: string;
      wins: string;
      position: string;
      players: string;
    }>(
      `
      WITH totals AS (
        SELECT p.id, p.display_name AS name, p.avatar_url, SUM(g.points) AS points,
          COUNT(*) AS wins, MIN(g.finished_at) AS first_score
        FROM game.game_sessions g JOIN game.profiles p ON p.id=g.profile_id
        JOIN game.daily_challenges d ON d.id=g.daily_id
        WHERE g.ranked AND g.status='won'
          AND ($1 = 'all' OR to_char(d.day,'YYYY-MM')=$2) GROUP BY p.id
      ), ranked AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY points DESC, wins DESC, first_score ASC, id) AS position, COUNT(*) OVER () AS players FROM totals
      ) SELECT * FROM ranked WHERE position <= 100 OR id=$3 ORDER BY position`,
      [period, month, profileId],
    );
    const entries: RankingEntry[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      avatarUrl: row.avatar_url,
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

  private formatGame(session: SessionRow, daily: DailyRow): Game {
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
      attemptsLeft: 5 - session.attempts,
      ...(daily.mode !== 'acronym' && session.guesses.filter((guess) => !guess.correct).length >= 3 && daily.language_hint
        ? { hint: daily.language_hint }
        : {}),
      guesses: session.guesses.map((guess, index) => ({
        number: index + 1,
        text: guess.text,
        correct: guess.correct,
      })),
    };
  }
}
