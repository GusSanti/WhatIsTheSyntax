-- Banco que JA aplicou 003_simplify_catalog.sql: execute uma unica vez apos backup.
BEGIN;
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

