"""Enable only WebAuthn passkeys; preserve email confirmation and SMTP settings."""
import json,os,urllib.request,urllib.error,sys
PROJECT='wyxuekjikvflpcmlliwn'
EXPECTED={'passkey_enabled':True,'webauthn_rp_display_name':'スポドラ','webauthn_rp_id':'spodora.com','webauthn_rp_origins':'https://spodora.com,https://www.spodora.com'}
def main():
 token=os.environ.get('SUPABASE_ACCESS_TOKEN','').strip()
 if not token: raise RuntimeError('SUPABASE_ACCESS_TOKEN is missing.')
 request=urllib.request.Request(f'https://api.supabase.com/v1/projects/{PROJECT}/config/auth',method='PATCH',data=json.dumps(EXPECTED).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(request,timeout=45) as r: config=json.load(r)
 except urllib.error.HTTPError as e: raise RuntimeError(f'Passkey configuration failed (HTTP {e.code}).') from None
 # Verify RP configuration from PATCH response; do not print settings containing secrets.
 if not isinstance(config,dict) or any(config.get(k)!=v for k,v in EXPECTED.items()): raise RuntimeError('Passkey relying-party settings could not be verified.')
 public=urllib.request.Request(f'https://{PROJECT}.supabase.co/auth/v1/settings',headers={'apikey':'sb_publishable_YCin6s4LUf-5Xk44OmU6zQ_gDk9ThSC'})
 with urllib.request.urlopen(public,timeout=30) as r: enabled=json.load(r).get('passkeys_enabled')
 if enabled is not True: raise RuntimeError('Passkeys were not enabled in public Auth settings.')
 print('Passkeys verified for spodora.com. Email confirmation and SMTP were not changed.')
if __name__=='__main__':
 try: main()
 except Exception as e:
  print(str(e),file=sys.stderr);sys.exit(1)
