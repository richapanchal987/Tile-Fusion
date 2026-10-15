/**
 * Module text from the Google Doc.
 * The doc is the source: every section starts with a Title-style heading ("Case Studies: 1", "POCSO, CPP & SPACE Model", ...).
 * An admin presses "Refresh from the doc" (and a nightly trigger does the same) to copy the text into the Content tab, so
 * trainees read it inside the app and never need access to the doc. Each task and module names its section in its
 * "Module text (doc section)" field; a refresh reports any name it cannot find.
 *
 * The first half of this file is pure (blocks in, HTML out) and is tested in Node. The second half talks to Google.
 */

const DOC_MAX_PART = 45000;   // a Sheet cell holds at most 50,000 characters

/** A title reduced to letters and digits, so "Q&A" and "Q & A" match. */
function docKey_(title) {
  return String(title || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

const htmlEsc_ = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function runsHtml_(runs) {
  return (runs || []).map(r => {
    let h = htmlEsc_(r.text);
    if (!h) return '';
    if (r.b) h = '<strong>' + h + '</strong>';
    if (r.i) h = '<em>' + h + '</em>';
    if (r.link && /^(https?:\/\/|mailto:)/i.test(r.link)) h = '<a href="' + htmlEsc_(r.link) + '" target="_blank" rel="noopener">' + h + '</a>';
    return h;
  }).join('');
}
const runsText_ = runs => (runs || []).map(r => r.text).join('');

/** Nested lists from flat items [{level, ordered, html}]. */
function listHtml_(items) {
  let i = 0;
  const build = level => {
    const ordered = items[i].ordered;
    let out = ordered ? '<ol>' : '<ul>', open = false;
    while (i < items.length && items[i].level >= level) {
      if (items[i].level > level && open) { out += build(level + 1); }            // a deeper item goes inside the previous one
      else { if (open) out += '</li>'; out += '<li>' + items[i].html; open = true; i++; }
    }
    if (open) out += '</li>';
    return out + (ordered ? '</ol>' : '</ul>');
  };
  let out = '';
  while (i < items.length) out += build(items[i].level);
  return out;
}

const HEADING_TAG = { h1: 'h3', h2: 'h4', h3: 'h5', h4: 'h6' };

/** Top-level HTML strings for a list of blocks. A table too long for one cell is split into several tables. */
function blocksToHtml_(blocks) {
  const out = [];
  let list = [];
  const flush = () => { if (list.length) { out.push(listHtml_(list)); list = []; } };
  (blocks || []).forEach(b => {
    if (b.t === 'li') {
      const h = runsHtml_(b.runs);
      if (h) list.push({ level: Math.max(0, b.level || 0), ordered: !!b.ordered, html: h });
      return;
    }
    flush();
    if (b.t === 'p') {
      const text = runsText_(b.runs).trim();
      if (!text) return;
      // Body text styled as a heading in the doc (long) is shown as a paragraph, not a heading.
      const tag = b.h && b.h !== 'title' && HEADING_TAG[b.h] && text.length <= 140 ? HEADING_TAG[b.h] : 'p';
      out.push('<' + tag + '>' + runsHtml_(b.runs) + '</' + tag + '>');
    } else if (b.t === 'img') {
      out.push('<p class="imgnote">[A picture in the doc is not shown here.]</p>');
    } else if (b.t === 'table') {
      const rows = (b.rows || []).map(r => '<tr>' + r.map(cell => '<td>' + blocksToHtml_(cell).join('') + '</td>').join('') + '</tr>');
      if (!rows.length) return;
      let group = [], size = 0;
      const emit = () => { if (group.length) { out.push('<table><tbody>' + group.join('') + '</tbody></table>'); group = []; size = 0; } };
      rows.forEach(r => { if (size + r.length > DOC_MAX_PART - 500 && group.length) emit(); group.push(r); size += r.length; });
      emit();
    }
  });
  flush();
  return out;
}

/** Groups top-level HTML strings into pieces that fit one cell each. */
function partsOf_(htmls) {
  const parts = [];
  let cur = '';
  htmls.forEach(h => {
    if (cur && cur.length + h.length > DOC_MAX_PART) { parts.push(cur); cur = ''; }
    cur += h;
  });
  if (cur) parts.push(cur);
  return parts;
}

/** Splits the whole document into sections at each Title paragraph. Text before the first Title is ignored. */
function docBlocksToSections_(blocks) {
  const sections = [];
  let cur = null;
  (blocks || []).forEach(b => {
    if (b.t === 'p' && b.h === 'title' && runsText_(b.runs).trim()) {
      cur = { title: runsText_(b.runs).trim(), key: docKey_(runsText_(b.runs)), blocks: [] };
      sections.push(cur);
    } else if (cur) cur.blocks.push(b);
  });
  return sections.map(s => ({ title: s.title, key: s.key, parts: partsOf_(blocksToHtml_(s.blocks)) }));
}

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

function elementBlocks_(el) {
  const T = DocumentApp.ElementType, G = DocumentApp.GlyphType, type = el.getType(), out = [];
  if (type === T.PARAGRAPH) {
    const p = el.asParagraph();
    out.push({ t: 'p', h: headingKey_(p.getHeading()), runs: runsOf_(p.editAsText()) });
    for (let i = 0; i < p.getNumChildren(); i++) if (p.getChild(i).getType() === T.INLINE_IMAGE) out.push({ t: 'img' });
  } else if (type === T.LIST_ITEM) {
    const li = el.asListItem(), g = li.getGlyphType();
    const ordered = [G.NUMBER, G.LATIN_UPPER, G.LATIN_LOWER, G.ROMAN_UPPER, G.ROMAN_LOWER].indexOf(g) > -1;
    out.push({ t: 'li', level: li.getNestingLevel(), ordered: ordered, runs: runsOf_(li.editAsText()) });
  } else if (type === T.TABLE) {
    const tb = el.asTable(), rows = [];
    for (let r = 0; r < tb.getNumRows(); r++) {
      const row = tb.getRow(r), cells = [];
      for (let c = 0; c < row.getNumCells(); c++) {
        const cell = row.getCell(c), blocks = [];
        for (let i = 0; i < cell.getNumChildren(); i++) elementBlocks_(cell.getChild(i)).forEach(b => blocks.push(b));
        cells.push(blocks);
      }
      rows.push(cells);
    }
    out.push({ t: 'table', rows: rows });
  }
  return out;
}

/** Every tab of the doc, in order (a doc can hold several tabs). */
function docBodies_(doc) {
  if (typeof doc.getTabs === 'function') {
    const bodies = [];
    const walk = tabs => tabs.forEach(tab => {
      try { bodies.push(tab.asDocumentTab().getBody()); } catch (e) { /* not a document tab */ }
      walk(tab.getChildTabs());
    });
    walk(doc.getTabs());
    if (bodies.length) return bodies;
  }
  return [doc.getBody()];
}

function readDocBlocks_(docId) {
  let doc;
  try { doc = DocumentApp.openById(docId); }
  catch (e) { throw new Error('The app\'s owner cannot open the module document. Share it with ' + (Session.getEffectiveUser().getEmail() || 'the owner') + ' (view access is enough) and try again.'); }
  const blocks = [];
  docBodies_(doc).forEach(body => { for (let i = 0; i < body.getNumChildren(); i++) elementBlocks_(body.getChild(i)).forEach(b => blocks.push(b)); });
  return blocks;
}

/* ---------------- Refresh ---------------- */

function syncStatus_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('DOC_SYNC') || 'null'); } catch (e) { return null; }
}

