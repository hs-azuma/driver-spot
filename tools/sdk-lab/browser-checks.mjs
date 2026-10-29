import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {provision} from '../browser-lab/launch.mjs';
import {origin,csp,localResource} from '../browser-lab/routing.mjs';
import {user,userId} from './http-fixture.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),fonts=resolve(root,'tools/browser-lab/node_modules/@fontsource/noto-sans-jp');
const sdk=await readFile(resolve(here,'node_modules/@supabase/supabase-js/dist/umd/supabase.js'),'utf8');
const jwt=[{alg:'HS256',typ:'JWT'},{sub:userId,role:'authenticated',aud:'authenticated',exp:4102444800,iat:1767225600},'synthetic'].map((x,i)=>Buffer.from(i===2?x:JSON.stringify(x)).toString('base64url')).join('.');
const job={id:42,company_id:9,status:'募集中',required_headcount:2,hired_count:0,applications:[],job_description:'実SDK用の架空求人',location:'架空県 テスト市',work_date:'2099-11-01',start_time:'09:00:00',end_time:'17:00:00',pay_type:'時給',pay_amount:1500,pay_guarantee:true,break_minutes:60,companies:{company_name:'架空運送'}};
const driver={id:7,user_id:userId,name:'テスト 太郎',name_kana:'テスト タロウ',preferred_area:'',is_paused:false};
export async function browserChecks(check,report){
 const runtime=await provision();
 try{for(const width of [390,1280])for(const name of ['normal_apply','lost_response','duplicate','zero_delete','driver_retention','company_retention','driver_withdraw_success','company_withdraw_success']){
  await check('real SDK browser '+width+': '+name,async()=>{
   const browser=await runtime.launch(),calls=[],errors=[],dialogs=[];report.browser=browser.version();
   const context=await browser.newContext({viewport:{width,height:1000},locale:'ja-JP',timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
   await context.addInitScript({content:sdk+'\nwindow.supabase=supabase;'});
   await context.addInitScript(({user,jwt})=>{localStorage.setItem('sb-spodora-auth-token',JSON.stringify({access_token:jwt,refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,expires_at:4102444800,user}))},{user,jwt});
   let submitted=false;
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin)return route.abort('blockedbyclient');
    if(url.pathname.startsWith('/auth/v1/')||url.pathname.startsWith('/rest/v1/')||url.pathname.startsWith('/functions/v1/')){
     let body;try{body=req.postDataJSON()}catch{body=null}
     calls.push({method:req.method(),path:url.pathname,query:url.search,body,bearer:req.headers()['authorization']==='Bearer '+jwt,prefer:req.headers()['prefer']||null});
     const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
     if(url.pathname==='/auth/v1/user')return respond(user);
     if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204});
     if(url.pathname==='/rest/v1/rpc/get_job_hiring_counts')return respond([{job_id:42,hired_count:0}]);
     if(url.pathname==='/functions/v1/delete-account')return name.endsWith('success')?respond({ok:true}):respond({error:'retention_review_required'},409);
     const table=url.pathname.slice('/rest/v1/'.length),singular=(req.headers()['accept']||'').includes('vnd.pgrst.object+json');
     if(table==='drivers')return respond(singular?driver:[driver]);
     if(table==='companies'){const company={id:9,user_id:userId,company_name:'架空運送',email:user.email};return respond(singular?company:[company])}
     if(table==='company_public_names')return respond([{company_id:9,company_name:'架空運送'}]);
     if(table==='jobs')return respond(singular?job:name.startsWith('company')?[]:[job]);
     if(table==='applications'){
      if(req.method()==='POST'){
       if(name==='lost_response')return route.abort('failed');
       if(name==='duplicate')return respond({code:'23505',message:'unique violation',details:'',hint:''},409);
       submitted=true;return route.fulfill({status:201});
      }
      if(req.method()==='DELETE')return respond([]);
      return respond(submitted||name==='zero_delete'?[{id:43,job_id:42,driver_id:7,status:'応募中',jobs:job}]:[]);
     }
     if(req.method()!=='GET'&&req.method()!=='HEAD')return route.abort('blockedbyclient');
     return respond([]);
    }
    const resource=localResource(req.url(),req.method(),root,fonts);
    if(!resource)return route.abort('blockedbyclient');
    const headers={'Content-Security-Policy':csp.replace("connect-src 'none'","connect-src 'self'")};
    if(resource.landing)return route.fulfill({status:200,contentType:'text/html',body:'<h1>架空ホーム</h1>',headers});
    try{
     let body=await readFile(resource.file);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
     if(resource.html){
      const source=body.toString(),pattern=/supabase\.createClient\('[^']+','[^']+'/;
      assert(pattern.test(source),'Application client bootstrap must match scoped fixture rewrite');
      body=Buffer.from(source.replace(pattern,"supabase.createClient('https://spodora.test','fixture-publishable'"));
     }
     return route.fulfill({status:200,body,contentType:types[extname(resource.file)]||'application/octet-stream',headers});
    }catch{return route.fulfill({status:404,body:'Not found'})}
   });
   const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
   try{
    const portal=name.startsWith('company')?'company':'driver';
    await page.goto(origin+(name.includes('retention')||name.includes('withdraw_success')?(portal==='driver'?'/driver.html?view=profile':'/company.html'):name==='zero_delete'?'/driver.html?view=work':name==='normal_apply'?'/driver.html':'/apply-confirm.html?job=42'),{waitUntil:'load'});
    if(name.includes('retention')||name.includes('withdraw_success')){
     await page.getByRole('button',{name:portal==='driver'?'退会して情報を削除する':'退会',exact:true}).click();
     if(name.endsWith('success')){await page.waitForURL(origin+'/');assert(dialogs.some(m=>m.startsWith('退会が完了')));assert.equal(calls.filter(c=>c.path==='/auth/v1/logout').length,1)}
     else{for(let i=0;i<100&&!dialogs.some(m=>m.includes('自動退会はできません'));i++)await new Promise(r=>setTimeout(r,20));assert(dialogs.some(m=>m.includes('自動退会はできません')));assert(!calls.some(c=>c.path==='/auth/v1/logout'))}
     assert.equal(calls.filter(c=>c.path==='/functions/v1/delete-account').length,1);
    }else if(name==='zero_delete'){
     await page.getByRole('button',{name:'応募をキャンセル',exact:true}).click();for(let i=0;i<100&&!dialogs.some(m=>m.includes('キャンセルできない状態'));i++)await new Promise(r=>setTimeout(r,20));assert(dialogs.some(m=>m.includes('キャンセルできない状態')));const deletion=calls.filter(c=>c.method==='DELETE');assert.equal(deletion.length,1);assert.match(deletion[0].prefer,/return=representation/);
    }else{
     if(name==='normal_apply'){await page.getByRole('button',{name:'応募する',exact:true}).click();await page.waitForURL('**/apply-confirm.html?job=42')}
     await page.waitForFunction(()=>!document.getElementById('workCheck').disabled);await page.locator('#workCheck').check();await page.locator('#applyBtn').click();
     if(name==='normal_apply'){await page.waitForURL(/driver\.html/);assert(dialogs.includes('応募しました。'))}
     else{await page.waitForFunction(()=>document.getElementById('historyHint').hidden===false);assert(await page.locator('#applyBtn').isDisabled());assert(!dialogs.includes('応募しました。'));assert.match(await page.locator('#msg').innerText(),name==='duplicate'?/すでに応募済み/:/完了を確認できません/)}
     const inserts=calls.filter(c=>c.method==='POST'&&c.path==='/rest/v1/applications');assert.equal(inserts.length,1);assert.deepEqual(inserts[0].body,{job_id:42,driver_id:7,status:'応募中'});
    }
    assert(calls.length>0);assert(calls.every(c=>c.bearer));assert.deepEqual(errors,[]);
   }catch(error){throw new Error(error.message+' | page: '+(await page.locator('body').innerText()).slice(-1300)+' | script errors: '+JSON.stringify(errors)+' | requests: '+JSON.stringify(calls.map(c=>c.method+' '+c.path)))}finally{await context.close();await browser.close()}
  });
 }}finally{await runtime.close()}
}
