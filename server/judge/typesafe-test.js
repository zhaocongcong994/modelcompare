import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJudgeInput, validateJudgeResponse, requestJudge, JEV_MODEL } from './typesafe.js';
import { agreement, validationReport } from './validation.js';
import { jevApiKey } from './credentials.js';
test('Jev credentials accept existing local aliases and prefer the canonical key', () => {
  assert.equal(jevApiKey({}), '');
  assert.equal(jevApiKey({jev_key:' local-key '}), 'local-key');
  assert.equal(jevApiKey({JEV_KEY:' upper-key '}), 'upper-key');
  assert.equal(jevApiKey({TYPESAFE_API_KEY:' canonical ',jev_key:'local-key'}), 'canonical');
  assert.equal(jevApiKey({TYPESAFE_API_KEY:' ',jev_key:'local-key'}), 'local-key');
});
const input = () => buildJudgeInput({task:'介绍产品',reference:'只有网页端',answers:['答案甲','答案乙'],scene:'product'});
const response = (request = input()) => ({model:JEV_MODEL,answers:Object.fromEntries(Object.keys(request.payload.questions).map((id) => [id,{type:'score',score:id.startsWith('a_')?2:0,confidence:1,probabilities:id.startsWith('a_')?{'0':0,'1':0,'2':1}:{'0':1,'1':0,'2':0}}])),usage:{input_tokens:100,output_tokens:20}});
test('anonymized ordinal rubrics, versions and response validation', () => {
  const req=input(), data=response(req), result=validateJudgeResponse(data,req);
  assert.equal(result.decision,'a'); assert.equal(result.results.a.score,100); assert.ok(req.reservedCostUsd>0);
  assert.equal(Object.keys(req.payload.questions).length,8);
  data.answers.a_coverage.confidence=.1;
  assert.equal(validateJudgeResponse(data,req).decision,'abstain');
  data.answers.a_coverage.probabilities['2']=.5;
  assert.throws(() => validateJudgeResponse(data,req));
});
test('invalid version, usage, missing answers, empty/oversized input rejected', () => {
  for (const mutate of [d=>d.model='jev-latest',d=>d.usage.input_tokens=-1,d=>delete d.answers.a_coverage,d=>d.answers.a_coverage.score=3]) {const d=response();mutate(d);assert.throws(()=>validateJudgeResponse(d,input()));}
  assert.throws(()=>buildJudgeInput({task:'x',answers:['','b'],scene:'product'}));
  assert.throws(()=>buildJudgeInput({task:'x'.repeat(33000),answers:['a','b'],scene:'product'}));
});
test('429 bounded retries, auth single attempt, uncertain delivery no retry', async () => {
  process.env.TYPESAFE_API_KEY='fixture'; let calls=0;
  const r=await requestJudge(input(),{fetchImpl:async()=> ++calls<3 ? new Response('{}',{status:429,headers:{'retry-after':'0'}}) : Response.json(response()),sleep:async()=>{}});
  assert.equal(calls,3); assert.equal(r.decision,'a');
  calls=0;await assert.rejects(requestJudge(input(),{fetchImpl:async()=>{calls++;return new Response('{}',{status:401});}}),{code:'SCORE_AUTH_FAILED'});assert.equal(calls,1);
  calls=0;await assert.rejects(requestJudge(input(),{fetchImpl:async()=>{calls++;throw new Error('timeout');}}),{code:'SCORE_DELIVERY_UNCERTAIN'});assert.equal(calls,1);
});
test('validation cannot pass with no human labels or real results', () => {
  const report=validationReport([{id:'1',split:'validation',scene:'product'}],[],[]);
  assert.equal(report.rankingApproved,false);assert.equal(report.preliminaryThresholdsMet,false);assert.equal(report.judgeAgreement.agreement,null);
  assert.equal(agreement([['a','a'],['b','b'],['a','b'],['b','a']]).kappa,0);
});
