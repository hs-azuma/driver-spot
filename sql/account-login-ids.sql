begin;
create table if not exists public.account_login_ids (
 login_id text primary key check (login_id ~ '^[a-z0-9][a-z0-9_-]{3,31}$'),
 user_id uuid unique references auth.users(id) on delete cascade,
 recovery_hash text,
 created_at timestamptz not null default now()
);
alter table public.account_login_ids enable row level security;
revoke all on public.account_login_ids from public,anon,authenticated;
grant select,insert,update,delete on public.account_login_ids to service_role;
create table if not exists public.account_auth_limits (
 key text primary key, window_start timestamptz not null, attempts integer not null
);
alter table public.account_auth_limits enable row level security;
revoke all on public.account_auth_limits from public,anon,authenticated;
grant select,insert,update,delete on public.account_auth_limits to service_role;
create or replace function public.account_auth_allow(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if length(p_key)>150 or p_limit<1 or p_limit>1000 or p_seconds<1 or p_seconds>86400 then return false; end if;
 insert into public.account_auth_limits as counters(key,window_start,attempts) values(p_key,now(),1)
 on conflict(key) do update set
 window_start=case when counters.window_start < now()-make_interval(secs=>p_seconds) then now() else counters.window_start end,
 attempts=case when counters.window_start < now()-make_interval(secs=>p_seconds) then 1 else counters.attempts+1 end
 returning attempts into n;
 return n<=p_limit;
end $$;
revoke all on function public.account_auth_allow(text,integer,integer) from public,anon,authenticated;
grant execute on function public.account_auth_allow(text,integer,integer) to service_role;
commit;
