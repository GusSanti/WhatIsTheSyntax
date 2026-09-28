-- Instalação NOVA no SQL Editor do Supabase.
-- Para banco existente, use supabase_manual_upgrade.sql ou, se 003 já foi
-- aplicada, supabase_manual_guesses.sql.
BEGIN;
CREATE SCHEMA IF NOT EXISTS game;
REVOKE ALL ON SCHEMA game FROM PUBLIC;
CREATE TABLE game.schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  provider text NOT NULL CHECK (provider IN ('google','local')),
  display_name varchar(40) NOT NULL,
  avatar_url text,
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game.languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  difficulty text NOT NULL CHECK (difficulty IN ('easy','medium','hard'))
);
CREATE TABLE game.language_hints (
  language_id uuid PRIMARY KEY REFERENCES game.languages(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (length(trim(description)) > 0)
);
CREATE TABLE game.code_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  editorial_key text NOT NULL UNIQUE,
  language_id uuid NOT NULL REFERENCES game.languages(id),
  source_code text NOT NULL,
  accepted_language_names text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game.frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  language_id uuid NOT NULL REFERENCES game.languages(id),
  accepted_language_names text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE game.acronyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acronym text NOT NULL UNIQUE,
  definition text NOT NULL
);
CREATE TABLE game.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  editorial_key text NOT NULL UNIQUE,
  mode text NOT NULL CHECK (mode IN ('code','acronym','framework')),
  snippet_id uuid REFERENCES game.code_snippets(id),
  framework_id uuid REFERENCES game.frameworks(id),
  acronym_id uuid REFERENCES game.acronyms(id),
  CONSTRAINT challenges_target_check CHECK (
    (mode='code' AND snippet_id IS NOT NULL AND framework_id IS NULL AND acronym_id IS NULL) OR
    (mode='framework' AND snippet_id IS NULL AND framework_id IS NOT NULL AND acronym_id IS NULL) OR
    (mode='acronym' AND snippet_id IS NULL AND framework_id IS NULL AND acronym_id IS NOT NULL)
  )
);
CREATE TABLE game.daily_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  slot text NOT NULL CHECK (slot IN ('code-easy','code-medium','code-hard','acronym','framework')),
  challenge_id uuid NOT NULL REFERENCES game.challenges(id),
  UNIQUE (day,slot)
);
CREATE TABLE game.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_id uuid NOT NULL REFERENCES game.daily_challenges(id),
  actor_key text NOT NULL,
  profile_id uuid REFERENCES game.profiles(id) ON DELETE CASCADE,
  ranked boolean NOT NULL,
  practice boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'playing' CHECK (status IN ('playing','won','lost','expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  guesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  scoring_version integer NOT NULL DEFAULT 2,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (NOT ranked OR profile_id IS NOT NULL),
  CONSTRAINT game_sessions_guesses_match_attempts CHECK (
    jsonb_typeof(guesses)='array' AND jsonb_array_length(guesses)=attempts
  )
);
CREATE UNIQUE INDEX one_ranked_game ON game.game_sessions(profile_id,daily_id) WHERE ranked;
CREATE UNIQUE INDEX one_open_game ON game.game_sessions(actor_key,daily_id) WHERE status='playing';
CREATE INDEX sessions_actor_daily ON game.game_sessions(actor_key,daily_id,started_at DESC);
CREATE INDEX sessions_rank_month ON game.game_sessions(profile_id,daily_id) WHERE ranked AND status='won';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON SCHEMA game FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA game FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON SCHEMA game FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA game FROM authenticated;
  END IF;
END $$;
INSERT INTO game.schema_migrations(name) VALUES
  ('001_initial.sql'),('002_profile_avatar.sql'),('003_simplify_catalog.sql'),
  ('004_guesses_in_sessions.sql'),('005_five_attempts_and_hints.sql'),
  ('006_score_by_attempt.sql');
COMMIT;
