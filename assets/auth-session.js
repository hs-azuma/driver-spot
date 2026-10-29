(function(root){
'use strict';
const options={auth:{flowType:'implicit',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true,experimental:{passkey:true}}};
function callbackInfo(hash){const p=new URLSearchParams(String(hash||'').replace(/^#/,''));return{present:p.has('access_token')||p.has('refresh_token')||p.has('error')||p.has('error_code'),failed:p.has('error')||p.has('error_code')};}
async function ready(client,info){const result=await client.auth.getSession();if(info.present&&(info.failed||result.error||!result.data?.session))throw new Error('確認リンクが無効か、有効期限が切れています。登録画面から確認メールを送り直してください。');if(result.error)throw new Error('ログイン状態を確認できませんでした。時間をおいてもう一度お試しください。');return result.data?.session||null;}
function destination(user){const m=user?.user_metadata||{};return m.company_name&&!m.driver_name?'./company-register.html':'./driver.html';}
function showError(container){container.textContent='メール認証後のログインを完了できませんでした。確認リンクの期限が切れている場合は、登録画面から確認メールを送り直してください。';container.setAttribute('role','alert');}
const api={options,callbackInfo,ready,destination,showError};
if(typeof module==='object'&&module.exports)module.exports=api;else root.SpodoraAuthSession=api;
})(typeof window!=='undefined'?window:globalThis);

