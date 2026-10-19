// Run: node tests/logic.test.js   (no dependencies)
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'apps-script');
const files = ['Config.gs', 'Logic.gs', 'SeedData.gs', 'DocSync.gs'];
const load = list => vm.runInNewContext(list.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') + `;({ buildCalendar_, expectedCycle_, effectiveWeights_,
  computeStats_, buildBootstrap_, validateAssessment_, validateCertification_, validateChecklist_, validateDue_, statsForTrainee_, normaliseDate_, addMonths_,
  workingDaysElapsed_, visibleTo_, extOk_, safeFileName_, phaseRanges_, moduleShare_, aiOf_, failedAllowed_, SEED, PROGRAMME })`, {});
const L = load(files);
let n = 0;
const J = x => JSON.parse(JSON.stringify(x));
const deq = (a, b) => assert.deepStrictEqual(J(a), J(b));
const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const S = L.SEED, PR = L.PROGRAMME;
const STAFF = [{ email: 'admin@fsksurat.in', name: 'Admin', role: 'Admin', certifies: false }, { email: 'tl@fsksurat.in', name: 'TL', role: 'Assessor', certifies: false },
  { email: 'cm@fsksurat.in', name: 'Certifier', role: 'Assessor', certifies: true }];

function newDb(over) {
  return Object.assign({
    settings: Object.assign({}, S.settings), phases: S.phases, topics: S.topics.map(x => Object.assign({}, x)),
    tasks: S.tasks.map(x => Object.assign({}, x)), resources: [], rubrics: [], staff: STAFF,
    trainees: [{ email: 'a@fsksurat.in', name: 'A', assessors: ['tl@fsksurat.in'], tl: '', certifier: 'cm@fsksurat.in', start: '2026-06-01', active: true, confirmed: 'notcertified', confirmedBy: '', confirmedAt: '', confirmNote: '' },
               { email: 'b@fsksurat.in', name: 'B', assessors: [], tl: '', certifier: '', start: '2026-06-01', active: true, confirmed: 'notcertified', confirmedBy: '', confirmedAt: '', confirmNote: '' }],
    progress: [], checklists: []
  }, over);
}
const prog = (email, id, status, score, more) => Object.assign({ trainee: email, task: id, status: status || 'complete', score: score === undefined ? 3 : score, files: [], evidence: '', reflection: '', feedback: '',
  assessor: '', date: '', submitted: '', updated: '', criteria: {}, critical: '', failed: 0, extra: 0, due: '', ai: '' }, more || {});
const done = (db, email, ids, status, score) => ids.forEach(id => db.progress.push(prog(email, id, status, score)));
const stats = (db, email, today) => L.statsForTrainee_(db, email, today || '2026-06-01');
const allIds = db => db.tasks.map(x => x.id);
const addLists = (db, email) => db.tasks.filter(x => x.real).forEach(x => { for (let i = 1; i <= Math.max(1, x.students); i++) db.checklists.push({ trainee: email, task: x.id, code: 'G10-S' + i, at: '2026-07-01' }); });

t('seed: 32 tasks with text ids, 15 gates, every module total matches its weight, weights total 100', () => {
  assert.strictEqual(S.tasks.length, 32);
  assert.strictEqual(new Set(S.tasks.map(x => x.id)).size, 32);
  assert.ok(S.tasks.every(x => typeof x.id === 'string' && /^\d+\.\d+$/.test(x.id)));
  assert.strictEqual(S.tasks.filter(x => x.gate).length, 15);
  assert.strictEqual(Math.round(S.topics.reduce((a, x) => a + x.weight, 0) * 100) / 100, 100);
  S.topics.forEach(tp => assert.ok(Math.abs(S.tasks.filter(x => x.topic === tp.id).reduce((a, x) => a + x.weight, 0) - tp.weight) < 1e-9, 'module ' + tp.id));
  deq(S.topics.map(x => x.weight), [15, 10, 4, 6, 12, 24, 17, 12]);
  deq(S.topics.map(x => x.threshold), [70, 60, 60, 60, 60, 70, 70, 60]);
  assert.ok(S.tasks.every(x => x.cycle >= 1 && x.cycle <= S.settings.cycles));
  assert.ok(S.tasks.every(x => S.topics.some(tp => tp.id === x.topic && tp.phase)));
});
t('seed: the real-student tasks need a consent checklist and the Viva forbids AI', () => {
  deq(S.tasks.filter(x => x.real).map(x => [x.id, x.students]), [['6.3', 2], ['6.4', 1], ['6.5', 1], ['7.2', 1], ['7.3', 1], ['7.5', 2]]);
  assert.strictEqual(S.tasks.find(x => x.id === '8.1').ai, 'no');
  assert.ok(S.tasks.filter(x => x.id !== '8.1').every(x => x.ai === 'ask'));
});

t('calendar: 13 cycles of 6 working days, Sundays skipped, inside the three-month window', () => {
  const cal = L.buildCalendar_('2026-06-01', 13, 6); // Monday
  deq(cal[0], { cycle: 1, start: '2026-06-01', end: '2026-06-06' });
  deq(cal[1], { cycle: 2, start: '2026-06-08', end: '2026-06-13' });
  assert.strictEqual(cal.length, 13);
  cal.forEach(c => assert.notStrictEqual(new Date(c.start + 'T00:00Z').getUTCDay(), 0));
  assert.ok(cal[12].end <= L.addMonths_('2026-06-01', 3) && cal[12].end > '2026-08-20', cal[12].end);
});
t('end date: the same day three months later, and month ends are handled', () => {
  assert.strictEqual(L.addMonths_('2026-06-01', 3), '2026-09-01');
  assert.strictEqual(L.addMonths_('2026-11-30', 3), '2027-02-28');
  assert.strictEqual(L.addMonths_('2027-11-30', 3), '2028-02-29');
  assert.strictEqual(L.addMonths_('2026-10-31', 4), '2027-02-28');
  assert.strictEqual(L.addMonths_('nonsense', 3), '');
});
t('calendar: a Sunday start moves to Monday; expected cycle before, during, Sunday gap, after', () => {
  assert.strictEqual(L.buildCalendar_('2026-06-07', 13, 6)[0].start, '2026-06-08');
  const cal = L.buildCalendar_('2026-06-01', 13, 6);
  deq(L.expectedCycle_(cal, '2026-05-30'), { cycle: 0, state: 'notstarted' });
  assert.strictEqual(L.expectedCycle_(cal, '2026-06-07').cycle, 1);
  assert.strictEqual(L.expectedCycle_(cal, '2026-06-08').cycle, 2);
  assert.strictEqual(L.expectedCycle_(cal, '2027-01-01').state, 'past');
});
t('dates: any cell format is read safely, day-first for d/m/y, and never throws', () => {
  const d = L.normaliseDate_;
  assert.strictEqual(d('2026-06-05'), '2026-06-05'); assert.strictEqual(d('2026-06-05T00:00:00.000Z'), '2026-06-05');
  assert.strictEqual(d('5/6/2026'), '2026-06-05'); assert.strictEqual(d('05.06.2026'), '2026-06-05'); assert.strictEqual(d('46300'), '2026-10-05');
  assert.strictEqual(d('31/02/2026'), ''); assert.strictEqual(d('soon'), ''); assert.strictEqual(d(null), '');
  assert.strictEqual(L.workingDaysElapsed_('2026-06-01', '2026-06-07'), 6);
});

t('phases belong to modules; a cycle takes the phase of its first task', () => {
  const r = L.phaseRanges_(S.topics, S.tasks, S.phases, 13);
  deq(r.map(x => [x.name.slice(0, 7), x.from, x.to]), [['Phase 1', 1, 4], ['Phase 2', 5, 7], ['Phase 3', 8, 11], ['Phase 4', 12, 13]]);
  assert.ok(S.tasks.filter(x => x.cycle === 4).some(x => x.topic === 2) && S.tasks.filter(x => x.cycle === 4).some(x => x.topic === 3), 'cycle 4 mixes modules 2 and 3');
});

t('weights: a module weight is shared among its tasks and the programme totals 100', () => {
  const eff = L.effectiveWeights_(S.topics, S.tasks);
  assert.ok(Math.abs(Object.values(eff).reduce((a, b) => a + b, 0) - 100) < 1e-9);
  assert.ok(Math.abs(eff['5.1'] - 6) < 1e-9 && Math.abs(eff['4.1'] - 1) < 1e-9 && Math.abs(eff['6.3'] - 4.8) < 1e-9);
});

const rows3 = [1, 2, 3].map(i => ({ order: i, criterion: 'C' + i, use: 'score' }));
const gate = { id: '1.1', gate: true }, plain = { id: '2.1', gate: false };
t('rubric score: the average of criterion scores, rounded half up', () => {
  const v = (task, scores, extra) => L.validateAssessment_(task, rows3, Object.assign({ criteria: { 1: scores[0], 2: scores[1], 3: scores[2] }, feedback: 'Because.' }, extra), S.settings);
  assert.strictEqual(v(plain, [4, 4, 4]).score, 4);
  assert.strictEqual(v(plain, [3, 3, 4]).score, 3);       // 3.33
  assert.strictEqual(v(plain, [2, 3, 3]).score, 3);       // 2.67
  assert.strictEqual(v(plain, [2, 2, 3]).score, 2);       // 2.33
  assert.strictEqual(L.validateAssessment_(plain, rows3.slice(0, 2), { criteria: { 1: 2, 2: 3 }, feedback: 'x' }, S.settings).score, 3); // 2.5 rounds up
  assert.strictEqual(v(plain, [3, 4, 4]).criteria[2], 4);
});
t('rubric score: every criterion must be scored 1 to 4', () => {
  assert.throws(() => L.validateAssessment_(plain, rows3, { criteria: { 1: 3, 2: 3 }, feedback: 'x' }, S.settings), /Score every criterion/);
  assert.throws(() => L.validateAssessment_(plain, rows3, { criteria: { 1: 3, 2: 3, 3: 5 }, feedback: 'x' }, S.settings), /Score every criterion/);
});
t('outcome follows the score: 3 and 4 complete, 2 developing (reattempt), 1 not yet met', () => {
  const o = sc => L.validateAssessment_(plain, [], { score: sc, feedback: 'Do X.' }, S.settings).status;
  deq([o(4), o(3), o(2), o(1)], ['complete', 'complete', 'partial', 'rework']);
  assert.throws(() => L.validateAssessment_(plain, [], { score: 2, feedback: '' }, S.settings), /what needs to change/);
  assert.throws(() => L.validateAssessment_(plain, [], { score: 0, feedback: 'x' }, S.settings), /1 to 4/);
});
t('a gate needs the pass score; raising the pass score to 4 makes a 3 developing', () => {
  assert.strictEqual(L.validateAssessment_(gate, [], { score: 3, feedback: '' }, S.settings).status, 'complete');
  const strict = Object.assign({}, S.settings, { passScore: 4 });
  assert.strictEqual(L.validateAssessment_(gate, [], { score: 3, feedback: 'Close.' }, strict).status, 'partial');
});
t('exempt: allowed only on non-gates and only with a reason', () => {
  assert.throws(() => L.validateAssessment_(gate, [], { exempt: true, feedback: 'prior' }, S.settings), /cannot be exempted/);
  assert.throws(() => L.validateAssessment_(plain, [], { exempt: true, feedback: '' }, S.settings), /why/);
  deq(L.validateAssessment_(plain, [], { exempt: true, feedback: 'prior' }, S.settings).status, 'exempt');
});
t('critical error: forces "not yet met" with score 1 whatever the criteria say, and needs a description', () => {
  const type = PR.criticalErrors[3][0];
  const v = L.validateAssessment_(plain, rows3, { criteria: { 1: 4, 2: 4, 3: 4 }, feedback: 'Told a parent a label. Remediation talk booked.', critical: { type } }, S.settings);
  assert.strictEqual(v.status, 'rework'); assert.strictEqual(v.score, 1); assert.strictEqual(v.critical, type);
  assert.throws(() => L.validateAssessment_(plain, rows3, { criteria: { 1: 4, 2: 4, 3: 4 }, feedback: '', critical: { type } }, S.settings), /Describe/);
  assert.throws(() => L.validateAssessment_(plain, rows3, { criteria: { 1: 4, 2: 4, 3: 4 }, feedback: 'x', critical: { type: 'Being late' } }, S.settings), /listed critical errors/);
});

t('module percentage: score out of 4 per task weighted within the module; undecided work counts as zero', () => {
  const db = newDb(); done(db, 'a@fsksurat.in', ['2.1', '2.2', '2.3', '2.4', '2.5'], 'complete', 4);
  let m = stats(db, 'a@fsksurat.in').modules; assert.strictEqual(m[1].pct, 100);
  db.progress = []; done(db, 'a@fsksurat.in', ['2.1', '2.2', '2.3'], 'complete', 3);
  m = stats(db, 'a@fsksurat.in').modules; assert.strictEqual(m[1].pct, 45);   // 3 of 5 equal tasks at 75%
  assert.strictEqual(m[1].met, false);
  db.progress = []; done(db, 'a@fsksurat.in', ['2.1', '2.2', '2.3', '2.4'], 'complete', 3); done(db, 'a@fsksurat.in', ['2.5'], 'partial', 2);
  m = stats(db, 'a@fsksurat.in').modules; assert.strictEqual(m[1].pct, 70); assert.strictEqual(m[1].met, true);   // (4*.75 + .5) / 5
});
t('module pass marks: 60% by default and 70% in modules 1, 6 and 7', () => {
  const db = newDb(); const m6 = ['6.1', '6.2', '6.3', '6.4', '6.5'];
  done(db, 'a@fsksurat.in', m6, 'complete', 3);                            // 75% of the module
  assert.strictEqual(stats(db, 'a@fsksurat.in').modules[5].met, true);
  db.progress = []; done(db, 'a@fsksurat.in', m6.slice(0, 4), 'complete', 3); done(db, 'a@fsksurat.in', ['6.5'], 'partial', 2);
  const m = stats(db, 'a@fsksurat.in').modules[5];
  assert.strictEqual(m.pct, 70); assert.strictEqual(m.need, 70); assert.strictEqual(m.met, true);
  db.progress = []; done(db, 'a@fsksurat.in', m6.slice(0, 3), 'complete', 3); done(db, 'a@fsksurat.in', m6.slice(3), 'partial', 2);
  assert.strictEqual(stats(db, 'a@fsksurat.in').modules[5].met, false);    // 66%: enough for the usual 60 but not the 70 these modules need
});

t('certification: every gate, every module pass mark and the consent checklists are needed; a person confirms', () => {
  const db = newDb(); done(db, 'a@fsksurat.in', allIds(db), 'complete', 3);
  let s = stats(db, 'a@fsksurat.in'); assert.strictEqual(s.eligible, 'notcertified');
  assert.ok(s.blockers.some(b => /consent checklist for 6\.3/.test(b)));
  addLists(db, 'a@fsksurat.in'); s = stats(db, 'a@fsksurat.in');
  assert.strictEqual(s.eligible, 'certified'); deq(s.blockers, []); assert.strictEqual(s.effective, 'notcertified', 'eligible is not the same as certified');
  assert.strictEqual(s.gatesPassed, 15);
});
t('certification: a missing gate, a low module, an open critical error or a missing checklist each block it', () => {
  const base = () => { const db = newDb(); done(db, 'a@fsksurat.in', allIds(db), 'complete', 3); addLists(db, 'a@fsksurat.in'); return db; };
  let db = base(); db.progress.find(p => p.task === '7.4').status = 'partial'; db.progress.find(p => p.task === '7.4').score = 2;
  assert.ok(stats(db, 'a@fsksurat.in').blockers.some(b => /gate 7\.4/.test(b)));
  db = base(); db.progress.filter(p => p.task.startsWith('3.')).forEach(p => { p.status = 'rework'; p.score = 1; });
  assert.ok(stats(db, 'a@fsksurat.in').blockers.some(b => /Module 3 is at 0%/.test(b)));
  db = base(); Object.assign(db.progress.find(p => p.task === '2.1'), { status: 'rework', score: 1, critical: 'Diagnosing or labelling' });
  assert.ok(stats(db, 'a@fsksurat.in').blockers.some(b => /critical error on 2\.1/.test(b)));
  db = base(); db.checklists = db.checklists.filter(c => c.task !== '6.3' || c.code !== 'G10-S2');
  assert.ok(stats(db, 'a@fsksurat.in').blockers.some(b => /checklist for 6\.3/.test(b)));
});
t('certification: confirmed status drops back for review if a gate stops passing', () => {
  const db = newDb(); done(db, 'a@fsksurat.in', allIds(db), 'complete', 3); addLists(db, 'a@fsksurat.in');
  db.trainees[0].confirmed = 'certified';
  let s = stats(db, 'a@fsksurat.in'); assert.strictEqual(s.effective, 'certified'); assert.strictEqual(s.needsReview, false);
  db.progress.find(p => p.task === '1.1').status = 'rework'; s = stats(db, 'a@fsksurat.in');
  assert.strictEqual(s.effective, 'notcertified'); assert.strictEqual(s.needsReview, true);
});
t('who may certify: only a Certifying Mentor; admin or certifier may withdraw', () => {
  const ok = { eligible: 'certified', blockers: [] }, no = { eligible: 'notcertified', blockers: ['Critical gate 1.1 x is not passed yet.'] };
  L.validateCertification_('certified', ok, { role: 'Assessor', certifier: true });
  assert.throws(() => L.validateCertification_('certified', ok, { role: 'Assessor', certifier: false }), /Certifying Mentor/);
  assert.throws(() => L.validateCertification_('certified', ok, { role: 'Admin', certifier: false }), /Certifying Mentor/);
  assert.throws(() => L.validateCertification_('certified', no, { role: 'Assessor', certifier: true }), /not eligible yet: Critical gate 1\.1/);
  L.validateCertification_('notcertified', no, { role: 'Admin' });
  assert.throws(() => L.validateCertification_('notcertified', no, { role: 'Assessor', certifier: false }), /Only a Certifying Mentor or an admin/);
  assert.throws(() => L.validateCertification_('supervised', ok, { role: 'Admin', certifier: true }), /Unknown/);
});

t('consent checklist: needs a student code of any form (no format is prescribed) and every item ticked', () => {
  const total = PR.checklist.groups.reduce((a, g) => a + g[1].length, 0), all = Array(total).fill(true), task = { real: true };
  assert.strictEqual(total, 14);
  ['g10-s1', 'G10-S1', '7', 'Blue fox 3', 'A/12-b', '  spaced  '].forEach(c => assert.strictEqual(L.validateChecklist_('6.3', c, all, task), c.trim()), 'any code the trainee chooses is accepted as typed');
  ['', '   ', null].forEach(c => assert.throws(() => L.validateChecklist_('6.3', c, all, task), /Enter the student code/));
  assert.throws(() => L.validateChecklist_('6.3', 'x'.repeat(41), all, task), /short/);
  assert.ok(!/G10|for example|digit|number|character/i.test(JSON.stringify(PR.checklist)), 'the checklist text does not prescribe a format');
  assert.throws(() => L.validateChecklist_('6.3', 'G10-S1', all.slice(0, 13), task), /every item/);
  assert.throws(() => L.validateChecklist_('6.3', 'G10-S1', all.map((x, i) => i !== 3), task), /every item/);
  assert.throws(() => L.validateChecklist_('2.1', 'G10-S1', all, { real: false }), /does not need/);
});

t('deadlines and AI use: due date is optional and validated; a trainee-specific AI setting overrides the task default', () => {
  assert.strictEqual(L.validateDue_(''), ''); assert.strictEqual(L.validateDue_('2026-07-15'), '2026-07-15'); assert.strictEqual(L.validateDue_('15/7/2026'), '2026-07-15');
  assert.throws(() => L.validateDue_('next week'), /valid date/);
  assert.strictEqual(L.aiOf_({ ai: 'no' }, { ai: '' }), 'no'); assert.strictEqual(L.aiOf_({ ai: 'ask' }, { ai: 'yes' }), 'yes'); assert.strictEqual(L.aiOf_({}, null), 'ask');
});
t('overdue count: only unfinished tasks past their due date', () => {
  const db = newDb();
  db.progress.push(prog('a@fsksurat.in', '1.1', 'progress', null, { due: '2026-06-10' }), prog('a@fsksurat.in', '1.2', 'complete', 3, { due: '2026-06-10' }), prog('a@fsksurat.in', '1.3', 'not', null, { due: '2026-06-30' }));
  assert.strictEqual(stats(db, 'a@fsksurat.in', '2026-06-20').overdue, 1);
});
t('reattempts: one after the first miss by default, more only when an admin allows it', () => {
  assert.strictEqual(L.failedAllowed_(S.settings, { extra: 0 }), 2); assert.strictEqual(L.failedAllowed_(S.settings, { extra: 1 }), 3);
});

t('visibility: mentors, TL and certifying mentor see their trainee; unassigned trainees are open to every assessor; admins see all', () => {
  const tr = { email: 'a@x', assessors: ['m@x'], tl: 't@x', certifier: 'c@x' };
  ['m@x', 't@x', 'c@x'].forEach(e => assert.ok(L.visibleTo_({ role: 'Assessor', email: e }, tr)));
  assert.ok(!L.visibleTo_({ role: 'Assessor', email: 'o@x' }, tr)); assert.ok(L.visibleTo_({ role: 'Admin', email: 'z@x' }, tr));
  assert.ok(L.visibleTo_({ role: 'Assessor', email: 'o@x' }, { email: 'b@x', assessors: [], tl: '', certifier: '' }));
  assert.ok(L.visibleTo_({ role: 'Trainee', email: 'a@x' }, tr)); assert.ok(!L.visibleTo_({ role: 'Trainee', email: 'b@x' }, tr));
});

t('bootstrap: a trainee gets only their own data and the end date; staff get task and module details; nobody enrolled gets nothing', () => {
  const db = newDb(); db.rubrics = [{ task: '1.1', order: 1, use: 'score', show: true, group: '', criterion: 'c', evaluated: '', levels: ['', '', '', ''] }];
  const cfg = { appName: 'x' }, me = { role: 'Trainee', email: 'a@fsksurat.in' };
  const b = L.buildBootstrap_(db, me, '2026-06-02', cfg);
  assert.strictEqual(b.trainees.length, 1); assert.strictEqual(b.trainees[0].end, '2026-09-01'); assert.strictEqual(b.config.cycles, 13);
  assert.strictEqual(b.tasks.length, 32); assert.strictEqual(b.topics[0].note, ''); assert.strictEqual(b.staff, undefined); assert.strictEqual(b.rubrics.length, 1);
  assert.strictEqual(L.buildBootstrap_(db, { role: 'Admin', email: 'admin@fsksurat.in' }, '2026-06-02', cfg).trainees.length, 2);
  assert.strictEqual(L.buildBootstrap_(db, { role: 'None', email: 'q@x' }, '2026-06-02', cfg).tasks, undefined);
});
t('competency standard: staff receive it; a trainee never receives it, nor the rubric rows hidden from them', () => {
  const db = newDb(); db.rubrics = [{ task: '2.1', order: 1, use: 'score', show: false, group: '', criterion: 'Can explain the programme', evaluated: '', levels: ['', '', '', ''] },
    { task: '1.1', order: 1, use: 'score', show: true, group: '', criterion: 'Role', evaluated: 'what is judged', levels: ['', '', '', ''] }];
  const std = id => db.tasks.find(x => x.id === id).standard;
  assert.ok(std('2.1').length > 10);
  const tr = L.buildBootstrap_(db, { role: 'Trainee', email: 'a@fsksurat.in' }, '2026-06-02', {});
  assert.ok(tr.tasks.every(x => x.standard === '')); assert.strictEqual(tr.rubrics.map(r => r.task).join(','), '1.1');
  assert.ok(!JSON.stringify(tr).includes(std('2.1')) && !JSON.stringify(tr).includes('Can explain the programme'), 'the standard is nowhere in what the trainee receives');
  for (const role of ['Assessor', 'Admin']) {
    const st = L.buildBootstrap_(db, { role, email: role === 'Admin' ? 'admin@fsksurat.in' : 'tl@fsksurat.in' }, '2026-06-02', {});
    assert.strictEqual(st.tasks.find(x => x.id === '2.1').standard, std('2.1')); assert.strictEqual(st.rubrics.length, 2); assert.strictEqual(st.rubrics.find(r => r.task === '2.1').show, false);
  }
});
t('pace: the calendar expects 0 at the start and 100 by the end', () => {
  const db = newDb();
  assert.ok(stats(db, 'a@fsksurat.in', '2026-06-01').expectedPct < 3);
  assert.strictEqual(stats(db, 'a@fsksurat.in', '2026-09-30').expectedPct, 100);
});

t('files: only allowed extensions; names are cleaned', () => {
  assert.ok(L.extOk_('a.PDF') && L.extOk_('b.docx') && !L.extOk_('c.exe') && !L.extOk_('noext'));
  assert.strictEqual(L.safeFileName_('../../etc/pass:wd?.pdf'), '.._.._etc_pass_wd_.pdf');
});

console.log('\n' + n + ' tests passed');
