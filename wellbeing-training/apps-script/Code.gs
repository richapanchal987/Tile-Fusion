/**
 * Well-being Counsellor Onboarding: Google Apps Script web app
 * Fountainhead Well-being Team (fsksurat.in)
 *
 * Everyone uses the web app only. The Sheet is its database and a private Drive
 * folder holds uploaded evidence; neither is shared with trainees or assessors.
 * See ../README.md for setup.
 */

const CONFIG = {
  APP_NAME: 'Well-being Counsellor Onboarding',
  ORG_NAME: 'Fountainhead Well-being Team',
  DOMAIN: 'fsksurat.in',
  FIRST_ADMIN: 'richa.panchal@fsksurat.in',
  FIRST_ADMIN_NAME: 'Richa Panchal',
  EVIDENCE_FOLDER_NAME: 'Well-being Training Evidence (private)',
  MAX_FILES_PER_TASK: 5
};

// Column order matters: the code reads and writes by position. Do not reorder these in the Sheet.
const SHEETS = {
  Settings: ['Key', 'Value', 'What it does'],
  Phases: ['Phase', 'From cycle', 'To cycle'],
  Topics: ['Topic ID', 'Topic', 'Weight %', 'Internal notes'],
  Tasks: ['Task ID', 'Topic ID', 'Cycle', 'Task', 'Type', 'What the trainee will do', 'Evidence / Output',
          'Competency standard', 'Weight within topic', 'Critical gate', 'Mandatory before independent', 'Active', 'Order'],
  Resources: ['Topic ID', 'Task ID', 'Resource', 'Link', 'Note'],
  Staff: ['Email', 'Name', 'Role'],
  Trainees: ['Email', 'Name', 'Assessors', 'Start date', 'Pathway', 'Active', 'Readiness', 'Readiness set by',
             'Readiness date', 'Readiness note'],
  Progress: ['Trainee', 'Task ID', 'Status', 'Evidence link / reference', 'Files', 'Reflection', 'Score', 'Feedback',
             'Assessed by', 'Date assessed', 'Submitted', 'Last updated'],
  Log: ['Time', 'By', 'Action', 'Trainee', 'Task', 'Detail']
};

const SETTING_HELP = {
  cycles: 'Number of cycles in the programme',
  daysPerCycle: 'Working days in one cycle (Sundays are skipped)',
  passScore: 'Score a critical-gate task needs to count as passed (3 = Competent)',
  supervisedGateCycle: 'Supervised practice unlocks when every critical gate up to this cycle is passed',
  urgentGateCycle: 'Same, for trainees on the Urgent pathway (safety gates first)',
  maxUploadMb: 'Largest evidence file a trainee can upload, in MB'
};

const TASK_TYPES = ['Learning exposure', 'Practice', 'Demonstration', 'Final verification'];

/* ---------------- Setup (run once from the editor) ---------------- */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from the Google Sheet (Extensions > Apps Script) and run setup again.');
  const props = PropertiesService.getScriptProperties();
  const existing = ss.getSheetByName('Staff');
  if (existing && existing.getLastRow() > 1) {
    const caller = norm_(Session.getActiveUser().getEmail());
    const isAdmin = readStaff_().some(s => s.email === caller && s.role === 'Admin');
    if (!isAdmin) throw new Error('Only an admin can run setup again.');
  }
  props.setProperty('SHEET_ID', ss.getId());

  Object.keys(SHEETS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const h = SHEETS[name];
    sh.getRange(1, 1, sh.getMaxRows(), h.length).setNumberFormat('@'); // plain text: typed text is never read as a formula
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#DCEAE6');
    sh.setFrozenRows(1);
  });

  const empty = name => ss.getSheetByName(name).getLastRow() < 2;
  const put = (name, rows) => { if (rows.length) ss.getSheetByName(name).getRange(2, 1, rows.length, rows[0].length).setValues(rows); };
  if (empty('Staff')) put('Staff', [[CONFIG.FIRST_ADMIN, CONFIG.FIRST_ADMIN_NAME, 'Admin']]);
  if (empty('Settings')) put('Settings', Object.keys(SEED.settings).map(k => [k, SEED.settings[k], SETTING_HELP[k] || '']));
  if (empty('Phases')) put('Phases', SEED.phases.map(p => [p.name, p.from, p.to]));
  if (empty('Topics')) put('Topics', SEED.topics.map(t => [t.id, t.name, t.weight, t.note]));
  if (empty('Tasks')) put('Tasks', SEED.tasks.map(taskToRow_));
  if (empty('Resources')) put('Resources', SEED.resources.map(r => [r.topic, r.task, r.label, r.url, r.note]));

  const s1 = ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  evidenceRoot_();
  Logger.log('Setup complete. Now deploy as a web app (Deploy > New deployment > Web app).');
}

