// Runs the real Code.gs against fake Google services. Run: node tests/server.test.js
const assert = require('assert'), { makeWorld } = require('./fake-google');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const throwsMsg = (fn, re) => assert.throws(fn, re);
const W = makeWorld(), ADMIN = 'richa.panchal@fsksurat.in';
W.as(ADMIN); W.api.setup();

t('setup fills every tab from the seed and creates the private evidence folder', () => {
  assert.strictEqual(W.sheets.Tasks.getLastRow(), 77); assert.strictEqual(W.sheets.Topics.getLastRow(), 11);
  assert.strictEqual(W.sheets.Staff.get(2, 1), ADMIN); assert.ok(W.state.props.EVIDENCE_FOLDER_ID);
  W.api.setup(); assert.strictEqual(W.sheets.Tasks.getLastRow(), 77, 'setup is idempotent');
});
t('setup cannot be re-run by a non-admin', () => { W.as('x@fsksurat.in'); throwsMsg(() => W.api.setup(), /admin/); W.as(ADMIN); });

t('admin adds an assessor and enrols two trainees', () => {
  W.call('saveStaff', ['tl@fsksurat.in', 'Team Leader', 'Assessor']);
  W.call('enrolTrainee', ['Asha', 'asha@fsksurat.in', ['tl@fsksurat.in'], 'Standard', '2026-10-05']);
  const b = W.call('enrolTrainee', ['Bina', 'bina@fsksurat.in', [], 'Urgent', '2026-10-05']);
  assert.strictEqual(b.trainees.length, 2);
  throwsMsg(() => W.api.enrolTrainee('X', 'x@gmail.com', [], 'Standard', '2026-10-05'), /@fsksurat\.in/);
  throwsMsg(() => W.api.enrolTrainee('Asha', 'asha@fsksurat.in', [], 'Standard', '2026-10-05'), /already enrolled/);
  throwsMsg(() => W.api.enrolTrainee('Y', 'y@fsksurat.in', ['ghost@fsksurat.in'], 'Standard', '2026-10-05'), /staff list/);
  throwsMsg(() => W.api.enrolTrainee('Y', 'y@fsksurat.in', [], 'Standard', 'tomorrow'), /valid date/);
});

t('roles: trainee, assessor, admin, stranger', () => {
  W.as('asha@fsksurat.in'); assert.strictEqual(W.call('getBootstrap').me.role, 'Trainee');
  W.as('tl@fsksurat.in'); assert.strictEqual(W.call('getBootstrap').me.role, 'Assessor');
  W.as('nobody@fsksurat.in'); const s = W.call('getBootstrap'); assert.strictEqual(s.me.role, 'None'); assert.strictEqual(s.tasks, undefined);
});

t('trainee: draft, evidence, upload, submit', () => {
  W.as('asha@fsksurat.in');
  let b = W.call('saveMyTask', ['1.2', 'save', 'note', 'my reflection']);
  assert.strictEqual(b.trainees[0].p['1.2'].status, 'progress');
  throwsMsg(() => W.api.saveMyTask('1.3', 'submit', '', ''), /evidence/);
  b = W.call('uploadEvidence', ['1.3', 'casebook.pdf', 'application/pdf', Buffer.from('%PDF-1 hello').toString('base64')]);
  const f = b.trainees[0].p['1.3'].files[0]; assert.strictEqual(f.name, 'casebook.pdf');
  throwsMsg(() => W.api.uploadEvidence('1.3', 'bad.exe', 'x', 'AAAA'), /not allowed/);
  throwsMsg(() => W.api.uploadEvidence('1.3', 'big.pdf', 'x', Buffer.alloc(11 * 1048576).toString('base64')), /larger than 10 MB/);
  b = W.call('saveMyTask', ['1.3', 'submit', '', '']);
  assert.strictEqual(b.trainees[0].p['1.3'].status, 'submitted');
  throwsMsg(() => W.api.saveMyTask('1.3', 'save', 'x', ''), /already been submitted/);
  throwsMsg(() => W.api.uploadEvidence('1.3', 'again.pdf', 'x', 'AAAA'), /already been submitted/);
  b = W.call('saveMyTask', ['1.2', 'submit', 'https://drive/x', '']); assert.strictEqual(b.trainees[0].stats.pending, 2);
});
t('evidence files: owner and assigned assessor can fetch; others cannot', () => {
  const fid = W.call('getBootstrap').trainees[0].p['1.3'].files[0].id;
  assert.strictEqual(Buffer.from(W.call('getEvidenceFile', ['asha@fsksurat.in', '1.3', fid]).data, 'base64').toString(), '%PDF-1 hello');
  W.as('tl@fsksurat.in'); assert.ok(W.call('getEvidenceFile', ['asha@fsksurat.in', '1.3', fid]).data);
  W.as('bina@fsksurat.in'); throwsMsg(() => W.api.getEvidenceFile('asha@fsksurat.in', '1.3', fid), /do not have access/);
  W.as('asha@fsksurat.in'); throwsMsg(() => W.api.getEvidenceFile('asha@fsksurat.in', '1.2', fid), /not attached/);
});

