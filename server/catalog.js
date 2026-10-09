import { ratesFor } from './pricing.js';
const OPENROUTER_MODELS_URL = process.env.MODEL_CATALOG_URL || 'https://openrouter.ai/api/v1/models';
const CATALOG_TTL_MS = Number(process.env.CATALOG_TTL_MS || 6 * 60 * 60 * 1000);
const MAX_MODELS_PER_VENDOR = Number(process.env.MAX_MODELS_PER_VENDOR || 8);
const DEFAULT_VENDORS = [
  'openai', 'anthropic', 'google', 'deepseek', 'moonshotai', 'qwen', 'meta-llama', 'x-ai',
  'bytedance', 'tencent', 'minimax', 'xiaomi', 'z-ai', 'perplexity', 'nvidia', 'typesafe',
];
const VENDOR_NAMES = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', deepseek: 'DeepSeek', moonshotai: 'Moonshot AI',
  qwen: 'Qwen', mistralai: 'Mistral AI', 'meta-llama': 'Meta Llama', 'x-ai': 'xAI',
  baidu: '百度千帆 / 文心', bytedance: '火山方舟 / 豆包',
  tencent: '腾讯混元', minimax: 'MiniMax', stepfun: '阶跃星辰', xiaomi: '小米 MiMo',
  'z-ai': '智谱 AI', meituan: '美团 LongCat', perplexity: 'Perplexity', nvidia: 'NVIDIA',
  iflytek: '讯飞星火', typesafe: 'TypeSafe AI',
};

const OPEN_WEIGHT_VENDORS = new Set(['deepseek', 'qwen', 'meta-llama']);
const CLOSED_VENDORS = new Set(['openai', 'anthropic', 'google', 'x-ai', 'moonshotai', 'baidu', 'bytedance', 'bytedance-seed', 'tencent', 'minimax', 'stepfun', 'xiaomi', 'meituan', 'perplexity', 'nvidia', 'typesafe']);

// OpenRouter 尚未覆盖的型号直接采用厂商官方模型/计费文档。
// 未披露价格时，不做推测，页面会明确显示“定价未提供”并链接回官方资料。
const OFFICIAL_ONLY_MODELS = [
  ...[
    ['iflytek/spark-x1', '讯飞星火 X1', '推理', 128000],
    ['iflytek/spark-x1-turbo', '讯飞星火 X1 Turbo', '推理', 128000],
    ['iflytek/spark-4-ultra', '讯飞星火 4.0 Ultra', '多模态', 128000],
    ['iflytek/spark-4-pro', '讯飞星火 4.0 Pro', '多模态', 128000],
    ['iflytek/spark-max', '讯飞星火 Max', '文本', 128000],
    ['iflytek/spark-lite', '讯飞星火 Lite', '文本', 128000],
  ].map(([id, displayName, category, contextSize]) => ({
    id, vendorId: 'iflytek', displayName, category, contextSize, openSource: '闭源', releaseDate: null,
    pricing: { summary: '定价未提供', currency: 'CNY', items: [], notes: ['型号来自讯飞星火官方文档；实际计费请以控制台为准。'] },
    sourceUrl: 'https://www.xfyun.cn/doc/spark/BillingDescription.html',
    updateTitle: '讯飞星火官方型号目录', updateFeature: '通过讯飞开放平台 API 提供服务。',
    recommendation: { taskTypes: ['chat'], languages: [], deployments: ['api'] }, sourceUpdatedAt: new Date().toISOString(),
  })),
  {
    id: 'typesafe/jev-1.13.0', vendorId: 'typesafe', displayName: 'Jev 1.13', category: '单模态',
    inputModes: ['文本'], outputModes: ['结构化决策'], supportsReasoning: false,
    contextSize: 64000, openSource: '闭源', releaseDate: '2026-09-15',
    pricing: {
      summary: '输入 $0.042 / 1M tokens', currency: 'USD',
      items: [
        { label: '输入', value: '$0.042 / 1M tokens' },
        { label: '输出', value: '$0 / 1M tokens' },
      ],
      notes: ['价格来自 TypeSafe 官方文档：仅按输入 token 计费，输出 token 免费。'],
      channel: 'direct', providerName: 'TypeSafe AI', baseUrl: 'https://api.typesafe.ai/v1',
    },
    sourceUrl: 'https://docs.typesafe.ai/models',
    updateTitle: 'Jev 1.13',
    updateFeature: 'System One 结构化决策模型：针对状态和类型化问题返回选择、评分或真假判断及概率/置信度；不生成自由文本。',
    primaryFeatures: 'System One 结构化决策模型：针对状态和类型化问题返回选择、评分或真假判断及概率/置信度；不生成自由文本。',
    recommendation: {
      taskTypes: [], languages: ['en'], deployments: ['api'],
      inputPricePerMillionUsd: 0.042, outputPricePerMillionUsd: 0,
    },
    sourceUpdatedAt: new Date().toISOString(),
  },
];

