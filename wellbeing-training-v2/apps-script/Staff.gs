/**
 * What the team can do: Team Leaders (own section only), the Campus Operations Coordinator and Principals.
 * Every change to a rating, readiness, clearance or the task list is written to History (R30).
 */

/* ---------------- ratings ---------------- */

function validateRating_(t, f) {
  const out = { score: '', rubric: {} };
  if (t.method === 'score') {
    const s = num_(f.score, null); if (s === null || s < 1 || s > 4 || Math.floor(s) !== s) throw new Error('Give a score from 1 to 4.');
    out.score = String(s);
  } else if (t.method === 'complete') {
    if (!/^(complete|not complete)$/i.test(String(f.score))) throw new Error('Choose Complete or Not complete.');
    out.score = /^complete$/i.test(String(f.score)) ? 'Complete' : 'Not complete';
  } else if (t.method === 'percent') {
    const s = num_(f.score, null); if (s === null || s < 0 || s > 100) throw new Error('Give a percentage from 0 to 100.');
    out.score = String(s);
    (t.requiredItems || []).forEach(q => { out.rubric['q' + q] = !!(f.rubric && f.rubric['q' + q]); });
  } else throw new Error('This task is not rated.');
  if (f.rubric) Object.keys(f.rubric).forEach(k => { if (/^c\d+$/.test(k)) { const n = num_(f.rubric[k], 0); if (n >= 1 && n <= 4) out.rubric[k] = n; } });
  return out;
}

/** R11-R15: rate a submitted attempt. A Safety Flag always requires rework and cannot pass, whatever the score. */
function rateAttempt(attemptId, f) {
  return withLock_(() => {
    const c = staffCtx_(['tl']), a = attemptOf_(c.db, attemptId), tr = ownTrainee_(c, a.trainee), t = taskOf_(c.db, a.task);
    if (a.status === 'Draft') throw new Error('This has not been submitted yet.');
    return applyRating_(c, a, tr, t, f || {});
  });
}
function applyRating_(c, a, tr, t, f) {
  const r = validateRating_(t, f), before = a.status === 'Rated' ? a.score + (a.flag ? ' + flag' : '') : '';
  a.score = r.score; a.rubric = r.rubric; a.status = 'Rated'; a.assessed = c.today; a.assessedBy = c.me.email;
  a.obsType = OBS_TYPES.indexOf(f.obsType) > -1 ? f.obsType : (a.obsType || t.obsType);
  a.flag = !!f.flag; a.flagNote = a.flag ? str_(f.flagNote, 1000) : '';
  if (a.flag && blank_(a.flagNote)) throw new Error('Please say briefly what the Safety Flag is about.');
  a.feedback = str_(f.feedback, 8000); a.goal = str_(f.goal, 1000); a.tlNotes = str_(f.tlNotes, 4000);
  const meets = ratingMeets_(t, a);
  a.reworkRequired = a.flag || !meets;                                                     // R13
  a.reworkDue = a.reworkRequired ? normaliseDate_(f.reworkDue) : '';
  if (t.joint) { if (!a.processConfirmed) a.processConfirmed = ''; }                       // R16: the Coordinator confirms the process
  a.released = !!f.release;                                                                // R15
  saveAttempt_(a);
  logChange_(c.me, 'Attempts', a.id, 'rating', before, a.score + (a.flag ? ' + Safety Flag' : '') + (a.released ? ' (released)' : ' (not released)'));
  return getBootstrap();
}

/** An observed task (role play, viva, real session) rated without the trainee submitting anything first. */
function recordObserved(email, taskId, f) {
  return withLock_(() => {
    const c = staffCtx_(['tl']), tr = ownTrainee_(c, email), t = taskOf_(c.db, taskId);
    const st = computeFor_(c.db, tr, c.today).tasks[t.id];
    if (!st.canSubmit) throw new Error(st.status === 'soon' ? 'This task is coming soon.' : st.status === 'locked' ? 'This task is still locked for this trainee.' : 'This task is not open for a new attempt.');
    const a = { id: newId_('A'), trainee: tr.email, task: t.id, no: st.used + 1, status: 'Submitted', source: 'Observed', submitted: nowStamp_(), evidence: '', files: [], anon: true,
                reflection: '', question: '', hours: null, obsType: '', version: st.nextVersion, assessed: '', score: '', rubric: {}, flag: false, flagNote: '', feedback: '', goal: '',
                reworkRequired: false, reworkDue: '', processConfirmed: '', processDate: '', processNote: '', processBy: '', released: false, assessedBy: '', tlNotes: '', seen: false };
    return applyRating_(c, a, tr, t, f || {});
  });
}

