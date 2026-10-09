import express from 'express';
import { canonicalVendorId, canonicalVendors } from './vendor-identity.js';
import cors from 'cors';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { formatNumber, getCatalog, getCatalogStatus } from './catalog.js';
import { getCommercialData } from './commercial-data.js';
import { getPersistedCatalog } from './catalog-store.js';
import { getDb } from './db.js';
import { archiveEvaluationImage, evaluationAssetDirectory, evaluationAssetFileName, isArchivedEvaluationImage } from './evaluation-assets.js';
import { enrichRecommendationWithAgent } from './rag.js';
import { buildRuleRecommendation } from './recommendation.js';
import { setKnowledgeStatus, readKnowledge } from './knowledge-store.js';
import { enqueueScore, publicScore, scoreConfiguration, startScoreWorker } from './judge/service.js';
import { ingestAll, listKnowledgeSources, validateKnowledgeSourceUrl } from './ingest-knowledge.js';
import { EVALUATION_TYPES, PROMPT_SEEDS, generateText, generateImage, isAllowedModel, evaluationAvailability, requireEvaluationProvider } from './evaluation.js';
import { generateInviteCode, inviteCodeHint } from './invite-code.js';

const app = express();
const PORT = process.env.PORT || 3456;

const defaultCorsOrigins = [
  'http://localhost:8765',
  'http://127.0.0.1:8765',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];
const allowedCorsOrigins = new Set(
  String(process.env.CORS_ORIGINS || defaultCorsOrigins.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function isAllowedCorsOrigin(origin) {
  // Requests without Origin are server-to-server, CLI, or same-origin navigations.
  return !origin || allowedCorsOrigins.has(origin);
}

function redactSecrets(value) {
  return String(value || '')
    .replace(/(bearer\s+)[^\s]+/ig, '$1[REDACTED]')
    .replace(/(sk-|api[_-]?key[=:]?)[A-Za-z0-9_\-]{8,}/ig, '$1[REDACTED]')
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/ig, '$1[REDACTED]@');
}

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) { callback(null, isAllowedCorsOrigin(origin)); },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 600,
}));
app.use(express.json({ limit: '256kb' }));

// Reject cross-site writes on the server; CORS alone does not block execution.
app.use((req, res, next) => {
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  // Next/Nginx preserve the public host when proxying to the internal API host.
  const publicHost = req.get('x-forwarded-host') || req.get('host');
  const publicProtocol = req.get('x-forwarded-proto') || req.protocol;
  const sameOrigin = origin === `${publicProtocol}://${publicHost}`;
  if (req.get('sec-fetch-site') === 'cross-site' || (origin && !sameOrigin && !allowedCorsOrigins.has(origin))) {
    return authError(res, 403, 'ORIGIN_NOT_ALLOWED', '请求来源不被允许');
  }
  next();
});
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function requestNeedsCatalog(req) {
  if (req.path.startsWith('/auth') || req.path.startsWith('/admin') || req.path.startsWith('/evaluations') || req.path.startsWith('/evaluation-assets')) return false;
  if (req.method === 'GET' && req.path.startsWith('/recommendations')) return false;
  if (req.method === 'POST' && /^\/recommendations\/[^/]+\/feedback$/.test(req.path)) return false;
  return true;
}

app.use(async (req, res, next) => {
  // Stored history and its access checks do not need the live provider catalog.
  // Keeping them independent means a temporary upstream outage cannot prevent
  // users from reading their own past data or enforcing ownership boundaries.
  if (!requestNeedsCatalog(req)) return next();
  try {
    req.catalog = await getPersistedCatalog() || await getCatalog();
    req.commercial = await getCommercialData(req.catalog.models.map((model) => model.id));
    next();
  } catch (err) {
    console.error('Catalog refresh failed:', redactSecrets(err?.message));
    res.status(503).json({
      error: { code: 'CATALOG_UNAVAILABLE', message: '实时模型目录暂时不可用，请稍后重试' },
    });
  }
});

const authAttempts = new Map();
const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((part) => part.trim().split(/=(.*)/s)).filter(([key]) => key));
const publicAuth = (user) => ({ authenticated: true, role: user.role });

function publicEvaluationRun(run) {
  return {
    ...run,
    results: (run.results || []).map((result) => {
      if (!result.imageUrl || isArchivedEvaluationImage(result.imageUrl)) return result;
      // Provider image URLs are intentionally short-lived. Existing records
      // that predate local archiving cannot be reconstructed once expired.
      return { ...result, imageUrl: null, imageExpired: true };
    }),
  };
}

function configuredInviteCodes(name) {
  return new Set(String(process.env[name] || '').split(',').map((code) => code.trim()).filter(Boolean));
}

function inviteConfiguration() {
  const userCodes = configuredInviteCodes('INVITE_CODES');
  const adminCodes = configuredInviteCodes('ADMIN_INVITE_CODES');
  for (const code of adminCodes) {
    if (userCodes.has(code)) throw new Error('邀请码配置错误：普通邀请码与管理员邀请码不能重叠');
  }
  return { userCodes, adminCodes };
}

function configuredInviteRole(code, config) {
  return config.adminCodes.has(code) ? 'admin' : config.userCodes.has(code) ? 'user' : null;
}

function configuredInviteRoleByHash(codeHash, config) {
  for (const code of config.adminCodes) if (tokenHash(code) === codeHash) return 'admin';
  for (const code of config.userCodes) if (tokenHash(code) === codeHash) return 'user';
  return null;
}

function inviteExpiry(firstUsedAt) {
  return new Date(firstUsedAt.getTime() + INVITE_TTL_MS);
}

