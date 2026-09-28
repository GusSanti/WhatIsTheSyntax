import { config } from '../config.js';
import { openDatabase, migrate } from '../db.js';
import { seedDemo } from '../seed.js';

const db = await openDatabase(
  config.databaseUrl,
  config.databaseSsl,
  config.dataDir,
  config.databaseCaCertFile,
  { caCert: config.databaseCaCert },
);
try {
  await migrate(db);
  if (process.argv[2] === 'seed') {
    await seedDemo(db);
    console.log('Catálogo demonstrativo inserido. Substitua-o antes de abrir um ranking público.');
  } else console.log('Migrações aplicadas.');
} finally {
  await db.close();
}
