// Actual HTML + actual SDK + isolated native Auth/DB/Functions. All non-loopback traffic is refused.
import assert from 'node:assert/strict';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {provision} from '../browser-lab/launch.mjs';
const {createClient}=createRequire(new URL('../sdk-lab/package.json',import.meta.url))('@supabase/supabase-js');
let raw='';for await(const c of process.stdin)raw+=c;const p=JSON.parse(raw);raw='';
assert.equal(process.env.GITHUB_ACTIONS,'true');const api=new URL(p.url);assert.equal(api.protocol,'http:');assert(['127.0.0.1','localhost'].includes(api.hostname));assert.equal(api.pathname,'/');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),origin='https://spodora.test',checks=[],source_sha256={};let stage='initialization',runtime,browser,driverBrowser,companyPage,external=0;
const check=(name,ok)=>{assert(ok);checks.push(name)};
const report={api_errors:[],status:'FAIL',production_access:false,real_data_used:false,checks,source_sha256,limits:['Test-only URL/key substitution, CSP and CORS bridging; no production deployment','Synthetic company provisioned by fixture; driver registration uses actual account-auth UI','QR token is transferred in test; physical camera and biometrics are not exercised','Missing provider configuration returns failure; no real email or LINE delivery']};
const sdk=await readFile(resolve(root,'tools/sdk-lab/node_modules/@supabase/supabase-js/dist/umd/supabase.js'));
const admin=createClient(p.url,p.service,{auth:{persistSession:false,autoRefreshToken:false}});
const companyDb=createClient(p.url,p.anon,{auth:{persistSession:false,autoRefreshToken:false}});
async function context(instance=browser){const c=await instance.newContext({viewport:{width:390,height:1000},timezoneId:'Asia/Tokyo',locale:'ja-JP',serviceWorkers:'block'});
 await c.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
  if(u.origin===api.origin){
   if(!/^\/(auth\/v1\/|rest\/v1\/|functions\/v1\/(account-auth|application-result-email)(?:$|\/))/.test(u.pathname))return route.abort();
   // Browser response bodies are actual native service responses; only test CORS headers are changed.
   try{const headers={...req.headers(),origin:'https://spodora.com'};const r=await route.fetch({headers,maxRedirects:0,timeout:30000});if(r.status()>=400&&u.pathname.startsWith('/rest/v1/')){let e;try{e=await r.json()}catch{}report.api_errors.push({path:u.pathname,status:r.status(),code:typeof e?.code==='string'&&/^[A-Z0-9]{5,10}$/.test(e.code)?e.code:null,message:typeof e?.message==='string'?e.message.replace(/eyJ[A-Za-z0-9_.-]+/g,'[redacted]').slice(0,180):null})}return route.fulfill({response:r,headers:{...r.headers(),'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'}})}catch{return route.abort()}
  }
  if(u.origin!==origin){external++;return route.abort('blockedbyclient')}
  if(req.method()!=='GET')return route.abort();
  const csp=`default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src ${api.origin}; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'self'`;
  if(u.pathname==='/__sdk.js')return route.fulfill({contentType:'application/javascript',body:sdk,headers:{'Content-Security-Policy':csp}});
  if(u.pathname==='/__start')return route.fulfill({contentType:'text/html',body:'<!doctype html><script src="/__sdk.js"></script>',headers:{'Content-Security-Policy':csp}});
  let name;try{name=decodeURIComponent(u.pathname).slice(1)}catch{return route.abort()}
  if(!name)name='index.html';if(name.includes('..')||name.includes('\\')||!(name.endsWith('.html')&&!name.includes('/')||name==='areas.js'||name.startsWith('assets/')))return route.abort();
  try{const file=await realpath(resolve(root,name));if(!file.startsWith(root+sep))return route.abort();let body=await readFile(file);source_sha256[name]=createHash('sha256').update(body).digest('hex');
   if(/\.(html|js)$/.test(name)){let s=body.toString().replaceAll('https://wyxuekjikvflpcmlliwn.supabase.co',p.url).replaceAll('sb_publishable_YCin6s4LUf-5Xk44OmU6zQ_gDk9ThSC',p.anon);s=s.replace(/<script\b[^>]*src=["']https?:\/\/[^"']+["'][^>]*><\/script>/g,tag=>tag.includes('@supabase/supabase-js@')?'<script src="/__sdk.js"></script>':'');body=Buffer.from(s)}
   const type={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[extname(name)]||'application/octet-stream';return route.fulfill({body,contentType:type,headers:{'Content-Security-Policy':csp}});
  }catch{return route.fulfill({status:404,body:'Not found'})}
 });return c}
