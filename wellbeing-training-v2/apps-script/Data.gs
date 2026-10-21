/**
 * Reading and writing the Google Sheet that is the app's database.
 * Sheet cells are plain text, so typed text is never read as a formula.
 */

function ss_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('The app is not set up yet. Run setup() from the Apps Script editor.');
  return SpreadsheetApp.openById(id);
}
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('The ' + name + ' tab is missing. Run setup() again.');
  return sh;
}
function rows_(name) {
  const sh = sheet_(name), w = SHEETS[name].length;
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues().filter(r => String(r[0]).trim() !== '').map(r => r.map(v => v == null ? '' : v));
}
function findRow_(name, cols, vals) {
  const sh = sheet_(name);
  if (sh.getLastRow() < 2) return 0;
  const w = Math.max.apply(null, cols) + 1, data = sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues();
  const want = vals.map(v => String(v).trim().toLowerCase());
  for (let i = 0; i < data.length; i++) {
    if (cols.every((c, j) => String(data[i][c]).trim().toLowerCase() === want[j])) return i + 2;
  }
  return 0;
}
function upsert_(name, cols, vals, row) {
  const sh = sheet_(name), at = findRow_(name, cols, vals);
  sh.getRange(at || Math.max(sh.getLastRow(), 1) + 1, 1, 1, row.length).setValues([row]);
}
function appendRow_(name, row) { sheet_(name).appendRow(row); }
function replaceRows_(name, rows) {
  const sh = sheet_(name), w = SHEETS[name].length;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, w).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, w).setValues(rows);
}

const todayIso_ = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
const nowStamp_ = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
function jsonOf_(v, d) { try { const x = JSON.parse(v || ''); return x == null ? d : x; } catch (e) { return d; } }

/** R30: every change to ratings, readiness, clearance, the task list and other records is kept: who, when, old and new value. */
function logChange_(me, table, record, field, oldV, newV) {
  appendRow_('History', [nowStamp_(), me.email || '', table, String(record), String(field), String(oldV == null ? '' : oldV).slice(0, 500), String(newV == null ? '' : newV).slice(0, 500)]);
}

/* ---------------- row <-> object ---------------- */

const ATTEMPT_KEYS = ['id', 'trainee', 'task', 'no', 'status', 'source', 'submitted', 'evidence', 'files', 'anon', 'reflection', 'question', 'hours',
  'obsType', 'version', 'assessed', 'score', 'rubric', 'flag', 'flagNote', 'feedback', 'goal', 'reworkRequired', 'reworkDue', 'processConfirmed',
  'processDate', 'processNote', 'processBy', 'released', 'assessedBy', 'tlNotes', 'seen'];

function attemptFromRow_(r) {
  const o = {}; ATTEMPT_KEYS.forEach((k, i) => { o[k] = r[i] == null ? '' : r[i]; });
  o.trainee = norm_(o.trainee); o.task = String(o.task).trim(); o.no = blank_(o.no) ? null : num_(o.no, null);
  o.files = jsonOf_(o.files, []); o.rubric = jsonOf_(o.rubric, {}); o.hours = blank_(o.hours) ? null : num_(o.hours, null);
  ['anon', 'flag', 'reworkRequired', 'released', 'seen'].forEach(k => { o[k] = yes_(o[k]); });
  o.status = ['Draft', 'Submitted', 'Rated'].indexOf(o.status) > -1 ? o.status : 'Submitted';
  o.score = String(o.score); o.processConfirmed = String(o.processConfirmed);
  return o;
}
function attemptToRow_(a) {
  return ATTEMPT_KEYS.map(k => {
    const v = a[k];
    if (k === 'files' || k === 'rubric') return JSON.stringify(v || (k === 'files' ? [] : {}));
    if (['anon', 'flag', 'reworkRequired', 'released', 'seen'].indexOf(k) > -1) return yn_(!!v);
    return v == null ? '' : v;
  });
}
function traineeFromRow_(r) {
  return {
    id: String(r[0]), name: String(r[1]), email: norm_(r[2]), section: SECTIONS.indexOf(r[3]) > -1 ? r[3] : 'Senior School', start: normaliseDate_(r[4]),
    tl: norm_(r[5]), principal: norm_(r[6]), caseReadiness: READINESS.indexOf(r[7]) > -1 ? r[7] : 'Not Cleared', status: ['Active', 'Extended', 'Completed', 'Left'].indexOf(r[8]) > -1 ? r[8] : 'Active',
    cases: num_(r[9], 0), groups: num_(r[10], 0), decision: DECISIONS.indexOf(r[11]) > -1 ? r[11] : 'Pending', decisionDate: normaliseDate_(r[12]),
    conditions: String(r[13] || ''), signoffDate: normaliseDate_(r[14]), background: String(r[15] || ''), entryNotes: String(r[16] || ''), extensionNotes: String(r[17] || '')
  };
}
function traineeToRow_(t) {
  return [t.id, t.name, t.email, t.section, t.start, t.tl, t.principal, t.caseReadiness, t.status, t.cases, t.groups, t.decision, t.decisionDate,
          t.conditions, t.signoffDate, t.background, t.entryNotes, t.extensionNotes];
}
function behaviourFromRow_(r) {
  const items = [2, 3, 4, 5, 6, 7].map(i => blank_(r[i]) ? null : num_(r[i], null));
  return { trainee: norm_(r[0]), cycle: num_(r[1], 0), items: items, comments: String(r[8] || ''), goal: String(r[9] || ''), reliability: String(r[10] || ''),
           self: jsonOf_(r[11], []), released: yes_(r[12]), tlNotes: String(r[13] || '') };
}
function behaviourToRow_(b) {
  return [b.trainee, b.cycle].concat(b.items.map(x => x == null ? '' : x), [b.comments, b.goal, b.reliability, JSON.stringify(b.self || []), yn_(!!b.released), b.tlNotes]);
}

