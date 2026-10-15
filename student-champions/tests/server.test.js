// Runs the real server code (Code.gs, Actions.gs, Admin.gs, DocSync.gs) against fake Google services. Run: node tests/server.test.js
const assert = require('assert'), { makeWorld } = require('./fake-google');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const throwsMsg = (fn, re) => assert.throws(fn, re);
const W = makeWorld(), ADMIN = 'richa.panchal@fsksurat.in';
W.as(ADMIN); W.api.setup();
const P = W.api.PROGRAMME;
const boot = () => W.call('getBootstrap');
const me = (email, fn) => { const was = W.state.user; W.as(email); try { return fn(); } finally { W.as(was); } };
const tr = (b, email) => b.trainees.find(x => x.id === email);
const crit = (b, id, score) => { const o = {}; b.rubrics.filter(r => r.task === id && r.use === 'score').forEach(r => { o[r.order] = score; }); return o; };
const tick = () => Array(P.checklist.groups.reduce((a, g) => a + g[1].length, 0)).fill(true);
const assess = (email, id, score, fb) => W.call('assessTask', [email, id, { criteria: crit(boot(), id, score), feedback: fb || 'Well done.' }]);

t('setup fills every tab from the seed, creates the private evidence folder and the nightly refresh', () => {
  assert.strictEqual(W.sheets.Tasks.getLastRow(), 33); assert.strictEqual(W.sheets.Topics.getLastRow(), 9); assert.strictEqual(W.sheets.Phases.getLastRow(), 5);
  assert.strictEqual(W.sheets.Rubrics.getLastRow(), 272);   // 271 criteria and the header
  assert.strictEqual(W.sheets.Staff.get(2, 1), ADMIN); assert.strictEqual(W.sheets.Staff.get(2, 4), 'No'); assert.ok(W.state.props.EVIDENCE_FOLDER_ID);
  assert.strictEqual(W.state.triggers.length, 1); assert.strictEqual(W.state.triggers[0].getHandlerFunction(), 'refreshModuleTextNightly');
  W.api.setup(); assert.strictEqual(W.sheets.Tasks.getLastRow(), 33, 'setup is idempotent'); assert.strictEqual(W.state.triggers.length, 1, 'one trigger only');
});
t('setup cannot be re-run by a non-admin', () => { me('x@fsksurat.in', () => throwsMsg(() => W.api.setup(), /admin/)); });
t('the app starts whatever order its files were pasted in', () => {
  const R = makeWorld({ reverse: true }); R.as(ADMIN); R.api.setup();
  assert.strictEqual(R.call('getBootstrap').tasks.length, 32);
});

