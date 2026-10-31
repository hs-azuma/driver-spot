// Fresh synthetic target only. All credentials and encrypted payloads arrive on private stdin.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {businessFlow} from './business-flow.mjs';
import {decodeStorageTransfer} from './storage-bundle.mjs';
const {createClient}=createRequire(new URL('../sdk-lab/package.json',import.meta.url))('@supabase/supabase-js');
let input='';for await(const c of process.stdin)input+=c;const p=JSON.parse(input);assert.equal(process.env.GITHUB_ACTIONS,'true');assert(['127.0.0.1','localhost'].includes(new URL(p.url).hostname));
const checks=[];let attempted='initialization',diagnostic='';const check=(name,ok)=>{attempted=name;assert(ok);checks.push(name)};
const make=()=>createClient(p.url,p.anon,{auth:{persistSession:false,autoRefreshToken:false}}),admin=createClient(p.url,p.service,{auth:{persistSession:false,autoRefreshToken:false}});
try{
 const clients={};for(const [kind,u] of Object.entries(p.users)){const c=make(),r=await c.auth.signInWithPassword({email:u.email,password:u.password});if(kind==='empty'){check('Independent Auth keeps deleted account deleted',!!r.error);continue}check('Independent password login '+kind,!r.error&&r.data.user.id===u.id);clients[kind]=c}
 const own=await clients.driver.from('drivers').select('id,user_id');check('Independent RLS preserves driver identity',!own.error&&own.data.length===1&&own.data[0].user_id===p.users.driver.id);
 const other=await clients.other.from('drivers').select('id').eq('id',own.data[0].id);check('Independent RLS denies foreign profile',!other.error&&other.data.length===0);
 const bundle=await decodeStorageTransfer(p.transfer);assert.equal(bundle.format,'spodora-storage-synthetic/1');assert.equal(bundle.synthetic_only,true);assert.deepEqual(bundle.files.map(f=>f.path),['fixture.txt','nested/binary.bin','zero.bin']);
 const bucket=await admin.storage.getBucket('v4-restored');check('Independent bucket configuration restored private',!bucket.error&&bucket.data.public===false);
 for(const f of bundle.files){const b=Buffer.from(f.base64,'base64');assert.equal(b.length,f.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);
  const missing=await admin.storage.from('v4-restored').download(f.path);check('Independent storage has no source volume '+f.path,!!missing.error);
  const uploaded=await clients.storage.storage.from('v4-restored').upload(f.path,b,{contentType:f.type,upsert:false});check('Independent file restored '+f.path,!uploaded.error);
  const got=await clients.storage.storage.from('v4-restored').download(f.path);check('Independent owner reads '+f.path,!got.error);
  const actual=Buffer.from(await got.data.arrayBuffer());check('Independent content hash '+f.path,actual.length===f.bytes&&createHash('sha256').update(actual).digest('hex')===f.sha256);check('Independent MIME '+f.path,got.data.type.split(';')[0]===f.type);
  const denied=await clients.other.storage.from('v4-restored').download(f.path);check('Independent outsider denied '+f.path,!!denied.error);
  const anonymous=await make().storage.from('v4-restored').download(f.path);check('Independent anonymous denied '+f.path,!!anonymous.error);
 }
 const retained=await admin.rpc('withdrawal_preflight',{p_user_id:p.users.storage.id});check('Independent restored ownership blocks withdrawal',!retained.error&&retained.data.reason==='storage_objects');
 const job=await clients.company.from('jobs').insert({company_id:p.company_id,work_date:'2099-12-01',location:'Synthetic independent site',start_time:'09:00',end_time:'17:00',pay_guarantee:true,pay_amount:2000,pay_type:'時給'}).select('id').single();diagnostic=JSON.stringify({code:job.error?.code,message:job.error?.message,status:job.status});check('Independent company publishes new job',!job.error&&!!job.data?.id);
 const application=await clients.driver.from('applications').insert({job_id:job.data.id,driver_id:own.data[0].id,status:'応募中'}).select('id').single();check('Independent restored driver submits new application',!application.error&&!!application.data?.id);
 const business=await businessFlow({company:clients.company,driver:clients.other,outsider:clients.driver,companyId:p.company_id,today:p.today,check});
 process.stdout.write(JSON.stringify({checks,status:'PASS_INDEPENDENT_CLUSTER_AUTH_STORAGE',object_ids_preserved:false,business}));
}catch{process.stdout.write(JSON.stringify({checks,error:'Independent API failed: '+attempted+' '+diagnostic}));process.exitCode=1}