async function findOrCreateConfiguredInvite(db, code, role, existingUser, neverExpires = false) {
  const codeHash = tokenHash(code);
  const existing = await db.inviteCode.findUnique({ where: { codeHash } });
  if (existing) return existing;
  // Environment codes are retained as a migration/bootstrapping path. If a
  // legacy account already exists, its creation time is its original login.
  const firstUsedAt = existingUser?.createdAt || null;
  try {
    return await db.inviteCode.create({
      data: {
        codeHash,
        codeHint: inviteCodeHint(code),
        role,
        ...(neverExpires ? { neverExpires: true, ...(firstUsedAt ? { firstUsedAt } : {}) } : (firstUsedAt ? { firstUsedAt, expiresAt: inviteExpiry(firstUsedAt) } : {})),
      },
    });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    return db.inviteCode.findUniqueOrThrow({ where: { codeHash } });
  }
}

async function activateInvite(db, invite) {
  if (invite.neverExpires) {
    if (invite.firstUsedAt) return invite;
    const firstUsedAt = new Date();
    const result = await db.inviteCode.updateMany({ where: { id: invite.id, firstUsedAt: null }, data: { firstUsedAt } });
    if (result.count) return { ...invite, firstUsedAt };
    return db.inviteCode.findUnique({ where: { id: invite.id } });
  }
  if (invite.expiresAt && invite.expiresAt <= new Date()) return null;
  if (invite.firstUsedAt && invite.expiresAt) return invite;
  const firstUsedAt = new Date();
  const expiresAt = inviteExpiry(firstUsedAt);
  const result = await db.inviteCode.updateMany({
    where: { id: invite.id, firstUsedAt: null },
    data: { firstUsedAt, expiresAt },
  });
  if (result.count) return { ...invite, firstUsedAt, expiresAt };
  const current = await db.inviteCode.findUnique({ where: { id: invite.id } });
  return current?.expiresAt && current.expiresAt > new Date() ? current : null;
}

function authError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function rateLimit(req, res) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const current = authAttempts.get(key) || { count: 0, startedAt: now };
  if (now - current.startedAt > 10 * 60 * 1000) {
    authAttempts.set(key, { count: 1, startedAt: now });
    return true;
  }
  current.count += 1;
  authAttempts.set(key, current);
  if (current.count > 10) {
    authError(res, 429, 'AUTH_RATE_LIMITED', '尝试过于频繁，请稍后再试');
    return false;
  }
  return true;
}

async function getAuthenticatedUser(req) {
  const token = parseCookies(req.headers.cookie).mc_session;
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;
  const session = await db.userSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
  if (!session) return null;
  const config = inviteConfiguration();
  const permanentAdmin = [...config.adminCodes].some((code) => tokenHash(code) === session.user.inviteCodeHash);
  if (!permanentAdmin && session.expiresAt && session.expiresAt <= new Date()) return null;
  const invite = await db.inviteCode.findUnique({ where: { codeHash: session.user.inviteCodeHash } });
  // Existing accounts created before InviteCode was added retain the same
  // fixed three-day window, measured from their original account creation.
  const legacyRole = configuredInviteRoleByHash(session.user.inviteCodeHash, config);
  const legacyExpired = session.user.createdAt && inviteExpiry(session.user.createdAt) <= new Date();
  const role = invite
    ? (invite.neverExpires || (invite.expiresAt && invite.expiresAt > new Date()) ? invite.role : null)
    : (permanentAdmin ? 'admin' : (!legacyExpired ? legacyRole : null));
  if (!role) return null;
  return { user: { ...session.user, role }, tokenHash: tokenHash(token) };
}

async function requireUser(req, res, next) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) return authError(res, 401, 'AUTH_REQUIRED', '请先登录');
    req.user = auth.user;
    next();
  } catch (error) { next(error); }
}

async function requireAdmin(req, res, next) {
  await requireUser(req, res, async () => {
    if (req.user.role !== 'admin') return authError(res, 403, 'ADMIN_REQUIRED', '仅管理员可访问');
    next();
  });
}

app.get('/evaluation-assets/:fileName', requireUser, asyncHandler(async (req, res) => {
  const fileName = String(req.params.fileName || '');
  const imageUrl = `/api/evaluation-assets/${fileName}`;
  if (!evaluationAssetFileName(imageUrl)) return authError(res, 404, 'EVALUATION_IMAGE_NOT_FOUND', '历史图片不存在');
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '历史图片服务暂不可用');
  const result = await db.evaluationResult.findFirst({
    where: { imageUrl, ...(req.user.role === 'admin' ? {} : { run: { userId: req.user.id } }) },
    select: { id: true },
  });
  if (!result) return authError(res, 404, 'EVALUATION_IMAGE_NOT_FOUND', '历史图片不存在');
  res.sendFile(fileName, { root: evaluationAssetDirectory(), dotfiles: 'deny' }, (error) => {
    if (error && !res.headersSent) authError(res, error.code === 'ENOENT' ? 404 : 500, 'EVALUATION_IMAGE_NOT_FOUND', '历史图片不存在');
  });
}));

async function ensureEvaluationPrompts(db) {
  if (!await db.evaluationPrompt.count()) {
    await db.evaluationPrompt.createMany({ data: PROMPT_SEEDS.map(([type, title, content], sortOrder) => ({ type, title, content, sortOrder })) });
  }
  // Reading prompts must not rewrite administrator-authored content.
}

function dateKey() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }); }
async function visibleEvaluationPrompts(db) {
  return (await Promise.all(['text', 'image'].map((type) => db.evaluationPrompt.findMany({
    where: { type, enabled: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  })))).flat();
}
async function evaluationConfig(db) { return db.evaluationConfig.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } }); }
async function reserveEvaluationQuota(db, user, type) {
  // Administrator accounts are operationally exempt from user-facing
  // evaluation limits.
  if (user.role === 'admin') return;
  const config = await evaluationConfig(db);
  const limit = type === 'text' ? config.textDailyLimit : config.imageDailyLimit;
  const key = { userId: user.id, type, dateKey: dateKey() };
  const reserved = await db.$transaction(async (tx) => {
    await tx.evaluationUsage.upsert({ where: { userId_type_dateKey: key }, update: { count: { increment: 0 } }, create: { ...key, count: 0 } });
    return tx.evaluationUsage.updateMany({ where: { ...key, count: { lt: limit } }, data: { count: { increment: 1 } } });
  });
  if (!reserved.count) {
    throw Object.assign(new Error('今日已超过对比次数，请明天再来评测吧。'), { code: 'EVALUATION_QUOTA_EXCEEDED' });
  }
}

