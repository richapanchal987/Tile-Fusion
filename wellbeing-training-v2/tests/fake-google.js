// A small in-memory stand-in for the Google services Code.gs uses, so the real server code can run in Node.
// Sheet cells are stored as strings, which is the harshest case for the code's number/boolean handling.
const fs = require('fs'), path = require('path'), vm = require('vm');

function makeWorld() {
  const state = { user: '', props: {}, files: {}, folders: {}, nextId: 1, now: Date.UTC(2026, 10, 3, 9, 0), tick: 0, workbooks: {} };
  const id = p => p + (state.nextId++);

  class Sheet {
    constructor(name) { this.name = name; this.cells = []; this.frozen = 0; }
    get(r, c) { return (this.cells[r - 1] && this.cells[r - 1][c - 1]) || ''; }
    set(r, c, v) { while (this.cells.length < r) this.cells.push([]); const row = this.cells[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v === null || v === undefined ? '' : String(v); }
    getLastRow() { for (let i = this.cells.length; i > 0; i--) if (this.cells[i - 1].some(x => x !== '')) return i; return 0; }
    getLastColumn() { return this.cells.reduce((m, r) => Math.max(m, r.length), 0); }
    getMaxRows() { return 1000; }
    getDataRange() { const sh = this; return { getValues: () => Array.from({ length: sh.getLastRow() }, (_, i) => Array.from({ length: sh.getLastColumn() }, (_, j) => sh.get(i + 1, j + 1))) }; }
    setFrozenRows(n) { this.frozen = n; }
    appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, i) => this.set(r, i + 1, v)); }
    getRange(r, c, nr, nc) {
      const sh = this; nr = nr || 1; nc = nc || 1;
      const rng = {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.get(r + i, c + j))),
        setValues: vals => { vals.forEach((row, i) => row.forEach((v, j) => sh.set(r + i, c + j, v))); return rng; },
        setValue: v => { sh.set(r, c, v); return rng; },
        getValue: () => sh.get(r, c),
        clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.set(r + i, c + j, ''); return rng; },
        setNumberFormat: () => rng, setFontWeight: () => rng, setBackground: () => rng
      };
      return rng;
    }
  }
  const sheets = {};
  const ss = {
    getId: () => 'sheet1', getUrl: () => 'https://example/sheet',
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = new Sheet(n)),
    getSheets: () => Object.values(sheets), deleteSheet: s => { delete sheets[s.name]; }
  };
  sheets['Sheet1'] = new Sheet('Sheet1');

  const folder = (name, parent) => {
    const f = { _id: id('folder'), _name: name, _kids: [], _files: [],
      getId() { return this._id; },
      getFoldersByName(n) { const m = this._kids.filter(k => k._name === n); let i = 0; return { hasNext: () => i < m.length, next: () => m[i++] }; },
      createFolder(n) { const k = folder(n, this); this._kids.push(k); return k; },
      createFile(blob) { const file = { _id: id('file'), _blob: blob, _trashed: false, getId() { return this._id; }, getBlob() { return this._blob; }, setTrashed(t) { this._trashed = t; } }; state.files[file._id] = file; this._files.push(file); return file; } };
    state.folders[f._id] = f; return f;
  };

  const blob = (bytes, mime, name) => ({ getBytes: () => bytes, getContentType: () => mime, getName: () => name });
  const pad = n => String(n).padStart(2, '0');
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(state.now); }
    static now() { return state.now + (state.tick++); }
  }
  const sandbox = {
    console, Date: FakeDate, JSON, Math, Number, String, Array, Object, isNaN, isFinite, Error, RegExp, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: id => {
      if (id === 'sheet1') return ss;
      const grids = state.workbooks[id]; if (!grids) throw new Error('No access to that workbook');
      return { getSheetByName: n => { if (!grids[n]) return null; const sh = new Sheet(n); grids[n].forEach((r, i) => r.forEach((v, j) => sh.set(i + 1, j + 1, v))); return sh; } };
    } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => state.props[k] || null, setProperty: (k, v) => { state.props[k] = v; } }) },
    Session: { getActiveUser: () => ({ getEmail: () => state.user }), getScriptTimeZone: () => 'UTC' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: (d, tz, fmt) => { const s = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); return fmt === 'yyyy-MM-dd' ? s : s + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); },
      base64Decode: s => Array.from(Buffer.from(s, 'base64')), base64Encode: b => Buffer.from(b).toString('base64'),
      newBlob: blob
    },
    DriveApp: { createFolder: n => folder(n), getFolderById: i => { if (!state.folders[i]) throw new Error('no folder'); return state.folders[i]; }, getFileById: i => { if (!state.files[i]) throw new Error('no file'); return state.files[i]; } },
    HtmlService: {}
  };
  const ctx = vm.createContext(sandbox);
  const dir = path.join(__dirname, '..', 'apps-script');
  const src = ['Schema.gs', 'Dates.gs', 'Rules.gs', 'Data.gs', 'Import.gs', 'View.gs', 'Code.gs', 'Actions.gs', 'Staff.gs'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const names = ['setup', 'getBootstrap', 'importWorkbook', 'saveDraft', 'uploadEvidence', 'removeEvidence', 'submitAttempt', 'getEvidenceFile', 'markSeen', 'acknowledgePolicy',
    'savePlannedDate', 'saveSelfRating', 'rateAttempt', 'recordObserved', 'releaseRating', 'confirmProcess', 'setEntryCheck', 'setDueOverride', 'enrolTrainee', 'updateTrainee',
    'confirmSupervised', 'recordClearance', 'principalSignOff', 'logSupervision', 'removeSupervision', 'saveBehaviour', 'saveReliability', 'saveTask', 'setTaskActive', 'saveUser', 'saveMilestones', 'savePolicy',
    'saveHolidays', 'saveSettings', 'exportCatalogue', 'exportTraineeRecord', 'getHistory'];
  const api = vm.runInContext(src + `;({${names.join(',')}, SHEETS})`, ctx);
  const plain = x => JSON.parse(JSON.stringify(x === undefined ? null : x));
  return { state, sheets, api, setNow(iso) { state.now = Date.parse(iso + 'T09:00:00Z'); }, as(email) { state.user = email; },
    call(fn, args) { return plain(api[fn](...(args || []))); } };
}
module.exports = { makeWorld };
