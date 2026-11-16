/**
 * Module text from the Google Doc.
 * The doc is the source: each section is a TAB of the doc, named for its section ("Case Studies: 1", "POCSO, CPP & SPACE Model", ...).
 * (A doc without tabs can use Title-style headings instead.)
 * An admin presses "Refresh from the doc" (and a nightly trigger does the same) to copy the text into the Content tab, so
 * trainees read it inside the app and never need access to the doc. Each task and module names its section in its
 * "Module text (doc section)" field; a refresh reports any name it cannot find.
 *
 * DocShape.gs turns the doc's blocks into HTML, answer boxes and reflection questions; this file reads the doc and stores the result.
 */

/* ---------------- Reading the Google Doc ---------------- */

function headingKey_(h) {
  const H = DocumentApp.ParagraphHeading;
  return h === H.TITLE ? 'title' : h === H.HEADING1 ? 'h1' : h === H.HEADING2 ? 'h2' : h === H.HEADING3 ? 'h3' : (h === H.HEADING4 || h === H.HEADING5 || h === H.HEADING6) ? 'h4' : '';
}

function runsOf_(textEl) {
  const text = textEl.getText();
  if (!text) return [];
  const idx = textEl.getTextAttributeIndices(), runs = [];
  for (let k = 0; k < idx.length; k++) {
    const start = idx[k], end = k + 1 < idx.length ? idx[k + 1] : text.length;
    if (end > start) runs.push({ text: text.slice(start, end), b: !!textEl.isBold(start), i: !!textEl.isItalic(start), link: textEl.getLinkUrl(start) || '' });
  }
  return runs;
}

/** Smart chips that link to a file or page (for example a PDF in Drive) carry their title and link outside the text. */
function chipRuns_(el, have) {
  const T = DocumentApp.ElementType, out = [];
  if (!T.RICH_LINK || !el.getNumChildren) return out;
  for (let i = 0; i < el.getNumChildren(); i++) {
    const c = el.getChild(i);
    if (c.getType() !== T.RICH_LINK) continue;
    const rl = c.asRichLink(), url = rl.getUrl() || '', title = String(rl.getTitle() || url).replace(/\.(pdf|docx?|pptx?|xlsx?)$/i, '');
    if (title && have.indexOf(title) < 0) out.push({ text: (have || out.length ? ' ' : '') + title, b: false, i: false, link: url });
  }
  return out;
}
const span_ = (cell, fn) => { try { return typeof cell[fn] === 'function' ? Number(cell[fn]()) : 1; } catch (e) { return 1; } };

function elementBlocks_(el) {
  const T = DocumentApp.ElementType, G = DocumentApp.GlyphType, type = el.getType(), out = [];
  if (type === T.PARAGRAPH) {
    const p = el.asParagraph(), runs = runsOf_(p.editAsText());
    out.push({ t: 'p', h: headingKey_(p.getHeading()), runs: runs.concat(chipRuns_(p, runsText_(runs))) });
    for (let i = 0; i < p.getNumChildren(); i++) if (p.getChild(i).getType() === T.INLINE_IMAGE) out.push({ t: 'img' });
  } else if (type === T.LIST_ITEM) {
    const li = el.asListItem(), g = li.getGlyphType();
    const ordered = [G.NUMBER, G.LATIN_UPPER, G.LATIN_LOWER, G.ROMAN_UPPER, G.ROMAN_LOWER].indexOf(g) > -1;
    const runs = runsOf_(li.editAsText());
    out.push({ t: 'li', level: li.getNestingLevel(), ordered: ordered, runs: runs.concat(chipRuns_(li, runsText_(runs))) });
  } else if (type === T.TABLE) {
    // A merged cell comes back as the first cell plus empty ones for the cells merged into it. Mark those, so they never become answer boxes.
    const tb = el.asTable(), rows = [], down = {};
    for (let r = 0; r < tb.getNumRows(); r++) {
      const row = tb.getRow(r), cells = [];
      let across = 0;
      for (let c = 0; c < row.getNumCells(); c++) {
        const cell = row.getCell(c), blocks = [], cs = span_(cell, 'getColSpan'), rs = span_(cell, 'getRowSpan');
        if (across > 0 || cs === 0) { across = Math.max(0, across - 1); cells.push([{ t: 'merged', dir: 'col' }]); continue; }
        if (down[c] > 0 || rs === 0) { down[c] = Math.max(0, (down[c] || 0) - 1); cells.push([{ t: 'merged', dir: 'row' }]); continue; }
        if (cs > 1) across = cs - 1;
        if (rs > 1) down[c] = rs - 1;
        for (let i = 0; i < cell.getNumChildren(); i++) elementBlocks_(cell.getChild(i)).forEach(b => blocks.push(b));
        cells.push(blocks);
      }
      rows.push(cells);
    }
    out.push({ t: 'table', rows: rows });
  }
  return out;
}

