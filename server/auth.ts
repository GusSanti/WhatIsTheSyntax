import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Request, Response } from 'express';
import type { Database } from './db.js';
import { ApiError } from './domain.js';
import type { Principal } from './game-service.js';

export type AuthOptions = {
  production: boolean;
  localAuth: boolean;
  supabaseUrl: string;
  supabaseKey: string;
  visitorCookieSecret?: string;
};
const COOKIE = 'syntax_visitor';

function googleAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !(url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function createAuth(db: Database, options: AuthOptions) {
  if (options.production && (!options.visitorCookieSecret || options.visitorCookieSecret.length < 32))
    throw new Error('VISITOR_COOKIE_SECRET deve ter pelo menos 32 caracteres em produção.');
  const secret = options.visitorCookieSecret || randomBytes(32).toString('hex');
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('hex');
  if (options.supabaseKey && !options.supabaseKey.startsWith('sb_publishable_')) {
    let role: string | undefined;
    try {
      role = JSON.parse(
        Buffer.from(options.supabaseKey.split('.')[1], 'base64url').toString('utf8'),
      ).role;
    } catch {
      /* Configuração inválida. */
    }
    if (role !== 'anon')
      throw new Error(
        'SUPABASE_PUBLISHABLE_KEY deve ser uma chave publicável ou anon. Chaves secretas não podem ser enviadas ao navegador.',
      );
  }
  const supabase =
    options.supabaseUrl && options.supabaseKey
      ? createClient(options.supabaseUrl, options.supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  const profiles = new Map<string, { id: string; expires: number }>();

  function newVisitor(res: Response, localProfileId: string | null = null) {
    const visitor = { id: randomBytes(16).toString('hex'), local_profile_id: localProfileId };
    const payload = Buffer.from(JSON.stringify({ ...visitor, expires: Date.now() + 30 * 86400_000 })).toString('base64url');
    res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
      httpOnly: true,
      secure: options.production,
      sameSite: 'lax',
      maxAge: 30 * 86400_000,
      path: '/',
    });
    return visitor;
  }

  return {
    async identify(req: Request, res: Response): Promise<Principal> {
      const authorization = req.headers.authorization;
      if (authorization) {
        if (!supabase || !authorization.startsWith('Bearer '))
          throw new ApiError(401, 'Entre novamente para continuar.');
        const accessToken = authorization.slice(7);
        const { data, error } = await supabase.auth.getClaims(accessToken);
        const claims = data?.claims;
        if (
          error ||
          !claims ||
          claims.role !== 'authenticated' ||
          typeof claims.sub !== 'string' ||
          !Array.isArray(claims.app_metadata?.providers) ||
          !claims.app_metadata.providers.includes('google')
        )
          throw new ApiError(401, 'Sua sessão expirou. Entre novamente com Google.');
        const subject = `google:${claims.sub}`;
        let profile = profiles.get(subject);
        if (!profile || profile.expires <= Date.now()) {
          const avatar = googleAvatarUrl(claims.user_metadata?.avatar_url);
          const {
            rows: [saved],
          } = await db.query<{ id: string }>(
            `INSERT INTO game.profiles(auth_subject,provider,display_name,avatar_url)
            VALUES ($1,'google',$2,$3) ON CONFLICT (auth_subject)
            DO UPDATE SET avatar_url=EXCLUDED.avatar_url RETURNING id`,
            [subject, `Dev ${claims.sub.slice(0, 6)}`, avatar],
          );
          profile = { id: saved.id, expires: Date.now() + 5 * 60_000 };
          if (profiles.size >= 1000) profiles.delete(profiles.keys().next().value!);
          profiles.set(subject, profile);
        }
        return { profileId: profile.id, actorKey: `user:${profile.id}` };
      }
      const visitor = findVisitor(req) || newVisitor(res);
      const profileId = options.localAuth && !options.production ? visitor.local_profile_id : null;
      return {
        profileId,
        actorKey: profileId ? `user:${profileId}` : `guest:${visitor.id}`,
      };
    },
    async loginLocal(res: Response) {
      if (!options.localAuth || options.production)
        throw new ApiError(404, 'Recurso não disponível.');
      const {
        rows: [profile],
      } = await db.query<{
        id: string;
      }>(`INSERT INTO game.profiles(auth_subject,provider,display_name)
        VALUES ('local:review','local','Dev explorador') ON CONFLICT (auth_subject) DO UPDATE SET auth_subject=EXCLUDED.auth_subject RETURNING id`);
      newVisitor(res, profile.id);
    },
    async logout(res: Response) {
      newVisitor(res);
    },
  };

  function findVisitor(req: Request): { id: string; local_profile_id: string | null } | undefined {
    const token = req.cookies?.[COOKIE];
    if (typeof token !== 'string') return undefined;
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra || !/^[a-f0-9]{64}$/.test(signature)) return undefined;
    const expected = Buffer.from(sign(payload), 'hex');
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return undefined;
    try {
      const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!/^[a-f0-9]{32}$/.test(value.id) || typeof value.expires !== 'number' || value.expires <= Date.now()) return undefined;
      if (value.local_profile_id !== null && (typeof value.local_profile_id !== 'string' || !/^[0-9a-f-]{36}$/.test(value.local_profile_id))) return undefined;
      return { id: value.id, local_profile_id: value.local_profile_id };
    } catch { return undefined; }
  }
}
