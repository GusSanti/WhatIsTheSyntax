-- Execute este arquivo uma única vez no SQL Editor de um projeto Supabase novo.
-- Ele reproduz 001_initial.sql e 002_profile_avatar.sql e registra ambas as migrações.
BEGIN;
CREATE SCHEMA IF NOT EXISTS game;
REVOKE ALL ON SCHEMA game FROM PUBLIC;
CREATE TABLE IF NOT EXISTS game.schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz DEFAULT now()
);

CREATE SCHEMA IF NOT EXISTS game;
REVOKE ALL ON SCHEMA game FROM PUBLIC;

CREATE TABLE game.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  provider text NOT NULL CHECK (provider IN ('google', 'local')),
  display_name varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game.languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);
CREATE TABLE game.language_aliases (
  normalized_alias text PRIMARY KEY,
  language_id uuid NOT NULL REFERENCES game.languages(id) ON DELETE CASCADE
);
CREATE TABLE game.code_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  editorial_key text NOT NULL UNIQUE,
  language_id uuid NOT NULL REFERENCES game.languages(id),
  source_code text NOT NULL,
  source_note text NOT NULL DEFAULT 'Trecho autoral de demonstração',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  editorial_key text NOT NULL UNIQUE,
  mode text NOT NULL CHECK (mode IN ('code', 'acronym', 'framework')),
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'standard')),
  prompt text,
  snippet_id uuid REFERENCES game.code_snippets(id),
  CHECK ((mode = 'code' AND snippet_id IS NOT NULL AND difficulty <> 'standard')
    OR (mode <> 'code' AND snippet_id IS NULL AND difficulty = 'standard' AND prompt IS NOT NULL))
);
-- Respostas adicionais em código; todas as respostas em siglas/frameworks.
-- O gabarito principal de código vem de code_snippets.language_id.
CREATE TABLE game.challenge_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES game.challenges(id) ON DELETE CASCADE,
  language_id uuid REFERENCES game.languages(id),
  normalized_text text,
  CHECK ((language_id IS NOT NULL) <> (normalized_text IS NOT NULL)),
  UNIQUE (challenge_id, language_id),
  UNIQUE (challenge_id, normalized_text)
);
CREATE TABLE game.daily_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  slot text NOT NULL CHECK (slot IN ('code-easy', 'code-medium', 'code-hard', 'acronym', 'framework')),
  challenge_id uuid NOT NULL REFERENCES game.challenges(id),
  UNIQUE (day, slot)
);
CREATE TABLE game.visitor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  local_profile_id uuid REFERENCES game.profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_id uuid NOT NULL REFERENCES game.daily_challenges(id),
  actor_key text NOT NULL,
  profile_id uuid REFERENCES game.profiles(id) ON DELETE CASCADE,
  ranked boolean NOT NULL,
  practice boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'won', 'lost', 'expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  scoring_version integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (NOT ranked OR profile_id IS NOT NULL)
);
-- Uma partida diária por identidade; treino pode ser refeito depois de concluído.
CREATE UNIQUE INDEX one_ranked_game ON game.game_sessions (profile_id, daily_id) WHERE ranked;
CREATE UNIQUE INDEX one_open_game ON game.game_sessions (actor_key, daily_id) WHERE status = 'playing';
CREATE INDEX sessions_actor_daily ON game.game_sessions (actor_key, daily_id, started_at DESC);
CREATE TABLE game.guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES game.game_sessions(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 3),
  submitted_text varchar(160) NOT NULL,
  normalized_text text NOT NULL,
  correct boolean NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, request_id),
  UNIQUE (session_id, normalized_text),
  UNIQUE (session_id, attempt)
);
CREATE TABLE game.score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES game.game_sessions(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES game.profiles(id) ON DELETE CASCADE,
  challenge_day date NOT NULL,
  points integer NOT NULL CHECK (points > 0),
  attempts integer NOT NULL,
  elapsed_ms bigint NOT NULL CHECK (elapsed_ms >= 0),
  scoring_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX score_profile_day ON game.score_events (profile_id, challenge_day);
CREATE INDEX score_day ON game.score_events (challenge_day);

-- Sem privilégios de navegador/API pública, mesmo em instalações Supabase.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA game FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA game FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA game FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA game FROM authenticated;
  END IF;
END $$;


INSERT INTO game.schema_migrations (name) VALUES ('001_initial.sql');
ALTER TABLE game.profiles ADD COLUMN avatar_url text;
INSERT INTO game.schema_migrations (name) VALUES ('002_profile_avatar.sql');
COMMIT;

