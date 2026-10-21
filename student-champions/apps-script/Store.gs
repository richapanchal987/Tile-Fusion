/**
 * Sheet access, with two levels of caching so pages open and save faster:
 *  - within one request, each tab is read at most once (it is read again only after it is written);
 *  - across requests, the tabs that rarely change (settings, modules, tasks, rubrics, staff, module prompts) are kept in
 *    Apps Script's cache for up to 6 hours and dropped as soon as the app writes to them.
 * If someone edits those tabs by hand in the Sheet, run clearCache (or wait up to 6 hours) for the app to see the change.
 * Typed answers live in the Answers tab, one row per trainee and task, read and written by key only.
 */

const CACHED_SHEETS = ['Settings', 'Phases', 'Topics', 'Tasks', 'Rubrics', 'Resources', 'Staff', 'Prompts'];
const CACHE_PREFIX = 'sc1:', CACHE_CHUNK = 90000, CACHE_SECONDS = 21600;
let MEMO_ = {};

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
function readRows_(name) {
  const sh = sheet_(name), w = SHEETS[name].length;
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues().filter(r => String(r[0]).trim() !== '');
}

function cacheGet_(name) {
  try {
    const c = CacheService.getScriptCache(), n = Number(c.get(CACHE_PREFIX + name));
    if (!n) return null;
    let s = '';
    for (let i = 0; i < n; i++) { const part = c.get(CACHE_PREFIX + name + ':' + i); if (part === null) return null; s += part; }
    return JSON.parse(s);
  } catch (e) { return null; }
}
function cachePut_(name, rows) {
  try {
    const c = CacheService.getScriptCache(), s = JSON.stringify(rows), n = Math.max(1, Math.ceil(s.length / CACHE_CHUNK));
    for (let i = 0; i < n; i++) c.put(CACHE_PREFIX + name + ':' + i, s.slice(i * CACHE_CHUNK, (i + 1) * CACHE_CHUNK), CACHE_SECONDS);
    c.put(CACHE_PREFIX + name, String(n), CACHE_SECONDS);
  } catch (e) { /* too big or cache unavailable: just read the Sheet next time */ }
}
function cacheDrop_(name) { try { CacheService.getScriptCache().remove(CACHE_PREFIX + name); } catch (e) { /* ignore */ } }
/** Forget every cached tab. setup and the update functions call this; run it yourself after editing the Sheet by hand. */
function clearCache_() { MEMO_ = {}; CACHED_SHEETS.forEach(cacheDrop_); }
function clearCache() { clearCache_(); Logger.log('Cache cleared. The app will read the Sheet afresh.'); }

function rows_(name) {
  if (MEMO_[name]) return MEMO_[name];
  const cached = CACHED_SHEETS.indexOf(name) > -1;
  let rows = cached ? cacheGet_(name) : null;
  if (!rows) { rows = readRows_(name).map(r => r.map(v => Object.prototype.toString.call(v) === '[object Date]' ? fmtDate_(v) : v)); if (cached) cachePut_(name, rows); }
  return (MEMO_[name] = rows);
}
/** Call after any write to a tab, so the next read sees it. */
function touched_(name) { delete MEMO_[name]; if (CACHED_SHEETS.indexOf(name) > -1) cacheDrop_(name); }

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
  touched_(name);
}
function replaceRows_(name, rows) {
  const sh = sheet_(name), w = SHEETS[name].length;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, w).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, w).setValues(rows);
  touched_(name);
}
function append_(name, row) { sheet_(name).appendRow(row); touched_(name); }

/* ---------------- Typed answers and reflection (Answers tab) ---------------- */

const WORK_LIMIT = 48000;   // characters of answers per trainee per task (one Sheet cell)
const workKey_ = (email, taskId) => norm_(email) + '|' + String(taskId).trim();
function workRow_(key) {
  const sh = sheet_('Answers'), n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const keys = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < n; i++) if (String(keys[i][0]) === key) return i + 2;
  return 0;
}
/** { a: {key: text} for answer boxes, r: {key: text} for reflection, at: last saved } */
function readWork_(email, taskId) {
  const row = workRow_(workKey_(email, taskId));
  if (!row) return { a: {}, r: {}, at: '' };
  const v = sheet_('Answers').getRange(row, 4, 1, 2).getValues()[0], o = parseObj_(v[0]);
  return { a: o.a && typeof o.a === 'object' ? o.a : {}, r: o.r && typeof o.r === 'object' ? o.r : {}, at: String(v[1] || '') };
}
function writeWork_(email, taskId, work) {
  const json = JSON.stringify({ a: work.a || {}, r: work.r || {} });
  if (json.length > WORK_LIMIT) throw new Error('These answers are too long to save in one task (about ' + Math.round(WORK_LIMIT / 1000) + ',000 characters). Shorten some answers, or put the longest one in a document and add its link.');
  const key = workKey_(email, taskId), row = workRow_(key), vals = [key, norm_(email), String(taskId).trim(), json, work.at || nowStamp_()];
  if (row) sheet_('Answers').getRange(row, 1, 1, vals.length).setValues([vals]); else sheet_('Answers').appendRow(vals);
}