function releaseRating(attemptId, release) {
  return withLock_(() => {
    const c = staffCtx_(['tl']), a = attemptOf_(c.db, attemptId); ownTrainee_(c, a.trainee);
    if (a.status !== 'Rated') throw new Error('Rate it first.');
    a.released = !!release; saveAttempt_(a);
    logChange_(c.me, 'Attempts', a.id, 'released', yn_(!release), yn_(!!release));
    return getBootstrap();
  });
}

/** R16: the Coordinator confirms the process was followed on a jointly assessed task (rated tasks only; no scores or feedback are shown to them). */
function confirmProcess(attemptId, ok, note) {
  return withLock_(() => {
    const c = staffCtx_(['coord']), a = attemptOf_(c.db, attemptId), t = c.db.tasks.find(x => x.id === a.task);
    if (!t || !t.joint) throw new Error('This task is not jointly assessed.');
    if (a.status !== 'Rated') throw new Error('The Team Leader has not rated this yet.');
    a.processConfirmed = ok ? 'Yes' : 'No'; a.processNote = str_(note, 1000); a.processDate = c.today; a.processBy = c.me.email;
    saveAttempt_(a);
    logChange_(c.me, 'Attempts', a.id, 'process confirmed', '', a.processConfirmed);
    return getBootstrap();
  });
}

/* ---------------- a trainee's setup ---------------- */

/** R10: the entry check. "Show quickly" lets the trainee skip prerequisites on fast-track tasks (never gates). */
function setEntryCheck(email, area, rating, pathway, notes) {
  return withLock_(() => {
    const c = staffCtx_(['tl']), tr = ownTrainee_(c, email);
    if (AREAS.indexOf(area) < 0) throw new Error('Unknown area.');
    if (PATHWAYS.indexOf(pathway) < 0) throw new Error('Choose Focus or Show quickly.');
    const r = blank_(rating) ? '' : num_(rating, null); if (r !== '' && (r === null || r < 1 || r > 4)) throw new Error('Rating must be 1 to 4.');
    const old = ((c.db.entry[tr.email] || {})[area] || {}).pathway || '';
    upsert_('EntryCheck', [0, 1], [tr.email, area], [tr.email, area, r, pathway, str_(notes, 2000)]);
    logChange_(c.me, 'EntryCheck', tr.email + ' / ' + area, 'pathway', old, pathway);
    return getBootstrap();
  });
}

/** R8: a Team Leader can move one trainee's due date for one task. */
function setDueOverride(email, taskId, date) {
  return withLock_(() => {
    const c = staffCtx_(['tl']), tr = ownTrainee_(c, email), t = taskOf_(c.db, taskId), iso = blank_(date) ? '' : normaliseDate_(date);
    if (!blank_(date) && !iso) throw new Error('That date is not valid.');
    const cur = (c.db.taskDates[tr.email] || {})[t.id] || {};
    upsert_('TaskDates', [0, 1], [tr.email, t.id], [tr.email, t.id, cur.planned || '', iso]);
    logChange_(c.me, 'TaskDates', tr.email + ' / ' + t.id, 'due', cur.dueOverride || '', iso);
    return getBootstrap();
  });
}

const TRAINEE_EDITABLE = ['name', 'tl', 'principal', 'start', 'status', 'cases', 'groups', 'background', 'entryNotes', 'extensionNotes'];

