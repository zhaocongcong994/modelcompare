import fs from 'node:fs/promises';
import { hostname } from 'node:os';
import { requestJudge } from './typesafe.js';
import { jevApiKey } from './credentials.js';
import { inspectDataset, matchingResult, mergeRaterLabels, sampleFingerprint, validationInput } from './dataset.js';
async function journalAppend(outputPath, record) {
  const file = await fs.open(outputPath, 'a', 0o600);
  try { await file.writeFile(`${JSON.stringify(record)}\n`); await file.sync(); } finally { await file.close(); }
}
export function agreement(pairs) {
  if (!pairs.length) return { n:0, agreement:null, kappa:null, interval95:null };
  const labels=[...new Set(pairs.flat())],n=pairs.length,p=pairs.filter(([a,b])=>a===b).length/n;
  const chance=labels.reduce((s,l)=>s+pairs.filter(([a])=>a===l).length/n*pairs.filter(([,b])=>b===l).length/n,0);
  const z=1.96,center=(p+z*z/(2*n))/(1+z*z/n),width=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n);
  return {n,agreement:p,kappa:chance<1?(p-chance)/(1-chance):null,interval95:[Math.max(0,center-width),Math.min(1,center+width)]};
}
export function validationReport(samples, journal, labels) {
  const dataset=inspectDataset(samples), sampleMap=new Map(samples.map(s=>[s.id,s]));
  const final=[...new Map(journal.map(r=>[`${r.id}:${r.variant}:${r.inputHash}`,r])).values()];
  const valid=final.filter(r=>['original','repeat','swapped'].includes(r.variant)&&sampleMap.has(r.id)&&matchingResult(sampleMap.get(r.id),r));
  const records=new Map(valid.map(r=>[`${r.id}:${r.variant}`,r]));
  const validation=samples.filter(s=>s.split==='validation'),choices=new Set(['a','b','tie','unjudgeable']);
  const labelMap=new Map(labels.filter(l=>{const s=sampleMap.get(l.id);return s&&choices.has(l.rater1)&&choices.has(l.rater2)&&l.sampleHash===sampleFingerprint(s)&&l.datasetVersion===s.datasetVersion&&(!l.rater1Origin||l.rater1Origin==='human')&&(!l.rater2Origin||l.rater2Origin==='human')&&l.independentHuman!==false;}).map(l=>[l.id,l]));
  const original=s=>records.get(`${s.id}:original`)?.result;
  const truth=s=>{const l=labelMap.get(s.id);return l&&l.rater1===l.rater2&&l.rater1!=='unjudgeable'?l.rater1:null;};
  const comparable=validation.filter(s=>truth(s)&&original(s)&&original(s).decision!=='abstain');
  const metric=list=>agreement(list.map(s=>[truth(s),original(s).decision]));
  const human=agreement(validation.filter(s=>labelMap.has(s.id)).map(s=>[labelMap.get(s.id).rater1,labelMap.get(s.id).rater2]));
  const stability=variant=>{
    const eligible=validation.filter(s=>original(s)&&original(s).decision!=='abstain');
    const observed=eligible.filter(s=>records.has(`${s.id}:${variant}`));
    return {...agreement(observed.map(s=>{const decision=records.get(`${s.id}:${variant}`).result.decision;return [original(s).decision,variant==='swapped'?({a:'b',b:'a'})[decision]||decision:decision];})),expected:eligible.length,coverage:eligible.length?observed.length/eligible.length:0};
  };
  const overall=metric(comparable),repeated=stability('repeat'),swapped=stability('swapped');
  const perScene=Object.fromEntries(['product','support','marketing'].map(scene=>[scene,metric(comparable.filter(s=>s.scene===scene))]));
  const expected=validation.length*3,observed=validation.reduce((n,s)=>n+['original','repeat','swapped'].filter(v=>records.has(`${s.id}:${v}`)).length,0);
  const pairedLabels=validation.filter(s=>labelMap.has(s.id)).length;
  const independentLabels=validation.every(s=>{const l=labelMap.get(s.id);return l&&typeof l.rater1Id==='string'&&l.rater1Id.trim()&&typeof l.rater2Id==='string'&&l.rater2Id.trim()&&l.rater1Id.trim()!==l.rater2Id.trim();});
  const complete=dataset.valid&&validation.length>0&&observed===expected&&pairedLabels===validation.length&&independentLabels;
  const consensus=validation.filter(s=>truth(s)).length,decisionCoverage=consensus?comparable.length/consensus:0;
  const originals=validation.filter(s=>original(s)).map(s=>original(s));
  const confidenceDiagnostics=[[0,.4],[.4,.6],[.6,.8],[.8,1.001]].map(([min,max])=>{
    const rows=validation.flatMap(s=>{
      const r=original(s);if(!truth(s)||!r?.results)return [];
      const values=[r.results.a,r.results.b].flatMap(side=>(side?.dimensions||[]).map(d=>d.confidence));if(!values.length)return [];
      const confidence=Math.min(...values),delta=r.results.a.score-r.results.b.score;
      return confidence>=min&&confidence<max?[{correct:(Math.abs(delta)<5?'tie':delta>0?'a':'b')===truth(s),refused:r.decision==='abstain'}]:[];
    });return {confidenceRange:[min,Math.min(1,max)],n:rows.length,errors:rows.filter(r=>!r.correct).length,refused:rows.filter(r=>r.refused).length};
  });
  const durations=valid.filter(r=>Number.isFinite(r.durationMs)).map(r=>r.durationMs).sort((a,b)=>a-b);
  return {status:complete?'review_required':'awaiting_human_labels_or_real_results',rankingApproved:false,dataset,samples:samples.length,validationSamples:validation.length,pairedLabels,independentLabels,resultCoverage:{expected,observed,complete:observed===expected&&expected>0},decisionCoverage,humanAgreement:human,judgeAgreement:overall,perScene,repeated,swapped,
    refusalRate:originals.length?originals.filter(r=>r.decision==='abstain').length/originals.length:null,
    p95DurationMs:durations.length?durations[Math.ceil(durations.length*.95)-1]:null,
    totalCostUsd:valid.reduce((sum,r)=>sum+(r.result.costUsd||0),0),
    unresolvedCostReserveUsd:final.filter(r=>r.status!=='succeeded').reduce((sum,r)=>sum+(r.reservedCostUsd||0),0),confidenceDiagnostics,
    preliminaryThresholdsMet:complete&&decisionCoverage>=.8&&overall.agreement>=.8&&repeated.coverage===1&&repeated.agreement>=.9&&swapped.coverage===1&&swapped.agreement>=.9&&Object.values(perScene).every(m=>m.n>0&&m.agreement>=.8),
    note:'只有当前数据、模型和量表版本匹配的成功结果参与统计；人工分歧不当成真值。缺少重复/交换结果、独立评审或有效判定覆盖不足均不能通过初步门槛；报告永不自动开启排名。'};
}
export async function unlockValidation(outputPath) {
  const lockPath=`${outputPath}.lock`,owner=JSON.parse(await fs.readFile(lockPath,'utf8'));
  if(owner.hostname!==hostname()||!Number.isInteger(owner.pid))throw new Error('Cannot verify lock owner on this machine');
  try{process.kill(owner.pid,0);throw new Error('Validation process is still running; lock preserved');}catch(e){if(e.code!=='ESRCH')throw e;}
  await fs.unlink(lockPath);
}
export async function runValidation(samples,{outputPath,fetchImpl}={}) {
  if(!jevApiKey())throw new Error('Server-side TYPESAFE_API_KEY (or jev_key) is required');
  const dataset=inspectDataset(samples);if(!dataset.valid)throw new Error(`Invalid dataset: ${JSON.stringify(dataset.issues)}`);
  const lockPath=`${outputPath}.lock`;
  let lock;
  try{lock=await fs.open(lockPath,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw new Error('Validation already locked; no provider request sent');throw e;}
  try{
    await lock.writeFile(JSON.stringify({pid:process.pid,hostname:hostname(),createdAt:new Date().toISOString()}));
    await lock.sync();
    let previous=[];
    try{previous=(await fs.readFile(outputPath,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch(e){if(e.code!=='ENOENT')throw e;}
    previous=[...new Map(previous.map(r=>[`${r.id}:${r.variant}:${r.inputHash}`,r])).values()];
    if (previous.some(r => !samples.some(s => s.id === r.id && s.datasetVersion === r.datasetVersion && sampleFingerprint(s) === r.sampleHash) || !Number.isFinite(r.reservedCostUsd) || r.reservedCostUsd < 0)) throw new Error('Journal belongs to a different dataset or is invalid; use a new result file');
    let spent=previous.reduce((sum,r)=>sum+(r.reservedCostUsd||0),0);
    for(const sample of samples)for(const variant of ['original','repeat','swapped']){
      const {input,inputHash}=validationInput(sample,variant);
      if(previous.some(r=>r.id===sample.id&&r.variant===variant&&r.inputHash===inputHash))continue;
      const marker={id:sample.id,variant,inputHash,sampleHash:sampleFingerprint(sample),datasetVersion:sample.datasetVersion,reservedCostUsd:input.reservedCostUsd,status:'running'};
      await journalAppend(outputPath,marker);spent+=input.reservedCostUsd;
      const started=Date.now();let record;
      try{record={...marker,status:'succeeded',result:await requestJudge(input,{fetchImpl}),durationMs:Date.now()-started};}
      catch(e){record={...marker,status:'failed',errorCode:e.code||'SCORE_PROVIDER_FAILED',durationMs:Date.now()-started};}
      await journalAppend(outputPath,record);previous.push(record);
      if(['SCORE_AUTH_FAILED','SCORE_NOT_CONFIGURED','SCORE_RATE_LIMITED'].includes(record.errorCode))return {stopped:record.errorCode,reservedUsd:spent};
    }
    return {stopped:'complete',reservedUsd:spent,unresolved:previous.filter(r=>r.status!=='succeeded').length};
  }finally{await lock.close();await fs.rm(lockPath,{force:true});}
}
if(process.argv[1]===new URL(import.meta.url).pathname){
  const [command,datasetPath,resultsPath,labelsPath,secondLabelsPath]=process.argv.slice(2);
  const readLines=async file=>(await fs.readFile(file,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  if(command==='unlock'){await unlockValidation(datasetPath);console.log('Released dead-process lock; journal preserved.');}
  else{
    const samples=await readLines(datasetPath);
    if(command==='run')console.log(JSON.stringify(await runValidation(samples,{outputPath:resultsPath})));
    else if(command==='report')console.log(JSON.stringify(validationReport(samples,resultsPath&&resultsPath!=='-'?await readLines(resultsPath):[],labelsPath&&labelsPath!=='-'?await readLines(labelsPath):[]),null,2));
    else if(command==='merge-labels'){
      const merged=mergeRaterLabels(samples,await readLines(labelsPath),await readLines(secondLabelsPath));
      await fs.writeFile(resultsPath,merged.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({merged:merged.length,output:resultsPath}));
    }else if(command==='dry-run'){
      const dataset=inspectDataset(samples);if(!dataset.valid)throw new Error(JSON.stringify(dataset.issues));
      const inputs=samples.flatMap(s=>['original','repeat','swapped'].map(v=>validationInput(s,v).input));
      console.log(JSON.stringify({requests:inputs.length,estimatedCostUpperBoundUsd:inputs.reduce((sum,i)=>sum+i.reservedCostUsd,0),realRequestsSent:0},null,2));
    }else throw new Error('Usage: validation.js run|report|dry-run dataset results|- labels|- OR merge-labels dataset output rater1 rater2 OR unlock results');
  }
}
