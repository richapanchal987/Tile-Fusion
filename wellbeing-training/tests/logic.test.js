// Run: node tests/logic.test.js   (no dependencies)
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'apps-script');
const src = ['Logic.gs', 'SeedData.gs'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const L = vm.runInNewContext(src + `;({ buildCalendar_, expectedCycle_, effectiveWeights_, computeStats_, buildBootstrap_, validateAssessment_,
  validateReadiness_, statsForTrainee_, normaliseDate_, visibleTo_, extOk_, safeFileName_, SEED })`, {});
let n = 0;
const J = x => JSON.parse(JSON.stringify(x));
const deq = (a, b) => assert.deepStrictEqual(J(a), J(b));
const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const S = L.SEED;

function newDb(over) {
  return Object.assign({
    settings: Object.assign({}, S.settings), phases: S.phases, topics: S.topics.map(x => ({ id: x.id, name: x.name, weight: x.weight, note: x.note })),
    tasks: S.tasks.map(x => Object.assign({}, x)), resources: S.resources,
    staff: [{ email: 'admin@fsksurat.in', name: 'Admin', role: 'Admin' }, { email: 'tl@fsksurat.in', name: 'TL', role: 'Assessor' }, { email: 'tl2@fsksurat.in', name: 'TL2', role: 'Assessor' }],
    trainees: [{ email: 'a@fsksurat.in', name: 'A', assessors: ['tl@fsksurat.in'], start: '2026-10-05', pathway: 'Standard', active: true, confirmed: 'notcleared', confirmedBy: '', confirmedAt: '', confirmNote: '' },
               { email: 'b@fsksurat.in', name: 'B', assessors: [], start: '2026-10-05', pathway: 'Urgent', active: true, confirmed: 'notcleared', confirmedBy: '', confirmedAt: '', confirmNote: '' }],
    progress: []
  }, over);
}
const done = (db, email, ids, status, score) => ids.forEach(id => db.progress.push({ trainee: email, task: id, status: status || 'complete', score: score === undefined ? 3 : score, files: [], evidence: '', reflection: '', feedback: '', assessor: '', date: '', submitted: '', updated: '' }));
const stats = (db, email, today) => L.statsForTrainee_(db, email, today || '2026-10-05');

t('seed: 76 tasks, unique ids, 38 gates, topic weights total 100', () => {
  assert.strictEqual(S.tasks.length, 76);
  assert.strictEqual(new Set(S.tasks.map(x => x.id)).size, 76);
  assert.strictEqual(S.tasks.filter(x => x.gate).length, 38);
  assert.strictEqual(S.topics.reduce((a, x) => a + x.weight, 0), 100);
  assert.ok(S.tasks.find(x => x.id === '5.10') && S.tasks.find(x => x.id === '10.10'));
});

t('calendar: 6 working days a cycle, Sundays skipped', () => {
  const cal = L.buildCalendar_('2026-10-05', 10, 6); // Monday
  deq(cal[0], { cycle: 1, start: '2026-10-05', end: '2026-10-10' });  // Mon-Sat
  deq(cal[1], { cycle: 2, start: '2026-10-12', end: '2026-10-17' });  // Sunday 11th skipped
  assert.strictEqual(cal.length, 10);
  cal.forEach(c => { assert.notStrictEqual(new Date(c.start + 'T00:00Z').getUTCDay(), 0); });
});
t('calendar: a Sunday start moves to Monday', () => {
  assert.strictEqual(L.buildCalendar_('2026-10-04', 10, 6)[0].start, '2026-10-05');
});
t('expected cycle: before, during, Sunday gap, after', () => {
  const cal = L.buildCalendar_('2026-10-05', 10, 6);
  deq(L.expectedCycle_(cal, '2026-10-01'), { cycle: 0, state: 'notstarted' });
  assert.strictEqual(L.expectedCycle_(cal, '2026-10-08').cycle, 1);
  assert.strictEqual(L.expectedCycle_(cal, '2026-10-11').cycle, 1);   // Sunday between cycles 1 and 2
  assert.strictEqual(L.expectedCycle_(cal, '2026-10-12').cycle, 2);
  assert.strictEqual(L.expectedCycle_(cal, '2027-06-01').state, 'past');
});

t('dates: any cell format is read safely, day-first for d/m/y, and never throws', () => {
  const n = L.normaliseDate_;
  assert.strictEqual(n('2026-10-05'), '2026-10-05');
  assert.strictEqual(n('2026-10-05T00:00:00.000Z'), '2026-10-05');
  assert.strictEqual(n('5/10/2026'), '2026-10-05');       // 5 October, not 10 May
  assert.strictEqual(n('05-10-2026'), '2026-10-05');
  assert.strictEqual(n('05.10.2026'), '2026-10-05');
  assert.strictEqual(n('46300'), '2026-10-05');          // Sheets serial number
  ['', null, undefined, 'tomorrow', 'Mon Oct 05 2026', '31/02/2026', '2026-13-40', '99999'].forEach(v => assert.strictEqual(n(v), '', String(v)));
  assert.deepStrictEqual(J(L.buildCalendar_('not a date', 10, 6)), []);
});
t('weights: effective weights add up to 100 and follow the topic weights', () => {
  const eff = L.effectiveWeights_(S.topics, S.tasks);
  const sum = Object.values(eff).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9, 'sum ' + sum);
  const topic5 = S.tasks.filter(x => x.topic === 5).reduce((a, x) => a + eff[x.id], 0);
  assert.ok(Math.abs(topic5 - 20) < 1e-9);
});

