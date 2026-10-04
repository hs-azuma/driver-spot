-- Provision a random 32-byte worker key in Vault as spodora_line_worker_key.
-- Deploy its SHA-256 digest as AUTH_HASH in the line-notifications worker.
-- Never commit the plaintext key or the LINE channel token.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('spodora-line-notifications','* * * * *',$job$
select net.http_post(url:='https://wyxuekjikvflpcmlliwn.supabase.co/functions/v1/line-notifications',headers:=jsonb_build_object('Content-Type','application/json','x-spodora-worker-key',(select decrypted_secret from vault.decrypted_secrets where name='spodora_line_worker_key')),body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
