const encoder = new TextEncoder();
export const site = 'https://spodora.com';
export async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function verifySignature(raw, signature, secret) {
  if (!secret || !signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(signature), c => c.charCodeAt(0)), encoder.encode(raw));
}
export async function rest(path, options = {}) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/' + path, {
    ...options, headers: {apikey:key, Authorization:'Bearer ' + key, 'Content-Type':'application/json', ...options.headers}, signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('database request failed');
  return response.status === 204 ? null : response.json();
}
export async function line(path, body) {
  const response = await fetch('https://api.line.me/v2/bot/' + path, {
    method:'POST', headers:{Authorization:'Bearer ' + Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN'), 'Content-Type':'application/json'},
    body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('LINE request failed');
  return response.json();
}
