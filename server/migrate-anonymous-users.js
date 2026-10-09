import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, '.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for the anonymous-account migration');
}

const tables = ['FreeUserWhitelist', 'UserFeedback', 'UserRecommendationRun', 'UserSession', 'User'];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const backup = { createdAt: new Date().toISOString(), tables: {} };
  for (const table of tables) {
    const exists = await client.query('SELECT to_regclass($1) AS name', [`public."${table}"`]);
    if (exists.rows[0].name) backup.tables[table] = (await client.query(`SELECT * FROM "${table}"`)).rows;
  }

  const backupDir = path.join(serverDir, 'backups');
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `anonymous-account-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { mode: 0o600 });

  await client.query('BEGIN');
  for (const table of tables) {
    const exists = await client.query('SELECT to_regclass($1) AS name', [`public."${table}"`]);
    if (exists.rows[0].name) await client.query(`DELETE FROM "${table}"`);
  }
  await client.query('COMMIT');
  console.log(`Anonymous-account backup written to ${backupPath}; old account data deleted.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