/* ---------------- Web app entry ---------------- */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/* ---------------- Sheet access ---------------- */

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
  return sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues().filter(r => String(r[0]).trim() !== '');
}
function findRow_(name, keys) {
  const sh = sheet_(name);
  if (sh.getLastRow() < 2) return 0;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, keys.length).getValues();
  const want = keys.map(k => String(k).trim().toLowerCase());
  for (let i = 0; i < vals.length; i++) {
    if (vals[i].every((v, j) => String(v).trim().toLowerCase() === want[j])) return i + 2;
  }
  return 0;
}
function upsert_(name, keys, row) {
  const sh = sheet_(name), at = findRow_(name, keys);
  const target = at || Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(target, 1, 1, row.length).setValues([row]);
}
function replaceRows_(name, rows) {
  const sh = sheet_(name), w = SHEETS[name].length;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, w).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, w).setValues(rows);
}

const yes_ = v => v === true || /^(yes|true|y)$/i.test(String(v).trim());
const yn_ = b => b ? 'Yes' : 'No';
const num_ = (v, d) => { const n = Number(v); return isFinite(n) && String(v).trim() !== '' ? n : (d === undefined ? 0 : d); };
const str_ = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 2000);
function fmtDate_(d) {
  if (Object.prototype.toString.call(d) === '[object Date]') {
    return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return normaliseDate_(d);
}
const todayIso_ = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
const nowStamp_ = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
function parseFiles_(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

function taskToRow_(t) {
  return [t.id, t.topic, t.cycle, t.name, t.type, t.what, t.evidence, t.standard, t.weight, yn_(t.gate), yn_(t.mandatory), yn_(t.active), t.order];
}
function readStaff_() {
  return rows_('Staff').map(r => ({ email: norm_(r[0]), name: String(r[1] || r[0]), role: /admin/i.test(r[2]) ? 'Admin' : 'Assessor' }));
}

function readDb_() {
  const settings = Object.assign({}, SEED.settings);
  rows_('Settings').forEach(r => { const k = String(r[0]).trim(); if (k in settings) settings[k] = num_(r[1], settings[k]); });
  return {
    settings: settings,
    phases: rows_('Phases').map(r => ({ name: String(r[0]), from: num_(r[1]), to: num_(r[2]) })),
    topics: rows_('Topics').map(r => ({ id: num_(r[0]), name: String(r[1]), weight: num_(r[2]), note: String(r[3] || '') })),
    tasks: rows_('Tasks').map(r => ({
      id: String(r[0]).trim(), topic: num_(r[1]), cycle: num_(r[2], 1), name: String(r[3]), type: String(r[4] || ''),
      what: String(r[5] || ''), evidence: String(r[6] || ''), standard: String(r[7] || ''), weight: num_(r[8]),
      gate: yes_(r[9]), mandatory: yes_(r[10]), active: String(r[11]).trim() === '' ? true : yes_(r[11]), order: num_(r[12], 9999)
    })),
    resources: rows_('Resources').map(r => ({ topic: num_(r[0]), task: String(r[1] || '').trim(), label: String(r[2] || ''), url: String(r[3] || ''), note: String(r[4] || '') })),
    staff: readStaff_(),
    trainees: rows_('Trainees').map(r => ({
      email: norm_(r[0]), name: String(r[1] || r[0]),
      assessors: String(r[2] || '').split(',').map(norm_).filter(Boolean),
      start: fmtDate_(r[3]), pathway: PATHWAYS.indexOf(String(r[4])) > -1 ? String(r[4]) : 'Standard',
      active: String(r[5]).trim() === '' ? true : yes_(r[5]),
      confirmed: LEVELS.indexOf(String(r[6])) > -1 ? String(r[6]) : 'notcleared',
      confirmedBy: String(r[7] || ''), confirmedAt: String(r[8] || ''), confirmNote: String(r[9] || '')
    })),
    progress: rows_('Progress').map(r => ({
      trainee: norm_(r[0]), task: String(r[1]).trim(), status: STATUS_KEY[String(r[2])] || 'not', evidence: String(r[3] || ''),
      files: parseFiles_(r[4]), reflection: String(r[5] || ''), score: num_(r[6], null), feedback: String(r[7] || ''),
      assessor: String(r[8] || ''), date: fmtDate_(r[9]), submitted: String(r[10] || ''), updated: String(r[11] || '')
    }))
  };
}

function meFromDb_(db) {
  const email = norm_(Session.getActiveUser().getEmail());
  if (!email) return { email: '', role: 'None' };
  const st = db.staff.find(s => s.email === email);
  if (st) return { email: email, name: st.name, role: st.role };
  const tr = db.trainees.find(t => t.email === email && t.active);
  if (tr) return { email: email, name: tr.name, role: 'Trainee' };
  return { email: email, role: 'None' };
}

function appConfig_() { return { appName: CONFIG.APP_NAME, orgName: CONFIG.ORG_NAME, domain: CONFIG.DOMAIN, maxFiles: CONFIG.MAX_FILES_PER_TASK, taskTypes: TASK_TYPES, pathways: PATHWAYS }; }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function requireStaff_(me) { if (me.role !== 'Admin' && me.role !== 'Assessor') throw new Error('Only assessors and admins can do this.'); }
function requireAdmin_(me) { if (me.role !== 'Admin') throw new Error('Only an admin can do this.'); }

function logAction_(me, action, trainee, task, detail) {
  sheet_('Log').appendRow([nowStamp_(), me.email, action, trainee || '', task || '', String(detail || '').slice(0, 1000)]);
}

/** Loads the db and the caller, and checks the caller may act on this trainee. */
function context_(traineeEmail) {
  const db = readDb_(), me = meFromDb_(db);
  let tr = null;
  if (traineeEmail !== undefined) {
    tr = db.trainees.find(t => t.email === norm_(traineeEmail));
    if (!tr || !visibleTo_(me, tr)) throw new Error('You do not have access to this trainee.');
  }
  return { db: db, me: me, tr: tr };
}
/** For actions only a trainee can take on their own work. */
function traineeContext_(what) {
  const db = readDb_(), me = meFromDb_(db);
  if (me.role !== 'Trainee') throw new Error('Only trainees can ' + what + '.');
  return { db: db, me: me, tr: db.trainees.find(t => t.email === me.email) };
}
function taskOf_(db, id) {
  const t = db.tasks.find(x => x.id === String(id).trim() && x.active);
  if (!t) throw new Error('That task is not part of the current programme.');
  return t;
}
function progressOf_(db, email, taskId) {
  return db.progress.find(p => p.trainee === email && p.task === taskId) ||
    { trainee: email, task: taskId, status: 'not', evidence: '', files: [], reflection: '', score: null, feedback: '', assessor: '', date: '', submitted: '', updated: '' };
}
function saveProgress_(p) {
  upsert_('Progress', [p.trainee, p.task], [p.trainee, p.task, STATUS_LABEL[p.status], p.evidence, JSON.stringify(p.files || []),
    p.reflection, p.score == null ? '' : p.score, p.feedback, p.assessor, p.date, p.submitted, p.updated]);
}
function traineeRow_(t) {
  return [t.email, t.name, t.assessors.join(','), t.start, t.pathway, yn_(t.active), t.confirmed, t.confirmedBy, t.confirmedAt, t.confirmNote];
}

/* ---------------- Read ---------------- */

function getBootstrap() {
  const db = readDb_();
  return buildBootstrap_(db, meFromDb_(db), todayIso_(), appConfig_());
}

function getActivityLog() {
  const ctx = context_(); requireAdmin_(ctx.me);
  const sh = sheet_('Log');
  if (sh.getLastRow() < 2) return [];
  const n = Math.min(300, sh.getLastRow() - 1);
  return sh.getRange(sh.getLastRow() - n + 1, 1, n, 6).getValues().reverse()
    .map(r => ({ time: String(r[0]), by: String(r[1]), action: String(r[2]), trainee: String(r[3]), task: String(r[4]), detail: String(r[5]) }));
}

/* ---------------- Trainee actions ---------------- */

/** action: 'save' keeps the work in progress, 'submit' sends it for review. */
function saveMyTask(taskId, action, evidence, reflection) {
  return withLock_(() => {
    const ctx = traineeContext_('submit their own tasks');
    const task = taskOf_(ctx.db, taskId);
    const p = progressOf_(ctx.db, ctx.me.email, task.id);
    if (EDITABLE_STATES.indexOf(p.status) < 0) throw new Error('This task has already been submitted or completed.');
    p.evidence = str_(evidence, 1000);
    p.reflection = str_(reflection, 5000);
    if (action === 'submit') {
      if (!p.evidence && !p.files.length) throw new Error('Add a link, reference or file as evidence before submitting.');
      p.status = 'submitted'; p.submitted = nowStamp_();
    } else if (p.status === 'not') {
      p.status = 'progress';
    }
    p.updated = nowStamp_();
    saveProgress_(p);
    logAction_(ctx.me, action === 'submit' ? 'Submitted' : 'Saved', ctx.me.email, task.id, '');
    return getBootstrap();
  });
}

function uploadEvidence(taskId, fileName, mimeType, base64) {
  return withLock_(() => {
    const ctx = traineeContext_('upload evidence');
    const task = taskOf_(ctx.db, taskId);
    const p = progressOf_(ctx.db, ctx.me.email, task.id);
    if (EDITABLE_STATES.indexOf(p.status) < 0) throw new Error('This task has already been submitted or completed.');
    if (!extOk_(fileName)) throw new Error('That file type is not allowed. Use PDF, Office documents, images, text, mp3, m4a or mp4.');
    if (p.files.length >= CONFIG.MAX_FILES_PER_TASK) throw new Error('You can attach up to ' + CONFIG.MAX_FILES_PER_TASK + ' files to one task.');
    const bytes = Utilities.base64Decode(String(base64 || ''));
    if (!bytes.length) throw new Error('That file is empty.');
    if (bytes.length > ctx.db.settings.maxUploadMb * 1024 * 1024) throw new Error('That file is larger than ' + ctx.db.settings.maxUploadMb + ' MB. Share a link instead.');

    const clean = safeFileName_(fileName);
    const blob = Utilities.newBlob(bytes, String(mimeType || 'application/octet-stream'), task.id + ' - ' + clean);
    const file = traineeFolder_(ctx.me.email).createFile(blob);
    p.files.push({ id: file.getId(), name: clean, size: bytes.length, at: nowStamp_() });
    if (p.status === 'not') p.status = 'progress';
    p.updated = nowStamp_();
    saveProgress_(p);
    logAction_(ctx.me, 'Uploaded file', ctx.me.email, task.id, clean);
    return getBootstrap();
  });
}

function removeEvidence(taskId, fileId) {
  return withLock_(() => {
    const ctx = traineeContext_('remove their evidence');
    const task = taskOf_(ctx.db, taskId);
    const p = progressOf_(ctx.db, ctx.me.email, task.id);
    if (EDITABLE_STATES.indexOf(p.status) < 0) throw new Error('This task has already been submitted or completed.');
    const f = p.files.find(x => x.id === fileId);
    if (!f) throw new Error('That file is not attached to this task.');
    p.files = p.files.filter(x => x.id !== fileId);
    p.updated = nowStamp_();
    saveProgress_(p);
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ }
    logAction_(ctx.me, 'Removed file', ctx.me.email, task.id, f.name);
    return getBootstrap();
  });
}

/** Sends a stored evidence file to the page. Only the trainee and their assessors can fetch it. */
function getEvidenceFile(traineeEmail, taskId, fileId) {
  const ctx = context_(traineeEmail);
  const p = progressOf_(ctx.db, ctx.tr.email, String(taskId).trim());
  const f = p.files.find(x => x.id === fileId);
  if (!f) throw new Error('That file is not attached to this task.');
  const blob = DriveApp.getFileById(fileId).getBlob();
  return { name: f.name, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------------- Assessor actions ---------------- */

/** An assessor can record a decision on any task, whether or not the trainee has submitted it (viva, role play, observed session). */
function assessTask(traineeEmail, taskId, outcome, score, feedback) {
  return withLock_(() => {
    const ctx = context_(traineeEmail); requireStaff_(ctx.me);
    const task = taskOf_(ctx.db, taskId);
    const v = validateAssessment_(task, { outcome: outcome, score: score, feedback: feedback }, ctx.db.settings);
    const p = progressOf_(ctx.db, ctx.tr.email, task.id);
    const before = p.status + (p.score ? ' ' + p.score : '');
    p.status = v.status; p.score = v.score === '' ? null : v.score; p.feedback = v.feedback;
    p.assessor = ctx.me.name || ctx.me.email; p.date = todayIso_(); p.updated = nowStamp_();
    saveProgress_(p);
    logAction_(ctx.me, 'Assessed', ctx.tr.email, task.id, before + ' -> ' + v.status + (v.score === '' ? '' : ' ' + v.score));
    return getBootstrap();
  });
}

/** Records the readiness decision. The computed eligibility is a recommendation; a person confirms it. */
function confirmReadiness(traineeEmail, level, note) {
  return withLock_(() => {
    const ctx = context_(traineeEmail); requireStaff_(ctx.me);
    const stats = statsForTrainee_(ctx.db, ctx.tr.email, todayIso_());
    validateReadiness_(level, stats, ctx.me);
    ctx.tr.confirmed = level; ctx.tr.confirmedBy = ctx.me.name || ctx.me.email;
    ctx.tr.confirmedAt = todayIso_(); ctx.tr.confirmNote = str_(note, 500);
    upsert_('Trainees', [ctx.tr.email], traineeRow_(ctx.tr));
    logAction_(ctx.me, 'Readiness', ctx.tr.email, '', level + (note ? ': ' + str_(note, 200) : ''));
    return getBootstrap();
  });
}

/* ---------------- Admin: people ---------------- */

function checkAssessors_(db, list) {
  const out = [];
  (list || []).forEach(e => {
    const email = norm_(e);
    if (!email) return;
    if (!db.staff.some(s => s.email === email)) throw new Error(email + ' is not in the staff list. Add them under Staff first.');
    if (out.indexOf(email) < 0) out.push(email);
  });
  return out;
}
function checkDate_(v) {
  const s = normaliseDate_(v);
  if (!s) throw new Error('Enter the start date as a valid date.');
  return s;
}

function enrolTrainee(name, email, assessors, pathway, startDate) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    name = str_(name, 100); email = norm_(email);
    if (!name) throw new Error("Enter the trainee's name.");
    if (!email.endsWith('@' + CONFIG.DOMAIN)) throw new Error('Use their @' + CONFIG.DOMAIN + ' email address.');
    if (ctx.db.trainees.some(t => t.email === email)) throw new Error('This person is already enrolled.');
    if (ctx.db.staff.some(s => s.email === email)) throw new Error('This email belongs to a staff member.');
    pathway = PATHWAYS.indexOf(pathway) > -1 ? pathway : 'Standard';
    const tr = { email: email, name: name, assessors: checkAssessors_(ctx.db, assessors), start: checkDate_(startDate || todayIso_()),
                 pathway: pathway, active: true, confirmed: 'notcleared', confirmedBy: '', confirmedAt: '', confirmNote: '' };
    upsert_('Trainees', [email], traineeRow_(tr));
    logAction_(ctx.me, 'Enrolled trainee', email, '', pathway + ', starts ' + tr.start);
    return getBootstrap();
  });
}

