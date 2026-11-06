// Verify the current selection-loss regression and a review-only replacement with actual DOM.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {provision} from '../browser-lab/launch.mjs';

const root=resolve(import.meta.dirname,'../..');
const sources=['areas.js','docs/review/regions/fill-municipality-candidate.js'];
const contents=await Promise.all(sources.map(path=>readFile(resolve(root,path),'utf8')));
const report={status:'FAIL',production_access:false,external_requests:0,checks:[],
  source_sha256:Object.fromEntries(sources.map((path,index)=>[path,createHash('sha256').update(contents[index]).digest('hex')])),
  limitations:['Candidate is injected into an isolated page; areas.js remains the existing runtime source',
    'No profile write, production data conversion or notification delivery']};
const runtime=await provision();let browser;
try{
  browser=await runtime.launch();report.browser=browser.version();
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>{report.external_requests++;return route.abort()});
  const page=await context.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><select id="area"></select>');
  await page.addScriptTag({content:contents[0]});
  const select=async(pref,selected)=>page.evaluate(({pref,selected})=>{
    const el=document.getElementById('area');
    fillMunicipalitySelect(el,pref,selected);
    return {value:el.value,disabled:el.disabled,options:[...el.options].map(option=>option.value),images:document.images.length};
  },{pref,selected});
  const check=(name,ok)=>{assert(ok,name);report.checks.push({name,status:'PASS'})};
  const baseline=await select('東京都','新宿区');
  check('Baseline reproduces saved ward becoming prefecture-wide',baseline.value==='東京都全域');
  await page.addScriptTag({content:contents[1]});
  for(const [name,pref,selected] of [
    ['saved ward','東京都','新宿区'],['existing grouped region','東京都','東京都23区'],
    ['existing municipality','大阪府','大阪市'],['prefecture-wide','奈良県','奈良県全域'],
    ['saved town outside choices','奈良県','既存の保存地域'],
    ['untrusted text','東京都','"><img src=x onerror=alert(1)>']
  ]){
    const result=await select(pref,selected);
    check('Candidate preserves '+name,result.value===selected&&result.options.filter(value=>value===selected).length===1&&result.images===0&&!result.disabled);
  }
  check('Empty preference keeps selection disabled',(await select('','')).disabled);
  check('New selection defaults to prefecture-wide',(await select('東京都','')).value==='東京都全域');
  check('No external requests',report.external_requests===0);
  report.status='PASS_REGION_SELECTOR_REVIEW_CANDIDATE';
}catch(error){report.error=error.message.split('\n')[0];process.exitCode=1}
finally{
  if(browser)await browser.close();
  await runtime.close();
  await writeFile(resolve(root,'docs/review/regions/browser-result-20261106.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error}));
}
