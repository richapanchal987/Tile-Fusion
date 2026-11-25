/**
 * One-time import of the task links (the "Links" tab of the training workbook) into the Resources tab.
 *
 * The Links tab uses the workbook's task IDs (SAFE-01, STU-12...). This app's tasks have the original IDs (1.1, 5.12...),
 * so the workbook's "Old Task" column is used to match each link to the right original task. Links for tasks that
 * exist only in the workbook are skipped and listed. Links marked "Team Leader only" are kept for Team Leaders only.
 *
 * Run importTaskLinks() from the Apps Script editor (Run > importTaskLinks). It is safe to run again: links already
 * in the Resources tab are not added twice. Needs the Google Sheets advanced service (set in appsscript.json).
 */

const LINKS_SOURCE = {
  linksBook: '1iVexQk5tSoIJUfGkfsWHxm3YdZ16T5X7THV_SN2HuKo', linksTab: 'Links',
  catalogueBook: '1FhQ9YXTp96HwZGdZIgz38cVbD20R5ZQ6xwPsQr_2BWY', catalogueTab: 'Task Catalogue'
};

/** "5.1–5.5 Observe Sessions 1–5; 5.15 Feedback" -> ['5.1','5.2','5.3','5.4','5.5','5.15'] */
function oldTaskIds_(s) {
  const out = [];
  String(s || '').split(';').forEach(part => {
    let m = /^\s*(\d+)\.(\d+)\s*[–-]\s*(\d+)\.(\d+)/.exec(part);
    if (m) { for (let n = +m[2]; n <= +m[4]; n++) out.push(m[1] + '.' + n); return; }
    m = /^\s*(\d+\.\d+)/.exec(part);
    if (m) out.push(m[1]);
  });
  return out;
}

/**
 * links     = [[{text, url}, ...], ...] the Links tab, headings first (a link may be a plain hyperlink or a Drive chip)
 * catalogue = [[{text}, ...], ...] the workbook's Task Catalogue, headings first
 * validIds  = the task IDs this app has
 * Returns { rows: [[topic, task, label, url, note, visibleTo]], warnings, summary }.
 */
function buildTaskLinks_(links, catalogue, validIds) {
  const w = [], txt = c => String((c && c.text) || '').trim();
  const ch = (catalogue[0] || []).map(txt), cId = ch.indexOf('Task ID'), cOld = ch.indexOf('Old Task (Team Leader only)');
  if (cId < 0 || cOld < 0) return { rows: [], warnings: ['The Task Catalogue needs the columns "Task ID" and "Old Task (Team Leader only)".'], summary: {} };
  const map = {};
  catalogue.slice(1).forEach(r => { const id = txt(r[cId]); if (id) map[id] = oldTaskIds_(txt(r[cOld])); });
  const lh = (links[0] || []).map(txt), I = {};
  ['Task ID', 'Link Type', 'Link Name', 'Who Can See It', 'Link'].forEach(n => { I[n] = lh.indexOf(n); if (I[n] < 0) w.push('The Links tab has no column called "' + n + '".'); });
  if (w.length) return { rows: [], warnings: w, summary: {} };
  const NOTE = { 'Task sheet': 'Task sheet', 'Tool card': 'Tool card', 'Team Leader key': 'Team Leader key', 'Nucleus form': 'Nucleus form', 'Rubric / form': 'Rubric / form' };
  const rows = [], seen = {}, noOld = {}, noUrl = [], badId = {};
  links.slice(1).forEach((r, i) => {
    const id = txt(r[I['Task ID']]), type = txt(r[I['Link Type']]), name = txt(r[I['Link Name']]), lk = r[I.Link] || {}, url = String(lk.url || '').trim();
    if (!id || /^note/i.test(type)) return;
    if (!/^https?:\/\//i.test(url)) { noUrl.push('Row ' + (i + 2) + ' (' + id + ', ' + name + ')'); return; }
    const olds = map[id] || [];
    if (!olds.length) { noOld[id] = true; return; }
    const label = name.replace(/^[A-Z]+-\d+\s*[–-]?\s*/, '').trim() || name;
    olds.forEach(oid => {
      if (validIds.indexOf(oid) < 0) { badId[oid] = true; return; }
      const key = [oid, label, url].join('|'); if (seen[key]) return; seen[key] = true;
      rows.push([Number(oid.split('.')[0]), oid, label, url, NOTE[type] || '', /team leader/i.test(txt(r[I['Who Can See It']])) ? 'Team Leaders only' : 'Everyone']);
    });
  });
  Object.keys(noOld).sort().forEach(id => w.push(id + ' is new in the workbook and has no original task, so its links were not added.'));
  Object.keys(badId).sort().forEach(id => w.push('The workbook points to original task ' + id + ', which is not in this app, so those links were not added.'));
  noUrl.forEach(x => w.push(x + ' has no link in it, so it was skipped.'));
  rows.sort((a, b) => a[0] - b[0] || parseFloat(a[1].split('.')[1]) - parseFloat(b[1].split('.')[1]) || (a[5] === 'Everyone' ? 0 : 1) - (b[5] === 'Everyone' ? 0 : 1));
  return { rows: rows, warnings: w, summary: { links: rows.length, tasks: Object.keys(rows.reduce((o, r) => { o[r[1]] = 1; return o; }, {})).length, teamLeaderOnly: rows.filter(r => r[5] !== 'Everyone').length } };
}

function readCellGrid_(book, tab, range) {
  const res = Sheets.Spreadsheets.get(book, { ranges: [tab + '!' + range], fields: 'sheets.data.rowData.values(formattedValue,hyperlink,chipRuns)' });
  const data = (((res.sheets || [])[0] || {}).data || [])[0] || {};
  return (data.rowData || []).map(r => (r.values || []).map(v => ({ text: v.formattedValue || '', url: v.hyperlink || ((v.chipRuns || []).map(c => c.chip && c.chip.richLinkProperties && c.chip.richLinkProperties.uri).filter(Boolean)[0]) || '' })));
}

/** Run from the editor. dryRun = true (the default) only reports; importTaskLinks(false) writes. */
function importTaskLinks(dryRun) {
  const dry = dryRun !== false;
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    const grid = readCellGrid_(LINKS_SOURCE.linksBook, LINKS_SOURCE.linksTab, 'A1:K1500'), cat = readCellGrid_(LINKS_SOURCE.catalogueBook, LINKS_SOURCE.catalogueTab, 'A1:AU400');
    const res = buildTaskLinks_(grid, cat, ctx.db.tasks.map(t => t.id));
    const have = {}; ctx.db.resources.forEach(r => { have[[r.task, r.label, r.url].join('|')] = true; });
    const fresh = res.rows.filter(r => !have[[r[1], r[2], r[3]].join('|')]);
    const report = { wouldAdd: fresh.length, alreadyThere: res.rows.length - fresh.length, summary: res.summary, warnings: res.warnings, written: false };
    if (!dry && fresh.length) {
      const sh = sheet_('Resources'); sh.getRange(1, 6).setValue('Visible to');
      sh.getRange(sh.getLastRow() + 1, 1, fresh.length, 6).setValues(fresh);
      logAction_(ctx.me, 'Imported task links', '', '', fresh.length + ' links');
      report.written = true;
    }
    Logger.log(JSON.stringify(report, null, 1));
    return report;
  });
}