function updateTrainee(email, fields) {
  return withLock_(() => {
    const ctx = context_(email); requireAdmin_(ctx.me);
    const f = fields || {}, tr = ctx.tr;
    if (f.name !== undefined) { tr.name = str_(f.name, 100); if (!tr.name) throw new Error("Enter the trainee's name."); }
    if (f.assessors !== undefined) tr.assessors = checkAssessors_(ctx.db, f.assessors);
    if (f.start !== undefined) tr.start = checkDate_(f.start);
    if (f.pathway !== undefined) { if (PATHWAYS.indexOf(f.pathway) < 0) throw new Error('Unknown pathway.'); tr.pathway = f.pathway; }
    if (f.active !== undefined) tr.active = !!f.active;
    upsert_('Trainees', [tr.email], traineeRow_(tr));
    logAction_(ctx.me, 'Updated trainee', tr.email, '', JSON.stringify(f).slice(0, 300));
    return getBootstrap();
  });
}

function saveStaff(email, name, role) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    email = norm_(email); name = str_(name, 100);
    if (!email.endsWith('@' + CONFIG.DOMAIN)) throw new Error('Use an @' + CONFIG.DOMAIN + ' email address.');
    if (!name) throw new Error('Enter a name.');
    role = role === 'Admin' ? 'Admin' : 'Assessor';
    if (ctx.db.trainees.some(t => t.email === email)) throw new Error('This email belongs to a trainee.');
    const current = ctx.db.staff.find(s => s.email === email);
    if (current && current.role === 'Admin' && role !== 'Admin' && ctx.db.staff.filter(s => s.role === 'Admin').length < 2) {
      throw new Error('There must always be at least one admin.');
    }
    upsert_('Staff', [email], [email, name, role]);
    logAction_(ctx.me, current ? 'Updated staff' : 'Added staff', '', '', email + ' as ' + role);
    return getBootstrap();
  });
}

