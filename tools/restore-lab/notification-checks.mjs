export async function notificationChecks(ctx) {
  const {db, check, one, role, rejects, company, driver, otherDriverUid, driverUid, companyUid, job, application} = ctx;
  await role('postgres');
  await db.exec('SAVEPOINT notification_suite');
  try {
    await db.exec('TRUNCATE public.line_notification_queue, public.company_application_email_queue');
    const lineId = 'U' + '1'.repeat(32);
    await db.query('INSERT INTO public.line_connections(user_id,line_user_id) VALUES($1,$2)', [driverUid, lineId]);
    await db.query("UPDATE public.drivers SET preferred_prefecture='東京都',preferred_municipality='新宿区',preferred_line_enabled_1=true,preferred_vehicle_types=ARRAY[]::text[],preferred_weekdays=ARRAY[]::integer[],preferred_time_slots=ARRAY[]::text[] WHERE id=$1", [driver.id]);
    const matchedJob = await one("INSERT INTO public.jobs(company_id,work_date,location,work_prefecture,work_municipality,start_time,end_time,pay_guarantee) VALUES($1,(now() AT TIME ZONE 'Asia/Tokyo')::date+2,'synthetic-notify-site','東京都','新宿区','09:00','18:00',false) RETURNING id", [company.id]);
    const jobQueueCount = async () => (await one("SELECT count(*)::int n FROM public.line_notification_queue WHERE job_id=$1 AND kind='job_match'", [matchedJob.id])).n;
    check('Matching new job queues one LINE notification', await jobQueueCount(), 1);
    await db.query("UPDATE public.jobs SET status='募集終了' WHERE id=$1", [matchedJob.id]);
    await db.query("UPDATE public.jobs SET status='募集中' WHERE id=$1", [matchedJob.id]);
    check('Job reopening cannot duplicate LINE event key', await jobQueueCount(), 1);
    await db.query('INSERT INTO public.company_driver_blocks(company_id,driver_id) VALUES($1,$2)', [company.id, driver.id]);
    await role('service_role');
    check('Blocked job notification is not claimed', (await db.query('SELECT * FROM public.claim_line_notifications()')).rows, []);
    await role('postgres');
    check('Blocked job notification marked skipped', (await one("SELECT state FROM public.line_notification_queue WHERE job_id=$1", [matchedJob.id])).state, 'skipped');
    await db.exec('TRUNCATE public.line_notification_queue');
    await db.query('DELETE FROM public.company_driver_blocks WHERE company_id=$1 AND driver_id=$2', [company.id, driver.id]);
    const enqueue = async (key, uid = driverUid, attempts = 0, expired = false) => one(
      "INSERT INTO public.line_notification_queue(user_id,kind,event_key,message,attempts,expires_at) VALUES($1,'test',$2,'synthetic-only',$3,now()+($4::int * interval '1 hour')) RETURNING id",
      [uid, key, attempts, expired ? -1 : 1]);
    const valid = await enqueue('fixture-valid');
    await enqueue('fixture-expired', driverUid, 0, true);
    await enqueue('fixture-max-attempts', driverUid, 6);
    await enqueue('fixture-not-linked', otherDriverUid);
    await role('authenticated', driverUid);
    await rejects('Client cannot claim LINE queue', 'SELECT * FROM public.claim_line_notifications()', []);
    await rejects('Client cannot read LINE queue', 'SELECT * FROM public.line_notification_queue', []);
    await rejects('Client cannot claim company email queue', 'SELECT * FROM public.claim_company_application_emails()', []);
    await role('service_role');
    const claimed = (await db.query('SELECT * FROM public.claim_line_notifications()')).rows;
    check('LINE worker claims only eligible row', claimed.map(x => x.id), [valid.id]);
    check('LINE claim increments attempts once', claimed[0].attempts, 1);
    check('LINE claim pins current destination', claimed[0].destination, lineId);
    check('LINE lease prevents immediate re-claim', (await db.query('SELECT * FROM public.claim_line_notifications()')).rows, []);
    await role('postgres');
    check('Expired/capped/unlinked LINE rows skipped', (await one("SELECT count(*)::int n FROM public.line_notification_queue WHERE state='skipped'")).n, 3);
    await db.query("UPDATE public.line_notification_queue SET lease_until=now()-interval '1 minute' WHERE id=$1", [valid.id]);
    await role('service_role');
    check('Expired LINE lease can be retried', (await one('SELECT attempts FROM public.claim_line_notifications()')).attempts, 2);
    await role('postgres');
    await db.query('UPDATE public.line_connections SET line_user_id=$1 WHERE user_id=$2', ['U' + '2'.repeat(32), driverUid]);
    await role('service_role');
    check('Changed LINE destination prevents stale re-send', (await db.query('SELECT * FROM public.claim_line_notifications()')).rows, []);
    await role('postgres');
    check('Stale-destination LINE row marked skipped', (await one('SELECT state FROM public.line_notification_queue WHERE id=$1', [valid.id])).state, 'skipped');

    const mail = await one("INSERT INTO public.company_application_email_queue(company_id,application_id,job_id,recipient,subject,message) VALUES($1,$2,$3,'fixture@example.invalid','synthetic subject','synthetic message') RETURNING id", [company.id, application.id, job.id]);
    await role('service_role');
    const mails = (await db.query('SELECT * FROM public.claim_company_application_emails()')).rows;
    check('Email worker claims expected application event', mails.map(x => x.id), [mail.id]);
    check('Email claim increments attempts once', mails[0].attempts, 1);
    check('Email lease prevents immediate duplicate claim', (await db.query('SELECT * FROM public.claim_company_application_emails()')).rows, []);
    await role('postgres');
    await db.query("UPDATE public.company_application_email_queue SET lease_until=now()-interval '1 minute' WHERE id=$1", [mail.id]);
    await role('service_role');
    check('Expired email lease can be retried', (await one('SELECT attempts FROM public.claim_company_application_emails()')).attempts, 2);
    await role('postgres');
    await db.query('UPDATE public.company_application_email_queue SET attempts=6 WHERE id=$1', [mail.id]);
    await role('service_role');
    check('Email attempt cap prevents another claim', (await db.query('SELECT * FROM public.claim_company_application_emails()')).rows, []);
    await role('postgres');
    check('Capped email marked skipped', (await one('SELECT state FROM public.company_application_email_queue WHERE id=$1', [mail.id])).state, 'skipped');
    // No notification processor/provider is loaded. These are DB queue and serial lease tests only.
  } finally {
    await role('postgres');
    await db.exec('ROLLBACK TO SAVEPOINT notification_suite; RELEASE SAVEPOINT notification_suite');
  }
}