function enrolTrainee(f) {
  return withLock_(() => {
    const c = staffCtx_(['tl', 'coord']), email = norm_(f.email);
    if (!/^[^@\s]+@fsksurat\.in$/.test(email)) throw new Error('Use the trainee’s fsksurat.in email.');
    if (c.db.trainees.some(x => x.email === email) || c.db.users.some(x => x.email === email)) throw new Error('That email is already in the app.');
    const section = c.me.kind === 'tl' ? c.me.section : f.section;
    if (SECTIONS.indexOf(section) < 0) throw new Error('Choose a section.');
    const start = normaliseDate_(f.start); if (!start) throw new Error('Enter a valid start date.');
    const tl = c.db.users.find(u => u.kind === 'tl' && u.section === section && u.active), pr = c.db.users.find(u => u.kind === 'principal' && u.section === section && u.active);
    const tr = { id: 'T' + String(c.db.trainees.length + 1).padStart(3, '0'), name: str_(f.name, 120), email: email, section: section, start: start, tl: c.me.kind === 'tl' ? c.me.email : (tl ? tl.email : ''),
                 principal: pr ? pr.email : '', caseReadiness: 'Not Cleared', status: 'Active', cases: 0, groups: 0, decision: 'Pending', decisionDate: '', conditions: '', signoffDate: '', background: '', entryNotes: '', extensionNotes: '' };
    if (!tr.name) throw new Error('Enter a name.');
    saveTrainee_(tr); logChange_(c.me, 'Trainees', email, 'enrolled', '', section);
    return getBootstrap();
  });
}

function updateTrainee(email, f) {
  return withLock_(() => {
    const c = staffCtx_(['tl']), tr = ownTrainee_(c, email, true);
    Object.keys(f || {}).forEach(k => {
      if (TRAINEE_EDITABLE.indexOf(k) < 0) return;
      let v = f[k];
      if (k === 'start') { v = normaliseDate_(v); if (!v) throw new Error('That start date is not valid.'); }
      else if (k === 'status') { if (['Active', 'Extended', 'Completed', 'Left'].indexOf(v) < 0) throw new Error('Unknown status.'); }
      else if (k === 'cases' || k === 'groups') v = num_(v, 0);
      else if (k === 'tl' || k === 'principal') v = norm_(v);
      else v = str_(v, 4000);
      if (String(tr[k]) !== String(v)) { logChange_(c.me, 'Trainees', tr.email, k, k.match(/Notes|background/i) ? '' : tr[k], k.match(/Notes|background/i) ? '(edited)' : v); tr[k] = v; }
    });
    saveTrainee_(tr);
    return getBootstrap();
  });
}

/** R7: the Team Leader confirms Supervised Practice once the trainee is eligible. */
function confirmSupervised(email) {
  return withLock_(() => {
    const c = staffCtx_(['tl']), tr = ownTrainee_(c, email);
    if (tr.caseReadiness !== 'Not Cleared') throw new Error('This trainee is already past Not Cleared.');
    if (!computeFor_(c.db, tr, c.today).supervised.eligible) throw new Error('This trainee is not yet eligible for Supervised Practice.');
    tr.caseReadiness = 'Supervised Practice'; saveTrainee_(tr);
    logChange_(c.me, 'Trainees', tr.email, 'case readiness', 'Not Cleared', 'Supervised Practice');
    return getBootstrap();
  });
}

/** R21: the Team Leader records the clearance recommendation; it cannot be Cleared until every clearance check is met. */
function recordClearance(email, decision, conditions) {
  return withLock_(() => {
    const c = staffCtx_(['tl']), tr = ownTrainee_(c, email);
    if (DECISIONS.indexOf(decision) < 0) throw new Error('Unknown decision.');
    if (/^cleared/i.test(decision) && !computeFor_(c.db, tr, c.today).clearance.eligible) throw new Error('Not every clearance check is met yet, so this trainee cannot be cleared.');
    if (decision === 'Cleared with conditions' && blank_(conditions)) throw new Error('Please write the conditions.');
    logChange_(c.me, 'Trainees', tr.email, 'clearance decision', tr.decision, decision);
    tr.decision = decision; tr.decisionDate = c.today; tr.conditions = decision === 'Cleared with conditions' ? str_(conditions, 2000) : ''; tr.signoffDate = '';
    saveTrainee_(tr);
    return getBootstrap();
  });
}

/** The Principal of the trainee's section signs off a cleared trainee; they become Independent and the record closes (R31). */
function principalSignOff(email) {
  return withLock_(() => {
    const c = staffCtx_(['principal']), tr = c.db.trainees.find(x => x.email === norm_(email));
    if (!tr || tr.section !== c.me.section) throw new Error('You can only sign off trainees of your own section.');
    if (!/^cleared/i.test(tr.decision)) throw new Error('The Team Leader has not cleared this trainee.');
    if (!computeFor_(c.db, tr, c.today).clearance.eligible) throw new Error('The clearance checks are no longer all met.');
    tr.signoffDate = c.today; tr.caseReadiness = 'Independent'; tr.status = 'Completed'; saveTrainee_(tr);
    logChange_(c.me, 'Trainees', tr.email, 'principal sign-off', '', c.today);
    return getBootstrap();
  });
}