function removeStaff(email) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    email = norm_(email);
    const s = ctx.db.staff.find(x => x.email === email);
    if (!s) throw new Error('That person is not on the staff list.');
    if (email === ctx.me.email) throw new Error('You cannot remove yourself.');
    if (s.role === 'Admin' && ctx.db.staff.filter(x => x.role === 'Admin').length < 2) throw new Error('There must always be at least one admin.');
    replaceRows_('Staff', ctx.db.staff.filter(x => x.email !== email).map(x => [x.email, x.name, x.role]));
    ctx.db.trainees.filter(t => t.assessors.indexOf(email) > -1).forEach(t => {
      t.assessors = t.assessors.filter(a => a !== email);
      upsert_('Trainees', [t.email], traineeRow_(t));
    });
    logAction_(ctx.me, 'Removed staff', '', '', email);
    return getBootstrap();
  });
}

/* ---------------- Admin: the module ---------------- */

function saveTopic(topic) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    const t = topic || {};
    const name = str_(t.name, 200), weight = Number(t.w);
    if (!name) throw new Error('Enter a topic name.');
    if (!isFinite(weight) || weight < 0 || weight > 100) throw new Error('Weight must be between 0 and 100.');
    const id = t.id ? Number(t.id) : ctx.db.topics.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    if (t.id && !ctx.db.topics.some(x => x.id === id)) throw new Error('That topic no longer exists.');
    upsert_('Topics', [id], [id, name, weight, str_(t.note, 3000)]);
    logAction_(ctx.me, t.id ? 'Edited topic' : 'Added topic', '', '', id + ' ' + name + ' ' + weight + '%');
    return getBootstrap();
  });
}