t('staff: mentors, a TL and a Certifying Mentor; one person can hold more than one role', () => {
  W.call('saveStaff', ['tl@fsksurat.in', 'Team Leader', 'Assessor']);
  W.call('saveStaff', ['mentor@fsksurat.in', 'Mentor One', 'Assessor']);
  W.call('saveStaff', ['cm@fsksurat.in', 'Certifier', 'Assessor', true]);
  const b = W.call('saveStaff', [ADMIN, 'Richa Panchal', 'Admin', true]);
  const richa = b.staff.find(s => s.email === ADMIN); assert.strictEqual(richa.role, 'Admin'); assert.strictEqual(richa.certifies, true);
  assert.strictEqual(W.call('saveStaff', ['tl@fsksurat.in', 'Team Leader', 'Assessor']).staff.find(s => s.email === 'tl@fsksurat.in').certifies, false);
  throwsMsg(() => W.api.saveStaff('tl@gmail.com', 'X', 'Assessor'), /@fsksurat\.in/);
  throwsMsg(() => W.api.removeStaff(ADMIN), /yourself/);
});
t('admin enrols trainees with mentors, a TL and a Certifying Mentor, and sees the end date', () => {
  W.call('enrolTrainee', ['Asha', 'asha@fsksurat.in', { mentors: ['mentor@fsksurat.in'], tl: 'tl@fsksurat.in', certifier: 'cm@fsksurat.in' }, '2026-06-01']);
  const b = W.call('enrolTrainee', ['Bina', 'bina@fsksurat.in', {}, '2026-06-01']);
  const a = tr(b, 'asha@fsksurat.in'); assert.strictEqual(a.end, '2026-09-01'); assert.strictEqual(a.tlName, 'Team Leader'); assert.strictEqual(a.certifierName, 'Certifier');
  throwsMsg(() => W.api.enrolTrainee('X', 'x@gmail.com', {}, '2026-06-01'), /@fsksurat\.in/);
  throwsMsg(() => W.api.enrolTrainee('Asha', 'asha@fsksurat.in', {}, '2026-06-01'), /already enrolled/);
  throwsMsg(() => W.api.enrolTrainee('Y', 'y@fsksurat.in', { mentors: ['ghost@fsksurat.in'] }, '2026-06-01'), /staff list/);
  throwsMsg(() => W.api.enrolTrainee('Y', 'y@fsksurat.in', { certifier: 'tl@fsksurat.in' }, '2026-06-01'), /not a Certifying Mentor/);
  throwsMsg(() => W.api.enrolTrainee('Y', 'y@fsksurat.in', {}, 'tomorrow'), /valid date/);
  throwsMsg(() => W.api.saveStaff('cm@fsksurat.in', 'Certifier', 'Assessor', false), /Certifying Mentor for Asha/);
});

t('roles: trainee, mentor/TL, certifier, admin, stranger', () => {
  me('asha@fsksurat.in', () => assert.strictEqual(boot().me.role, 'Trainee'));
  me('tl@fsksurat.in', () => assert.strictEqual(boot().me.role, 'Assessor'));
  me('cm@fsksurat.in', () => assert.strictEqual(boot().me.certifier, true));
  me('nobody@fsksurat.in', () => { const s = boot(); assert.strictEqual(s.me.role, 'None'); assert.strictEqual(s.tasks, undefined); });
});
t('visibility: assigned people see Asha; an unrelated mentor does not; Bina (unassigned) is open to every mentor', () => {
  W.call('saveStaff', ['other@fsksurat.in', 'Other Mentor', 'Assessor']);
  me('other@fsksurat.in', () => assert.deepStrictEqual(boot().trainees.map(x => x.id), ['bina@fsksurat.in']));
  ['mentor@fsksurat.in', 'tl@fsksurat.in', 'cm@fsksurat.in'].forEach(e => me(e, () => assert.ok(tr(boot(), 'asha@fsksurat.in'))));
});

