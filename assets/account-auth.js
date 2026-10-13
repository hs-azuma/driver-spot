(function(root){
'use strict';
const internalDomain='@accounts.spodora.invalid';
function contactEmail(user){const email=user?.email||'';return email.endsWith(internalDomain)?'':email}
function message(code){return ({invalid_login_id:'ログインIDは半角英数字・ハイフン・アンダーバーで4〜32文字にしてください。',invalid_password:'パスワードは8〜128文字で入力してください。',invalid_email:'正しいメールアドレスを入力してください。',company_phone_required:'企業登録には電話番号が必要です。',company_email_required:'企業登録にはメールアドレスが必要です。',email_confirmation_required:'メール確認がまだ完了していません。確認メール内のリンクを開いてください。',invalid_profile:'必須項目を確認してください。',separate_account_required:'ドライバー用と企業用は別アカウントです。それぞれの登録画面から新しく登録してください。',login_id_unavailable:'このログインIDは使用されています。別のIDを入力してください。',invalid_credentials:'ログインID・パスワード、または復旧コードを確認してください。',rate_limited:'試行回数が多いため、時間をおいてお試しください。',email_in_use:'このメールアドレスはすでに登録されています。既存のアカウントでログインしてください。パスワードを忘れた場合は再設定できます。',weak_password:'このパスワードは安全性の条件を満たしていません。推測されにくい別のパスワードを入力してください。',registration_unavailable:'登録サービスでエラーが発生しました。入力内容はそのままで、時間をおいて再度お試しください。',signup_failed:'登録を完了できませんでした。入力内容はそのままで、時間をおいて再度お試しください。',registered_login_required:'アカウントは作成されました。復旧コードを保存し、ログイン画面からログインしてください。',unauthorized:'ログインし直してください。',no_login_id:'既存のメール登録アカウントは、メールアドレスでログインしてください。'})[code]||'処理を完了できませんでした。通信を確認し、時間をおいてお試しください。'}
async function request(client,body){const r=await client.functions.invoke('account-auth',{body});if(r.error||r.data?.error){let detail=r.data;if(!detail&&r.error?.context){try{detail=await r.error.context.json()}catch{}}const error=new Error(message(detail?.error));error.code=detail?.error||'network_error';error.recoveryCode=detail?.recovery_code;throw error}return r.data}
async function adopt(client,result){if(!result.session)throw new Error('ログインを完了できませんでした。ログイン画面からお試しください。');const r=await client.auth.setSession({access_token:result.session.access_token,refresh_token:result.session.refresh_token});if(r.error){const error=new Error('ログイン状態を保存できませんでした。ログイン画面からお試しください。');error.recoveryCode=result.recovery_code;throw error}return {user:r.data.user,recoveryCode:result.recovery_code}}
async function signup(client,loginId,email,password,profile){const result=await request(client,{action:'signup',login_id:loginId,email,password,profile});return result.confirmation_required?{confirmationRequired:true,email:result.email,recoveryCode:result.recovery_code,emailSent:result.email_sent}:adopt(client,result)}
async function login(client,identifier,password){if(identifier.includes('@')){const r=await client.auth.signInWithPassword({email:identifier.trim(),password});if(r.error)throw new Error('メールアドレスとパスワードを確認してください。未認証の場合は確認メールのリンクを開いてください。');return r.data}return adopt(client,await request(client,{action:'login',login_id:identifier,password}))}
async function requirePortal(client,portal,user){
 if(!['driver','company'].includes(portal)||!user?.id)throw new Error('ログイン状態を確認できませんでした。');
 const own=await client.from(portal==='driver'?'drivers':'companies').select('id').eq('user_id',user.id).maybeSingle();
 if(own.error)throw new Error('登録情報を確認できませんでした。時間をおいてお試しください。');
 if(own.data)return user;
 const other=await client.from(portal==='driver'?'companies':'drivers').select('id').eq('user_id',user.id).maybeSingle();
 if(other.error)throw new Error('登録情報を確認できませんでした。時間をおいてお試しください。');
 if(other.data){const error=new Error(portal==='driver'?'企業用アカウントではドライバーとしてログインできません。ドライバー用アカウントでログイン、または新規登録してください。':'ドライバー用アカウントでは企業としてログインできません。企業用アカウントでログイン、または新規登録してください。');error.code='separate_account_required';throw error}
 return user;
}
async function portalLogin(client,portal,identifier,password){const result=await login(client,identifier,password);try{await requirePortal(client,portal,result.user);return result}catch(error){await client.auth.signOut({scope:'local'});throw error}}
async function portalPasskey(client,portal){const result=await passkey(client,false);try{await requirePortal(client,portal,result.user);return result}catch(error){await client.auth.signOut({scope:'local'});throw error}}
async function recover(client,loginId,recoveryCode,password){return adopt(client,await request(client,{action:'recover',login_id:loginId,recovery_code:recoveryCode,password}))}
async function passkeyAvailable(){if(!root.PublicKeyCredential||!root.isSecureContext)return false;try{const r=await fetch('https://wyxuekjikvflpcmlliwn.supabase.co/auth/v1/settings',{headers:{apikey:'sb_publishable_YCin6s4LUf-5Xk44OmU6zQ_gDk9ThSC'}});return r.ok&&(await r.json()).passkeys_enabled===true}catch{return false}}
async function showPasskey(button){if(button)button.hidden=!await passkeyAvailable()}
function fromBase64url(value){const text=root.atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(text,c=>c.charCodeAt(0)).buffer}
function toBase64url(value){return root.btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
let passkeyBusy=false;
function passkeyPrompt(publicKey,register){
return new Promise((resolve,reject)=>{
 const doc=root.document,previous=doc.activeElement,dialog=doc.createElement('dialog');
 dialog.setAttribute('aria-labelledby','spodoraPasskeyTitle');dialog.style.cssText='border:1px solid #dbe3ef;border-radius:16px;padding:24px;width:calc(100% - 32px);max-width:440px;color:#172033;background:white;box-shadow:0 15px 60px #17203340;';
 const title=doc.createElement('h2');title.id='spodoraPasskeyTitle';title.style.cssText='font-size:22px;margin:0 0 14px';title.textContent=register?'Face ID・指紋認証を登録':'Face ID・指紋認証でログイン';
 const note=doc.createElement('p');note.style.cssText='font-size:16px;line-height:1.7';note.textContent=register?'準備ができました。下のボタンを押し、端末の画面でパスキーの保存を完了してください。':'下のボタンを押し、このアカウントのパスキーを選んでください。未登録の場合は、先にパスワードでログインしてプロフィールから登録してください。';
 const next=doc.createElement('button');next.type='button';next.textContent=register?'登録を続ける':'認証を続ける';next.style.cssText='display:block;width:100%;min-height:54px;padding:12px;border:0;border-radius:10px;background:#1769d2;color:white;font-size:17px;font-weight:bold;margin:18px 0 12px';
 const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='キャンセル';cancel.style.cssText='display:block;width:100%;min-height:44px;border:1px solid #cbd7e8;border-radius:10px;background:white;color:#172033;font-size:16px';
 const controller=new root.AbortController();let finished=false;
 function finish(value,error){if(finished)return;finished=true;clearTimeout(timer);dialog.remove();previous?.focus?.();error?reject(error):resolve(value)}
 function stop(){controller.abort();const error=new Error('認証を中止しました');error.name='AbortError';finish(null,error)}
 cancel.onclick=stop;dialog.addEventListener('cancel',event=>{event.preventDefault();stop()});
 next.onclick=()=>{
  if(next.disabled)return;next.disabled=true;note.textContent='端末の認証画面で操作を完了してください。';
  // Invoke WebAuthn synchronously in this fresh click handler: no fetch or await before it.
  try{const operation=register?root.navigator.credentials.create({publicKey,signal:controller.signal}):root.navigator.credentials.get({publicKey,signal:controller.signal,mediation:'required'});Promise.resolve(operation).then(value=>{if(!value)throw new Error('empty_credential');finish(value)},error=>finish(null,error)).catch(error=>finish(null,error))}catch(error){finish(null,error)}
 };
 const timer=setTimeout(()=>{controller.abort();const error=new Error('認証の準備の有効期限が切れました');error.code='webauthn_challenge_expired';finish(null,error)},240000);
 dialog.append(title,note,next,cancel);doc.body.append(dialog);dialog.showModal();next.focus();
});
}
function serializePasskey(credential,register){
 if(typeof credential.toJSON==='function')return credential.toJSON();
 const r=credential.response;return {id:credential.id,rawId:toBase64url(credential.rawId),type:credential.type,response:register?{attestationObject:toBase64url(r.attestationObject),clientDataJSON:toBase64url(r.clientDataJSON)}:{authenticatorData:toBase64url(r.authenticatorData),clientDataJSON:toBase64url(r.clientDataJSON),signature:toBase64url(r.signature),userHandle:r.userHandle?toBase64url(r.userHandle):null},clientExtensionResults:credential.getClientExtensionResults(),authenticatorAttachment:credential.authenticatorAttachment||undefined};
}
async function registerNamedPasskey(client){
 const info=await request(client,{action:'account-info'});const label=info.login_id||info.email||'スポドラ';
 const started=await client.auth.passkey.startRegistration();if(started.error)throw started.error;if(!started.data?.options)throw new Error('missing_options');
 const raw=started.data.options;const named={...raw,user:{...raw.user,name:label,displayName:label}};
 let publicKey;if(typeof root.PublicKeyCredential.parseCreationOptionsFromJSON==='function'){publicKey=root.PublicKeyCredential.parseCreationOptionsFromJSON(named)}else{publicKey={...named,challenge:fromBase64url(named.challenge),user:{...named.user,id:fromBase64url(named.user.id)}};if(named.excludeCredentials)publicKey.excludeCredentials=named.excludeCredentials.map(x=>({...x,id:fromBase64url(x.id)}))}
 const credential=await passkeyPrompt(publicKey,true);
 return client.auth.passkey.verifyRegistration({challengeId:started.data.challenge_id,credential:serializePasskey(credential,true)});
}
async function signInPreparedPasskey(client){
 const started=await client.auth.passkey.startAuthentication();if(started.error)throw started.error;if(!started.data?.options)throw new Error('missing_options');
 const raw=started.data.options;let publicKey;
 if(typeof root.PublicKeyCredential.parseRequestOptionsFromJSON==='function')publicKey=root.PublicKeyCredential.parseRequestOptionsFromJSON(raw);
 else{publicKey={...raw,challenge:fromBase64url(raw.challenge)};if(raw.allowCredentials)publicKey.allowCredentials=raw.allowCredentials.map(x=>({...x,id:fromBase64url(x.id)}))}
 const credential=await passkeyPrompt(publicKey,false);
 return client.auth.passkey.verifyAuthentication({challengeId:started.data.challenge_id,credential:serializePasskey(credential,false)});
}
async function passkey(client,register){
 if(passkeyBusy)throw new Error('認証を準備中です。表示された画面で操作してください。');passkeyBusy=true;
 try{
  if(!await passkeyAvailable()||!root.navigator?.credentials?.create||!root.navigator?.credentials?.get)throw new Error('このブラウザではパスキーを利用できません。Safariでスポドラを開き、パスワードでログインしてお試しください。');
  const result=register?await registerNamedPasskey(client):await signInPreparedPasskey(client);if(result.error)throw result.error;return result.data;
 }catch(error){
  const name=error?.name||error?.cause?.name,code=error?.code;
  if(name==='NotAllowedError'||name==='AbortError')throw new Error(register?'パスキーの登録は完了していません。端末の画面で保存を完了してください。認証画面が開かない場合はSafariでスポドラを開き、ログインして再度お試しください。':'パスキーでログインできませんでした。未登録の場合は、パスワードでログインしてプロフィールから登録してください。認証画面が開かない場合はSafariでお試しください。');
  if(code==='webauthn_challenge_expired')throw new Error('認証の準備の有効期限が切れました。もう一度ボタンを押してお試しください。');
  if(name==='InvalidStateError')throw new Error('この端末にはすでにパスキーが保存されています。登録済みのパスキーでログインしてください。');
  if(name==='SecurityError')throw new Error('このブラウザから認証画面を開けませんでした。Safariで https://spodora.com を開いてお試しください。');
  if(error.message?.startsWith('このブラウザ'))throw error;
  throw new Error(register?'パスキーの登録は完了していません。ログインし直して再度お試しください。端末で保存した後に失敗した場合も、この画面で登録完了を確認してください。':'パスキーでログインできませんでした。パスワードでログインし、登録状態をご確認ください。');
 }finally{passkeyBusy=false}
}

function recoveryPanel(container,code,next){container.replaceChildren();const title=document.createElement('h2');title.textContent='登録・ログインが完了しました';const note=document.createElement('p');note.textContent='次の復旧コードを安全な場所に保存してください。パスワードを忘れたときに使えます。再発行すると以前のコードは使えなくなります。';const value=document.createElement('p');value.style.overflowWrap='anywhere';value.style.fontFamily='monospace';value.textContent=code;const copy=document.createElement('button');copy.type='button';copy.textContent='復旧コードをコピー';copy.onclick=async()=>{try{await navigator.clipboard.writeText(code);copy.textContent='コピーしました'}catch{copy.textContent='コードを長押ししてコピーしてください'}};const checkLabel=document.createElement('label');checkLabel.style.display='block';checkLabel.style.margin='20px 0';const check=document.createElement('input');check.type='checkbox';check.style.width='auto';checkLabel.append(check,document.createTextNode(' 復旧コードを保存しました'));const go=document.createElement('button');go.type='button';go.className='btn primary';go.disabled=true;go.textContent='利用を開始する';check.onchange=()=>go.disabled=!check.checked;go.onclick=next;container.append(title,note,value,copy,checkLabel,go);container.scrollIntoView({block:'start'});}
root.SpodoraAccount={contactEmail,message,request,signup,login,requirePortal,portalLogin,portalPasskey,recover,passkey,showPasskey,recoveryPanel};
})(typeof window!=='undefined'?window:globalThis);

