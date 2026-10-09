import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { PROMPT_SEEDS, PROMPT_PRESET_VERSION } from './prompts/evaluation-presets.js';

const serverDir=path.dirname(fileURLToPath(import.meta.url));
dotenv.config({path:path.join(serverDir,'.env'),quiet:true});
const apply=process.argv.includes('--apply-local');
const address=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','[::1]'].includes(address.hostname))throw new Error('This script only supports the local database');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
try {
 await db.connect();await db.query(apply?'BEGIN':'BEGIN READ ONLY');
 const {rows}=await db.query(`SELECT * FROM "EvaluationPrompt" ORDER BY type, "sortOrder", id${apply?' FOR UPDATE':''}`);
 const updates=PROMPT_SEEDS.map(([type,title,content])=>{
  const matches=rows.filter(row=>row.type===type&&row.title===title);
  if(matches.length!==1)throw new Error(`Expected exactly one existing scene: ${title}`);
  return {row:matches[0],content};
 });
 const changed=updates.filter(({row,content})=>row.content!==content);
 let backupPath;
 if(apply&&changed.length){
  const directory=path.join(serverDir,'..','.runtime','prompt-refresh');
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  backupPath=path.join(directory,`${Date.now()}-before.json`);
  await fs.writeFile(backupPath,JSON.stringify({version:PROMPT_PRESET_VERSION,createdAt:new Date().toISOString(),prompts:rows},null,2),{flag:'wx',mode:0o600});
  for(const {row,content} of changed)await db.query('UPDATE "EvaluationPrompt" SET content=$1, "updatedAt"=NOW() WHERE id=$2',[content,row.id]);
 }
 await db.query(apply?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({version:PROMPT_PRESET_VERSION,mode:apply?'applied_local':'preview',matched:updates.length,changed:changed.length,backupPath:backupPath?path.relative(path.join(serverDir,'..'),backupPath):null,preserved:['ids','titles','enabled','sortOrder','historical promptText']},null,2));
} catch(error){
 await db.query('ROLLBACK').catch(()=>{});
 console.error('Prompt update stopped:',error.message);process.exitCode=1;
} finally {await db.end();}
