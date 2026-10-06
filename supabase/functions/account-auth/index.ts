import { createClient } from 'npm:@supabase/supabase-js@2.105.0';
const URL=Deno.env.get('SUPABASE_URL')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KEY=Deno.env.get('SUPABASE_ANON_KEY')!;
const admin=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(['https://spodora.com','https://www.spodora.com','https://hs-azuma.github.io']);
const bytes=new TextEncoder();
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const newCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
const normalize=(s:unknown)=>typeof s==='string'?s.trim().toLowerCase():'';
const internalEmail=(email:string)=>email.endsWith('@accounts.spodora.invalid');
async function allow(key:string,limit:number,seconds=600){const r=await admin.rpc('account_auth_allow',{p_key:key,p_limit:limit,p_seconds:seconds});return !r.error&&r.data===true}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://spodora.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return out({error:'forbidden'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return out({error:'method_not_allowed'},405);
 // Public login/signup endpoint: custom credential verification is performed below.
 // Never trust request user_id, role, or metadata for authorization.
 if(Number(req.headers.get('content-length')||0)>16384)return out({error:'bad_request'},400);
 try{
  const raw=await req.text();if(raw.length>16384)return out({error:'bad_request'},400);
  const body=JSON.parse(raw),action=body.action;
  if(!['signup','login','recover','recovery-code','account-info','email'].includes(action))return out({error:'bad_request'},400);
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const ipHash=await digest('ip:'+SERVICE+':'+ip);
  if(!await allow('global',500,60)||!await allow('ip:'+ipHash,60,600))return out({error:'rate_limited'},429);
  if(action==='account-info'||action==='recovery-code'||action==='email'){
   const token=(req.headers.get('Authorization')||'').replace(/^Bearer /i,'');
   const {data,error}=await admin.auth.getUser(token);if(error||!data.user)return out({error:'unauthorized'},401);
   const user=data.user;
   const {data:row,error:readError}=await admin.from('account_login_ids').select('login_id').eq('user_id',user.id).maybeSingle();
   if(readError)return out({error:'unavailable'},503);
   if(action==='account-info')return out({login_id:row?.login_id||null,email:internalEmail(user.email||'')?'':user.email||''});
   if(!row)return out({error:'no_login_id'},400);
   // Password reauthentication prevents an unattended session replacing recovery access.
   const client=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const check=await client.auth.signInWithPassword({email:user.email!,password:String(body.password||'')});
   if(check.error||check.data.user?.id!==user.id)return out({error:'invalid_credentials'},401);
   await client.auth.signOut({scope:'local'});
   if(action==='email'){
    const email=normalize(body.email);if(!email||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||internalEmail(email))return out({error:'invalid_email'},400);
    const updated=await admin.auth.admin.updateUserById(user.id,{email,email_confirm:true});
    if(updated.error)return out({error:'signup_failed'},400);
    await admin.from('drivers').update({email}).eq('user_id',user.id);
    await admin.from('companies').update({email}).eq('user_id',user.id);
    return out({email});
   }
   const code=newCode(),hash=await digest(row.login_id+':'+code);
   const changed=await admin.from('account_login_ids').update({recovery_hash:hash}).eq('user_id',user.id);
   if(changed.error)return out({error:'unavailable'},503);
   return out({recovery_code:code});
  }
  const loginId=normalize(body.login_id);
  if(!/^[a-z0-9][a-z0-9_-]{3,31}$/.test(loginId))return out({error:'invalid_login_id'},400);
  if(!await allow('account:'+await digest(loginId),15,600))return out({error:'rate_limited'},429);
  const password=body.password;
  if(typeof password!=='string'||password.length<8||password.length>128)return out({error:'invalid_password'},400);
  if(action==='signup'){
   if(!await allow('signup:'+ipHash,5,3600))return out({error:'rate_limited'},429);
   const email=normalize(body.email);
   if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||internalEmail(email)))return out({error:'invalid_email'},400);
   const meta=body.profile;if(!meta||typeof meta!=='object'||Array.isArray(meta))return out({error:'invalid_profile'},400);
   // Only profile values are accepted. Authorization remains based on user_id and existing RLS.
   const permitted=['driver_name','driver_name_kana','driver_phone','driver_area','driver_prefecture','driver_municipality','driver_prefecture_2','driver_municipality_2','driver_prefecture_3','driver_municipality_3','driver_license','driver_experience','company_name','contact_name','company_phone','company_address','match_line_enabled','match_email_enabled',...Array.from({length:3},(_,i)=>['preferred_email_enabled_'+(i+1),'preferred_line_enabled_'+(i+1)]).flat(),'acquisition_source','acquisition_medium','acquisition_campaign','acquisition_content','acquisition_ref'];
   const profile:Record<string,unknown>={};for(const key of permitted){const v=meta[key];if(typeof v==='boolean'||v===null||typeof v==='string'&&v.length<=500)profile[key]=v}
   if(!(typeof profile.company_name==='string'&&profile.company_name.trim())&&(!(typeof profile.driver_name==='string'&&profile.driver_name.trim())||!(typeof profile.driver_phone==='string'&&profile.driver_phone.trim())||typeof profile.driver_name_kana!=='string'||! /^[ァ-ヶー\s・]+$/.test(profile.driver_name_kana)))return out({error:'invalid_profile'},400);
   if(!email)profile.match_email_enabled=false;
   const reserved=await admin.from('account_login_ids').insert({login_id:loginId});
   if(reserved.error)return out({error:reserved.error.code==='23505'?'login_id_unavailable':'unavailable'},reserved.error.code==='23505'?409:503);
   const address=email||crypto.randomUUID()+'@accounts.spodora.invalid';
   // Reserved non-deliverable address is solely an internal auth identifier, never a notification address.
   const made=await admin.auth.admin.createUser({email:address,password,email_confirm:true,user_metadata:profile});
   if(made.error||!made.data.user){await admin.from('account_login_ids').delete().eq('login_id',loginId).is('user_id',null);return out({error:'signup_failed'},400)}
   const code=newCode(),hash=await digest(loginId+':'+code);
   const linked=await admin.from('account_login_ids').update({user_id:made.data.user.id,recovery_hash:hash}).eq('login_id',loginId).is('user_id',null).select('user_id');
   if(linked.error||linked.data?.length!==1){await admin.auth.admin.deleteUser(made.data.user.id);await admin.from('account_login_ids').delete().eq('login_id',loginId).is('user_id',null);return out({error:'unavailable'},503)}
   const client=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const signed=await client.auth.signInWithPassword({email:address,password});
   if(signed.error)return out({error:'registered_login_required',recovery_code:code},503);
   return out({session:signed.data.session,user:signed.data.user,recovery_code:code});
  }
  const {data:row,error:readError}=await admin.from('account_login_ids').select('user_id,recovery_hash').eq('login_id',loginId).maybeSingle();
  if(readError)return out({error:'unavailable'},503);
  if(!row?.user_id)return out({error:'invalid_credentials'},401);
  const {data:u,error:ue}=await admin.auth.admin.getUserById(row.user_id);
  if(ue||!u.user?.email)return out({error:'invalid_credentials'},401);
  if(action==='recover'){
   const code=normalize(body.recovery_code).replace(/[\s-]/g,'');
   if(!/^[a-f0-9]{48}$/.test(code)||await digest(loginId+':'+code)!==row.recovery_hash)return out({error:'invalid_credentials'},401);
   if(u.user.banned_until&&new Date(u.user.banned_until)>new Date())return out({error:'invalid_credentials'},401);
   // Consume the code with a compare-and-swap, so concurrent requests cannot reuse it.
   const replacement=newCode(),nextHash=await digest(loginId+':'+replacement);
   const consumed=await admin.from('account_login_ids').update({recovery_hash:nextHash}).eq('user_id',row.user_id).eq('recovery_hash',row.recovery_hash).select('user_id');
   if(consumed.error||consumed.data?.length!==1)return out({error:'invalid_credentials'},401);
   const changed=await admin.auth.admin.updateUserById(row.user_id,{password});
   if(changed.error){await admin.from('account_login_ids').update({recovery_hash:row.recovery_hash}).eq('user_id',row.user_id).eq('recovery_hash',nextHash);return out({error:'unavailable'},503)}
   const client=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const signed=await client.auth.signInWithPassword({email:u.user.email,password});
   if(signed.error)return out({error:'unavailable',recovery_code:replacement},503);
   await admin.auth.admin.signOut(signed.data.session!.access_token,'others');
   return out({session:signed.data.session,user:signed.data.user,recovery_code:replacement});
  }
  const client=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await client.auth.signInWithPassword({email:u.user.email,password});
  if(signed.error)return out({error:'invalid_credentials'},401);
  return out({session:signed.data.session,user:signed.data.user});
 }catch{return out({error:'unavailable'},503)}
});
