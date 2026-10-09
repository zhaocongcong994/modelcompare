import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ quiet: true });
const databaseName = `mc_eval_test_${randomUUID().replaceAll('-', '')}`;
const control = new pg.Client({ connectionString: process.env.DATABASE_URL });
const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.pathname = `/${databaseName}`;
let api;
let db;
let databaseCreated = false;
let output = '';
let imageFailure = false;
const fixtureDirectory = await mkdtemp(join(tmpdir(), 'mc-evaluation-fixtures-'));
const imageFixtureImport = join(fixtureDirectory, 'image-fixture.mjs');
await writeFile(imageFixtureImport, `
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url || input);
  if (url.hostname === 'images.example.com') {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJuoAAAAASUVORK5CYII=', 'base64');
    return Promise.resolve(new Response(png, { headers: { 'content-type': 'image/png' } }));
  }
  return originalFetch(input, init);
};
`);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const calls = [];
const provider = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  calls.push({ path: req.url, body });
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/image_generation') {
    res.end(JSON.stringify(imageFailure ? { base_resp: { status_code: 1008 } } : {
      base_resp: { status_code: 0 }, data: { image_urls: [`https://images.example.com/${randomUUID()}.png`] },
    }));
  } else if (req.url === '/images/generations') {
    if (!['doubao-seedream-4-0-20260415', 'doubao-seedream-4-5-251128'].includes(body.model)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: { message: 'Unsupported provider model ID' } }));
      return;
    }
    res.end(JSON.stringify({ data: [{ url: `https://images.example.com/${randomUUID()}.png` }] }));
  } else if (req.url === '/chat/completions') {
    if (!['deepseek-v4-flash', 'deepseek-v4-pro'].includes(body.model)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: { message: 'Unsupported provider model ID' } }));
      return;
    }
    res.end(JSON.stringify({ choices: [{ message: { content: '测试模型的实时回答。' } }] }));
  } else { res.statusCode = 404; res.end('{}'); }
});

async function run(command, args, env) {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (data) => { logs += data; });
  child.stderr.on('data', (data) => { logs += data; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, logs);
}

