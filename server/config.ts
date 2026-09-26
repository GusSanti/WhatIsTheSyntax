import 'dotenv/config';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

// Fora do OneDrive no Windows: a sincronização marca diretórios PostgreSQL como
// somente leitura, o que impede a reabertura do filesystem do PGlite.
const localRoot =
  process.platform === 'win32'
    ? resolve(
        process.env.LOCALAPPDATA || resolve(homedir(), 'AppData/Local'),
        'WhatIsTheSyntax',
        createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12),
        'pglite',
      )
    : resolve('.data/pglite');

export const config = {
  production: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3001),
  origin: process.env.APP_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  databaseCaCertFile: process.env.DATABASE_CA_CERT_FILE || '',
  dataDir: process.env.LOCAL_DATABASE_DIR || localRoot,
  localAuth: process.env.NODE_ENV !== 'production' && process.env.LOCAL_DEMO_AUTH !== 'false',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 0),
};
