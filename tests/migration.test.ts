import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openDatabase, migrate } from '../server/db.js';

test('migração preserva catálogo, partidas e pontos do esquema anterior', async () => {
  const db = await openDatabase('', false, 'memory://');
  try {
    await db.exec('CREATE SCHEMA game; CREATE TABLE game.schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now());');
    await db.exec(await readFile('database/migrations/001_initial.sql', 'utf8'));
    await db.exec(await readFile('database/migrations/002_profile_avatar.sql', 'utf8'));
    await db.exec("INSERT INTO game.schema_migrations(name) VALUES ('001_initial.sql'),('002_profile_avatar.sql')");
    await db.exec(`
      INSERT INTO game.profiles(id,auth_subject,provider,display_name) VALUES
        ('00000000-0000-0000-0000-000000000001','test:1','local','Jogador');
      INSERT INTO game.languages(id,name) VALUES
        ('00000000-0000-0000-0000-000000000010','JavaScript'),
        ('00000000-0000-0000-0000-000000000011','TypeScript');
      INSERT INTO game.code_snippets(id,editorial_key,language_id,source_code) VALUES
        ('00000000-0000-0000-0000-000000000020','code-1','00000000-0000-0000-0000-000000000010','const x = 1');
      INSERT INTO game.challenges(id,editorial_key,mode,difficulty,snippet_id) VALUES
        ('00000000-0000-0000-0000-000000000030','challenge-1','code','easy','00000000-0000-0000-0000-000000000020');
      INSERT INTO game.challenges(id,editorial_key,mode,difficulty,prompt) VALUES
        ('00000000-0000-0000-0000-000000000031','challenge-2','acronym','standard','API'),
        ('00000000-0000-0000-0000-000000000032','challenge-3','framework','standard','TestJS');
      INSERT INTO game.challenge_answers(challenge_id,language_id) VALUES
        ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000011'),
        ('00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000010'),
        ('00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000011');
      INSERT INTO game.challenge_answers(challenge_id,normalized_text) VALUES
        ('00000000-0000-0000-0000-000000000031','application programming interface');
      INSERT INTO game.daily_challenges(id,day,slot,challenge_id) VALUES
        ('00000000-0000-0000-0000-000000000040','2026-09-27','code-easy','00000000-0000-0000-0000-000000000030'),
        ('00000000-0000-0000-0000-000000000041',(now() AT TIME ZONE 'America/Sao_Paulo')::date,'code-medium','00000000-0000-0000-0000-000000000030');
      INSERT INTO game.game_sessions(id,daily_id,actor_key,profile_id,ranked,status,attempts,points) VALUES
        ('00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000040','user:1','00000000-0000-0000-0000-000000000001',true,'won',1,125),
        ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000041','guest:2',null,false,'lost',3,0);
      INSERT INTO game.guesses(session_id,request_id,attempt,submitted_text,normalized_text,correct) VALUES
        ('00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000060',1,'JavaScript','language:00000000-0000-0000-0000-000000000010',true),
        ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000061',1,'C','language:c',false),
        ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000062',2,'Go','language:go',false),
        ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000063',3,'Ruby','language:ruby',false);
    `);
    await db.exec(`BEGIN;
      ${await readFile('database/migrations/003_simplify_catalog.sql', 'utf8')}
      INSERT INTO game.schema_migrations(name) VALUES ('003_simplify_catalog.sql');
      COMMIT;`);
    await db.exec(await readFile('database/supabase_manual_guesses.sql', 'utf8'));
    await db.exec(await readFile('database/supabase_manual_five_attempts_and_hints.sql', 'utf8'));
    await migrate(db);
    const { rows: [profile] } = await db.query<{ points: number }>('SELECT points FROM game.profiles');
    assert.equal(profile.points, 125);
    const { rows: [language] } = await db.query<{ difficulty: string }>("SELECT difficulty FROM game.languages WHERE name='JavaScript'");
    assert.equal(language.difficulty, 'easy');
    const { rows: [snippet] } = await db.query<{ accepted_language_names: string[] }>('SELECT accepted_language_names FROM game.code_snippets');
    assert.deepEqual(snippet.accepted_language_names, ['TypeScript']);
    const { rows: [framework] } = await db.query<{ accepted_language_names: string[] }>('SELECT accepted_language_names FROM game.frameworks');
    assert.deepEqual(framework.accepted_language_names, ['TypeScript']);
    assert.equal((await db.query('SELECT * FROM game.acronyms')).rows.length, 1);
    const { rows: [session] } = await db.query<{ guesses: { text: string; correct: boolean }[] }>("SELECT guesses FROM game.game_sessions WHERE actor_key='user:1'");
    assert.deepEqual(session.guesses.map((guess) => [guess.text, guess.correct]), [['JavaScript', true]]);
    const { rows: [reopened] } = await db.query<{ status: string; attempts: number; finished_at: Date | null }>("SELECT status,attempts,finished_at FROM game.game_sessions WHERE actor_key='guest:2'");
    assert.deepEqual([reopened.status, reopened.attempts, reopened.finished_at], ['playing', 3, null]);
    const { rows: [hint] } = await db.query<{ description: string }>("SELECT h.description FROM game.language_hints h JOIN game.languages l ON l.id=h.language_id WHERE l.name='JavaScript'");
    assert.match(hint.description, /páginas web/);
    const { rows } = await db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables
      WHERE table_schema='game' AND table_name IN ('visitor_sessions','language_aliases','challenge_answers','score_events','guesses')`);
    assert.equal(rows.length, 0);
  } finally {
    await db.close();
  }
});

test('SQL manual instala o esquema final em banco novo', async () => {
  const db = await openDatabase('', false, 'memory://');
  try {
    await db.exec(await readFile('database/supabase_manual_setup.sql', 'utf8'));
    await migrate(db);
    const { rows } = await db.query<{ name: string }>(
      'SELECT name FROM game.schema_migrations ORDER BY name',
    );
    assert.deepEqual(rows.map((row) => row.name), [
      '001_initial.sql', '002_profile_avatar.sql', '003_simplify_catalog.sql',
      '004_guesses_in_sessions.sql', '005_five_attempts_and_hints.sql',
    ]);
    const { rows: [schema] } = await db.query<{ old_table: boolean; guesses_column: boolean; hints_table: boolean }>(`
      SELECT EXISTS(SELECT 1 FROM information_schema.tables
        WHERE table_schema='game' AND table_name='guesses') AS old_table,
        EXISTS(SELECT 1 FROM information_schema.tables
        WHERE table_schema='game' AND table_name='language_hints') AS hints_table,
        EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema='game' AND table_name='game_sessions' AND column_name='guesses') AS guesses_column`);
    assert.equal(schema.old_table, false);
    assert.equal(schema.guesses_column, true);
    assert.equal(schema.hints_table, true);
    const { rows: [attemptsConstraint] } = await db.query<{ definition: string }>("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='game_sessions_attempts_check'");
    assert.match(attemptsConstraint.definition, /5/);
  } finally {
    await db.close();
  }
});
