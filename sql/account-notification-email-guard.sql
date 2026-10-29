create or replace function spodora_private.queue_company_application_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare j record; c record; recipient_email text; driver_name text;
begin
 select id,company_id,job_description,work_date,start_time,end_time into j from public.jobs where id=new.job_id;
 select company_name,user_id,email into c from public.companies where id=j.company_id;
 if c.user_id is null then return new; end if;
 select coalesce(nullif(trim(c.email),''),u.email) into recipient_email from auth.users u where u.id=c.user_id;
 if recipient_email is null or trim(recipient_email)='' or recipient_email like '%@accounts.spodora.invalid' then return new;end if;
 select name into driver_name from public.drivers where id=new.driver_id;
 insert into public.company_application_email_queue(company_id,application_id,job_id,recipient,subject,message)
 values(j.company_id,new.id,j.id,recipient_email,
 '【スポドラ】求人に新しい応募が届きました｜'||left(coalesce(j.job_description,'ドライバー求人'),100),
 coalesce(c.company_name,'企業')||' ご担当者様'||chr(10)||chr(10)||
 '掲載中の求人に新しい応募がありました。'||chr(10)||chr(10)||
 '求人：'||coalesce(j.job_description,'ドライバー求人')||chr(10)||
 '勤務日：'||coalesce(j.work_date::text,'未設定')||chr(10)||
 '勤務時間：'||coalesce(left(j.start_time::text,5),'')||'〜'||coalesce(left(j.end_time::text,5),'')||chr(10)||
 '応募者：'||coalesce(driver_name,'ドライバー')||chr(10)||chr(10)||
 '応募者の確認・選考は企業画面からお願いします。'||chr(10)||
 'https://spodora.com/company-applicants.html'||chr(10)||chr(10)||'スポドラ')
 on conflict(application_id) do nothing;
 return new;
end;
$$;
revoke all on function spodora_private.queue_company_application_email() from public,anon,authenticated;

