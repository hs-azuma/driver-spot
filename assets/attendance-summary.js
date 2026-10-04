/* Shared read-only attendance estimates. Does not change stored payroll or rounding. */
(function(){
 const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 function duration(seconds){const n=Math.max(0,Math.floor(seconds));return Math.floor(n/3600)+'時間'+Math.floor(n%3600/60)+'分'+(n%60?n%60+'秒':'')}
 function clock(value,workDate){if(!value)return '—';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '—';const day=d.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});return (day===workDate?'':day.slice(5).replace('-','/')+' ')+d.toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false})}
 function basicCalculate(a,j){
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

 function policyLabel(value){return value===true?'募集時間分の基本給与を保証':value===false?'実働時間で計算（募集時間分の保証なし）':'給与保証の条件：未設定'}
 function calculate(a,j){
  const c=basicCalculate(a,j),policy=Object.prototype.hasOwnProperty.call(a,'pay_guarantee_snapshot')?a.pay_guarantee_snapshot:j.pay_guarantee;
  c.policy=policy;
  if(c.pending||c.error)return c;
  const plan=plannedCalculate(j);
  if(policy===true){
   if(plan.error||plan.amount==null){c.amount=null;c.policyError='募集時間分の保証額を確認できません。';return c}
   if(j.pay_type==='日給'&&plan.worked>0)c.amount=Math.round(Number(j.pay_amount)*c.worked/plan.worked);
   c.guaranteedMinimum=plan.amount;
   if(c.amount!=null)c.amount=Math.max(c.amount,plan.amount);
  }else if(policy===false&&j.pay_type==='日給'){
   c.amount=!plan.error&&plan.worked>0&&plan.amount!=null?Math.round(plan.amount*c.worked/plan.worked):null;
  }
  return c;
 }

 function html(a,j,compact){
  const c=calculate(a,j);
  let out='<div class="attendance-estimate" style="background:#f4f7fb;border-radius:10px;padding:12px;margin-top:12px;font-size:14px;line-height:1.7">';
  if(!compact)out+='<strong>勤怠・報酬の確認</strong><div>実出勤 '+esc(clock(a.checked_in_at,j.work_date))+' ／ 実退勤 '+esc(clock(a.checked_out_at,j.work_date))+'</div>';
  out+='<div><strong>'+esc(policyLabel(c.policy))+'</strong></div>';
  if(c.pending)return out+'<div>'+ (a.checked_in_at?'出勤中：退勤後に実働・報酬目安を表示します。':'未出勤：出退勤の打刻後に表示します。')+'</div></div>';
  if(c.elapsed!=null)out+='<div>打刻間 '+duration(c.elapsed)+'</div>';
  if(c.error)return out+'<div style="color:#8a5b00"><strong>要確認</strong>：'+esc(c.error)+'</div></div>';
  out+='<div>休憩（求人の予定） '+c.rest+'分</div><div><strong>実働（仮） '+duration(c.worked)+'</strong></div><div><strong>基本報酬目安 '+(c.amount==null?'要確認':c.amount.toLocaleString('ja-JP')+'円')+'</strong></div>';
  if(c.guaranteedMinimum!=null)out+='<div>保証される基本給与の下限 '+c.guaranteedMinimum.toLocaleString('ja-JP')+'円</div>';
  if(c.policyError)out+='<div style="color:#8a5b00">'+esc(c.policyError)+'</div>';
  out+='<div style="color:#68758b;font-size:12px">実打刻と休憩予定からの参考額です。実際の休憩・勤務内容の確認前は確定額ではありません。交通費・割増等は含みません。'+(c.policy==null?'給与保証の条件が未設定のため、支払額は企業に確認してください。':j.pay_type==='日給'?'日給の実働分は募集の実働時間に対する割合で計算しています。':'')+'</div></div>';
  return out;
 }

 function plannedCalculate(j){
  const parse=x=>{const m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(x||''));if(!m||+m[1]>23||+m[2]>59||+(m[3]||0)>59)return null;return +m[1]*3600+ +m[2]*60+ +(m[3]||0)};
  const start=parse(j.start_time),end=parse(j.end_time);
  if(start==null||end==null||start===end)return {error:'勤務予定時間を確認してください。'};
  const elapsed=end>start?end-start:end+86400-start;
  return basicCalculate({checked_in_at:new Date(start*1000).toISOString(),checked_out_at:new Date((start+elapsed)*1000).toISOString()},j);
 }
 function plannedHtml(j){
  const c=plannedCalculate(j);
  let out='<div style="background:#edf4ff;border-radius:10px;padding:14px;margin:12px 0;line-height:1.8"><strong>この仕事の勤務・報酬目安</strong>';
  if(c.error)return out+'<div>予定実働・基本報酬目安：要確認</div></div>';
  const fee=Number(j.transportation_fee),knownFee=j.transportation_fee!=null&&Number.isFinite(fee)&&fee>=0,total=c.amount!=null&&knownFee?c.amount+fee:null;
  out+='<div>予定実働 <strong>'+duration(c.worked)+'</strong>（休憩 '+c.rest+'分を除く）</div><div style="display:flex;flex-wrap:wrap;gap:4px 12px"><span>基本報酬目安 <strong>'+(c.amount==null?'要確認':c.amount.toLocaleString('ja-JP')+'円')+'</strong></span><span>＋ 交通費 <strong>'+(knownFee?fee.toLocaleString('ja-JP')+'円':'未設定')+'</strong></span></div><div style="font-size:20px;margin-top:4px"><strong>合計目安 '+(total==null?'要確認':total.toLocaleString('ja-JP')+'円')+'</strong><span style="font-size:12px">（交通費込み）</span></div>';
  out+='<div><strong>'+esc(policyLabel(j.pay_guarantee))+'</strong></div><div style="font-size:12px;color:#68758b">'+(j.pay_guarantee===true?'早く終了しても上記の基本報酬を下限とします。実働分が上回る場合は実働分を使います。':j.pay_guarantee===false?'早く終了した場合は実働分で計算します。日給は募集の実働時間に対する割合です。':'応募前に企業へ給与保証の条件を確認してください。')+'</div>';
  return out+'<div style="font-size:12px;color:#68758b">求人の予定時間・休憩からの参考額です。合計には交通費を含み、割増等は含みません。実際の勤務により変わる場合があります。</div></div>';
 }
 window.SpodoraAttendance={calculate,html,duration,clock,plannedCalculate,plannedHtml,policyLabel};
})();
