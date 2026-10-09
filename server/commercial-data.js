import { getDb } from './db.js';
import { nonNegative } from './pricing.js';

const asNumber = (value) => value === null || value === undefined ? null : Number(value);

export async function getCommercialData(modelIds) {
  const db = await getDb();
  if (!db || !modelIds.length) return new Map();
  const models = await db.model.findMany({
    where: { id: { in: modelIds } },
    include: {
      vendor: { include: { dataSources: { where: { active: true, kind: 'official_document' }, select: { name: true, url: true } } } },
      apiRateCards: { where: { status: 'active', effectiveTo: null }, include: { apiOffering: true, items: true }, orderBy: { verifiedAt: 'desc' } },
      entitlements: { include: { subscriptionPlan: true } },
      benchmarkScores: { include: { benchmarkRun: { include: { benchmark: true } } } },
    },
  });
  return new Map(models.map((model) => {
    const cards = model.apiRateCards.sort((a, b) => {
      const rank = (card) => card.apiOffering.channel === 'direct' ? 0 : 1;
      return rank(a) - rank(b) || b.verifiedAt - a.verifiedAt;
    }).map((card) => ({
      offering: card.apiOffering.name,
      channel: card.apiOffering.channel,
      currency: card.currency,
      sourceUrl: card.sourceUrl,
      verifiedAt: card.verifiedAt.toISOString(),
      items: card.items.map((item) => ({ metric: item.metric, unit: item.unit, amount: nonNegative(item.amount), label: item.displayName || item.metric })),
    }));
    const subscriptions = model.entitlements.map(({ subscriptionPlan: plan, accessLevel }) => ({
      name: plan.name, billingPeriod: plan.billingPeriod, currency: plan.currency, amount: nonNegative(plan.amount), region: plan.region, benefits: plan.benefits, accessLevel, sourceUrl: plan.sourceUrl, verifiedAt: plan.verifiedAt.toISOString(),
    }));
    const benchmarks = model.benchmarkScores
      .filter((score) => score.benchmarkRun.benchmark.provider === 'SuperCLUE')
      .sort((a, b) => b.benchmarkRun.evaluatedAt - a.benchmarkRun.evaluatedAt)
      .map((score) => ({ provider: 'SuperCLUE', benchmark: score.benchmarkRun.benchmark.name, category: score.benchmarkRun.category, evaluatedAt: score.benchmarkRun.evaluatedAt.toISOString(), rank: score.rank, totalScore: asNumber(score.totalScore), dimensionScores: score.dimensionScores, sourceUrl: score.sourceUrl }));
    const officialSources = model.vendor.dataSources.map((source) => ({ name: source.name, sourceUrl: source.url }));
    return [model.id, { apiPricing: cards, subscriptions, benchmarks, officialSources }];
  }));
}
