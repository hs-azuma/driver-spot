// Actual page action functions, synthetic transport, no network or browser rendering.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('driver.html','utf8');
const source=html.slice(html.indexOf('const applicationActions='),html.indexOf('async function showDriver()'));
function fixture(options={}){
 const calls={alerts:[],insert:[],deleted:0,refresh:0,login:0,profile:0,reads:0};
 const ctx={currentUser:options.guest?null:{id:'synthetic-user'},currentDriver:options.noProfile?null:{id:7},
  confirm:()=>options.confirm!==false,alert:m=>calls.alerts.push(m),showLogin:()=>calls.login++,showDriver:()=>calls.profile++,loadJobs:()=>calls.refresh++,showMyPage:()=>calls.refresh++,
  db:{from:table=>{
   if(table==='jobs')return {select:()=>({eq:()=>({single:async()=>{calls.reads++;return options.read?options.read():{data:options.job===undefined?{status:'募集中',required_headcount:1,applications:[]}:options.job,error:null}}})})};
   assert.equal(table,'applications');return {
    insert:async row=>{calls.insert.push(row);return options.write?options.write():{error:null}},
    delete:()=>({eq:()=>({select:async()=>{calls.deleted++;return options.write?options.write():{data:[{id:42}],error:null}}})})
   };
  }}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,calls};
}
test('apply: guest sees login without database access',async()=>{const {ctx,calls}=fixture({guest:true});await ctx.apply(42);assert.equal(calls.login,1);assert.equal(calls.reads,0)});
test('apply: missing profile requests profile setup',async()=>{const {ctx,calls}=fixture({noProfile:true});await ctx.apply(42);assert.equal(calls.profile,1);assert.equal(calls.reads,0)});
test('apply: success sends only current driver and pending status',async()=>{const {ctx,calls}=fixture();await ctx.apply(42);assert.equal(JSON.stringify(calls.insert),JSON.stringify([{job_id:42,driver_id:7,status:'応募中'}]));assert.deepEqual(calls.alerts,['応募しました。']);assert.equal(calls.refresh,1)});
for(const [label,job,message] of [['canceled',{status:'キャンセル'},/取り消され/],['full',{status:'募集中',required_headcount:1,applications:[{status:'勤務確定'}]},/募集人数/],['missing',null,/見つかりません/]])test('apply: '+label+' job cannot insert',async()=>{const {ctx,calls}=fixture({job});await ctx.apply(42);assert.equal(calls.insert.length,0);assert.match(calls.alerts[0],message)});
test('apply: declined confirmation cannot insert',async()=>{const {ctx,calls}=fixture({confirm:false});await ctx.apply(42);assert.equal(calls.insert.length,0)});
test('apply: duplicate SQLSTATE maps to already applied',async()=>{const {ctx,calls}=fixture({write:async()=>({error:{code:'23505',message:'unique violation'}})});await ctx.apply(42);assert.deepEqual(calls.alerts,['すでに応募済みです。']);assert.equal(calls.refresh,0)});
test('apply: precheck failure does not insert or claim success',async()=>{const {ctx,calls}=fixture({read:async()=>({error:{message:'fixture permission denied'}})});await ctx.apply(42);assert.equal(calls.insert.length,0);assert.deepEqual(calls.alerts,['fixture permission denied'])});
for(const action of ['apply','cancelApp']){
 test(action+': transport failure is uncertain, retry is unlocked',async()=>{let attempts=0;const {ctx,calls}=fixture({write:async()=>{if(++attempts===1)throw Error('synthetic transport');return action==='apply'?{error:null}:{data:[{id:42}],error:null}}});await ctx[action](42);assert.match(calls.alerts[0],/完了を確認できません/);assert.equal(calls.refresh,0);await ctx[action](42);assert.equal(attempts,2);assert.equal(calls.refresh,1)});
 test(action+': overlapping clicks send one mutation',async()=>{let release;const gate=new Promise(r=>release=r);const {ctx,calls}=fixture({write:()=>gate});const first=ctx[action](42);await Promise.resolve();await ctx[action](42);assert.equal(calls.insert.length+calls.deleted,1);release({data:[{id:42}],error:null});await first;assert.equal(calls.refresh,1)});
}