t('trainee: draft, evidence, upload, submit', () => {
  W.as('asha@fsksurat.in');
  let b = W.call('saveMyTask', ['1.2', 'save', 'note', 'my reflection']);
  assert.strictEqual(tr(b, 'asha@fsksurat.in').p['1.2'].status, 'progress');
  throwsMsg(() => W.api.saveMyTask('1.3', 'submit', '', ''), /evidence/);
  b = W.call('uploadEvidence', ['1.3', 'casebook.pdf', 'application/pdf', Buffer.from('%PDF-1 hello').toString('base64')]);
  assert.strictEqual(tr(b, 'asha@fsksurat.in').p['1.3'].files[0].name, 'casebook.pdf');
  throwsMsg(() => W.api.uploadEvidence('1.3', 'bad.exe', 'x', 'AAAA'), /not allowed/);
  throwsMsg(() => W.api.uploadEvidence('1.3', 'big.pdf', 'x', Buffer.alloc(11 * 1048576).toString('base64')), /larger than 10 MB/);
  b = W.call('saveMyTask', ['1.3', 'submit', '', '']); assert.strictEqual(tr(b, 'asha@fsksurat.in').p['1.3'].status, 'submitted');
  throwsMsg(() => W.api.saveMyTask('1.3', 'save', 'x', ''), /already been submitted/);
  b = W.call('saveMyTask', ['1.2', 'submit', 'https://drive/x', '']); assert.strictEqual(tr(b, 'asha@fsksurat.in').stats.pending, 2);
});
t('evidence files: the trainee, mentor, TL, certifying mentor and admin can fetch; others cannot', () => {
  const fid = tr(boot(), 'asha@fsksurat.in').p['1.3'].files[0].id;
  assert.strictEqual(Buffer.from(W.call('getEvidenceFile', ['asha@fsksurat.in', '1.3', fid]).data, 'base64').toString(), '%PDF-1 hello');
  ['mentor@fsksurat.in', 'tl@fsksurat.in', 'cm@fsksurat.in', ADMIN].forEach(e => me(e, () => assert.ok(W.call('getEvidenceFile', ['asha@fsksurat.in', '1.3', fid]).data)));
  me('other@fsksurat.in', () => throwsMsg(() => W.api.getEvidenceFile('asha@fsksurat.in', '1.3', fid), /do not have access/));
  me('bina@fsksurat.in', () => throwsMsg(() => W.api.getEvidenceFile('asha@fsksurat.in', '1.3', fid), /do not have access/));
  me('asha@fsksurat.in', () => throwsMsg(() => W.api.getEvidenceFile('asha@fsksurat.in', '1.2', fid), /not attached/));
});
t('a trainee cannot see another trainee, assess, plan, certify or edit the module', () => {
  W.as('asha@fsksurat.in');
  assert.deepStrictEqual(boot().trainees.map(x => x.id), ['asha@fsksurat.in']);
  throwsMsg(() => W.api.assessTask('asha@fsksurat.in', '1.2', { score: 4 }), /mentors, TLs and admins/);
  throwsMsg(() => W.api.setTaskPlan('asha@fsksurat.in', '1.2', '2026-06-20', 'yes'), /mentors, TLs and admins/);
  throwsMsg(() => W.api.confirmCertification('asha@fsksurat.in', 'certified', ''), /mentors, TLs and admins/);
  throwsMsg(() => W.api.saveTopic({ name: 'x', w: 1 }), /admin/);
  throwsMsg(() => W.api.saveRubric('1.1', []), /admin/);
  throwsMsg(() => W.api.refreshModuleText(), /admin/);
  W.as(ADMIN);
});

t('real-student tasks: the consent checklist comes first, uses a student code, and one is needed per student', () => {
  W.as('asha@fsksurat.in');
  throwsMsg(() => W.api.saveMyTask('6.3', 'submit', 'notes', ''), /consent checklist for 2 students/);
  throwsMsg(() => W.api.saveChecklist('6.3', 'Meera Shah', tick()), /student code/);
  throwsMsg(() => W.api.saveChecklist('6.3', 'G10-S1', tick().map((x, i) => i !== 2)), /every item/);
  throwsMsg(() => W.api.saveChecklist('2.1', 'G10-S1', tick()), /does not need/);
  let b = W.call('saveChecklist', ['6.3', 'g10-s1', tick()]);
  assert.deepStrictEqual(tr(b, 'asha@fsksurat.in').lists.map(x => x.code), ['G10-S1']);
  throwsMsg(() => W.api.saveChecklist('6.3', 'G10-S1', tick()), /already completed/);
  throwsMsg(() => W.api.saveMyTask('6.3', 'submit', 'notes', ''), /you have 1/);
  W.call('saveChecklist', ['6.3', 'G11-S4', tick()]);
  b = W.call('saveMyTask', ['6.3', 'submit', 'notes with codes only', '']); assert.strictEqual(tr(b, 'asha@fsksurat.in').p['6.3'].status, 'submitted');
  assert.ok(!JSON.stringify(W.sheets.Checklists.cells).match(/Meera/), 'no name is ever stored');
  W.as(ADMIN);
});

