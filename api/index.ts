import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../server/config.js';
import { openPostgresDatabase } from '../server/postgres-db.js';
import { createApp } from '../server/app.js';

type App = ReturnType<typeof createApp>;
let appPromise: Promise<App> | undefined;

type StartupCode =
  | 'CONFIG_DATABASE_URL'
  | 'CONFIG_SUPABASE'
  | 'CONFIG_DATABASE_SSL'
  | 'CONFIG_VISITOR_SECRET'
  | 'DATABASE_NETWORK'
  | 'DATABASE_AUTH'
  | 'DATABASE_TLS'
  | 'DATABASE_SCHEMA'
  | 'DATABASE_MIGRATION'
  | 'DATABASE_UNAVAILABLE';

class StartupError extends Error {
  constructor(
    public code: StartupCode,
    message: string,
  ) {
    super(message);
  }
}

export function startupCode(error: unknown): StartupCode {
  if (error instanceof StartupError) return error.code;
  const code = error instanceof Error && 'code' in error ? String(error.code) : '';
  if (
    [
      'ENETUNREACH',
      'EHOSTUNREACH',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ECONNRESET',
    ].includes(code)
  )
    return 'DATABASE_NETWORK';
  if (code === '28P01' || code === '28000') return 'DATABASE_AUTH';
  if (code.includes('CERT') || code.includes('VERIFY') || code.includes('TLS'))
    return 'DATABASE_TLS';
  if (code === '42P01' || code === '3F000') return 'DATABASE_SCHEMA';
  return 'DATABASE_UNAVAILABLE';
}

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
  if (!config.databaseUrl)
    throw new StartupError('CONFIG_DATABASE_URL', 'DATABASE_URL é obrigatória na Vercel.');
  if (!config.supabaseUrl || !config.supabaseKey)
    throw new StartupError('CONFIG_SUPABASE', 'Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.');
  if (!config.databaseSsl)
    throw new StartupError('CONFIG_DATABASE_SSL', 'DATABASE_SSL=true é obrigatório na Vercel.');
  if (config.visitorCookieSecret.length < 32)
    throw new StartupError(
      'CONFIG_VISITOR_SECRET',
      'VISITOR_COOKIE_SECRET deve ter 32 caracteres.',
    );

  const db = await openPostgresDatabase(config.databaseUrl, config.databaseSsl, '', {
    serverless: true,
    caCert: config.databaseCaCert,
  });
  try {
    const { rows } = await db.query(
      "SELECT name FROM game.schema_migrations WHERE name='006_score_by_attempt.sql'",
    );
    if (!rows.length)
      throw new StartupError('DATABASE_MIGRATION', 'Aplique as migrações até a versão 006.');
    return createApp(db, {
      ...config,
      production: true,
      localAuth: false,
      serveStatic: false,
      sameOriginOnVercel: true,
      trustProxyHops: config.trustProxyHops || 1,
    });
  } catch (error) {
    await db.close().catch(() => undefined);
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
    const code = startupCode(error);
    console.error('Falha ao iniciar a API:', code, error instanceof Error ? error.message : error);
    if (res.headersSent) return;
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        error: 'A API está indisponível. Confira a configuração do servidor.',
        code,
      }),
    );
  }
}
