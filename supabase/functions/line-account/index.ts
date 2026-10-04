import {hash, randomToken, rest, site} from './common.ts';
const cors = {'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-region, x-retry-count, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, traceparent, tracestate, baggage', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Cache-Control':'no-store'};
const out = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{...cors, 'Content-Type':'application/json'}});
export async function handle(req) {
  if (req.method === 'OPTIONS') {
    console.info('LINE account preflight', JSON.stringify({origin:req.headers.get('origin'), headers:req.headers.get('access-control-request-headers')}));
    return new Response(null, {status:204, headers:cors});
  }
  if (req.method !== 'POST') return out({error:'Method not allowed'},405);
  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer .+/.test(auth)) return out({error:'ログインしてください。'},401);
  try {
    const response = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY'), Authorization:auth}, signal:AbortSignal.timeout(10000)});
    if (!response.ok) return out({error:'ログインし直してください。'},401);
    const user = await response.json();
    if (!user.id) return out({error:'ログインしてください。'},401);
    const [drivers, companies] = await Promise.all(['drivers','companies'].map(table => rest(table + '?select=id&user_id=eq.' + encodeURIComponent(user.id))));
    if (!drivers.length && !companies.length) return out({error:'スポドラの登録を完了してください。'},403);
    const body = await req.json();
    if (body.action === 'status') {
      const rows = await rest('line_connections?select=active&user_id=eq.' + encodeURIComponent(user.id));
      return out({linked:rows.length > 0, active:rows[0]?.active === true, configured:!!Deno.env.get('LINE_CHANNEL_SECRET') && !!Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')});
    }
    if (body.action === 'unlink') {
      await rest('rpc/unlink_line_account', {method:'POST', body:JSON.stringify({p_user_id:user.id})});
      return out({ok:true});
    }
    if (body.action !== 'begin' || !/^[0-9a-f]{64}$/.test(body.ticket || '')) return out({error:'LINEから届いた連携リンクを開いてください。'},400);
    if (!Deno.env.get('LINE_CHANNEL_SECRET') || !Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')) return out({error:'LINE連携は準備中です。'},503);
    const nonce = randomToken();
    const token = await rest('rpc/begin_line_link', {method:'POST', body:JSON.stringify({p_ticket_hash:await hash(body.ticket), p_user_id:user.id, p_nonce_hash:await hash(nonce)})});
    if (!token) return out({error:'リンクの期限が切れたか、使用済みです。LINEで「連携」と送って再取得してください。'},410);
    return out({url:'https://access.line.me/dialog/bot/accountLink?linkToken=' + encodeURIComponent(token) + '&nonce=' + encodeURIComponent(nonce)});
  } catch { return out({error:'処理できませんでした。時間をおいて再度お試しください。'},500); }
}
Deno.serve(handle);
