import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {unsubscribeToken,unsubscribeLinks} from "./common.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function matchesJobPreferences(d:any,j:any){
if(d.is_paused||d.match_email_enabled===false)return false;
const areas=[['preferred_prefecture','preferred_municipality'],['preferred_prefecture_2','preferred_municipality_2'],['preferred_prefecture_3','preferred_municipality_3']];
if(!areas.some(([p,m],i)=>d['preferred_email_enabled_'+(i+1)]!==false&&!!d[p]&&d[p]===j.work_prefecture&&(d[m]===j.work_municipality||d[m]===j.work_prefecture+'全域')))return false;
const vehicle=({'2tトラック':'2t','4tトラック':'4t'} as Record<string,string>)[String(j.vehicle_type||'')]||j.vehicle_type;
if((d.preferred_vehicle_types||[]).length&&!d.preferred_vehicle_types.includes(vehicle))return false;
if((d.preferred_weekdays||[]).length){const date=String(j.work_date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const day=new Date(date+'T00:00:00Z').getUTCDay();if(!d.preferred_weekdays.includes(day))return false;}
if((d.preferred_time_slots||[]).length){const time=String(j.start_time||'');if(!/^\d{2}:\d{2}/.test(time))return false;const hour=Number(time.slice(0,2));if(hour<0||hour>=24)return false;const slot=hour<6?'early':hour<12?'morning':hour<18?'afternoon':'evening';if(!d.preferred_time_slots.includes(slot))return false;}
return true;
}