t('assessing with a rubric: the task score is the rounded average of criterion scores, kept per criterion', () => {
  W.as('mentor@fsksurat.in');
  const b0 = boot(), rows = b0.rubrics.filter(r => r.task === '1.1' && r.use === 'score');
  assert.strictEqual(rows.length, 14);
  const half = {}; rows.forEach((r, i) => { half[r.order] = i < 7 ? 4 : 3; });            // 3.5 average, rounds up
  let b = W.call('assessTask', ['asha@fsksurat.in', '1.1', { criteria: half, feedback: 'Clear and confident.' }]);
  let p = tr(b, 'asha@fsksurat.in').p['1.1'];
  assert.strictEqual(p.score, 4); assert.strictEqual(p.status, 'complete'); assert.strictEqual(p.criteria[rows[0].order], 4); assert.strictEqual(p.criteria[rows[13].order], 3);
  assert.strictEqual(p.assessor, 'Mentor One');
  throwsMsg(() => W.api.assessTask('asha@fsksurat.in', '1.4', { criteria: {}, feedback: 'x' }), /Score every criterion/);
  throwsMsg(() => W.api.assessTask('asha@fsksurat.in', '1.5', { criteria: crit(boot(), '1.5', 2), feedback: '' }), /what needs to change/);
  b = W.call('assessTask', ['asha@fsksurat.in', '1.5', { criteria: crit(boot(), '1.5', 2), feedback: 'Boundaries section is thin.' }]);
  p = tr(b, 'asha@fsksurat.in').p['1.5']; assert.strictEqual(p.status, 'partial'); assert.strictEqual(p.failed, 1);
  throwsMsg(() => W.api.assessTask('asha@fsksurat.in', '2.2', { exempt: true, feedback: '' }), /why/);
  throwsMsg(() => W.api.assessTask('asha@fsksurat.in', '1.1', { exempt: true, feedback: 'prior' }), /cannot be exempted/);
  W.as(ADMIN);
});
t('an assessor can record a task they watched live without the trainee submitting anything', () => {
  W.as('tl@fsksurat.in');
  const b = W.call('assessTask', ['asha@fsksurat.in', '7.1', { criteria: crit(boot(), '7.1', 3), feedback: 'Observed live.' }]);
  assert.strictEqual(tr(b, 'asha@fsksurat.in').p['7.1'].status, 'complete');
  me('other@fsksurat.in', () => throwsMsg(() => W.api.assessTask('asha@fsksurat.in', '7.1', { score: 4 }), /do not have access/));
  W.as(ADMIN);
});
t('critical error: the task becomes not yet met with score 1, is flagged for the TL, and is cleared by a later good attempt', () => {
  W.as('mentor@fsksurat.in');
  const type = P.criticalErrors[3][0];
  throwsMsg(() => W.api.assessTask('asha@fsksurat.in', '7.2', { criteria: crit(boot(), '7.2', 4), feedback: '', critical: { type } }), /Describe/);
  let b = W.call('assessTask', ['asha@fsksurat.in', '7.2', { criteria: crit(boot(), '7.2', 4), feedback: 'Labelled a student to a parent. Remediation with TL booked.', critical: { type } }]);
  let a = tr(b, 'asha@fsksurat.in'); assert.strictEqual(a.p['7.2'].status, 'rework'); assert.strictEqual(a.p['7.2'].score, 1); assert.strictEqual(a.p['7.2'].critical, type);
  assert.deepStrictEqual(a.stats.openCritical, ['7.2']); assert.ok(a.stats.blockers.some(x => /critical error on 7\.2/.test(x)));
  b = W.call('assessTask', ['asha@fsksurat.in', '7.2', { criteria: crit(boot(), '7.2', 3), feedback: 'Reattempt was safe.' }]);
  a = tr(b, 'asha@fsksurat.in'); assert.strictEqual(a.p['7.2'].critical, ''); assert.deepStrictEqual(a.stats.openCritical, []);
  assert.ok(me(ADMIN, () => W.call('getActivityLog', [])).some(l => l.action === 'Critical error' && l.task === '7.2'));
  W.as(ADMIN);
});

