import assert from 'node:assert/strict';
globalThis.Deno={env:{get:()=> 'test-key'}};
const {deliverApplicationEmail,processApplicationEmails}=await import('../functions/line-notifications/application-email.ts');
const row={id:'test-notification',recipient:'recipient@example.invalid',subject:'Test',message:'Test message',attempts:1};
let status=200,providerBody={id:'test-provider-id'},captured=[],patches=[];
globalThis.fetch=async(url,options)=>{
 if(url.endsWith('/rpc/claim_company_application_emails'))return new Response(JSON.stringify([row]),{status:200});
 if(url.includes('/company_application_email_queue?')){patches.push(JSON.parse(options.body));return new Response(null,{status:204})}
 captured.push({url,options});return new Response(JSON.stringify(providerBody),{status});
};
await processApplicationEmails();
assert.equal(patches[0].state,'sent');assert.equal(patches[0].provider_email_id,'test-provider-id');
const key=captured[0].options.headers['Idempotency-Key'];
await deliverApplicationEmail(row);assert.equal(captured[1].options.headers['Idempotency-Key'],key);
assert.deepEqual(JSON.parse(captured[0].options.body).to,[row.recipient]);
for(const [code,expected] of [[429,'pending'],[503,'pending'],[422,'failed']]){
 status=code;providerBody={};patches=[];await processApplicationEmails();assert.equal(patches[0].state,expected);
}
status=503;row.attempts=6;patches=[];await processApplicationEmails();assert.equal(patches[0].state,'failed');
console.log('PASS: application email recipient, stable idempotency, sent provider id, transient retry, permanent failure and retry cap');
