// Compiles actual copied Functions in native Edge Runtime; intentionally no provider credentials.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {createClient}=createRequire(new URL('../sdk-lab/package.json',import.meta.url))('@supabase/supabase-js');
let s='';for await(const c of process.stdin)s+=c;const p=JSON.parse(s);assert.equal(process.env.GITHUB_ACTIONS,'true');assert(['localhost','127.0.0.1'].includes(new URL(p.url).hostname));
const checks=[];let attempted='initialization';const check=(n,ok)=>{attempted=n;assert(ok);checks.push(n)};
async function request(name,method,expected,body,token=p.anon){const r=await fetch(p.url+'/functions/v1/'+name,{method,headers:{apikey:p.anon,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});await r.text();check('Native Edge '+name+' '+expected,r.status===expected)}
try{
 await request('line-setup-once','GET',410);
 await request('share-driver-spot-email','POST',410,{});
 await request('delete-account','POST',401,{});
 await request('email-unsubscribe','POST',400,{token:'invalid-synthetic-link'});
 await request('line-webhook','POST',503,{events:[]});
 await request('line-notifications','POST',401,{});
 await request('line-account','POST',401,{action:'status'});
 await request('company-job-invite','POST',401,{});
 await request('application-result-email','POST',401,{});
 await request('account-auth','GET',405);
 const client=createClient(p.url,p.anon,{auth:{persistSession:false,autoRefreshToken:false}});const signed=await client.auth.signInWithPassword({email:p.user.email,password:p.user.password});check('Native Edge fixture company authenticates',!signed.error&&!!signed.data.session);
 await request('application-result-email','POST',503,{application_id:1,status:'採用'},signed.data.session.access_token);
 await request('delete-account','POST',409,{},signed.data.session.access_token);
 process.stdout.write(JSON.stringify({checks,status:'PASS_NATIVE_EDGE_SMOKE',functions:10,provider_credentials_present:false,external_messages_sent:0}));
}catch{process.stdout.write(JSON.stringify({checks,error:'Native Edge failed: '+attempted}));process.exitCode=1}
