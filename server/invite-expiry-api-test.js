import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ quiet: true });

const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const databaseName = `mc_invite_expiry_${randomUUID().replaceAll('-', '')}`;
const control = new pg.Client({ connectionString: process.env.DATABASE_URL });
const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.pathname = `/${databaseName}`;
const hash = (value) => createHash('sha256').update(value).digest('hex');

let db;
let provider;
const apiProcesses = [];
let databaseCreated = false;

async function run(command, args, env) {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (data) => { logs += data; });
  child.stderr.on('data', (data) => { logs += data; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, logs);
}

async function startApi(env) {
  const api = spawn(process.execPath, ['api.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  apiProcesses.push(api);
  let output = '';
  api.stdout.on('data', (data) => { output += data; });
  api.stderr.on('data', (data) => { output += data; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`API startup timed out:\n${output}`)), 15_000);
    api.stdout.on('data', () => {
      const match = output.match(/localhost:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    api.once('exit', () => { clearTimeout(timeout); reject(new Error(output)); });
  });
  return `http://127.0.0.1:${port}`;
}

async function request(base, path, { method, body, cookie } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    setCookie: response.headers.get('set-cookie') || '',
  };
}

async function login(base, code, expected = 201) {
  const result = await request(base, '/auth/invite', { body: { inviteCode: code } });
  assert.equal(result.status, expected, JSON.stringify(result.data));
  if (expected === 201) assert.ok(result.cookie);
  return result;
}

async function inviteRow(code) {
  const result = await db.query('SELECT "firstUsedAt", "expiresAt", "neverExpires" FROM "InviteCode" WHERE "codeHash" = $1', [hash(code)]);
  return result.rows[0] || null;
}

async function createInvite(base, adminCookie, role = 'user') {
  const result = await request(base, '/admin/invites', { body: { role }, cookie: adminCookie });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.data.inviteCode;
}

try {
  await control.connect();
  await control.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  provider = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/chat/completions') return res.end(JSON.stringify({ choices: [{ message: { content: '测试响应' } }] }));
    res.statusCode = 404;
    res.end('{}');
  });
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  const providerBase = `http://127.0.0.1:${provider.address().port}`;
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl.toString(), PORT: '0', NODE_ENV: 'test',
    INVITE_CODES: 'bootstrap-user',
    ADMIN_INVITE_CODES: 'admin-permanent,admin-legacy',
    DEEPSEEK_API_KEY: 'test-only', DEEPSEEK_BASE_URL: providerBase,
  };
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push'], env);
  db = new pg.Client({ connectionString: databaseUrl.toString() });
  await db.connect();

  // Server A covers the first seven scenarios without exceeding login rate limits.
  const baseA = await startApi(env);
  const permanentAdmin = await login(baseA, 'admin-permanent');

  // TC-01: first successful login fixes a three-day expiry.
  const tc1 = await createInvite(baseA, permanentAdmin.cookie);
  await login(baseA, tc1);
  const tc1Row = await inviteRow(tc1);
  assert.ok(tc1Row.firstUsedAt && tc1Row.expiresAt && !tc1Row.neverExpires);
  assert.ok(Math.abs(new Date(tc1Row.expiresAt) - new Date(tc1Row.firstUsedAt) - INVITE_TTL_MS) < 5);

  // TC-02: creation time never starts the countdown.
  const tc2 = await createInvite(baseA, permanentAdmin.cookie);
  await db.query('UPDATE "InviteCode" SET "createdAt" = NOW() - INTERVAL \'4 days\' WHERE "codeHash" = $1', [hash(tc2)]);
  assert.deepEqual(await inviteRow(tc2), { firstUsedAt: null, expiresAt: null, neverExpires: false });
  await login(baseA, tc2);

  // TC-03: repeat login cannot extend the original expiry.
  const tc3 = await createInvite(baseA, permanentAdmin.cookie);
  await login(baseA, tc3);
  const tc3Expiry = (await inviteRow(tc3)).expiresAt.toISOString();
  await login(baseA, tc3);
  assert.equal((await inviteRow(tc3)).expiresAt.toISOString(), tc3Expiry);

  // TC-04: an invite remains usable immediately before expiry.
  const tc4 = await createInvite(baseA, permanentAdmin.cookie);
  await db.query('UPDATE "InviteCode" SET "firstUsedAt" = NOW(), "expiresAt" = NOW() + INTERVAL \'1 minute\' WHERE "codeHash" = $1', [hash(tc4)]);
  await login(baseA, tc4);

  // TC-05: expiry at the boundary rejects a new login.
  const tc5 = await createInvite(baseA, permanentAdmin.cookie);
  const tc5Update = await db.query('UPDATE "InviteCode" SET "firstUsedAt" = NOW() - INTERVAL \'4 days\', "expiresAt" = NOW() - INTERVAL \'1 day\' WHERE "codeHash" = $1', [hash(tc5)]);
  assert.equal(tc5Update.rowCount, 1);
  const tc5BeforeLogin = await inviteRow(tc5);
  assert.ok(tc5BeforeLogin.expiresAt <= new Date());
  const expiredLogin = await login(baseA, tc5, 401);
  assert.equal(expiredLogin.data.error.code, 'INVITE_CODE_EXPIRED');

  // TC-06: an already-issued session loses protected access after expiry.
  const tc6 = await createInvite(baseA, permanentAdmin.cookie);
  const tc6Login = await login(baseA, tc6);
  await db.query('UPDATE "InviteCode" SET "expiresAt" = NOW() - INTERVAL \'1 day\' WHERE "codeHash" = $1', [hash(tc6)]);
  assert.equal((await request(baseA, '/auth/me', { cookie: tc6Login.cookie })).data.data.authenticated, false);
  assert.equal((await request(baseA, '/recommendations/not-a-real-id', { cookie: tc6Login.cookie })).status, 401);

  // TC-07: concurrent first logins share one immutable activation deadline.
  const tc7 = await createInvite(baseA, permanentAdmin.cookie);
  await Promise.all([login(baseA, tc7), login(baseA, tc7)]);
  const tc7Row = await inviteRow(tc7);
  assert.ok(tc7Row.firstUsedAt && tc7Row.expiresAt);
  const tc7Sessions = await db.query('SELECT COUNT(*)::int AS count, COUNT(DISTINCT "expiresAt")::int AS expiries FROM "UserSession" WHERE "userId" = (SELECT id FROM "User" WHERE "inviteCodeHash" = $1)', [hash(tc7)]);
  assert.deepEqual(tc7Sessions.rows[0], { count: 2, expiries: 1 });

  // A fresh process resets the in-memory rate limiter for scenarios eight to twelve.
  const baseB = await startApi(env);
  const permanentAdminB = await login(baseB, 'admin-permanent');

  // TC-08: rejected input does not activate an issued, unused invite.
  const tc8 = await createInvite(baseB, permanentAdminB.cookie);
  assert.equal((await login(baseB, 'not-an-issued-code', 401)).data.error.code, 'INVALID_INVITE_CODE');
  assert.deepEqual(await inviteRow(tc8), { firstUsedAt: null, expiresAt: null, neverExpires: false });

  // TC-09: a normal configured bootstrap invite follows the same three-day rule.
  await login(baseB, 'bootstrap-user');
  const tc9Row = await inviteRow('bootstrap-user');
  assert.ok(tc9Row.firstUsedAt && tc9Row.expiresAt && !tc9Row.neverExpires);

  // TC-10: configured administrators never expire, even after more than three days.
  const tc10Row = await inviteRow('admin-permanent');
  assert.equal(tc10Row.neverExpires, true);
  assert.equal(tc10Row.expiresAt, null);
  await db.query('UPDATE "InviteCode" SET "firstUsedAt" = NOW() - INTERVAL \'4 days\' WHERE "codeHash" = $1', [hash('admin-permanent')]);
  assert.equal((await request(baseB, '/auth/me', { cookie: permanentAdminB.cookie })).data.data.role, 'admin');

  // TC-11: a legacy expiring administrator record is promoted on login.
  await db.query('INSERT INTO "InviteCode" (id, "codeHash", "codeHint", role, "neverExpires", "firstUsedAt", "expiresAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, false, NOW() - INTERVAL \'4 days\', NOW() - INTERVAL \'1 day\', NOW(), NOW())', [randomUUID(), hash('admin-legacy'), '邀请码 ···legacy', 'admin']);
  await login(baseB, 'admin-legacy');
  const tc11Row = await inviteRow('admin-legacy');
  assert.equal(tc11Row.neverExpires, true);
  assert.equal(tc11Row.expiresAt, null);

  // TC-12: administrators bypass a zero evaluation quota; ordinary users do not.
  const tc12User = await createInvite(baseB, permanentAdminB.cookie);
  const tc12UserLogin = await login(baseB, tc12User);
  const config = await request(baseB, '/admin/evaluation/config', { method: 'PATCH', body: { textDailyLimit: 0, imageDailyLimit: 0 }, cookie: permanentAdminB.cookie });
  assert.equal(config.status, 200, JSON.stringify(config.data));
  const prompts = await request(baseB, '/evaluations/prompts', { cookie: permanentAdminB.cookie });
  const promptId = prompts.data.data.prompts.find((prompt) => prompt.type === 'text').id;
  const evaluation = { type: 'text', promptId, modelAId: 'deepseek/deepseek-v4-flash', modelBId: 'deepseek/deepseek-v4-pro' };
  assert.equal((await request(baseB, '/evaluations', { body: { ...evaluation, inviteCode: 'admin-permanent' }, cookie: permanentAdminB.cookie })).status, 201);
  const userEvaluation = await request(baseB, '/evaluations', { body: { ...evaluation, inviteCode: tc12User }, cookie: tc12UserLogin.cookie });
  assert.equal(userEvaluation.status, 429);
  assert.equal(userEvaluation.data.error.code, 'EVALUATION_QUOTA_EXCEEDED');

  console.log(JSON.stringify({ ok: true, cases: 12 }));
} finally {
  for (const api of apiProcesses) api.kill();
  await Promise.all(apiProcesses.map((api) => once(api, 'exit').catch(() => undefined)));
  await new Promise((resolve) => provider?.close(resolve));
  await db?.end();
  if (databaseCreated) {
    await control.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [databaseName]);
    await control.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  }
  await control.end();
}
