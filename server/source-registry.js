export const VENDOR_SOURCES = [
  ['openai', 'OpenAI', 'https://developers.openai.com/api/docs/pricing', 'official_document'],
  ['anthropic', 'Anthropic', 'https://docs.anthropic.com/en/docs/about-claude/pricing', 'official_document'],
  ['google', 'Google', 'https://ai.google.dev/gemini-api/docs/pricing', 'official_document'],
  ['mistralai', 'Mistral AI', 'https://docs.mistral.ai/inference/pricing', 'official_document'],
  ['x-ai', 'xAI', 'https://docs.x.ai/docs/models', 'official_document'],
  ['cohere', 'Cohere', 'https://docs.cohere.com/docs/models', 'official_document'],
  ['perplexity', 'Perplexity', 'https://docs.perplexity.ai/docs/pricing', 'official_document'],
  ['nvidia', 'NVIDIA', 'https://build.nvidia.com/models', 'official_document'],
  ['qwen', '阿里云百炼 / 通义', 'https://help.aliyun.com/zh/model-studio/billing', 'official_document'],
  ['bytedance', '火山方舟 / 豆包', 'https://www.volcengine.com/docs/82379', 'official_document'],
  ['baidu', '百度千帆 / 文心', 'https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya', 'official_document'],
  ['tencent', '腾讯混元', 'https://cloud.tencent.com/document/product/1729', 'official_document'],
  ['z-ai', '智谱 AI', 'https://bigmodel.cn/pricing', 'official_document'],
  ['moonshotai', 'Kimi', 'https://platform.kimi.com/docs/pricing/chat', 'official_document'],
  ['minimax', 'MiniMax', 'https://platform.minimaxi.com/docs/guides/pricing', 'official_document'],
  ['deepseek', 'DeepSeek', 'https://api-docs.deepseek.com/quick_start/pricing', 'official_document'],
  ['iflytek', '讯飞星火', 'https://www.xfyun.cn/doc/spark/BillingDescription.html', 'official_document'],
  ['typesafe', 'TypeSafe AI', 'https://docs.typesafe.ai/models', 'official_document'],
];

export const OPENROUTER_SOURCE = {
  name: 'OpenRouter public model catalog',
  url: 'https://openrouter.ai/api/v1/models',
  kind: 'aggregator',
  parserKey: 'openrouter-catalog',
};

export const SUPERCLUE_SOURCE = {
  name: 'SuperCLUE public leaderboard',
  url: 'https://www.superclueai.com/homepage',
  kind: 'benchmark',
  parserKey: 'superclue-leaderboard',
};
