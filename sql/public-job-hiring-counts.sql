-- Public availability needs hiring totals without exposing other drivers' applications.
-- Keep the aggregate implementation outside the exposed public API schema.
create schema if not exists spodora_job_counts;
revoke all on schema spodora_job_counts from public;
grant usage on schema spodora_job_counts to anon, authenticated;

create or replace function spodora_job_counts.hired_counts()
returns table(job_id bigint, hired_count bigint)
language sql stable security definer set search_path = ''
as $function$
  select a.job_id, count(*) from public.applications a
  join public.jobs j on j.id=a.job_id
  where j.status <> 'キャンセル'
    and a.status in ('採用','勤務確定','勤務完了')
  group by a.job_id;
$function$;
revoke all on function spodora_job_counts.hired_counts() from public;
grant execute on function spodora_job_counts.hired_counts() to anon, authenticated;

create or replace function public.get_job_hiring_counts()
returns table(job_id bigint, hired_count bigint)
language sql stable security invoker set search_path = ''
as $function$
  select j.id, coalesce(c.hired_count,0::bigint) from public.jobs j
  left join spodora_job_counts.hired_counts() c on c.job_id=j.id
  where j.status <> 'キャンセル';
$function$;
revoke all on function public.get_job_hiring_counts() from public;
grant execute on function public.get_job_hiring_counts() to anon, authenticated;
notify pgrst, 'reload schema';
