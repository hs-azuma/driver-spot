begin;
do $test$
declare test_job bigint; test_application bigint; expected_email text; mail_count integer; line_count integer;
begin
 if not exists(select 1 from public.companies c join public.drivers d on d.user_id=c.user_id where c.id=14 and d.id=4) then raise exception 'Test account ownership mismatch';end if;
 insert into public.jobs(company_id,job_description,work_date,start_time,end_time,location,status,visibility,required_headcount,pay_type,pay_amount,break_minutes,pay_guarantee)
 values(14,'【通知テスト・実勤務なし】企業への応募通知確認','2026-10-08','09:00','10:00','集合場所なし・応募通知テストのみ','募集中','draft',1,'時給',1600,0,true)
 returning id into test_job;
 perform set_config('request.jwt.claim.sub',(select user_id::text from public.drivers where id=4),true);
 insert into public.applications(job_id,driver_id,status) values(test_job,4,'応募中') returning id into test_application;
 select email into expected_email from public.companies where id=14;
 select count(*) into mail_count from public.company_application_email_queue where application_id=test_application and recipient=expected_email and message like '%'||chr(10)||'勤務日：2026-10-08%';
 select count(*) into line_count from public.line_notification_queue where application_id=test_application and kind='new_application';
 if mail_count<>1 or line_count<>1 then raise exception 'Application did not queue both channels';end if;
 if has_table_privilege('anon','public.company_application_email_queue','SELECT') or has_table_privilege('authenticated','public.company_application_email_queue','SELECT') or has_function_privilege('authenticated','public.claim_company_application_emails()','EXECUTE') then raise exception 'Queue exposed to client';end if;
end;
$test$;
rollback;