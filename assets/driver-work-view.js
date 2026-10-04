(function(global){
 const hired=['採用','勤務確定','勤務完了'],pending=['応募中','採用候補'];
 function today(now=new Date()){return new Date(now.getTime()+9*3600000).toISOString().slice(0,10)}
 function ended(j,now=new Date()){
  if(!j?.work_date)return false;
  const start=String(j.start_time||'').slice(0,8),end=String(j.end_time||'').slice(0,8);
  if(!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(end)||start===end)return String(j.work_date)<today(now);
  let stamp=Date.parse(j.work_date+'T'+(end.length===5?end+':00':end)+'+09:00');
  if(end<start)stamp+=86400000;
  return Number.isFinite(stamp)?stamp<=now.getTime():String(j.work_date)<today(now);
 }
 function group(a,now=new Date()){
  const j=a.jobs;if(!j||j.status==='キャンセル')return 'history';
  if(a.checked_out_at||a.status==='勤務完了')return 'history';
  if(a.checked_in_at&&!a.checked_out_at)return 'upcoming';
  if(ended(j,now))return 'history';
  if(['採用','勤務確定'].includes(a.status))return 'upcoming';
  return pending.includes(a.status)?'pending':'history';
 }
 function compare(a,b){const ja=a.jobs||{},jb=b.jobs||{};return String(ja.work_date||'9999').localeCompare(String(jb.work_date||'9999'))||String(ja.start_time||'').localeCompare(String(jb.start_time||''))||Number(a.id)-Number(b.id)}
 function rows(all,view,now=new Date()){return (all||[]).filter(a=>group(a,now)===view).sort((a,b)=>view==='history'?-compare(a,b):compare(a,b))}
 function todays(all,now=new Date()){return (all||[]).filter(a=>a.jobs&&a.jobs.status!=='キャンセル'&&hired.includes(a.status)&&(a.jobs.work_date===today(now)||(a.checked_in_at&&!a.checked_out_at&&a.status!=='勤務完了'))).sort(compare)}
 global.SpodoraDriverWork={group,rows,todays,today,ended};
})(window);