t('stats: a fresh trainee is Not cleared at 0%', () => {
  const s = stats(newDb(), 'a@fsksurat.in');
  assert.strictEqual(s.completion, 0); assert.strictEqual(s.competency, null);
  assert.strictEqual(s.effective, 'notcleared'); assert.strictEqual(s.gatesTotal, 38); assert.strictEqual(s.current, 1);
});
t('stats: completing everything with 4s gives 100% / 100% / independent-eligible', () => {
  const db = newDb(); done(db, 'a@fsksurat.in', S.tasks.map(x => x.id), 'complete', 4);
  const s = stats(db, 'a@fsksurat.in');
  assert.strictEqual(s.completion, 100); assert.strictEqual(s.competency, 100);
  assert.strictEqual(s.eligible, 'independent'); assert.ok(s.finished);
});
t('stats: partial counts half, submitted and rework count nothing', () => {
  const db = newDb();
  done(db, 'a@fsksurat.in', ['3.1'], 'partial', 2); done(db, 'a@fsksurat.in', ['3.2'], 'submitted', null); done(db, 'a@fsksurat.in', ['3.3'], 'rework', 1);
  const s = stats(db, 'a@fsksurat.in');
  const eff = L.effectiveWeights_(S.topics, S.tasks);
  assert.strictEqual(s.completion, Math.round(eff['3.1'] * 0.5)); assert.strictEqual(s.pending, 1);
});
t('gates: all 100%-complete tasks but one failed gate cannot be eligible', () => {
  const db = newDb(); const ids = S.tasks.map(x => x.id).filter(id => id !== '1.3');
  done(db, 'a@fsksurat.in', ids, 'complete', 4); done(db, 'a@fsksurat.in', ['1.3'], 'rework', 2);
  const s = stats(db, 'a@fsksurat.in');
  assert.ok(s.completion > 95); assert.strictEqual(s.eligible, 'notcleared');
  assert.strictEqual(s.gates.find(g => g.id === '1.3').state, 'attention');
});
t('gates: score below the pass mark does not pass even if Complete', () => {
  const db = newDb(); done(db, 'a@fsksurat.in', ['1.2'], 'complete', 2);
  assert.strictEqual(stats(db, 'a@fsksurat.in').gates.find(g => g.id === '1.2').state, 'attention');
});
t('readiness: supervised unlocks after the gates up to cycle 5; independent needs all', () => {
  const db = newDb(); const upTo5 = S.tasks.filter(x => x.gate && x.cycle <= 5).map(x => x.id);
  done(db, 'a@fsksurat.in', upTo5, 'complete', 3);
  assert.strictEqual(stats(db, 'a@fsksurat.in').eligible, 'supervised');
});
t('readiness: Urgent pathway needs only the Phase 1 safety gates for supervised practice', () => {
  const db = newDb(); done(db, 'b@fsksurat.in', S.tasks.filter(x => x.gate && x.cycle <= 2).map(x => x.id), 'complete', 3);
  assert.strictEqual(stats(db, 'b@fsksurat.in').eligible, 'supervised');
  assert.strictEqual(stats(db, 'a@fsksurat.in').eligible, 'notcleared');
});
t('readiness: confirmed level above eligibility is downgraded and flagged', () => {
  const db = newDb(); db.trainees[0].confirmed = 'independent';
  const s = stats(db, 'a@fsksurat.in');
  assert.ok(s.needsReview); assert.strictEqual(s.effective, 'notcleared');
});
t('readiness: Independent is Admin-only and needs eligibility', () => {
  const el = { eligible: 'independent' };
  L.validateReadiness_('independent', el, { role: 'Admin' });
  assert.throws(() => L.validateReadiness_('independent', el, { role: 'Assessor' }), /Principal or an admin/);
  assert.throws(() => L.validateReadiness_('supervised', { eligible: 'notcleared' }, { role: 'Admin' }), /gates/);
  L.validateReadiness_('notcleared', { eligible: 'notcleared' }, { role: 'Assessor' });
});

