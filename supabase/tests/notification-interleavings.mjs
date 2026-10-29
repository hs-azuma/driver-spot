// Controlled worker interleavings with mocked REST/provider. Not a multi-session PostgreSQL test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno={serve:()=>{},env:{get:key=>({SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',RESEND_API_KEY:'fixture',LINE_CHANNEL_ACCESS_TOKEN:'fixture'})[key]}};
const {processApplicationEmails}=await import('../functions/line-notifications/application-email.ts');
const {processLineNotifications}=await import('../functions/line-notifications/index.ts');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};

for(const channel of ['email','line'])for(const staleResponse of ['success','failure']){
 test(`${channel}: stale ${staleResponse} cannot overwrite a newer lease outcome`,{timeout:5000},async()=>{
  const entered=deferred(),release=deferred();
  const id='123e4567-e89b-42d3-a456-426614174090';
  const row={id,attempts:0,state:'pending',recipient:'synthetic@example.invalid',subject:'synthetic',message:'synthetic',destination:'U'+'1'.repeat(32)};
  let leaseExpired=false,providerCalls=0,acceptedDeliveries=0;
  const providerKeys=[],patches=[];
  const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers});
  globalThis.fetch=async(url,options={})=>{
   if(url.includes('/rpc/claim_')){
    if(row.state==='pending'||(row.state==='sending'&&leaseExpired)){
     row.state='sending';row.attempts++;leaseExpired=false;
     return json([{...row}]);
    }
    return json([]);
   }
   if(url.includes('/rest/v1/')&&options.method==='PATCH'){
    const parsed=new URL(url),expected=Number(parsed.searchParams.get('attempts')?.slice(3));
    const matches=row.state==='sending'&&row.attempts===expected;
    patches.push({expected,matches,body:JSON.parse(options.body)});
    if(matches)Object.assign(row,JSON.parse(options.body));
    return json(matches?[{id}]:[]);
   }
   if(url==='https://api.resend.com/emails'||url==='https://api.line.me/v2/bot/message/push'){
    providerCalls++;const current=providerCalls;
    const key=options.headers[channel==='email'?'Idempotency-Key':'X-Line-Retry-Key'];providerKeys.push(key);
    // Model provider idempotency within its documented retention window, not a real send.
    if(current===1){
     if(staleResponse==='success')acceptedDeliveries++;
     entered.resolve();await release.promise;
     return staleResponse==='failure'?json({},503):json(channel==='email'?{id:'synthetic-provider-id'}:{});
    }
    if(staleResponse==='failure')acceptedDeliveries++;
    if(channel==='line'&&staleResponse==='success')return json({},409,{'x-line-accepted-request-id':'synthetic-accepted'});
    return json(channel==='email'?{id:'synthetic-provider-id'}:{});
   }
   throw Error('Unexpected external request: '+url);
  };
  const process=channel==='email'?processApplicationEmails:processLineNotifications;
  const first=process();await entered.promise;
  leaseExpired=true;
  await process(); // worker B claims attempt 2 while worker A's provider response is delayed
  assert.equal(row.state,'sent');assert.equal(row.attempts,2);
  release.resolve();await first;
  assert.equal(row.state,'sent');assert.equal(row.attempts,2);
  assert.equal(providerCalls,2);assert.equal(acceptedDeliveries,1);
  assert.equal(new Set(providerKeys).size,1);
  assert.deepEqual(patches.map(p=>[p.expected,p.matches]),[[2,true],[1,false]]);
  if(channel==='email')assert.equal(row.provider_email_id,'synthetic-provider-id');
 });
}
