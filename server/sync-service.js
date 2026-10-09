import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getCatalog } from './catalog.js';
import { getDb } from './db.js';
import { OPENROUTER_SOURCE, SUPERCLUE_SOURCE, VENDOR_SOURCES } from './source-registry.js';

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const dateOrNull = (value) => value ? new Date(value) : null;

async function log(db, input) {
  await db.syncLog.create({ data: input }).catch(() => undefined);
}

export async function bootstrapSources(db) {
  for (const [id, name, url] of VENDOR_SOURCES) {
    await db.vendor.upsert({ where: { id }, update: { name, websiteUrl: url }, create: { id, name, websiteUrl: url } });
    await db.dataSource.updateMany({ where: { vendorId: id, kind: 'official_document', url: { not: url } }, data: { active: false } });
    await db.dataSource.upsert({
      where: { url },
      update: { vendorId: id, name, kind: 'official_document', parserKey: `official-${id}` },
      create: { vendorId: id, name, kind: 'official_document', url, parserKey: `official-${id}` },
    });
  }
  const openRouter = await db.dataSource.upsert({
    where: { url: OPENROUTER_SOURCE.url },
    update: OPENROUTER_SOURCE,
    create: OPENROUTER_SOURCE,
  });
  await db.dataSource.upsert({ where: { url: SUPERCLUE_SOURCE.url }, update: SUPERCLUE_SOURCE, create: SUPERCLUE_SOURCE });
  await db.benchmark.upsert({
    where: { slug: 'superclue' },
    update: { sourceUrl: SUPERCLUE_SOURCE.url },
    create: { slug: 'superclue', name: 'SuperCLUE', provider: 'SuperCLUE', sourceUrl: SUPERCLUE_SOURCE.url, description: '公开中文大模型评测榜单，只读展示。' },
  });
  return openRouter;
}

