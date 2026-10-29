"""Localize password recovery email and preserve existing allowed redirects."""
import json,os,urllib.request,urllib.error,sys,time
PROJECT='wyxuekjikvflpcmlliwn'
URL=f'https://api.supabase.com/v1/projects/{PROJECT}/config/auth'
TEMPLATE='''<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.7;padding:24px"><h2>スポドラのパスワード再設定</h2><p>下のボタンを押して、新しいパスワードを設定してください。</p><p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1769d2;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none">パスワードを再設定する</a></p><p>リンクは一度だけ使用できます。期限が切れた場合は、スポドラのアカウント復旧画面からメールを送り直してください。</p><p>この操作に心当たりがない場合は、このメールを破棄してください。リンクを開いて変更するまで、パスワードは変更されません。</p><p>スポドラ</p></body></html>'''
def main():
 token=os.environ.get('SUPABASE_ACCESS_TOKEN','').strip()
 if not token:raise RuntimeError('SUPABASE_ACCESS_TOKEN is missing')
 def call(data=None):
  req=urllib.request.Request(URL,method='GET' if data is None else 'PATCH',data=None if data is None else json.dumps(data).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
  try:
   with urllib.request.urlopen(req,timeout=40) as r:return json.load(r)
  except urllib.error.HTTPError as e:raise RuntimeError(f'Auth configuration failed (HTTP {e.code})') from None
 patch={'mailer_subjects_recovery':'【スポドラ】パスワード再設定','mailer_templates_recovery_content':TEMPLATE}
 config=call(patch)
 existing=config.get('uri_allow_list')
 if not isinstance(existing,str):raise RuntimeError('Existing redirect allow list could not be verified')
 entries=[x.strip() for x in existing.split(',') if x.strip()]
 for origin in ['https://spodora.com','https://www.spodora.com']:
  for suffix in ['/account-recovery.html','/account-recovery.html?portal=company']:
   if origin+suffix not in entries:entries.append(origin+suffix)
 patch['uri_allow_list']=','.join(entries)
 final=call(patch)
 if any(final.get(k)!=v for k,v in patch.items()):raise RuntimeError('Recovery configuration verification failed')
 print('Japanese recovery email and production recovery redirects verified. SMTP and signup settings preserved.')
if __name__=='__main__':
 try:main()
 except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