app.post('/auth/invite', asyncHandler(async (req, res) => {
  const inviteCode = typeof req.body?.inviteCode === 'string' ? req.body.inviteCode.trim() : '';
  if (!inviteCode) return authError(res, 400, 'INVALID_INVITE_CODE', '请输入邀请码');
  let config;
  try {
    config = inviteConfiguration();
  } catch (error) {
    console.error(error.message);
    return authError(res, 503, 'INVITE_CONFIGURATION_INVALID', '邀请码服务暂不可用');
  }
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '账号服务暂不可用');
  const codeHash = tokenHash(inviteCode);
  const permanentAdmin = config.adminCodes.has(inviteCode);
  let invite = await db.inviteCode.findUnique({ where: { codeHash } });
  // Administrator codes are operational credentials, not public invites.
  // Resolve their role before applying the anonymous-login abuse limit so an
  // administrator is never locked out by earlier failed user-code attempts.
  const isAdminInvite = permanentAdmin || invite?.role === 'admin';
  if (!isAdminInvite && !rateLimit(req, res)) return;
  const existingUser = await db.user.findUnique({ where: { inviteCodeHash: codeHash }, select: { createdAt: true } });
  if (!invite) {
    const role = configuredInviteRole(inviteCode, config);
    if (!role) return authError(res, 401, 'INVALID_INVITE_CODE', '邀请码无效');
    invite = await findOrCreateConfiguredInvite(db, inviteCode, role, existingUser, permanentAdmin);
  } else if (permanentAdmin && !invite.neverExpires) {
    // Promote an administrator code that was used before the permanent-admin
    // rule was introduced, without requiring the user to wait for expiry.
    invite = await db.inviteCode.update({ where: { id: invite.id }, data: { role: 'admin', neverExpires: true, expiresAt: null } });
  }
  const token = randomBytes(32).toString('base64url');
  const authenticated = await db.$transaction(async (tx) => {
    const currentInvite = await tx.inviteCode.findUnique({ where: { id: invite.id } });
    const activeInvite = currentInvite && await activateInvite(tx, currentInvite);
    if (!activeInvite) return null;
    const user = await tx.user.upsert({
      where: { inviteCodeHash: codeHash },
      update: { role: activeInvite.role, inviteCodeLabel: activeInvite.codeHint },
      create: { inviteCodeHash: codeHash, inviteCodeLabel: activeInvite.codeHint, role: activeInvite.role },
    });
    await tx.userSession.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: activeInvite.neverExpires ? null : activeInvite.expiresAt } });
    return { invite: activeInvite, user };
  });
  if (!authenticated) return authError(res, 401, 'INVITE_CODE_EXPIRED', '邀请码已于首次登录三天后失效');
  // Secure cookies require HTTPS; the flag is opt-in via SESSION_COOKIE_SECURE
  // so plain-HTTP deployments (e.g. IP:port behind no TLS) keep sessions working.
  const cookie = { httpOnly: true, sameSite: 'strict', secure: process.env.SESSION_COOKIE_SECURE === 'true', path: '/' };
  if (!authenticated.invite.neverExpires) cookie.maxAge = Math.max(0, authenticated.invite.expiresAt.getTime() - Date.now());
  res.cookie('mc_session', token, cookie);
  res.status(201).json({ data: publicAuth(authenticated.user) });
}));

app.post('/auth/logout', async (req, res) => {
  const token = parseCookies(req.headers.cookie).mc_session;
  const db = await getDb();
  if (token && db) await db.userSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
  res.clearCookie('mc_session', { path: '/' });
  res.status(204).end();
});

app.get('/admin/invites', requireAdmin, asyncHandler(async (req, res) => {
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '邀请码服务暂不可用');
  const invites = await db.inviteCode.findMany({
    select: { id: true, codeHint: true, role: true, neverExpires: true, firstUsedAt: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' }, take: 100,
  });
  res.json({ data: { invites } });
}));

app.post('/admin/invites', requireAdmin, asyncHandler(async (req, res) => {
  const role = req.body?.role === undefined ? 'user' : req.body.role;
  if (!['user', 'admin'].includes(role)) return authError(res, 422, 'INVALID_INVITE_ROLE', '邀请码角色仅支持 user 或 admin');
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '邀请码服务暂不可用');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateInviteCode();
    try {
      const invite = await db.inviteCode.create({ data: { codeHash: tokenHash(code), codeHint: inviteCodeHint(code), role } });
      // The plaintext is intentionally returned exactly once and never stored.
      return res.status(201).json({ data: { id: invite.id, inviteCode: code, codeHint: invite.codeHint, role: invite.role, expiresAfterFirstLoginDays: 3 } });
    } catch (error) {
      if (error?.code !== 'P2002' || attempt === 2) throw error;
    }
  }
}));

app.get('/auth/me', asyncHandler(async (req, res) => {
  const auth = await getAuthenticatedUser(req);
  res.json({ data: auth ? publicAuth(auth.user) : { authenticated: false, role: null } });
}));

const SUPPORTED_TASK_TYPES = new Set(['chat', 'retrieval', 'code', 'reasoning', 'vision', 'voice']);
const SUPPORTED_LANGUAGES = new Set(['zh', 'en']);
const DEFAULT_PREFERENCES = { cost: 0.5, context: 0.25, quality: 0.25 };

