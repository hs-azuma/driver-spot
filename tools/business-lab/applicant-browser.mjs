// Actual company applicant HTML and local assets with an explicit in-memory SDK fixture.
import assert from 'node:assert/strict';
import {readFile, writeFile, realpath} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {provision} from '../browser-lab/launch.mjs';

const root=resolve(import.meta.dirname,'../..'),origin='https://spodora.test';
const report={status:'FAIL',production_access:false,real_data_used:false,checks:[],source_sha256:{},
  limitations:['Synthetic SDK and in-memory state; database authorization is covered separately',
    'Desktop Linux Chromium at mobile and desktop widths; no physical device or external delivery']};
function fixture(){
  const driver={id:7,name:'架空 太郎',name_kana:'カクウ タロウ',license_type:'大型',experience:'4年以上'};
  const makeJob=(id,title,status='募集中')=>({id,company_id:9,job_description:title,status,
    work_date:'2099-11-01',start_time:'09:00',end_time:'17:00',break_minutes:60,
    pay_type:'時給',pay_amount:1200,pay_guarantee:true,transportation_fee:500,required_headcount:2});
  const jobs=[makeJob(42,'架空求人A'),makeJob(44,'架空求人B'),makeJob(45,'終了済み求人','募集終了')];
  const applications=[{id:43,driver_id:7,status:'応募中',drivers:driver,jobs:jobs[1]},
    {id:46,driver_id:7,status:'勤務完了',checked_out_at:'2026-10-01T08:00:00Z',drivers:driver,jobs:jobs[2]}];
  const state={invocations:[],ratings:[],mutations:[],invitations:[],blocked:false};
  window.__applicantFixture=state;
  class Query{
    constructor(table){this.table=table;this.operation='read';this.filters=[]}
    select(){return this}order(){return this}in(){return this}range(){return this}
    eq(key,value){this.filters.push([key,value]);return this}
    maybeSingle(){return this}single(){return this}
    insert(row){this.operation='insert';this.row=row;return this}
    delete(){this.operation='delete';return this}
    then(resolve,reject){return this.run().then(resolve,reject)}
    async run(){
      if(this.operation!=='read'){
        if(this.table!=='company_driver_blocks')throw Error('Unexpected fixture write');
        state.mutations.push({table:this.table,operation:this.operation,row:this.row,filters:this.filters});
        state.blocked=this.operation==='insert';
        return {data:null,error:null};
      }
      const tables={
        companies:{id:9,company_name:'架空企業'},
        applications,jobs,
        company_driver_favorites:[{driver_id:7,drivers:driver}],
        company_job_invitations:state.invitations,
        company_driver_blocks:state.blocked?[{driver_id:7}]:[],
        reviews:state.ratings
      };
      if(!(this.table in tables))throw Error('Unexpected fixture read '+this.table);
      return {data:tables[this.table],error:null};
    }
  }
  const db={
    from:table=>new Query(table),
    auth:{getUser:async()=>({data:{user:{id:'synthetic-company'}},error:null})},
    rpc:async(name,body)=>{
      if(name!=='submit_work_review')throw Error('Unexpected fixture RPC');
      state.invocations.push({name,body});
      state.ratings=[{application_id:body.p_application_id,driver_rating:body.p_rating,company_comment:body.p_comment}];
      return {data:1,error:null};
    },
    functions:{invoke:async(name,{body})=>{
      if(name!=='company-job-invite')throw Error('Unexpected fixture function');
      state.invocations.push({name,body});
      state.invitations.push(...body.driver_ids.map(driver_id=>({driver_id,job_id:body.job_id,email_state:'skipped'})));
      return {data:{ok:true,created:body.driver_ids.length,email_sent:0,email_failed:0,skipped:0},error:null};
    }}
  };
  window.supabase={createClient:()=>db};
}
for(const name of ['tools/business-lab/applicant-browser.mjs','tools/browser-lab/launch.mjs','tools/browser-lab/package-lock.json']){
  report.source_sha256[name]=createHash('sha256').update(await readFile(resolve(root,name))).digest('hex');
}
const runtime=await provision();
let browser;
try{
  for(const width of [390,1280]){
    browser=await runtime.launch();report.browser=browser.version();
    const context=await browser.newContext({viewport:{width,height:1000},locale:'ja-JP',timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
    const errors=[];
    await context.addInitScript(fixture);
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin||request.method()!=='GET')return route.abort();
      const name=decodeURIComponent(url.pathname).slice(1);
      if(name!=='company-applicants.html'&&!name.startsWith('assets/'))return route.abort();
      try{
        const file=await realpath(resolve(root,name));
        if(!file.startsWith(root+sep))return route.abort();
        let body=await readFile(file);
        report.source_sha256[name]=createHash('sha256').update(body).digest('hex');
        if(name.endsWith('.html'))body=Buffer.from(body.toString().replace(/<script\b[^>]*src=["']https?:\/\/[^"']+["'][^>]*><\/script>/g,''));
        await route.fulfill({body,contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript',
          headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; form-action 'none'"}});
      }catch{return route.fulfill({status:404,body:'Not found'})}
    });
    const page=await context.newPage();page.setDefaultTimeout(8000);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    const check=(name,ok)=>{assert(ok,name);report.checks.push({width,name,status:'PASS'})};
    await page.goto(origin+'/company-applicants.html?view=favorites');
    await page.locator('#inviteJobSelect').waitFor();
    check('Closed job is excluded from invitation choices',(await page.locator('#inviteJobSelect option').allTextContents()).every(text=>!text.includes('終了済み')));
    await page.locator('#inviteJobSelect').selectOption('42');
    await page.locator('input[type=checkbox]').check();
    check('Selecting a recipient enables review',await page.locator('#inviteReviewBtn').isEnabled());
    await page.locator('#inviteJobSelect').selectOption('44');
    check('Existing applicant is excluded for that job',await page.locator('input[type=checkbox]').isDisabled());
    check('Job switch resets selected count',(await page.locator('#inviteSelectionCount').innerText()).startsWith('0人'));
    await page.locator('#inviteJobSelect').selectOption('42');
    await page.locator('input[type=checkbox]').check();
    await page.locator('#inviteReviewBtn').click();
    await page.getByRole('heading',{name:'求人案内の送信前確認'}).waitFor();
    check('Review shows chosen job and recipient',(await page.locator('#content').innerText()).includes('架空求人A')&&(await page.locator('#content').innerText()).includes('架空 太郎'));
    await page.locator('#inviteSendBtn').click();
    await page.getByText('この求人は案内済みです。',{exact:true}).waitFor();
    const state=await page.evaluate(()=>window.__applicantFixture);
    check('Invite action submits exactly the reviewed job and recipient',state.invocations.length===1&&state.invocations[0].body.job_id===42&&state.invocations[0].body.driver_ids.join(',')==='7');
    check('Already invited driver cannot be selected again',await page.locator('input[type=checkbox]').isDisabled());
    await page.getByRole('button',{name:'案内をブロック',exact:true}).click();
    await page.getByText('ブロック中：この企業からの求人案内は停止しています。',{exact:true}).waitFor();
    check('Blocked driver cannot be selected',await page.locator('input[type=checkbox]').isDisabled());
    await page.getByRole('button',{name:'ブロック解除',exact:true}).click();
    await page.getByText('この求人は案内済みです。',{exact:true}).waitFor();
    const changes=await page.evaluate(()=>window.__applicantFixture.mutations);
    check('Block and unblock target the signed-in company and driver',
      changes.length===2&&changes[0].row.company_id===9&&changes[0].row.driver_id===7&&
      changes[1].filters.some(([key,value])=>key==='company_id'&&value===9)&&
      changes[1].filters.some(([key,value])=>key==='driver_id'&&value===7));
    await page.locator('#applicantsMenu').click();
    await page.locator('#jobFilter').selectOption('44');
    check('Job filter shows only applications for the selected job',
      (await page.locator('#content').innerText()).includes('架空求人B')&&!(await page.locator('#content').innerText()).includes('終了済み求人'));
    check('Status counts belong to the selected job',(await page.locator('.summary-filter').first().innerText())==='すべて 1件');
    await page.locator('#jobFilter').selectOption('45');
    await page.locator('#f_done').click();
    check('Completed history survives the closed job filter',(await page.locator('#content').innerText()).includes('終了済み求人'));
    await page.getByRole('button',{name:'ドライバーを評価する',exact:true}).click();
    await page.locator('#workRatingScore').selectOption('4');
    await page.locator('#workRatingComment').fill('架空の画面評価');
    await page.locator('#workRatingSave').click();
    await page.getByText('架空の画面評価',{exact:true}).waitFor();
    const ratings=await page.evaluate(()=>window.__applicantFixture.invocations.filter(row=>row.name==='submit_work_review'));
    check('Rating UI submits company side and exact completed application',
      ratings.length===1&&ratings[0].body.p_application_id===46&&ratings[0].body.p_side==='company'&&ratings[0].body.p_rating===4);
    check('No page JavaScript errors',errors.length===0);
    await browser.close();browser=null;
  }
  report.status='PASS_APPLICANT_UI_WITH_SYNTHETIC_SDK';
}catch(error){report.error=error.message.split('\n')[0].slice(0,500);process.exitCode=1}
finally{
  if(browser)await browser.close();
  await runtime.close();
  report.completed_at=new Date().toISOString();
  await writeFile(resolve(root,'docs/business-lab-20261029/applicant-ui-result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,error:report.error}));
}
