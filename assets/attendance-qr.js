window.SpodoraQR={
 db:supabase.createClient('https://wyxuekjikvflpcmlliwn.supabase.co','sb_publishable_YCin6s4LUf-5Xk44OmU6zQ_gDk9ThSC'),
 esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
 time:x=>x?new Date(x).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}):'―',
 token(text){try{const u=new URL(String(text).trim());if((u.origin!==location.origin&&!(u.protocol==='https:'&&['spodora.com','www.spodora.com'].includes(u.hostname)))||!u.pathname.endsWith('/attendance.html'))return '';const t=u.searchParams.get('company')||'';return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)?t:''}catch{return ''}},
 loginURL(token){return './driver.html?attendance='+encodeURIComponent(token)},
 attendanceURL(token){return './attendance.html?company='+encodeURIComponent(token)}
};
