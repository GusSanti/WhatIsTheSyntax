import express from 'express';
import type { ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { resolve } from 'node:path';
import type { Database } from './db.js';
import { createAuth, type AuthOptions } from './auth.js';
import { GameService, type Principal } from './game-service.js';
import { ApiError, gameDate, nextReset } from './domain.js';

type Options = AuthOptions & {
  origin: string;
  trustProxyHops?: number;
  serveStatic?: boolean;
  clock?: () => Date;
  rateLimits?: boolean;
  prepareDay?: (now: Date) => Promise<void>;
};
const startSchema = z
  .object({ dailyId: z.string().uuid(), restart: z.boolean().optional() })
  .strict();
const guessSchema = z
  .object({ answer: z.string().trim().min(1).max(160), requestId: z.string().uuid() })
  .strict();

export function createApp(db: Database, options: Options) {
  const app = express();
  const service = new GameService(db, options.clock);
  const auth = createAuth(db, options);
  app.disable('x-powered-by');
  if (options.trustProxyHops) app.set('trust proxy', options.trustProxyHops);
  app.use(
    helmet({
      contentSecurityPolicy: options.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              fontSrc: ["'self'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'", ...(options.supabaseUrl ? [options.supabaseUrl] : [])],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '4kb' }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  if (options.rateLimits !== false) {
    app.use(
      '/api',
      rateLimit({
        windowMs: 60_000,
        limit: 180,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Muitas requisições. Aguarde um minuto.' },
      }),
    );
    app.use(
      '/api/sessions',
      rateLimit({
        windowMs: 60_000,
        limit: 40,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Faça uma pausa antes de tentar novamente.' },
      }),
    );
    app.use(
      '/api/auth',
      rateLimit({
        windowMs: 60_000,
        limit: 15,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Aguarde um minuto antes de entrar novamente.' },
      }),
    );
  }
  app.use('/api', (req, _res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const allowed = options.production
        ? [options.origin]
        : [options.origin, 'http://127.0.0.1:5173', 'http://localhost:5173'];
      if (req.headers.origin && !allowed.includes(req.headers.origin))
        throw new ApiError(403, 'Origem não permitida.');
      if (!req.is('application/json')) throw new ApiError(415, 'Envie uma requisição JSON.');
    }
    next();
  });
  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  app.use('/api', async (req, res, next) => {
    res.locals.principal = await auth.identify(req, res);
    next();
  });
  const principal = (res: express.Response) => res.locals.principal as Principal;

  app.get('/api/bootstrap', async (_req, res) => {
    const who = principal(res);
    const now = service.now();
    await options.prepareDay?.(now);
    const [profile, challenges, languages] = await Promise.all([
      service.profile(who.profileId),
      service.listDaily(who, gameDate(now)),
      db.query<{ name: string }>('SELECT name FROM game.languages ORDER BY name'),
    ]);
    res.json({
      date: gameDate(now),
      serverTime: now.toISOString(),
      nextReset: nextReset(now),
      profile,
      challenges,
      languages: languages.rows.map((row) => row.name),
      config: {
        localAuth: options.localAuth && !options.production,
        storage: db.kind,
        supabase:
          options.supabaseUrl && options.supabaseKey
            ? { url: options.supabaseUrl, key: options.supabaseKey }
            : null,
      },
    });
  });
  app.post('/api/auth/local', async (_req, res) => {
    await auth.loginLocal(res, principal(res).visitorId);
    res.json({ ok: true });
  });
  app.post('/api/auth/logout', async (_req, res) => {
    await auth.logout(res, principal(res).visitorId);
    res.json({ ok: true });
  });
  app.post('/api/sessions', async (req, res) => {
    const body = startSchema.parse(req.body);
    res.json(await service.start(principal(res), body.dailyId, body.restart));
  });
  app.post('/api/sessions/:id/guesses', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = guessSchema.parse(req.body);
    res.json(await service.guess(principal(res), id, body.answer, body.requestId));
  });
  app.get('/api/archive', async (_req, res) => {
    res.json({ days: await service.archive(principal(res)) });
  });
  app.get('/api/ranking', async (req, res) => {
    const period = z.enum(['month', 'all']).default('month').parse(req.query.period);
    res.json(await service.ranking(principal(res).profileId, period));
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  if (options.serveStatic) {
    app.use(express.static(resolve('dist/web'), { index: false }));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/web/index.html')));
  }
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({ error: 'Confira os dados enviados. A resposta deve ter de 1 a 160 caracteres.' });
      return;
    }
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      res.status(400).json({ error: 'Requisição inválida.' });
      return;
    }
    console.error(
      'Falha interna da API:',
      error instanceof Error ? error.message : 'erro desconhecido',
    );
    res.status(500).json({ error: 'Não foi possível concluir a ação. Tente novamente.' });
  };
  app.use(errorHandler);
  return app;
}
