import { randomUUID } from 'node:crypto';
import { estimateCost } from './pricing.js';
export const CRITERIA_VERSION = 'rules-2026-10-08.1';
const normalize = (v, min, max, inverse = false) => min === max ? 1 : inverse ? 1 - (v - min) / (max - min) : (v - min) / (max - min);

export function constraintFailures(model, input, cost) {
  const r = input.requirements, facts = model.recommendation || {}, failures = [];
  if (r.minContextSize && model.contextSize < r.minContextSize) failures.push(`上下文 ${model.contextSize} 低于 ${r.minContextSize}`);
  if (r.modality !== 'either' && model.category !== r.modality) failures.push(`不满足${r.modality}偏好`);
  if (r.openSource === 'open' && model.openSource !== '开源') failures.push('不满足仅开源偏好');
  if (r.openSource === 'closed' && model.openSource !== '闭源') failures.push('不满足仅闭源偏好');
  if (r.requiresReasoning && !model.supportsReasoning) failures.push('不支持推理');
  if (cost.billing !== r.billing) failures.push('计费类型与任务不一致');
  if (r.deployment === 'self_hosted' && !(facts.deployments?.includes('self_hosted') && /^https:\/\//.test(facts.deploymentEvidence?.weightsUrl || '') && /^https:\/\//.test(facts.deploymentEvidence?.licenseUrl || '') && Number.isFinite(Date.parse(facts.deploymentEvidence?.verifiedAt)))) failures.push('私有部署权重或许可证据不足');
  if (r.deployment === 'api' && !facts.deployments?.includes('api')) failures.push('没有 API 部署证据');
  for (const task of r.taskTypes || []) if (!facts.taskTypes?.includes(task)) failures.push(`缺少 ${task} 任务能力证据`);
  for (const lang of r.languages || []) if (!facts.languages?.includes(lang)) failures.push(`缺少 ${lang} 语言能力证据`);
  if (r.maxMonthlyBudget !== undefined) {
    if (cost.comparableMonthly === null) failures.push('预算不可核验：缺少价格或有来源的汇率');
    else if (cost.comparableMonthly > r.maxMonthlyBudget) failures.push(`月成本 ${cost.comparableMonthly.toFixed(2)} ${r.budgetCurrency} 超出预算`);
  }
  // Unconverted currencies cannot share a cost ranking. Unknown rates of the
  // same currency stay in the pool and disable cost for the entire group.
  if (input.preferences.cost > 0 && cost.monthly !== null && cost.comparableMonthly === null) failures.push('币种不可换算，无法进入当前成本比较组');
  return failures;
}

function comparableQuality(candidates, input) {
  const values = candidates.map(({ model }) => model.recommendation?.qualityEvidence);
  const first = values[0];
  if (!first || !input.requirements.scene || first.task !== input.requirements.scene || !first.scale || !first.version) return null;
  if (!values.every((v) => v && v.task === first.task && v.scale === first.scale && v.version === first.version && Number.isFinite(v.value))) return null;
  return values.map((v) => v.value);
}

export function buildRuleRecommendation(input, catalog, modelToJson, eligible = () => false, fx = null) {
  const excluded = [], seen = new Set(), candidates = [];
  for (const model of catalog.models) {
    const cost = estimateCost(model, input.requirements.workload, input.requirements.budgetCurrency, fx);
    const failures = constraintFailures(model, input, cost);
    if (failures.length) { excluded.push({ modelId: model.id, reasons: failures, reason: failures.join('；') }); continue; }
    const identity = `${model.vendorId}:${model.displayName?.trim().toLowerCase()}`;
    if (seen.has(identity)) { excluded.push({ modelId: model.id, reason: '同厂商同名型号已保留一个目录记录' }); continue; }
    seen.add(identity); candidates.push({ model, cost });
  }
  const qualities = comparableQuality(candidates, input);
  const costs = candidates.map((c) => c.cost.comparableMonthly);
  const contexts = candidates.map((c) => c.model.contextSize);
  const usable = { cost: costs.length > 0 && costs.every((v) => Number.isFinite(v)), context: contexts.length > 0 && contexts.every((v) => Number.isFinite(v) && v > 0), quality: Boolean(qualities) };
  const omittedDimensions = Object.keys(usable).filter((k) => !usable[k] && input.preferences[k] > 0).map((dimension) => ({ dimension, reason: { cost: '候选组缺少完整可比价格', context: '候选组缺少已知上下文长度', quality: '缺少相同场景、量表及版本的共同质量证据' }[dimension] }));
  const effectiveWeights = Object.fromEntries(Object.entries(input.preferences).map(([k, w]) => [k, usable[k] ? w : 0]));
  const denominator = Object.values(effectiveWeights).reduce((a, b) => a + b, 0);
  const items = candidates.map(({ model, cost }, index) => {
    const features = { cost: usable.cost ? normalize(cost.comparableMonthly, Math.min(...costs), Math.max(...costs), true) : null,
      context: usable.context ? normalize(model.contextSize, Math.min(...contexts), Math.max(...contexts)) : null,
      quality: qualities ? normalize(qualities[index], Math.min(...qualities), Math.max(...qualities)) : null };
    const rawScore = denominator ? 100 * Object.entries(effectiveWeights).reduce((sum, [k, w]) => sum + w * (features[k] ?? 0), 0) / denominator : null;
    const evaluationEligible = eligible(model.id), reasons = [], tradeoffs = [];
    if (effectiveWeights.cost > 0) reasons.push(`相同工作负载下月成本 ${cost.comparableMonthly.toFixed(4)} ${cost.comparisonCurrency}`);
    if (effectiveWeights.context > 0) reasons.push(`已知上下文长度 ${model.contextSize.toLocaleString('en-US')}`);
    if (effectiveWeights.quality > 0) reasons.push('质量来自相同场景、量表及版本的证据');
    if (evaluationEligible) reasons.push('可在模型评测模块直接生成对比结果');
    if (!reasons.length) reasons.push('满足已声明的筛选条件；暂无共同可用评分维度');
    tradeoffs.push(...omittedDimensions.map((d) => d.reason));
    if (cost.status !== 'verified') tradeoffs.push(cost.status === 'unknown_price' ? '价格未知，不视为免费' : '币种尚不可核验');
    if (cost.cacheAssumption) tradeoffs.push(cost.cacheAssumption);
    return { model: modelToJson(model, catalog), rawScore, score: rawScore === null ? null : Math.round(rawScore), evaluationEligible,
      costEstimate: cost, scoreBreakdown: features, qualityStatus: qualities ? 'comparable_evidence' : 'unscored', reasons, tradeoffs,
      evidence: [{ field: 'contextSize', value: model.contextSize, sourceUrl: model.sourceUrl, verifiedAt: model.sourceUpdatedAt }, ...cost.rates.filter((r) => r.amount !== null).map((r) => ({ field: r.metric, value: r.amount, ...r, sourceUrl: r.sourceUrl || model.sourceUrl }))] };
  }).sort((a, b) => (b.rawScore ?? -1) - (a.rawScore ?? -1) || Number(b.evaluationEligible) - Number(a.evaluationEligible) || a.model.id.localeCompare(b.model.id));
  items.forEach((item, i) => { item.rank = i + 1; });
  const relaxations = [];
  const r = input.requirements;
  if (r.minContextSize) relaxations.push('降低最小上下文');
  if (r.maxMonthlyBudget !== undefined) relaxations.push('提高月度预算或补充可核验定价');
  if (r.deployment !== 'either') relaxations.push('调整部署方式');
  if (r.taskTypes?.length) relaxations.push('减少任务能力限制');
  if (r.languages?.length) relaxations.push('调整语言要求');
  if (r.modality !== 'either') relaxations.push('调整模态偏好');
  if (r.openSource !== 'either') relaxations.push('调整开源偏好');
  if (r.requiresReasoning) relaxations.push('取消推理硬性要求');
  return { recommendationId: `rec_${randomUUID()}`, generatedAt: new Date().toISOString(), schemaVersion: 2, criteriaVersion: CRITERIA_VERSION,
    inputSnapshot: structuredClone(input), interpretedRequirements: r, requestedWeights: input.preferences,
    effectiveWeights: Object.fromEntries(Object.entries(effectiveWeights).map(([k, w]) => [k, denominator ? w / denominator : 0])), weightNormalizationTotal: denominator, omittedDimensions,
    catalogSnapshot: { source: catalog.source, fetchedAt: catalog.fetchedAt }, comparisonGroup: { billing: r.billing, currency: r.budgetCurrency },
    candidates: items, items: items.slice(0, input.limit), excluded, ...(items.length ? {} : { relaxations: relaxations.length ? relaxations : ['修改筛选条件或补充缺少的证据'] }) };
}