t('reattempts: one after a miss; after that the trainee is blocked until an admin allows another', () => {
  W.as('asha@fsksurat.in');
  W.call('saveMyTask', ['1.5', 'submit', 'v2', '']);                     // second try (first was Developing)
  W.as('mentor@fsksurat.in'); let b = W.call('assessTask', ['asha@fsksurat.in', '1.5', { criteria: crit(boot(), '1.5', 2), feedback: 'Still thin on confidentiality.' }]);
  assert.strictEqual(tr(b, 'asha@fsksurat.in').p['1.5'].failed, 2);
  W.as('asha@fsksurat.in'); throwsMsg(() => W.api.saveMyTask('1.5', 'submit', 'v3', ''), /used the reattempts/);
  W.as('mentor@fsksurat.in'); throwsMsg(() => W.api.grantReattempt('asha@fsksurat.in', '1.5'), /admin/);
  W.as(ADMIN); W.call('grantReattempt', ['asha@fsksurat.in', '1.5']);
  W.as('asha@fsksurat.in'); b = W.call('saveMyTask', ['1.5', 'submit', 'v3', '']); assert.strictEqual(tr(b, 'asha@fsksurat.in').p['1.5'].status, 'submitted');
  W.as(ADMIN);
});

t('plan: the mentor or TL sets a deadline and AI permission per task; the trainee sees them but cannot change them', () => {
  W.as('tl@fsksurat.in');
  let b = W.call('setTaskPlan', ['asha@fsksurat.in', '5.1', '2026-07-10', 'yes']);
  let p = tr(b, 'asha@fsksurat.in').p['5.1']; assert.strictEqual(p.due, '2026-07-10'); assert.strictEqual(p.ai, 'yes');
  throwsMsg(() => W.api.setTaskPlan('asha@fsksurat.in', '5.1', 'soon', ''), /valid date/);
  throwsMsg(() => W.api.setTaskPlan('asha@fsksurat.in', '5.1', '', 'maybe'), /how AI may be used/);
  b = W.call('setTaskPlan', ['asha@fsksurat.in', '5.1', '', '']); p = tr(b, 'asha@fsksurat.in').p['5.1']; assert.strictEqual(p.due, ''); assert.strictEqual(p.ai, '');
  W.call('setTaskPlan', ['asha@fsksurat.in', '5.1', '2026-07-10', 'no']);
  W.as('asha@fsksurat.in'); assert.strictEqual(tr(boot(), 'asha@fsksurat.in').p['5.1'].due, '2026-07-10');
  assert.ok(W.sheets.Progress.getLastRow() > 1);
  W.as(ADMIN);
});

