// Run: node tests/server.test.js   (no dependencies). Runs the real server code against an in-memory Google.
const assert = require('assert');
const { makeWorld } = require('./fake-google');
const { build } = require('./fixture');
let n = 0; const t = (name, fn) => { try { fn(); n++; console.log('ok  ' + name); } catch (e) { console.log('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } };
const throws = (fn, re) => assert.throws(fn, e => re.test(e.message), 'expected an error matching ' + re);

const W = makeWorld(), call = (who, fn, ...a) => { W.as(who); return W.call(fn, a); };
const COORD = 'richa.panchal@fsksurat.in', TLS = 'tl.senior@fsksurat.in', TLJ = 'tl.junior@fsksurat.in', PRS = 'pr.senior@fsksurat.in', TR = 'trainee.one@fsksurat.in', TR2 = 'trainee.two@fsksurat.in';
W.setNow('2026-11-03'); W.as(COORD); W.api.setup();
const headers = W.api.SHEETS.Tasks; W.state.workbooks.wb = build(headers);

t('the Coordinator imports the task list once; a second import needs "replace"', () => {
  const dry = call(COORD, 'importWorkbook', 'https://docs.google.com/spreadsheets/d/wb/edit', true, false);
  assert.strictEqual(dry.counts.tasks, 11); assert.strictEqual(dry.counts.active, 10);
  call(COORD, 'importWorkbook', 'wb', false, false);
  throws(() => call(COORD, 'importWorkbook', 'wb', false, false), /already imported/);
  const b = call(COORD, 'getBootstrap'); assert.strictEqual(b.catalogueCount, 10);
  assert.deepStrictEqual(b.milestones.map(m => m.deadline), [3, 5, 10, 12]);      // the decided deadlines replace the workbook's
  throws(() => call('nobody@fsksurat.in', 'importWorkbook', 'wb', true, false), /not enrolled/);
});

t('staff and trainees are set up; a Team Leader enrols only into their own section', () => {
  call(COORD, 'saveUser', TLS, 'Senior TL', 'Team Leader – Senior School', true);
  call(COORD, 'saveUser', TLJ, 'Junior TL', 'Team Leader – Junior School', true);
  call(COORD, 'saveUser', PRS, 'Senior Principal', 'Principal – Senior School', true);
  call(TLS, 'enrolTrainee', { name: 'Trainee One', email: TR, start: '2026-11-02' });
  call(TLJ, 'enrolTrainee', { name: 'Trainee Two', email: TR2, start: '2026-11-02' });
  throws(() => call(TLS, 'enrolTrainee', { name: 'X', email: 'x@gmail.com', start: '2026-11-02' }), /fsksurat/);
  const b = call(TLS, 'getBootstrap'); assert.strictEqual(b.trainees.length, 2);
  assert.strictEqual(b.trainees.find(x => x.record.email === TR).cover, false); assert.strictEqual(b.trainees.find(x => x.record.email === TR2).cover, true);
  throws(() => call(TLS, 'updateTrainee', TR2, { cases: 2 }), /other section/);
});

t('a trainee sees only their own rows, with no Team Leader-only fields, and nothing from locked tasks (R1, R4)', () => {
  const b = call(TR, 'getBootstrap'), json = JSON.stringify(b);
  assert.strictEqual(b.me.kind, 'trainee'); assert.ok(!json.includes('SECRET-'), 'TL-only text leaked'); assert.ok(!json.includes(TR2));
  const by = id => b.tasks.find(x => x.id === id);
  assert.strictEqual(by('SAFE-01').status, 'notstarted'); assert.ok(by('SAFE-01').learn);
  assert.strictEqual(by('SAFE-02').status, 'locked'); assert.ok(!by('SAFE-02').learn, 'locked task shows no content');
  assert.strictEqual(by('SYS-05').status, 'soon'); assert.ok(!b.tasks.find(x => x.id === 'SYS-09'), 'retired tasks are hidden');
  assert.strictEqual(by('SYS-10').status, 'locked');
  assert.ok(!('checkedAgainst' in by('SAFE-01')) && !('source' in by('SAFE-01')));
});

t('submitting needs the anonymisation tick, evidence and hours; locked and Coming soon tasks are refused (R26, R4)', () => {
  throws(() => call(TR, 'submitAttempt', 'SAFE-02', { evidence: 'https://x', anon: true, hours: 1 }), /locked/);
  throws(() => call(TR, 'submitAttempt', 'SYS-05', { evidence: 'https://x', anon: true, hours: 1 }), /coming soon/i);
  throws(() => call(TR, 'submitAttempt', 'SAFE-01', { evidence: 'https://x', hours: 1 }), /anonymised/);
  throws(() => call(TR, 'submitAttempt', 'SAFE-01', { anon: true, hours: 1 }), /needs evidence/);
  throws(() => call(TR, 'submitAttempt', 'SAFE-01', { evidence: 'https://x', anon: true }), /hours/);
  throws(() => call(TR, 'uploadEvidence', 'SAFE-01', 'session.mp3', 'audio/mpeg', Buffer.from('abc').toString('base64')), /Audio and video/);
  throws(() => call(TR, 'uploadEvidence', 'SAFE-01', 'macro.exe', 'application/octet-stream', Buffer.from('abc').toString('base64')), /not allowed/);
  call(TR, 'uploadEvidence', 'SAFE-01', 'notes.pdf', 'application/pdf', Buffer.from('abc').toString('base64'));
  const b = call(TR, 'submitAttempt', 'SAFE-01', { reflection: 'ok', anon: true, hours: 1.5 });
  const a = b.attempts.find(x => x.task === 'SAFE-01'); assert.strictEqual(a.status, 'Submitted'); assert.strictEqual(a.no, 1); assert.strictEqual(a.files.length, 1);
});

t('ratings stay "Under review" until released; a trainee cannot rate, and the other section cannot rate (R15, R17)', () => {
  const att = call(TLS, 'getBootstrap').trainees.find(x => x.record.email === TR).attempts.find(x => x.task === 'SAFE-01');
  throws(() => call(TR, 'rateAttempt', att.id, { score: 4 }), /do not have access/);
  throws(() => call(TLJ, 'rateAttempt', att.id, { score: 4 }), /other section/);
  throws(() => call(TLS, 'rateAttempt', att.id, { score: 7 }), /1 to 4/);
  call(TLS, 'rateAttempt', att.id, { score: 4, feedback: 'Great', tlNotes: 'PRIVATE-NOTE', release: false });
  let b = call(TR, 'getBootstrap'), mine = b.attempts.find(x => x.id === att.id);
  assert.strictEqual(mine.underReview, true); assert.ok(!('score' in mine)); assert.ok(!JSON.stringify(b).includes('PRIVATE-NOTE') && !JSON.stringify(b).includes('Great'));
  assert.notStrictEqual(b.tasks.find(x => x.id === 'SAFE-01').status, 'passed');
  call(TLS, 'releaseRating', att.id, true);
  b = call(TR, 'getBootstrap'); mine = b.attempts.find(x => x.id === att.id);
  assert.strictEqual(mine.score, '4'); assert.strictEqual(mine.feedback, 'Great'); assert.ok(!JSON.stringify(b).includes('PRIVATE-NOTE'));
  assert.strictEqual(b.tasks.find(x => x.id === 'SAFE-01').status, 'passed');
  assert.strictEqual(b.tasks.find(x => x.id === 'SAFE-02').status, 'notstarted');          // R4: unlocked by the pass
});

t('the other section sees a cover view without private notes; the Coordinator sees nothing of Team Leader notes (R2, R3)', () => {
  const view = call(TLJ, 'getBootstrap').trainees.find(x => x.record.email === TR);
  assert.strictEqual(view.cover, true); assert.ok(!JSON.stringify(view).includes('PRIVATE-NOTE'));
  const cj = JSON.stringify(call(COORD, 'getBootstrap')); assert.ok(!cj.includes('PRIVATE-NOTE') && !cj.includes('Great'));
  const pr = call(PRS, 'getBootstrap'); assert.deepStrictEqual(pr.trainees, []); assert.ok(!JSON.stringify(pr).includes('SECRET-'));
});

t('a Safety Flag forces rework whatever the score; a rework gets Version B and the retry limit applies (R13, R14)', () => {
  call(TR, 'saveDraft', 'SAFE-02', { evidence: 'https://x', anon: true, hours: 1 });
  let b = call(TR, 'submitAttempt', 'SAFE-02', { evidence: 'https://x', anon: true, hours: 1 });
  const a1 = call(TLS, 'getBootstrap').trainees.find(x => x.record.email === TR).attempts.find(x => x.task === 'SAFE-02' && x.no === 1); assert.strictEqual(a1.version, 'A');
  throws(() => call(TLS, 'rateAttempt', a1.id, { score: 4, flag: true, release: true }), /Safety Flag/);
  call(TLS, 'rateAttempt', a1.id, { score: 4, flag: true, flagNote: 'Breached confidentiality', release: true });
  b = call(TR, 'getBootstrap'); let st = b.tasks.find(x => x.id === 'SAFE-02'); assert.strictEqual(st.status, 'rework'); assert.strictEqual(st.nextVersion, 'B'); assert.strictEqual(st.flagEver, true);
  call(TR, 'submitAttempt', 'SAFE-02', { evidence: 'https://y', anon: true, hours: 1 });
  const a2 = call(TLS, 'getBootstrap').trainees.find(x => x.record.email === TR).attempts.find(x => x.task === 'SAFE-02' && x.no === 2); assert.strictEqual(a2.version, 'B');
  call(TLS, 'rateAttempt', a2.id, { score: 2, release: true });
  call(TR, 'submitAttempt', 'SAFE-02', { evidence: 'https://z', anon: true, hours: 1 });
  const a3 = call(TLS, 'getBootstrap').trainees.find(x => x.record.email === TR).attempts.find(x => x.task === 'SAFE-02' && x.no === 3);
  call(TLS, 'rateAttempt', a3.id, { score: 2, release: true });
  st = call(TR, 'getBootstrap').tasks.find(x => x.id === 'SAFE-02'); assert.strictEqual(st.status, 'failed');
  throws(() => call(TR, 'submitAttempt', 'SAFE-02', { evidence: 'https://q', anon: true, hours: 1 }), /not open/);
});

t('Complete and % methods, fast-track and the entry check work (R10, R11)', () => {
  let b = call(TR, 'submitAttempt', 'STU-01', { evidence: 'https://x', anon: true, hours: 1 });
  const s1 = b.attempts.find(x => x.task === 'STU-01');
  throws(() => call(TLS, 'rateAttempt', s1.id, { score: '3' }), /Complete or Not complete/);
  call(TLS, 'rateAttempt', s1.id, { score: 'Complete', release: true });
  b = call(TR, 'submitAttempt', 'STU-02', { evidence: 'https://x', anon: true, hours: 1 });
  const s2 = b.attempts.find(x => x.task === 'STU-02');
  call(TLS, 'rateAttempt', s2.id, { score: 95, rubric: { q1: true, q2: false }, release: true });
  assert.strictEqual(call(TR, 'getBootstrap').tasks.find(x => x.id === 'STU-02').status, 'rework');      // a required question was missed
  throws(() => call(TLS, 'setEntryCheck', TR, 'Nonsense', 3, 'Focus', ''), /Unknown area/);
  ['Parent conversations', 'Teacher consultation', 'Case formulation', 'Policy and systems'].forEach(a => call(TLS, 'setEntryCheck', TR, a, 2, 'Focus', ''));
  call(TLS, 'setEntryCheck', TR, 'Counselling skills', 4, 'Show quickly', 'strong');
  const tr = call(TLS, 'getBootstrap').trainees.find(x => x.record.email === TR);
  assert.strictEqual(tr.calc.entryDone, true); assert.strictEqual(tr.calc.tasks['SYS-02'].status, 'passed');
  assert.ok(!JSON.stringify(call(TR, 'getBootstrap').entry).includes('strong'), 'entry notes stay with the Team Leader');
});

t('joint tasks need the Coordinator’s confirmation, and the Coordinator never sees the score (R16)', () => {
  const b = call(TR, 'submitAttempt', 'ADU-01', { evidence: 'https://x', anon: true, hours: 1 });
  const a = b.attempts.find(x => x.task === 'ADU-01');
  call(TLS, 'rateAttempt', a.id, { score: 3, obsType: 'Real', release: true });
  assert.notStrictEqual(call(TR, 'getBootstrap').tasks.find(x => x.id === 'ADU-01').status, 'passed');
  const co = call(COORD, 'getBootstrap').confirmations.find(x => x.id === a.id); assert.ok(co); assert.ok(!('score' in co) && co.rated === true);
  throws(() => call(TLS, 'confirmProcess', a.id, true, ''), /do not have access/);
  call(COORD, 'confirmProcess', a.id, true, 'Process followed');
  assert.strictEqual(call(TR, 'getBootstrap').tasks.find(x => x.id === 'ADU-01').status, 'passed');
});

t('supervised practice needs eligibility; clearance cannot be recorded early; closed records are read-only (R7, R21, R31)', () => {
  throws(() => call(TLS, 'confirmSupervised', TR), /not yet eligible/);
  throws(() => call(TLS, 'recordClearance', TR, 'Cleared', ''), /clearance check/);
  throws(() => call(PRS, 'principalSignOff', TR), /not cleared/);
  call(TLS, 'updateTrainee', TR, { status: 'Completed' });
  throws(() => call(TLS, 'setEntryCheck', TR, 'Case formulation', 2, 'Focus', ''), /read-only/);
  throws(() => call(TR, 'saveDraft', 'SAFE-01', { reflection: 'x' }), /read-only/);
  assert.strictEqual(call(TR, 'getBootstrap').readOnly, true);
  call(TLS, 'updateTrainee', TR, { status: 'Active' });
});

t('policy acknowledgements flag a policy updated after it was acknowledged (R28)', () => {
  call(COORD, 'savePolicy', 'Code of Conduct', 'https://example.org/coc', '2026-10-01');
  call(TR, 'acknowledgePolicy', 'Code of Conduct');
  assert.strictEqual(call(TR, 'getBootstrap').policies.find(p => p.name === 'Code of Conduct').stale, false);
  call(COORD, 'savePolicy', 'Code of Conduct', 'https://example.org/coc', '2026-11-01');
  assert.strictEqual(call(TR, 'getBootstrap').policies.find(p => p.name === 'Code of Conduct').stale, true);
});

t('professional behaviour: lowest item is the overall; trainees see it only once released (R20)', () => {
  call(TR, 'saveSelfRating', 1, [3, 3, 3, 3, 3, 3]);
  call(TLS, 'saveBehaviour', TR, 1, { items: [4, 4, 2, 4, 4, 4], comments: 'c', tlNotes: 'PRIV2', release: false });
  let b = call(TR, 'getBootstrap').behaviour.find(x => x.cycle === 1); assert.strictEqual(b.items, null); assert.strictEqual(b.overall, null);
  throws(() => call(TLS, 'saveBehaviour', TR, 1, { items: [4, 4, null, 4, 4, 4], release: true }), /all six/);
  call(TLS, 'saveBehaviour', TR, 1, { items: [4, 4, 2, 4, 4, 4], comments: 'c', release: true });
  b = call(TR, 'getBootstrap'); assert.strictEqual(b.behaviour.find(x => x.cycle === 1).overall, 2); assert.ok(!JSON.stringify(b).includes('PRIV2'));
});

t('the task list is edited in the app, validated, logged, and tasks are retired not deleted (R30)', () => {
  throws(() => call(TLS, 'saveTask', { id: 'STU-30', title: 'Loop', ratingMethod: '1–4', milestone: 'Milestone 1', strand: 'Working with Students', active: 'Yes', prereq: 'STU-31' }), /not in the task list/);
  call(TLS, 'saveTask', { id: 'SAFE-01', learn: 'Edited learn text' });
  assert.ok(call(TR, 'getBootstrap').tasks.find(x => x.id === 'SAFE-01').learn === 'Edited learn text');
  call(TLS, 'setTaskActive', 'SYS-10', false);
  assert.ok(!call(TR, 'getBootstrap').tasks.find(x => x.id === 'SYS-10'));
  const h = call(COORD, 'getHistory', 100); assert.ok(h.some(x => x.table === 'Tasks' && x.record === 'SYS-10')); assert.ok(h.some(x => x.table === 'Attempts' && x.field === 'rating'));
  throws(() => call(TR, 'saveTask', { id: 'SAFE-01', learn: 'hack' }), /do not have access/);
  assert.ok(call(TLS, 'exportCatalogue').text.split('\n')[0].includes('Task ID'));
});

t('deadlines can be changed by the Coordinator but must rise and fit the programme', () => {
  throws(() => call(COORD, 'saveMilestones', [{ n: 1, deadline: 5 }, { n: 2, deadline: 4 }, { n: 3, deadline: 10 }, { n: 4, deadline: 12 }]), /must end after/);
  throws(() => call(TLS, 'saveMilestones', []), /do not have access/);
});

console.log(n + ' server tests passed');
