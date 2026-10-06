begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.drivers where id=4),true);
set local role authenticated;
insert into public.driver_company_favorites(driver_id,company_id) values(4,14);
do $$begin
 if (select count(*) from public.driver_company_favorites where driver_id=4 and company_id=14)<>1 then raise exception 'Own favorite not readable'; end if;
 begin
  insert into public.driver_company_favorites(driver_id,company_id) values(5,14);
  raise exception 'Other driver insert unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
end$$;
delete from public.driver_company_favorites where driver_id=4 and company_id=14;
do $$begin
 if exists(select 1 from public.driver_company_favorites where driver_id=4 and company_id=14) then raise exception 'Own delete failed';end if;
 if has_table_privilege('anon','public.driver_company_favorites','SELECT') or has_table_privilege('authenticated','public.company_public_names','UPDATE') then raise exception 'Unexpected public privileges';end if;
end$$;
reset role;
update public.companies set company_name=company_name||'__sync_test' where id=14;
do $$begin
 if not exists(select 1 from public.companies c join public.company_public_names p on p.company_id=c.id where c.id=14 and c.company_name=p.company_name) then raise exception 'Name sync failed';end if;
end$$;
rollback;