function modelToJson(model, catalog, commercial = new Map()) {
  const vendor = catalog.vendorById.get(model.vendorId);
  const commercialInfo = commercial.get(model.id) || { apiPricing: [], subscriptions: [], benchmarks: [], officialSources: [] };
  const superclue = commercialInfo.benchmarks
    .filter((item) => item.provider === 'SuperCLUE')
    .sort((a, b) => new Date(b.evaluatedAt) - new Date(a.evaluatedAt))[0];
  return {
    id: model.id,
    slug: model.id,
    vendor: {
      id: vendor.id,
      slug: vendor.id,
      name: vendor.name,
      logoUrl: null,
    },
    vendorId: vendor.id,
    displayName: model.displayName,
    category: model.category,
    inputModes: model.inputModes || ['文本'],
    outputModes: model.outputModes || ['文本'],
    supportsReasoning: Boolean(model.supportsReasoning || model.recommendation?.taskTypes?.includes('reasoning')),
    primaryFeatures: model.primaryFeatures || model.updateFeature || '暂无模型摘要。',
    superclue: superclue ? {
      totalScore: superclue.totalScore,
      rank: superclue.rank,
      category: superclue.category,
      evaluatedAt: superclue.evaluatedAt,
      sourceUrl: superclue.sourceUrl,
      dimensions: superclue.dimensionScores || {},
    } : null,
    contextSize: model.contextSize,
    openSource: model.openSource === '未披露' ? '未知' : (model.openSource || '未知'),
    releaseDate: model.releaseDate,
    pricing: model.pricing,
    sourceUrl: model.sourceUrl,
    latestUpdate: {
      id: `${model.id}-latest`,
      versionTag: 'v1.0',
      title: model.updateTitle,
      detail: model.updateTitle,
      feature: model.updateFeature,
      releasedAt: model.releaseDate,
    },
    ...commercialInfo,
  };
}

// GET /vendors
app.get('/vendors', (req, res) => {
  res.json({
    data: req.catalog.vendors.map((v) => ({
      id: v.id,
      slug: v.id,
      name: v.name,
      logo_url: null,
    })),
  });
});

// GET /models
app.get('/models', (req, res) => {
  const { vendor, category, search, limit = 20, offset = 0 } = req.query;

  let items = req.catalog.models.map((model) => modelToJson(model, req.catalog, req.commercial));

  if (vendor) {
    items = items.filter((m) => m.vendor.slug === vendor);
  }

  if (category) {
    items = items.filter((m) => m.category === category);
  }

  if (search) {
    const s = search.toLowerCase();
    items = items.filter(
      (m) =>
        m.displayName.toLowerCase().includes(s) ||
        m.vendor.name.toLowerCase().includes(s)
    );
  }

  // 选择列表和 API 均以发布日期倒序，未披露日期的模型排在最后。
  items.sort((a, b) => (Date.parse(b.releaseDate || '') || 0) - (Date.parse(a.releaseDate || '') || 0) || a.displayName.localeCompare(b.displayName));

  const total = items.length;
  const start = Math.min(parseInt(offset, 10) || 0, total);
  const end = Math.min(start + (parseInt(limit, 10) || 20), total);
  const data = items.slice(start, end);

  res.json({
    data,
    meta: {
      total,
      limit: parseInt(limit, 10) || 20,
      offset: start,
    },
  });
});

// GET /models/compare?ids=...
// Must be defined before /models/:id to avoid being captured by the param route.
app.get('/models/compare', (req, res) => {
  const { ids } = req.query;

  if (!ids) {
    return res.status(400).json({
      error: { code: 'INVALID_MODEL_ID', message: '缺少 ids 参数' },
    });
  }

  const idList = [...new Set(String(ids).split(',').filter(Boolean))];

  if (idList.length < 2 || idList.length > 5) {
    return res.status(400).json({
      error: {
        code: 'INVALID_COMPARISON_COUNT',
        message: '对比模型数量必须在 2–5 个之间',
      },
    });
  }

  const models = idList.map((id) => req.catalog.byId.get(id)).filter(Boolean);

  if (models.length !== idList.length) {
    return res.status(404).json({
      error: { code: 'MODEL_NOT_FOUND', message: '部分模型不存在' },
    });
  }

  const fields = [
    { key: 'category', label: '模型分类' },
    { key: 'contextSize', label: '上下文大小' },
    { key: 'supportsReasoning', label: '是否支持推理' },
    { key: 'primaryFeatures', label: '主要功能' },
    { key: 'openSource', label: '开源状态' },
    { key: 'inputModes', label: '输入方式' },
    { key: 'outputModes', label: '输出方式' },
    { key: 'releaseDate', label: '发布日期' },
    { key: 'superclue', label: 'SuperCLUE 指数' },
  ];

  res.json({
    data: {
      models: models.map((model) => modelToJson(model, req.catalog, req.commercial)),
      fields,
    },
  });
});

// GET /models/:id
app.get('/models/:id', (req, res) => {
  const model = req.catalog.byId.get(req.params.id);
  if (!model) {
    return res.status(404).json({
      error: { code: 'MODEL_NOT_FOUND', message: '模型不存在' },
    });
  }
  res.json(modelToJson(model, req.catalog, req.commercial));
});

app.get('/catalog/status', async (req, res) => {
  res.json({ data: {
    source: req.catalog.source,
    fetchedAt: req.catalog.fetchedAt,
    modelCount: req.catalog.models.length,
    vendorCount: req.catalog.vendors.length,
    ...(req.catalog.source === 'postgresql' ? { cacheTtlSeconds: null } : await getCatalogStatus()),
  } });
});

function validateStringArray(value, allowed, fieldName) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !allowed.has(item))) {
    throw new Error(`${fieldName} 包含不支持的值`);
  }
  return [...new Set(value)];
}

function validateRecommendationRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('请求体必须是 JSON 对象');
  }

  const requirements = body.requirements ?? {};
  const preferences = body.preferences ?? {};
  if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) {
    throw new Error('requirements 必须是对象');
  }
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    throw new Error('preferences 必须是对象');
  }
  if (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 2000) {
    throw new Error('任务说明为必填项，且不能超过 2000 字符');
  }

  const minContextSize = requirements.minContextSize;
  const maxMonthlyBudgetUsd = requirements.maxMonthlyBudget ?? requirements.maxMonthlyBudgetUsd;
  const budgetCurrency = requirements.budgetCurrency || 'USD';
  const billing = requirements.billing || 'per_token';
  if (!['USD', 'CNY'].includes(budgetCurrency) || !['per_token', 'per_image'].includes(billing)) throw new Error('币种或计费类型不合法');
  if (requirements.scene !== undefined && !['product', 'support', 'marketing'].includes(requirements.scene)) throw new Error('评分场景不合法');
  const deployment = requirements.deployment || 'either';
  const modality = requirements.modality || 'either';
  const openSource = requirements.openSource || 'either';
  const workload = requirements.workload || {};
  if (requirements.requiresReasoning !== undefined && typeof requirements.requiresReasoning !== 'boolean') throw new Error('requiresReasoning 必须为布尔值');
  const limit = 2;

  if (minContextSize !== undefined && (!Number.isInteger(minContextSize) || minContextSize < 1)) {
    throw new Error('minContextSize 必须是正整数');
  }
  if (maxMonthlyBudgetUsd !== undefined && (!Number.isFinite(maxMonthlyBudgetUsd) || maxMonthlyBudgetUsd < 0)) {
    throw new Error('maxMonthlyBudgetUsd 必须是非负数字');
  }
  if (!['api', 'self_hosted', 'either'].includes(deployment)) {
    throw new Error('deployment 必须为 api、self_hosted 或 either');
  }
  if (!['either', '单模态', '多模态'].includes(modality) || !['either', 'open', 'closed'].includes(openSource)) throw new Error('筛选偏好不合法');
  for (const key of ['inputTokens', 'outputTokens', 'dailyRequests', 'daysPerMonth']) {
    if (!Number.isSafeInteger(workload[key]) || workload[key] < 0) throw new Error(`workload.${key} 必须为非负整数`);
  }
  if (workload.daysPerMonth < 1 || workload.daysPerMonth > 31 || !Number.isFinite(workload.cacheRatio) || workload.cacheRatio < 0 || workload.cacheRatio > 100) throw new Error('工作负载参数不合法');

  const normalizedPreferences = {};
  for (const [key, value] of Object.entries(preferences)) {
    if (!['cost', 'context', 'quality'].includes(key) || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error('preferences 仅支持 0–1 之间的 cost、context、quality');
    }
    normalizedPreferences[key] = value;
  }

  const resolvedPreferences = Object.keys(normalizedPreferences).length ? normalizedPreferences : DEFAULT_PREFERENCES;
  if (Object.values(resolvedPreferences).every((value) => value === 0)) {
    throw new Error('至少需要一项大于 0 的排序偏好');
  }

  return {
    query: body.query?.trim() || '',
    requirements: {
      taskTypes: validateStringArray(requirements.taskTypes, SUPPORTED_TASK_TYPES, 'taskTypes'),
      languages: validateStringArray(requirements.languages, SUPPORTED_LANGUAGES, 'languages'),
      ...(minContextSize !== undefined ? { minContextSize } : {}),
      ...(maxMonthlyBudgetUsd !== undefined ? { maxMonthlyBudget: maxMonthlyBudgetUsd } : {}),
      budgetCurrency, billing, ...(requirements.scene ? { scene: requirements.scene } : {}),
      deployment,
      // A private deployment necessarily requires deployable weights. Enforce
      // this server-side too, so direct API callers cannot create a conflicting
      // `self_hosted + closed` request.
      modality, openSource: deployment === 'self_hosted' ? 'open' : openSource, requiresReasoning: Boolean(requirements.requiresReasoning), workload,
    },
    preferences: resolvedPreferences,
    limit,
  };
}

async function createRecommendation(input, catalog) {
  let fx = null;
  try { fx = JSON.parse(process.env.RECOMMENDATION_FX_SNAPSHOT || 'null'); } catch { /* invalid FX remains unverifiable */ }
  const data = buildRuleRecommendation(input, catalog, modelToJson, (id) => isAllowedModel('text', id) || isAllowedModel('image', id), fx);
  return enrichRecommendationWithAgent(data, input, catalog);
}

app.post('/recommendations', requireUser, async (req, res) => {
  try {
    const input = validateRecommendationRequest(req.body);
    const data = await createRecommendation(input, req.catalog);
    const db = await getDb();
    if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '推荐历史服务暂不可用');
    await db.userRecommendationRun.create({ data: { recommendationId: data.recommendationId, userId: req.user.id, payload: data } });
    res.status(201).json({ data });
  } catch (err) {
    if (err?.code === 'P2002') return authError(res, 409, 'RECOMMENDATION_ID_CONFLICT', '推荐结果保存冲突，请重试');
    res.status(422).json({
      error: { code: 'INVALID_RECOMMENDATION_REQUEST', message: err.message || '推荐条件格式错误' },
    });
  }
});

async function ownedRecommendationRun(userId, recommendationId) {
  const db = await getDb();
  if (!db) return { db: null, run: null };
  const run = await db.userRecommendationRun.findFirst({
    where: { userId, recommendationId },
    select: { id: true, payload: true },
  });
  return { db, run };
}

app.get('/recommendations', requireUser, asyncHandler(async (req, res) => {
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '推荐历史服务暂不可用');
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = Math.min(2_147_483_647, Math.max(0, parseInt(req.query.offset, 10) || 0));
  const [runs, total] = await Promise.all([
    db.userRecommendationRun.findMany({ where: { userId: req.user.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: limit }),
    db.userRecommendationRun.count({ where: { userId: req.user.id } }),
  ]);
  res.json({ data: { runs: runs.map((run) => ({ recommendationId: run.recommendationId, createdAt: run.createdAt, schemaVersion: run.payload?.schemaVersion || 1, query: run.payload?.inputSnapshot?.query || null, items: (run.payload?.items || []).map((i) => ({ id: i.model?.id, name: i.model?.displayName, score: i.score })) })), total, limit, offset } });
}));

