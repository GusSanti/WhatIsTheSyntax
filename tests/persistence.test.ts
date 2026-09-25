import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { openDatabase, migrate } from '../server/db.js';

test('banco local mantém cadastro após fechar e reabrir no Windows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'syntax-persistence-'));
  const dbPath = join(directory, 'database');
  try {
    const first = await openDatabase('', false, dbPath);
    await migrate(first);
    await first.query(
      "INSERT INTO game.profiles(auth_subject,provider,display_name) VALUES ('test:persistence','local','Persistente')",
    );
    await first.close();
    const reopened = await openDatabase('', false, dbPath);
    const {
      rows: [profile],
    } = await reopened.query<{ display_name: string }>(
      "SELECT display_name FROM game.profiles WHERE auth_subject='test:persistence'",
    );
    assert.equal(profile.display_name, 'Persistente');
    await reopened.close();
  } finally {
    const target = resolve(directory);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith('syntax-persistence-')
    )
      throw new Error('Diretório temporário inesperado');
    await rm(target, { recursive: true, force: true });
  }
});
