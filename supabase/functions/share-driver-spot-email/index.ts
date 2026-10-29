// Review branch: retire unauthenticated server-side referral sending.
// Never read recipients, secrets or a provider response.
const cors={
  'Access-Control-Allow-Origin':'https://spodora.com',
  'Access-Control-Allow-Headers':'content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
export function handle(req:Request):Response {
  const headers={...cors,'Content-Type':'application/json'};
  if(req.method==='OPTIONS')return new Response(JSON.stringify({ok:true}),{status:200,headers});
  if(req.method!=='POST')return new Response(JSON.stringify({error:'method not allowed'}),{status:405,headers});
  return new Response(JSON.stringify({error:'server_intro_email_disabled',
    message:'紹介メールはスポドラの画面から、ご自身のメールアプリで送信してください。'}),{status:410,headers});
}
Deno.serve(handle);