/** Every tab of the doc, in order, as {title, body}. A parent tab comes before its child tabs. */
function docTabs_(doc) {
  if (typeof doc.getTabs === 'function') {
    const out = [];
    const walk = tabs => tabs.forEach(tab => {
      try { out.push({ title: String(tab.getTitle() || '').trim(), body: tab.asDocumentTab().getBody() }); } catch (e) { /* not a document tab */ }
      walk(tab.getChildTabs());
    });
    walk(doc.getTabs());
    if (out.length) return out;
  }
  return [{ title: '', body: doc.getBody() }];
}

/**
 * The doc as blocks. In a doc with several tabs, each tab is a section and its tab name is the section title
 * (this is how the Student Champion module is laid out). A Title-style heading inside any tab also starts a section,
 * which is how a doc without tabs works.
 */
function readDocBlocks_(docId) {
  let doc;
  try { doc = DocumentApp.openById(docId); }
  catch (e) {
    const why = String((e && e.message) || e);
    throw new Error(/permission|authori[sz]/i.test(why) && /documents/i.test(why)
      ? 'The app has not been given permission to read Google Docs yet. Run the function again and approve the permission box, or check that appsscript.json lists https://www.googleapis.com/auth/documents. (' + why + ')'
      : 'The app could not open the module document (' + why + '). Share it with ' + (Session.getEffectiveUser().getEmail() || 'the app owner') + ' (view access is enough) and try again.');
  }
  const tabs = docTabs_(doc), blocks = [], useNames = tabs.length > 1;
  tabs.forEach(tab => {
    if (useNames && tab.title) blocks.push({ t: 'p', h: 'title', runs: [{ text: tab.title }] });
    for (let i = 0; i < tab.body.getNumChildren(); i++) elementBlocks_(tab.body.getChild(i)).forEach(b => blocks.push(b));
  });
  return blocks;
}

/* ---------------- Refresh ---------------- */

function syncStatus_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('DOC_SYNC') || 'null'); } catch (e) { return null; }
}