/* ---------------- the whole database as plain objects ---------------- */

function readDb_() {
  const settings = {};
  Object.keys(SETTING_DEFS).forEach(k => { settings[k] = SETTING_DEFS[k][0]; });
  rows_('Settings').forEach(r => { const k = String(r[0]).trim(); if (k in SETTING_DEFS) settings[k] = typeof SETTING_DEFS[k][0] === 'number' ? num_(r[1], SETTING_DEFS[k][0]) : String(r[1] == null ? '' : r[1]); });

  const rawTasks = rows_('Tasks').map(r => { const o = {}; TASK_KEYS.forEach((k, i) => { o[k] = r[i] == null ? '' : String(r[i]); }); return o; });
  const milestones = {};
  rows_('Milestones').forEach(r => { const m = num_(String(r[0]).replace(/\D/g, ''), 0); if (m) milestones[m] = { deadline: num_(r[1], MILESTONE_DEADLINES[m] || 0), focus: String(r[2] || ''), readiness: String(r[3] || '') }; });
  const db = {
    settings: settings,
    users: rows_('Users').map(r => Object.assign({ email: norm_(r[0]), name: String(r[1] || r[0]), role: String(r[2]), active: String(r[3]).trim() === '' ? true : yes_(r[3]) }, roleInfo_(r[2]))),
    trainees: rows_('Trainees').map(traineeFromRow_),
    entry: {}, rawTasks: rawTasks, tasks: rawTasks.map(r => normTask_(r, settings)), milestones: milestones,
    keySkills: rows_('KeySkills').map(r => ({ n: num_(String(r[0]).replace(/\D/g, ''), 0), name: String(r[1] || ''), linked: idList_(r[2]), rule: String(r[3] || ''), rubric: String(r[4] || ''), rubricLink: String(r[5] || '') })),
    toolkit: rows_('Toolkit').map(r => ({ n: num_(String(r[0]).replace(/\D/g, ''), 0), name: String(r[1] || ''), group: String(r[2] || ''), level: String(r[3] || ''), usedIn: String(r[4] || ''), link: String(r[5] || '') })),
    rubrics: rows_('Rubrics').map(r => ({ rubric: String(r[0]), criterion: String(r[1] || ''), levels: [2, 3, 4, 5].map(i => String(r[i] || '')) })),
    policies: rows_('Policies').map(r => ({ name: String(r[0]), link: String(r[1] || ''), updated: normaliseDate_(r[2]) })),
    holidays: rows_('Holidays').map(r => normaliseDate_(r[0])).filter(Boolean),
    attempts: rows_('Attempts').map(attemptFromRow_), taskDates: {}, acks: {}, behaviour: {},
    supervision: rows_('Supervision').map(r => ({ id: String(r[0]), trainee: norm_(r[1]), date: normaliseDate_(r[2]), type: String(r[3]), code: String(r[4] || ''), supervisor: norm_(r[5]), notes: String(r[6] || '') }))
  };
  db.holidaySet = holidaySet_(db.holidays);
  rows_('EntryCheck').forEach(r => { const e = norm_(r[0]); (db.entry[e] = db.entry[e] || {})[String(r[1])] = { rating: blank_(r[2]) ? null : num_(r[2], null), pathway: String(r[3] || ''), notes: String(r[4] || '') }; });
  rows_('TaskDates').forEach(r => { const e = norm_(r[0]); (db.taskDates[e] = db.taskDates[e] || {})[String(r[1]).trim()] = { planned: normaliseDate_(r[2]), dueOverride: normaliseDate_(r[3]) }; });
  rows_('PolicyAcks').forEach(r => { const e = norm_(r[0]); (db.acks[e] = db.acks[e] || []).push({ policy: String(r[1]), updated: normaliseDate_(r[2]), at: String(r[3] || '') }); });
  rows_('Behaviour').forEach(r => { const b = behaviourFromRow_(r); (db.behaviour[b.trainee] = db.behaviour[b.trainee] || []).push(b); });
  return db;
}

/** The ctx that Rules.gs needs. */
function rulesCtx_(db) {
  return { tasks: db.tasks, milestones: db.milestones, keySkills: db.keySkills, settings: db.settings, holidays: db.holidays };
}
function traineeData_(db, email) {
  return { attempts: db.attempts.filter(a => a.trainee === email), taskDates: db.taskDates[email] || {}, entry: db.entry[email] || {}, behaviour: db.behaviour[email] || [] };
}
function computeFor_(db, tr, todayIso) { return computeTrainee_(rulesCtx_(db), tr, traineeData_(db, tr.email), todayIso); }

/** Who is signed in, from their Google email: staff by role, otherwise an enrolled trainee. */
function meFromDb_(db) {
  const email = norm_(Session.getActiveUser().getEmail());
  if (!email) return { email: '', kind: 'none', section: '', role: 'None' };
  const u = db.users.find(x => x.email === email && x.active);
  if (u) return { email: email, name: u.name, kind: u.kind, section: u.section, role: u.role };
  const tr = db.trainees.find(x => x.email === email);
  if (tr) return { email: email, name: tr.name, kind: 'trainee', section: tr.section, role: ROLE.TRAINEE, readOnly: tr.status === 'Completed' || tr.status === 'Left' };
  return { email: email, kind: 'none', section: '', role: 'None' };
}
