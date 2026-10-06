begin;
do $test$
declare profile jsonb; line jsonb;
begin
 perform set_config('request.jwt.claim.sub',(select user_id::text from public.drivers where id=4),true);
 select to_jsonb(d) into profile from public.drivers d where id=4;
 select jsonb_build_object('job_match',p.job_match,'application_result',p.application_result,'work_reminder',p.work_reminder) into line
 from public.line_notification_preferences p join public.drivers d on d.user_id=p.user_id where d.id=4;
 line:=coalesce(line,jsonb_build_object('job_match',false,'application_result',true,'work_reminder',true));
 perform public.save_driver_preferences(profile||jsonb_build_object('name_kana','テスト タロウ'),line);
 if (select name_kana from public.drivers where id=4) is distinct from 'テスト タロウ' then raise exception 'Kana not saved';end if;
 perform public.save_driver_preferences(profile-'name_kana',line);
 if (select name_kana from public.drivers where id=4) is distinct from 'テスト タロウ' then raise exception 'Legacy caller erased kana';end if;
 begin
  perform public.save_driver_preferences(profile||jsonb_build_object('name_kana','ひらがな'),line);
  raise exception 'Invalid kana accepted';
 exception when check_violation then null;
 end;
end;
$test$;
rollback;