try {
  await control.connect();
  await control.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  const providerBase = `http://127.0.0.1:${provider.address().port}`;
  const env = {
    ...process.env, DATABASE_URL: databaseUrl.toString(), NODE_ENV: 'development', PORT: '0',
    INVITE_CODES: 'test-user-a,test-user-b,test-user-c', ADMIN_INVITE_CODES: 'test-admin',
    MINIMAX_API_KEY: 'test-only', DEEPSEEK_API_KEY: 'test-only', DOUBAO_API_KEY: 'test-only',
    MINIMAX_IMAGE_BASE_URL: providerBase, DEEPSEEK_BASE_URL: providerBase, DOUBAO_BASE_URL: providerBase,
    EVALUATION_ASSET_DIR: join(fixtureDirectory, 'archived-images'),
  };
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push'], env);
  db = new pg.Client({ connectionString: databaseUrl.toString() });
  await db.connect();
  async function startApi(overrides={}) {
    if(api){const exit=once(api,'exit');api.kill('SIGTERM');await exit;}
    output='';
    api = spawn(process.execPath, ['--import', imageFixtureImport, 'api.js'], { env:{...env,MODEL_COMPARE_GENERATION_MODE:'configured',...overrides}, stdio: ['ignore', 'pipe', 'pipe'] });
    api.stdout.on('data', (data) => { output += data; });
    api.stderr.on('data', (data) => { output += data; });
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('API startup timed out')), 15000);
      api.stdout.on('data', () => {
        const match = output.match(/localhost:(\d+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
      api.once('exit', () => { clearTimeout(timeout); reject(new Error(output)); });
    });
    return `http://127.0.0.1:${port}`;
  }
  let base = await startApi();
  async function request(path, body, cookie, extraHeaders = {}) {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json().catch(() => ({})), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function login(code) {
    const result = await request('/auth/invite', { inviteCode: code });
    assert.equal(result.status, 201);
    assert.ok(result.cookie);
    return result.cookie;
  }
  for (const inviteCode of [undefined, null, ['test-user-a'], { code: 'test-user-a' }, 'wrong']) {
    assert.ok([400, 401].includes((await request('/auth/invite', { inviteCode, role: 'admin' })).status));
  }
  assert.equal((await request('/auth/invite', { inviteCode: 'test-user-a' }, null, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('/evaluations', { inviteCode: 'test-user-a' })).status, 401);
  assert.equal((await request('/auth/login', { inviteCode: 'test-user-a' })).status, 404);
  const cookieA = await login('test-user-a');
  const cookieB = await login('test-user-b');
  const cookieC = await login('test-user-c');
  const admin = await login('test-admin');
  assert.equal((await request('/auth/me', undefined, cookieA)).data.data.role, 'user');
  assert.equal((await request('/admin/evaluation/config', undefined, cookieA)).status, 403);
  await db.query(`INSERT INTO "Vendor" (id,name,visible,"displayOrder","updatedAt") VALUES ('vendor-a','A',true,1,NOW()),('vendor-b','B',true,2,NOW()),('vendor-hidden','Hidden',false,0,NOW())`);
  const vendorRows = [{id:'vendor-b',visible:true},{id:'vendor-hidden',visible:false},{id:'vendor-a',visible:true}];
  async function saveVendors(rows, cookie) {
    return fetch(`${base}/admin/vendors`, { method:'PATCH', headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({vendors:rows}) });
  }
  assert.equal((await saveVendors(vendorRows,cookieA)).status,403);
  const sortedVendors = await saveVendors(vendorRows,admin);
  assert.equal(sortedVendors.status,200);
  assert.deepEqual((await sortedVendors.json()).data.vendors.map(v=>[v.id,v.displayOrder]),[['vendor-b',1],['vendor-a',2],['vendor-hidden',3]]);
  assert.equal((await saveVendors([vendorRows[0],vendorRows[0]],admin)).status,422);
  assert.equal((await saveVendors(vendorRows.slice(0,2),admin)).status,409);
  const savedVendors = (await request('/admin/vendors',undefined,admin)).data.data.vendors;
  assert.deepEqual(savedVendors.map(v=>v.id),['vendor-b','vendor-a','vendor-hidden']);
  await db.query(`INSERT INTO "Vendor" (id,name,visible,"displayOrder","updatedAt") VALUES ('bytedance','豆包',true,4,NOW()),('bytedance-seed','豆包',true,5,NOW()),('volcengine','豆包',true,6,NOW())`);
  const mergedVendors = (await request('/admin/vendors',undefined,admin)).data.data.vendors;
  assert.equal(mergedVendors.filter(v=>v.name==='豆包').length,1);
  assert.equal((await saveVendors(mergedVendors.map(v=>({id:v.id,visible:v.id==='bytedance'?false:v.visible})),admin)).status,200);
  const aliases = await db.query(`SELECT visible FROM "Vendor" WHERE id IN ('bytedance','bytedance-seed','volcengine')`);
  assert.ok(aliases.rows.every(v=>v.visible===false));
  const prompts = (await request('/evaluations/prompts', undefined, cookieA)).data.data.prompts;
  assert.equal(prompts.filter((p) => p.type === 'text').length, 5);
  assert.equal(prompts.filter((p) => p.type === 'image').length, 5);
  const editable = prompts.find(p=>p.type==='image');
  const editedContent = '清晨薄雾中的高山湖泊，输出 PNG 格式，分辨率 1080p。';
  const edited = await fetch(`${base}/admin/evaluation/prompts/${editable.id}`, { method:'PATCH',headers:{Cookie:admin,'Content-Type':'application/json'},body:JSON.stringify({type:'image',title:editable.title,content:editedContent}) });
  assert.equal(edited.status,200);
  assert.equal((await edited.json()).data.content,editedContent);
  for (const path of ['/admin/evaluation/prompts','/evaluations/prompts','/admin/evaluation/prompts']) {
    assert.equal((await request(path,undefined,admin)).data.data.prompts.find(p=>p.id===editable.id).content,editedContent);
  }
  await db.query(`INSERT INTO "EvaluationPrompt" (id,type,title,content,enabled,"sortOrder","updatedAt") VALUES ('hidden-extra','text','禁用场景','旧场景',false,999,NOW())`);
  assert.equal((await request('/evaluations/prompts', undefined, cookieA)).data.data.prompts.length, 10);
  const text = { type: 'text', promptId: prompts.find((p) => p.title === '代码实现说明').id, modelAId: 'deepseek/deepseek-v4-flash-0731', modelBId: 'deepseek/deepseek-v4-pro-0813', inviteCode: 'test-user-a' };
  assert.equal((await request('/evaluations', { ...text, inviteCode: undefined }, cookieA)).status, 401);
  assert.equal((await request('/evaluations', { ...text, inviteCode: 'test-user-b' }, cookieA)).status, 403);
  assert.equal((await request('/evaluations', { ...text, promptId: 'hidden-extra' }, cookieA)).status, 422);
  assert.equal(calls.length, 0);
  // Configuration failures must be rejected before quota reservation or either provider call.
  for(const [overrides,code] of [[{MODEL_COMPARE_GENERATION_MODE:'free_only'},'EVALUATION_FREE_CREDIT_NOT_VERIFIED'],[{DEEPSEEK_API_KEY:''},'EVALUATION_PROVIDER_NOT_CONFIGURED']]){
    base=await startApi(overrides);
    const config=(await request('/evaluations/prompts',undefined,cookieA)).data.data;
    assert.equal(config.availability.deepseek.available,false);
    const denied=await request('/evaluations',text,cookieA);
    assert.equal(denied.status,409);assert.equal(denied.data.error.code,code);
    const usage=await db.query('SELECT COUNT(*)::int AS count FROM "EvaluationUsage"');
    assert.equal(usage.rows[0].count,0);assert.equal(calls.length,0);
  }
  base=await startApi();
  async function quota(textDailyLimit, imageDailyLimit) {
    const response = await fetch(`${base}/admin/evaluation/config`, { method: 'PATCH', headers: { Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ textDailyLimit, imageDailyLimit }) });
    assert.equal(response.status, 200);
  }
  await quota(1, 0);
  assert.equal((await request('/evaluations', { ...text, inviteCode: 'test-admin' }, admin)).status, 201);
  assert.equal((await request('/evaluations', { ...text, inviteCode: 'test-admin' }, admin)).status, 201);
  const textC = { ...text, inviteCode: 'test-user-c' };
  assert.equal((await request('/evaluations', textC, cookieC)).status, 201);
  assert.equal((await request('/evaluations', textC, cookieC)).status, 429);
  await quota(2, 0);
  assert.equal((await request('/evaluations', textC, cookieC)).status, 201);
  assert.equal((await request('/evaluations', textC, cookieC)).status, 429);
  const adminUsage = await db.query('SELECT COUNT(*)::int AS count FROM "EvaluationUsage" WHERE "userId" IN (SELECT id FROM "User" WHERE "inviteCodeHash" = $1)', [hash('test-admin')]);
  assert.equal(adminUsage.rows[0].count, 0);
  assert.ok(calls.every((call) => call.body.thinking?.type === 'disabled'));
  calls.length = 0;
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => request('/evaluations', text, cookieA)));
  assert.equal(concurrent.filter((r) => r.status === 201).length, 2, JSON.stringify(concurrent));
  assert.equal(concurrent.filter((r) => r.status === 429).length, 4);
  assert.equal(calls.length, 4);
  const relogin = await login('test-user-a');
  assert.equal((await request('/evaluations', text, relogin)).status, 429);
  assert.equal((await request('/evaluations', { ...text, inviteCode: 'test-user-b' }, cookieB)).status, 201);
  const image = { type: 'image', promptId: prompts.find((p) => p.type === 'image').id, modelAId: 'minimax/image-01', modelBId: 'minimax/image-01-live', inviteCode: 'test-user-b' };
  assert.equal((await request('/evaluations', image, cookieB)).status, 429);
  await quota(2, 1);
  const generated = await request('/evaluations', image, cookieB);
  assert.equal(generated.status, 201);
  assert.equal(generated.data.data.results.length, 2);
  assert.ok(generated.data.data.results.every((result) => /^\/api\/evaluation-assets\/.+\.png$/.test(result.imageUrl)));
  const archivedImagePath = generated.data.data.results[0].imageUrl.replace(/^\/api/, '');
  assert.equal((await request(archivedImagePath, undefined, cookieB)).status, 200);
  assert.equal((await request(archivedImagePath, undefined, cookieA)).status, 404);
  const imageCalls = calls.filter((c) => c.path === '/image_generation');
  assert.equal(imageCalls.length, 2);
  assert.deepEqual(imageCalls.map((c) => c.body.model).sort(), ['image-01', 'image-01-live']);
  assert.ok(imageCalls.every((c) => c.body.n === 1 && c.body.aspect_ratio === '1:1'));
  assert.equal((await request('/evaluations', image, cookieB)).status, 429);
  assert.equal(calls.filter((c) => c.path === '/image_generation').length, 2);
  await quota(2, 2);
  const doubaoImage = { ...image, modelBId: 'doubao/doubao-seedream-4-0-20260415' };
  const doubao = await request('/evaluations', doubaoImage, cookieB);
  assert.equal(doubao.status, 201);
  assert.equal(doubao.data.data.results.length, 2);
  const doubaoImageCalls = calls.filter((c) => c.path === '/images/generations');
  assert.equal(doubaoImageCalls.length, 1);
  assert.equal(doubaoImageCalls[0].body.model, 'doubao-seedream-4-0-20260415');
  assert.equal(doubaoImageCalls[0].body.size, '1K');
  assert.equal(doubaoImageCalls[0].body.response_format, 'url');
  assert.equal((await request('/evaluations', doubaoImage, cookieB)).status, 429);
  await quota(2, 3);
  const doubao45Image = { ...image, modelBId: 'doubao/doubao-seedream-4-5-251128' };
  const doubao45 = await request('/evaluations', doubao45Image, cookieB);
  assert.equal(doubao45.status, 201);
  const doubao45Calls = calls.filter((c) => c.path === '/images/generations' && c.body.model === 'doubao-seedream-4-5-251128');
  assert.equal(doubao45Calls.length, 1);
  assert.equal(doubao45Calls[0].body.size, '2048x2048');
  assert.equal((await request('/evaluations', doubao45Image, cookieB)).status, 429);
  await quota(2, 4);
  imageFailure = true;
  assert.equal((await request('/evaluations', image, cookieB)).status, 502);
  assert.equal((await request('/evaluations', image, cookieB)).status, 429);
  await db.query('UPDATE "User" SET "inviteCodeHash" = $1 WHERE "inviteCodeHash" = $2', ['revoked', hash('test-user-b')]);
  assert.equal((await request('/evaluations', { ...text, inviteCode: 'test-user-b' }, cookieB)).status, 401);
  await db.query('UPDATE "UserSession" SET "expiresAt"=NOW()-INTERVAL \'1 day\' WHERE "userId" IN (SELECT id FROM "User" WHERE "inviteCodeHash"=$1)', [hash('test-user-a')]);
  assert.equal((await request('/evaluations', text, cookieA)).status, 401);
  assert.equal((await request('/auth/invite', { inviteCode: 'wrong' })).status, 401);
  let rateLimited = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rejected = await request('/auth/invite', { inviteCode: 'wrong' });
    assert.ok([401, 429].includes(rejected.status));
    if (rejected.status === 429) { rateLimited = true; break; }
  }
  assert.ok(rateLimited);
  console.log('PASS: invite login, origin rejection, session binding/revocation/expiry, all 10 scenes and disabled rejection, concurrent/shared user quotas, immediate limit increase 1→2, dated model mapping, admin exemption, mocked image calls (MiniMax + Doubao), archived image ownership and provider failure.');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (api && api.exitCode === null) { api.kill('SIGTERM'); await once(api, 'exit'); }
  await new Promise((resolve) => provider.close(resolve));
  await db?.end();
  if (databaseCreated) await control.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await control.end();
  await rm(fixtureDirectory, { recursive: true, force: true });
}