t('trainee cannot see another trainee, cannot assess, cannot edit the module', () => {
  W.as('asha@fsksurat.in');
  assert.deepStrictEqual(W.call('getBootstrap').trainees.map(x => x.id), ['asha@fsksurat.in']);
  throwsMsg(() => W.api.assessTask('asha@fsksurat.in', '1.2', 'complete', 4, ''), /assessors and admins/);
  throwsMsg(() => W.api.saveTopic({ name: 'x', w: 1 }), /admin/);
  throwsMsg(() => W.api.enrolTrainee('Z', 'z@fsksurat.in', [], 'Standard', '2026-10-05'), /admin/);
  throwsMsg(() => W.api.confirmReadiness('asha@fsksurat.in', 'supervised', ''), /assessors and admins/);
});

t('assessor only sees assigned trainees (and unassigned ones)', () => {
  W.as('tl@fsksurat.in'); assert.deepStrictEqual(W.call('getBootstrap').trainees.map(x => x.id).sort(), ['asha@fsksurat.in', 'bina@fsksurat.in']);
  W.as(ADMIN); W.call('saveStaff', ['tl2@fsksurat.in', 'TL Two', 'Assessor']);
  W.as('tl2@fsksurat.in'); assert.deepStrictEqual(W.call('getBootstrap').trainees.map(x => x.id), ['bina@fsksurat.in']);
  throwsMsg(() => W.api.assessTask('asha@fsksurat.in', '1.2', 'complete', 4, ''), /do not have access/);
});

t('assessing: rules enforced, direct assessment works, re-assessment is logged', () => {
  W.as('tl@fsksurat.in');
  throwsMsg(() => W.api.assessTask('asha@fsksurat.in', '1.2', 'complete', 2, ''), /critical gate/);
  throwsMsg(() => W.api.assessTask('asha@fsksurat.in', '1.2', 'rework', 2, ''), /what needs to change/);
  let b = W.call('assessTask', ['asha@fsksurat.in', '1.2', 'rework', 2, 'Use the confidentiality SOP wording']);
  assert.strictEqual(b.trainees.find(x => x.id === 'asha@fsksurat.in').p['1.2'].status, 'rework');
  W.as('asha@fsksurat.in'); b = W.call('saveMyTask', ['1.2', 'submit', 'https://drive/y', '']);   // trainee redoes it
  W.as('tl@fsksurat.in'); b = W.call('assessTask', ['asha@fsksurat.in', '1.2', 'complete', 3, 'Good']);
  const a = b.trainees.find(x => x.id === 'asha@fsksurat.in'); assert.strictEqual(a.p['1.2'].status, 'complete'); assert.strictEqual(a.p['1.2'].assessor, 'Team Leader');
  b = W.call('assessTask', ['asha@fsksurat.in', '5.7', 'complete', 3, 'Observed role play']);   // never submitted: assessor-led
  assert.strictEqual(b.trainees.find(x => x.id === 'asha@fsksurat.in').p['5.7'].status, 'complete');
  throwsMsg(() => W.api.saveMyTask('1.2', 'save', 'x', ''), /Only trainees/);
  b = W.call('assessTask', ['asha@fsksurat.in', '1.4', 'exempt', '', '4 years as a school counsellor']);
  assert.strictEqual(b.trainees.find(x => x.id === 'asha@fsksurat.in').p['1.4'].status, 'exempt');
});

