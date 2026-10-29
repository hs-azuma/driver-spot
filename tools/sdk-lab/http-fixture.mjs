// Fixed response fixture for the REAL SDK. It is never a network proxy or a real service client.
export const base='https://sdk-fixture.invalid';
export const userId='00000000-0000-4000-8000-000000000007';
export const user={id:userId,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
export function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
export function createTransport(options={}){
 const calls=[];
 const fetch=async(input,init={})=>{
  const req=input instanceof Request?new Request(input,init):new Request(String(input),init),url=new URL(req.url);
  if(url.origin!==base)throw Error('External URL refused by SDK fixture');
  const text=await req.text(),body=text?JSON.parse(text):null;
  calls.push({method:req.method,path:url.pathname,query:url.search,body,authorization:req.headers.get('authorization'),apikey:req.headers.get('apikey'),prefer:req.headers.get('prefer')});
  if(options.handle){const response=await options.handle(req,url,body,calls);if(response)return response}
  if(url.pathname==='/auth/v1/user')return options.invalid?json({message:'Invalid JWT',code:'bad_jwt'},401):json(user);
  if(url.pathname==='/rest/v1/rpc/withdrawal_preflight')return options.missingRpc?json({code:'PGRST202',message:'RPC not found'},404):json({mode:options.retention?'review_required':'ready'});
  if(url.pathname==='/auth/v1/logout')return options.revokeError?json({message:'Synthetic logout refusal',code:'unexpected_failure'},500):new Response(null,{status:204});
  if(url.pathname==='/auth/v1/admin/users/'+userId)return options.deleteError?json({message:'withdrawal_retention_review_required',code:'unexpected_failure'},500):json(user);
  if(url.pathname==='/rest/v1/applications'){
   if(options.transportError)throw new TypeError('Synthetic network response lost');
   if(options.status)return json({code:options.code||'23514',message:'Synthetic DB refusal'},options.status);
   if(req.method==='DELETE')return json(options.zeroDelete?[]:[{id:43}]);
   return new Response(null,{status:201});
  }
  if(url.pathname==='/functions/v1/delete-account')return options.functionOk?json({ok:true}):json({error:'retention_review_required'},409);
  throw Error('Unexpected SDK fixture endpoint '+req.method+' '+url.pathname);
 };
 return {fetch,calls};
}
