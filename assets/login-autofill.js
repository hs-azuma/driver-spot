(function(root){
'use strict';
function enable(form,identifier,password,status){
 if(!form||!identifier||!password)return;
 const doc=form.ownerDocument;
 if(!doc.getElementById('spodoraAutofillStyle')){
  const style=doc.createElement('style');style.id='spodoraAutofillStyle';
  style.textContent='@keyframes spodoraAutofillReady{from{opacity:.999}to{opacity:1}}input[data-spodora-login]:-webkit-autofill{animation-name:spodoraAutofillReady;animation-duration:.01s}input[data-spodora-login]:autofill{animation-name:spodoraAutofillReady;animation-duration:.01s}';
  doc.head.append(style);
 }
 identifier.setAttribute('data-spodora-login','');password.setAttribute('data-spodora-login','');
 let timer=null,attempted=false;
 function filled(field){for(const selector of [':autofill',':-webkit-autofill']){try{if(field.matches(selector))return true}catch{}}return false}
 function schedule(event){
  if(attempted||event.isTrusted!==true)return;
  if(event.type==='animationstart'&&event.animationName!=='spodoraAutofillReady')return;
  root.clearTimeout(timer);timer=root.setTimeout(()=>{
   if(attempted||!form.isConnected||!identifier.value.trim()||!password.value||!filled(password)||!form.checkValidity())return;
   attempted=true;
   if(status){status.textContent='保存済みの情報でログインしています…';status.setAttribute('role','status')}
   password.blur();form.requestSubmit();
  },450);
 }
 for(const field of [identifier,password])for(const type of ['input','change','animationstart','focus','blur'])field.addEventListener(type,schedule);
 form.addEventListener('submit',()=>{attempted=true;root.clearTimeout(timer)});
}
root.SpodoraLoginAutofill={enable};
})(typeof window!=='undefined'?window:globalThis);
