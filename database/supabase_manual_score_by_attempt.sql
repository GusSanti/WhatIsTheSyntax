BEGIN;

-- Aplique uma vez a bancos remotos que já estão na versão 005.
UPDATE game.game_sessions g
SET points = ROUND(
  (CASE l.difficulty WHEN 'medium' THEN 200 WHEN 'hard' THEN 300 ELSE 100 END) *
  (CASE g.attempts WHEN 1 THEN 1.0 WHEN 2 THEN 0.7 WHEN 3 THEN 0.4
    WHEN 4 THEN 0.2 WHEN 5 THEN 0.1 ELSE 0 END)
)::integer
FROM game.daily_challenges d
JOIN game.challenges c ON c.id=d.challenge_id
LEFT JOIN game.code_snippets s ON s.id=c.snippet_id
LEFT JOIN game.languages l ON l.id=s.language_id
WHERE g.daily_id=d.id AND g.ranked AND g.status='won';

UPDATE game.profiles p
SET points = COALESCE((SELECT SUM(g.points) FROM game.game_sessions g
  WHERE g.profile_id=p.id AND g.ranked AND g.status='won'), 0);

UPDATE game.game_sessions SET scoring_version=2;
ALTER TABLE game.game_sessions ALTER COLUMN scoring_version SET DEFAULT 2;
INSERT INTO game.schema_migrations(name) VALUES ('006_score_by_attempt.sql');

COMMIT;
