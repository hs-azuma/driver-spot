const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const file of ['driver.html','company.html']){
 const source=fs.readFileSync(file,'utf8');
 const helper=source.match(/async function withdrawalErrorMessage\(r\)\{[\s\S]*?\}(?=\s*async function deleteAccount)/)[0];
 const action=source.match(/async function deleteAccount\(\)\{[\s\S]*?\}(?=async function (?:switchDriverAccount|logout))/)[0];
 function context(result){
  const calls={alerts:[],signOut:0,invoke:0};
  const ctx={currentUser:{id:'fixture'},user:{id:'fixture'},confirm:()=>true,alert:m=>calls.alerts.push(m),location:{href:'unchanged'},db:{functions:{invoke:async()=>{calls.invoke++;return result}},auth:{signOut:async()=>{calls.signOut++}}}};
  vm.createContext(ctx);vm.runInContext(helper+'\n'+action,ctx);return {ctx,calls};
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
