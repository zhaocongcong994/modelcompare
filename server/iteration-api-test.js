import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import clientModule from '@prisma/client';
import { enqueueScore, processScoreJob, recoverScoreJobs } from './judge/service.js';
import { buildJudgeInput, JEV_MODEL } from './judge/typesafe.js';
import { RUBRIC_VERSION } from './judge/rubrics.js';

dotenv.config({quiet:true});
const name=`mc_iteration_test_${randomUUID().replaceAll('-','')}`;
const control=new pg.Client({connectionString:process.env.DATABASE_URL});
const url=new URL(process.env.DATABASE_URL);url.pathname=`/${name}`;
const directory=await mkdtemp(join(tmpdir(),'mc-iteration-'));
const knowledgePath=join(directory,'knowledge.json');
let api, db, pool, created=false, output='', calls=0, malformed=false;
const provider=createServer(async(req,res)=>{
 let raw='';for await(const c of req)raw+=c;
 const body=JSON.parse(raw);res.setHeader('Content-Type','application/json');
 if(req.url==='/embed'){res.statusCode=503;res.end('{}');return;}
 if(req.url==='/v1/messages'){
  const payload=JSON.parse(body.messages[0].content);
  res.end(JSON.stringify({content:[{type:'text',text:JSON.stringify({items:[...payload.items].reverse().map(i=>({id:i.id,reasons:['由已给事实说明'],tradeoffs:['需要实际试用'],references:[i.evidence[0].id]}))})}]}));return;
 }
 calls++;
 if(malformed){res.end(JSON.stringify({model:'jev-latest',answers:{},usage:{}}));return;}
 res.end(JSON.stringify({model:JEV_MODEL,answers:Object.fromEntries(Object.keys(body.questions).map(id=>[id,{type:'score',score:id.startsWith('a_')?2:0,confidence:1,probabilities:id.startsWith('a_')?{'0':0,'1':0,'2':1}:{'0':1,'1':0,'2':0}}])),usage:{input_tokens:100,output_tokens:20}}));
});
const runCommand=async(args,env)=>{const child=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);const[code]=await once(child,'exit');assert.equal(code,0,logs);};
async function start(env){output='';api=spawn(process.execPath,['api.js'],{env,stdio:['ignore','pipe','pipe']});api.stdout.on('data',d=>output+=d);api.stderr.on('data',d=>output+=d);return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(output)),15000);api.stdout.on('data',()=>{const m=output.match(/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}});api.once('exit',()=>{clearTimeout(timer);reject(new Error(output));});});}
async function stop(){if(api){api.kill();await once(api,'exit');api=null;}}
try{
 await control.connect();await control.query(`CREATE DATABASE "${name}"`);created=true;
 await writeFile(knowledgePath,JSON.stringify([{id:'k1',title:'资料',sourceUrl:'https://example.com/doc',text:'产品说明',status:'active'}]));
 provider.listen(0,'127.0.0.1');await once(provider,'listening');const providerBase=`http://127.0.0.1:${provider.address().port}`;
 const env={...process.env,DATABASE_URL:url.toString(),PORT:'0',INVITE_CODES:'iteration-a,iteration-b',ADMIN_INVITE_CODES:'iteration-admin',MINIMAX_API_KEY:'fixture',MINIMAX_BASE_URL:providerBase,RAG_EMBEDDING_URL:providerBase,RAG_KNOWLEDGE_PATH:knowledgePath,TYPESAFE_API_KEY:'fixture',TYPESAFE_BASE_URL:providerBase,JEV_MODE:'visible'};
 await runCommand(['node_modules/prisma/build/index.js','db','push'],env);
 pool=new pg.Pool({connectionString:url.toString()});db=new clientModule.PrismaClient({adapter:new PrismaPg(pool)});
 await db.vendor.create({data:{id:'v',name:'Fixture'}});
 for(const [id,context,amount] of [['cheap',1000,1],['long',10000,10]]){
  await db.model.create({data:{id,vendorId:'v',displayName:id,category:'单模态',contextSize:context,sourceUrl:'https://example.com/model',outputModes:['文本']}});
  const offering=await db.apiOffering.upsert({where:{vendorId_name_channel:{vendorId:'v',name:'Fixture',channel:'direct'}},create:{vendorId:'v',name:'Fixture',channel:'direct',sourceUrl:'https://example.com/price'},update:{}});
  await db.apiRateCard.create({data:{modelId:id,apiOfferingId:offering.id,currency:'USD',sourceUrl:'https://example.com/price',items:{create:[{metric:'input_tokens',unit:'per_million_tokens',amount},{metric:'output_tokens',unit:'per_million_tokens',amount}]}}});
 }
 let base=await start(env);
 const request=async(path,body,cookie,method)=>{const response=await fetch(`${base}${path}`,{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,body:await response.json().catch(()=>({})),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 const login=async(code)=>{const r=await request('/auth/invite',{inviteCode:code});assert.equal(r.status,201);return r.cookie;};
 const a=await login('iteration-a'),b=await login('iteration-b'),admin=await login('iteration-admin');
 const payload={query:'介绍产品',requirements:{workload:{inputTokens:1000,outputTokens:1000,cacheRatio:0,dailyRequests:10,daysPerMonth:30}},preferences:{cost:1,context:0,quality:0}};
 const recommendation=await request('/recommendations',payload,a);assert.equal(recommendation.status,201,JSON.stringify(recommendation.body));
 const rec=recommendation.body.data;assert.deepEqual(rec.items.map(i=>i.model.id),['cheap','long']);assert.equal(rec.rag.explanation.status,'generated');assert.equal(rec.rag.provider,'lexical');
 assert.equal(rec.items[0].score,100);assert.equal(rec.schemaVersion,2);
 assert.equal((await request(`/recommendations/${rec.recommendationId}`,undefined,b)).status,404);
 assert.equal((await request('/recommendations',undefined,a)).body.data.total,1);assert.equal((await request('/recommendations',undefined,b)).body.data.total,0);
 assert.equal((await request(`/recommendations/${rec.recommendationId}/feedback`,{modelId:'cheap',action:'viewed',helpful:true},a)).status,201);
 assert.equal((await db.userFeedback.findFirst()).recommendationRunId,(await db.userRecommendationRun.findFirst()).id);
 const snapshot=structuredClone(rec.items);await db.model.update({where:{id:'cheap'},data:{contextSize:99999}});
 assert.deepEqual((await request(`/recommendations/${rec.recommendationId}`,undefined,a)).body.data.items,snapshot);
 const knowledge=(await request('/admin/knowledge',undefined,admin)).body.data;assert.equal(knowledge.storage,'json');
 assert.equal((await request(`/admin/knowledge/${knowledge.sources[0].id}`,{status:'expired'},admin,'PATCH')).status,200);
 const after=(await request('/recommendations',payload,a)).body.data;assert.equal(after.rag.activeFragmentCount,0);assert.equal(after.rag.evidence.length,0);
 const user=await db.user.findUnique({where:{inviteCodeHash:createHash('sha256').update('iteration-a').digest('hex')}});
 const prompt=await db.evaluationPrompt.create({data:{type:'text',title:'产品功能说明',content:'介绍产品'}});
 const evaluation=await db.evaluationRun.create({data:{userId:user.id,type:'text',promptId:prompt.id,promptText:prompt.content,modelAId:'cheap',modelBId:'long',results:{create:[{modelId:'cheap',content:'答案甲'},{modelId:'long',content:'答案乙'}]}},include:{results:true,prompt:true}});
 assert.equal((await request(`/evaluations/${evaluation.id}/score`,{},b)).status,404);
 const starts=await Promise.all(Array.from({length:6},()=>request(`/evaluations/${evaluation.id}/score`,{},a)));
 assert.ok(starts.every(r=>r.status===202||r.status===200),JSON.stringify(starts));assert.equal(new Set(starts.map(r=>r.body.data.id)).size,1);
 let job;
 for(let i=0;i<60;i++){job=(await request(`/evaluations/${evaluation.id}/score`,undefined,a)).body.data.jobs[0];if(job?.status==='succeeded')break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(job.status,'succeeded',output);assert.equal(job.result.decision,'a');assert.equal(calls,1);assert.equal((await request(`/evaluations/${evaluation.id}/score`,undefined,b)).status,404);
 assert.equal((await request(`/evaluations/${evaluation.id}/judgment`,{choice:'b_better'},a)).status,201);
 assert.equal((await db.evaluationJudgment.findUnique({where:{runId:evaluation.id}})).choice,'b_better');
 assert.equal((await request(`/evaluations/${evaluation.id}/score`,{},a)).status,200);assert.equal(calls,1);
 await stop();base=await start(env);
 assert.equal((await request(`/recommendations/${rec.recommendationId}`,undefined,a)).status,200);
 assert.equal((await request(`/evaluations/${evaluation.id}/score`,undefined,a)).body.data.jobs[0].status,'succeeded');assert.equal(calls,1);
 await stop();
 Object.assign(process.env,{TYPESAFE_API_KEY:'fixture',TYPESAFE_BASE_URL:providerBase,JEV_MODE:'visible'});
 const pending=await enqueueScore(db,evaluation,user.id,{reference:'另一份参考'});assert.equal(pending.status,'pending');
 const unstarted=await db.evaluationScoreRun.update({where:{id:pending.id},data:{status:'running',startedAt:new Date(0),attempts:0}});
 await recoverScoreJobs(db);assert.equal((await db.evaluationScoreRun.findUnique({where:{id:pending.id}})).status,'pending');
 await db.evaluationScoreRun.update({where:{id:pending.id},data:{status:'running',startedAt:new Date(0),attempts:1}});
 await recoverScoreJobs(db);assert.equal((await db.evaluationScoreRun.findUnique({where:{id:pending.id}})).errorCode,'SCORE_DELIVERY_UNCERTAIN');
 assert.equal(await processScoreJob(db),false);assert.equal(calls,1);
 malformed=true;const bad=await enqueueScore(db,evaluation,user.id,{reference:'结构错误测试'});await processScoreJob(db);
 assert.equal((await db.evaluationScoreRun.findUnique({where:{id:bad.id}})).status,'failed');assert.equal(calls,2);
 const unrestricted=await enqueueScore(db,evaluation,user.id,{reference:'无需额度配置'});
 await db.evaluationScoreRun.update({where:{id:unrestricted.id},data:{budgetId:'legacy-period'}});
 malformed=false;await processScoreJob(db);
 assert.equal((await db.evaluationScoreRun.findUnique({where:{id:unrestricted.id}})).status,'succeeded');assert.equal(calls,3);
 process.env.JEV_MODE='off';await assert.rejects(enqueueScore(db,evaluation,user.id,{reference:'关闭测试'}),{code:'SCORE_DISABLED'});
 console.log('PASS: snapshot/history/feedback/isolation, JSON status, AI cannot reorder, Jev without credit configuration, legacy jobs, concurrent idempotency/recovery/schema, restart persistence; 0 real provider calls.');
}catch(error){console.error(output);throw error;}
finally{
 await stop();provider.close();await db?.$disconnect();await pool?.end();
 if(created){await control.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);await control.query(`DROP DATABASE "${name}"`);}
 await control.end();await rm(directory,{recursive:true,force:true});
}
