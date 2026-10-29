(function(global){
 let db,role,refresh,apps=new Map(),reviews=new Map(),loadError=false;
 const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 function eligible(a){return !!a&&a.jobs?.status!=='キャンセル'&&!!(a.checked_out_at||a.status==='勤務完了')}
 function stars(value){const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=5?'★'.repeat(n)+'☆'.repeat(5-n)+'（'+n+'/5）':'未評価'}
 async function load(client,rows,side,callback){
 db=client;role=side;refresh=callback;apps=new Map(rows.map(a=>[Number(a.id),a]));reviews=new Map();loadError=false;
 const ids=rows.filter(eligible).map(a=>Number(a.id));if(!ids.length)return true;
 try{const r=await db.from('reviews').select('application_id,driver_rating,company_rating,driver_comment,company_comment').in('application_id',ids);if(r.error)throw r.error;reviews=new Map((r.data||[]).map(r=>[Number(r.application_id),r]));return true}
 catch(err){loadError=true;return false}
 }
 function fields(r,side){return side==='company'?{own:r?.driver_rating,ownComment:r?.company_comment,other:r?.company_rating,otherComment:r?.driver_comment,target:'ドライバー',opposite:'ドライバーから企業への評価'}:{own:r?.company_rating,ownComment:r?.driver_comment,other:r?.driver_rating,otherComment:r?.company_comment,target:'企業',opposite:'企業からあなたへの評価'}}
 function html(a){
 if(!eligible(a))return '';
 if(loadError)return '<section class="work-rating"><h4>勤務後の評価</h4><p>評価を取得できませんでした。</p><button onclick="SpodoraWorkRating.retry()">再読み込み</button></section>';
 const r=reviews.get(Number(a.id)),f=fields(r,role);
 return '<section class="work-rating"><h4>勤務後の評価</h4><p><b>あなたから'+f.target+'への評価：</b><span class="rating-stars">'+stars(f.own)+'</span></p>'+(f.ownComment?'<p class="rating-comment">'+esc(f.ownComment)+'</p>':'')+'<button onclick="SpodoraWorkRating.open('+Number(a.id)+')">'+(f.own?'評価を編集':f.target+'を評価する')+'</button><p><b>'+f.opposite+'：</b><span class="rating-stars">'+stars(f.other)+'</span></p>'+(f.otherComment?'<p class="rating-comment">'+esc(f.otherComment)+'</p>':'')+'<p class="rating-note">この勤務の企業とドライバーだけで確認できます。</p></section>';
 }
 function open(id){
 const a=apps.get(Number(id));if(!eligible(a)||loadError)return;
 document.getElementById('workRatingDialog')?.remove();
 const f=fields(reviews.get(Number(id)),role),dialog=document.createElement('dialog');dialog.id='workRatingDialog';dialog.className='work-rating-dialog';
 dialog.innerHTML='<form id="workRatingForm"><h2>'+f.target+'への評価</h2><p>'+esc(a.jobs?.job_description||'勤務')+'</p><label for="workRatingScore">5段階評価（必須）</label><select id="workRatingScore" required><option value="">選択してください</option>'+[5,4,3,2,1].map(n=>'<option value="'+n+'" '+(Number(f.own)===n?'selected':'')+'>'+stars(n)+'</option>').join('')+'</select><label for="workRatingComment">コメント（任意・1000文字以内）</label><textarea id="workRatingComment" maxlength="1000" rows="4">'+esc(f.ownComment||'')+'</textarea><p class="rating-note">仕事内容や対応について、具体的に記載してください。個人の連絡先などは記載しないでください。この勤務の企業とドライバーだけで確認できます。</p><p id="workRatingMessage" role="status"></p><div class="row"><button type="button" id="workRatingClose">閉じる</button><button class="primary" type="submit" id="workRatingSave">評価を保存</button></div></form>';
 document.body.appendChild(dialog);dialog.addEventListener('close',()=>dialog.remove());document.getElementById('workRatingClose').onclick=()=>dialog.close();
 document.getElementById('workRatingForm').onsubmit=async event=>{
 event.preventDefault();const score=Number(document.getElementById('workRatingScore').value),comment=document.getElementById('workRatingComment').value.trim(),message=document.getElementById('workRatingMessage');
 if(!Number.isInteger(score)||score<1||score>5||Array.from(comment).length>1000){message.textContent='1〜5の評価を選び、コメントは1000文字以内で入力してください。';return}
 const button=document.getElementById('workRatingSave'),close=document.getElementById('workRatingClose');button.disabled=true;close.disabled=true;message.textContent='保存中…';
 try{const r=await db.rpc('submit_work_review',{p_application_id:Number(id),p_side:role,p_rating:score,p_comment:comment});if(r.error)throw r.error;dialog.close();try{await refresh()}catch(err){console.warn('Rating saved; refresh failed')}}
 catch(err){message.textContent='保存できませんでした。勤務の状態を確認し、もう一度お試しください。';button.disabled=false;close.disabled=false}
 };dialog.showModal();
 }
 global.SpodoraWorkRating={load,html,open,eligible,stars,retry:()=>refresh?.()};
})(window);