export async function syncCatalog({ dryRun = false, vendorIds = [] } = {}) {
  const db = await getDb();
  if (!db) throw new Error('PostgreSQL 不可用，无法执行正式同步');
  // Targeted refreshes must not rename or update unrelated vendors.
  const source = vendorIds.length
    ? await db.dataSource.upsert({ where: { url: OPENROUTER_SOURCE.url }, update: OPENROUTER_SOURCE, create: OPENROUTER_SOURCE })
    : await bootstrapSources(db);
  try {
    const latest = await getCatalog({ forceRefresh: true });
    const catalog = vendorIds.length ? {
      ...latest,
      models: latest.models.filter((model) => vendorIds.includes(model.vendorId)),
      vendors: latest.vendors.filter((vendor) => vendorIds.includes(vendor.id)),
    } : latest;
    if (!catalog.models.length) throw new Error('指定厂商没有可同步的模型');
    if (dryRun) return { dryRun: true, models: catalog.models.length, vendors: catalog.vendors.length };
    await db.sourceSnapshot.create({
      data: { dataSourceId: source.id, contentHash: hash(catalog.models), status: 'success', payload: { modelCount: catalog.models.length, fetchedAt: catalog.fetchedAt } },
    });
    let synced = 0;
    for (const vendor of catalog.vendors) {
      await db.vendor.upsert({ where: { id: vendor.id }, update: { name: vendor.name }, create: { id: vendor.id, name: vendor.name } });
    }
    for (const model of catalog.models) {
      await db.model.upsert({
        where: { id: model.id },
        update: { vendorId: model.vendorId, displayName: model.displayName, category: model.category, inputModes: model.inputModes, outputModes: model.outputModes, supportsReasoning: model.supportsReasoning, contextSize: model.contextSize, openSource: model.openSource || '未披露', releaseDate: dateOrNull(model.releaseDate), sourceUrl: model.sourceUrl, description: model.primaryFeatures, status: 'active', lastSyncedAt: new Date() },
        create: { id: model.id, vendorId: model.vendorId, displayName: model.displayName, category: model.category, inputModes: model.inputModes, outputModes: model.outputModes, supportsReasoning: model.supportsReasoning, contextSize: model.contextSize, openSource: model.openSource || '未披露', releaseDate: dateOrNull(model.releaseDate), sourceUrl: model.sourceUrl, description: model.primaryFeatures, lastSyncedAt: new Date() },
      });
      await db.modelUpdate.upsert({ where: { modelId: model.id }, update: { title: model.updateTitle, feature: model.updateFeature, releasedAt: dateOrNull(model.releaseDate) }, create: { modelId: model.id, title: model.updateTitle, feature: model.updateFeature, releasedAt: dateOrNull(model.releaseDate) } });
      for (const capability of model.recommendation.taskTypes) {
        await db.modelCapability.upsert({ where: { modelId_capability: { modelId: model.id, capability } }, update: { evidenceUrl: model.sourceUrl, verifiedAt: new Date() }, create: { modelId: model.id, capability, evidenceUrl: model.sourceUrl, verifiedAt: new Date() } });
      }
      const pricingChannel = model.pricing?.channel || 'aggregator';
      const offeringName = model.pricing?.providerName || 'OpenRouter';
      const offeringBaseUrl = model.pricing?.baseUrl || 'https://openrouter.ai/api/v1';
      const offering = await db.apiOffering.upsert({
        where: { vendorId_name_channel: { vendorId: model.vendorId, name: offeringName, channel: pricingChannel } },
        update: { sourceUrl: model.sourceUrl, baseUrl: offeringBaseUrl },
        create: { vendorId: model.vendorId, name: offeringName, channel: pricingChannel, baseUrl: offeringBaseUrl, sourceUrl: model.sourceUrl },
      });
      await db.apiRateCard.updateMany({ where: { modelId: model.id, apiOfferingId: offering.id, status: 'active' }, data: { status: 'superseded', effectiveTo: new Date() } });
      const rateCard = await db.apiRateCard.create({ data: { modelId: model.id, apiOfferingId: offering.id, currency: model.pricing?.currency || 'USD', sourceUrl: model.sourceUrl, status: 'active' } });
      const input = model.recommendation.inputPricePerMillionUsd;
      const output = model.recommendation.outputPricePerMillionUsd;
      const cacheRead = model.recommendation.cacheReadPricePerMillionUsd;
      if (Number.isFinite(input) && input >= 0) {
        await db.apiRateItem.create({ data: { rateCardId: rateCard.id, metric: 'input_tokens', unit: 'per_million_tokens', amount: input, displayName: '输入' } });
      }
      if (Number.isFinite(output) && output >= 0) {
        await db.apiRateItem.create({ data: { rateCardId: rateCard.id, metric: 'output_tokens', unit: 'per_million_tokens', amount: output, displayName: '输出' } });
      }
      if (Number.isFinite(cacheRead) && cacheRead >= 0) {
        await db.apiRateItem.create({ data: { rateCardId: rateCard.id, metric: 'cache_read_tokens', unit: 'per_million_tokens', amount: cacheRead, displayName: '缓存读取' } });
      }
      await db.fieldEvidence.createMany({ data: [
        { modelId: model.id, dataSourceId: source.id, field: 'contextSize', value: model.contextSize },
        { modelId: model.id, dataSourceId: source.id, field: 'pricing', value: model.pricing },
      ] });
      synced += 1;
    }
    await log(db, { dataSourceId: source.id, syncType: 'catalog', syncStatus: 'success', details: { models: synced } });
    return { models: synced, vendors: catalog.vendors.length };
  } catch (error) {
    await log(db, { dataSourceId: source.id, syncType: 'catalog', syncStatus: 'api_error', errorMessage: error.message });
    throw error;
  }
}