t('certification: not allowed until eligible; only a Certifying Mentor can confirm; it is then recorded and can be withdrawn', () => {
  W.as('cm@fsksurat.in');
  throwsMsg(() => W.api.confirmCertification('asha@fsksurat.in', 'certified', ''), /not eligible yet/);
  W.as(ADMIN);
  const ids = boot().tasks.map(x => x.id);
  ids.forEach(id => { const s = tr(boot(), 'asha@fsksurat.in').p[id]; if (!s || s.status !== 'complete') assess('asha@fsksurat.in', id, 4, 'Strong.'); });
  W.as('asha@fsksurat.in');
  ['6.4', '6.5', '7.2', '7.3'].forEach(id => W.call('saveChecklist', [id, 'G10-S1', tick()]));
  ['7.5'].forEach(id => { W.call('saveChecklist', [id, 'G10-S1', tick()]); W.call('saveChecklist', [id, 'G10-S2', tick()]); });
  W.as('cm@fsksurat.in');
  const a = tr(boot(), 'asha@fsksurat.in'); assert.strictEqual(a.stats.eligible, 'certified'); assert.deepStrictEqual(a.stats.blockers, []); assert.strictEqual(a.stats.gatesPassed, 15);
  W.as('mentor@fsksurat.in'); throwsMsg(() => W.api.confirmCertification('asha@fsksurat.in', 'certified', ''), /Only a Certifying Mentor/);
  W.as(ADMIN); me(ADMIN, () => {});
  W.as('cm@fsksurat.in'); const b = W.call('confirmCertification', ['asha@fsksurat.in', 'certified', 'Excellent journey.']);
  const c = tr(b, 'asha@fsksurat.in'); assert.strictEqual(c.stats.effective, 'certified'); assert.strictEqual(c.confirmedBy, 'Certifier');
  W.as('asha@fsksurat.in'); assert.strictEqual(tr(boot(), 'asha@fsksurat.in').stats.effective, 'certified');
  W.as('tl@fsksurat.in'); throwsMsg(() => W.api.confirmCertification('asha@fsksurat.in', 'notcertified', ''), /Only a Certifying Mentor or an admin/);
  W.as(ADMIN); assert.strictEqual(tr(W.call('confirmCertification', ['asha@fsksurat.in', 'notcertified', 'Paused']), 'asha@fsksurat.in').stats.effective, 'notcertified');
});

t('module editing: modules, tasks, resources and settings validate their input', () => {
  W.as(ADMIN);
  throwsMsg(() => W.api.saveTopic({ name: '', w: 5, need: 60, phase: P.phases[0] }), /module name/);
  throwsMsg(() => W.api.saveTopic({ name: 'x', w: 5, need: 160, phase: P.phases[0] }), /pass mark/);
  throwsMsg(() => W.api.saveTopic({ name: 'x', w: 5, need: 60, phase: 'Nope' }), /phases/);
  const base = { id: '9.1', topic: 8, cycle: 13, name: 'Extra task', type: 'Practice', weight: 1, ai: 'ask', real: false, students: 0, what: '', standard: '', evidence: '', doc: '' };
  throwsMsg(() => W.api.saveTask(Object.assign({}, base, { id: 'nine' }), true), /Task ID/);
  throwsMsg(() => W.api.saveTask(Object.assign({}, base, { cycle: 14 }), true), /Cycle must be 1 to 13/);
  throwsMsg(() => W.api.saveTask(Object.assign({}, base, { ai: 'sometimes' }), true), /AI/);
  throwsMsg(() => W.api.saveTask(Object.assign({}, base, { id: '8.1' }), true), /already exists/);
  const b = W.call('saveTask', [Object.assign({}, base, { id: '8.10', real: true, students: 0 }), true]);
  const t810 = b.tasks.find(x => x.id === '8.10'); assert.strictEqual(t810.real, true); assert.strictEqual(t810.students, 1, 'a real-student task needs at least one student');
  assert.strictEqual(W.sheets.Tasks.get(W.sheets.Tasks.getLastRow(), 1), '8.10', 'id 8.10 stays text and is not turned into 8.1');
  assert.strictEqual(boot().tasks.filter(x => x.id === '8.1').length, 1);
  W.call('setTaskActive', ['8.10', false]);
  throwsMsg(() => W.api.saveResources(1, '', [{ label: 'x', url: 'ftp://x' }]), /http/);
  assert.strictEqual(W.call('saveResources', [1, '', [{ label: 'SOP', url: 'https://x.example/sop', note: '' }]]).res.length, 1);
});
t('rubric editing: an admin can change criteria and levels; at least one scored criterion must remain; reference rows are never scored', () => {
  const rows = boot().rubrics.filter(r => r.task === '3.1');
  assert.strictEqual(rows.length, 1);
  throwsMsg(() => W.api.saveRubric('3.1', []), /at least one criterion/);
  throwsMsg(() => W.api.saveRubric('3.1', [{ criterion: 'Only reference', use: 'reference' }]), /at least one criterion/);
  const b = W.call('saveRubric', ['3.1', [{ criterion: 'Connects to SC practice', evaluated: 'Not generic', levels: ['a', 'b', 'c', 'd'], use: 'score' }, { criterion: 'Note for later', use: 'reference' }]]);
  assert.strictEqual(b.rubrics.filter(r => r.task === '3.1').length, 2);
  assert.strictEqual(b.rubrics.filter(r => r.task === '1.1').length, 14, 'other tasks are untouched');
  me('mentor@fsksurat.in', () => W.call('assessTask', ['bina@fsksurat.in', '3.1', { criteria: { 1: 3 }, feedback: '' }]));   // only the scored row is needed
  assert.strictEqual(tr(boot(), 'bina@fsksurat.in').p['3.1'].score, 3);
});
t('settings: a phase can be renamed and its modules follow; a phase with modules cannot be removed', () => {
  const s = { cycles: 13, daysPerCycle: 6, programmeMonths: 3, passScore: 3, reattempts: 1, maxUploadMb: 10 };
  const ph = boot().config.phaseNames.map(n => ({ name: n, old: n }));
  throwsMsg(() => W.api.saveSettings(Object.assign({}, s, { cycles: 99 }), ph), /cycles must be/);
  throwsMsg(() => W.api.saveSettings(s, ph.slice(0, 3)), /would be removed/);
  throwsMsg(() => W.api.saveSettings(s, ph.map(p => ({ name: 'Same', old: p.old }))), /different/);
  ph[2].name = 'Phase 3 - Practice';
  const b = W.call('saveSettings', [s, ph]);
  assert.ok(b.topics.filter(x => x.id === 6 || x.id === 7).every(x => x.phase === 'Phase 3 - Practice'));
  assert.strictEqual(b.config.phases.find(p => p.name === 'Phase 3 - Practice').from, 8);
});

