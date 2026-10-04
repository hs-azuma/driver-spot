import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyUnsubscribeToken } from "./common.ts";
const cors={"Access-Control-Allow-Origin":"https://spodora.com","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
export async function handler(req:Request){if(req.method==='OPTIONS')return out({ok:true});if(req.method!=='POST')return out({error:'method_not_allowed'},405);try{const url=new URL(req.url);let token=url.searchParams.get('token')||'';if(req.headers.get('content-type')?.includes('application/json')){const body=await req.json();token=String(body.token||token)}const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const userId=await verifyUnsubscribeToken(token,secret);if(!userId)return out({error:'invalid_link'},400);const admin=createClient(Deno.env.get('SUPABASE_URL')!,secret);const {data,error}=await admin.from('drivers').update({match_email_enabled:false}).eq('user_id',userId).select('id');if(error)return out({error:'save_failed'},500);if(!data?.length)return out({error:'invalid_link'},400);return out({ok:true})}catch{return out({error:'save_failed'},500)}}
Deno.serve(handler);
