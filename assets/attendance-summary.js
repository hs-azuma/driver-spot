/* Shared read-only attendance estimates. Does not change stored payroll or rounding. */
(function(){
 const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 function duration(seconds){const n=Math.max(0,Math.floor(seconds));return Math.floor(n/3600)+'時間'+Math.floor(n%3600/60)+'分'+(n%60?n%60+'秒':'')}
 function clock(value,workDate){if(!value)return '—';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '—';const day=d.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});return (day===workDate?'':day.slice(5).replace('-','/')+' ')+d.toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false})}
 function calculate(a,j){
  if(!a.checked_in_at||!a.checked_out_at)return {pending:true};
  const start=Date.parse(a.checked_in_at),end=Date.parse(a.checked_out_at);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return {error:'打刻時刻を確認してください。'};
  const elapsed=(end-start)/1000,rest=Number(j.break_minutes);
  if(j.break_minutes==null||!Number.isFinite(rest)||rest<0)return {elapsed,error:'休憩時間が未設定のため、実働・報酬は要確認です。'};
  if(rest*60>elapsed)return {elapsed,rest,error:'休憩予定が打刻間の時間を超えています。実際の休憩・打刻を確認してください。'};
  const worked=elapsed-rest*60,rate=Number(j.pay_amount);
  let amount=null;
  if(j.pay_amount!=null&&Number.isFinite(rate)&&rate>=0){if(j.pay_type==='時給')amount=Math.round(rate*worked/3600);else if(j.pay_type==='日給')amount=rate}
  return {elapsed,rest,worked,amount};
 }
 function html(a,j,compact){
  const c=calculate(a,j);
  let out='<div class="attendance-estimate" style="background:#f4f7fb;border-radius:10px;padding:12px;margin-top:12px;font-size:14px;line-height:1.7">';
  if(!compact)out+='<strong>勤怠・報酬の確認</strong><div>実出勤 '+esc(clock(a.checked_in_at,j.work_date))+' ／ 実退勤 '+esc(clock(a.checked_out_at,j.work_date))+'</div>';
  if(c.pending)return out+'<div>'+ (a.checked_in_at?'出勤中：退勤後に実働・報酬目安を表示します。':'未出勤：出退勤の打刻後に表示します。')+'</div></div>';
  if(c.elapsed!=null)out+='<div>打刻間 '+duration(c.elapsed)+'</div>';
  if(c.error)return out+'<div style="color:#8a5b00"><strong>要確認</strong>：'+esc(c.error)+'</div></div>';
  out+='<div>休憩（求人の予定） '+c.rest+'分</div><div><strong>実働（仮） '+duration(c.worked)+'</strong></div><div><strong>基本報酬目安 '+(c.amount==null?'要確認':c.amount.toLocaleString('ja-JP')+'円')+'</strong></div>';
  out+='<div style="color:#68758b;font-size:12px">実打刻と休憩予定からの参考額です。実際の休憩・勤務内容の確認前は確定額ではありません。交通費・割増等は含みません。'+(j.pay_type==='日給'?'日給は求人記載額を表示しています。':'')+'</div></div>';
  return out;
 }

 function plannedCalculate(j){
  const parse=x=>{const m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(x||''));if(!m||+m[1]>23||+m[2]>59||+(m[3]||0)>59)return null;return +m[1]*3600+ +m[2]*60+ +(m[3]||0)};
  const start=parse(j.start_time),end=parse(j.end_time);
  if(start==null||end==null||start===end)return {error:'勤務予定時間を確認してください。'};
  const elapsed=end>start?end-start:end+86400-start;
  return calculate({checked_in_at:new Date(start*1000).toISOString(),checked_out_at:new Date((start+elapsed)*1000).toISOString()},j);
 }
 function plannedHtml(j){
  const c=plannedCalculate(j);
  let out='<div style="background:#edf4ff;border-radius:10px;padding:14px;margin:12px 0;line-height:1.8"><strong>この仕事の勤務・報酬目安</strong>';
  if(c.error)return out+'<div>予定実働・基本報酬目安：要確認</div></div>';
  out+='<div>予定実働 <strong>'+duration(c.worked)+'</strong>（休憩 '+c.rest+'分を除く）</div><div>基本報酬目安 <strong>'+(c.amount==null?'要確認':c.amount.toLocaleString('ja-JP')+'円')+'</strong></div>';
  return out+'<div style="font-size:12px;color:#68758b">求人の予定時間・休憩からの参考額です。交通費は別表示、割増等は含みません。実際の勤務により変わる場合があります。</div></div>';
 }
 window.SpodoraAttendance={calculate,html,duration,clock,plannedCalculate,plannedHtml};
})();
