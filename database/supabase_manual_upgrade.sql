-- Banco antigo sem a migracao 003: execute uma unica vez apos backup.
BEGIN;
-- Preserva partidas, perfis e pontuação existentes. Aplicar uma vez, em transação.
ALTER TABLE game.languages ADD COLUMN difficulty text;
UPDATE game.languages l SET difficulty = COALESCE((
  SELECT c.difficulty FROM game.code_snippets s
  JOIN game.challenges c ON c.snippet_id=s.id
  WHERE s.language_id=l.id AND c.mode='code'
  GROUP BY c.difficulty ORDER BY count(*) DESC, c.difficulty LIMIT 1
), 'medium');
ALTER TABLE game.languages ALTER COLUMN difficulty SET NOT NULL;
ALTER TABLE game.languages ADD CONSTRAINT languages_difficulty_check CHECK (difficulty IN ('easy','medium','hard'));

ALTER TABLE game.profiles ADD COLUMN points integer NOT NULL DEFAULT 0 CHECK (points >= 0);
UPDATE game.profiles p SET points = COALESCE((SELECT SUM(g.points) FROM game.game_sessions g
  WHERE g.profile_id=p.id AND g.ranked AND g.status='won'),0);

ALTER TABLE game.code_snippets ADD COLUMN accepted_language_names text[] NOT NULL DEFAULT '{}';
UPDATE game.code_snippets s SET accepted_language_names = COALESCE((
  SELECT array_agg(DISTINCT l.name) FROM game.challenges c
  JOIN game.challenge_answers a ON a.challenge_id=c.id
  JOIN game.languages l ON l.id=a.language_id
  WHERE c.snippet_id=s.id AND l.id<>s.language_id
), '{}');
ALTER TABLE game.code_snippets DROP COLUMN source_note;

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

ALTER TABLE game.challenges ADD COLUMN framework_id uuid REFERENCES game.frameworks(id);
ALTER TABLE game.challenges ADD COLUMN acronym_id uuid REFERENCES game.acronyms(id);

-- Frameworks podem aceitar várias linguagens (ex.: Spring Boot: Java e Kotlin).
-- Siglas continuam com uma definição principal.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM game.challenges c WHERE c.mode IN ('acronym','framework')
    AND ((c.mode='acronym' AND (SELECT count(*) FROM game.challenge_answers a WHERE a.challenge_id=c.id) <> 1)
      OR (c.mode='framework' AND NOT EXISTS (
        SELECT 1 FROM game.challenge_answers a WHERE a.challenge_id=c.id AND a.language_id IS NOT NULL)))
  ) THEN
    RAISE EXCEPTION 'Há siglas sem definição única ou frameworks sem linguagem; revise challenge_answers antes de migrar';
  END IF;
END $$;

INSERT INTO game.frameworks(name,language_id,accepted_language_names)
SELECT prompt, (array_agg(language_id ORDER BY language_name))[1],
  COALESCE((array_agg(language_name ORDER BY language_name))[2:999], '{}')
FROM (
  SELECT DISTINCT c.prompt, a.language_id, l.name AS language_name
  FROM game.challenges c
  JOIN game.challenge_answers a ON a.challenge_id=c.id
  JOIN game.languages l ON l.id=a.language_id
  WHERE c.mode='framework'
) accepted GROUP BY prompt;
INSERT INTO game.acronyms(acronym,definition)
SELECT DISTINCT c.prompt,upper(a.normalized_text) FROM game.challenges c
JOIN game.challenge_answers a ON a.challenge_id=c.id WHERE c.mode='acronym';
UPDATE game.challenges c SET framework_id=f.id FROM game.frameworks f
  WHERE c.mode='framework' AND c.prompt=f.name;
UPDATE game.challenges c SET acronym_id=a.id FROM game.acronyms a
  WHERE c.mode='acronym' AND c.prompt=a.acronym;

ALTER TABLE game.challenges DROP CONSTRAINT challenges_check;
ALTER TABLE game.challenges DROP COLUMN difficulty;
ALTER TABLE game.challenges DROP COLUMN prompt;
ALTER TABLE game.challenges ADD CONSTRAINT challenges_target_check CHECK (
  (mode='code' AND snippet_id IS NOT NULL AND framework_id IS NULL AND acronym_id IS NULL) OR
  (mode='framework' AND snippet_id IS NULL AND framework_id IS NOT NULL AND acronym_id IS NULL) OR
  (mode='acronym' AND snippet_id IS NULL AND framework_id IS NULL AND acronym_id IS NOT NULL)
);

DROP TABLE game.language_aliases;
DROP TABLE game.challenge_answers;
DROP TABLE game.score_events;
DROP TABLE game.visitor_sessions;
CREATE INDEX sessions_rank_month ON game.game_sessions(profile_id, daily_id)
  WHERE ranked AND status='won';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON game.frameworks, game.acronyms FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON game.frameworks, game.acronyms FROM authenticated;
  END IF;
END $$;

INSERT INTO game.schema_migrations(name) VALUES ('003_simplify_catalog.sql');
-- Mantém até três tentativas dentro da própria partida.
ALTER TABLE game.game_sessions
  ADD COLUMN guesses jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE game.game_sessions g
SET guesses = COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'requestId', q.request_id::text,
    'text', q.submitted_text,
    'normalized', q.normalized_text,
    'correct', q.correct
  ) ORDER BY q.attempt)
  FROM game.guesses q WHERE q.session_id=g.id
), '[]'::jsonb);

ALTER TABLE game.game_sessions
  ADD CONSTRAINT game_sessions_guesses_match_attempts CHECK (
    jsonb_typeof(guesses)='array' AND jsonb_array_length(guesses)=attempts
  );

DROP TABLE game.guesses;

INSERT INTO game.schema_migrations(name) VALUES ('004_guesses_in_sessions.sql');
COMMIT;

