import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createHandler} from '../../supabase/functions/delete-account/handler.ts';
import {base,userId,createTransport,json} from './http-fixture.mjs';
const anon='fixture-publishable',service='fixture-service',jwt='fixture-user-token';
export async function nodeChecks(check){
 function handlerFixture(options={}){
  const transport=createTransport(options);
  const handler=createHandler({env:key=>({SUPABASE_URL:base,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service})[key],createClient:(url,key,opts={})=>createClient(url,key,{...opts,auth:{persistSession:false,autoRefreshToken:false},global:{...opts.global,fetch:transport.fetch}})});
  const request=()=>new Request('https://edge-fixture.invalid/delete-account',{method:'POST',headers:{Authorization:'Bearer '+jwt},body:JSON.stringify({user_id:'attacker-selected-user'})});
  return {...transport,handler,request};
 }
 await check('real SDK withdrawal: verified ID, preflight, global revoke, hard deletion',async()=>{
  const f=handlerFixture();const r=await f.handler(f.request());assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
  assert.deepEqual(f.calls.map(c=>[c.method,c.path]),[['GET','/auth/v1/user'],['POST','/rest/v1/rpc/withdrawal_preflight'],['POST','/auth/v1/logout'],['DELETE','/auth/v1/admin/users/'+userId]]);
  assert.equal(f.calls[0].authorization,'Bearer '+jwt);assert.equal(f.calls[0].apikey,anon);
  assert.deepEqual(f.calls[1].body,{p_user_id:userId});assert.equal(f.calls[1].apikey,service);assert.equal(f.calls[1].authorization,'Bearer '+service);
  assert.equal(f.calls[2].query,'?scope=global');assert.equal(f.calls[2].authorization,'Bearer '+jwt);assert.equal(f.calls[2].apikey,service);
  assert.deepEqual(f.calls[3].body,{should_soft_delete:false});assert.equal(f.calls[3].authorization,'Bearer '+service);
  assert(!f.calls.some(c=>c.path.includes('/drivers')||c.path.includes('/companies')));
 });
 for(const [name,options,status,last] of [['retention',{retention:true},409,'/rest/v1/rpc/withdrawal_preflight'],['missing guards/RPC',{missingRpc:true},503,'/rest/v1/rpc/withdrawal_preflight'],['invalid identity',{invalid:true},401,'/auth/v1/user'],['revoke failure',{revokeError:true},503,'/auth/v1/logout'],['post-preflight retention race',{deleteError:true},409,'/auth/v1/admin/users/'+userId]])await check('real SDK withdrawal stops: '+name,async()=>{const f=handlerFixture(options);assert.equal((await f.handler(f.request())).status,status);assert.equal(f.calls.at(-1).path,last);assert(!f.calls.some(c=>c.path.includes('/rest/v1/drivers')||c.path.includes('/rest/v1/companies')))});
 await check('real SDK withdrawal rejects missing auth before any HTTP',async()=>{const f=handlerFixture();assert.equal((await f.handler(new Request('https://edge-fixture.invalid/delete-account',{method:'POST'}))).status,401);assert.equal(f.calls.length,0)});
 function clientFixture(options={}){const f=createTransport(options);return {...f,client:createClient(base,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:f.fetch,headers:{Authorization:'Bearer '+jwt}}})}}
 await check('real SDK application INSERT body and headers',async()=>{const f=clientFixture();const r=await f.client.from('applications').insert({job_id:42,driver_id:7,status:'応募中'});assert.equal(r.error,null);assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'POST');assert.deepEqual(f.calls[0].body,{job_id:42,driver_id:7,status:'応募中'});assert.equal(f.calls[0].authorization,'Bearer '+jwt)});
 for(const [name,options] of [['network loss',{transportError:true}],['503',{status:503}],['409 duplicate',{status:409,code:'23505'}]])await check('real SDK write is not automatically retried: '+name,async()=>{const f=clientFixture(options);const r=await f.client.from('applications').insert({job_id:42,driver_id:7,status:'応募中'});assert(r.error);assert.equal(f.calls.length,1);if(options.transportError)assert.equal(r.error.code,'')});
 for(const zeroDelete of [false,true])await check('real SDK cancellation representation: '+(zeroDelete?'zero rows':'one row'),async()=>{const f=clientFixture({zeroDelete});const r=await f.client.from('applications').delete().eq('id',43).select('id');assert.equal(r.error,null);assert.equal(r.data.length,zeroDelete?0:1);assert.equal(f.calls[0].method,'DELETE');const query=new URLSearchParams(f.calls[0].query);assert.equal(query.get('id'),'eq.43');assert.equal(query.get('select'),'id');assert.match(f.calls[0].prefer,/return=representation/)});
 await check('real SDK Function HTTP409 exposes JSON through error.context',async()=>{const f=clientFixture();const r=await f.client.functions.invoke('delete-account',{body:{}});assert(r.error);assert.equal(r.data,null);assert(r.error.context instanceof Response);assert.equal(r.error.context.status,409);assert.deepEqual(await r.error.context.json(),{error:'retention_review_required'});assert.equal(f.calls[0].authorization,'Bearer '+jwt)});
 await check('real SDK Function success body',async()=>{const f=clientFixture({functionOk:true});const r=await f.client.functions.invoke('delete-account',{body:{}});assert.equal(r.error,null);assert.deepEqual(r.data,{ok:true})});
 await check('fixture refuses production hosts without forwarding',async()=>{const f=createTransport();await assert.rejects(f.fetch('https://wyxuekjikvflpcmlliwn.supabase.co/rest/v1/jobs'),/External URL refused/);assert.equal(f.calls.length,0)});
}