function saveTask(task, isNew) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    const t = task || {}, id = str_(t.id, 10);
    if (!/^\d+\.\d+$/.test(id)) throw new Error('Task ID must look like 5.12 (topic number, a dot, then a number).');
    const existing = ctx.db.tasks.find(x => x.id === id);
    if (isNew && existing) throw new Error('A task with ID ' + id + ' already exists.');
    if (!isNew && !existing) throw new Error('That task no longer exists.');
    const topic = Number(t.topic), cycle = Number(t.cycle), weight = Number(t.weight);
    if (!ctx.db.topics.some(x => x.id === topic)) throw new Error('Choose a topic.');
    if (!(cycle >= 1 && cycle <= ctx.db.settings.cycles && cycle % 1 === 0)) throw new Error('Cycle must be 1 to ' + ctx.db.settings.cycles + '.');
    if (!isFinite(weight) || weight < 0) throw new Error('Weight must be 0 or more.');
    if (TASK_TYPES.indexOf(t.type) < 0) throw new Error('Choose a task type.');
    const name = str_(t.name, 200);
    if (!name) throw new Error('Enter the task name.');
    const row = {
      id: id, topic: topic, cycle: cycle, name: name, type: t.type, what: str_(t.what, 3000), evidence: str_(t.evidence, 1000),
      standard: str_(t.standard, 1000), weight: weight, gate: !!t.gate, mandatory: !!t.mandatory || !!t.gate,
      active: existing ? existing.active : true,
      order: existing ? existing.order : ctx.db.tasks.reduce((m, x) => Math.max(m, x.order), 0) + 1
    };
    upsert_('Tasks', [id], taskToRow_(row));
    logAction_(ctx.me, isNew ? 'Added task' : 'Edited task', '', id, name + (row.gate ? ' (gate)' : ''));
    return getBootstrap();
  });
}