/* ---------------- supervision log and caseload (R22) ---------------- */

/** One supervised case or group session. Cases are recorded by an anonymous code only, never a student's name. */
function logSupervision(email, f) {
  return withLock_(() => {
    const c = staffCtx_(['tl']), tr = ownTrainee_(c, email);
    if (tr.caseReadiness === 'Not Cleared') throw new Error('This trainee is not yet cleared for Supervised Practice.');
    if (SUP_TYPES.indexOf(f.type) < 0) throw new Error('Choose Case or Group.');
    const date = normaliseDate_(f.date); if (!date) throw new Error('Enter a valid date.');
    const code = str_(f.code, 40); if (!code) throw new Error('Enter an anonymous case code, not a student name.');
    if (c.db.supervision.some(x => x.trainee === tr.email && x.type === f.type && x.code.toLowerCase() === code.toLowerCase())) throw new Error('That code is already logged for this trainee.');
    const lim = caseLimits_(c.db, tr, computeFor_(c.db, tr, c.today));
    if (f.type === 'Case' && lim.cases >= lim.maxCases) throw new Error('This trainee already has ' + lim.cases + ' cases, the limit' + (lim.milestone4 ? '' : ' before Milestone 4') + '.');
    if (f.type === 'Group' && lim.groups >= lim.maxGroups) throw new Error('This trainee already has ' + lim.groups + ' group, the limit.');
    const id = newId_('S');
    appendRow_('Supervision', [id, tr.email, date, f.type, code, c.me.email, str_(f.notes, 2000)]);
    tr.cases = lim.cases + (f.type === 'Case' ? 1 : 0); tr.groups = lim.groups + (f.type === 'Group' ? 1 : 0); saveTrainee_(tr);
    logChange_(c.me, 'Supervision', tr.email, 'logged ' + f.type, '', code);
    return getBootstrap();
  });
}
function removeSupervision(id) {
  return withLock_(() => {
    const c = staffCtx_(['tl']), e = c.db.supervision.find(x => x.id === String(id));
    if (!e) throw new Error('That entry was not found.');
    const tr = ownTrainee_(c, e.trainee), keep = c.db.supervision.filter(x => x.id !== e.id);
    replaceRows_('Supervision', keep.map(x => [x.id, x.trainee, x.date, x.type, x.code, x.supervisor, x.notes]));
    tr.cases = keep.filter(x => x.trainee === tr.email && x.type === 'Case').length; tr.groups = keep.filter(x => x.trainee === tr.email && x.type === 'Group').length; saveTrainee_(tr);
    logChange_(c.me, 'Supervision', tr.email, 'removed ' + e.type, e.code, '');
    return getBootstrap();
  });
}

/* ---------------- professional behaviour (R20) ---------------- */

function saveBehaviour(email, cycle, f) {
  return withLock_(() => {
    const c = staffCtx_(['tl']), tr = ownTrainee_(c, email), cy = num_(cycle, 0);
    if (cy < 1 || cy > c.db.settings.cycles) throw new Error('That cycle is not valid.');
    const items = (f.items || []).slice(0, 6).map(x => { if (blank_(x)) return null; const n = num_(x, 0); if (n < 1 || n > 4) throw new Error('Behaviour ratings are 1 to 4.'); return n; });
    while (items.length < 6) items.push(null);
    const old = (c.db.behaviour[tr.email] || []).find(x => x.cycle === cy) || { trainee: tr.email, cycle: cy, self: [], reliability: '', released: false };
    if (f.release && items.some(x => x === null)) throw new Error('Rate all six items before releasing.');
    const b = { trainee: tr.email, cycle: cy, items: items, comments: str_(f.comments, 4000), goal: str_(f.goal, 1000), reliability: old.reliability, self: old.self, released: !!f.release, tlNotes: str_(f.tlNotes, 4000) };
    upsert_('Behaviour', [0, 1], [tr.email, cy], behaviourToRow_(b));
    logChange_(c.me, 'Behaviour', tr.email + ' / cycle ' + cy, 'overall', '', String(behaviourOverall_(items)) + (b.released ? ' (released)' : ''));
    return getBootstrap();
  });
}

