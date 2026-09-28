import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import type { Database } from './db.js';

export function connectionStringForTls(url: string, ssl: boolean): string {
  if (!ssl) return url;
  const parsed = new URL(url);
  // node-postgres substitutes its ssl object when any of these URI options exist.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
    parsed.searchParams.delete(key);
  return parsed.toString();
}

export async function openPostgresDatabase(
  url: string,
  ssl: boolean,
  caCertFile = '',
  options: { serverless?: boolean; caCert?: string } = {},
): Promise<Database> {
  const ca =
    options.caCert?.replace(/\\n/g, '\n') ||
    (caCertFile ? readFileSync(resolve(caCertFile), 'utf8') : undefined);
  const pool = new pg.Pool({
    connectionString: connectionStringForTls(url, ssl),
    max: options.serverless ? 1 : 5,
    min: options.serverless ? 0 : 2,
    idleTimeoutMillis: options.serverless ? 10_000 : 5 * 60_000,
    connectionTimeoutMillis: 10_000,
    ssl: ssl ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : undefined,
  });
  if (!options.serverless) {
    // No servidor persistente, antecipa conexões; funções criam uma só quando necessário.
    const ready = await Promise.allSettled([pool.connect(), pool.connect(), pool.connect()]);
    for (const result of ready) if (result.status === 'fulfilled') result.value.release();
    const failed = ready.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') {
      await pool.end();
      throw failed.reason;
    }
  }
  return {
    kind: 'postgres',
    async query<T>(sql: string, params?: unknown[]) {
      return { rows: (await pool.query(sql, params)).rows as T[] };
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          async query<T>(sql: string, params?: unknown[]) {
            return { rows: (await client.query(sql, params)).rows as T[] };
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