t('readiness: gates -> eligible -> confirm; independent is admin only; failing a gate later flags review', () => {
  W.as(ADMIN);
  const gatesUpTo = c => W.call('getBootstrap').tasks.filter(x => x.gate && x.active && x.cycle <= c).map(x => x.id);
  throwsMsg(() => W.api.confirmReadiness('bina@fsksurat.in', 'supervised', ''), /gates/);
  gatesUpTo(2).forEach(id => W.call('assessTask', ['bina@fsksurat.in', id, 'complete', 3, '']));   // Bina is Urgent: Phase 1 gates only
  let b = W.call('getBootstrap'), bina = b.trainees.find(x => x.id === 'bina@fsksurat.in');
  assert.strictEqual(bina.stats.eligible, 'supervised'); assert.strictEqual(bina.stats.effective, 'notcleared');
  b = W.call('confirmReadiness', ['bina@fsksurat.in', 'supervised', 'Urgent cover for Grade 6']);
  bina = b.trainees.find(x => x.id === 'bina@fsksurat.in'); assert.strictEqual(bina.stats.effective, 'supervised'); assert.strictEqual(bina.confirmedBy, 'Richa Panchal');
  W.as('tl@fsksurat.in'); throwsMsg(() => W.api.confirmReadiness('bina@fsksurat.in', 'independent', ''), /Principal or an admin/);
  W.as(ADMIN); W.call('assessTask', ['bina@fsksurat.in', '1.3', 'rework', 2, 'Redo scenario 4']);
  bina = W.call('getBootstrap').trainees.find(x => x.id === 'bina@fsksurat.in');
  assert.ok(bina.stats.needsReview); assert.strictEqual(bina.stats.effective, 'notcleared');
  W.call('confirmReadiness', ['bina@fsksurat.in', 'notcleared', 'Withdrawn pending redo']);
});
t('independent clearance end to end: every gate passed, then the admin signs off', () => {
  W.as(ADMIN);
  W.call('enrolTrainee', ['Chitra', 'chitra@fsksurat.in', [], 'Experienced', '2026-10-05']);
  W.call('getBootstrap').tasks.filter(x => x.gate).forEach(x => W.call('assessTask', ['chitra@fsksurat.in', x.id, 'complete', 4, '']));
  const b = W.call('confirmReadiness', ['chitra@fsksurat.in', 'independent', 'Signed off']);
  assert.strictEqual(b.trainees.find(x => x.id === 'chitra@fsksurat.in').stats.effective, 'independent');
});

t('module editing: topic, task add/edit/archive, resources, settings', () => {
  W.as(ADMIN);
  let b = W.call('saveTask', [{ id: '2.7', topic: 2, cycle: 4, name: 'New task', type: 'Practice', weight: 2, gate: true, what: 'w', standard: 's', evidence: 'e' }, true]);
  assert.ok(b.tasks.find(x => x.id === '2.7' && x.gate && x.mandatory));
  throwsMsg(() => W.api.saveTask({ id: '2.7', topic: 2, cycle: 4, name: 'dup', type: 'Practice', weight: 1 }, true), /already exists/);
  throwsMsg(() => W.api.saveTask({ id: '2.8', topic: 2, cycle: 99, name: 'x', type: 'Practice', weight: 1 }, true), /Cycle must be/);
  throwsMsg(() => W.api.saveTask({ id: 'abc', topic: 2, cycle: 1, name: 'x', type: 'Practice', weight: 1 }, true), /Task ID/);
  b = W.call('saveTask', [{ id: '2.7', topic: 2, cycle: 5, name: 'Renamed', type: 'Practice', weight: 2, gate: false }, false]);
  assert.strictEqual(b.tasks.find(x => x.id === '2.7').name, 'Renamed');
  b = W.call('setTaskActive', ['2.7', false]); assert.strictEqual(b.tasks.find(x => x.id === '2.7').active, false);
  assert.strictEqual(b.trainees[0].stats.gatesTotal, 38, 'archived task leaves the gate list');
  b = W.call('saveResources', [5, '5.12', [{ label: 'Course', url: 'https://x.example/c', note: 'Rs 7,000' }]]);
  assert.strictEqual(b.res.filter(r => r.task === '5.12').length, 1);
  b = W.call('saveResources', [5, '5.12', [{ label: 'Course', url: 'https://x.example/c', note: '' }, { label: 'Answer key', url: 'https://x.example/key', staffOnly: true }]]);
  assert.strictEqual(b.res.filter(r => r.task === '5.12').length, 2, 'staff see the Team Leader-only resource');
  W.as('asha@fsksurat.in'); const tb = W.call('getBootstrap', []);
  assert.ok(!JSON.stringify(tb.res).includes('x.example/key') && tb.res.some(r => r.label === 'Course'), 'a trainee never receives a Team Leaders only resource');
  W.as('richa.panchal@fsksurat.in');
  throwsMsg(() => W.api.saveResources(5, '', [{ label: 'x', url: 'javascript:alert(1)' }]), /http/);
  b = W.call('saveTopic', [{ id: 9, name: 'Professional Learning & Applied Resources', w: 3, note: 'edited' }]);
  assert.strictEqual(b.topics.find(x => x.id === 9).note, 'edited');
  b = W.call('saveTopic', [{ name: 'Extra', w: 0 }]); assert.strictEqual(b.topics.length, 11);
  throwsMsg(() => W.api.saveSettings({ cycles: 10, daysPerCycle: 6, passScore: 5, supervisedGateCycle: 5, urgentGateCycle: 2, maxUploadMb: 10 }, []), /passScore/);
  b = W.call('saveSettings', [{ cycles: 10, daysPerCycle: 6, passScore: 3, supervisedGateCycle: 4, urgentGateCycle: 2, maxUploadMb: 10 }, [{ name: 'All', from: 1, to: 10 }]]);
  assert.strictEqual(b.config.supervisedGateCycle, 4); assert.strictEqual(b.config.phases.length, 1);
});

