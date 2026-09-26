import { createHash, randomBytes } from 'node:crypto';
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
};
const COOKIE = 'syntax_visitor';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

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

  async function newVisitor(res: Response, localProfileId: string | null = null) {
    const token = randomBytes(32).toString('hex');
    const {
      rows: [visitor],
    } = await db.query<{ id: string; local_profile_id: string | null }>(
      "INSERT INTO game.visitor_sessions(token_hash,local_profile_id,expires_at) VALUES ($1,$2,now()+interval '30 days') RETURNING id,local_profile_id",
      [hash(token), localProfileId],
    );
    res.cookie(COOKIE, token, {
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
        // Apenas o logout precisa da sessão anônima; jogos autenticados usam o perfil.
        if (req.path !== '/auth/logout' && req.path !== '/auth/local')
          return { visitorId: '', profileId: profile.id, actorKey: `user:${profile.id}` };
        const visitor = await findVisitor(req);
        return {
          visitorId: visitor?.id || (await newVisitor(res)).id,
          profileId: profile.id,
          actorKey: `user:${profile.id}`,
        };
      }
      const visitor = (await findVisitor(req)) || (await newVisitor(res));
      const profileId = options.localAuth && !options.production ? visitor.local_profile_id : null;
      return {
        visitorId: visitor.id,
        profileId,
        actorKey: profileId ? `user:${profileId}` : `guest:${visitor.id}`,
      };
    },
    async loginLocal(res: Response, visitorId: string) {
      if (!options.localAuth || options.production)
        throw new ApiError(404, 'Recurso não disponível.');
      const {
        rows: [profile],
      } = await db.query<{
        id: string;
      }>(`INSERT INTO game.profiles(auth_subject,provider,display_name)
        VALUES ('local:review','local','Dev explorador') ON CONFLICT (auth_subject) DO UPDATE SET auth_subject=EXCLUDED.auth_subject RETURNING id`);
      await newVisitor(res, profile.id);
      await db.query('DELETE FROM game.visitor_sessions WHERE id=$1', [visitorId]);
    },
    async logout(res: Response, visitorId: string) {
      await newVisitor(res);
      await db.query('DELETE FROM game.visitor_sessions WHERE id=$1', [visitorId]);
    },
  };

  async function findVisitor(req: Request) {
    const token = req.cookies?.[COOKIE];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    return (
      await db.query<{ id: string; local_profile_id: string | null }>(
        'SELECT id,local_profile_id FROM game.visitor_sessions WHERE token_hash=$1 AND expires_at > now()',
        [hash(token)],
      )
    ).rows[0];
  }
}
