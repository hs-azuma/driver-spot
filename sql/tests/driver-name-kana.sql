begin;
do $test$
declare test_uid uuid:=gen_random_uuid(); test_driver bigint;
 profile jsonb:=jsonb_build_object('name','フリガナ動作確認','phone','0000000000','match_email_enabled',false,'preferred_vehicle_types','[]'::jsonb,'preferred_weekdays','[]'::jsonb,'preferred_time_slots','[]'::jsonb,'license_type','普通','experience','1年未満');
 line jsonb:=jsonb_build_object('job_match',false,'application_result',true,'work_reminder',true);
begin
 -- Rolled back fixture: no password, real recipient, confirmation email, or persistent account.
 insert into auth.users(id,email,raw_user_meta_data) values(test_uid,'kana-fixture-'||test_uid||'@example.invalid',jsonb_build_object('driver_name','フリガナ動作確認','driver_name_kana','テスト タロウ','driver_phone','0000000000'));
 select id into test_driver from public.drivers where user_id=test_uid and name_kana='テスト タロウ';
 if test_driver is null then raise exception 'Registration did not store kana';end if;
 perform set_config('request.jwt.claim.sub',test_uid::text,true);
 perform public.save_driver_preferences(profile||jsonb_build_object('name_kana','テスト ジロウ'),line);
 if (select name_kana from public.drivers where id=test_driver) is distinct from 'テスト ジロウ' then raise exception 'Kana not saved';end if;
 perform public.save_driver_preferences(profile,line);
 if (select name_kana from public.drivers where id=test_driver) is distinct from 'テスト ジロウ' then raise exception 'Legacy caller erased kana';end if;
 begin
  perform public.save_driver_preferences(profile||jsonb_build_object('name_kana','ひらがな'),line);
  raise exception 'Invalid kana accepted';
 exception when check_violation then null;
 end;
end;
$test$;
rollback;