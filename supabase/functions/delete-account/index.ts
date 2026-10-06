import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return out({ok:true});
  if(req.method!=="POST") return out({error:"method not allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return out({error:"unauthorized"},401);
    const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:userErr}=await client.auth.getUser();
    if(userErr||!user) return out({error:"unauthorized"},401);
    const admin=createClient(url,service);
    const {data:driver,error:driverReadError}=await admin.from("drivers").select("id").eq("user_id",user.id).maybeSingle();
    const {data:company,error:companyReadError}=await admin.from("companies").select("id").eq("user_id",user.id).maybeSingle();
    if(driverReadError||companyReadError) return out({error:"profile_read_failed"},503);
    if(driver){
      const {error}=await admin.from("drivers").delete().eq("id",driver.id);
      if(error) return out({error:"driver delete failed",detail:error.message},500);
    }
    if(company){
      const {error}=await admin.from("companies").delete().eq("id",company.id);
      if(error) return out({error:"company delete failed",detail:error.message},500);
    }
    const {error:authErr}=await admin.auth.admin.deleteUser(user.id);
    if(authErr) return out({error:"auth delete failed",detail:authErr.message},500);
    return out({ok:true});
  }catch(e){return out({error:String(e)},500)}
});