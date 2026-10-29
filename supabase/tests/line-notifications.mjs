import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
globalThis.Deno={env:{get:k=>({LINE_CHANNEL_ACCESS_TOKEN:'test',SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'})[k]},serve:()=>{}};
const {deliver,handle}=await import('../functions/line-notifications/index.ts');
const row={id:'123e4567-e89b-42d3-a456-426614174000',destination:'U'+'1'.repeat(32),message:'テスト'};
let captured;
globalThis.fetch=async(url,options)=>{captured={url,options};return new Response('{}',{status:200});};
assert.equal((await deliver(row)).accepted,true);
assert.equal(captured.options.headers['X-Line-Retry-Key'],row.id);
assert.deepEqual(JSON.parse(captured.options.body),{to:row.destination,messages:[{type:'text',text:'テスト'}]});
for(const [status,retry] of [[500,true],[429,true],[400,false],[401,false],[403,false]]){globalThis.fetch=async()=>new Response('{}',{status});assert.deepEqual(await deliver(row),{accepted:false,retry,status});}
globalThis.fetch=async()=>new Response('{}',{status:409,headers:{'x-line-accepted-request-id':'accepted'}});
assert.equal((await deliver(row)).accepted,true);
globalThis.fetch=async()=>new Response('{}',{status:409});assert.equal((await deliver(row)).accepted,false);
assert.equal((await handle(new Request('https://example.invalid',{method:'POST'}))).status,401);
assert.equal((await handle(new Request('https://example.invalid'))).status,405);
console.log('PASS: push payload, stable retry key, accepted replay, transient/permanent errors, unauthorized worker, method restrictions');