t('staff safeguards: cannot remove yourself or the last admin; removing staff clears assignments', () => {
  W.as(ADMIN);
  throwsMsg(() => W.api.removeStaff(ADMIN), /yourself/);
  throwsMsg(() => W.api.saveStaff(ADMIN, 'Richa', 'Assessor'), /at least one admin/);
  const b = W.call('removeStaff', ['tl@fsksurat.in']);
  assert.deepStrictEqual(b.trainees.find(x => x.id === 'asha@fsksurat.in').assessors, []);
});
t('a bad start date in the Sheet never crashes the app (it used to: RangeError Invalid time value)', () => {
  W.as(ADMIN);
  W.call('enrolTrainee', ['Dateless', 'dateless@fsksurat.in', [], 'Standard', '2026-10-05']);
  const row = W.sheets.Trainees.cells.findIndex(r => r[0] === 'dateless@fsksurat.in') + 1;
  const start = v => { W.sheets.Trainees.set(row, 4, v); return W.call('getBootstrap').trainees.find(x => x.id === 'dateless@fsksurat.in'); };
  assert.strictEqual(start('5/10/2026').start, '2026-10-05');
  assert.strictEqual(start('5/10/2026').cal.length, 10);
  ['tomorrow', 'Mon Oct 05 2026', '31/02/2026', ''].forEach(v => { const tr = start(v); assert.strictEqual(tr.start, ''); assert.strictEqual(tr.cal.length, 0); assert.strictEqual(tr.stats.calendarState, 'unknown'); });
  assert.strictEqual(W.call('getBootstrap').trainees.length >= 4, true, 'other trainees still load');
  assert.throws(() => W.api.updateTrainee('dateless@fsksurat.in', { start: 'soon' }), /valid date/);
  assert.strictEqual(W.call('updateTrainee', ['dateless@fsksurat.in', { start: '12/10/2026' }]).trainees.find(x => x.id === 'dateless@fsksurat.in').start, '2026-10-12');
});
t('trainee archive: archived trainee loses access', () => {
  W.as(ADMIN); W.call('updateTrainee', ['bina@fsksurat.in', { active: false }]);
  W.as('bina@fsksurat.in'); assert.strictEqual(W.call('getBootstrap').me.role, 'None');
});
t('activity log records who did what and only admins can read it', () => {
  W.as(ADMIN); const log = W.call('getActivityLog'); assert.ok(log.length > 20);
  assert.ok(log.some(l => l.action === 'Assessed' && l.detail.includes('->')));
  W.as('asha@fsksurat.in'); throwsMsg(() => W.api.getActivityLog(), /admin/);
});
t('typed text starting with = is stored as text, not a formula (cell format is plain text)', () => {
  W.as('asha@fsksurat.in'); W.call('saveMyTask', ['2.1', 'save', '=HYPERLINK("http://evil")', '+cmd']);
  const row = W.sheets.Progress.cells.find(r => r[1] === '2.1'); assert.strictEqual(row[3], '=HYPERLINK("http://evil")');
});