/** The Coordinator's reliability input for a cycle (attendance, punctuality, follow-through). It feeds the Team Leader's rating but is not a score. */
function saveReliability(email, cycle, text) {
  return withLock_(() => {
    const c = staffCtx_(['coord']), tr = c.db.trainees.find(x => x.email === norm_(email)), cy = num_(cycle, 0);
    if (!tr) throw new Error('That trainee was not found.');
    const b = (c.db.behaviour[tr.email] || []).find(x => x.cycle === cy) || { trainee: tr.email, cycle: cy, items: [null, null, null, null, null, null], comments: '', goal: '', self: [], released: false, tlNotes: '' };
    b.reliability = str_(text, 2000); upsert_('Behaviour', [0, 1], [tr.email, cy], behaviourToRow_(b));
    return getBootstrap();
  });
}

/* ---------------- the task list (R30: edits are logged; tasks are retired, never deleted) ---------------- */

function saveTask(f) {
  return withLock_(() => {
    const c = staffCtx_(['tl', 'coord']), id = str_(f.id, 20);
    if (!id) throw new Error('A task needs an ID.');
    const old = c.db.rawTasks.find(x => x.id === id), row = TASK_KEYS.map(k => k === 'milestoneDeadline' ? '' : str_((f.fields || f)[k] !== undefined ? (f.fields || f)[k] : (old ? old[k] : ''), 20000));
    const rec = {}; TASK_KEYS.forEach((k, i) => { rec[k] = row[i]; });
    if (!old && !/^[A-Z]{2,5}-\d+$/.test(id)) throw new Error('Task IDs look like SAFE-01 or STU-12.');
    const probe = c.db.rawTasks.filter(x => x.id !== id).concat([rec]), problems = validateCatalogue_(probe, c.db.keySkills.map(k => [k.name, k.name, k.linked.join(',')]));
    const mine = problems.filter(p => p.indexOf(id) === 0 || p.indexOf('loop') > -1);
    if (mine.length) throw new Error(mine[0]);
    upsert_('Tasks', [0], [id], row);
    TASK_KEYS.forEach((k, i) => { if (k !== 'milestoneDeadline' && old && String(old[k]) !== row[i]) logChange_(c.me, 'Tasks', id, TASK_HEADERS[i], /long/.test(TASK_FIELDS[i][3]) ? '(edited)' : old[k], /long/.test(TASK_FIELDS[i][3]) ? '(edited)' : row[i]); });
    if (!old) logChange_(c.me, 'Tasks', id, 'added', '', rec.title);
    return getBootstrap();
  });
}
function setTaskActive(id, active) {
  return withLock_(() => {
    const c = staffCtx_(['tl', 'coord']), old = c.db.rawTasks.find(x => x.id === String(id));
    if (!old) throw new Error('That task was not found.');
    const row = TASK_KEYS.map(k => k === 'active' ? yn_(!!active) : old[k]);
    upsert_('Tasks', [0], [old.id], row); logChange_(c.me, 'Tasks', old.id, 'Active', old.active, yn_(!!active));
    return getBootstrap();
  });
}

/* ---------------- administration (Coordinator) ---------------- */