/** Tasks are archived, never deleted, so trainees' past progress is kept. */
function setTaskActive(taskId, active) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    const t = ctx.db.tasks.find(x => x.id === String(taskId).trim());
    if (!t) throw new Error('That task no longer exists.');
    t.active = !!active;
    upsert_('Tasks', [t.id], taskToRow_(t));
    logAction_(ctx.me, active ? 'Restored task' : 'Archived task', '', t.id, t.name);
    return getBootstrap();
  });
}

/** Replaces the resources of one scope: a whole topic (taskId empty) or one task. */
function saveResources(topicId, taskId, list) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    topicId = Number(topicId); taskId = String(taskId || '').trim();
    const clean = (list || []).map(r => ({ topic: topicId, task: taskId, label: str_(r.label, 200), url: str_(r.url, 1000), note: str_(r.note, 500) }))
      .filter(r => r.label);
    clean.forEach(r => { if (r.url && !/^https?:\/\//i.test(r.url)) throw new Error('Links must start with http:// or https:// (' + r.label + ').'); });
    const keep = ctx.db.resources.filter(r => !(r.topic === topicId && r.task === taskId));
    replaceRows_('Resources', keep.concat(clean).sort((a, b) => a.topic - b.topic).map(r => [r.topic, r.task, r.label, r.url, r.note]));
    logAction_(ctx.me, 'Saved resources', '', taskId, 'Topic ' + topicId + ', ' + clean.length + ' items');
    return getBootstrap();
  });
}

