// Exercise a post-backup opt-out journal against two in-memory database instances.
export async function lifecycleReplayChecks({source, restored, userId, companyId, check}) {
  const optOut = {userId, jobMatch: false};
  const state = async database => (await database.query(
    'SELECT coalesce((SELECT job_match FROM public.line_notification_preferences WHERE user_id=$1),true) AS job_match',
    [userId])).rows[0].job_match;
  const replay = database => database.query(
    'INSERT INTO public.line_notification_preferences(user_id,job_match) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET job_match=excluded.job_match',
    [optOut.userId, optOut.jobMatch]);
  check('Lifecycle fixture starts enabled in both captured databases',
    [await state(source), await state(restored)], [true, true]);
  await replay(source);
  check('Post-backup opt-out exists in source database', await state(source), false);
  check('Restored snapshot needs post-backup opt-out journal', await state(restored), true);
  await replay(restored);
  check('Replaying opt-out disables restored notifications', await state(restored), false);
  await replay(restored);
  check('Repeated opt-out replay keeps exactly one preference row',
    (await restored.query('SELECT count(*)::int n FROM public.line_notification_preferences WHERE user_id=$1', [userId])).rows[0].n, 1);
  check('Replayed opt-out stays disabled after retry', await state(restored), false);
  check('Lifecycle replay preserves restored business record',
    (await restored.query('SELECT company_name FROM public.companies WHERE id=$1', [companyId])).rows,
    [{company_name: 'Synthetic Backup Company'}]);
}
