const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const assets = vm.createContext({});
vm.runInContext('globalThis.window = globalThis', assets);
for (const script of ['attendance-summary', 'attendance-export', 'job-browse', 'job-preferences', 'applicant-summary']) {
  const filename = path.join(__dirname, '..', 'assets', script + '.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), assets, {filename});
}

const summary = assets.SpodoraAttendance;
const csv = assets.SpodoraAttendanceExport;
const checkedIn = '2026-11-01T00:00:00Z';
const checkedOut = '2026-11-01T01:15:00Z';
const job = {
  work_date: '2026-11-01', start_time: '09:00', end_time: '11:00',
  break_minutes: 15, pay_amount: 1200, pay_type: '時給', transportation_fee: 480
};
const attendance = {id: 1, jobs: job, checked_in_at: checkedIn, checked_out_at: checkedOut};
const approval = {
  requested_in: checkedIn, requested_out: checkedOut, break_minutes: 15,
  approved_work_seconds: 3600, approved_basic_amount: 1200,
  approved_transportation_fee: 480, approved_total_amount: 1680,
  driver_confirmed_at: checkedOut, effective_pay_guarantee: false
};

test('confirmed payroll reconciles driver display, company month and exported CSV', () => {
  for (const [guaranteed, basic, total] of [[false, 1200, 1680], [true, 2100, 2580]]) {
    const pending = {...attendance, actual_break_minutes: 15, pay_guarantee_snapshot: guaranteed};
    assert.equal(summary.calculate(pending, job).amount, basic);
    assert.equal(summary.payment(pending, job).confirmed, false);
    const row = {...pending, approved_request: {
      ...approval, approved_basic_amount: basic, approved_total_amount: total, effective_pay_guarantee: guaranteed
    }};
    const nextMonth = {...row, jobs: {...job, work_date: '2026-12-01'}};
    const month = csv.visible([row, nextMonth], 'month', '2026-11');
    assert.equal(month.length, 1);
    assert.match(summary.html(row, job), new RegExp('確認合計 ' + total.toLocaleString('ja-JP') + '円'));
    assert.deepEqual({...csv.totals(month)}, {confirmed: 1, unconfirmed: 0, basic, fee: 480, total, worked: 3600});
    assert.match(csv.build(month), new RegExp(`"${basic}","480","${total}"`));
  }
});

test('unworked, returned, resubmitted and legacy rows do not inflate confirmed totals', () => {
  const rows = [
    {jobs: job},
    {...attendance, attendance_review_requests: [{status: 'rejected'}]},
    {...attendance, approved_request: approval, attendance_review_requests: [{status: 'pending'}]},
    {...attendance, approved_request: {...approval, approved_total_amount: null, approved_transportation_fee: null}}
  ];
  assert.deepEqual(rows.map(row => summary.payment(row, job).label),
    ['未確認', '差し戻し', '再申請確認待ち', '基本報酬のみ承認']);
  assert.deepEqual({...csv.totals(rows)}, {confirmed: 0, unconfirmed: 4, basic: 0, fee: 0, total: 0, worked: 0});
  for (const row of rows) {
    assert.equal(csv.data(row)[16], '');
    assert.equal(csv.data(row)[17], '');
  }
});

test('availability excludes closed, full and already started jobs at the JST boundary', () => {
  const now = new Date('2026-10-31T15:00:00Z');
  const upcoming = {id: 1, work_date: '2026-11-01', start_time: '08:00', required_headcount: 1};
  const jobs = [
    upcoming, {...upcoming, id: 2, status: '募集終了'},
    {...upcoming, id: 3, applications: [{status: '勤務確定'}]},
    {...upcoming, id: 4, start_time: '00:00'},
    {...upcoming, id: 5, work_date: '2026-11-02'}
  ];
  assert.deepEqual(Array.from(assets.SpodoraJobBrowse.available(jobs, 'today', now), job => job.id), [1]);
  assert.deepEqual(Array.from(assets.SpodoraJobBrowse.available(jobs, 'tomorrow', now), job => job.id), [5]);
  assert.equal(jobs.length, 5);
});

test('job matching accepts slots 1–3 and prefecture-wide areas and respects preferences', () => {
  const matches = assets.SpodoraJobPreferences.matches;
  const listing = {work_prefecture: '東京都', work_municipality: '新宿区',
    vehicle_type: '2tトラック', work_date: '2026-11-01', start_time: '08:00'};
  for (const suffix of ['', '_2', '_3']) {
    assert.equal(matches({['preferred_prefecture' + suffix]: '東京都',
      ['preferred_municipality' + suffix]: '新宿区'}, listing), true);
  }
  const driver = {preferred_prefecture: '東京都', preferred_municipality: '東京都全域',
    preferred_vehicle_types: ['2t'], preferred_weekdays: [0], preferred_time_slots: ['morning']};
  assert.equal(matches(driver, listing), true);
  assert.equal(matches(driver, {...listing, work_prefecture: '千葉県'}), false);
  assert.equal(matches(driver, {...listing, vehicle_type: '4tトラック'}), false);
  assert.equal(matches(driver, {...listing, work_date: '2026-11-02'}), false);
  assert.equal(matches(driver, {...listing, start_time: '15:00'}), false);
});

test('company applicant screen distinguishes why a job cannot hire and counts only the selected job', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'company-applicants.html'), 'utf8');
  const start = html.indexOf('function hireUnavailableReason(');
  const end = html.indexOf('function render()', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(html.slice(start, end), assets);
  const now = new Date('2026-11-01T01:00:00Z');
  const upcoming = {id: 1, work_date: '2026-11-02', start_time: '08:00', required_headcount: 1};
  const pending = {jobs: upcoming, status: '応募中'};
  assets.rows = [pending, {jobs: {id: 2}, status: '勤務確定'}];
  const applicants = assets.SpodoraApplicants;
  assert.deepEqual({...applicants.stats(upcoming, assets.rows)},
    {need: 1, hired: 0, remaining: 1, pending: 1, applications: 1});
  assert.equal(applicants.accepting(upcoming, assets.rows, now), true);
  const reason = jobs => assets.hireUnavailableReason({jobs}, now);
  assert.match(reason({...upcoming, status: 'キャンセル'}), /取り消された/);
  assert.match(reason({...upcoming, status: '募集終了'}), /募集が終了/);
  assert.match(reason({...upcoming, work_date: '2026-10-31'}), /勤務日を過ぎた/);
  assert.match(reason({...upcoming, work_date: '2026-11-01'}), /勤務開始時刻を過ぎた/);
  assert.match(reason({...upcoming, start_time: ''}), /勤務日時を確認できない/);
  assets.rows.push({jobs: upcoming, status: '勤務確定'});
  assert.equal(applicants.accepting(upcoming, assets.rows, now), false);
  assert.match(reason(upcoming), /募集人数に達した/);
});
