import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { openPostgresDatabase } from './postgres-db.js';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  kind: 'local' | 'postgres';
  transaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export async function openDatabase(
  url = '',
  ssl = false,
  dataDir = '.data/pglite',
  caCertFile = '',
  options: { serverless?: boolean; caCert?: string } = {},
): Promise<Database> {
  if (url) return openPostgresDatabase(url, ssl, caCertFile, options);
  if (dataDir !== 'memory://') await mkdir(resolve(dataDir), { recursive: true });
  const lite = new PGlite(dataDir);
  await lite.waitReady;
  return {
    kind: 'local',
    async query<T>(sql: string, params?: unknown[]) {
      return { rows: (await lite.query<T>(sql, params)).rows };
    },
    async exec(sql) {
      await lite.exec(sql);
    },
    async transaction(fn) {
      return lite.transaction((tx) =>
        fn({
          async query<T>(sql: string, params?: unknown[]) {
            return { rows: (await tx.query<T>(sql, params)).rows };
          },
        }),
      );
    },
    async close() {
      await lite.close();
    },
  };
}

export async function migrate(db: Database) {
  await db.exec(
    'CREATE SCHEMA IF NOT EXISTS game; REVOKE ALL ON SCHEMA game FROM PUBLIC; CREATE TABLE IF NOT EXISTS game.schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now());',
  );
  const directory = resolve('database/migrations');
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    const { rows } = await db.query('SELECT name FROM game.schema_migrations WHERE name = $1', [
      name,
    ]);
    if (rows.length) continue;
    // Scripts versionados, sem entrada do usuário. Um batch atômico também no PGlite.
    const sql = await readFile(resolve(directory, name), 'utf8');
    await db.exec(
      `BEGIN; ${sql}\n INSERT INTO game.schema_migrations(name) VALUES ('${name.replaceAll("'", "''")}'); COMMIT;`,
    );
  }
}
