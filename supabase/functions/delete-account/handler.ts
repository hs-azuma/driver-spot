// Dependency-injected core. No direct profile DELETE and no recipient/user ID from request body.
export function createHandler(deps:{createClient:any;env:(key:string)=>string|undefined}) {
 const headers={'Access-Control-Allow-Origin':'https://spodora.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
 const out=(error:string,status:number)=>new Response(JSON.stringify({error}),{status,headers});
 return async(req:Request):Promise<Response>=>{
  if(req.method==='OPTIONS')return new Response(JSON.stringify({ok:true}),{status:200,headers});
  if(req.method!=='POST')return out('method_not_allowed',405);
  const match=/^Bearer (\S+)$/.exec(req.headers.get('Authorization')||'');
  if(!match)return out('unauthorized',401);
  try {
   const url=deps.env('SUPABASE_URL'),anon=deps.env('SUPABASE_ANON_KEY'),service=deps.env('SUPABASE_SERVICE_ROLE_KEY');
   if(!url||!anon||!service)return out('withdrawal_unavailable',503);
   const client=deps.createClient(url,anon,{global:{headers:{Authorization:'Bearer '+match[1]}}});
   const verified=await client.auth.getUser();
   if(verified.error||!verified.data?.user?.id)return out('unauthorized',401);
   const admin=deps.createClient(url,service);
   const preflight=await admin.rpc('withdrawal_preflight',{p_user_id:verified.data.user.id});
   if(preflight.error||!preflight.data||!['ready','review_required'].includes(preflight.data.mode))return out('withdrawal_unavailable',503);
   if(preflight.data.mode==='review_required')return out('retention_review_required',409);
   // Revoke refresh sessions before deletion; existing access JWTs still expire normally.
   const revoked=await admin.auth.admin.signOut(match[1],'global');
   if(revoked.error)return out('session_revoke_failed',503);
   // One Auth delete. Database BEFORE DELETE trigger removes only history-free profiles atomically.
   const removed=await admin.auth.admin.deleteUser(verified.data.user.id,false);
   if(removed.error){
    if(String(removed.error.message||'').includes('withdrawal_retention_review_required'))return out('retention_review_required',409);
    return out('auth_delete_failed',503);
   }
   return new Response(JSON.stringify({ok:true}),{status:200,headers});
  }catch{return out('withdrawal_unavailable',503)}
 };
}
