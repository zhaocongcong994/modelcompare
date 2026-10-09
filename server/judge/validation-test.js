import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectDataset, sampleFingerprint, mergeRaterLabels, validationInput } from './dataset.js';
import { validationReport, runValidation } from './validation.js';
import { JEV_MODEL } from './typesafe.js';
import { RUBRIC_VERSION } from './rubrics.js';
const sample=(id,scene='product')=>({id,groupId:id,datasetVersion:'fixture.1',split:'validation',scene,task:`任务${id}`,reference:'参考',a:`答案甲${id}`,b:`答案乙${id}`});
const samples=['product','support','marketing'].map((scene,i)=>sample(String(i),scene));
const labels=samples.map(s=>({id:s.id,sampleHash:sampleFingerprint(s),datasetVersion:s.datasetVersion,rater1:'a',rater2:'a',rater1Id:'first',rater2Id:'second'}));
const record=(s,variant)=>({id:s.id,variant,status:'succeeded',sampleHash:sampleFingerprint(s),inputHash:validationInput(s,variant).inputHash,result:{model:JEV_MODEL,rubricVersion:RUBRIC_VERSION,scene:s.scene,decision:variant==='swapped'?'b':'a',costUsd:.00001,results:{a:{score:90,dimensions:[{confidence:.9}]},b:{score:10,dimensions:[{confidence:.9}]}}}});
test('report cannot pass with failed originals, missing repetitions, stale hashes/versions, or same rater',()=>{
 const all=samples.flatMap(s=>['original','repeat','swapped'].map(v=>record(s,v)));
 assert.equal(validationReport(samples,all,labels).preliminaryThresholdsMet,true);
 assert.equal(validationReport(samples,all.filter(r=>r.variant==='original'),labels).preliminaryThresholdsMet,false);
 const failed=structuredClone(all);failed[0].status='failed';assert.equal(validationReport(samples,failed,labels).resultCoverage.complete,false);
 const stale=structuredClone(all);stale[0].inputHash='old';assert.equal(validationReport(samples,stale,labels).preliminaryThresholdsMet,false);
 const old=structuredClone(all);old[0].result.rubricVersion='old';assert.equal(validationReport(samples,old,labels).preliminaryThresholdsMet,false);
 assert.equal(validationReport(samples,all,labels.map(l=>({...l,rater2Id:l.rater1Id}))).preliminaryThresholdsMet,false);
 assert.equal(validationReport(samples,all,labels.map(l=>({...l,rater2Origin:'ai'}))).pairedLabels,0);
 const abstain=all.map(r=>({...r,result:{...r.result,decision:'abstain'}}));assert.equal(validationReport(samples,abstain,labels).repeated.n,0);
});
test('leaked answers and dataset groups are detected; labels require independent matching sources',()=>{
 const a=sample('a'),b={...sample('b'),split:'development',a:a.a};assert.equal(inspectDataset([a,b]).valid,false);
 b.a='不同';b.groupId=a.groupId;assert.equal(inspectDataset([a,b]).valid,false);
 const rows=id=>samples.map(s=>({id:s.id,raterId:id,label:'a',sampleHash:sampleFingerprint(s),datasetVersion:s.datasetVersion}));
 assert.equal(mergeRaterLabels(samples,rows('one'),rows('two')).length,3);
 assert.throws(()=>mergeRaterLabels(samples,rows('one'),rows('one')));
 assert.throws(()=>mergeRaterLabels(samples,rows('one'),rows('two').map(r=>({...r,annotationOrigin:'ai',independentHuman:false}))),/independent human/);
 const bad=rows('two');bad[0].sampleHash='wrong';assert.throws(()=>mergeRaterLabels(samples,rows('one'),bad));
});
test('offline runner needs only a key and preserves durable idempotency and process locking',async()=>{
 process.env.TYPESAFE_API_KEY='fixture';
 const dir=await fs.mkdtemp(join(tmpdir(),'mc-validation-')),output=join(dir,'results.jsonl');
 try{
  const s=sample('run'),input=validationInput(s).input;let calls=0,release;
  const waiting=new Promise(r=>release=r);
  const mock=async()=>{calls++;await waiting;return Response.json({model:JEV_MODEL,answers:Object.fromEntries(Object.keys(input.payload.questions).map(id=>[id,{type:'score',score:2,confidence:1,probabilities:{'0':0,'1':0,'2':1}}])),usage:{input_tokens:100,output_tokens:0}});};
  const running=runValidation([s],{outputPath:output,fetchImpl:mock});
  while(!calls)await new Promise(r=>setTimeout(r,5));
  await assert.rejects(runValidation([s],{outputPath:output,fetchImpl:mock}),/locked/);
  release();const result=await running;assert.equal(result.stopped,'complete');assert.equal(calls,3);
  await runValidation([s],{outputPath:output,fetchImpl:mock});assert.equal(calls,3);
  const journal=(await fs.readFile(output,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(journal.length,6);assert.equal(journal[0].status,'running');
  const missing=await fs.open(join(dir,'missing-key.jsonl'),'w');await missing.close();
  const prior={canonical:process.env.TYPESAFE_API_KEY,lower:process.env.jev_key,upper:process.env.JEV_KEY};
  try{
   process.env.TYPESAFE_API_KEY='';process.env.jev_key='';process.env.JEV_KEY='';
   await assert.rejects(runValidation([s],{outputPath:join(dir,'missing-key.jsonl'),fetchImpl:mock}),/key.*required/i);
   assert.equal(calls,3);
  }finally{for(const [name,value] of [['TYPESAFE_API_KEY',prior.canonical],['jev_key',prior.lower],['JEV_KEY',prior.upper]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