app.get('/recommendations/:recommendationId', requireUser, async (req, res) => {
  const { db, run } = await ownedRecommendationRun(req.user.id, req.params.recommendationId);
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '推荐历史服务暂不可用');
  if (!run) {
    return res.status(404).json({ error: { code: 'RECOMMENDATION_NOT_FOUND', message: '推荐结果不存在或已过期' } });
  }
  res.json({ data: run.payload });
});

app.post('/recommendations/:recommendationId/feedback', requireUser, async (req, res) => {
  const { db, run } = await ownedRecommendationRun(req.user.id, req.params.recommendationId);
  const { modelId, action, helpful } = req.body || {};
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '反馈服务暂不可用');
  if (!run) return res.status(404).json({ error: { code: 'RECOMMENDATION_NOT_FOUND', message: '推荐结果不存在或已过期' } });
  const items = Array.isArray(run.payload?.items) ? run.payload.items : [];
  const isResultModel = !modelId || items.some((item) => item?.model?.id === modelId);
  if (!['viewed', 'added_to_comparison', 'dismissed'].includes(action) || !isResultModel || (helpful !== undefined && typeof helpful !== 'boolean')) {
    return res.status(422).json({ error: { code: 'INVALID_RECOMMENDATION_FEEDBACK', message: '反馈参数不合法' } });
  }
  await db.userFeedback.create({ data: { userId: req.user.id, recommendationRunId: run.id, modelId: modelId || null, action, helpful: helpful ?? null, reason: typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 1000) : null } });
  res.status(201).json({ data: { accepted: true } });
});

app.get('/evaluations/prompts', requireUser, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '评测服务暂不可用');
  await ensureEvaluationPrompts(db);
  res.json({ data: { prompts: await visibleEvaluationPrompts(db), availability: evaluationAvailability() } });
});

app.post('/evaluations', requireUser, asyncHandler(async (req, res) => {
  const { type, promptId, modelAId, modelBId, inviteCode } = req.body || {};
  if (typeof inviteCode !== 'string' || !inviteCode.trim()) return authError(res, 401, 'INVITE_CODE_REQUIRED', '请使用邀请码重新登录后发起评测');
  if (tokenHash(inviteCode.trim()) !== req.user.inviteCodeHash) return authError(res, 403, 'INVITE_SESSION_MISMATCH', '邀请码与当前登录账号不一致，请重新登录');
  if (!EVALUATION_TYPES.has(type) || !['text', 'image'].includes(type) || modelAId === modelBId || !isAllowedModel(type, modelAId) || !isAllowedModel(type, modelBId)) return authError(res, 422, 'INVALID_EVALUATION_REQUEST', '评测类型或模型不合法');
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '评测服务暂不可用');
  await ensureEvaluationPrompts(db);
  const prompt = (await visibleEvaluationPrompts(db)).find((item) => item.id === promptId && item.type === type);
  if (!prompt) return authError(res, 422, 'INVALID_EVALUATION_PROMPT', '请选择有效提示词');
  if (type === 'image' && prompt.content.length > 1500) return authError(res, 422, 'INVALID_EVALUATION_PROMPT', '生图提示词不能超过 1500 个字符');
  // Check both providers before quota reservation or either concurrent call.
  try { for (const modelId of [modelAId, modelBId]) requireEvaluationProvider(modelId); }
  catch (error) { return authError(res, 409, error.code, error.message); }
  try {
    await reserveEvaluationQuota(db, req.user, type);
    let results;
    if (type === 'image') {
      results = await Promise.all([modelAId, modelBId].map(async (modelId) => {
        const providerImageUrl = await generateImage(modelId, prompt.content);
        return { modelId, imageUrl: await archiveEvaluationImage(providerImageUrl) };
      }));
    } else {
      results = await Promise.all([modelAId, modelBId].map(async (modelId) => ({ modelId, content: await generateText(modelId, prompt.content) })));
    }
    const run = await db.evaluationRun.create({ data: { userId: req.user.id, type, promptId, promptText: prompt.content, modelAId, modelBId, results: { create: results } }, include: { results: true, prompt: true } });
    res.status(201).json({ data: publicEvaluationRun(run) });
  } catch (error) {
    const status = error.code === 'EVALUATION_QUOTA_EXCEEDED' ? 429 : 502;
    console.error('Evaluation failed:', redactSecrets(error.message));
    res.status(status).json({ error: { code: status === 429 ? error.code : 'EVALUATION_FAILED', message: status === 429 ? error.message : '模型生成失败，请稍后重试或联系管理员检查模型服务配置' } });
  }
}));

app.get('/evaluations/score-config', requireUser, (req, res) => {
  const config = scoreConfiguration();
  res.json({ data: { mode: config.mode, enabled: config.enabled && (config.mode !== 'shadow' || req.user.role === 'admin'), rankingEnabled: false } });
});
app.post('/evaluations/:id/score', requireUser, asyncHandler(async (req, res) => {
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '评分服务暂不可用');
  const run = await db.evaluationRun.findFirst({ where: { id: req.params.id, userId: req.user.id }, include: { results: true, prompt: true } });
  if (!run) return authError(res, 404, 'EVALUATION_NOT_FOUND', '评测记录不存在');
  if (scoreConfiguration().mode === 'shadow' && req.user.role !== 'admin') return authError(res, 409, 'SCORE_DISABLED', '辅助评分暂未向用户开放');
  try { const job = await enqueueScore(db, run, req.user.id, req.body); res.status(job.status === 'pending' || job.status === 'running' ? 202 : 200).json({ data: publicScore(job, req.user.role) }); }
  catch (error) { return authError(res, error.status || 422, error.code || 'INVALID_SCORE_INPUT', { SCORE_DISABLED: '辅助评分已关闭', SCORE_NOT_CONFIGURED: '请配置评分服务密钥', SCORE_QUEUE_FULL: '评分队列繁忙，请稍后重试', SCORE_TEXT_ONLY: '辅助评分仅支持文本' }[error.code] || '评分输入不合法或过长'); }
}));
app.get('/evaluations/:id/score', requireUser, asyncHandler(async (req, res) => {
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '评分服务暂不可用');
  const run = await db.evaluationRun.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!run) return authError(res, 404, 'EVALUATION_NOT_FOUND', '评测记录不存在');
  const jobs = await db.evaluationScoreRun.findMany({ where: { runId: run.id, userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 10 });
  res.json({ data: { jobs: jobs.map((job) => publicScore(job, req.user.role)) } });
}));

