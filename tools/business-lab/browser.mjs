import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {provision} from '../browser-lab/launch.mjs';
import {csp} from '../browser-lab/routing.mjs';
import {user,userId} from '../sdk-lab/http-fixture.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),origin='https://spodora.test';
const sdk=await readFile(resolve(root,'tools/sdk-lab/node_modules/@supabase/supabase-js/dist/umd/supabase.js'),'utf8');
const jwt=[{alg:'HS256',typ:'JWT'},{sub:userId,exp:4102444800,role:'authenticated'},'synthetic'].map((v,i)=>Buffer.from(i===2?v:JSON.stringify(v)).toString('base64url')).join('.');
const requestId='00000000-0000-4000-8000-000000000012';
const job={work_date:'2026-10-28',start_time:'09:00:00',end_time:'17:00:00',break_minutes:60,pay_type:'時給',pay_amount:1500,pay_guarantee:true,job_description:'架空の勤務'};
const request={id:requestId,application_id:43,status:'pending',requested_in:'2026-10-28T00:00:00Z',requested_out:'2026-10-28T06:00:00Z',break_minutes:60,requested_transportation_fee:500,driver_confirmed_at:'2026-10-28T06:01:00Z',requested_pay_guarantee:true,job_context:job,reason:'架空の確認'};
const app={id:43,jobs:job,drivers:{name:'テスト 太郎'}};
const wait=async test=>{for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,20))}throw Error('Timed out waiting for mock RPC')};
export async function businessBrowserChecks(check,report){
 const runtime=await provision();
 try{for(const width of [390,1280])for(const name of ['pay_approve','pay_consent','pay_fee_missing','pay_reject','pay_error','pay_double','qr_punch','qr_invalid','qr_error','qr_double'])await check('browser '+width+' '+name,async()=>{
  const browser=await runtime.launch();report.browser=browser.version();const calls=[],errors=[];let release;
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',locale:'ja-JP',timezoneId:'Asia/Tokyo'});
  await context.addInitScript({content:sdk+'\nwindow.supabase=supabase;'});
  await context.addInitScript(({jwt,user})=>localStorage.setItem('sb-spodora-auth-token',JSON.stringify({access_token:jwt,refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,expires_at:4102444800,user})),{jwt,user});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort('blockedbyclient');
   const headers={'Content-Security-Policy':csp.replace("connect-src 'none'","connect-src 'self'")};
   const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data),headers});
   if(url.pathname==='/auth/v1/user')return json(user);
   if(url.pathname==='/rest/v1/attendance_review_requests')return json([{...request,requested_transportation_fee:name==='pay_fee_missing'?null:500}]);
   if(url.pathname.startsWith('/rest/v1/rpc/')){
    const body=req.postDataJSON();calls.push({name:url.pathname.split('/').at(-1),body});
    if(url.pathname.endsWith('company_scan_work'))return json({company_name:'架空運送',work:[{id:43,title:'架空の勤務',work_date:'2026-10-28',start_time:'09:00:00',end_time:'17:00:00'}]});
    if(name.endsWith('_double'))await new Promise(r=>release=r);
    if(name==='qr_error'||name==='pay_error')return json({code:'42501',message:'架空の権限エラー'},403);
    if(url.pathname.endsWith('punch_company_qr'))return json({checked_in_at:'2026-10-28T00:00:00Z',checked_out_at:body.p_action==='out'?'2026-10-28T06:00:00Z':null,message:'打刻を記録しました',already_recorded:false});
    if(url.pathname.endsWith('decide_attendance_review'))return json({ok:true});
    return route.abort('blockedbyclient');
   }
   if(req.method()!=='GET')return route.abort('blockedbyclient');
   if(url.pathname==='/payroll-fixture.html'){
    const body=`<!doctype html><html lang="ja"><meta charset="utf-8"><script src="/assets/attendance-summary.js"></script><script src="/assets/attendance-review.js"></script><body><div id="reviews"></div><script>(async()=>{window.refreshed=0;const db=supabase.createClient('${origin}','fixture-key');await SpodoraReview.load(db,${JSON.stringify([app])},async()=>{window.refreshed++});document.getElementById('reviews').innerHTML=SpodoraReview.companyHtml()})()</script></body></html>`;
    return route.fulfill({status:200,contentType:'text/html',body,headers});
   }
   const allowed=['/attendance.html','/assets/attendance-qr.js','/assets/attendance-summary.js','/assets/attendance-review.js','/assets/supodora-logo-final.png'];
   if(!allowed.includes(url.pathname))return route.abort('blockedbyclient');
   let data=await readFile(resolve(root,'.'+url.pathname));
   if(['.html','.js'].includes(extname(url.pathname)))data=Buffer.from(data.toString().replaceAll('https://wyxuekjikvflpcmlliwn.supabase.co',origin).replace(/sb_publishable_[A-Za-z0-9_-]+/g,'fixture-key'));
   return route.fulfill({status:200,body:data,contentType:extname(url.pathname)==='.html'?'text/html; charset=utf-8':extname(url.pathname)==='.js'?'text/javascript':'image/png',headers});
  });
  const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try{
   if(name.startsWith('pay_')){
    await page.goto(origin+'/payroll-fixture.html');await page.getByRole('button',{name:'内容と交通費込みの金額を確認'}).click();
    const approve=page.locator('#reviewApprove');assert(await approve.isDisabled());
    if(name==='pay_consent'){assert.equal(calls.length,0)}
    else if(name==='pay_fee_missing'){await page.locator('#reviewConfirmed').check();assert(await approve.isDisabled());assert.match(await page.locator('#reviewPay').innerText(),/交通費の確認が未完了/);assert.equal(calls.length,0)}
    else if(name==='pay_reject'){
     await page.locator('#reviewReject').click();assert.match(await page.locator('#reviewMessage').innerText(),/差し戻し理由/);assert.equal(calls.length,0);
     await page.locator('#reviewComment').fill('架空の差し戻し理由');await page.locator('#reviewReject').click();await page.waitForFunction(()=>window.refreshed===1);assert.equal(calls[0].body.p_approve,false);
    }else{
     assert.match(await page.locator('#reviewPay').innerText(),/11,000円/);await page.locator('#reviewConfirmed').check();await approve.click();
     if(name==='pay_double'){await wait(()=>!!release);const box=await approve.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);assert.equal(calls.length,1);release()}
     if(name==='pay_error'){await page.getByText('架空の権限エラー',{exact:true}).waitFor();assert(await page.locator('#attendanceReviewModal').isVisible());assert.equal(await page.evaluate(()=>window.refreshed),0)}
     else{await page.waitForFunction(()=>window.refreshed===1);assert.equal(calls.length,1);assert.deepEqual(calls[0].body,{p_request_id:requestId,p_approve:true,p_comment:'',p_pay_guarantee:true})}
    }
   }else{
    await page.goto(origin+'/attendance.html'+(name==='qr_invalid'?'':'?company=00000000-0000-4000-8000-000000000009'));
    if(name==='qr_invalid'){await page.getByText('企業の出退勤QRを読み取ってください。',{exact:true}).waitFor();assert.equal(calls.length,0)}
    else{
     const button=page.getByRole('button',{name:'出勤する',exact:true});await button.click();
     if(name==='qr_double'){await wait(()=>!!release);const box=await button.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);assert.equal(calls.filter(c=>c.name==='punch_company_qr').length,1);release()}
     if(name==='qr_error'){await page.waitForFunction(()=>document.getElementById('msg').className==='error');assert.match(await page.locator('#msg').innerText(),/権限エラー/);assert.equal(await page.getByRole('button',{name:'出勤する',exact:true}).count(),1)}
     else{await page.getByRole('button',{name:'退勤する',exact:true}).waitFor();if(name==='qr_punch'){await page.getByRole('button',{name:'退勤する',exact:true}).click();await page.getByText('退勤済み',{exact:true}).waitFor();assert.deepEqual(calls.filter(c=>c.name==='punch_company_qr').map(c=>c.body.p_action),['in','out'])}}
    }
   }
   assert.deepEqual(errors,[]);
  }catch(error){throw Error(error.message+' | page: '+(await page.locator('body').innerText()).slice(-900)+' | JS: '+JSON.stringify(errors))}finally{await context.close();await browser.close()}
 });}finally{await runtime.close()}
}