/** Copies the doc into the Content tab. Nothing is changed unless the whole doc was read and split successfully. */
function syncModuleText_(by) {
  const db = readDb_(), taskKeys = {};
  db.tasks.filter(t => t.active && t.doc).forEach(t => { taskKeys[docKey_(t.doc)] = true; });
  const sections = docBlocksToSections_(readDocBlocks_(PROGRAMME.app.moduleDocId), PROGRAMME.docRules || {}, taskKeys);
  if (!sections.length) throw new Error('The document has no sections: no tabs with names and no Title-style headings. Nothing was changed.');
  const rows = [], prompts = [];
  sections.forEach(s => {
    s.parts.forEach((h, i) => rows.push([s.key, i + 1, s.title, h]));
    s.answers.forEach((a, i) => prompts.push([s.key, 'a', a.key, a.label, '', i + 1]));
    s.reflection.forEach((r, i) => prompts.push([s.key, 'r', r.key, r.label, r.group || '', i + 1]));
    if (s.timeline) prompts.push([s.key, 't', 't-timeline', s.timeline, '', 1]);
  });
  // Answer boxes that are gone from the doc keep their label (kind 'o'), so answers typed into them still show, as earlier answers
  const now = {};
  prompts.forEach(x => { now[x[0] + '|' + x[2]] = true; });
  rows_('Prompts').filter(r => (r[1] === 'a' || r[1] === 'o') && !now[r[0] + '|' + r[2]]).forEach(r => { now[r[0] + '|' + r[2]] = true; prompts.push([r[0], 'o', r[2], r[3], '', 0]); });
  replaceRows_('Content', rows);
  replaceRows_('Prompts', prompts);
  const have = {}, bySection = {};
  sections.forEach(s => { have[s.key] = true; bySection[s.key] = s; });
  const wanted = {};
  const missing = [];
  db.tasks.filter(t => t.active && t.doc).forEach(t => { wanted[docKey_(t.doc)] = true; if (!have[docKey_(t.doc)]) missing.push('Task ' + t.id + ' (' + t.doc + ')'); });
  db.topics.filter(t => t.doc).forEach(t => { wanted[docKey_(t.doc)] = true; if (!have[docKey_(t.doc)]) missing.push('Module ' + t.id + ' (' + t.doc + ')'); });
  Object.keys(PROGRAMME.docSections).forEach(k => { wanted[docKey_(PROGRAMME.docSections[k])] = true; if (!have[docKey_(PROGRAMME.docSections[k])]) missing.push(PROGRAMME.docSections[k]); });
  const unused = sections.filter(s => !wanted[s.key]).map(s => s.title);
  const perTask = db.tasks.filter(t => t.active && t.doc && have[docKey_(t.doc)]).map(t => {
    const s = bySection[docKey_(t.doc)];
    return { id: t.id, answers: s.answers.length, reflection: s.reflection.length };
  });
  const meta = { at: nowStamp_(), by: by, sections: sections.length, characters: rows.reduce((a, r) => a + String(r[3]).length, 0), missing: missing, unused: unused, tasks: perTask };
  PropertiesService.getScriptProperties().setProperty('DOC_SYNC', JSON.stringify(meta));
  return meta;
}

/** The "Refresh from the doc" button. */
function refreshModuleText() {
  return withLock_(() => {
    const ctx = context_(); requireAdmin_(ctx.me);
    const meta = syncModuleText_(ctx.me.email);
    logAction_(ctx.me, 'Refreshed module text', '', '', meta.sections + ' sections, ' + meta.missing.length + ' not found');
    return getBootstrap();
  });
}

/** Run by the nightly trigger. No signed-in user, so it only ever reads the doc and writes the Content tab. */
function refreshModuleTextNightly() {
  const who = norm_(Session.getActiveUser().getEmail());
  if (who && !readStaff_().some(s => s.email === who && s.role === 'Admin')) throw new Error('Only an admin can do this.');   // this function is also reachable from the page
  withLock_(() => {
    const meta = syncModuleText_('nightly refresh');
    append_('Log', [nowStamp_(), 'nightly refresh', 'Refreshed module text', '', '', meta.sections + ' sections, ' + meta.missing.length + ' not found']);
  });
}

/** Called by setup(). Safe to run again: it replaces its own trigger. */
function installNightlyRefresh_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'refreshModuleTextNightly').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshModuleTextNightly').timeBased().everyDays(1).atHour(2).create();
}

/** One section of the module, for a task, module or the guide. Any signed-in trainee or staff member can read it. Reads only that section's rows. */
function getContent(title) {
  if (meLight_().role === 'None') throw new Error('You are not enrolled.');
  const key = docKey_(title), sh = sheet_('Content'), n = sh.getLastRow() - 1;
  const at = [];
  if (n > 0) sh.getRange(2, 1, n, 1).getValues().forEach((r, i) => { if (String(r[0]) === key) at.push(i + 2); });
  if (!at.length) return { found: false, title: String(title || '') };
  const rows = at.map(r => sh.getRange(r, 1, 1, 4).getValues()[0]).sort((a, b) => num_(a[1]) - num_(b[1]));
  return { found: true, title: String(rows[0][2]), html: rows.map(r => String(r[3])).join('') };
}
