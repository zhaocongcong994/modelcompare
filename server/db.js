import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import prismaClientModule from '@prisma/client';

// Prisma's package is published as CommonJS in some production installations.
// Default-importing it keeps the ESM server compatible with both module shapes.
const { PrismaClient } = prismaClientModule;

// Keep configuration colocated with the API, regardless of the shell cwd used
// to start `node server/api.js`.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

let client;
let pool;
let unavailable;

export async function getDb() {
  if (unavailable) return null;
  if (!client) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
  }
  try {
    await client.$queryRaw`SELECT 1`;
    return client;
  } catch (error) {
    unavailable = error;
    console.warn(`Database unavailable; using live catalog fallback: ${error.message}`);
    return null;
  }
}

export async function disconnectDb() {
  await client?.$disconnect();
  await pool?.end();
  client = undefined;
  pool = undefined;
}