/** Copies the doc into the Content tab. Nothing is changed unless the whole doc was read and split successfully. */
function syncModuleText_(by) {
  const sections = docBlocksToSections_(readDocBlocks_(PROGRAMME.app.moduleDocId));
  if (!sections.length) throw new Error('The document has no Title-style headings, so no sections were found. Nothing was changed.');
  const rows = [];
  sections.forEach(s => s.parts.forEach((h, i) => rows.push([s.key, i + 1, s.title, h])));
  replaceRows_('Content', rows);
  const db = readDb_(), have = {};
  sections.forEach(s => { have[s.key] = true; });
  const wanted = {};
  const missing = [];
  db.tasks.filter(t => t.active && t.doc).forEach(t => { wanted[docKey_(t.doc)] = true; if (!have[docKey_(t.doc)]) missing.push('Task ' + t.id + ' (' + t.doc + ')'); });
  db.topics.filter(t => t.doc).forEach(t => { wanted[docKey_(t.doc)] = true; if (!have[docKey_(t.doc)]) missing.push('Module ' + t.id + ' (' + t.doc + ')'); });
  Object.keys(PROGRAMME.docSections).forEach(k => { wanted[docKey_(PROGRAMME.docSections[k])] = true; if (!have[docKey_(PROGRAMME.docSections[k])]) missing.push(PROGRAMME.docSections[k]); });
  const unused = sections.filter(s => !wanted[s.key]).map(s => s.title);
  const meta = { at: nowStamp_(), by: by, sections: sections.length, characters: rows.reduce((a, r) => a + String(r[3]).length, 0), missing: missing, unused: unused };
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
    sheet_('Log').appendRow([nowStamp_(), 'nightly refresh', 'Refreshed module text', '', '', meta.sections + ' sections, ' + meta.missing.length + ' not found']);
  });
}

/** Called by setup(). Safe to run again: it replaces its own trigger. */
function installNightlyRefresh_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'refreshModuleTextNightly').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshModuleTextNightly').timeBased().everyDays(1).atHour(2).create();
}

/** One section of the module, for a task, module or the guide. Any signed-in trainee or staff member can read it. */
function getContent(title) {
  const db = readDb_();
  if (meFromDb_(db).role === 'None') throw new Error('You are not enrolled.');
  const key = docKey_(title);
  const rows = rows_('Content').filter(r => String(r[0]) === key).sort((a, b) => num_(a[1]) - num_(b[1]));
  if (!rows.length) return { found: false, title: String(title || '') };
  return { found: true, title: String(rows[0][2]), html: rows.map(r => String(r[3])).join('') };
}
