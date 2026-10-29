import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {createClient}=createRequire(new URL('../sdk-lab/package.json',import.meta.url))('@supabase/supabase-js');
const root=new URL('../../',import.meta.url),base='https://business-fixture.invalid';
const applicantHTML=await readFile(new URL('company-applicants.html',root),'utf8');
const jobHTML=await readFile(new URL('job-create.html',root),'utf8');
const applicantSource=applicantHTML.slice(applicantHTML.indexOf('const applicantDecisionBusy='),applicantHTML.indexOf('setInterval(',applicantHTML.indexOf('const applicantDecisionBusy=')));
const jobSource=jobHTML.slice(jobHTML.indexOf('let publishUncertain='),jobHTML.indexOf('syncFeeRequirement();init();',jobHTML.indexOf('let publishUncertain=')));
function fixture(options={}){
 const calls={http:[],alerts:[],mail:0,refresh:0};
 const fetch=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url);assert.equal(url.origin,base);
  if(url.pathname.startsWith('/functions/v1/')){calls.mail++;return new Response(JSON.stringify(options.mailError?{error:'fixture mail failure'}:{ok:true}),{status:options.mailError?503:200,headers:{'Content-Type':'application/json'}})}
  const body=await req.text();calls.http.push({method:req.method,path:url.pathname,query:url.search,body:body?JSON.parse(body):null,prefer:req.headers.get('prefer')});
  if(options.hold)await options.hold;
  if(options.transport)throw new TypeError('Synthetic response lost');
  if(options.denied)return new Response(JSON.stringify({code:'42501',message:'fixture permission denied'}),{status:403});
  const data=options.missing?null:options.zero?[]:req.method==='PATCH'?[{id:43}]:url.pathname.includes('/rpc/')?42:{id:42};
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const client=createClient(base,'fixture-key',{auth:{autoRefreshToken:false,persistSession:false},global:{fetch,headers:{Authorization:'Bearer synthetic-token'}}});
 const elements=Object.fromEntries(['confirm','publishBtn','editBtn','previewMsg','publishStatusHint'].map(id=>[id,{disabled:false,checked:true,hidden:true,textContent:''}]));
 const ctx={db:client,company:{id:9},rows:[{id:43,status:'応募中'}],canHire:()=>!options.ineligible,phase:()=>options.ineligible?'done':'apply',confirm:()=>!options.declined,alert:m=>calls.alerts.push(m),load:async()=>{calls.refresh++;if(options.loadError)throw Error('fixture reload failure')},sendResultEmail:async()=>{calls.mail++;if(options.mailError)throw Error('fixture mail failure');return options.skipped?{skipped:'email_not_registered'}:{ok:true}},previewDraft:{company_id:9,job_description:'架空求人'},draftId:options.draft?55:null,$:id=>elements[id],location:{href:'unchanged'}};

 vm.createContext(ctx);return {ctx,calls,e:elements};
}
export async function actionChecks(check){
 for(const action of ['hire','reject']){
  function setup(options={}){const f=fixture(options);vm.runInContext(applicantSource,f.ctx);return f}
  await check(action+': exact row update and one notification',async()=>{const f=setup();await f.ctx[action](43);assert.equal(f.calls.http.length,1,JSON.stringify(f.calls));const q=new URLSearchParams(f.calls.http[0].query);assert.equal(q.get('id'),'eq.43');assert.equal(q.get('status'),'in.(応募中,採用候補)');assert.match(f.calls.http[0].prefer,/return=representation/);assert.equal(f.calls.http[0].body.status,action==='hire'?'勤務確定':'不採用');assert.equal(f.calls.mail,1,JSON.stringify(f.calls));assert(f.calls.alerts.some(m=>m.includes('送信を受け付けました')))});
  for(const [name,options] of [['zero rows',{zero:true}],['missing body',{missing:true}],['denied',{denied:true}],['lost response',{transport:true}],['ineligible',{ineligible:true}],['declined',{declined:true}]])await check(action+': '+name+' never sends notification',async()=>{const f=setup(options);await f.ctx[action](43);assert.equal(f.calls.mail,0);assert(!f.calls.alerts.some(m=>m.includes('確定しました。')||m.includes('送信を受け付けました')));if(options.zero||options.missing)assert.equal(f.calls.refresh,1)});
  await check(action+': skipped email does not claim sent',async()=>{const f=setup({skipped:true});await f.ctx[action](43);assert(f.calls.alerts.some(m=>m.includes('送信していません')))});
  await check(action+': notification failure preserves confirmed decision',async()=>{const f=setup({mailError:true});await f.ctx[action](43);assert(f.calls.alerts.some(m=>m.includes('は確定しましたが')));assert.equal(f.calls.http.length,1)});
  await check(action+': refresh failure does not reverse confirmed result',async()=>{const f=setup({loadError:true});await f.ctx[action](43);assert(f.calls.alerts.some(m=>m.includes('確定しました。')));assert(f.calls.alerts.some(m=>m.includes('表示を更新できません')));assert(!f.calls.alerts.some(m=>m.includes('完了を確認できません')))});
  await check(action+': overlapping choices send one mutation',async()=>{let release;const hold=new Promise(r=>release=r);const f=setup({hold});const first=f.ctx[action](43);await new Promise(r=>setImmediate(r));await f.ctx.hire(43);await f.ctx.reject(43);assert.equal(f.calls.http.length,1);release();await first;assert.equal(f.calls.mail,1)});
 }
 function setup(options={}){const f=fixture(options);vm.runInContext(jobSource,f.ctx);return f}
 for(const draft of [false,true])await check('publish '+(draft?'draft RPC':'direct insert')+': returns ID before notice',async()=>{const f=setup({draft});await f.ctx.save();assert.equal(f.calls.http.length,1);assert.equal(f.calls.mail,1);assert.equal(f.ctx.location.href,'./company.html');if(draft){assert.equal(f.calls.http[0].body.p_draft_id,55);assert.equal(f.calls.http[0].body.p_job.company_id,9)}else assert.equal(f.calls.http[0].body.company_id,9);await f.ctx.save();assert.equal(f.calls.http.length,1)});
 for(const options of [{transport:true},{missing:true}])await check('publish uncertain '+JSON.stringify(options)+': locks resend and editing',async()=>{const f=setup(options);await f.ctx.save();assert.equal(f.calls.mail,0);assert.equal(f.e.publishBtn.disabled,true);assert.equal(f.e.editBtn.disabled,true);assert.equal(f.e.publishStatusHint.hidden,false);assert.equal(f.ctx.location.href,'unchanged');await f.ctx.save();assert.equal(f.calls.http.length,1)});
 await check('publish explicit permission refusal can be corrected',async()=>{const f=setup({denied:true});await f.ctx.save();assert.equal(f.e.publishBtn.disabled,false);assert.equal(f.calls.mail,0);assert.match(f.e.previewMsg.textContent,/permission denied/)});
 await check('publish notice failure does not retry successful publication',async()=>{const f=setup({mailError:true});await f.ctx.save();assert.equal(f.calls.http.length,1);assert.equal(f.ctx.location.href,'./company.html');assert(f.calls.alerts.some(m=>m.includes('求人は掲載されましたが')));await f.ctx.save();assert.equal(f.calls.http.length,1)});
 await check('publish missing consent never sends',async()=>{const f=setup();f.e.confirm.checked=false;await f.ctx.save();assert.equal(f.calls.http.length,0)});
 await check('publish while pending ignores duplicate calls',async()=>{let release;const hold=new Promise(r=>release=r);const f=setup({hold});const first=f.ctx.save();await new Promise(r=>setImmediate(r));await f.ctx.save();assert.equal(f.calls.http.length,1);release();await first;assert.equal(f.calls.mail,1)});
 await check('publish result navigation exists in actual HTML',async()=>{assert.match(jobHTML,/id="publishStatusHint"[^>]*hidden/);assert.match(jobHTML,/企業マイページで掲載状況を確認する/)});
}