function openJob(j:any,count:number){const stamp=Date.parse(j.work_date+'T'+String(j.start_time||'')+(String(j.start_time||'').length===5?':00':'')+'+09:00');return !['キャンセル','募集終了','募集充足','終了'].includes(j.status)&&Number.isFinite(stamp)&&stamp>Date.now()&&count<Number(j.required_headcount||1)}
async function sendMail(key:string,payload:any,id:string){
 for(let attempt=0;attempt<2;attempt++){
  try{const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'job-invite-'+id},body:JSON.stringify(payload)});
  if(response.ok)return true;if(response.status<500&&response.status!==429)return false;
  }catch(err){if(attempt===1)return false}
  if(attempt===0)await new Promise(r=>setTimeout(r,1000));
 }return false;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return out({ok:true});
 if(req.method!=='POST')return out({error:'method not allowed'},405);
 try{
 const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return out({error:'unauthorized'},401);
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:authError}=await client.auth.getUser();if(authError||!user)return out({error:'unauthorized'},401);
 const b=await req.json(),jobId=Number(b.job_id);
 if(!Number.isSafeInteger(jobId)||jobId<1||!Array.isArray(b.driver_ids)||b.driver_ids.length<1||b.driver_ids.length>10||b.driver_ids.some((v:any)=>!Number.isSafeInteger(v)||v<1))return out({error:'bad request'},400);
 const ids=[...new Set<number>(b.driver_ids)];
 const {data:c,error:ce}=await client.from('companies').select('id,company_name').eq('user_id',user.id).maybeSingle();if(ce||!c)return out({error:'forbidden'},403);
 const {data:j,error:je}=await client.from('jobs').select('*').eq('id',jobId).eq('company_id',c.id).maybeSingle();if(je||!j)return out({error:'forbidden'},403);
 const {data:f,error:fe}=await client.from('company_driver_favorites').select('driver_id').eq('company_id',c.id).in('driver_id',ids);
 if(fe)return out({error:'favorites unavailable'},503);if(!f||f.length!==ids.length)return out({error:'not a favorite driver'},400);
 const keys=["job_description","work_date","start_time","end_time","pay_type","pay_amount","transportation_fee","transportation_fee_type","pay_guarantee","break_minutes","location","required_headcount"];
 if(!b.expected_job||keys.some(k=>JSON.stringify(b.expected_job[k]??null)!==JSON.stringify(j[k]??null)))return out({error:'job changed'},409);
 const admin=createClient(url,secret);
 const {count,error:capError}=await admin.from('applications').select('id',{count:'exact',head:true}).eq('job_id',jobId).in('status',['採用','勤務確定','勤務完了']);
 if(capError)return out({error:'capacity unavailable'},503);if(!openJob(j,count||0))return out({error:'job closed'},409);
 const [dr,blocks,apps]=await Promise.all([
 admin.from('drivers').select('*').in('id',ids),
 admin.from('company_driver_blocks').select('driver_id').eq('company_id',c.id).in('driver_id',ids),
 admin.from('applications').select('driver_id').eq('job_id',jobId).in('driver_id',ids)
 ]);
 if(dr.error||blocks.error||apps.error)return out({error:'recipients unavailable'},503);
 const unavailable=new Set([...(blocks.data||[]),...(apps.data||[])].map((a:any)=>Number(a.driver_id)));
 const eligible=(dr.data||[]).filter((d:any)=>d.user_id&&!d.is_paused&&!unavailable.has(Number(d.id)));
 if(!eligible.length)return out({ok:true,created:0,email_sent:0,email_failed:0,skipped:ids.length});
 const {data:created,error:ie}=await admin.from('company_job_invitations').upsert(eligible.map((d:any)=>({company_id:c.id,job_id:jobId,driver_id:d.id,company_name:c.company_name||'企業'})),{onConflict:'job_id,driver_id',ignoreDuplicates:true}).select('id,driver_id');
 if(ie)return out({error:'invitation failed'},503);
 let sent=0,failed=0;
 const key=Deno.env.get('RESEND_API_KEY');
 for(let i=0;i<(created||[]).length;i+=3)await Promise.all((created||[]).slice(i,i+3).map(async (inv:any)=>{
 let state='skipped';
 try{
 const {data:d,error:pe}=await admin.from('drivers').select('*').eq('id',inv.driver_id).maybeSingle();
 if(pe)throw pe;
 const {data:blockNow,error:blockReadError}=await admin.from('company_driver_blocks').select('driver_id').eq('company_id',c.id).eq('driver_id',inv.driver_id).maybeSingle();
 if(blockReadError)throw blockReadError;
 if(!blockNow&&d&&d.match_email_enabled===true&&matchesJobPreferences(d,j)){
  if(!key)throw new Error('email not configured');
  const {data:u,error:ue}=await admin.auth.admin.getUserById(d.user_id);if(ue)throw ue;
  const to=u?.user?.email;
  if(to){
   const links=unsubscribeLinks(await unsubscribeToken(d.user_id,secret));
   const fee=j.transportation_fee==null?'要確認':Number(j.transportation_fee).toLocaleString()+'円';
   const text=[(d.name||'')+' 様','',''+(c.company_name||'企業')+'から求人の案内が届きました。','採用確定ではありません。内容を確認し、希望する場合は応募してください。','','仕事内容：'+(j.job_description||'ドライバー求人'),'勤務日：'+(j.work_date||''),'勤務時間：'+String(j.start_time||'').slice(0,5)+'〜'+String(j.end_time||'').slice(0,5),'勤務地：'+(j.location||''),'給与：'+(j.pay_type||'')+' '+Number(j.pay_amount||0).toLocaleString()+'円','交通費：'+fee,'給与保証：'+(j.pay_guarantee===true?'募集時間分の基本給与を保証':j.pay_guarantee===false?'実働時間で計算':'未設定'),'','求人の詳細・応募：https://spodora.com/driver.html?invites=1','','求人メールの配信停止（ログイン不要）：',links.page,'採用・選考結果など、利用に必要なメールは継続します。','','スポドラ'].join('\n');
   const ok=await sendMail(key,{from:'スポドラ <noreply@spodora.com>',to:[to],subject:'【スポドラ】'+(c.company_name||'企業')+'から求人のご案内',text,headers:{'List-Unsubscribe':'<'+links.api+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}},inv.id);
   state=ok?'sent':'failed';
  }
 }
 }catch(err){state='failed'}
 if(state==='sent')sent++;if(state==='failed')failed++;
 await admin.from('company_job_invitations').update({email_state:state}).eq('id',inv.id);
 }));
 return out({ok:true,created:(created||[]).length,email_sent:sent,email_failed:failed,skipped:ids.length-(created||[]).length});
 }catch(err){return out({error:'invitation processing failed'},500)}
});
