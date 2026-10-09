import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Keep Prisma CLI commands aligned with the API process: both read the
// server-local environment file even when invoked from another shell.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrate: {
    async adapter() {
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      return new PrismaPg(pool);
    },
  },
});
