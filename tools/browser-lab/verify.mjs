// Actual repository HTML/CSS/local scripts + synthetic SDK. Every page request is fulfilled or aborted locally.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,extname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {provision} from './launch.mjs';
import {installFixture} from './fixture.mjs';
import {origin,csp,localResource} from './routing.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),out=resolve(root,'docs/browser-lab-20261029'),fontRoot=resolve(here,'node_modules/@fontsource/noto-sans-jp');
const report={status:'FAIL',started_at:new Date().toISOString(),scope:'Real headless Chromium with actual HTML and local assets; SDK, Auth and database are synthetic',production_access:false,real_data_used:false,service_workers:'blocked',tests:[],screenshots:[],external_requests_aborted:0,source_sha256:{},limitations:['Not real Supabase SDK/Auth/Storage integration','Linux headless Chromium with software GPU disabled; not iPhone Safari, Android or cameras','Synthetic requests do not enforce real RLS or multi-session database locks','Test-only CSP and Japanese font are injected; not deployed to production']};
await mkdir(out,{recursive:true});
for(const path of ['apply-confirm.html','driver.html','company.html','tools/browser-lab/package-lock.json','tools/browser-lab/launch.mjs','tools/browser-lab/fixture.mjs','tools/browser-lab/routing.mjs','tools/browser-lab/verify.mjs'])report.source_sha256[path]=createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
try{report.base_commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{report.base_commit=null}
report.includes_working_tree=true;
let runtime;
const count=(events,key,value)=>events.filter(e=>e[key]===value).length;
async function waitFor(fn){for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('Fixture event wait timed out')}
async function scenario(width,name,config,route,action){
 const entry={name,width,status:'FAIL'},events=[],errors=[];report.tests.push(entry);
 const browser=await runtime.launch();report.browser=browser.version();
 const context=await browser.newContext({viewport:{width,height:1000},locale:'ja-JP',timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 await context.exposeBinding('__record',(_,value)=>events.push(value));
 await context.addInitScript(installFixture,config);
 await context.route('**/*',async request=>{
  const resource=localResource(request.request().url(),request.request().method(),root,fontRoot);
  if(!resource){if(new URL(request.request().url()).origin!==origin)report.external_requests_aborted++;return request.abort('blockedbyclient')}
  if(resource.landing)return request.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="ja"><meta charset="utf-8"><title>架空ホーム</title><h1>架空ホーム</h1></html>',headers:{'Content-Security-Policy':csp}});
  try{
   const ext=extname(resource.file),types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml'};
   let body=await readFile(resource.file);
   if(resource.html)body=Buffer.from(body.toString().replace('</head>',`<link rel="stylesheet" href="/__lab_font/400.css"><style>body,button,input,select{font-family:'Noto Sans JP',Arial,sans-serif}</style></head>`));
   await request.fulfill({status:200,body,contentType:types[ext]||'application/octet-stream',headers:{'Content-Security-Policy':csp,'Cache-Control':'no-store'}});
  }catch{return request.fulfill({status:404,body:'Not found'})}
 });
 const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 const dialogs=[];let confirmAnswer=true;
 page.on('dialog',async dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});if(dialog.type()==='confirm'&&!confirmAnswer)await dialog.dismiss();else await dialog.accept()});
 const tools={events,dialogs,setConfirm:value=>confirmAnswer=value,async snapshot(label){
  await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');
  const file=`${label}-${width}.png`,bytes=await page.screenshot({fullPage:true});await writeFile(resolve(out,file),bytes);
  report.screenshots.push({file:'docs/browser-lab-20261029/'+file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }};
 try{await page.goto(origin+route,{waitUntil:'load'});await action(page,tools);assert.deepEqual(errors,[]);entry.status='PASS';entry.mutations=events.filter(e=>e.operation&&e.operation!=='read'||e.function||e.auth);console.log('PASS',width,name)}
 catch(error){entry.error=error.message;entry.body_excerpt=(await page.locator('body').innerText()).slice(-1800);throw error}
 finally{await context.close();await browser.close()}
}
async function ready(page){await page.waitForFunction(()=>!document.getElementById('workCheck').disabled)}
async function checked(page){await ready(page);await page.locator('#workCheck').check()}
async function submit(page){await checked(page);await page.locator('#applyBtn').click()}
try{
 runtime=await provision();
 for(const width of [390,1280]){
  await scenario(width,'loading_locked', {hold:'job'},'/apply-confirm.html?job=42',async(p,t)=>{
   await p.waitForFunction(()=>!!window.__fixture.holds.job);assert(await p.locator('#workCheck').isDisabled());assert(await p.locator('#applyBtn').isDisabled());
   await p.evaluate(()=>window.__fixture.release('job'));await ready(p);assert(await p.locator('#applyBtn').isDisabled());await p.locator('#workCheck').check();assert(await p.locator('#applyBtn').isEnabled());await t.snapshot('confirmation-ready');
  });
  await scenario(width,'normal_navigation_and_apply',{},'/driver.html',async(p,t)=>{
   await p.getByRole('button',{name:'応募する',exact:true}).click();await p.waitForURL('**/apply-confirm.html?job=42');await submit(p);await p.waitForURL(/driver\.html/);await waitFor(()=>count(t.events,'operation','insert')===1);assert(t.dialogs.some(x=>x.message==='応募しました。'));
  });
  await scenario(width,'declined_confirmation',{},'/apply-confirm.html?job=42',async(p,t)=>{t.setConfirm(false);await submit(p);assert(await p.locator('#applyBtn').isEnabled());assert.equal(count(t.events,'operation','insert'),0)});
  await scenario(width,'double_click_while_sending',{hold:'insert'},'/apply-confirm.html?job=42',async(p,t)=>{
   await submit(p);await p.waitForFunction(()=>!!window.__fixture.holds.insert);assert(await p.locator('#applyBtn').isDisabled());const box=await p.locator('#applyBtn').boundingBox();await p.mouse.click(box.x+box.width/2,box.y+box.height/2);await p.locator('#applyBtn').dispatchEvent('click');assert.equal(count(t.events,'operation','insert'),1);
   await p.evaluate(()=>window.__fixture.release('insert'));await p.waitForURL(/driver\.html/);assert.equal(count(t.events,'operation','insert'),1);
  });
  await scenario(width,'lost_response_history_hint',{mode:'transport'},'/apply-confirm.html?job=42',async(p,t)=>{await submit(p);await p.getByText('応募の完了を確認できませんでした。再送せず、応募履歴を確認してください。',{exact:true}).waitFor();assert(await p.locator('#applyBtn').isDisabled());await t.snapshot('confirmation-uncertain');await p.getByRole('link',{name:'応募履歴を確認する'}).click();await p.waitForURL('**/driver.html?view=work');assert.equal(count(t.events,'operation','insert'),1);assert(!t.dialogs.some(x=>x.message==='応募しました。'))});
  await scenario(width,'duplicate_not_success',{mode:'duplicate'},'/apply-confirm.html?job=42',async(p,t)=>{await submit(p);await p.getByText('すでに応募済みです。応募履歴を確認してください。',{exact:true}).waitFor();assert(await p.locator('#applyBtn').isDisabled());assert(!t.dialogs.some(x=>x.message==='応募しました。'))});
  await scenario(width,'missing_job_locked',{mode:'missing'},'/apply-confirm.html?job=42',async(p)=>{await p.locator('#retryBtn').waitFor();assert(await p.locator('#applyBtn').isDisabled());assert(await p.locator('#workCheck').isDisabled())});
  await scenario(width,'canceled_job_locked',{mode:'canceled'},'/apply-confirm.html?job=42',async(p)=>{await p.getByText('この求人は取り消されています。',{exact:true}).waitFor();assert(await p.locator('#applyBtn').isDisabled())});
  for(const mode of ['normal','zero_delete'])await scenario(width,'cancel_'+mode,{mode,hasApplication:true},'/driver.html?view=work',async(p,t)=>{
   await p.getByRole('button',{name:'応募をキャンセル',exact:true}).click();await waitFor(()=>count(t.events,'operation','delete')===1);await waitFor(()=>t.dialogs.some(x=>x.type==='alert'));assert(t.dialogs.some(x=>x.message.includes(mode==='normal'?'応募をキャンセルしました':'キャンセルできない状態')));if(mode==='zero_delete')assert(!t.dialogs.some(x=>x.message==='応募をキャンセルしました。'));
  });
  for(const portal of ['driver','company'])for(const mode of ['retention','withdraw_transport','withdraw_ok'])await scenario(width,portal+'_'+mode,{portal,mode},portal==='driver'?'/driver.html?view=profile':'/company.html',async(p,t)=>{
   await p.getByRole('button',{name:portal==='driver'?'退会して情報を削除する':'退会',exact:true}).click();await waitFor(()=>t.dialogs.some(x=>x.type==='alert'));
   assert.equal(count(t.events,'function','delete-account'),1);
   if(mode==='withdraw_ok'){await p.waitForURL(origin+'/');assert.equal(count(t.events,'auth','signOut'),1)}
   else{assert.equal(count(t.events,'auth','signOut'),0);assert(!t.dialogs.some(x=>x.message.startsWith('退会が完了')));assert(t.dialogs.some(x=>x.message.includes(mode==='retention'?'自動退会はできません':'完了を確認できません')));if(mode==='retention')await t.snapshot(portal+'-retention')}
  });
  for(const portal of ['driver','company'])await scenario(width,portal+'_double_withdraw',{portal,hold:'withdraw'},portal==='driver'?'/driver.html?view=profile':'/company.html',async(p,t)=>{
   const button=p.getByRole('button',{name:portal==='driver'?'退会して情報を削除する':'退会',exact:true});await button.click();await p.waitForFunction(()=>!!window.__fixture.holds.withdraw);await button.click();assert.equal(count(t.events,'function','delete-account'),1);assert.equal(t.dialogs.filter(x=>x.type==='confirm').length,2);await p.evaluate(()=>window.__fixture.release('withdraw'));await waitFor(()=>t.dialogs.some(x=>x.type==='alert'));
  });
  await scenario(width,'production_connections_blocked',{},'/apply-confirm.html?job=42',async(p)=>{
   await ready(p);assert.equal(await p.evaluate(async()=>{try{await fetch('https://wyxuekjikvflpcmlliwn.supabase.co/rest/v1/jobs');return true}catch{return false}}),false);
   assert(await p.evaluate(()=>window.__fixture.violations.some(v=>v.directive==='connect-src')));
  });
 }
 report.status='PASS_CHROMIUM_SYNTHETIC_UI_ONLY';
}catch(error){report.error=error.message;console.error('FAIL:',error.message);process.exitCode=1}
finally{if(runtime)await runtime.close();report.completed_at=new Date().toISOString();await writeFile(resolve(out,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,report.tests.filter(x=>x.status==='PASS').length+'/'+report.tests.length)}
