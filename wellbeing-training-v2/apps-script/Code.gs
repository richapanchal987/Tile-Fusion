/**
 * Well-being Counsellor Training: Google Apps Script web app (version 2, built from the counsellors' workbook v17).
 * Fountainhead School (fsksurat.in)
 *
 * Everyone uses the web app only. The Sheet is its database and a private Drive folder holds uploaded evidence;
 * neither is shared with trainees. See ../README.md for setup.
 *
 * Files: Schema, Dates, Rules (pure rules) | Data, Import, View (sheet, import, who sees what) | Code (this file), Actions (trainee), Staff (team) | Index, Styles, Art, App (screens)
 */

const FIRST_ADMIN = { email: 'richa.panchal@fsksurat.in', name: 'Richa Panchal', role: ROLE.COORD };
const EVIDENCE_FOLDER_NAME = 'Well-being Training Evidence (private)';

/* ---------------- Setup (run once from the editor) ---------------- */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from the Google Sheet (Extensions > Apps Script) and run setup again.');
  const props = PropertiesService.getScriptProperties();
  const users = ss.getSheetByName('Users');
  if (users && users.getLastRow() > 1) {
    const caller = norm_(Session.getActiveUser().getEmail());
    if (!readDb_().users.some(u => u.email === caller && u.kind === 'coord')) throw new Error('Only the Campus Operations Coordinator can run setup again.');
  }
  props.setProperty('SHEET_ID', ss.getId());
  Object.keys(SHEETS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const h = SHEETS[name];
    sh.getRange(1, 1, sh.getMaxRows(), h.length).setNumberFormat('@');          // plain text: typed text is never read as a formula
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#DCE6F2');
    sh.setFrozenRows(1);
  });
  const empty = name => ss.getSheetByName(name).getLastRow() < 2;
  const put = (name, rows) => { if (rows.length) ss.getSheetByName(name).getRange(2, 1, rows.length, rows[0].length).setValues(rows); };
  if (empty('Users')) put('Users', [[FIRST_ADMIN.email, FIRST_ADMIN.name, FIRST_ADMIN.role, 'Yes']]);
  if (empty('Settings')) put('Settings', Object.keys(SETTING_DEFS).map(k => [k, SETTING_DEFS[k][0], SETTING_DEFS[k][1]]));
  if (empty('Policies')) put('Policies', DEFAULT_POLICIES.map(p => [p, '', '']));
  if (empty('Milestones')) put('Milestones', [1, 2, 3, 4].map(n => ['Milestone ' + n, MILESTONE_DEADLINES[n], '', '']));
  const s1 = ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  evidenceRoot_();
  Logger.log('Setup complete. Deploy as a web app, open it, then use Admin > Import the task list.');
}

/* ---------------- Web app entry ---------------- */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('Well-being Counsellor Training')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------------- who is asking ---------------- */

