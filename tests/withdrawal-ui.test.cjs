const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const file of ['driver.html','company.html']){
 const source=fs.readFileSync(file,'utf8');
 const helper=source.match(/async function withdrawalErrorMessage\(r\)\{[\s\S]*?\}(?=\s*let withdrawalPending)/)[0];
 const action=source.match(/async function deleteAccount\(\)\{[\s\S]*?\}(?=\s*async function (?:switchDriverAccount|logout))/)[0];
 function context(result){
  const calls={alerts:[],signOut:0,invoke:0};
  const ctx={currentUser:{id:'fixture'},user:{id:'fixture'},confirm:()=>true,alert:m=>calls.alerts.push(m),location:{href:'unchanged'},db:{functions:{invoke:async()=>{calls.invoke++;return result}},auth:{signOut:async()=>{calls.signOut++}}}};
  vm.createContext(ctx);vm.runInContext(helper+'\nlet withdrawalPending=false;\n'+action,ctx);return {ctx,calls};
 }
 test(file+': retention refusal never shows success or signs out locally',async()=>{
  const {ctx,calls}=context({data:{error:'retention_review_required'},error:null});await ctx.deleteAccount();
  assert.match(calls.alerts[0],/自動退会はできません/);assert.equal(calls.signOut,0);assert.equal(ctx.location.href,'unchanged');
 });
 test(file+': HTTP error body maps to retention explanation',async()=>{
  const {ctx}=context({});assert.match(await ctx.withdrawalErrorMessage({error:{context:{json:async()=>({error:'retention_review_required'})}}}),/運営/);
 });
 test(file+': confirmed success signs out and navigates',async()=>{
  const {ctx,calls}=context({data:{ok:true},error:null});await ctx.deleteAccount();assert.equal(calls.signOut,1);assert.equal(ctx.location.href,'./');assert.match(calls.alerts[0],/退会が完了/);
 });
}

// Test the same action paths for both independent account portals.
for(const file of ['driver.html','company.html']){
 const html=fs.readFileSync(file,'utf8');
 const helper=html.slice(html.indexOf('async function withdrawalErrorMessage'),html.indexOf('let withdrawalPending'));
 const action=html.slice(html.indexOf('let withdrawalPending'),html.indexOf('async function '+(file==='driver.html'?'switchDriverAccount':'logout')));
 function fixture(invoke,answers=[true,true],signOut=async()=>{}){
  const calls={alerts:[],invoke:0,signOut:0};
  const ctx={currentUser:{id:'synthetic-driver'},user:{id:'synthetic-company'},confirm:()=>answers.shift()??false,alert:m=>calls.alerts.push(m),location:{href:'unchanged'},db:{functions:{invoke:async(name,options)=>{calls.invoke++;assert.equal(name,'delete-account');assert.equal(JSON.stringify(options),'{"body":{}}');return invoke()}},auth:{signOut:async()=>{calls.signOut++;return signOut()}}}};
  vm.createContext(ctx);vm.runInContext(helper+action,ctx);return {ctx,calls};
 }
 for(const answers of [[false],[true,false]])test(file+': declining either confirmation stops withdrawal '+answers.join(','),async()=>{const {ctx,calls}=fixture(async()=>({data:{ok:true}}),answers);await ctx.deleteAccount();assert.equal(calls.invoke,0);assert.equal(calls.signOut,0)});
 test(file+': overlapping withdrawal actions send one request',async()=>{let release;const gate=new Promise(r=>release=r);const {ctx,calls}=fixture(()=>gate);const first=ctx.deleteAccount();await ctx.deleteAccount();assert.equal(calls.invoke,1);release({data:{ok:true},error:null});await first;assert.equal(calls.signOut,1)});
 test(file+': transport exception is explained and retry unlocked',async()=>{let attempts=0;const {ctx,calls}=fixture(async()=>{if(++attempts===1)throw Error('synthetic transport');return {data:{ok:true}}},[true,true,true,true]);await ctx.deleteAccount();assert.match(calls.alerts[0],/完了を確認できません/);assert.equal(calls.signOut,0);assert.equal(ctx.location.href,'unchanged');await ctx.deleteAccount();assert.equal(calls.invoke,2);assert.equal(calls.signOut,1)});
 for(const result of [{data:null,error:null},{data:{ok:false},error:null},{data:{error:'unauthorized'},error:null},{error:{context:{json:async()=>{throw Error('invalid JSON')}}}}])test(file+': unconfirmed deletion never navigates '+JSON.stringify(result),async()=>{const {ctx,calls}=fixture(async()=>result);await ctx.deleteAccount();assert.equal(calls.signOut,0);assert.equal(ctx.location.href,'unchanged');assert.equal(calls.alerts.length,1);assert(!calls.alerts[0].includes('退会が完了'))});
 test(file+': confirmed remote deletion still navigates if local signout throws',async()=>{const {ctx,calls}=fixture(async()=>({data:{ok:true}}),[true,true],async()=>{throw Error('synthetic local signout')});await ctx.deleteAccount();assert.equal(ctx.location.href,'./');assert.match(calls.alerts[0],/退会が完了/)});
}
