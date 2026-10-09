import { getDb } from './db.js';
import { nonNegative } from './pricing.js';
import { canonicalVendorId, canonicalVendors } from './vendor-identity.js';

function asNumber(value) {
  return nonNegative(value) ?? undefined;
}

function formatUsd(value, currency = 'USD') {
  if (!Number.isFinite(value)) return '定价未提供';
  if (value === 0) return `输入 ${currencySymbol(currency)}0 / 1M tokens`;
  return `输入 ${currencySymbol(currency)}${value < 0.01 ? value.toFixed(4) : value.toFixed(2)} / 1M tokens`;
}

function currencySymbol(currency) {
  return currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency} `;
}

function formatPerImage(value, currency) {
  return `${currencySymbol(currency)}${value} / 张`;
}

export async function getPersistedCatalog() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.model.findMany({
    where: { status: 'active' },
    include: {
      vendor: true,
      latestUpdate: true,
      capabilities: true,
      apiRateCards: {
        where: { status: 'active', effectiveTo: null },
        include: { items: true, apiOffering: true },
        orderBy: { verifiedAt: 'desc' },
        take: 10,
      },
    },
    orderBy: [{ vendorId: 'asc' }, { displayName: 'asc' }],
  });
  if (!rows.length) return null;
  const vendorById = new Map(canonicalVendors(await db.vendor.findMany()).map((vendor) => [vendor.id, vendor]));
  const canonicalRows = rows.map((row) => ({ ...row, vendorId: canonicalVendorId(row.vendorId), vendor: vendorById.get(canonicalVendorId(row.vendorId)) }));
  const visibleRows = canonicalRows.filter((row) => row.vendor?.visible);
  const models = visibleRows.map((row) => {
    // Direct vendor pricing always takes precedence over an aggregator card;
    // timestamps resolve ties within the same source class.
    const rateCard = [...row.apiRateCards].sort((a, b) => {
      const rank = (card) => card.apiOffering.channel === 'direct' ? 0 : 1;
      return rank(a) - rank(b) || b.verifiedAt - a.verifiedAt;
    })[0];
    const input = rateCard?.items.find((item) => item.metric === 'input_tokens' && item.unit === 'per_million_tokens');
    const inputPrice = asNumber(input?.amount);
    const output = rateCard?.items.find((item) => item.metric === 'output_tokens' && item.unit === 'per_million_tokens');
    const outputPrice = asNumber(output?.amount);
    const cacheRead = rateCard?.items.find((item) => ['cache_read', 'cache_read_tokens'].includes(item.metric) && item.unit === 'per_million_tokens');
    const cacheReadPrice = asNumber(cacheRead?.amount);
    const image = rateCard?.items.find((item) => item.metric === 'image' && item.unit === 'per_image');
    const imagePrice = asNumber(image?.amount);
    const currency = rateCard?.currency || 'USD';
    return {
      id: row.id,
      vendorId: row.vendorId,
      displayName: row.displayName,
      category: row.category,
      inputModes: Array.isArray(row.inputModes) ? row.inputModes : ['文本'],
      outputModes: Array.isArray(row.outputModes) ? row.outputModes : ['文本'],
      supportsReasoning: row.supportsReasoning,
      contextSize: row.contextSize,
      openSource: row.openSource === '未披露' ? '未知' : (row.openSource || '未知'),
      releaseDate: row.releaseDate?.toISOString().slice(0, 10) || null,
      pricing: {
        summary: Number.isFinite(inputPrice) ? formatUsd(inputPrice, currency) : (Number.isFinite(imagePrice) ? formatPerImage(imagePrice, currency) : '定价未提供'),
        currency, channel: rateCard?.apiOffering?.channel || null, verifiedAt: rateCard?.verifiedAt?.toISOString() || null,
        rates: (rateCard?.items || []).map((item) => ({ amount: nonNegative(item.amount), metric: item.metric === 'cache_read' ? 'cache_read_tokens' : item.metric, unit: item.unit, currency, channel: rateCard.apiOffering.channel, verifiedAt: rateCard.verifiedAt.toISOString(), sourceUrl: rateCard.sourceUrl })),
        items: rateCard?.items.map((item) => ({ label: item.displayName || item.metric, value: asNumber(item.amount) === undefined ? '动态或未知定价' : item.unit === 'per_million_tokens' ? `${currency} ${asNumber(item.amount)} / 1M tokens` : item.unit === 'per_image' ? formatPerImage(asNumber(item.amount), currency) : `${currency} ${asNumber(item.amount)} / ${item.unit}` })) || [],
        notes: ['价格来自已同步数据，详情请以来源页面为准。'],
      },
      sourceUrl: row.sourceUrl,
      updateTitle: row.latestUpdate?.title || '暂无更新说明',
      updateFeature: row.latestUpdate?.feature || row.description || '暂无模型摘要。',
      primaryFeatures: row.description || row.latestUpdate?.feature || '暂无模型摘要。',
      recommendation: {
        taskTypes: row.capabilities.map((capability) => capability.capability),
        languages: [],
        deployments: ['api'], quality: null,
        ...(Number.isFinite(inputPrice) ? { inputPricePerMillionUsd: inputPrice } : {}),
        ...(Number.isFinite(outputPrice) ? { outputPricePerMillionUsd: outputPrice } : {}),
        ...(Number.isFinite(cacheReadPrice) ? { cacheReadPricePerMillionUsd: cacheReadPrice } : {}),
        ...(Number.isFinite(imagePrice) ? { imagePricePerImage: imagePrice, imagePriceCurrency: currency } : {}),
      },
      sourceUpdatedAt: row.lastSyncedAt?.toISOString() || row.updatedAt.toISOString(),
    };
  });
  const vendors = [...new Map(visibleRows.map((row) => [row.vendor.id, { id: row.vendor.id, name: row.vendor.name, displayOrder: row.vendor.displayOrder }])).values()]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'zh-CN'));
  return {
    models,
    vendors,
    byId: new Map(models.map((model) => [model.id, model])),
    vendorById: new Map(vendors.map((vendor) => [vendor.id, vendor])),
    fetchedAt: rows.reduce((latest, row) => !latest || row.lastSyncedAt > latest ? row.lastSyncedAt : latest, null)?.toISOString() || new Date().toISOString(),
    source: 'postgresql',
  };
}