app.post('/evaluations/:id/judgment', requireUser, async (req, res) => {
  const choice = String(req.body?.choice || '');
  if (!['a_better', 'both_good', 'both_bad', 'b_better'].includes(choice)) return authError(res, 422, 'INVALID_EVALUATION_JUDGMENT', '请选择有效评测结论');
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '评测服务暂不可用');
  const run = await db.evaluationRun.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!run) return authError(res, 404, 'EVALUATION_NOT_FOUND', '评测记录不存在');
  try { await db.evaluationJudgment.create({ data: { runId: run.id, choice } }); }
  catch { return authError(res, 409, 'EVALUATION_ALREADY_JUDGED', '该评测已确认'); }
  res.status(201).json({ data: { accepted: true } });
});

app.get('/evaluations/history', requireUser, async (req, res) => {
  const type = String(req.query.type || ''); const modelId = String(req.query.modelId || ''); const promptId = String(req.query.promptId || '');
  const db = await getDb(); if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '评测服务暂不可用');
  const runs = await db.evaluationRun.findMany({ where: { userId: req.user.id, ...(type ? { type } : {}), ...(promptId ? { promptId } : {}), ...(modelId ? { OR: [{ modelAId: modelId }, { modelBId: modelId }] } : {}) }, include: { results: true, prompt: true, judgment: true }, orderBy: { createdAt: 'desc' }, take: 5 });
  res.json({ data: { runs: runs.map(publicEvaluationRun) } });
});

app.get('/admin/knowledge', requireAdmin, asyncHandler(async (req, res) => {
  const db = await getDb();
  const catalog = await getPersistedCatalog() || await getCatalog();
  const modelSources = catalog.models.map((model) => ({ id: model.id, vendor: catalog.vendorById.get(model.vendorId)?.name || model.vendorId, title: model.displayName, sourceUrl: model.sourceUrl }));
  res.json({ data: { storage: 'json', snapshot: (await readKnowledge()).snapshot, sources: await listKnowledgeSources(), modelSources } });
}));

app.get('/admin/vendors', requireAdmin, async (req, res) => {
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '管理服务暂不可用');
  const vendors = await db.vendor.findMany({ select: { id: true, name: true, visible: true, displayOrder: true }, orderBy: [{ visible: 'desc' }, { displayOrder: 'asc' }, { name: 'asc' }] });
  res.json({ data: { vendors: canonicalVendors(vendors) } });
});

app.patch('/admin/vendors', requireAdmin, asyncHandler(async (req, res) => {
  const rows = req.body?.vendors;
  if (!Array.isArray(rows) || !rows.length || rows.some((row) => !row || typeof row.id !== 'string' || typeof row.visible !== 'boolean') || new Set(rows.map((row) => row.id)).size !== rows.length) {
    return authError(res, 422, 'INVALID_VENDOR_SETTINGS', '厂商列表不合法');
  }
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '管理服务暂不可用');
  const result = await db.$transaction(async (tx) => {
    const all = await tx.vendor.findMany();
    const current = canonicalVendors(all);
    if (current.length !== rows.length || current.some((row) => !rows.some((item) => item.id === row.id))) return null;
    const ordered = [...rows.filter((row) => row.visible), ...rows.filter((row) => !row.visible)];
    for (const [index, row] of ordered.entries()) {
      await tx.vendor.updateMany({ where: { id: { in: all.filter((vendor) => canonicalVendorId(vendor.id) === row.id).map((vendor) => vendor.id) } }, data: { visible: row.visible, displayOrder: index + 1 } });
    }
    return canonicalVendors(await tx.vendor.findMany({ select: { id: true, name: true, visible: true, displayOrder: true }, orderBy: [{ visible: 'desc' }, { displayOrder: 'asc' }, { name: 'asc' }] }));
  });
  if (!result) return authError(res, 409, 'VENDOR_LIST_CHANGED', '厂商列表已变化，请刷新后重试');
  res.json({ data: { vendors: result } });
}));

app.patch('/admin/vendors/:id', requireAdmin, async (req, res) => {
  const visible = req.body?.visible;
  const displayOrder = Number(req.body?.displayOrder);
  if (typeof visible !== 'boolean' || !Number.isInteger(displayOrder) || displayOrder < 0) return authError(res, 400, 'INVALID_VENDOR_SETTINGS', '厂商设置不合法');
  const db = await getDb();
  if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '管理服务暂不可用');
  res.json({ data: await db.vendor.update({ where: { id: req.params.id }, data: { visible, displayOrder } }) });
});

