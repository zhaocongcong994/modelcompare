// Canonical rates are non-negative; null means unknown, never free.
export const nonNegative = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function ratesFor(model) {
  const facts = model.recommendation || {};
  const currency = model.pricing?.currency || facts.imagePriceCurrency || 'USD';
  const channel = model.pricing?.channel || (model.sourceUrl?.includes('openrouter.ai') ? 'aggregator' : 'direct');
  const verifiedAt = model.pricing?.verifiedAt || model.sourceUpdatedAt || null;
  if (Array.isArray(model.pricing?.rates)) return model.pricing.rates.map((rate) => ({ currency, channel, verifiedAt, ...rate, amount: nonNegative(rate.amount) }));
  return [
    ['input_tokens', 'per_million_tokens', facts.inputPricePerMillionUsd],
    ['output_tokens', 'per_million_tokens', facts.outputPricePerMillionUsd],
    ['cache_read_tokens', 'per_million_tokens', facts.cacheReadPricePerMillionUsd],
    ['image', 'per_image', facts.imagePricePerImage],
  ].map(([metric, unit, amount]) => ({ metric, unit, amount: nonNegative(amount), currency: metric === 'image' ? facts.imagePriceCurrency || currency : currency, channel, verifiedAt }));
}

export function convertMoney(amount, from, to, fx) {
  if (amount === null) return null;
  if (from === to) return amount;
  if (!fx || !/^https:\/\//.test(fx.sourceUrl || '') || !Number.isFinite(Date.parse(fx.verifiedAt)) || !(fx.rate > 0)) return null;
  if (fx.from === from && fx.to === to) return amount * fx.rate;
  if (fx.to === from && fx.from === to) return amount / fx.rate;
  return null;
}

export function estimateCost(model, workload, targetCurrency = 'USD', fx = null) {
  const rates = ratesFor(model);
  const imageModel = model.outputModes?.includes('图像') || rates.some((r) => r.metric === 'image' && r.amount !== null);
  const billing = imageModel ? 'per_image' : 'per_token';
  const metric = (name, unit) => rates.find((r) => r.metric === name && r.unit === unit);
  const input = metric('input_tokens', 'per_million_tokens');
  const output = metric('output_tokens', 'per_million_tokens');
  const image = metric('image', 'per_image');
  const cache = metric('cache_read_tokens', 'per_million_tokens');
  const currency = (imageModel ? image?.currency : input?.currency) || model.pricing?.currency || 'USD';
  let perRequest = null;
  let cacheAssumption = null;
  if (imageModel && image?.amount !== null && image?.amount !== undefined) perRequest = image.amount;
  if (!imageModel && input?.amount !== null && input?.amount !== undefined && output?.amount !== null && output?.amount !== undefined && output.currency === currency) {
    const cachePrice = cache?.amount !== null && cache?.amount !== undefined && cache.currency === currency ? cache.amount : input.amount;
    if (workload.cacheRatio > 0 && cachePrice === input.amount) cacheAssumption = '未核验缓存折扣，缓存输入按标准输入价估算';
    perRequest = (workload.inputTokens * (input.amount * (1 - workload.cacheRatio / 100) + cachePrice * workload.cacheRatio / 100) + workload.outputTokens * output.amount) / 1e6;
  }
  const monthly = perRequest === null ? null : perRequest * workload.dailyRequests * workload.daysPerMonth;
  const comparableMonthly = convertMoney(monthly, currency, targetCurrency, fx);
  return { billing, currency, perRequest, monthly, comparableMonthly, comparisonCurrency: targetCurrency, rates, workload, cacheAssumption,
    status: monthly === null ? 'unknown_price' : comparableMonthly === null ? 'unverified_currency' : 'verified',
    fxSnapshot: currency === targetCurrency ? null : comparableMonthly === null ? null : fx };
}
