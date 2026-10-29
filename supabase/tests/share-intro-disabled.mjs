import {test} from 'node:test';
import assert from 'node:assert/strict';
let registered;
globalThis.Deno={serve:fn=>{registered=fn},env:{get:()=>{throw Error('No secrets may be read')}}};
globalThis.fetch=()=>{throw Error('No network may be used')};
const {handle}=await import('../functions/share-driver-spot-email/index.ts');
test('retired referral endpoint returns 410 without reading body or secrets',async()=>{
  assert.equal(registered,handle);
  let bodyReads=0;
  const request={method:'POST',json:()=>{bodyReads++;throw Error('must not parse')},text:()=>{bodyReads++;throw Error('must not parse')}};
  const response=handle(request);
  assert.equal(response.status,410);
  assert.equal((await response.json()).error,'server_intro_email_disabled');
  assert.equal(bodyReads,0);
});
test('retired referral endpoint keeps preflight and method handling',()=>{
  assert.equal(handle(new Request('https://example.invalid',{method:'OPTIONS'})).status,200);
  assert.equal(handle(new Request('https://example.invalid')).status,405);
});
