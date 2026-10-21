/**
 * Module text from the Google Doc.
 * The doc is the source: each section is a TAB of the doc, named for its section ("Case Studies: 1", "POCSO, CPP & SPACE Model", ...).
 * (A doc without tabs can use Title-style headings instead.)
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
const flat_ = s => String(s || '').replace(/\s+/g, ' ').trim();
const lower_ = s => flat_(s).toLowerCase();

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
const cellText_ = cell => flat_((cell || []).map(blockText_).join(' '));
function blockText_(b) {
  if (!b) return '';
  if (b.t === 'p' || b.t === 'li') return flat_(runsText_(b.runs));
  if (b.t === 'table') return flat_((b.rows || []).map(r => r.map(cellText_).join(' ')).join(' '));
  return '';
}
const isBold_ = b => { const rs = (b.runs || []).filter(r => r.text.trim()); return rs.length > 0 && rs.every(r => r.b); };
const isHeadingish_ = b => (b.t === 'p' && ((b.h && b.h !== 'title') || isBold_(b))) || (b.t === 'li' && isBold_(b));

/** A short stable key from a text, so a saved answer stays with its question when the doc is refreshed. */
function hashKey_(s) {
  let h = 5381; s = String(s);
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function uniqueKey_(seen, base) {
  seen[base] = (seen[base] || 0) + 1;
  return seen[base] > 1 ? base + '-' + seen[base] : base;
}

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

/** An answer box marker. The page turns it into a text box (for the trainee) or the saved answer (for everyone else). */
const ansHtml_ = a => '<div class="ansbox" data-k="' + htmlEsc_(a.key) + '" data-l="' + htmlEsc_(a.label) + '" data-r="' + (a.rows || 3) +
  '" data-s="' + (a.show ? 1 : 0) + '"' + (a.hint ? ' data-h="' + htmlEsc_(a.hint) + '"' : '') + '></div>';

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
    } else if (b.t === 'ans') {
      out.push(ansHtml_(b));
    } else if (b.t === 'cap') {
      out.push('<h4 class="dochead">' + htmlEsc_(b.text) + '</h4>');
    } else if (b.t === 'table') {
      const rows = (b.rows || []).map(r => '<tr>' + r.map(cell => '<td>' + blocksToHtml_(cell).join('') + '</td>').join('') + '</tr>');
      if (!rows.length) return;
      const cap = b.caption ? '<caption>' + htmlEsc_(b.caption) + '</caption>' : '';
      let group = [], size = 0, first = true;
      const emit = () => { if (group.length) { out.push('<table>' + (first ? cap : '') + '<tbody>' + group.join('') + '</tbody></table>'); group = []; size = 0; first = false; } };
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

/* ---------------- Rules: how the doc is shaped for the app (see docRules in programme.json) ---------------- */

const startsWith_ = (b, text, exact) => { const t = lower_(blockText_(b)).replace(/[:.]+$/, ''), w = lower_(text).replace(/[:.]+$/, ''); return exact ? t === w : t.indexOf(w) === 0; };
const findFrom_ = (blocks, text, start, exact) => { for (let i = start || 0; i < blocks.length; i++) if (startsWith_(blocks[i], text, exact)) return i; return -1; };

/** Takes reflection questions out of the module text. Returns the questions; `blocks` is changed in place. */
function takeReflection_(blocks, rule, seen) {
  const out = [];
  let from = 0, n = 0;
  for (;;) {
    let i = findFrom_(blocks, rule.from, from, rule.exact);
    if (i < 0) break;
    n++;
    const prefix = rule.label ? rule.label.replace('{n}', n) : '';
    let start = i, end;
    if (rule.single) end = i + 1;
    else { const j = rule.to ? findFrom_(blocks, rule.to, i + 1) : -1; end = j < 0 ? blocks.length : j; }
    if (rule.prev && start > 0 && isHeadingish_(blocks[start - 1])) start--;
    const add = (q, group) => { q = flat_(q).replace(/^[\-–•]\s*/, ''); if (q) out.push({ key: uniqueKey_(seen, 'r-' + hashKey_(group + '|' + q)), label: q, group: group }); };
    if (rule.single) {
      const t = blockText_(blocks[i]), body = t.indexOf(':') > -1 ? t.slice(t.indexOf(':') + 1) : t;
      body.split(rule.split || '\n').forEach(q => add(q, prefix));
    } else {
      let group = prefix;
      for (let k = i + 1; k < end; k++) {
        const b = blocks[k], t = blockText_(b);
        if (!t) continue;
        if (isHeadingish_(b) && b.t !== 'table') { const g = (rule.labels && rule.labels[t]) || t.replace(/:$/, ''); group = prefix ? prefix + ': ' + g : g; continue; }
        if (b.t === 'li' && !/:$/.test(t)) add(t, group);
      }
    }
    blocks.splice(start, end - start);
    from = start;
    if (!rule.every) break;
  }
  return out;
}

/** The text a response cell answers, from the cells around it. */
function cellLabel_(rows, r, c, caption, headRow) {
  const row = rows[r], single = rows.every(x => x.length === 1);
  let above = '';
  for (let k = r - 1; k >= 0 && !above; k--) if (rows[k][c]) above = cellText_(rows[k][c]);
  if (!above && rows[r - 1]) above = cellText_(rows[r - 1][0]);
  let label;
  if (single) {                                  // a one-column box: the prompt is the text just above, in the context of the first row (a scenario or case)
    label = above || 'Response';
    const first = cellText_(rows[0][0]);
    if (r >= 2 && first && first !== above) {
      const m = /^((?:scenario|case)\s*\d*)\s*:/i.exec(first);
      label = (m ? m[1] : first.slice(0, 60) + (first.length > 60 ? '…' : '')) + ' — ' + label;
    }
  } else {
    const rowLabel = c > 0 ? cellText_(row[0]) : '';
    const colHead = r > headRow && rows[headRow] && rows[headRow][c] ? cellText_(rows[headRow][c]) : '';
    label = rowLabel && colHead && rowLabel !== colHead ? rowLabel + ' — ' + colHead : (rowLabel || colHead || above || 'Response');
  }
  if (caption && label.indexOf(caption) < 0) label = caption + ' — ' + label;
  label = label.replace(/:\s*$/, '');
  return label.length > 300 ? label.slice(0, 297) + '…' : label;
}

/** Turns tables into what the app shows: title boxes become headings, empty response cells become answer boxes. */
function shapeTables_(blocks, opt, seen, answers) {
  const out = [];
  blocks.forEach(b => {
    if (b.t !== 'table') { out.push(b); return; }
    const rows = (b.rows || []).filter(r => r.length);
    const texts = rows.map(r => r.map(cellText_));
    if (!rows.length || texts.every(r => r.every(t => !t))) return;                       // an empty table: leave it out
    if (opt.dropTables && opt.dropTables.some(p => texts.some(r => r.some(t => lower_(t).indexOf(lower_(p)) === 0)))) return;
    if (opt.toInstructions) {                                                             // keep only the instructions written in the header
      (rows[0] || []).forEach((cell, c) => { if (texts[0][c].length > 60) cell.forEach(x => out.push(x)); });
      return;
    }
    if (rows.length === 1 && rows[0].length === 1) { out.push({ t: 'cap', text: texts[0][0] }); return; }    // a one-cell title box
    let caption = '', body = rows, headRow = 0;
    if (rows[0].length === 1 && rows.length > 1 && texts[0][0] && texts[0][0].length <= 120 && rows[1].length > 1) { caption = texts[0][0]; body = rows.slice(1); }
    else if (rows[0].length === 1 && rows.length > 1 && texts[0][0] && texts[0][0].length <= 80 && /^[^a-z]*$/.test(texts[0][0])) { caption = texts[0][0]; body = rows.slice(1); }
    const newRows = body.map((row, r) => row.map((cell, c) => {
      if (!opt.answers || cellText_(cell)) return cell;
      const label = cellLabel_(body, r, c, caption, headRow), single = body.every(x => x.length === 1);
      const a = { t: 'ans', key: uniqueKey_(seen, 'a-' + hashKey_(label)), label: label, rows: single ? 6 : 3, show: false };
      answers.push({ key: a.key, label: label });
      const cellOut = [a];
      (opt.addAfter || []).forEach(rule => {
        if (lower_(label).indexOf(lower_(rule.match)) < 0) return;
        const pre = label.indexOf(' — ') > -1 ? label.split(' — ')[0] + ' — ' : '';
        rule.add.forEach(text => { const x = { t: 'ans', key: uniqueKey_(seen, 'a-' + hashKey_(label + '|' + text)), label: text, rows: 6, show: true }; answers.push({ key: x.key, label: pre + text }); cellOut.push(x); });
      });
      return cellOut;
    }));
    out.push({ t: 'table', caption: caption, rows: newRows });
  });
  return out;
}

/** Applies the rules to one section. Returns the blocks to show, its answer boxes and its reflection questions. */
function shapeSection_(title, blocks, rules, isTask) {
  rules = rules || {};
  const key = docKey_(title), forMe = r => docKey_(r.section) === key, seen = {}, answers = [];
  const drops = (rules.dropParagraphs || []).map(x => new RegExp(x, 'i'));
  let bs = blocks.filter(b => !((b.t === 'p' || b.t === 'li') && drops.some(re => re.test(blockText_(b)))));
  (rules.cut || []).filter(forMe).forEach(rule => {
    const i = findFrom_(bs, rule.from, 0, rule.exact);
    if (i < 0) return;
    const j = rule.to ? findFrom_(bs, rule.to, i + 1) : -1;
    bs.splice(i, (j < 0 ? bs.length : j) - i);
  });
  let reflection = [];
  (rules.reflection || []).filter(forMe).forEach(rule => { reflection = reflection.concat(takeReflection_(bs, rule, seen)); });
  const opt = {
    answers: !!isTask,
    dropTables: Object.keys(rules.dropTables || {}).filter(k => docKey_(k) === key).reduce((a, k) => a.concat(rules.dropTables[k]), []),
    toInstructions: (rules.tablesToInstructions || []).some(x => docKey_(x) === key),
    addAfter: (rules.addAnswersAfter || []).filter(r => (r.sections || []).some(x => docKey_(x) === key))
  };
  if (isTask) (rules.listAnswers || []).filter(forMe).forEach(rule => {      // a list of situations, each answered in its own box
    const i = findFrom_(bs, rule.from, 0, rule.exact);
    if (i < 0) return;
    const j = rule.to ? findFrom_(bs, rule.to, i + 1) : -1, end = j < 0 ? bs.length : j, made = [];
    let n = 0;
    for (let k = i + 1; k < end; k++) {
      const b = bs[k];
      if (b.t !== 'li') { made.push(b); continue; }
      n++;
      const text = blockText_(b), a = { t: 'ans', key: uniqueKey_(seen, 'a-' + hashKey_(text)), label: n + '. ' + text, hint: rule.hint || '', rows: 3, show: false };
      made.push({ t: 'p', runs: [{ text: n + '. ' + text, b: true }] }, a);
      answers.push({ key: a.key, label: a.label });
    }
    bs.splice(i + 1, end - i - 1, ...made);
  });
  bs = shapeTables_(bs, opt, seen, answers);
  Object.keys(rules.appendAnswers || {}).filter(k => docKey_(k) === key && isTask).forEach(k => rules.appendAnswers[k].forEach(x => {
    const a = { t: 'ans', key: uniqueKey_(seen, 'a-' + hashKey_(x[0])), label: x[0], hint: x[1] || '', rows: 8, show: true };
    answers.push({ key: a.key, label: x[0] }); bs.push(a);
  }));
  return { blocks: bs, answers: answers, reflection: reflection };
}

/**
 * Splits the whole document into sections at each Title paragraph (a tab name becomes one too). Text before the first Title is ignored.
 * rules: programme.json docRules. taskKeys: {sectionKey: true} for sections that belong to a task (only those get answer boxes).
 */
function docBlocksToSections_(blocks, rules, taskKeys) {
  const sections = [];
  let cur = null;
  (blocks || []).forEach(b => {
    if (b.t === 'p' && b.h === 'title' && runsText_(b.runs).trim()) {
      cur = { title: runsText_(b.runs).trim(), key: docKey_(runsText_(b.runs)), blocks: [] };
      sections.push(cur);
    } else if (cur) cur.blocks.push(b);
  });
  return sections.map(s => {
    const shaped = shapeSection_(s.title, s.blocks, rules, !!(taskKeys && taskKeys[s.key]));
    return { title: s.title, key: s.key, parts: partsOf_(blocksToHtml_(shaped.blocks)), answers: shaped.answers, reflection: shaped.reflection };
  });
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
  });
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