app.get('/admin/evaluation', requireAdmin, async (req, res) => {
  const db = await getDb(); if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '管理服务暂不可用');
  await ensureEvaluationPrompts(db);
  const inviteCode = String(req.query.inviteCode || '');
  const runs = await db.evaluationRun.findMany({ where: inviteCode ? { user: { inviteCodeLabel: inviteCode } } : {}, include: { user: { select: { inviteCodeLabel: true } }, results: true, prompt: true, judgment: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  const users = await db.user.findMany({ where: { inviteCodeLabel: { not: null } }, select: { inviteCodeLabel: true }, orderBy: { inviteCodeLabel: 'asc' } });
  res.json({ data: { runs: runs.map(publicEvaluationRun), inviteCodes: [...new Set(users.map((user) => user.inviteCodeLabel))] } });
});

app.get('/admin/evaluation/prompts', requireAdmin, async (req, res) => {
  const db = await getDb(); if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '管理服务暂不可用');
  await ensureEvaluationPrompts(db); res.json({ data: { prompts: await visibleEvaluationPrompts(db) } });
});

app.post('/admin/evaluation/prompts', requireAdmin, async (req, res) => {
  const { type, title, content } = req.body || {}; if (!EVALUATION_TYPES.has(type) || !String(title || '').trim() || !String(content || '').trim()) return authError(res, 422, 'INVALID_EVALUATION_PROMPT', '类型、标题和提示词必填');
  const db = await getDb(); if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '管理服务暂不可用');
  res.status(201).json({ data: await db.evaluationPrompt.create({ data: { type, title: String(title).slice(0, 100), content: String(content).slice(0, 2000), sortOrder: Number(req.body?.sortOrder) || 0 } }) });
});

app.patch('/admin/evaluation/prompts/:id', requireAdmin, async (req, res) => {
  const { type, title, content } = req.body || {};
  if (!['text', 'image'].includes(type) || !String(title || '').trim() || !String(content || '').trim()) return authError(res, 422, 'INVALID_EVALUATION_PROMPT', '类型、场景名称和提示词必填');
  const db = await getDb(); if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '管理服务暂不可用');
  try {
    const prompt = await db.evaluationPrompt.update({ where: { id: req.params.id }, data: { type, title: String(title).trim().slice(0, 100), content: String(content).trim().slice(0, 2000) } });
    res.json({ data: prompt });
  } catch (error) {
    if (error?.code === 'P2025') return authError(res, 404, 'EVALUATION_PROMPT_NOT_FOUND', '提示词不存在');
    throw error;
  }
});

app.post('/admin/evaluation/assets', requireAdmin, async (req, res) => {
  const { promptId, modelId, imageUrl, thumbnailUrl } = req.body || {}; if (!promptId || !isAllowedModel('image', modelId) || !/^https?:\/\//.test(String(imageUrl || ''))) return authError(res, 422, 'INVALID_EVALUATION_ASSET', '提示词、图片模型和图片 URL 必填');
  const db = await getDb(); if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '管理服务暂不可用');
  res.json({ data: await db.evaluationImageAsset.upsert({ where: { promptId_modelId: { promptId, modelId } }, update: { imageUrl, thumbnailUrl: thumbnailUrl || null }, create: { promptId, modelId, imageUrl, thumbnailUrl: thumbnailUrl || null } }) });
});

app.get('/admin/evaluation/config', requireAdmin, async (req, res) => { const db = await getDb(); if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '管理服务暂不可用'); res.json({ data: await evaluationConfig(db) }); });
app.patch('/admin/evaluation/config', requireAdmin, async (req, res) => {
  const textDailyLimit = Number(req.body?.textDailyLimit); const imageDailyLimit = Number(req.body?.imageDailyLimit);
  if (!Number.isInteger(textDailyLimit) || textDailyLimit < 0 || textDailyLimit > 2147483647 || !Number.isInteger(imageDailyLimit) || imageDailyLimit < 0 || imageDailyLimit > 2147483647) return authError(res, 422, 'INVALID_EVALUATION_CONFIG', '配额必须为有效的非负整数');
  const db = await getDb(); if (!db) return authError(res, 503, 'DATABASE_UNAVAILABLE', '管理服务暂不可用');
  res.json({ data: await db.evaluationConfig.upsert({ where: { id: 'default' }, update: { textDailyLimit, imageDailyLimit }, create: { id: 'default', textDailyLimit, imageDailyLimit } }) });
});

app.patch('/admin/knowledge/:id', requireAdmin, asyncHandler(async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['active', 'pending', 'expired'].includes(status)) return authError(res, 400, 'INVALID_STATUS', '无效知识状态');
  const source = await setKnowledgeStatus(req.params.id, status);
  if (!source) return authError(res, 404, 'KNOWLEDGE_NOT_FOUND', '知识来源不存在');
  res.json({ data: source });
}));

app.get('/admin/feedback', requireAdmin, async (req, res) => {
  const db = await getDb();
  if (db) return res.json({
    data: {
      storage: 'database',
      feedback: await db.userFeedback.findMany({
        where: { action: 'dismissed', helpful: false, reason: { not: null } },
        select: { id: true, modelId: true, reason: true, createdAt: true, user: { select: { inviteCodeLabel: true, inviteCodeHash: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    },
  });
  res.json({ data: { storage: 'database_unavailable', feedback: [] } });
});

app.post('/admin/knowledge/ingest', requireAdmin, async (req, res) => {
  const url = String(req.body?.url || '').trim();
  try {
    const trustedUrl = await validateKnowledgeSourceUrl(url);
    const data = await ingestAll([{ url: trustedUrl.toString(), title: String(req.body?.title || trustedUrl.hostname).slice(0, 200), vendor: String(req.body?.vendor || '').slice(0, 100) }]);
    res.status(201).json({ data });
  } catch (err) {
    console.error('Knowledge ingestion failed:', redactSecrets(err?.message));
    res.status(422).json({ error: { code: 'KNOWLEDGE_INGEST_FAILED', message: err.message || '知识入库失败，请确认官方来源地址和嵌入服务可用后重试' } });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled request error:', redactSecrets(err?.message));
  if (err?.type === 'entity.parse.failed') return authError(res, 400, 'INVALID_JSON', '请求必须包含有效 JSON');
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: '请求内容过大' },
    });
  }
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
  });
});

const server = app.listen(PORT, () => {
  console.log(`ModelCompare API server running at http://localhost:${server.address().port}`);
});

startScoreWorker();
