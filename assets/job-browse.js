(function(global){
 const periods=['all','today','tomorrow','week'],hiredStatuses=['採用','勤務確定','勤務完了'];
 function context(now=new Date()){
  const local=new Date(now.getTime()+9*60*60*1000),today=local.toISOString().slice(0,10),tomorrow=new Date(local.getTime()+86400000).toISOString().slice(0,10);
  const day=local.getUTCDay(),weekStart=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()-((day+6)%7)));
  return {today,tomorrow,clock:local.toISOString().slice(11,19),weekStart:weekStart.toISOString().slice(0,10),weekEnd:new Date(weekStart.getTime()+6*86400000).toISOString().slice(0,10)};
 }
 function open(j,now=new Date()){
  if(!j||['キャンセル','募集終了','募集充足','終了'].includes(j.status))return false;
  const date=String(j.work_date||''),start=String(j.start_time||'').slice(0,8);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(start))return false;
  if(Number(j.hired_count??(j.applications||[]).filter(a=>hiredStatuses.includes(a.status)).length)>=Number(j.required_headcount||1))return false;
  const c=context(now),clock=start.length===5?start+':00':start;
  return date>c.today||(date===c.today&&clock>c.clock);
 }
 function inPeriod(j,period='all',now=new Date()){
  const c=context(now),date=String(j.work_date||'');
  return period==='today'?date===c.today:period==='tomorrow'?date===c.tomorrow:period==='week'?date>=c.weekStart&&date<=c.weekEnd:true;
 }
 function compare(a,b){return String(a.work_date||'').localeCompare(String(b.work_date||''))||String(a.start_time||'').localeCompare(String(b.start_time||''))||Number(a.id)-Number(b.id)}
 function available(jobs,period='all',now=new Date()){return (jobs||[]).filter(j=>open(j,now)&&inPeriod(j,period,now)).sort(compare)}
 global.SpodoraJobBrowse={periods,context,open,inPeriod,available};
})(window);