async function pageFor(c){const page=await c.newPage();page.setDefaultTimeout(20000);page.on('dialog',d=>d.accept());return page}
async function session(page,user){await page.goto(origin+'/__start');const ok=await page.evaluate(async({url,anon,user})=>{const db=supabase.createClient(url,anon);const r=await db.auth.signInWithPassword({email:user.email,password:user.password});return !r.error},{url:p.url,anon:p.anon,user});check('Browser real password authentication',ok)}
async function poll(fn){for(let i=0;i<100;i++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,100))}throw Error('timeout')}
try{
 runtime=await provision();browser=await runtime.launch();report.browser=browser.version();driverBrowser=await runtime.launch();const cc=await context(),dc=await context(driverBrowser),cp=await pageFor(cc),dp=await pageFor(dc);companyPage=cp;
 stage='company_login';const companyAuth=await companyDb.auth.signInWithPassword({email:p.company.email,password:p.company.password});assert(!companyAuth.error);await session(cp,p.company);
 stage='driver_registration';await dp.goto(origin+'/driver-register.html');const loginId='e2e_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('base64url');
 for(const [id,value] of Object.entries({loginId,password,password2:password,name:'架空 検証',nameKana:'カクウ ケンショウ',phone:'00000000000'}))await dp.locator('#'+id).fill(value);
 await dp.locator('#signupBtn').click();await dp.locator('#confirmationPanel').waitFor({state:'visible'});check('Driver registration UI commits through actual account-auth and GoTrue',true);
 const profile=await poll(async()=>{const r=await admin.from('account_login_ids').select('user_id').eq('login_id',loginId).maybeSingle();if(r.error)throw r.error;return r.data});
 const driver=await admin.from('drivers').select('id,name').eq('user_id',profile.user_id).single();check('Registered driver profile exists in real database',!driver.error&&driver.data.name==='架空 検証');
 stage='publish_ui';await session(cp,p.company);await cp.goto(origin+'/job-create.html');await cp.locator('#postBtn').waitFor({state:'visible'});await poll(()=>cp.locator('#postBtn').isEnabled());
 await cp.locator('#postBtn').click();await cp.locator('[aria-invalid="true"]').first().waitFor();check('Empty job form refuses publication',true);
 stage='publish_fill_fields';for(const [id,value] of Object.entries({desc:'Synthetic UI end-to-end',head:'1',date:p.today,start:'23:00',end:'23:59',pay:'1200',loc:'Synthetic site',fee:'500'}))await cp.locator('#'+id).fill(value);
 stage='publish_select_fields';for(const [id,value] of Object.entries({break:'0',pref:'大阪府',ptype:'時給',guarantee:'true',feeType:'金額指定'}))await cp.locator('#'+id).selectOption(value);
 stage='publish_preview';await cp.locator('#mun').selectOption({index:1});await cp.locator('#postBtn').click();await cp.locator('#jobPreview').waitFor({state:'visible'});await cp.locator('#confirm').check();stage='publish_commit';await cp.locator('#publishBtn').click();await cp.waitForURL('**/company.html');
 const job=await poll(async()=>{const r=await companyDb.from('jobs').select('id,work_date,pay_amount,required_headcount').eq('job_description','Synthetic UI end-to-end').single();return !r.error&&r.data});check('Job preview and publish UI creates exactly one actual job',job.required_headcount===1&&job.pay_amount===1200);
 stage='apply_ui';await dp.goto(origin+'/apply-confirm.html?job='+job.id);await poll(()=>dp.locator('#workCheck').isEnabled());await dp.locator('#workCheck').check();await dp.locator('#applyBtn').click();await dp.waitForURL('**/driver.html');
 const application=await poll(async()=>{const r=await companyDb.from('applications').select('id,status').eq('job_id',job.id).eq('driver_id',driver.data.id).single();return !r.error&&r.data});check('Application checkbox and submit UI commit one actual application',application.status==='応募中');
 stage='duplicate_ui';await dp.goto(origin+'/apply-confirm.html?job='+job.id);await poll(()=>dp.locator('#workCheck').isEnabled());await dp.locator('#workCheck').check();await dp.locator('#applyBtn').click();await dp.locator('#msg').filter({hasText:/すでに応募済み|この時間帯は別の求人に応募済み/}).waitFor();const duplicateRows=await companyDb.from('applications').select('id').eq('job_id',job.id).eq('driver_id',driver.data.id);check('Actual duplicate or overlap guard refuses a second UI application',!duplicateRows.error&&duplicateRows.data.length===1);
 stage='hire_ui';await cp.goto(origin+'/company-applicants.html?job='+job.id);await cp.getByRole('button',{name:'採用',exact:true}).click();await poll(async()=>{const r=await companyDb.from('applications').select('status').eq('id',application.id).single();return r.data?.status==='勤務確定'});check('Company hiring UI updates real application despite unavailable email provider',true);
 const qr=await companyDb.rpc('attendance_company_qr',{p_regenerate:false});assert(!qr.error&&qr.data.token);
 stage='attendance_ui';await dp.goto(origin+'/attendance.html?company='+qr.data.token);await dp.getByRole('button',{name:'出勤する',exact:true}).click();await dp.getByRole('button',{name:'退勤する',exact:true}).waitFor();check('QR attendance UI commits actual check-in',true);await new Promise(r=>setTimeout(r,1100));await dp.getByRole('button',{name:'退勤する',exact:true}).click();await dp.getByText('退勤済み',{exact:true}).waitFor();check('QR attendance UI commits actual check-out',true);
 stage='pay_request_ui';await dp.goto(origin+'/driver.html?view=work');const requestButton=dp.getByRole('button',{name:'勤怠・給与を確認して申請',exact:true});if(!(await requestButton.count())){await dp.getByRole('button',{name:/勤務履歴/}).first().click()}await requestButton.click();await dp.locator('[name="rest"]').fill('0');await dp.locator('[name="reason"]').fill('Synthetic UI verification');await dp.locator('[name="confirmed"]').check();await dp.getByRole('button',{name:'この内容で企業に申請する',exact:true}).click();await poll(async()=>{const r=await companyDb.from('attendance_review_requests').select('id,status').eq('application_id',application.id).single();return r.data?.status==='pending'});check('Driver payroll confirmation modal commits actual request',true);
 stage='pay_approve_ui';await cp.goto(origin+'/company-workforce.html');await cp.getByRole('button',{name:'内容と交通費込みの金額を確認',exact:true}).click();await cp.locator('#reviewConfirmed').check();await cp.getByRole('button',{name:'この金額で承認する',exact:true}).click();const approved=await poll(async()=>{const r=await companyDb.from('attendance_review_requests').select('status,approved_total_amount').eq('application_id',application.id).single();return r.data?.status==='approved'&&r.data});check('Company payroll approval modal commits actual amount',Number(approved.approved_total_amount)===1680);
 check('All browser external requests blocked',external===0);report.status='PASS_NATIVE_BROWSER_REGISTRATION_TO_PAYROLL';
}catch{if(companyPage&&!companyPage.isClosed()&&stage.startsWith('publish')){report.publish_diagnostic={path:new URL(companyPage.url()).pathname,message:await companyPage.locator('#previewMsg').textContent().catch(()=>null),button:await companyPage.locator('#publishBtn').textContent().catch(()=>null)}}report.failed_stage=stage;report.error='Browser/native integration failed; no page contents, credentials or recovery codes included';process.exitCode=1}
finally{if(driverBrowser)await driverBrowser.close();if(browser)await browser.close();if(runtime)await runtime.close();report.external_requests_blocked=external;process.stdout.write(JSON.stringify(report))}
