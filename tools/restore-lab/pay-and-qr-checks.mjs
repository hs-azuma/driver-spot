export async function payAndQrChecks(ctx) {
  const {db, check, one, role, rejects, company, otherCompany, driver,
    companyUid, otherCompanyUid, driverUid, otherDriverUid} = ctx;
  await role('postgres');
  await db.exec('SAVEPOINT pay_qr_suite');
  try {
    const date = (await one("SELECT ((now() AT TIME ZONE 'Asia/Tokyo')::date-2)::text AS date")).date;
    for (const guaranteed of [false, true]) {
      await role('postgres');
      const job = await one("INSERT INTO public.jobs(company_id,work_date,location,start_time,end_time,break_minutes,pay_type,pay_amount,pay_guarantee,transportation_fee_type,transportation_fee) VALUES($1,$2,'synthetic-pay-site','09:00','18:00',60,'時給',1200,$3,'金額指定',500) RETURNING id", [company.id, date, guaranteed]);
      await role('authenticated', driverUid);
      const application = await one('INSERT INTO public.applications(job_id,driver_id) VALUES($1,$2) RETURNING id', [job.id, driver.id]);
      await role('authenticated', companyUid);
      await db.query("UPDATE public.applications SET status='勤務確定' WHERE id=$1", [application.id]);
      const request = "SELECT public.request_pay_confirmation($1,$2::timestamptz,$3::timestamptz,60,'synthetic pay confirmation',$4,$5) AS id";
      const params = [application.id, date + ' 09:00+09', date + ' 15:00+09', 500, guaranteed];
      await role('authenticated', otherDriverUid);
      await rejects('Pay confirmation rejects another driver: ' + guaranteed, request, params,
        e => e.code === 'P0001' && e.message.includes('権限'));
      await role('authenticated', driverUid);
      await rejects('Pay confirmation rejects altered transport fee: ' + guaranteed, request,
        [application.id, params[1], params[2], 0, guaranteed], e => e.code === 'P0001' && e.message.includes('交通費'));
      const review = await one(request, params);
      await rejects('Pay confirmation prevents duplicate pending request: ' + guaranteed, request, params,
        e => e.code === 'P0001' && e.message.includes('申請中'));
      await role('authenticated', otherCompanyUid);
      await rejects('Pay approval rejects another company: ' + guaranteed,
        'SELECT public.decide_attendance_review($1,true,\'synthetic\',$2)', [review.id, guaranteed],
        e => e.code === 'P0001' && e.message.includes('権限'));
      await role('authenticated', companyUid);
      await rejects('Pay approval rejects guarantee mismatch: ' + guaranteed,
        'SELECT public.decide_attendance_review($1,true,\'synthetic\',$2)', [review.id, !guaranteed],
        e => e.code === 'P0001' && e.message.includes('異なります'));
      if (guaranteed) {
        await db.query('UPDATE public.jobs SET pay_amount=1300 WHERE id=$1', [job.id]);
        await rejects('Pay approval rejects changed job terms',
          'SELECT public.decide_attendance_review($1,true,\'synthetic\',true)', [review.id],
          e => e.code === 'P0001' && e.message.includes('申請後'));
        await db.query('UPDATE public.jobs SET pay_amount=1200 WHERE id=$1', [job.id]);
      }
      await db.query('SELECT public.decide_attendance_review($1,true,\'synthetic approved\',$2)', [review.id, guaranteed]);
      await role('postgres');
      check('Approved pay amount respects guarantee: ' + guaranteed,
        await one('SELECT approved_basic_amount::int AS basic,approved_transportation_fee::int AS fee,approved_total_amount::int AS total,status FROM public.attendance_review_requests WHERE id=$1', [review.id]),
        {basic: guaranteed ? 9600 : 6000, fee: 500, total: guaranteed ? 10100 : 6500, status: 'approved'});
      check('Pay approval completes application: ' + guaranteed,
        (await one('SELECT status FROM public.applications WHERE id=$1', [application.id])).status, '勤務完了');
      await role('authenticated', companyUid);
      await rejects('Pay approval is not repeatable: ' + guaranteed,
        'SELECT public.decide_attendance_review($1,true,\'synthetic\',$2)', [review.id, guaranteed],
        e => e.code === 'P0001' && e.message.includes('確認済み'));
    }

    await role('postgres');
    const todayJob = await one("INSERT INTO public.jobs(company_id,work_date,location,start_time,end_time,pay_guarantee) VALUES($1,(now() AT TIME ZONE 'Asia/Tokyo')::date,'synthetic-qr-site','00:01','23:59',false) RETURNING id", [company.id]);
    await role('authenticated', driverUid);
    const todayApplication = await one('INSERT INTO public.applications(job_id,driver_id) VALUES($1,$2) RETURNING id', [todayJob.id, driver.id]);
    await role('authenticated', companyUid);
    await db.query("UPDATE public.applications SET status='勤務確定' WHERE id=$1", [todayApplication.id]);
    const token = (await one('SELECT public.attendance_company_qr(false) AS qr')).qr.token;
    await role('authenticated', otherDriverUid);
    await rejects('QR punch rejects another driver', "SELECT public.punch_company_qr($1,$2,'in')", [token, todayApplication.id], e => e.code === 'P0001');
    await role('authenticated', driverUid);
    await rejects('QR punch rejects out before in', "SELECT public.punch_company_qr($1,$2,'out')", [token, todayApplication.id], e => e.code === 'P0001' && e.message.includes('先に'));
    check('QR check-in first call records attendance', (await one("SELECT public.punch_company_qr($1,$2,'in') AS result", [token, todayApplication.id])).result.already_recorded, false);
    check('QR repeated check-in is idempotent', (await one("SELECT public.punch_company_qr($1,$2,'in') AS result", [token, todayApplication.id])).result.already_recorded, true);
    check('QR checkout first call records attendance', (await one("SELECT public.punch_company_qr($1,$2,'out') AS result", [token, todayApplication.id])).result.already_recorded, false);
    check('QR repeated checkout is idempotent', (await one("SELECT public.punch_company_qr($1,$2,'out') AS result", [token, todayApplication.id])).result.already_recorded, true);
    await role('authenticated', companyUid);
    const newToken = (await one('SELECT public.attendance_company_qr(true) AS qr')).qr.token;
    check('QR regeneration rotates token', newToken !== token, true);
    await role('authenticated', driverUid);
    await rejects('QR old token rejected after regeneration', "SELECT public.punch_company_qr($1,$2,'in')", [token, todayApplication.id], e => e.code === 'P0001' && e.message.includes('無効'));
  } finally {
    await role('postgres');
    await db.exec('ROLLBACK TO SAVEPOINT pay_qr_suite; RELEASE SAVEPOINT pay_qr_suite');
  }
}
