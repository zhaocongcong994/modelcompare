import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, '.env') });

const apiBase = process.env.ISOLATION_TEST_API_BASE || 'http://127.0.0.1:3458';
const userAInvite = process.env.ISOLATION_TEST_USER_A || 'isolation-test-user-a';
const userBInvite = process.env.ISOLATION_TEST_USER_B || 'isolation-test-user-b';
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const makeId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

async function request(pathname, options = {}) {
  const response = await fetch(`${apiBase}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login(inviteCode) {
  const { response, body } = await request('/auth/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode }),
  });
  if (response.status !== 201 || body.data?.role !== 'user') throw new Error('Temporary test-user login failed');
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Temporary test-user session cookie missing');
  return cookie;
}

function assertStatus(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected HTTP ${expected}, got ${actual}`);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const hashes = [hash(userAInvite), hash(userBInvite)];
let promptId;
let connected = false;

try {
  await db.connect();
  connected = true;
  // The codes are reserved only for this test. Removing them first makes the
  // result repeatable and cascades any incomplete data from a previous run.
  await db.query('DELETE FROM "User" WHERE "inviteCodeHash" = ANY($1)', [hashes]);

  const cookieA = await login(userAInvite);
  const cookieB = await login(userBInvite);
  const users = await db.query('SELECT "id", "inviteCodeHash" FROM "User" WHERE "inviteCodeHash" = ANY($1)', [hashes]);
  const userIdByHash = new Map(users.rows.map((row) => [row.inviteCodeHash, row.id]));
  const userAId = userIdByHash.get(hashes[0]);
  if (!userAId || userIdByHash.size !== 2) throw new Error('Temporary test users were not persisted');

  const recommendationId = makeId('rec_isolation');
  const recommendationRowId = makeId('recommendation_run');
  const evaluationId = makeId('evaluation_run');
  promptId = makeId('evaluation_prompt');
  await db.query(
    'INSERT INTO "UserRecommendationRun" ("id", "recommendationId", "userId", "payload") VALUES ($1, $2, $3, $4::jsonb)',
    [recommendationRowId, recommendationId, userAId, JSON.stringify({ recommendationId, generatedAt: new Date().toISOString(), items: [] })]
  );
  await db.query(
    'INSERT INTO "EvaluationPrompt" ("id", "type", "title", "content", "sortOrder", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
    [promptId, 'text', '隔离测试提示词', '这是自动化数据隔离测试。', 0]
  );
  await db.query(
    'INSERT INTO "EvaluationRun" ("id", "userId", "type", "promptId", "promptText", "modelAId", "modelBId") VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [evaluationId, userAId, 'text', promptId, '这是自动化数据隔离测试。', 'test-model-a', 'test-model-b']
  );

  const aRecommendation = await request(`/recommendations/${recommendationId}`, { headers: { Cookie: cookieA } });
  assertStatus(aRecommendation.response.status, 200, 'User A reads its recommendation');
  const bRecommendation = await request(`/recommendations/${recommendationId}`, { headers: { Cookie: cookieB } });
  assertStatus(bRecommendation.response.status, 404, 'User B is blocked from User A recommendation');
  const bFeedback = await request(`/recommendations/${recommendationId}/feedback`, {
    method: 'POST', headers: { Cookie: cookieB, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'viewed', helpful: true }),
  });
  assertStatus(bFeedback.response.status, 404, 'User B is blocked from User A recommendation feedback');
  const aFeedback = await request(`/recommendations/${recommendationId}/feedback`, {
    method: 'POST', headers: { Cookie: cookieA, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'viewed', helpful: true }),
  });
  assertStatus(aFeedback.response.status, 201, 'User A submits own recommendation feedback');
  const aHistory = await request('/evaluations/history', { headers: { Cookie: cookieA } });
  assertStatus(aHistory.response.status, 200, 'User A evaluation history');
  if (!aHistory.body.data?.runs?.some((run) => run.id === evaluationId)) throw new Error('User A cannot find its own evaluation history');
  const bHistory = await request('/evaluations/history', { headers: { Cookie: cookieB } });
  assertStatus(bHistory.response.status, 200, 'User B evaluation history');
  if (bHistory.body.data?.runs?.some((run) => run.id === evaluationId)) throw new Error('User B can see User A evaluation history');

  console.log(JSON.stringify({ ok: true, checks: 6 }));
} finally {
  if (connected) {
    await db.query('DELETE FROM "User" WHERE "inviteCodeHash" = ANY($1)', [hashes]).catch(() => undefined);
    if (promptId) await db.query('DELETE FROM "EvaluationPrompt" WHERE "id" = $1', [promptId]).catch(() => undefined);
    await db.end();
  }
}