/** Loads the database and the caller. Every server action starts here, so nothing trusts the page. */
function ctx_() {
  const db = readDb_(), me = meFromDb_(db);
  if (me.kind === 'none') throw new Error('Your account (' + (me.email || 'unknown') + ') is not enrolled in this app. Please ask the Campus Operations Coordinator.');
  return { db: db, me: me, today: todayIso_() };
}
function traineeCtx_(what) {
  const c = ctx_();
  if (c.me.kind !== 'trainee') throw new Error('Only trainees can ' + what + '.');
  if (c.me.readOnly) throw new Error('Your record is now read-only, so you cannot ' + what + '.');
  c.tr = c.db.trainees.find(x => x.email === c.me.email);
  return c;
}
function staffCtx_(kinds) {
  const c = ctx_();
  if (kinds.indexOf(c.me.kind) < 0) throw new Error('You do not have access to do this.');
  return c;
}
/** A Team Leader's own-section trainee, still open for changes (R17, R31). */
function ownTrainee_(c, email, allowClosed) {
  if (c.me.kind !== 'tl') throw new Error('Only a Team Leader can do this.');
  const tr = c.db.trainees.find(x => x.email === norm_(email));
  if (!tr) throw new Error('That trainee was not found.');
  if (tr.section !== c.me.section) throw new Error('This trainee belongs to the other section. You can view them but not change them.');
  if (!allowClosed && (tr.status === 'Completed' || tr.status === 'Left')) throw new Error('This trainee’s record is closed and read-only.');
  return tr;
}
function taskOf_(db, id) {
  const t = db.tasks.find(x => x.id === String(id).trim() && x.active);
  if (!t) throw new Error('That task was not found.');
  return t;
}
function attemptOf_(db, id) {
  const a = db.attempts.find(x => x.id === String(id));
  if (!a) throw new Error('That attempt was not found.');
  return a;
}
function saveAttempt_(a) { upsert_('Attempts', [0], [a.id], attemptToRow_(a)); }
function saveTrainee_(t) { upsert_('Trainees', [2], [t.email], traineeToRow_(t)); }
const newId_ = p => p + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase();

function getBootstrap() {
  const db = readDb_(), me = meFromDb_(db);
  return buildBootstrap_(db, me, todayIso_());
}

/* ---------------- evidence folder ---------------- */

function evidenceRoot_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('EVIDENCE_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ } }
  const f = DriveApp.createFolder(EVIDENCE_FOLDER_NAME);
  props.setProperty('EVIDENCE_FOLDER_ID', f.getId());
  return f;
}
function traineeFolder_(email) {
  const root = evidenceRoot_(), it = root.getFoldersByName(email);
  return it.hasNext() ? it.next() : root.createFolder(email);
}

/* ---------------- the one-time task list import (decision of 21 October 2026) ---------------- */

/** Reads the workbook's tabs into plain grids. Not unit-tested against Google; buildImport_ is. */
function readWorkbook_(id) {
  const wb = SpreadsheetApp.openById(id), out = {};
  ['Task Catalogue', 'Milestones', 'Key Skills', 'Toolkit', 'Rubrics'].forEach(n => { const sh = wb.getSheetByName(n); out[n] = sh ? sh.getDataRange().getValues() : []; });
  return out;
}

/** Check first (replace = false, dryRun = true) to see counts and warnings, then import. After it has run once the app holds the only master copy. */
function importWorkbook(workbookId, dryRun, replace) {
  return withLock_(() => {
    const c = staffCtx_(['coord', 'tl']);
    const id = str_(workbookId, 200).replace(/^.*\/d\//, '').replace(/[\/?#].*$/, '');
    if (!id) throw new Error('Paste the workbook’s link or ID.');
    if (c.db.settings.importedAt && !replace) throw new Error('The task list was already imported on ' + c.db.settings.importedAt + '. The app is now the master copy. Tick “replace” only if you really want to overwrite it.');
    let wb; try { wb = readWorkbook_(id); } catch (e) { throw new Error('Could not open that workbook. Share it with the account that runs this app, then try again.'); }
    const imp = buildImport_(wb);
    if (dryRun) return { counts: imp.counts, warnings: imp.warnings };
    replaceRows_('Tasks', imp.tasks); replaceRows_('Milestones', imp.milestones); replaceRows_('KeySkills', imp.keySkills);
    replaceRows_('Toolkit', imp.toolkit); replaceRows_('Rubrics', imp.rubrics);
    setSetting_('workbookId', id); setSetting_('importedAt', nowStamp_());
    logChange_(c.me, 'Tasks', 'all', 'import', '', imp.counts.tasks + ' tasks');
    return { counts: imp.counts, warnings: imp.warnings, bootstrap: getBootstrap() };
  });
}
function setSetting_(key, value) { upsert_('Settings', [0], [key], [key, value, (SETTING_DEFS[key] || ['', ''])[1]]); }
