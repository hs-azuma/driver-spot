import {rest} from './common.ts';
export async function deliverApplicationEmail(row){
 const key=Deno.env.get('RESEND_API_KEY');
 if(!key)return {accepted:false,retry:true,status:503};
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'company-application/'+row.id},
  body:JSON.stringify({from:'スポドラ <noreply@spodora.com>',to:[row.recipient],subject:row.subject,text:row.message}),
  signal:AbortSignal.timeout(10000)
 });
 const data=await response.json().catch(()=>({}));
 return {accepted:response.ok&&typeof data.id==='string',retry:response.status>=500||response.status===429||(response.status===409&&data.name==='concurrent_idempotent_requests'),status:response.status,id:response.ok?data.id:null};
}
export async function processApplicationEmails(){
 const rows=await rest('rpc/claim_company_application_emails',{method:'POST',body:'{}'});
 let accepted=0,failed=0;
 for(const row of rows){
  let result;
  try{result=await deliverApplicationEmail(row)}catch{result={accepted:false,retry:true,status:0}};
  const state=result.accepted?'sent':result.retry&&row.attempts<6?'pending':'failed';
  await rest('company_application_email_queue?id=eq.'+encodeURIComponent(row.id)+'&state=eq.sending&attempts=eq.'+row.attempts,{
   method:'PATCH',body:JSON.stringify({state,last_status:result.status,lease_until:null,
    available_at:new Date(Date.now()+Math.min(60,2**row.attempts)*60000).toISOString(),
    ...(result.accepted?{sent_at:new Date().toISOString(),provider_email_id:result.id}:{})
   })
  });
  if(result.accepted)accepted++;else failed++;
 }
 return {processed:rows.length,accepted,failed};
}