function cleanDisplayName(value) {
  return String(value || '')
    .replace(/^[^:]+:\s*/, '')
    // 厂商用四位月日标识同一模型的更新批次，例如 “DeepSeek V4 Pro 0813”。
    .replace(/(?:\s|[-_])(20\d{6}|\d{4})$/, '')
    .trim();
}

// OpenRouter may expose dated releases under separate IDs. The product removes
// that date suffix from the displayed name, so keep only the newest visible
// release of each vendor/model pair.
function modelIdentity(model) {
  return `${model.vendorId}:${String(model.displayName || '').trim().toLocaleLowerCase('en-US')}`;
}

function openSourceFor(vendorId) {
  if (OPEN_WEIGHT_VENDORS.has(vendorId)) return '开源';
  if (CLOSED_VENDORS.has(vendorId)) return '闭源';
  return '未披露';
}

function canonicalVendorId(vendorId) {
  // OpenRouter 将字节跳动模型拆成 bytedance / bytedance-seed 两个发布者标识；
  // 产品展示和本地数据层统一归入“火山方舟 / 豆包”。
  return ['bytedance-seed', 'volcengine'].includes(vendorId) ? 'bytedance' : vendorId;
}

let snapshot = null;
let refreshPromise = null;

function configuredVendors() {
  return (process.env.CATALOG_VENDORS || DEFAULT_VENDORS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function formatUsd(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function pricePerMillion(value) {
  const parsed = value === null || value === undefined || value === '' ? NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : undefined;
}

function categoryFor(model) {
  const modalities = new Set([
    ...(model.architecture?.input_modalities || []),
    ...(model.architecture?.output_modalities || []),
  ]);
  return ['image', 'audio', 'video', 'file'].some((type) => modalities.has(type)) ? '多模态' : '单模态';
}

function displayModes(modes) {
  const labels = { text: '文本', image: '图像', audio: '音频', video: '视频', file: '文件' };
  return [...new Set(modes || [])].map((mode) => labels[mode] || mode);
}

function capabilitiesFor(model) {
  const sourceText = `${model.name || ''} ${model.description || ''}`.toLowerCase();
  const input = new Set(model.architecture?.input_modalities || []);
  const output = new Set(model.architecture?.output_modalities || []);
  const parameters = new Set(model.supported_parameters || []);
  const taskTypes = new Set();
  if (input.has('text') && output.has('text')) taskTypes.add('chat');
  if (input.has('image') || input.has('video') || input.has('file')) taskTypes.add('vision');
  if (input.has('audio') || output.has('audio')) taskTypes.add('voice');
  if (parameters.has('tools') || parameters.has('web_search_options')) taskTypes.add('retrieval');
  if (parameters.has('reasoning') || /\breasoning\b|推理/.test(sourceText)) taskTypes.add('reasoning');
  if (/\bcod(?:e|ing)\b|software engineering|programming/.test(sourceText)) taskTypes.add('code');

  return {
    taskTypes: [...taskTypes],
    // OpenRouter 的目录元数据不提供逐模型语言验证；不伪造语言能力。
    languages: [],
    deployments: ['api'],
    quality: null, // Public benchmark metadata is not a verified scene-specific quality snapshot.
    inputPricePerMillionUsd: pricePerMillion(model.pricing?.prompt),
    outputPricePerMillionUsd: pricePerMillion(model.pricing?.completion),
    cacheReadPricePerMillionUsd: pricePerMillion(model.pricing?.input_cache_read),
  };
}

function toCatalogModel(model) {
  const [rawVendorId] = model.id.split('/');
  const vendorId = canonicalVendorId(rawVendorId);
  const inputPrice = pricePerMillion(model.pricing?.prompt);
  const outputPrice = pricePerMillion(model.pricing?.completion);
  const cacheReadPrice = pricePerMillion(model.pricing?.input_cache_read);
  const releaseDate = Number.isFinite(Number(model.created))
    ? new Date(Number(model.created) * 1000).toISOString().slice(0, 10)
    : null;
  const displayName = cleanDisplayName(model.name || model.id);
  const description = String(model.description || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[\*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const pricingItems = [
    Number.isFinite(inputPrice) && { label: '输入', value: `${formatUsd(inputPrice)} / 1M tokens` },
    Number.isFinite(outputPrice) && { label: '输出', value: `${formatUsd(outputPrice)} / 1M tokens` },
    Number.isFinite(cacheReadPrice) && { label: '缓存读取', value: `${formatUsd(cacheReadPrice)} / 1M tokens` },
  ].filter(Boolean);

  return {
    id: model.id,
    vendorId,
    displayName,
    category: categoryFor(model),
    inputModes: displayModes(model.architecture?.input_modalities),
    outputModes: displayModes(model.architecture?.output_modalities),
    supportsReasoning: (model.supported_parameters || []).includes('reasoning') || /\breasoning\b|推理/i.test(`${model.name || ''} ${model.description || ''}`),
    primaryFeatures: description || '来源未提供模型摘要。',
    contextSize: Number(model.context_length) || 0,
    openSource: openSourceFor(vendorId),
    releaseDate,
    pricing: {
      summary: Number.isFinite(inputPrice) ? `输入 ${formatUsd(inputPrice)} / 1M tokens` : '定价未提供',
      currency: 'USD',
      items: pricingItems,
      notes: ['价格与可用性由 OpenRouter 公开模型目录实时同步；实际计费以所选路由与厂商账单为准。'],
    },
    sourceUrl: `https://openrouter.ai/models/${model.id}`,
    updateTitle: '公开目录模型信息',
    updateFeature: description || '来源未提供模型摘要。',
    recommendation: {
      ...capabilitiesFor(model),
      // An API listing alone does not verify redistributable weights or a license.
      deployments: ['api'],
    },
    sourceUpdatedAt: new Date().toISOString(),
  };
}

function buildCatalog(rawModels) {
  const permittedVendors = new Set(configuredVendors());
  const perVendor = new Map();
  for (const raw of rawModels) {
    if (!raw?.id || raw.id.includes(':') || raw.expiration_date) continue;
    const [rawVendorId] = raw.id.split('/');
    const vendorId = canonicalVendorId(rawVendorId);
    if (!permittedVendors.has(vendorId)) continue;
    const list = perVendor.get(vendorId) || [];
    list.push(raw);
    perVendor.set(vendorId, list);
  }

  const models = [...perVendor.entries()]
    .flatMap(([vendorId, entries]) => {
      const seen = new Set();
      return entries
        .sort((a, b) => Number(b.created || 0) - Number(a.created || 0))
        .map(toCatalogModel)
        .filter((model) => {
          const identity = modelIdentity(model);
          if (seen.has(identity)) return false;
          seen.add(identity);
          return true;
        })
        .slice(0, MAX_MODELS_PER_VENDOR);
    })
    .concat(OFFICIAL_ONLY_MODELS)
    .sort((a, b) => (Date.parse(b.releaseDate || '') || 0) - (Date.parse(a.releaseDate || '') || 0) || a.displayName.localeCompare(b.displayName));
  const vendorIds = [...new Set(models.map((model) => model.vendorId))];
  const vendors = vendorIds.map((id) => ({ id, name: VENDOR_NAMES[id] || id }));
  const byId = new Map(models.map((model) => [model.id, model]));
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));

  for (const model of models) model.pricing.rates = ratesFor(model);
  return { models, vendors, byId, vendorById };
}

async function refreshCatalog() {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'ModelCompare/1.0 catalog-sync' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`模型目录源返回 HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error('模型目录源返回格式无效');
  const catalog = buildCatalog(payload.data);
  if (!catalog.models.length) throw new Error('模型目录源未返回可展示的模型');
  snapshot = { ...catalog, fetchedAt: new Date().toISOString(), source: OPENROUTER_MODELS_URL };
  return snapshot;
}

export async function getCatalog({ forceRefresh = false } = {}) {
  const fresh = snapshot && Date.now() - Date.parse(snapshot.fetchedAt) < CATALOG_TTL_MS;
  if (!forceRefresh && fresh) return snapshot;
  if (!refreshPromise) {
    refreshPromise = refreshCatalog().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function getCatalogStatus() {
  const catalog = await getCatalog();
  return {
    source: catalog.source,
    fetchedAt: catalog.fetchedAt,
    modelCount: catalog.models.length,
    vendorCount: catalog.vendors.length,
    cacheTtlSeconds: Math.round(CATALOG_TTL_MS / 1000),
  };
}

export function formatNumber(num) {
  if (num >= 1_000_000) return `${Math.round(num / 1_000_000)}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}K`;
  return String(num || 0);
}