export async function syncOfficialSourceSnapshots({ dryRun = false } = {}) {
  const db = await getDb();
  if (!db) throw new Error('PostgreSQL 不可用，无法执行正式同步');
  await bootstrapSources(db);
  const sources = await db.dataSource.findMany({ where: { kind: { in: ['official_document', 'benchmark'] }, active: true } });
  const results = await Promise.all(sources.map(async (source) => {
    if (dryRun) return { url: source.url, status: 'dry_run' };
    try {
      const response = await fetch(source.url, { headers: { 'User-Agent': 'ModelCompare/1.0 source-audit' }, signal: AbortSignal.timeout(20_000) });
      const body = await response.text();
      const status = response.ok ? 'success' : 'api_error';
      await db.sourceSnapshot.create({ data: { dataSourceId: source.id, contentHash: hash(body), httpStatus: response.status, status, payload: { bytes: body.length } } });
      await log(db, { dataSourceId: source.id, vendorId: source.vendorId, syncType: source.kind === 'benchmark' ? 'benchmark_snapshot' : 'official_source_snapshot', syncStatus: status, httpStatus: response.status });
      return { url: source.url, status, httpStatus: response.status };
    } catch (error) {
      await log(db, { dataSourceId: source.id, vendorId: source.vendorId, syncType: 'official_source_snapshot', syncStatus: 'api_error', errorMessage: error.message });
      return { url: source.url, status: 'api_error' };
    }
  }));
  return results;
}

// SuperCLUE does not publish a stable public results API. A reviewed export is
// therefore ingested separately, retaining its leaderboard URL as provenance.
export async function syncSuperclueResults({ dryRun = false } = {}) {
  const db = await getDb();
  if (!db) throw new Error('PostgreSQL 不可用，无法执行正式同步');
  await bootstrapSources(db);
  const filePath = process.env.SUPERCLUE_RESULTS_FILE || path.join(process.cwd(), 'data', 'superclue-results.json');
  let payload;
  try {
    payload = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { imported: 0, status: 'no_reviewed_export' };
    throw error;
  }
  if (!Array.isArray(payload.runs)) throw new Error('SuperCLUE 导入文件需要包含 runs 数组');
  if (dryRun) return { dryRun: true, runs: payload.runs.length };
  const benchmark = await db.benchmark.findUniqueOrThrow({ where: { slug: 'superclue' } });
  let imported = 0;
  for (const item of payload.runs) {
    if (!item.category || !item.evaluatedAt || !item.sourceUrl || !Array.isArray(item.results)) throw new Error('SuperCLUE run 缺少必填字段');
    const run = await db.benchmarkRun.upsert({
      where: { benchmarkId_category_evaluatedAt: { benchmarkId: benchmark.id, category: item.category, evaluatedAt: new Date(item.evaluatedAt) } },
      update: { sourceUrl: item.sourceUrl, verifiedAt: new Date() },
      create: { benchmarkId: benchmark.id, category: item.category, evaluatedAt: new Date(item.evaluatedAt), sourceUrl: item.sourceUrl },
    });
    for (const result of item.results) {
      const exists = await db.model.findUnique({ where: { id: result.modelId }, select: { id: true } });
      if (!exists) continue;
      await db.benchmarkResult.upsert({
        where: { benchmarkRunId_modelId: { benchmarkRunId: run.id, modelId: result.modelId } },
        update: { rank: result.rank ?? null, totalScore: result.totalScore ?? null, dimensionScores: result.dimensionScores ?? undefined, sourceUrl: item.sourceUrl },
        create: { benchmarkRunId: run.id, modelId: result.modelId, rank: result.rank ?? null, totalScore: result.totalScore ?? null, dimensionScores: result.dimensionScores ?? undefined, sourceUrl: item.sourceUrl },
      });
      imported += 1;
    }
  }
  return { imported, status: 'success' };
}

export async function runSync({ dryRun = false, includeSources = true } = {}) {
  const catalog = await syncCatalog({ dryRun });
  const sources = includeSources ? await syncOfficialSourceSnapshots({ dryRun }) : [];
  const superclue = await syncSuperclueResults({ dryRun });
  return { catalog, sources, superclue };
}
