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
      const token = req.cookies?.[COOKIE];
      let visitor =
        typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
          ? (
              await db.query<{ id: string; local_profile_id: string | null }>(
                'SELECT id,local_profile_id FROM game.visitor_sessions WHERE token_hash=$1 AND expires_at > now()',
                [hash(token)],
              )
            ).rows[0]
          : undefined;
      if (!visitor) visitor = await newVisitor(res);
      let profileId = options.localAuth && !options.production ? visitor.local_profile_id : null;
      if (req.headers.authorization) {
        if (!supabase || !req.headers.authorization.startsWith('Bearer '))
          throw new ApiError(401, 'Entre novamente para continuar.');
        const accessToken = req.headers.authorization.slice(7);
        const { data, error } = await supabase.auth.getUser(accessToken);
        if (error || !data.user || !data.user.app_metadata.providers?.includes('google'))
          throw new ApiError(401, 'Sua sessão expirou. Entre novamente com Google.');
        // Nome público pseudônimo: não expõe nome completo ou e-mail do Google.
        const subject = `google:${data.user.id}`;
        const name = `Dev ${data.user.id.slice(0, 6)}`;
        const {
          rows: [profile],
        } = await db.query<{ id: string }>(
          `INSERT INTO game.profiles(auth_subject,provider,display_name)
          VALUES ($1,'google',$2) ON CONFLICT (auth_subject) DO UPDATE SET auth_subject=EXCLUDED.auth_subject RETURNING id`,
          [subject, name],
        );
        profileId = profile.id;
      }
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
}
