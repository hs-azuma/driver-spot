(function(global){
 const hired=['採用','勤務確定','勤務完了'],pending=['応募中','採用候補'];
 function phase(a){if(a.jobs?.status==='キャンセル')return 'other';if(a.status==='勤務完了'||a.checked_out_at)return 'done';if(a.checked_in_at&&!a.checked_out_at)return 'work';if(hired.includes(a.status))return 'wait';return pending.includes(a.status)?'apply':'other'}
 function label(a){if(a.jobs?.status==='キャンセル')return '求人取消';const p=phase(a);return p==='done'?(a.checked_out_at?'退勤済み':'勤務完了'):p==='work'?'勤務中':p==='wait'?'出勤待ち':p==='apply'?(a.status==='採用候補'?'採用候補':'応募中'):['不採用','見送り'].includes(a.status)?'見送り':a.status||'要確認'}
 function stats(j,rows){const apps=rows.filter(a=>Number(a.jobs?.id)===Number(j.id)),selected=apps.filter(a=>hired.includes(a.status)).length,need=Number(j.required_headcount||1);return {need,hired:selected,remaining:Math.max(0,need-selected),pending:apps.filter(a=>phase(a)==='apply').length,applications:apps.length}}
 function accepting(j,rows,now=new Date()){if(!j||['キャンセル','募集終了','募集充足','終了'].includes(j.status)||stats(j,rows).remaining===0)return false;const stamp=Date.parse(j.work_date+'T'+String(j.start_time||'')+(String(j.start_time||'').length===5?':00':'')+'+09:00');return Number.isFinite(stamp)&&stamp>now.getTime()}
 function experience(d){if(d.experience)return String(d.experience);return d.experience_years!=null&&Number.isFinite(Number(d.experience_years))?String(d.experience_years)+'年':'未設定'}
 function completed(rows,driverId){return rows.filter(a=>Number(a.driver_id)===Number(driverId)&&(a.checked_out_at||a.status==='勤務完了')).length}
 global.SpodoraApplicants={phase,label,stats,accepting,experience,completed};
})(window);