{
  const c = (text, url, chip) => ({ text: text, url: url || '', chip: !!chip });
  const lrow = (id, type, name, who, url) => [c(id), c('t'), c('x'), c('p'), c('1'), c('Practice'), c('d'), c(type), c(name), c(who), c('title', url, true)];
  const lhead = ['Task ID', 'Task / Activity', 'Training Topic', 'Phase', 'Cycle', 'Task Type', 'Task Description', 'Link Type', 'Link Name', 'Who Can See It', 'Link'].map(x => c(x));
  W.state.cellGrids = {
    '1iVexQk5tSoIJUfGkfsWHxm3YdZ16T5X7THV_SN2HuKo': [lhead,
      lrow('SAFE-01', 'Task sheet', 'SAFE-01 Role map – trainee task sheet', 'Trainee', 'https://docs.google.com/document/d/AAA/edit'),
      lrow('SAFE-01', 'Team Leader key', 'SAFE-01 – Team Leader key', 'Team Leader only', 'https://docs.google.com/document/d/KEY/edit'),
      lrow('STU-12', 'Tool card', 'Tool 02 – OARS', 'Trainee', 'https://docs.google.com/document/d/OARS/edit'),
      lrow('NEW-1', 'Task sheet', 'Only in the workbook', 'Trainee', 'https://docs.google.com/document/d/NEW/edit'),
      lrow('SAFE-02', 'Tool card', 'No link yet', 'Trainee', '')],
    '1FhQ9YXTp96HwZGdZIgz38cVbD20R5ZQ6xwPsQr_2BWY': [['Task ID', 'Old Task (Team Leader only)'].map(x => c(x)),
      [c('SAFE-01'), c('1.1 Role Mapping')], [c('SAFE-02'), c('')], [c('STU-12'), c('5.1–5.2 Observe; 5.10 Role Play')], [c('NEW-1'), c('')]]
  };
  t('task links: old-task mapping, ranges, Team Leaders only, skips, and safe to run twice', () => {
    assert.deepStrictEqual(Array.from(W.api.oldTaskIds_('5.1–5.3 Observe; 5.15 Feedback')), ['5.1', '5.2', '5.3', '5.15']);
    W.as('richa.panchal@fsksurat.in');
    const dry = W.call('importTaskLinks', []);
    assert.strictEqual(dry.wouldAdd, 5); assert.strictEqual(dry.written, false);
    assert.ok(dry.warnings.some(w => /NEW-1 is new in the workbook/.test(w)) && dry.warnings.some(w => /has no link in it/.test(w)));
    assert.strictEqual(W.call('getBootstrap', []).res.filter(r => /AAA|KEY|OARS/.test(r.url)).length, 0, 'a dry run writes nothing');
    const done = W.call('importTaskLinks', [false]); assert.strictEqual(done.written, true);
    let b = W.call('getBootstrap', []);
    assert.ok(b.res.some(r => r.task === '1.1' && r.label === 'Role map – trainee task sheet' && r.note === 'Task sheet'));
    assert.ok(b.res.some(r => r.task === '1.1' && r.staffOnly), 'staff see the Team Leader key');
    assert.deepStrictEqual(b.res.filter(r => /OARS/.test(r.url)).map(r => r.task).sort(), ['5.1', '5.10', '5.2']);
    W.as('asha@fsksurat.in'); b = W.call('getBootstrap', []);
    assert.ok(b.res.some(r => r.task === '1.1') && !JSON.stringify(b.res).includes('/KEY/'), 'a trainee never receives the key');
    W.as('richa.panchal@fsksurat.in');
    assert.strictEqual(W.call('importTaskLinks', [false]).wouldAdd, 0, 'running again adds nothing');
    W.as('asha@fsksurat.in'); assert.throws(() => W.api.importTaskLinks(false), /admin/i);
  });
}

console.log('\n' + n + ' server tests passed');