t('assessment: rules for outcomes, scores and gates', () => {
  const gate = S.tasks.find(x => x.id === '1.3'), plain = S.tasks.find(x => x.id === '1.4'), s = S.settings;
  assert.throws(() => L.validateAssessment_(plain, { outcome: 'x' }, s), /Choose Complete/);
  assert.throws(() => L.validateAssessment_(plain, { outcome: 'complete' }, s), /score from 1 to 4/);
  assert.throws(() => L.validateAssessment_(plain, { outcome: 'complete', score: 1 }, s), /cannot be marked Complete/);
  assert.throws(() => L.validateAssessment_(gate, { outcome: 'complete', score: 2 }, s), /critical gate/);
  assert.throws(() => L.validateAssessment_(plain, { outcome: 'rework', score: 2 }, s), /what needs to change/);
  assert.throws(() => L.validateAssessment_(gate, { outcome: 'exempt', feedback: 'prior' }, s), /cannot be exempted/);
  assert.throws(() => L.validateAssessment_(plain, { outcome: 'exempt' }, s), /why/);
  assert.strictEqual(L.validateAssessment_(gate, { outcome: 'complete', score: 3 }, s).status, 'complete');
  assert.strictEqual(L.validateAssessment_(plain, { outcome: 'exempt', feedback: '5 yrs experience' }, s).score, '');
});

t('visibility: trainees see only themselves; assessors only assigned (or unassigned); admins all', () => {
  const db = newDb(), me = (role, email) => ({ role, email });
  const ids = m => L.buildBootstrap_(db, m, '2026-10-05', {}).trainees.map(x => x.id);
  deq(ids(me('Trainee', 'a@fsksurat.in')), ['a@fsksurat.in']);
  deq(ids(me('Assessor', 'tl@fsksurat.in')), ['a@fsksurat.in', 'b@fsksurat.in']);
  deq(ids(me('Assessor', 'tl2@fsksurat.in')), ['b@fsksurat.in']);   // a is assigned to tl only
  assert.strictEqual(ids(me('Admin', 'admin@fsksurat.in')).length, 2);
});
t('bootstrap: trainees get no internal notes, no staff list, no archived tasks; unknown users get nothing', () => {
  const db = newDb(); db.tasks[0].active = false; db.topics[0].note = 'SM: internal';
  const tr = L.buildBootstrap_(db, { role: 'Trainee', email: 'a@fsksurat.in' }, '2026-10-05', {});
  assert.strictEqual(tr.topics[0].note, ''); assert.strictEqual(tr.staff, undefined);
  assert.ok(!tr.tasks.some(x => x.id === db.tasks[0].id));
  const ad = L.buildBootstrap_(db, { role: 'Admin', email: 'admin@fsksurat.in' }, '2026-10-05', {});
  assert.strictEqual(ad.topics[0].note, 'SM: internal'); assert.ok(ad.staff.length === 3);
  const none = L.buildBootstrap_(db, { role: 'None', email: 'x@y.in' }, '2026-10-05', {});
  assert.strictEqual(none.trainees, undefined); assert.strictEqual(none.tasks, undefined);
});
t('pace: a trainee still in cycle 1 when the calendar says cycle 3 is 2 behind', () => {
  const s = stats(newDb(), 'a@fsksurat.in', '2026-10-14');
  assert.strictEqual(s.expected, 2);
  assert.strictEqual(stats(newDb(), 'a@fsksurat.in', '2026-10-21').behind, 2);
});
t('files: only allowed extensions; names are cleaned', () => {
  assert.ok(L.extOk_('role-play.PDF')); assert.ok(!L.extOk_('run.exe')); assert.ok(!L.extOk_('noext'));
  assert.strictEqual(L.safeFileName_('../a/b:c.pdf'), '.._a_b_c.pdf');
});
console.log('\n' + n + ' tests passed');
