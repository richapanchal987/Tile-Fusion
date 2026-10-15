/**
 * Student Champion Training: Google Apps Script web app
 * Fountainhead Student Champion Team (fsksurat.in)
 *
 * Everyone uses the web app only. The Sheet is its database and a private Drive
 * folder holds uploaded evidence; neither is shared with trainees or assessors.
 * Names, wording and rules come from Config.gs (built from programme.json).
 * Other files: Logic.gs (rules), Actions.gs (what trainees and assessors do), Admin.gs (people and curriculum),
 * DocSync.gs (module text from the Google Doc), SeedData.gs and SeedRubrics*.gs (starting content).
 * See ../README.md for setup.
 */

const CONFIG = {   // getters, so this file does not need Config.gs to have loaded first
  get APP_NAME() { return PROGRAMME.app.name; },
  get ORG_NAME() { return PROGRAMME.app.org; },
  get DOMAIN() { return PROGRAMME.app.domain; },
  get FIRST_ADMIN() { return PROGRAMME.app.firstAdmin; },
  get FIRST_ADMIN_NAME() { return PROGRAMME.app.firstAdminName; },
  get EVIDENCE_FOLDER_NAME() { return PROGRAMME.app.evidenceFolder; },
  get MAX_FILES_PER_TASK() { return PROGRAMME.app.maxFilesPerTask; }
};

// Column order matters: the code reads and writes by position. Do not reorder these in the Sheet.
const SHEETS = {
  Settings: ['Key', 'Value', 'What it does'],
  Phases: ['Phase'],
  Topics: ['Topic ID', 'Topic', 'Weight %', 'Phase', 'Pass mark %', 'Module text (doc section)', 'Internal notes'],
  Tasks: ['Task ID', 'Topic ID', 'Cycle', 'Task', 'Type', 'What the trainee will do', 'Evidence / Output', 'Competency standard',
          'Weight within topic', 'Critical gate', 'Active', 'Order', 'AI use', 'Real student', 'Students needed', 'Module text (doc section)'],
  Rubrics: ['Task ID', 'Order', 'Use', 'Group', 'Criterion', 'What is being evaluated', 'Level 1', 'Level 2', 'Level 3', 'Level 4'],
  Resources: ['Topic ID', 'Task ID', 'Resource', 'Link', 'Note'],
  Staff: ['Email', 'Name', 'Role', 'Certifies'],
  Trainees: ['Email', 'Name', 'Mentors', 'Team leader', 'Certifying mentor', 'Start date', 'Active', 'Certification', 'Certified by',
             'Certified on', 'Certification note'],
  Progress: ['Trainee', 'Task ID', 'Status', 'Evidence link / reference', 'Files', 'Reflection', 'Score', 'Feedback', 'Assessed by',
             'Date assessed', 'Submitted', 'Last updated', 'Criteria scores', 'Critical error', 'Failed attempts', 'Extra attempts',
             'Due date', 'AI permitted'],
  Checklists: ['Trainee', 'Task ID', 'Student code', 'Completed on'],
  Content: ['Key', 'Part', 'Title', 'Html'],
  Log: ['Time', 'By', 'Action', 'Trainee', 'Task', 'Detail']
};

const SETTING_HELP = {
  cycles: 'Number of cycles in the programme',
  daysPerCycle: 'Working days in one cycle (Sundays are skipped)',
  programmeMonths: 'Calendar months from the joining date to the end date',
  passScore: 'Score a critical-gate task needs to count as passed (3 = Secure)',
  reattempts: 'Reattempts allowed after a task is not yet met (an admin can allow more for one task)',
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
  if (empty('Staff')) put('Staff', [[CONFIG.FIRST_ADMIN, CONFIG.FIRST_ADMIN_NAME, 'Admin', 'No']]);
  if (empty('Settings')) put('Settings', Object.keys(SEED.settings).map(k => [k, SEED.settings[k], SETTING_HELP[k] || '']));
  if (empty('Phases')) put('Phases', SEED.phases.map(p => [p]));
  if (empty('Topics')) put('Topics', SEED.topics.map(t => [t.id, t.name, t.weight, t.phase, t.threshold, t.doc, t.note]));
  if (empty('Tasks')) put('Tasks', SEED.tasks.map(taskToRow_));
  if (empty('Rubrics')) put('Rubrics', seedRubricRows_());
  if (empty('Resources')) put('Resources', SEED.resources.map(r => [r.topic, r.task, r.label, r.url, r.note]));

  const s1 = ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  evidenceRoot_();
  try { installNightlyRefresh_(); } catch (e) { Logger.log('Could not install the nightly refresh (' + e.message + '). The Refresh button in Curriculum still works.'); }
  Logger.log('Setup complete. Next: run refreshModuleText to load the module from the Google Doc, then deploy as a web app.');
}

