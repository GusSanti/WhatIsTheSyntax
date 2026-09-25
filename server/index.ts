import { config } from './config.js';
import { openDatabase, migrate } from './db.js';
import { seedDemo } from './seed.js';
import { createApp } from './app.js';
import { gameDate } from './domain.js';

if (config.production && !config.databaseUrl)
  throw new Error(
    'DATABASE_URL é obrigatória em produção. O banco embutido é exclusivo do desenvolvimento.',
  );
if (config.production && (!config.supabaseUrl || !config.supabaseKey))
  throw new Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY em produção.');
const db = await openDatabase(config.databaseUrl, config.databaseSsl, config.dataDir);
if (db.kind === 'local') {
  await migrate(db);
  await seedDemo(db);
} else await db.query('SELECT name FROM game.schema_migrations LIMIT 1');

let seededDay = gameDate();
let seeding: Promise<void> | null = null;
const app = createApp(db, {
  ...config,
  serveStatic: config.production,
  prepareDay:
    db.kind === 'local'
      ? async (now) => {
          if (gameDate(now) === seededDay) return;
          seeding ??= seedDemo(db, now)
            .then(() => {
              seededDay = gameDate(now);
            })
            .finally(() => {
              seeding = null;
            });
          await seeding;
        }
      : undefined,
});
const server = app.listen(config.port, config.production ? '0.0.0.0' : '127.0.0.1', () =>
  console.log(
    `API pronta em http://localhost:${config.port} (${db.kind === 'local' ? 'banco local persistente' : 'PostgreSQL'})`,
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void db.close().then(() => process.exit(0));
    });
  });
}