function saveUser(email, name, role, active) {
  return withLock_(() => {
    const c = staffCtx_(['coord']), e = norm_(email);
    if (!/^[^@\s]+@fsksurat\.in$/.test(e)) throw new Error('Use an fsksurat.in email.');
    if (STAFF_ROLES.indexOf(role) < 0) throw new Error('Choose a role.');
    if (c.db.trainees.some(x => x.email === e)) throw new Error('That email belongs to a trainee.');
    const isMe = e === c.me.email;
    if (isMe && (role !== ROLE.COORD || !active)) throw new Error('You cannot remove your own Coordinator access.');
    upsert_('Users', [0], [e], [e, str_(name, 120) || e, role, yn_(active !== false)]);
    logChange_(c.me, 'Users', e, 'role', '', role + (active === false ? ' (inactive)' : ''));
    return getBootstrap();
  });
}
function saveMilestones(rows) {
  return withLock_(() => {
    const c = staffCtx_(['coord']); let prev = 0;
    const out = [1, 2, 3, 4].map(n => {
      const r = (rows || []).find(x => x.n === n) || {}, d = num_(r.deadline, 0);
      if (d <= prev || d > c.db.settings.cycles) throw new Error('Milestone ' + n + ' must end after Milestone ' + (n - 1) + ' and within the ' + c.db.settings.cycles + ' cycles.');
      prev = d; return ['Milestone ' + n, d, str_(r.focus, 500), str_(r.readiness, 200)];
    });
    replaceRows_('Milestones', out); logChange_(c.me, 'Milestones', 'all', 'deadlines', JSON.stringify(c.db.milestones), JSON.stringify(out.map(x => x[1])));
    return getBootstrap();
  });
}
function savePolicy(name, link, updated) {
  return withLock_(() => {
    const c = staffCtx_(['coord']), n = str_(name, 120); if (!n) throw new Error('A policy needs a name.');
    const l = str_(link, 500); if (l && !/^https?:\/\//i.test(l)) throw new Error('The link must start with https://');
    const u = blank_(updated) ? '' : normaliseDate_(updated); if (!blank_(updated) && !u) throw new Error('That date is not valid.');
    upsert_('Policies', [0], [n], [n, l, u]); logChange_(c.me, 'Policies', n, 'updated', '', u);
    return getBootstrap();
  });
}
function saveHolidays(text) {
  return withLock_(() => {
    const c = staffCtx_(['coord']), list = String(text || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean).map(s => { const d = normaliseDate_(s); if (!d) throw new Error('“' + s + '” is not a valid date.'); return d; });
    replaceRows_('Holidays', Array.from(new Set(list)).sort().map(d => [d, '']));
    logChange_(c.me, 'Holidays', 'all', 'dates', '', list.length + ' dates');
    return getBootstrap();
  });
}
function saveSettings(values) {
  return withLock_(() => {
    const c = staffCtx_(['coord']);
    Object.keys(values || {}).forEach(k => {
      if (!(k in SETTING_DEFS) || k === 'workbookId' || k === 'importedAt') return;
      const isNum = typeof SETTING_DEFS[k][0] === 'number', v = isNum ? num_(values[k], null) : str_(values[k], 100);
      if (isNum && (v === null || v < 0)) throw new Error('“' + k + '” must be a number.');
      if (String(c.db.settings[k]) !== String(v)) { setSetting_(k, v); logChange_(c.me, 'Settings', k, 'value', c.db.settings[k], v); }
    });
    return getBootstrap();
  });
}

/* ---------------- exports (R31: the record is kept; a Team Leader can take a copy) ---------------- */

const csvCell_ = v => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const csv_ = rows => rows.map(r => r.map(csvCell_).join(',')).join('\n');

function exportCatalogue() {
  const c = staffCtx_(['tl', 'coord']);
  return { name: 'task-catalogue.csv', text: csv_([TASK_HEADERS].concat(c.db.rawTasks.map(r => TASK_KEYS.map(k => r[k])))) };
}
function exportTraineeRecord(email) {
  const c = staffCtx_(['tl']), tr = c.db.trainees.find(x => x.email === norm_(email));
  if (!tr) throw new Error('That trainee was not found.');
  if (tr.section !== c.me.section) throw new Error('You can export only your own section’s trainees.');
  const rows = [['Task', 'Title', 'Attempt', 'Submitted', 'Assessed', 'Score', 'Safety Flag', 'Released', 'Process confirmed', 'Feedback']];
  c.db.attempts.filter(a => a.trainee === tr.email && a.status !== 'Draft').sort((a, b) => cmpId_(a.task, b.task) || (a.no - b.no)).forEach(a =>
    rows.push([a.task, titleOf_(c.db, a.task), a.no, a.submitted, a.assessed, a.score, yn_(a.flag), yn_(a.released), a.processConfirmed, a.feedback]));
  return { name: 'record-' + tr.name.replace(/\W+/g, '-').toLowerCase() + '.csv', text: csv_(rows) };
}
function getHistory(limit) {
  staffCtx_(['tl', 'coord']);
  const rows = rows_('History'); return rows.slice(-Math.min(num_(limit, 200), 500)).reverse().map(r => ({ time: r[0], by: r[1], table: r[2], record: r[3], field: r[4], old: r[5], new: r[6] }));
}
