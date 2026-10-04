/* Attendance correction requests: read via RLS, write only through ownership-checked RPCs. */
(function(){
 const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
 const stamp=x=>x?new Date(x).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'未打刻';
 const inputTime=x=>x?new Date(Date.parse(x)+9*3600000).toISOString().slice(0,16):'';
 const iso=x=>x?new Date(x+':00+09:00').toISOString():null;
 let db,refresh,apps=new Map(),requests=[];
 async function load(client,rows,onRefresh){db=client;refresh=onRefresh;apps=new Map(rows.map(a=>[String(a.id),a]));requests=[];
  if(rows.length){const r=await db.from('attendance_review_requests').select('*').in('application_id',rows.map(a=>a.id)).order('created_at',{ascending:false});if(r.error)throw r.error;requests=r.data||[]}
  rows.forEach(a=>{a.attendance_review_requests=requests.filter(r=>r.application_id===a.id);a.approved_request=a.attendance_review_requests.find(r=>r.status==='approved'&&Date.parse(r.requested_in)===Date.parse(a.checked_in_at)&&Date.parse(r.requested_out)===Date.parse(a.checked_out_at))||null;});
 }
 function driverHtml(a){const list=a.attendance_review_requests||[],latest=list[0],pending=latest?.status==='pending',label=latest?({pending:'企業の確認待ち',approved:'承認済み',rejected:'差し戻し'}[latest.status]):'未申請';
  return '<div style="margin:14px 0;padding:12px;border:1px solid #dbe3ef;border-radius:10px"><strong>勤怠の確認・修正</strong><p>'+label+'</p>'+(latest?.review_comment?'<p>企業からのコメント：'+esc(latest.review_comment)+'</p>':'')+(pending?'<p>申請した出勤 '+esc(stamp(latest.requested_in))+' ／ 退勤 '+esc(stamp(latest.requested_out))+' ／ 休憩 '+latest.break_minutes+'分</p>':'<button onclick="SpodoraReview.openRequest('+a.id+')">'+(latest?.status==='approved'?'再修正を申請する':'勤怠を確認・修正して申請')+'</button>')+(list.length?'<details><summary>申請履歴</summary>'+list.map(r=>'<p>'+esc(stamp(r.created_at))+'：'+({pending:'確認待ち',approved:'承認済み',rejected:'差し戻し'}[r.status])+'<br>'+esc(stamp(r.requested_in))+'〜'+esc(stamp(r.requested_out))+' ／ 休憩 '+r.break_minutes+'分<br>理由：'+esc(r.reason)+(r.review_comment?'<br>企業コメント：'+esc(r.review_comment):'')+'</p>').join('')+'</details>':'')+'</div>';
 }
 function modal(title,body){
  document.getElementById('attendanceReviewModal')?.remove();const dialog=document.createElement('dialog');dialog.id='attendanceReviewModal';dialog.style.cssText='width:min(520px,calc(100% - 24px));max-height:90vh;border:1px solid #cbd5e1;border-radius:14px;padding:20px;box-sizing:border-box;overflow:auto;color:#172033';
  dialog.innerHTML='<h2>'+title+'</h2><p style="color:#68758b">日時は日本時間です。</p>'+body+'<p id="reviewMessage" role="status" style="color:#b42318"></p><button type="button" onclick="document.getElementById(\'attendanceReviewModal\').close()">閉じる</button>';document.body.appendChild(dialog);dialog.showModal();
 }
 const fieldStyle='style="display:block;width:100%;box-sizing:border-box;padding:12px;margin:8px 0 16px;border:1px solid #cbd5e1;border-radius:8px;font:inherit"';
 function openRequest(id){const a=apps.get(String(id));if(!a)return;const j=a.jobs||{};
  modal('勤怠の確認・修正申請','<p>'+esc(j.job_description)+'</p><p>現在の記録：出勤 '+esc(stamp(a.checked_in_at))+' ／ 退勤 '+esc(stamp(a.checked_out_at))+'</p><form id="attendanceReviewForm"><label>実際の出勤日時<input '+fieldStyle+' name="start" type="datetime-local" required value="'+inputTime(a.checked_in_at)+'"></label><label>実際の退勤日時<input '+fieldStyle+' name="end" type="datetime-local" required value="'+inputTime(a.checked_out_at)+'"></label><label>実際の休憩（分）<input '+fieldStyle+' name="rest" type="number" min="0" step="1" required value="'+(a.approved_request?.break_minutes??j.break_minutes??0)+'"></label><label>確認・修正の理由<textarea '+fieldStyle+' name="reason" maxlength="1000" required placeholder="例：打刻どおりの勤務、休憩は実際に45分でした。"></textarea></label><p>企業の承認後に記録へ反映します。報酬は応募時の給与条件を使います。</p><button type="submit" class="primary">企業に申請する</button></form>');
  document.getElementById('attendanceReviewForm').onsubmit=async event=>{event.preventDefault();const f=event.currentTarget,b=f.querySelector('button');b.disabled=true;try{
   const start=iso(f.elements.start.value),end=iso(f.elements.end.value),rest=Number(f.elements.rest.value);
   if(!start||!end||Date.parse(end)<=Date.parse(start)||!Number.isInteger(rest)||rest<0||rest*60000>Date.parse(end)-Date.parse(start))throw Error('出退勤日時と休憩時間を確認してください。');
   const r=await db.rpc('request_attendance_review',{p_application_id:id,p_checked_in_at:start,p_checked_out_at:end,p_break_minutes:rest,p_reason:f.elements.reason.value.trim()});if(r.error)throw r.error;
   document.getElementById('attendanceReviewModal').close();await refresh();
  }catch(error){document.getElementById('reviewMessage').textContent=error.message||'申請できませんでした。'}finally{b.disabled=false}};
 }
 function companyHtml(){const pending=requests.filter(r=>r.status==='pending');
  return '<h2>勤怠の確認・修正申請</h2><p>確認待ち '+pending.length+'件</p>'+pending.map(r=>{const a=apps.get(String(r.application_id)),j=a?.jobs||{};
   return '<div style="border-top:1px solid #dbe3ef;padding:16px 0"><strong>'+esc(a?.drivers?.name||'ドライバー')+' ／ '+esc(j.job_description)+'</strong><p>現在：'+esc(stamp(r.original_in))+'〜'+esc(stamp(r.original_out))+'</p><p>申請：'+esc(stamp(r.requested_in))+'〜'+esc(stamp(r.requested_out))+' ／ 実休憩 '+r.break_minutes+'分</p><p>理由：'+esc(r.reason)+'</p><button data-review-id="'+esc(r.id)+'" onclick="SpodoraReview.openDecision(this.dataset.reviewId)">内容と基本報酬を確認</button></div>';
  }).join('')+(pending.length?'':'<p>確認待ちの申請はありません。</p>')+'<details><summary>確認済みの申請履歴</summary>'+requests.filter(r=>r.status!=='pending').map(r=>{const a=apps.get(String(r.application_id));return '<p><strong>'+esc(a?.drivers?.name||'ドライバー')+' ／ '+esc(a?.jobs?.job_description)+'</strong><br>'+esc(stamp(r.reviewed_at))+'：'+(r.status==='approved'?'承認済み':'差し戻し')+'<br>'+esc(stamp(r.requested_in))+'〜'+esc(stamp(r.requested_out))+' ／ 休憩 '+r.break_minutes+'分'+(r.status==='approved'?'<br>承認済み基本報酬 '+Number(r.approved_basic_amount).toLocaleString('ja-JP')+'円':'')+(r.review_comment?'<br>コメント：'+esc(r.review_comment):'')+'</p>'}).join('')+'</details>';
 }
 function requestAmount(r,policy){const j=r.job_context||{};return SpodoraAttendance.calculate({checked_in_at:r.requested_in,checked_out_at:r.requested_out,actual_break_minutes:r.break_minutes,pay_guarantee_snapshot:policy},j)}
 function openDecision(id){const r=requests.find(x=>x.id===id);if(!r)return;const a=apps.get(String(r.application_id)),policy=r.job_context.pay_guarantee;
  modal('勤怠申請の確認','<p>'+esc(a?.drivers?.name)+' ／ '+esc(a?.jobs?.job_description)+'</p><p>申請：'+esc(stamp(r.requested_in))+'〜'+esc(stamp(r.requested_out))+'<br>実際の休憩 '+r.break_minutes+'分</p><p>理由：'+esc(r.reason)+'</p>'+(policy==null?'<label>給与保証の条件（ドライバーと確認してください）<select '+fieldStyle+' id="reviewPolicy"><option value="">選択してください</option><option value="true">募集時間分の基本給与を保証する</option><option value="false">実働時間で計算する</option></select></label>':'<p>'+esc(SpodoraAttendance.policyLabel(policy))+'</p>')+'<div id="reviewPay"></div><label>コメント（差し戻す場合は必須）<textarea '+fieldStyle+' id="reviewComment" maxlength="1000"></textarea></label><p style="font-size:13px;color:#68758b">承認する基本報酬は交通費・割増・税等を含みません。承認しても振込は行いません。</p><div style="display:flex;gap:10px;margin-bottom:14px"><button id="reviewApprove" class="primary">承認して勤怠へ反映</button><button id="reviewReject">差し戻す</button></div>');
  const selected=()=>policy==null?(document.getElementById('reviewPolicy').value===''?null:document.getElementById('reviewPolicy').value==='true'):policy;
  const preview=()=>{const p=selected(),c=requestAmount(r,p);document.getElementById('reviewPay').textContent=p==null?'給与条件を選択してください。':c.error||c.policyError||('実働 '+SpodoraAttendance.duration(c.worked)+' ／ 承認する基本報酬 '+(c.amount==null?'要確認':c.amount.toLocaleString('ja-JP')+'円'));document.getElementById('reviewApprove').disabled=p==null||!!c.error||!!c.policyError||c.amount==null};
  document.getElementById('reviewPolicy')?.addEventListener('change',preview);preview();
  async function decide(approve){const btn1=document.getElementById('reviewApprove'),btn2=document.getElementById('reviewReject');btn1.disabled=btn2.disabled=true;
   try{const comment=document.getElementById('reviewComment').value.trim();if(!approve&&!comment)throw Error('差し戻し理由を入力してください。');const result=await db.rpc('decide_attendance_review',{p_request_id:id,p_approve:approve,p_comment:comment,p_pay_guarantee:selected()});if(result.error)throw result.error;document.getElementById('attendanceReviewModal').close();await refresh();}
   catch(error){document.getElementById('reviewMessage').textContent=error.message||'処理できませんでした。';preview();btn2.disabled=false;}
  }
  document.getElementById('reviewApprove').onclick=()=>decide(true);document.getElementById('reviewReject').onclick=()=>decide(false);
 }
 window.SpodoraReview={load,driverHtml,companyHtml,openRequest,openDecision,inputTime,iso};
})();