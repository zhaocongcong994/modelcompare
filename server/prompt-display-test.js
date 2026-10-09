import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { PROMPT_SEEDS } from './prompts/evaluation-presets.js';
const prompts=PROMPT_SEEDS.map(([type,title,content],i)=>({id:`prompt-fixture-${i}`,type,title,content}));
const browser=await chromium.launch({headless:true});
const directory='../.runtime/prompt-refresh';
await fs.mkdir(directory,{recursive:true});
try {
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),errors=[],mutations=[];
  let minimaxAvailable=true;
  const currentPrompts=prompts.map(prompt=>({...prompt}));
  const recommendationRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>sessionStorage.setItem('mc_invite_code','display-fixture'));
  await page.route('**/api/**',async route=>{
   const request=route.request(),pathname=new URL(request.url()).pathname.replace(/^\/api/,'');
   if(request.method()==='POST'&&pathname==='/recommendations'){
    recommendationRequests.push(request.postDataJSON());
    return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{recommendationId:'mock-prompt-refresh',items:[]}})});
   }
   if(request.method()==='PATCH'&&pathname.startsWith('/admin/evaluation/prompts/')){
    const prompt=currentPrompts.find(p=>p.id===decodeURIComponent(pathname.split('/').at(-1)));
    assert.ok(prompt);Object.assign(prompt,request.postDataJSON());
    return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{prompt}})});
   }
   if(request.method()!=='GET'){mutations.push(pathname);return route.fulfill({status:409,contentType:'application/json',body:'{}'});}
   let data;
   if(pathname==='/auth/me')data={authenticated:true,role:'admin'};
   else if(['/evaluations/prompts','/admin/evaluation/prompts'].includes(pathname))data={prompts:currentPrompts,availability:{minimax:{available:minimaxAvailable,message:minimaxAvailable?'':'MiniMax 免费额度尚未核实，生成评测暂未开放。'},deepseek:{available:true},doubao:{available:true}}};
   else if(pathname==='/evaluations/history')data={runs:[]};
   else if(pathname==='/evaluations/score-config')data={enabled:false,mode:'off'};
   else if(pathname==='/admin/evaluation/config')data={textDailyLimit:1,imageDailyLimit:1};
   else if(pathname.startsWith('/admin/'))return route.fulfill({status:503,contentType:'application/json',body:'{}'});
   else return route.continue();
   return route.fulfill({contentType:'application/json',body:JSON.stringify({data})});
  });
  await page.goto('http://127.0.0.1:3000/modelcompare',{waitUntil:'networkidle'});
  const withinViewport=async locator=>{const box=await locator.boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=viewport.width+1,JSON.stringify(box));};
  const separated=async prefix=>{
   const select=await page.locator(`#${prefix}`).boundingBox(),preview=await page.locator(`#${prefix}Context`).boundingBox();
   assert.ok(select&&preview&&preview.y-(select.y+select.height)>=12,JSON.stringify({select,preview}));
  };
  await page.locator('#recommendTab').click();
  for(const type of ['text','image']){
   await page.locator('#recommendQuery').selectOption(type);
   assert.equal(await page.locator('#recommendPrompt option').count(),5);
   for(const prompt of prompts.filter(p=>p.type===type)){
    await page.locator('#recommendPrompt').selectOption(prompt.id);
    await separated('recommendPrompt');
    assert.equal(await page.locator('#recommendPromptDetails').evaluate(el=>el.open),false);
    await page.locator('#recommendPromptDetails summary').click();
    assert.equal(await page.locator('#recommendPromptPreview').textContent(),prompt.content);
    assert.equal(await page.locator('#recommendPromptPreview').evaluate(el=>getComputedStyle(el).whiteSpace),'pre-wrap');
    await withinViewport(page.locator('#recommendPromptContext'));
    await separated('recommendPrompt');
   }
  }
  await page.locator('#recommendQuery').selectOption('text');
  await page.locator('#recommendPrompt').selectOption(prompts[4].id);
  await page.locator('#evaluationTab').click();
  for(const type of ['text','image']){
   await page.locator('#evaluationType').selectOption(type);
   assert.equal(await page.locator('#evaluationPrompt option').count(),5);
   const prompt=prompts.filter(p=>p.type===type).at(-1);
   await page.locator('#evaluationPrompt').selectOption(prompt.id);
   await separated('evaluationPrompt');
   await page.locator('#evaluationPromptDetails summary').click();
   assert.equal(await page.locator('#evaluationPromptPreview').textContent(),prompt.content);
   await withinViewport(page.locator('#evaluationPromptContext'));
   await separated('evaluationPrompt');
  }
  // Reloading the scene list when switching pages must preserve the chosen scene.
  await page.locator('#recommendTab').click();assert.equal(await page.locator('#recommendPrompt').inputValue(),prompts[4].id);
  await page.locator('#recommendPromptDetails summary').click();
  const geometry=await page.locator('#recommendPromptPreview').evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight,max:parseFloat(getComputedStyle(el).maxHeight)}));
  assert.ok(geometry.client<=geometry.max+1);assert.ok(geometry.scroll>geometry.client);
  await page.screenshot({path:`${directory}/prompt-${viewport.width}.png`,fullPage:false});
  await page.locator('#managementButton').click();await page.locator('#adminEvaluationPromptTab').click();
  await page.locator('.prompt-admin-item').first().waitFor();assert.equal(await page.locator('.prompt-admin-item').count(),5);
  const item=page.locator('.prompt-admin-item').first();await item.locator('summary').click();
  assert.equal(await item.locator('.prompt-preview-body').textContent(),prompts[0].content);
  assert.equal(await item.locator('.prompt-preview-body').getAttribute('tabindex'),'0');
  await withinViewport(item);await withinViewport(item.locator('.prompt-edit-btn'));
  await item.locator('.prompt-edit-btn').click();assert.equal(await page.locator('#promptEditContent').inputValue(),prompts[0].content);
  await page.locator('#promptEditCancel').click();
  // Edit the already selected scene, then confirm both previews use the saved copy.
  const selectedItem=page.locator('.prompt-admin-item').filter({has:page.locator(`[data-edit-prompt="${prompts[4].id}"]`)});
  await selectedItem.locator('.prompt-edit-btn').click();
  const revised='后台保存后的新提示词。\n\n请使用更新后的场景要求进行推荐。';
  await page.locator('#promptEditContent').fill(revised);
  await page.locator('#promptEditForm button[type="submit"]').click();
  await page.waitForFunction(text=>document.getElementById('recommendPromptPreview').textContent===text,revised);
  await page.locator('#recommendTab').click();
  assert.equal(await page.locator('#recommendPrompt').inputValue(),prompts[4].id);
  assert.equal(await page.locator('#recommendPromptPreview').textContent(),revised);
  assert.equal(await page.locator('#recommendPromptSummary').textContent(),'后台保存后的新提示词。');
  await page.locator('#evaluationTab').click();
  await page.locator('#evaluationType').selectOption('text');
  await page.locator('#evaluationPrompt').selectOption(prompts[4].id);
  assert.equal(await page.locator('#evaluationPromptPreview').textContent(),revised);
  // A save in another tab is picked up when returning to the recommendation page.
  currentPrompts[4].content='另一个管理页面保存的新版本。';
  await page.locator('#recommendTab').click();
  await page.waitForFunction(()=>document.getElementById('recommendPromptPreview').textContent==='另一个管理页面保存的新版本。');
  assert.equal(await page.locator('#recommendPrompt').inputValue(),prompts[4].id);
  await page.locator('#recommendSubmit').click();
  await page.waitForFunction(()=>!document.getElementById('recommendSubmit').disabled);
  assert.equal(recommendationRequests.length,1);
  assert.equal(recommendationRequests[0].query,'另一个管理页面保存的新版本。');
  minimaxAvailable=false;await page.locator('#evaluationTab').click();
  await page.locator('#evaluationType').selectOption('text');
  await page.locator('#evaluationModelA').selectOption('minimax/minimax-m2.5');
  await page.locator('#evaluationModelB').selectOption('minimax/minimax-m2.7');
  await page.waitForFunction(()=>!document.getElementById('evaluationAvailabilityHint').hidden);
  assert.equal(await page.locator('#evaluationSubmit').isDisabled(),true);
  assert.ok((await page.locator('#evaluationAvailabilityHint').textContent()).includes('MiniMax 免费额度尚未核实'));
  assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);await page.close();
 }
 console.log('PASS: all 10 scenes, desktop/mobile layout, admin save and cross-tab prompt refresh, preserved selection, free-credit availability; only mocked admin writes, 0 real mutations or model calls.');
} finally {await browser.close();}
