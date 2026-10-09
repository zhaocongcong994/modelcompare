const TEXT_MODELS = new Set([
  'minimax/minimax-m3', 'minimax/minimax-m2.7', 'minimax/minimax-m2.5',
]);
const IMAGE_MODELS = new Set([
  // MiniMax image models use the image_generation endpoint. MiniMax-M3 is a
  // text model and must remain in TEXT_MODELS for Agent/recommendation work.
  'minimax/image-01',
  'minimax/image-01-live',
  // Doubao's Seedream 4.x runs on Volcengine Ark's OpenAI-compatible images/generations API.
  // 4.0 accepts the "1K" preset; 4.5 requires explicit pixel sizes (see doubaoImage).
  'doubao/doubao-seedream-4-0-20260415',
  'doubao/doubao-seedream-4-5-251128',
]);
export const EVALUATION_TYPES = new Set(['text', 'image', 'video', 'voice']);
export { PROMPT_SEEDS } from './prompts/evaluation-presets.js';

export function isAllowedModel(type, modelId) {
  // OpenRouter appends a dated release suffix to the current DeepSeek V4
  // catalogue entries. Accept the current text-only Flash / Pro releases,
  // but deliberately exclude the Vision experimental variant from text evals.
  const isDeepSeekV4Text = /^deepseek\/deepseek-v4-(?:flash|pro)(?:-\d+)?$/.test(modelId);
  if (type === 'text') return TEXT_MODELS.has(modelId) || isDeepSeekV4Text;
  return (type === 'image' ? IMAGE_MODELS : new Set()).has(modelId);
}

export function evaluationAvailability(env = process.env) {
  return Object.fromEntries([
    ['minimax', 'MiniMax', 'MINIMAX_API_KEY'],
    ['deepseek', 'DeepSeek', 'DEEPSEEK_API_KEY'],
    ['doubao', '豆包', 'DOUBAO_API_KEY'],
  ].map(([id, name, key]) => {
    const freeOnly = env.MODEL_COMPARE_GENERATION_MODE === 'free_only';
    const available = !freeOnly && Boolean(env[key]?.trim());
    return [id, { available, code: available ? null : freeOnly ? 'EVALUATION_FREE_CREDIT_NOT_VERIFIED' : 'EVALUATION_PROVIDER_NOT_CONFIGURED', message: available ? '' : freeOnly ? `当前仅使用免费额度，尚未核实 ${name} 免费额度，生成评测暂未开放。` : `${name} 评测服务未配置，请联系管理员检查该厂商的凭据。` }];
  }));
}
export function requireEvaluationProvider(modelId) {
  const status = evaluationAvailability()[modelId.split('/')[0]];
  if (!status?.available) throw Object.assign(new Error(status?.message || '该模型评测服务不可用'), { code: status?.code || 'EVALUATION_PROVIDER_NOT_CONFIGURED' });
}

function finalInstruction(prompt) {
  return `${prompt}\n\n请直接输出最终答案。最终输出必须包含标点在内不超过 1000 个中文字符。`;
}

async function chatCompletions(baseUrl, apiKey, model, prompt) {
  if (!apiKey) throw new Error('该厂商的评测 API 尚未配置');
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: '你是严格遵循字数限制的中文生成助手。' }, { role: 'user', content: finalInstruction(prompt) }], thinking: { type: 'disabled' }, max_tokens: 1200 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`模型服务调用失败（${response.status}）`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型未返回有效文本');
  return content.slice(0, 1000);
}

async function miniMax(model, prompt) {
  if (!process.env.MINIMAX_API_KEY) throw new Error('MiniMax 评测 API 尚未配置');
  const response = await fetch('https://api.minimaxi.com/v1/text/chatcompletion_v2', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', name: 'system', content: '你是严格遵循字数限制的中文生成助手。' }, { role: 'user', name: 'user', content: finalInstruction(prompt) }] }), signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`MiniMax 服务调用失败（${response.status}）`);
  const data = await response.json();
  return String(data.choices?.[0]?.message?.content || '').slice(0, 1000);
}

export async function generateText(modelId, prompt) {
  if (!isAllowedModel('text', modelId)) throw new Error('不支持的文本模型');
  requireEvaluationProvider(modelId);
  // Catalog release IDs (e.g. deepseek-v4-pro-0813) are not provider API IDs.
  // DeepSeek exposes the current release under the stable Flash / Pro names.
  if (modelId.startsWith('deepseek/')) return chatCompletions(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', process.env.DEEPSEEK_API_KEY, modelId.split('/')[1].replace(/-\d+$/, ''), prompt);
  if (modelId.startsWith('minimax/')) return miniMax(modelId.split('/')[1].replace('minimax-', 'MiniMax-').replace('m', 'M'), prompt);
  throw new Error('不支持的文本模型');
}

// MiniMax's text-to-image contract: /v1/image_generation, one 1K image per model.
async function miniMaxImage(model, prompt) {
  if (!process.env.MINIMAX_API_KEY) throw new Error('MiniMax 生图 API 尚未配置');
  const base = process.env.MINIMAX_IMAGE_BASE_URL || 'https://api.minimax.cn/v1';
  const response = await fetch(`${base.replace(/\/$/, '')}/image_generation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, aspect_ratio: '1:1', response_format: 'url', n: 1, prompt_optimizer: false }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`MiniMax 生图服务调用失败（${response.status}）`);
  const data = await response.json();
  if (data.base_resp?.status_code !== 0) throw new Error('MiniMax 生图失败，请检查服务配置或稍后重试');
  const imageUrl = data.data?.image_urls?.[0];
  if (typeof imageUrl !== 'string' || !/^https:\/\//.test(imageUrl)) throw new Error('MiniMax 未返回有效图片');
  return imageUrl;
}

// Doubao's Seedream contract: Volcengine Ark /api/v3/images/generations returning a URL.
async function doubaoImage(model, prompt) {
  if (!process.env.DOUBAO_API_KEY) throw new Error('豆包生图 API 尚未配置');
  const base = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const response = await fetch(`${base.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.DOUBAO_API_KEY}`, 'Content-Type': 'application/json' },
    // Seedream 4.5 rejects Ark's "1K" preset and requires explicit pixel dimensions.
    body: JSON.stringify({ model, prompt, size: model.startsWith('doubao-seedream-4-5') ? '2048x2048' : '1K', response_format: 'url', watermark: false }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`豆包生图服务调用失败（${response.status}）`);
  const data = await response.json();
  const imageUrl = data.data?.[0]?.url;
  if (typeof imageUrl !== 'string' || !/^https:\/\//.test(imageUrl)) throw new Error('豆包未返回有效图片');
  return imageUrl;
}

export async function generateImage(modelId, prompt) {
  if (!isAllowedModel('image', modelId)) throw new Error('不支持的图片模型');
  requireEvaluationProvider(modelId);
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1500) throw new Error('生图提示词须为 1–1500 个字符');
  if (modelId.startsWith('doubao/')) return doubaoImage(modelId.split('/')[1], prompt);
  return miniMaxImage(modelId.split('/')[1], prompt);
}
