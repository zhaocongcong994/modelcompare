import dotenv from 'dotenv';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, '.env') });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const result = await client.query(`
    UPDATE "UserRecommendationRun"
    SET "recommendationId" = 'legacy_' || "id"
    WHERE "recommendationId" IS NULL
  `);
  console.log(JSON.stringify({ updatedRows: result.rowCount }));
} finally {
  await client.end();
}
