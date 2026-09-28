// Apenas contratos públicos. Nenhum gabarito, relação com linguagem ou seed aqui.
export type Mode = 'code' | 'acronym' | 'framework';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'standard';
export type GameStatus = 'playing' | 'won' | 'lost' | 'expired';
export type Profile = {
  id: string;
  name: string;
  avatarUrl: string | null;
  provider: 'google' | 'local';
  totalPoints: number;
  monthlyPoints: number;
};
export type DailyChallenge = {
  id: string;
  date: string;
  mode: Mode;
  difficulty: Difficulty;
  maxPoints: number;
  status: GameStatus | null;
  points: number;
};
export type PublicConfig = {
  localAuth: boolean;
  supabase: { url: string; key: string } | null;
  storage: 'local' | 'postgres';
};
export type Bootstrap = {
  date: string;
  serverTime: string;
  nextReset: string;
  profile: Profile | null;
  challenges: DailyChallenge[];
  languages: string[];
  config: PublicConfig;
};
export type Guess = { number: number; text: string; correct: boolean };
export type Game = {
  id: string;
  dailyId: string;
  date: string;
  mode: Mode;
  difficulty: Difficulty;
  content: string;
  status: GameStatus;
  ranked: boolean;
  startedAt: string;
  finishedAt: string | null;
  serverTime: string;
  points: number;
  maxPoints: number;
  attemptsLeft: number;
  hint?: string;
  guesses: Guess[];
};
export type RankingEntry = {
  position: number;
  id: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  wins: number;
  isYou: boolean;
};
export type Ranking = {
  period: 'month' | 'all';
  month: string;
  entries: RankingEntry[];
  own: RankingEntry | null;
  players: number;
};
export type ArchiveDay = { date: string; challenges: DailyChallenge[] };
