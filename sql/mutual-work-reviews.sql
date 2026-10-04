-- Ratings target the named party; comments belong to their author.
-- Company: driver_rating + company_comment. Driver: company_rating + driver_comment.
alter table public.reviews alter column application_id set not null;
create unique index if not exists reviews_application_id_unique on public.reviews(application_id);
alter table public.reviews enable row level security;
revoke all on public.reviews from public,anon,authenticated;
grant select on public.reviews to authenticated;
create policy "Work participants read mutual reviews" on public.reviews for select to authenticated using(
 exists(select 1 from public.applications a where a.id=reviews.application_id and (exists(select 1 from public.drivers d where d.id=a.driver_id and d.user_id=(select auth.uid())) or exists(select 1 from public.jobs j join public.companies c on c.id=j.company_id where j.id=a.job_id and c.user_id=(select auth.uid()))))
);
create schema if not exists spodora_reviews;
revoke all on schema spodora_reviews from public,anon,authenticated;
grant usage on schema spodora_reviews to authenticated;
create or replace function spodora_reviews.submit_work_review(p_application_id bigint,p_side text,p_rating integer,p_comment text default '') returns bigint language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_driver uuid;v_company uuid;v_status text;v_out timestamptz;v_job_status text;v_id bigint;v_comment text:=btrim(coalesce(p_comment,''));
begin
 if v_actor is null then raise exception 'ログインしてください。' using errcode='42501';end if;
 if p_side not in ('company','driver') or p_side is null or p_rating is null or p_rating<1 or p_rating>5 or char_length(v_comment)>1000 then raise exception '評価は1〜5、コメントは1000文字以内で入力してください。' using errcode='22023';end if;
 select d.user_id,c.user_id,a.status,a.checked_out_at,j.status into v_driver,v_company,v_status,v_out,v_job_status
 from public.applications a join public.jobs j on j.id=a.job_id join public.drivers d on d.id=a.driver_id join public.companies c on c.id=j.company_id where a.id=p_application_id for update of a;
 if not found or (p_side='company' and v_company is distinct from v_actor) or (p_side='driver' and v_driver is distinct from v_actor) then raise exception 'この勤務を評価できません。' using errcode='42501';end if;
 if v_job_status='キャンセル' or (v_out is null and v_status is distinct from '勤務完了') then raise exception '勤務終了後に評価できます。' using errcode='22023';end if;
 if p_side='company' then
 insert into public.reviews(application_id,driver_rating,company_comment) values(p_application_id,p_rating,v_comment)
 on conflict(application_id) do update set driver_rating=excluded.driver_rating,company_comment=excluded.company_comment returning id into v_id;
 else
 insert into public.reviews(application_id,company_rating,driver_comment) values(p_application_id,p_rating,v_comment)
 on conflict(application_id) do update set company_rating=excluded.company_rating,driver_comment=excluded.driver_comment returning id into v_id;
 end if;
 return v_id;
end$$;
revoke all on function spodora_reviews.submit_work_review(bigint,text,integer,text) from public,anon,authenticated;
grant execute on function spodora_reviews.submit_work_review(bigint,text,integer,text) to authenticated;
create or replace function public.submit_work_review(p_application_id bigint,p_side text,p_rating integer,p_comment text default '') returns bigint language sql security invoker set search_path='' as $$
 select spodora_reviews.submit_work_review(p_application_id,p_side,p_rating,p_comment);
$$;
revoke all on function public.submit_work_review(bigint,text,integer,text) from public,anon,authenticated;
grant execute on function public.submit_work_review(bigint,text,integer,text) to authenticated;
notify pgrst,'reload schema';