/** The rubric rows in the shape of the Rubrics tab. Long group texts are stored once in SEED_RUBRIC_GROUPS. */
function seedRubricRows_() {
  const rows = [];
  SEED_RUBRIC_PARTS().forEach(part => part.forEach(r => {
    rows.push([r.task, r.order, r.use, SEED_RUBRIC_GROUPS[r.group] || '', r.criterion, r.evaluated, r.levels[0], r.levels[1], r.levels[2], r.levels[3]]);
  }));
  return rows;
}

/* ---------------- Web app entry ---------------- */

function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.appName = CONFIG.APP_NAME;
  return t.evaluate().setTitle(CONFIG.APP_NAME).addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
function parseObj_(v) { try { const o = JSON.parse(v || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
const list_ = v => String(v || '').split(',').map(norm_).filter(Boolean);

function taskToRow_(t) {
  return [t.id, t.topic, t.cycle, t.name, t.type, t.what, t.evidence, t.standard, t.weight, yn_(t.gate), yn_(t.active), t.order,
          t.ai, yn_(t.real), t.students, t.doc];
}
function readStaff_() {
  return rows_('Staff').map(r => ({ email: norm_(r[0]), name: String(r[1] || r[0]), role: /admin/i.test(r[2]) ? 'Admin' : 'Assessor', certifies: yes_(r[3]) }));
}

function readDb_() {
  const settings = Object.assign({}, SEED.settings);
  rows_('Settings').forEach(r => { const k = String(r[0]).trim(); if (k in settings) settings[k] = num_(r[1], settings[k]); });
  const topics = rows_('Topics').map(r => ({ id: num_(r[0]), name: String(r[1]), weight: num_(r[2]), phase: String(r[3] || ''),
    threshold: num_(r[4], PROGRAMME.rules.moduleThreshold), doc: String(r[5] || ''), note: String(r[6] || '') }));
  return {
    settings: settings,
    phases: rows_('Phases').map(r => String(r[0])),
    topics: topics,
    tasks: rows_('Tasks').map(r => ({
      id: String(r[0]).trim(), topic: num_(r[1]), cycle: num_(r[2], 1), name: String(r[3]), type: String(r[4] || ''),
      what: String(r[5] || ''), evidence: String(r[6] || ''), standard: String(r[7] || ''), weight: num_(r[8]),
      gate: yes_(r[9]), active: String(r[10]).trim() === '' ? true : yes_(r[10]), order: num_(r[11], 9999),
      ai: AI_KEYS.indexOf(String(r[12]).trim()) > -1 ? String(r[12]).trim() : 'ask', real: yes_(r[13]), students: num_(r[14], 0), doc: String(r[15] || '')
    })),
    rubrics: rows_('Rubrics').map(r => ({ task: String(r[0]).trim(), order: num_(r[1]), use: String(r[2]).trim() === 'reference' ? 'reference' : 'score',
      group: String(r[3] || ''), criterion: String(r[4] || ''), evaluated: String(r[5] || ''), levels: [r[6], r[7], r[8], r[9]].map(x => String(x || '')) })),
    resources: rows_('Resources').map(r => ({ topic: num_(r[0]), task: String(r[1] || '').trim(), label: String(r[2] || ''), url: String(r[3] || ''), note: String(r[4] || '') })),
    staff: readStaff_(),
    trainees: rows_('Trainees').map(r => ({
      email: norm_(r[0]), name: String(r[1] || r[0]), assessors: list_(r[2]), tl: norm_(r[3]), certifier: norm_(r[4]),
      start: fmtDate_(r[5]), active: String(r[6]).trim() === '' ? true : yes_(r[6]),
      confirmed: LEVELS.indexOf(String(r[7])) > -1 ? String(r[7]) : 'notcertified',
      confirmedBy: String(r[8] || ''), confirmedAt: String(r[9] || ''), confirmNote: String(r[10] || '')
    })),
    progress: rows_('Progress').map(r => ({
      trainee: norm_(r[0]), task: String(r[1]).trim(), status: statusKey_(String(r[2])), evidence: String(r[3] || ''),
      files: parseFiles_(r[4]), reflection: String(r[5] || ''), score: num_(r[6], null), feedback: String(r[7] || ''),
      assessor: String(r[8] || ''), date: fmtDate_(r[9]), submitted: String(r[10] || ''), updated: String(r[11] || ''),
      criteria: parseObj_(r[12]), critical: String(r[13] || ''), failed: num_(r[14], 0), extra: num_(r[15], 0),
      due: fmtDate_(r[16]), ai: AI_KEYS.indexOf(String(r[17]).trim()) > -1 ? String(r[17]).trim() : ''
    })),
    checklists: rows_('Checklists').map(r => ({ trainee: norm_(r[0]), task: String(r[1]).trim(), code: String(r[2]), at: fmtDate_(r[3]) }))
  };
}

function meFromDb_(db) {
  const email = norm_(Session.getActiveUser().getEmail());
  if (!email) return { email: '', role: 'None' };
  const st = db.staff.find(s => s.email === email);
  if (st) return { email: email, name: st.name, role: st.role, certifier: st.certifies };
  const tr = db.trainees.find(t => t.email === email && t.active);
  if (tr) return { email: email, name: tr.name, role: 'Trainee' };
  return { email: email, role: 'None' };
}

function appConfig_() {
  const p = PROGRAMME;
  return { appName: CONFIG.APP_NAME, orgName: CONFIG.ORG_NAME, domain: CONFIG.DOMAIN, maxFiles: CONFIG.MAX_FILES_PER_TASK, taskTypes: TASK_TYPES,
    words: p.words, levels: p.levels, statusLabels: p.statusLabels, scale: p.scale, scaleHelp: p.scaleHelp, outcomes: p.outcomes, aiOptions: p.aiOptions, aiRule: p.aiRule,
    criticalErrors: p.criticalErrors, checklist: p.checklist, docSections: p.docSections, storagePrefix: p.app.storagePrefix, docName: p.app.moduleDocName };
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function requireStaff_(me) { if (me.role !== 'Admin' && me.role !== 'Assessor') throw new Error('Only mentors, TLs and admins can do this.'); }
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
    { trainee: email, task: taskId, status: 'not', evidence: '', files: [], reflection: '', score: null, feedback: '', assessor: '', date: '',
      submitted: '', updated: '', criteria: {}, critical: '', failed: 0, extra: 0, due: '', ai: '' };
}
function saveProgress_(p) {
  upsert_('Progress', [p.trainee, p.task], [p.trainee, p.task, statusLabel_(p.status), p.evidence, JSON.stringify(p.files || []),
    p.reflection, p.score == null ? '' : p.score, p.feedback, p.assessor, p.date, p.submitted, p.updated,
    JSON.stringify(p.criteria || {}), p.critical || '', p.failed || 0, p.extra || 0, p.due || '', p.ai || '']);
}
function traineeRow_(t) {
  return [t.email, t.name, t.assessors.join(','), t.tl || '', t.certifier || '', t.start, yn_(t.active), t.confirmed, t.confirmedBy, t.confirmedAt, t.confirmNote];
}

/* ---------------- Read ---------------- */

function getBootstrap() {
  const db = readDb_(), me = meFromDb_(db);
  const out = buildBootstrap_(db, me, todayIso_(), appConfig_());
  if (me.role === 'Admin') out.sync = syncStatus_();
  return out;
}

function getActivityLog() {
  const ctx = context_(); requireAdmin_(ctx.me);
  const sh = sheet_('Log');
  if (sh.getLastRow() < 2) return [];
  const n = Math.min(300, sh.getLastRow() - 1);
  return sh.getRange(sh.getLastRow() - n + 1, 1, n, 6).getValues().reverse()
    .map(r => ({ time: String(r[0]), by: String(r[1]), action: String(r[2]), trainee: String(r[3]), task: String(r[4]), detail: String(r[5]) }));
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
