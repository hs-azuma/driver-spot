create table public.line_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  line_user_id text not null unique check (line_user_id ~ '^U[0-9a-f]{32}$'),
  active boolean not null default true,
  linked_at timestamptz not null default now()
);
create table public.line_link_requests (
  ticket_hash text primary key check (ticket_hash ~ '^[0-9a-f]{64}$'),
  line_user_id text not null check (line_user_id ~ '^U[0-9a-f]{32}$'),
  link_token text not null,
  expires_at timestamptz not null,
  user_id uuid references auth.users(id) on delete cascade,
  nonce_hash text unique check (nonce_hash ~ '^[0-9a-f]{64}$')
);
create index line_link_requests_expiry on public.line_link_requests(expires_at);
create index line_link_requests_user on public.line_link_requests(user_id);
create index line_link_requests_line_user on public.line_link_requests(line_user_id);
alter table public.line_connections enable row level security;
alter table public.line_link_requests enable row level security;
revoke all on public.line_connections, public.line_link_requests from public, anon, authenticated;
grant all on public.line_connections, public.line_link_requests to service_role;

create function public.begin_line_link(p_ticket_hash text, p_user_id uuid, p_nonce_hash text)
returns text language plpgsql security invoker set search_path = '' as $$
declare token text;
begin
  update public.line_link_requests set user_id=p_user_id, nonce_hash=p_nonce_hash
  where ticket_hash=p_ticket_hash and user_id is null and expires_at>now()
  returning link_token into token;
  return token;
end $$;

create function public.complete_line_link(p_nonce_hash text, p_line_user_id text, p_success boolean)
returns text language plpgsql security invoker set search_path = '' as $$
declare pending public.line_link_requests; existing public.line_connections;
begin
  perform pg_advisory_xact_lock(hashtextextended('line-account-link',0));
  select * into pending from public.line_link_requests where nonce_hash=p_nonce_hash for update;
  if not found then return 'used_or_unknown'; end if;
  delete from public.line_link_requests where ticket_hash=pending.ticket_hash;
  if not p_success or pending.user_id is null or pending.expires_at<=now() or pending.line_user_id<>p_line_user_id then return 'invalid'; end if;
  -- Unique constraints and this lock keep simultaneous link attempts atomic.
  if exists(select 1 from public.line_connections where (user_id=pending.user_id and line_user_id<>p_line_user_id) or (line_user_id=p_line_user_id and user_id<>pending.user_id)) then return 'conflict'; end if;
  insert into public.line_connections(user_id,line_user_id) values(pending.user_id,p_line_user_id)
  on conflict(user_id) do update set active=true, linked_at=now();
  return 'linked';
end $$;

create function public.unlink_line_account(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('line-account-link',0));
  delete from public.line_link_requests where user_id=p_user_id;
  delete from public.line_connections where user_id=p_user_id;
end $$;
revoke all on function public.begin_line_link(text,uuid,text), public.complete_line_link(text,text,boolean), public.unlink_line_account(uuid) from public, anon, authenticated;
grant execute on function public.begin_line_link(text,uuid,text), public.complete_line_link(text,text,boolean), public.unlink_line_account(uuid) to service_role;
