// Executed only by the isolated CI controller. Credentials arrive on stdin and are never logged.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {storageRoundtrip} from './storage-roundtrip.mjs';
const {createClient}=createRequire(new URL('../sdk-lab/package.json',import.meta.url))('@supabase/supabase-js');
let text='';for await(const chunk of process.stdin)text+=chunk;const input=JSON.parse(text);
const url=new URL(input.url);assert(['127.0.0.1','localhost','[::1]'].includes(url.hostname));assert.equal(process.env.GITHUB_ACTIONS,'true');
let attempted='initialization',diagnostic='';const checks=[];const check=(name,ok)=>{attempted=name;assert(ok,name);checks.push(name)};
const client=token=>createClient(input.url,input.anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
const admin=createClient(input.url,input.service,{auth:{persistSession:false,autoRefreshToken:false}});
try{
 if(input.phase==='users'){
  const users={};for(const kind of ['company','driver','other','empty','storage']){
   const email='v4-'+kind+'@example.invalid',password=randomBytes(30).toString('base64url');
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:kind==='company'?{}:{driver_name:'Synthetic '+kind,driver_name_kana:'テスト タロウ',match_email_enabled:false}});
   check('GoTrue admin creates confirmed synthetic '+kind,!created.error&&!!created.data.user?.id);
   const signed=await createClient(input.url,input.anon,{auth:{persistSession:false,autoRefreshToken:false}}).auth.signInWithPassword({email,password});
   check('Real password sign-in '+kind,!signed.error&&!!signed.data.session?.access_token);
   users[kind]={id:created.data.user.id,token:signed.data.session.access_token};
  }
  process.stdout.write(JSON.stringify({checks,users}));
 }else{
  const u=input.users,driver=client(u.driver.token),company=client(u.company.token),other=client(u.other.token);
  const profile=await driver.from('drivers').select('id,user_id');diagnostic=JSON.stringify({code:profile.error?.code,status:profile.status,rows:profile.data?.length});check('PostgREST RLS returns only own driver',!profile.error&&profile.data.length===1&&profile.data[0].user_id===u.driver.id);
  const foreign=await other.from('drivers').select('id').eq('id',profile.data[0].id);check('PostgREST denies other driver visibility',!foreign.error&&foreign.data.length===0);
  const job=await company.from('jobs').insert({company_id:input.company_id,work_date:'2099-11-01',location:'Synthetic site',start_time:'09:00',end_time:'17:00',pay_guarantee:true}).select('id').single();
  check('Real company JWT creates own job',!job.error&&!!job.data?.id);
  const anon=createClient(input.url,input.anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const denied=await anon.from('jobs').insert({company_id:input.company_id,work_date:'2099-11-02',pay_guarantee:true});check('Anonymous job INSERT refused',!!denied.error);
  const app=await driver.from('applications').insert({job_id:job.data.id,driver_id:profile.data[0].id,status:'応募中'}).select('id').single();check('Real JWT and RLS allow own application',!app.error&&!!app.data?.id);
  const preflight=await admin.rpc('withdrawal_preflight',{p_user_id:u.driver.id});check('Native preflight retains account with business records',!preflight.error&&preflight.data.mode==='review_required');
  const retained=await admin.auth.admin.deleteUser(u.driver.id,false);check('GoTrue deletion refused by business-history trigger',!!retained.error);
  const still=await admin.from('drivers').select('id').eq('user_id',u.driver.id);check('Refused Auth delete retains driver profile',!still.error&&still.data.length===1);
  const emptyBefore=await admin.rpc('withdrawal_preflight',{p_user_id:u.empty.id});check('Empty-account preflight ready',!emptyBefore.error&&emptyBefore.data.mode==='ready');
  const deleted=await admin.auth.admin.deleteUser(u.empty.id,false);check('Real GoTrue deletes empty account atomically',!deleted.error);
  const emptyAfter=await admin.from('drivers').select('id').eq('user_id',u.empty.id);check('Auth BEFORE DELETE removed empty profile',!emptyAfter.error&&emptyAfter.data.length===0);
  const bucket=await admin.storage.createBucket('v4-synthetic',{public:false});check('Real Storage creates private synthetic bucket',!bucket.error);
  const storage=client(u.storage.token);const bytes=new TextEncoder().encode('synthetic-native-storage-only');
  const uploaded=await storage.storage.from('v4-synthetic').upload('fixture.txt',bytes,{contentType:'text/plain'});check('Real Storage uploads synthetic owned bytes',!uploaded.error);
  const storagePreflight=await admin.rpc('withdrawal_preflight',{p_user_id:u.storage.id});check('Native preflight blocks Storage ownership',!storagePreflight.error&&storagePreflight.data.mode==='review_required'&&storagePreflight.data.reason==='storage_objects');
  const ownedDelete=await admin.auth.admin.deleteUser(u.storage.id,false);check('Owned Storage prevents Auth user deletion',!!ownedDelete.error);
  const ownedAfter=await admin.from('drivers').select('id').eq('user_id',u.storage.id);check('Storage ownership refusal retains driver profile',!ownedAfter.error&&ownedAfter.data.length===1);
  const downloaded=await storage.storage.from('v4-synthetic').download('fixture.txt');check('Storage bytes remain readable after refused deletion',!downloaded.error&&(await downloaded.data.text())==='synthetic-native-storage-only');
  const storage_restore=await storageRoundtrip({admin,owner:storage,outsider:other,anon,check});
  const restoredPreflight=await admin.rpc('withdrawal_preflight',{p_user_id:u.storage.id});check('Restored owned files still block withdrawal',!restoredPreflight.error&&restoredPreflight.data.reason==='storage_objects');
  process.stdout.write(JSON.stringify({checks,storage_restore}));
 }
}catch{process.stdout.write(JSON.stringify({checks,error:'Native API contract failed: '+attempted+'; '+diagnostic}));process.exitCode=1}
