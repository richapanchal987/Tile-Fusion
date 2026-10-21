// Run: node tests/rules.test.js   (no dependencies)
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'apps-script');
const src = ['Schema.gs', 'Dates.gs', 'Rules.gs'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const L = vm.runInNewContext(src + `;({ SETTING_DEFS, AREAS, normTask_, computeTrainee_, buildCalendar_, cycleOf_, workingDaysBetween_, normaliseDate_,
  methodOf_, passSpec_, ratingMeets_, attemptPasses_, behaviourOverall_, idList_ })`, {});
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const S = {}; Object.keys(L.SETTING_DEFS).forEach(k => { S[k] = L.SETTING_DEFS[k][0]; });
const J = x => JSON.parse(JSON.stringify(x));

const mk = o => L.normTask_(Object.assign({ active: 'Yes', strand: 'Working with Students', milestone: 'Milestone 1', gate: 'No', ratingMethod: '1–4', passMark: '3',
  maxReworks: '2', assessorRole: 'Team Leader', requiresSupervised: 'No', fastTrack: 'No', contentStatus: 'In Drive – linked', title: o.id }, o), S);
const MS = { 1: { deadline: 3 }, 2: { deadline: 5 }, 3: { deadline: 10 }, 4: { deadline: 12 } };
const ctxOf = (tasks, extra) => Object.assign({ tasks: tasks, milestones: MS, settings: S, holidays: [], keySkills: [] }, extra);
const TR = { start: '2026-11-02', caseReadiness: 'Not Cleared' };           // a Monday
let seq = 0;
const att = (task, o) => Object.assign({ id: 'A' + (++seq), trainee: 'x', task: task, no: 1, status: 'Rated', released: true, score: '3', flag: false, rubric: {}, processConfirmed: '', obsType: 'Real' }, o);
const run = (tasks, attempts, o) => L.computeTrainee_(ctxOf(tasks, o && o.ctx), Object.assign({}, TR, o && o.tr), Object.assign({ attempts: attempts, taskDates: {}, entry: {}, behaviour: [] }, o && o.data), (o && o.today) || '2026-11-03');
const st = (r, id) => r.tasks[id].status;

t('calendar: Mon-Sat, six working days a cycle, Sundays and holidays skipped', () => {
  const cal = L.buildCalendar_('2026-11-02', 12, 6, []);
  assert.deepStrictEqual(J(cal[0]), { cycle: 1, start: '2026-11-02', end: '2026-11-07' });
  assert.strictEqual(cal[1].start, '2026-11-09'); assert.strictEqual(cal.length, 12);
  const h = L.buildCalendar_('2026-11-02', 12, 6, ['2026-11-04']);            // a Wednesday holiday pushes the cycle end by a day
  assert.strictEqual(h[0].end, '2026-11-09');
  assert.strictEqual(L.workingDaysBetween_('2026-11-02', '2026-11-09', []), 6);
  assert.strictEqual(L.cycleOf_(cal, '2026-11-08'), 1); assert.strictEqual(L.cycleOf_(cal, '2026-10-01'), 0); assert.strictEqual(L.cycleOf_(cal, '2027-12-01'), 13);
});
t('rating methods and pass marks are read from the workbook text', () => {
  assert.strictEqual(L.methodOf_('1–4'), 'score'); assert.strictEqual(L.methodOf_('Complete / Not complete'), 'complete');
  assert.strictEqual(L.methodOf_('% correct'), 'percent'); assert.strictEqual(L.methodOf_('Not pass/fail'), 'none');
  assert.deepStrictEqual(J(L.passSpec_('percent', '90% + questions 1, 2, 3, 6 correct', 3)), { score: 0, pct: 90, items: [1, 2, 3, 6] });
  assert.deepStrictEqual(J(L.passSpec_('percent', '80%', 3)), { score: 0, pct: 80, items: [] });
  assert.strictEqual(L.passSpec_('score', '3', 3).score, 3);
});
t('1-4 rating: 3 passes, 2 does not; a Safety Flag fails any score (R12, R13)', () => {
  const a = mk({ id: 'A-1' });
  assert.ok(L.ratingMeets_(a, att('A-1', { score: '3' }))); assert.ok(!L.ratingMeets_(a, att('A-1', { score: '2' })));
  assert.ok(!L.ratingMeets_(a, att('A-1', { score: '4', flag: true })));
});
t('Complete / Not complete and % tests with must-pass questions', () => {
  const c = mk({ id: 'C-1', ratingMethod: 'Complete / Not complete', passMark: 'Complete' }), p = mk({ id: 'P-1', ratingMethod: '% correct', passMark: '90% + questions 1, 2, 3, 6 correct' });
  assert.ok(L.ratingMeets_(c, att('C-1', { score: 'Complete' }))); assert.ok(!L.ratingMeets_(c, att('C-1', { score: 'Not complete' })));
  const ok = { q1: true, q2: true, q3: true, q6: true };
  assert.ok(L.ratingMeets_(p, att('P-1', { score: '95', rubric: ok })));
  assert.ok(!L.ratingMeets_(p, att('P-1', { score: '95', rubric: { q1: true, q2: true, q3: true, q6: false } })), '95% with question 6 wrong fails');
  assert.ok(!L.ratingMeets_(p, att('P-1', { score: '85', rubric: ok })));
});
t('ratings stay "Under review" until released (R15); release then passes', () => {
  const a = mk({ id: 'A-1' });
  let r = run([a], [att('A-1', { score: '4', released: false })]);
  assert.strictEqual(st(r, 'A-1'), 'submitted'); assert.ok(r.tasks['A-1'].underReview); assert.strictEqual(r.progress.passed, 0);
  r = run([a], [att('A-1', { score: '4', released: true })]);
  assert.strictEqual(st(r, 'A-1'), 'passed'); assert.strictEqual(r.progress.passed, 1); assert.strictEqual(r.tasks['A-1'].best, 4);
});
t('reworks: failing leaves rework needed; 1 + 2 reworks then Not passed (R14); Version B alternates', () => {
  const a = mk({ id: 'A-1' });
  let r = run([a], [att('A-1', { no: 1, score: '2' })]);
  assert.strictEqual(st(r, 'A-1'), 'rework'); assert.strictEqual(r.tasks['A-1'].nextVersion, 'B'); assert.ok(r.tasks['A-1'].canSubmit);
  r = run([a], [att('A-1', { no: 1, score: '2' }), att('A-1', { no: 2, score: '2' })]);
  assert.strictEqual(st(r, 'A-1'), 'rework'); assert.strictEqual(r.tasks['A-1'].nextVersion, 'A');
  r = run([a], [1, 2, 3].map(no => att('A-1', { no: no, score: '2' })));
  assert.strictEqual(st(r, 'A-1'), 'failed'); assert.ok(!r.tasks['A-1'].canSubmit);
  r = run([a], [att('A-1', { no: 1, score: '2' }), att('A-1', { no: 2, score: '3' })]);
  assert.strictEqual(st(r, 'A-1'), 'passed', 'the best attempt counts');
});
t('a trainee cannot start another attempt while one is under review', () => {
  const r = run([mk({ id: 'A-1' })], [att('A-1', { no: 1, status: 'Submitted', released: false, score: '' })]);
  assert.strictEqual(st(r, 'A-1'), 'submitted'); assert.ok(!r.tasks['A-1'].canSubmit);
});
t('a Safety Flag makes the attempt fail and stays "open" until the task is passed', () => {
  const a = mk({ id: 'A-1', gate: 'Yes' });
  let r = run([a], [att('A-1', { no: 1, score: '4', flag: true })]);
  assert.strictEqual(st(r, 'A-1'), 'rework'); assert.deepStrictEqual(J(r.clearance.openFlags), ['A-1']);
  r = run([a], [att('A-1', { no: 1, score: '4', flag: true }), att('A-1', { no: 2, score: '3' })]);
  assert.strictEqual(st(r, 'A-1'), 'passed'); assert.deepStrictEqual(J(r.clearance.openFlags), []);
});
t('joint assessment: passes only when the Coordinator has also confirmed (R16)', () => {
  const a = mk({ id: 'J-1', assessorRole: 'Team Leader + Campus Operations Coordinator' });
  let r = run([a], [att('J-1', { score: '4', processConfirmed: '' })]);
  assert.strictEqual(st(r, 'J-1'), 'submitted'); assert.ok(r.tasks['J-1'].needsConfirm);
  r = run([a], [att('J-1', { score: '4', processConfirmed: 'Yes' })]); assert.strictEqual(st(r, 'J-1'), 'passed');
  r = run([a], [att('J-1', { score: '4', processConfirmed: 'No' })]); assert.strictEqual(st(r, 'J-1'), 'rework');
});
t('locks: prerequisites (R4), Milestone 4 (R5), Supervised Practice (R6)', () => {
  const a = mk({ id: 'A-1' }), b = mk({ id: 'B-1', prereq: 'A-1' }), m4 = mk({ id: 'M4-1', milestone: 'Milestone 4' }), sp = mk({ id: 'S-1', requiresSupervised: 'Yes' });
  let r = run([a, b, m4, sp], []);
  assert.strictEqual(st(r, 'B-1'), 'locked'); assert.deepStrictEqual(J(r.tasks['B-1'].reasons), [{ kind: 'prereq', ids: ['A-1'] }]);
  assert.strictEqual(st(r, 'M4-1'), 'locked'); assert.strictEqual(r.tasks['M4-1'].reasons[0].kind, 'milestone');
  assert.strictEqual(st(r, 'S-1'), 'locked'); assert.strictEqual(r.tasks['S-1'].reasons[0].kind, 'supervised');
  r = run([a, b, sp], [att('A-1', { score: '3' })], { tr: { caseReadiness: 'Supervised Practice' } });
  assert.strictEqual(st(r, 'B-1'), 'notstarted'); assert.strictEqual(st(r, 'S-1'), 'notstarted');
  r = run([a, m4], [att('A-1', { score: '3' })]); assert.strictEqual(st(r, 'M4-1'), 'notstarted', 'Milestone 4 opens when 1-3 are all passed');
});
t('"Coming soon": a task whose content needs school input cannot be started (R-content)', () => {
  const r = run([mk({ id: 'X-1', contentStatus: 'Needs school input' })], []);
  assert.strictEqual(st(r, 'X-1'), 'soon'); assert.ok(!r.tasks['X-1'].canSubmit);
});
t('fast-track: "Show quickly" skips prerequisite locks on eligible tasks; critical gates are never fast-tracked (R10)', () => {
  const a = mk({ id: 'A-1' }), f = mk({ id: 'F-1', prereq: 'A-1', fastTrack: 'Yes', entryArea: 'Counselling skills' }), g = mk({ id: 'G-1', prereq: 'A-1', fastTrack: 'Yes', entryArea: 'Counselling skills', gate: 'Yes' });
  const entry = { 'Counselling skills': { pathway: 'Show quickly' } };
  let r = run([a, f, g], [], { data: { entry: entry } });
  assert.strictEqual(st(r, 'F-1'), 'notstarted'); assert.strictEqual(r.tasks['F-1'].pathway, 'Show quickly');
  assert.strictEqual(st(r, 'G-1'), 'locked'); assert.strictEqual(r.tasks['G-1'].pathway, null);
  r = run([a, f], [], { data: { entry: { 'Counselling skills': { pathway: 'Focus' } } } });
  assert.strictEqual(st(r, 'F-1'), 'locked');
});
t('entry check (SYS-02): counts as Done when all five areas have a pathway', () => {
  const e = mk({ id: 'SYS-02', ratingMethod: 'Not pass/fail', passMark: 'Not pass/fail', maxReworks: '0' });
  const ent = {}; L.AREAS.forEach(a => { ent[a] = { pathway: 'Focus' }; });
  assert.strictEqual(st(run([e], [], { data: { entry: {} } }), 'SYS-02'), 'notstarted');
  assert.strictEqual(st(run([e], [], { data: { entry: ent } }), 'SYS-02'), 'passed');
});
t('due dates (R8): milestone deadline cycle, per-task override, per-trainee override; overdue and due soon', () => {
  const a = mk({ id: 'A-1' }), b = mk({ id: 'B-1', dueOverride: '1' });
  const cal = L.buildCalendar_('2026-11-02', 12, 6, []);
  let r = run([a, b], []);
  assert.strictEqual(r.tasks['A-1'].due, cal[2].end); assert.strictEqual(r.tasks['B-1'].due, cal[0].end);
  assert.ok(!r.tasks['B-1'].dueSoon, 'four working days left');
  assert.ok(run([a, b], [], { today: '2026-11-05' }).tasks['B-1'].dueSoon, 'two working days left');
  r = run([a, b], [], { today: '2026-11-20' }); assert.ok(r.tasks['B-1'].overdue); assert.ok(!r.tasks['B-1'].dueSoon);
  r = run([a], [], { data: { taskDates: { 'A-1': { dueOverride: '2026-12-31' } } } }); assert.strictEqual(r.tasks['A-1'].due, '2026-12-31');
});
t('progress (R24) counts tasks passed over active tasks, retired tasks are ignored', () => {
  const a = mk({ id: 'A-1' }), b = mk({ id: 'B-1' }), old = mk({ id: 'O-1', active: 'No' });
  const r = run([a, b, old], [att('A-1', { score: '4' })]);
  assert.strictEqual(r.progress.total, 2); assert.strictEqual(r.progress.pct, 50); assert.ok(!r.tasks['O-1']);
});
t('Supervised Practice eligibility (R7): prerequisites of STU-21 passed and cycle 4 reached', () => {
  const p = mk({ id: 'P-1' }), s21 = mk({ id: 'STU-21', prereq: 'P-1', requiresSupervised: 'Yes' });
  const cal = L.buildCalendar_('2026-11-02', 12, 6, []);
  let r = run([p, s21], [att('P-1', { score: '3' })], { today: '2026-11-03' });
  assert.ok(r.supervised.prereqDone); assert.ok(!r.supervised.reached); assert.ok(!r.supervised.eligible, 'too early: cycle 4 has not begun');
  r = run([p, s21], [att('P-1', { score: '3' })], { today: cal[3].start }); assert.ok(r.supervised.eligible);
  r = run([p, s21], [], { today: cal[3].start }); assert.ok(!r.supervised.eligible);
  r = run([p, s21], [att('P-1', { score: '3' })], { today: cal[3].start, tr: { caseReadiness: 'Supervised Practice' } }); assert.ok(!r.supervised.eligible, 'already cleared');
});
t('strand check (R18): average of 1-4 scores only, 2.5 or above, every task passed', () => {
  const a = mk({ id: 'A-1' }), b = mk({ id: 'B-1' }), c = mk({ id: 'C-1', ratingMethod: 'Complete / Not complete', passMark: 'Complete' });
  let r = run([a, b, c], [att('A-1', { score: '3' }), att('B-1', { score: '4' }), att('C-1', { score: 'Complete' })]);
  const s = r.progress.byStrand[0]; assert.strictEqual(s.avg, 3.5); assert.ok(s.ok, 'Complete tasks are not in the average but must be passed');
  r = run([a, b, c], [att('A-1', { score: '3' }), att('B-1', { score: '3' })]); assert.ok(!r.progress.byStrand[0].ok, 'C-1 not passed');
  const x = mk({ id: 'X-1', passMark: '1' });            // a lenient mark lets a 2 pass but the average rule still bites
  r = run([x, mk({ id: 'Y-1', passMark: '1' })], [att('X-1', { score: '2' }), att('Y-1', { score: '2' })]);
  assert.strictEqual(r.progress.byStrand[0].avg, 2); assert.ok(!r.progress.byStrand[0].ok);
});
t('Key Skills (R19): two passed occasions, at least one Real for Skills 1-5; Simulation counts for 6-7', () => {
  const a = mk({ id: 'A-1' }), b = mk({ id: 'B-1' });
  const ks = [{ n: 1, name: 'Lead a session', linked: ['A-1', 'B-1'] }, { n: 6, name: 'Triage', linked: ['A-1', 'B-1'] }];
  let r = run([a, b], [att('A-1', { score: '3', obsType: 'Role play' }), att('B-1', { score: '4', obsType: 'Role play' })], { ctx: { keySkills: ks } });
  assert.deepStrictEqual(J(r.clearance.keySkills.map(k => k.ok)), [false, true]);
  r = run([a, b], [att('A-1', { score: '3', obsType: 'Real' }), att('B-1', { score: '4', obsType: 'Role play' })], { ctx: { keySkills: ks } });
  assert.deepStrictEqual(J(r.clearance.keySkills.map(k => k.ok)), [true, true]);
  r = run([a, b], [att('A-1', { score: '2', obsType: 'Real' }), att('B-1', { score: '4', obsType: 'Real' })], { ctx: { keySkills: ks } });
  assert.strictEqual(r.clearance.keySkills[0].occasions, 1, 'a 2 is not an occasion');
});
t('professional behaviour (R20): Overall is the lowest of six; 3+ in the two most recent released cycles', () => {
  assert.strictEqual(L.behaviourOverall_([3, 4, 3, 4, 4, 3]), 3); assert.strictEqual(L.behaviourOverall_([3, 4, null, 4, 4, 3]), null);
  const a = mk({ id: 'A-1' });
  const beh = (cycle, items, released) => ({ cycle: cycle, items: items, released: released !== false });
  assert.ok(!run([a], [], { data: { behaviour: [beh(1, [3, 3, 3, 3, 3, 3])] } }).clearance.behaviourOk, 'one cycle is not enough');
  assert.ok(run([a], [], { data: { behaviour: [beh(1, [2, 3, 3, 3, 3, 3]), beh(2, [3, 3, 3, 4, 3, 3]), beh(3, [3, 3, 4, 3, 3, 3])] } }).clearance.behaviourOk, 'an old low cycle does not matter');
  assert.ok(!run([a], [], { data: { behaviour: [beh(2, [3, 3, 3, 3, 3, 3]), beh(3, [3, 3, 2, 3, 3, 3])] } }).clearance.behaviourOk);
  assert.ok(!run([a], [], { data: { behaviour: [beh(2, [3, 3, 3, 3, 3, 3]), beh(3, [3, 3, 3, 3, 3, 3], false)] } }).clearance.behaviourOk, 'unreleased cycles do not count');
});
t('eligible for clearance (R21) needs every check at once', () => {
  const a = mk({ id: 'A-1' }), ks = [{ n: 6, name: 'K', linked: ['A-1'] }];
  const good = { behaviour: [{ cycle: 1, items: [3, 3, 3, 3, 3, 3], released: true }, { cycle: 2, items: [3, 4, 3, 3, 3, 3], released: true }] };
  const two = [att('A-1', { no: 1, score: '3' })];
  const keyskill2 = run([a], two, { ctx: { keySkills: ks }, data: good });
  assert.ok(!keyskill2.clearance.eligible, 'only one occasion on Key Skill 6');
  const b = mk({ id: 'B-1' }), ks2 = [{ n: 6, name: 'K', linked: ['A-1', 'B-1'] }];
  const r = run([a, b], [att('A-1', { score: '3' }), att('B-1', { score: '4' })], { ctx: { keySkills: ks2 }, data: good });
  assert.ok(r.clearance.eligible, JSON.stringify(r.clearance));
  const bad = run([a, b], [att('A-1', { score: '3' }), att('B-1', { score: '4' })], { ctx: { keySkills: ks2 }, data: { behaviour: [] } });
  assert.ok(!bad.clearance.eligible && !bad.clearance.behaviourOk);
});
t('"Ready now" (R23): unlocked tasks not started or needing rework, by due date then milestone', () => {
  const a = mk({ id: 'A-1', milestone: 'Milestone 2' }), b = mk({ id: 'B-1' }), c = mk({ id: 'C-1', prereq: 'B-1' });
  const r = run([a, b, c], []);
  assert.deepStrictEqual(J(r.ready), ['B-1', 'A-1']);
});
console.log('\n' + n + ' rules tests passed');
