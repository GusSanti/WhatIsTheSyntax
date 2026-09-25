import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PublicConfig } from '../../shared/contracts';

let accessToken: string | null = null;
let authClient: SupabaseClient | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAuth(config?: PublicConfig) {
  if (!authClient && config?.supabase) {
    authClient = createClient(config.supabase.url, config.supabase.key, {
      auth: { flowType: 'pkce', detectSessionInUrl: true },
    });
  }
  return authClient;
}
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new RequestError(
      'A API não respondeu. Confira se o servidor está em execução.',
      response.status,
    );
  }
  if (!response.ok)
    throw new RequestError(data.error || 'Não foi possível concluir a ação.', response.status);
  return data;
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível conectar. Tente novamente.';
}