// ----- module text from the Google Doc -----
const docBlocks = () => {
  const b = boot(), titles = ['Introduction', 'Essential Agreement', 'A section nobody uses'];
  b.tasks.forEach(t => { if (t.doc) titles.push(t.doc); }); b.topics.forEach(t => { if (t.doc) titles.push(t.doc); });
  const out = [{ t: 'p', h: '', runs: [{ text: 'front matter' }] }];
  [...new Set(titles)].filter(x => x !== 'POCSO, CPP & SPACE Model').forEach(x => { out.push({ t: 'p', h: 'title', runs: [{ text: x }] }, { t: 'p', runs: [{ text: 'Text of ' + x + ' <b>' }] }, { t: 'li', level: 0, runs: [{ text: 'point' }] }); });
  return out;
};
t('module text: the doc is copied into the app, with a report of what was missing or unused', () => {
  W.as(ADMIN); W.state.doc = { blocks: docBlocks() };
  const b = W.call('refreshModuleText', []);
  assert.ok(b.sync.sections > 30); assert.deepStrictEqual(b.sync.missing, ['Task 1.4 (POCSO, CPP & SPACE Model)']); assert.deepStrictEqual(b.sync.unused, ['A section nobody uses']);
  const c = W.call('getContent', ['Case Studies: 1']);
  assert.strictEqual(c.found, true); assert.ok(c.html.startsWith('<p>Text of Case Studies: 1 &lt;b&gt;</p><ul><li>point</li></ul>'), c.html);
  assert.strictEqual(W.call('getContent', ['Q & A']).found, true, 'titles match whatever their spacing');
  assert.strictEqual(W.call('getContent', ['POCSO, CPP & SPACE Model']).found, false);
  assert.ok(!W.sheets.Content.cells.flat().join('').includes('front matter'));
  me('asha@fsksurat.in', () => assert.strictEqual(W.call('getContent', ['Introduction']).found, true));
  me('nobody@fsksurat.in', () => throwsMsg(() => W.api.getContent('Introduction'), /not enrolled/));
  assert.strictEqual(boot().sync.sections, b.sync.sections);
  me('asha@fsksurat.in', () => assert.strictEqual(boot().sync, undefined));
});
t('module text: a change in the doc shows after the next refresh; tabs are read in order', () => {
  W.state.doc = { tabs: [{ blocks: [{ t: 'p', h: 'title', runs: [{ text: 'Introduction' }] }, { t: 'p', runs: [{ text: 'Edited intro' }] }], children: [{ blocks: [{ t: 'p', h: 'title', runs: [{ text: 'Viva' }] }, { t: 'p', runs: [{ text: 'Viva text' }] }] }] },
    { blocks: [{ t: 'p', h: 'title', runs: [{ text: 'Q&A' }] }, { t: 'p', runs: [{ text: 'QA text' }] }] }] };
  const b = W.call('refreshModuleText', []);
  assert.strictEqual(b.sync.sections, 3); assert.ok(b.sync.missing.length > 20);
  assert.strictEqual(W.call('getContent', ['Introduction']).html, '<p>Edited intro</p>'); assert.strictEqual(W.call('getContent', ['Viva']).html, '<p>Viva text</p>');
  assert.strictEqual(W.call('getContent', ['Case Studies: 1']).found, false, 'sections removed from the doc are removed from the app');
});
t('module text: if the doc cannot be opened or has no sections, nothing is lost and the reason is clear', () => {
  const before = W.sheets.Content.getLastRow();
  W.state.doc = null; throwsMsg(() => W.api.refreshModuleText(), /Share it with richa\.panchal@fsksurat\.in/);
  W.state.doc = { blocks: [{ t: 'p', runs: [{ text: 'no titles here' }] }] }; throwsMsg(() => W.api.refreshModuleText(), /no Title-style headings/);
  assert.strictEqual(W.sheets.Content.getLastRow(), before);
  assert.strictEqual(W.call('getContent', ['Introduction']).found, true);
});
t('module text: the nightly refresh cannot be started by an ordinary user', () => {
  W.state.doc = { blocks: docBlocks() };
  me('asha@fsksurat.in', () => throwsMsg(() => W.api.refreshModuleTextNightly(), /admin/));
  me('tl@fsksurat.in', () => throwsMsg(() => W.api.refreshModuleTextNightly(), /admin/));
});
t('module text: the nightly trigger refreshes without a signed-in user and logs it', () => {
  W.state.doc = { blocks: docBlocks() }; W.as('');
  W.api.refreshModuleTextNightly();
  W.as(ADMIN); assert.ok(W.call('getActivityLog', []).some(l => l.by === 'nightly refresh'));
  assert.strictEqual(W.call('getContent', ['Introduction']).found, true);
});

t('the activity log is for admins only and records submissions, assessments, plans and certification', () => {
  const log = W.call('getActivityLog', []); const actions = new Set(log.map(l => l.action));
  ['Submitted', 'Assessed', 'Critical error', 'Task plan', 'Extra reattempt', 'Consent checklist', 'Certification', 'Enrolled trainee', 'Saved rubric', 'Refreshed module text'].forEach(a => assert.ok(actions.has(a), a));
  W.as('tl@fsksurat.in'); throwsMsg(() => W.api.getActivityLog(), /admin/); W.as(ADMIN);
});
t('typed text starting with = is stored as text, not a formula (cell format is plain text)', () => {
  W.as('bina@fsksurat.in'); W.call('saveMyTask', ['2.1', 'save', '=HYPERLINK("http://x")', '+1 note']);
  const r = W.sheets.Progress; let found = false;
  for (let i = 2; i <= r.getLastRow(); i++) if (r.get(i, 1) === 'bina@fsksurat.in' && r.get(i, 2) === '2.1') { found = true; assert.strictEqual(r.get(i, 4), '=HYPERLINK("http://x")'); }
  assert.ok(found); W.as(ADMIN);
});

console.log('\n' + n + ' server tests passed');
