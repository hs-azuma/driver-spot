import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../functions/delete-account/handler.ts';
function setup(options={}){
 const calls=[];
 const admin={rpc:async(name,args)=>{calls.push(['preflight',name,args]);return options.preflight||{data:{mode:'ready'},error:null}},auth:{admin:{
  signOut:async(jwt,scope)=>{calls.push(['revoke',jwt,scope]);return {error:options.revokeError||null}},
  deleteUser:async(id,soft)=>{calls.push(['deleteAuth',id,soft]);return {error:options.deleteError||null}}
 }},from:()=>{throw Error('Direct profile deletion forbidden')}};
 const handler=createHandler({env:key=>key,createClient:(_url,key)=>key==='SUPABASE_ANON_KEY'?{auth:{getUser:async()=>options.invalid?{error:{},data:{user:null}}:{data:{user:{id:'verified-user'}},error:null}}}:admin});
 return {handler,calls};
}
const request=()=>new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer fixture-jwt'},body:JSON.stringify({user_id:'attacker-target'})});
test('withdrawal uses verified identity, revokes sessions, then deletes Auth only',async()=>{
 const {handler,calls}=setup();assert.equal((await handler(request())).status,200);
 assert.deepEqual(calls,[['preflight','withdrawal_preflight',{p_user_id:'verified-user'}],['revoke','fixture-jwt','global'],['deleteAuth','verified-user',false]]);
});
test('withdrawal with records does not revoke or delete',async()=>{
 const {handler,calls}=setup({preflight:{data:{mode:'review_required'},error:null}});
 const r=await handler(request());assert.equal(r.status,409);assert.equal((await r.json()).error,'retention_review_required');assert.equal(calls.length,1);
});
test('withdrawal fails closed when readiness RPC is missing, disabled or malformed',async()=>{
 for(const preflight of [{error:{message:'missing'}},{data:{mode:'unavailable'}},{data:{mode:'unexpected'}},{data:null}]){
  const {handler,calls}=setup({preflight});assert.equal((await handler(request())).status,503);assert.equal(calls.length,1);
 }
});
test('withdrawal session revocation failure prevents deletion',async()=>{
 const {handler,calls}=setup({revokeError:{message:'unavailable'}});assert.equal((await handler(request())).status,503);
 assert(!calls.some(c=>c[0]==='deleteAuth'));
});
test('withdrawal reports Auth failure without attempting direct profile removal',async()=>{
 const {handler,calls}=setup({deleteError:{message:'synthetic failure'}});assert.equal((await handler(request())).status,503);assert.equal(calls.filter(c=>c[0]==='deleteAuth').length,1);
});
test('withdrawal maps a post-preflight retention race to operator review',async()=>{
 const {handler}=setup({deleteError:{message:'withdrawal_retention_review_required'}});assert.equal((await handler(request())).status,409);
});
test('withdrawal invalid login, missing bearer, and unsupported methods perform no admin work',async()=>{
 const {handler,calls}=setup({invalid:true});assert.equal((await handler(request())).status,401);
 assert.equal((await handler(new Request('https://example.invalid',{method:'POST'}))).status,401);
 assert.equal((await handler(new Request('https://example.invalid'))).status,405);
 assert.equal((await handler(new Request('https://example.invalid',{method:'OPTIONS'}))).status,200);assert.deepEqual(calls,[]);
});