function saveSettings(settings, phases) {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    const s = settings || {}, limits = { cycles: [1, 20], daysPerCycle: [1, 12], passScore: [2, 4], supervisedGateCycle: [0, 20], urgentGateCycle: [0, 20], maxUploadMb: [1, 25] };
    const next = {};
    Object.keys(limits).forEach(k => {
      const n = Number(s[k]);
      if (!isFinite(n) || n % 1 !== 0 || n < limits[k][0] || n > limits[k][1]) throw new Error(k + ' must be a whole number from ' + limits[k][0] + ' to ' + limits[k][1] + '.');
      next[k] = n;
    });
    if (next.supervisedGateCycle > next.cycles || next.urgentGateCycle > next.cycles) throw new Error('Gate cycles cannot be beyond the last cycle.');
    const ph = (phases || []).map(p => ({ name: str_(p.name, 100), from: Number(p.from), to: Number(p.to) }));
    ph.forEach(p => { if (!p.name || !(p.from >= 1 && p.to >= p.from && p.to <= next.cycles)) throw new Error('Each phase needs a name and a valid range of cycles.'); });
    replaceRows_('Settings', Object.keys(next).map(k => [k, next[k], SETTING_HELP[k] || '']));
    replaceRows_('Phases', ph.map(p => [p.name, p.from, p.to]));
    logAction_(ctx.me, 'Saved settings', '', '', JSON.stringify(next));
    return getBootstrap();
  });
}

/* ---------------- Evidence storage (private Drive folder) ---------------- */

function evidenceRoot_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('EVIDENCE_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ } }
  const f = DriveApp.createFolder(CONFIG.EVIDENCE_FOLDER_NAME);
  props.setProperty('EVIDENCE_FOLDER_ID', f.getId());
  return f;
}
function traineeFolder_(email) {
  const root = evidenceRoot_(), it = root.getFoldersByName(email);
  return it.hasNext() ? it.next() : root.createFolder(email);
}
