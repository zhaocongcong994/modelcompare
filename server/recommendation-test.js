import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuleRecommendation } from './recommendation.js';
import { estimateCost, convertMoney, nonNegative } from './pricing.js';
import { validateExplanations } from './rag.js';
const model = (id, input, output, contextSize = 1000, currency = 'USD') => ({ id, vendorId: 'v', displayName: id, category: '单模态', openSource: '开源', outputModes: ['文本'], contextSize, pricing: { currency }, recommendation: { inputPricePerMillionUsd: input, outputPricePerMillionUsd: output, deployments: ['api'], taskTypes: ['chat'], languages: [] } });
const input = (preferences = {cost:1, context:0, quality:0}, extra = {}) => ({ query: 'test', requirements: { workload: {inputTokens:1000, outputTokens:1000, cacheRatio:0, dailyRequests:10, daysPerMonth:30}, billing:'per_token', budgetCurrency:'USD', modality:'either', openSource:'either', deployment:'either', taskTypes:[], languages:[], ...extra }, preferences, limit:2 });
const recommend = (models, request = input(), eligible) => buildRuleRecommendation(request, {models, source:'fixture', fetchedAt:'2026-10-08'}, (m) => structuredClone(m), eligible);
test('weights govern full workload costs; evaluation label cannot dominate', () => {
  const models = [model('cheap-input', 1, 10, 20000), model('cheap-total', 2, 1, 1000)];
  assert.equal(recommend(models, input(), (id) => id === 'cheap-input').items[0].model.id, 'cheap-total');
  assert.equal(recommend(models, input({cost:0,context:1,quality:0})).items[0].model.id, 'cheap-input');
  assert.equal(recommend(models).items[0].score, 100);
});
test('cache changes complete cost; missing cache is explicit', () => {
  const m = model('m', 10, 0); m.recommendation.cacheReadPricePerMillionUsd = 1;
  assert.equal(estimateCost(m, input().requirements.workload).monthly, 3);
  assert.equal(estimateCost(m, {...input().requirements.workload,cacheRatio:100}).monthly, .3);
  delete m.recommendation.cacheReadPricePerMillionUsd;
  assert.ok(estimateCost(m, {...input().requirements.workload,cacheRatio:100}).cacheAssumption);
});
test('missing quality and cost use a common denominator and nulls', () => {
  const a = model('a', 1, 1, 1000), b = model('b', undefined, undefined, 2000);
  a.recommendation.quality = 999;
  const result = recommend([a,b], input({cost:.5,context:.25,quality:.25}));
  assert.deepEqual(result.effectiveWeights,{cost:0,context:1,quality:0});
  assert.ok(result.items.every((i) => i.scoreBreakdown.cost === null && i.scoreBreakdown.quality === null));
  assert.equal(result.items[0].model.id,'b');
  assert.equal(recommend([a,b], input({quality:1})).items[0].score,null);
});
test('unknown, negative, zero, cross-currency and image budget behavior', () => {
  assert.equal(nonNegative(-1),null); assert.equal(nonNegative(null),null); assert.equal(nonNegative(0),0);
  assert.equal(recommend([model('bad',-1,-1)], input(undefined,{maxMonthlyBudget:0})).items.length,0);
  assert.equal(recommend([model('free',0,0)], input(undefined,{maxMonthlyBudget:0})).items.length,1);
  const image = model('image',null,null,0,'CNY'); image.outputModes=['图像']; image.recommendation.imagePricePerImage=1; image.recommendation.imagePriceCurrency='CNY';
  assert.equal(recommend([image],input(undefined,{billing:'per_image',budgetCurrency:'CNY',maxMonthlyBudget:299})).items.length,0);
  assert.equal(recommend([image],input(undefined,{billing:'per_image',budgetCurrency:'USD',maxMonthlyBudget:1000})).items.length,0);
  assert.equal(convertMoney(7,'CNY','USD',{from:'USD',to:'CNY',rate:7,sourceUrl:'https://source.example/rate',verifiedAt:'2026-10-08'}),1);
  assert.equal(convertMoney(7,'CNY','USD',{from:'USD',to:'CNY',rate:7}),null);
});
test('private deployment needs weights and license; output task filters token/image', () => {
  const m=model('m',1,1); m.recommendation.deployments.push('self_hosted');
  assert.equal(recommend([m],input(undefined,{deployment:'self_hosted'})).items.length,0);
  m.recommendation.deploymentEvidence={weightsUrl:'https://example/weights',licenseUrl:'https://example/license',verifiedAt:'2026-10-08'};
  assert.equal(recommend([m],input(undefined,{deployment:'self_hosted'})).items.length,1);
  assert.equal(recommend([m],input(undefined,{billing:'per_image'})).items.length,0);
});
test('raw scores sort without rounding; snapshots preserve inputs', () => {
  const list=[model('a',1,1,1000),model('b',1,1,1001),model('c',1,1,2000)];
  const request=input({context:1}), result=recommend(list,request);
  assert.equal(result.candidates[1].model.id,'b');
  request.query='changed'; assert.equal(result.inputSnapshot.query,'test');
});
test('AI explains only selected IDs with validated text and references', () => {
  const selected = recommend([model('a',1,1),model('b',2,2)]).items;
  const parsed={items:[...selected].reverse().map((i) => ({id:i.model.id,reasons:['说明'],tradeoffs:['取舍'],references:[`${i.model.id}:0`]}))};
  assert.equal(validateExplanations(parsed,selected,[]).size,2);
  parsed.items[0].id='unknown'; assert.throws(() => validateExplanations(parsed,selected,[]));
});
