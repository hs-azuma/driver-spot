-- Keep existing RLS ownership rules and driver visibility; allow companies to block only their applicants.
revoke all on public.company_driver_blocks from public,anon,authenticated;
revoke select(company_id,driver_id) on public.company_driver_blocks from anon;
grant select(company_id,driver_id) on public.company_driver_blocks to authenticated;
grant insert(company_id,driver_id),delete on public.company_driver_blocks to authenticated;
do $$declare seq text:=pg_get_serial_sequence('public.company_driver_blocks','id');begin if seq is not null then execute format('grant usage on sequence %s to authenticated',seq);end if;end$$;
create policy "Only related applicants can be blocked" on public.company_driver_blocks as restrictive for insert to authenticated with check(
 exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id where a.driver_id=company_driver_blocks.driver_id and j.company_id=company_driver_blocks.company_id)
);
notify pgrst,'reload schema';
CREATE OR REPLACE FUNCTION spodora_private.driver_job_area_matches(d public.drivers, j public.jobs, p_channel text)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $function$
 select not exists(select 1 from public.company_driver_blocks b where b.company_id=j.company_id and b.driver_id=d.id) and coalesce(
 (case p_channel when 'email' then d.preferred_email_enabled_1 when 'line' then d.preferred_line_enabled_1 else false end and d.preferred_prefecture=j.work_prefecture and d.preferred_municipality in (j.work_municipality,j.work_prefecture||'全域'))
 or (case p_channel when 'email' then d.preferred_email_enabled_2 when 'line' then d.preferred_line_enabled_2 else false end and d.preferred_prefecture_2=j.work_prefecture and d.preferred_municipality_2 in (j.work_municipality,j.work_prefecture||'全域'))
 or (case p_channel when 'email' then d.preferred_email_enabled_3 when 'line' then d.preferred_line_enabled_3 else false end and d.preferred_prefecture_3=j.work_prefecture and d.preferred_municipality_3 in (j.work_municipality,j.work_prefecture||'全域')),false);
$function$;