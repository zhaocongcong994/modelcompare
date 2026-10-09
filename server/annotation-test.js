import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { annotationHtml } from './judge/annotation.js';
import { mergeRaterLabels } from './judge/dataset.js';

const samples=(await fs.readFile('../validation/jev/samples.jsonl','utf8')).trim().split('\n').map(JSON.parse);
const directory=await fs.mkdtemp(join(tmpdir(),'mc-annotation-'));
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 const errors=[],external=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(new URL(request.url()).hostname!=='127.0.0.1')external.push(request.url());});
 await page.goto('http://127.0.0.1:3000/modelcompare/annotation.html');
 assert.equal(await page.locator('#review').isVisible(),false);
 const start=async name=>{await page.locator('#rater').fill(name);await page.locator('#identity button').click();};
 const exportRows=async name=>{
  const pending=page.waitForEvent('download');await page.locator('#export').click();
  const download=await pending,file=join(directory,name);await download.saveAs(file);
  return (await fs.readFile(file,'utf8')).trim().split('\n').map(JSON.parse);
 };
 await start('reviewer-one');
 await page.locator('[data-label="a"]').click();await page.locator('#note').fill('第一题的人工备注');
 await page.locator('#next').click();await page.locator('[data-label="tie"]').click();
 const first=await exportRows('one.jsonl');assert.equal(first.length,2);assert.equal(first[0].note,'第一题的人工备注');
 await start('reviewer-two');assert.equal(await page.locator('#export').isDisabled(),true);
 assert.equal(await page.locator('#note').inputValue(),'');
 await page.locator('[data-label="b"]').click();await page.locator('#next').click();await page.locator('[data-label="tie"]').click();
 const second=await exportRows('two.jsonl');
 const merged=mergeRaterLabels(samples,first,second);assert.equal(merged.length,2);assert.equal(merged[0].rater1,'a');assert.equal(merged[0].rater2,'b');
 await page.reload();await start('reviewer-one');await page.locator('#sampleNumber').selectOption('0');
 assert.equal(await page.locator('[data-label="a"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#note').inputValue(),'第一题的人工备注');
 await page.locator('#clear').click();assert.equal((await exportRows('cleared.jsonl')).length,1);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const malicious={...samples[0],task:'</script><script>window.annotationInjected=true</script>'};
 const isolated=await browser.newPage();isolated.on('pageerror',error=>errors.push(error.message));
 await isolated.setContent(annotationHtml([malicious]));
 await isolated.locator('#rater').fill('safety-fixture');await isolated.locator('#identity button').click();
 assert.equal(await isolated.evaluate(()=>window.annotationInjected),undefined);
 assert.equal(await isolated.locator('#task').textContent(),malicious.task);
 assert.deepEqual(errors,[]);
 console.log('PASS: served annotation page, independent local storage, reload, clear, real JSONL export/merge and injection escaping; 0 provider calls.');
} finally {await browser.close();await fs.rm(directory,{recursive:true,force:true});}
