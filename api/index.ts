import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../server/config.js';
import { openPostgresDatabase } from '../server/postgres-db.js';
import { createApp } from '../server/app.js';

type App = ReturnType<typeof createApp>;
let appPromise: Promise<App> | undefined;

export function apiRequestPath(requestUrl: string): string | null {
  const url = new URL(requestUrl, 'http://vercel.internal');
  const route =
    url.searchParams.get('route') ||
    (url.pathname.startsWith('/api/') ? url.pathname.slice('/api/'.length) : '');
  if (!/^[a-z0-9/-]+$/i.test(route) || route === 'index') return null;
  url.searchParams.delete('route');
  return `/api/${route}${url.search}`;
}

async function initialize(): Promise<App> {
  if (!config.databaseUrl) throw new Error('DATABASE_URL é obrigatória na Vercel.');
  if (!process.env.APP_ORIGIN || !config.origin.startsWith('https://'))
    throw new Error('APP_ORIGIN deve ser a origem HTTPS pública da implantação.');
  if (!config.supabaseUrl || !config.supabaseKey)
    throw new Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.');
  if (!config.databaseSsl) throw new Error('DATABASE_SSL=true é obrigatório na Vercel.');

  const db = await openPostgresDatabase(config.databaseUrl, config.databaseSsl, '', {
    serverless: true,
    caCert: config.databaseCaCert,
  });
  try {
    const { rows } = await db.query(
      "SELECT name FROM game.schema_migrations WHERE name='006_score_by_attempt.sql'",
    );
    if (!rows.length) throw new Error('Aplique as migrações do banco até a versão 006.');
    return createApp(db, {
      ...config,
      production: true,
      localAuth: false,
      serveStatic: false,
      trustProxyHops: config.trustProxyHops || 1,
    });
  } catch (error) {
    await db.close();
    throw error;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const path = apiRequestPath(req.url || '/');
  if (!path) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Rota não encontrada.' }));
    return;
  }
  req.url = path;

  try {
    appPromise ??= initialize().catch((error) => {
      appPromise = undefined;
      throw error;
    });
    const app = await appPromise;
    await new Promise<void>((resolve) => {
      res.once('finish', resolve);
      res.once('close', resolve);
      app(req, res);
    });
  } catch (error) {
    console.error('Falha ao iniciar a API:', error instanceof Error ? error.message : error);
    if (res.headersSent) return;
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ error: 'A API está indisponível. Confira a configuração do servidor.' }),
    );
  }
}
