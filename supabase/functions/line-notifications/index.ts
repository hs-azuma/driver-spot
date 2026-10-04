import {rest,hash} from './common.ts';
const AUTH_HASH='75cbb095859e324db519f753aa0e5d6b70cbacdd3ff66323d023b8d01070dc7d';
const out=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function deliver(row){
 const token=Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
 if(!token)throw new Error('LINE not configured');
 const response=await fetch('https://api.line.me/v2/bot/message/push',{
 method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Line-Retry-Key':row.id},
 body:JSON.stringify({to:row.destination,messages:[{type:'text',text:row.message}]}),signal:AbortSignal.timeout(10000)
 });
 const accepted=response.ok||(response.status===409&&!!response.headers.get('x-line-accepted-request-id'));
 const retry=response.status>=500||response.status===429;
 return {accepted,retry,status:response.status};
}
export async function handle(req){
 if(req.method!=='POST')return out({error:'Method not allowed'},405);
 const key=req.headers.get('x-spodora-worker-key')||'';
 if(await hash(key)!==AUTH_HASH)return out({error:'Unauthorized'},401);
 try{
 const rows=await rest('rpc/claim_line_notifications',{method:'POST',body:'{}'});
 let accepted=0,failed=0;
 for(const row of rows){
 let result;
 try{result=await deliver(row);}catch{result={accepted:false,retry:true,status:0};}
 const state=result.accepted?'sent':result.retry&&row.attempts<6?'pending':'failed';
 await rest('line_notification_queue?id=eq.'+encodeURIComponent(row.id)+'&state=eq.sending&attempts=eq.'+row.attempts,{
 method:'PATCH',body:JSON.stringify({state,last_status:result.status,lease_until:null,
 available_at:new Date(Date.now()+Math.min(60,2**row.attempts)*60000).toISOString(),
 ...(result.accepted?{sent_at:new Date().toISOString()}:{})
 })});
 if(result.accepted)accepted++;else failed++;
 }
 return out({processed:rows.length,accepted,failed});
 }catch{return out({error:'Notification worker failed'},500);}
}
Deno.serve(handle);

