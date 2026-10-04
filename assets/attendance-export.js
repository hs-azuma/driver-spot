/* Export visible attendance rows; unapproved estimates are never exported as approved pay. */
(function(){
 const headers=['応募ID','勤務日','ドライバー','求人タイトル','出退勤状態','予定開始','予定終了','実出勤（日本時間）','実退勤（日本時間）','予定休憩（分）','承認済み実休憩（分）','承認済み実働（秒）','承認済み実働','勤怠承認状況','給与保証条件','承認済み基本報酬（円）','求人交通費（円・参考）','交通費支給条件（参考）','承認日時（日本時間）','打刻方式','注意事項'];
 function stamp(x){if(!x)return '';const d=new Date(x);if(!Number.isFinite(d.getTime()))return '';return d.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})+' '+d.toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}
 function cell(x){let s=String(x??'');if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
 function data(a){const j=a.jobs||{},c=SpodoraAttendance.calculate(a,j),r=c.approved?a.approved_request:null,latest=a.attendance_review_requests?.[0],fee=j.transportation_fee;
  const status=r?(latest?.status==='pending'?'承認済み（再申請確認待ち）':'承認済み'):latest?.status==='pending'?'確認待ち':latest?.status==='rejected'?'差し戻し':'未承認';
  return [a.id,j.work_date,a.drivers?.name,j.job_description,a.checked_out_at?'退勤済':a.checked_in_at?'出勤中':'未出勤',String(j.start_time||'').slice(0,5),String(j.end_time||'').slice(0,5),stamp(a.checked_in_at),stamp(a.checked_out_at),j.break_minutes,r?.break_minutes,r?c.worked:'',r?SpodoraAttendance.duration(c.worked):'',status,SpodoraAttendance.policyLabel(c.policy),r?c.amount:'',fee==null?'':fee,j.transportation_fee_type||'',stamp(r?.reviewed_at),a.attendance_method==='manual'?'手入力':a.checked_in_at?'QR':'','基本報酬は交通費・割増・税等を含みません。求人交通費は参考額です。'];
 }
 function build(rows){return '\uFEFF'+[headers,...rows.map(data)].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'}
 function download(rows,scope){if(!rows.length)return alert('出力する勤怠がありません。');const blob=new Blob([build(rows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='spodora-attendance-'+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})+'-'+(scope==='today'?'today':'all')+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
 window.SpodoraAttendanceExport={build,data,cell,stamp,download,headers};
})();