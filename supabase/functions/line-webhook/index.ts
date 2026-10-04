import {hash, randomToken, verifySignature, rest, line, site} from './common.ts';
export async function handle(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', {status:405});
  const secret = Deno.env.get('LINE_CHANNEL_SECRET');
  if (!secret) return new Response('LINE configuration incomplete', {status:503});
  const raw = await req.text();
  if (raw.length > 1000000) return new Response('Payload too large', {status:413});
  if (!await verifySignature(raw, req.headers.get('x-line-signature'), secret)) return new Response('Invalid signature', {status:401});
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('Invalid JSON', {status:400}); }
  if (!Array.isArray(body.events)) return new Response('Invalid events', {status:400});
  try {
    for (const event of body.events) {
      const uid = event.source?.type === 'user' ? event.source.userId : null;
      if (!uid || !/^U[0-9a-f]{32}$/.test(uid)) continue;
      if (event.type === 'accountLink' && event.link?.nonce) {
        await rest('rpc/complete_line_link', {method:'POST', body:JSON.stringify({p_nonce_hash:await hash(event.link.nonce), p_line_user_id:uid, p_success:event.link.result === 'ok'})});
      } else if (event.type === 'unfollow') {
        await rest('line_connections?line_user_id=eq.' + uid, {method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({active:false})});
        await rest('line_link_requests?line_user_id=eq.' + uid, {method:'DELETE', headers:{Prefer:'return=minimal'}});
      } else if (event.replyToken && (event.type === 'follow' || (event.type === 'message' && event.message?.type === 'text' && ['連携','LINE連携'].includes(event.message.text.trim())))) {
        if (!Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')) throw new Error('LINE configuration incomplete');
        const {linkToken} = await line('user/' + uid + '/linkToken');
        if (!linkToken) throw new Error('link token missing');
        const ticket = randomToken();
        await rest('line_link_requests?expires_at=lt.' + encodeURIComponent(new Date().toISOString()), {method:'DELETE', headers:{Prefer:'return=minimal'}});
        await rest('line_link_requests', {method:'POST', headers:{Prefer:'return=minimal'}, body:JSON.stringify({ticket_hash:await hash(ticket), line_user_id:uid, link_token:linkToken, expires_at:new Date(Date.now()+600000).toISOString()})});
        await line('message/reply', {replyToken:event.replyToken, messages:[{type:'text', text:'スポドラのアカウントとLINEを連携できます。下のリンクを10分以内に開き、スポドラにログインしてください。連携はいつでも解除できます。\n' + site + '/line-link.html?ticket=' + ticket}]});
      }
    }
    return new Response('OK');
  } catch { return new Response('Processing failed', {status:500}); }
}
Deno.serve(handle);
