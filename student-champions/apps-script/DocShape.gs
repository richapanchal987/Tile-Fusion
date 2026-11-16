/**
 * Module text, shaped for the app: the pure half of the doc sync (blocks in, HTML, answer boxes and reflection questions out).
 * No Google calls here, so it is tested in Node. DocSync.gs reads the doc and stores what this returns.
 * The rules (what to drop, cut, move or add) are in programme.json under docRules.
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
    let h = htmlEsc_(String(r.text || '').replace(/\u00a0/g, ' '));   // non-breaking spaces (pasted from websites) would glue words together
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
  '" data-s="' + (a.show ? 1 : 0) + '"' + (a.hint ? ' data-h="' + htmlEsc_(a.hint) + '"' : '') + (a.ph ? ' data-p="' + htmlEsc_(a.ph) + '"' : '') + '></div>';

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
    } else if (b.t === 'table' && !b.caption && (b.rows || []).length && b.rows.every(r => r.length === 1)) {
      out.push('<div class="docbox">' + b.rows.map(r => blocksToHtml_(r[0]).join('')).join('') + '</div>');
    } else if (b.t === 'table') {
      const w = Math.max.apply(null, (b.rows || []).map(r => r.length).concat([0]));
      const td = (cell, i, r) => (isMerged_(cell) ? '<td class="mrg">' : '<td' + (i === r.length - 1 && r.length < w ? ' colspan="' + (w - r.length + 1) + '"' : '') + '>') + blocksToHtml_(isMerged_(cell) ? [] : cell).join('') + '</td>';
      const rows = (b.rows || []).map(r => '<tr>' + r.map(td).join('') + '</tr>');
      if (!rows.length) return;
      const capHtml = b.capCell ? blocksToHtml_(b.capCell).join(' ').replace(/<\/?(p|h\d)>/g, '') : htmlEsc_(b.caption);   // keeps a link in the title
      const cap = b.caption ? '<caption>' + capHtml + '</caption>' : '';
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

const isMerged_ = cell => !!cell && cell.length === 1 && cell[0].t === 'merged';

/** Turns tables into what the app shows: title boxes become headings, empty response cells become answer boxes. */
function shapeTables_(blocks, opt, seen, answers) {
  const out = [];
  let caseName = '', cases = 0;                   // a case or scenario told in one table and answered in the next: boxes say which case
  blocks.forEach(b => {
    if (b.t !== 'table') { out.push(b); return; }
    const hadMerge = (b.rows || []).some(r => r.some(isMerged_));
    let rows = (b.rows || []).map(r => r.filter(c => !(isMerged_(c) && c[0].dir === 'col'))).filter(r => r.length);
    const width = Math.max.apply(null, rows.map(r => r.length).concat([0]));
    // Read without merge information: columns after the first that are empty in every row are what is left of merged cells
    if (!hadMerge && width >= 3 && rows.every(r => r.slice(1).every(c => !cellText_(c)))) rows = rows.map(r => r.slice(0, 1));
    const texts = rows.map(r => r.map(cellText_));
    const rule = (opt.tables || []).find(x => texts.some(r => r.some(t => lower_(t).indexOf(lower_(x.match)) === 0))) || {};
    const cm = /^((?:scenario|case)\s*(\d*))\s*:/i.exec((texts[0] || [''])[0]);
    if (cm) { cases++; caseName = cm[2] ? flat_(cm[1]) : cm[1].trim() + ' ' + cases; }
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
    const head = body[headRow] || [], colOf = name => head.findIndex(cell => lower_(cellText_(cell)) === lower_(name));
    const statusCol = rule.answers === 'column' ? colOf(rule.column) : -1;
    const box = (label, rows, more) => { const a = Object.assign({ t: 'ans', key: uniqueKey_(seen, 'a-' + hashKey_(label)), label: label, rows: rows, show: false }, more || {}); answers.push({ key: a.key, label: a.label }); return a; };
    let newRows = body.map((row, r) => row.map((cell, c) => {
      if (!opt.answers || isMerged_(cell) || rule.answers === 'none' || rule.answers === 'newColumn') return isMerged_(cell) ? [] : cell;
      if (rule.answers === 'column') {                               // only one column takes answers (a status), even where the doc already says "Not started"
        if (c !== statusCol || r === headRow || lower_(cellText_(row[0])) === lower_(cellText_(head[0]))) return cell;
        return [box(cellText_(row[1] || row[0]).slice(0, 120) + ' — ' + rule.column, 1, { ph: cellText_(cell) })];
      }
      if (rule.answers === 'labels') {                               // a short label such as "MYP:" gets a box beside it
        const t = cellText_(cell);
        return /^.{1,40}:$/.test(t) ? cell.concat([box((caption ? caption + ' — ' : '') + t.replace(/:$/, ''), 2)]) : (t ? cell : []);
      }
      if (cellText_(cell)) return cell;
      let label = cellLabel_(body, r, c, caption, headRow);
      const single = body.every(x => x.length === 1);
      label = label.replace(/^your task\s*—\s*/i, '').replace(/\s*—\s*(your )?response$/i, '');
      if (caseName && !cm && !/^(scenario|case)\b/i.test(label)) label = caseName + ' — ' + label;
      const cellOut = [box(label, single ? 6 : 3)];
      (opt.addAfter || []).forEach(rule => {
        if (lower_(label).indexOf(lower_(rule.match)) < 0) return;
        const pre = label.indexOf(' — ') > -1 ? label.split(' — ')[0] + ' — ' : '';
        rule.add.forEach(text => { const x = { t: 'ans', key: uniqueKey_(seen, 'a-' + hashKey_(label + '|' + text)), label: text, rows: 6, show: true }; answers.push({ key: x.key, label: pre + text }); cellOut.push(x); });
      });
      return cellOut;
    }));
    if (opt.answers && rule.answers === 'newColumn') {                // a column added for the trainee's answers
      newRows = newRows.map((row, r) => r === headRow ? row.concat([[{ t: 'p', runs: [{ text: rule.head, b: true }] }]])
        : row.concat([[box(cellText_(row[row.length - 1] || row[0]).replace(/\s*:\s*$/, '') + ' — ' + rule.head, 1)]]));
    }
    out.push({ t: 'table', caption: caption, capCell: caption ? rows[0][0] : null, rows: newRows });
  });
  return out;
}

/** Applies the rules to one section. Returns the blocks to show, its answer boxes and its reflection questions. */
function shapeSection_(title, blocks, rules, isTask) {
  rules = rules || {};
  const key = docKey_(title), forMe = r => docKey_(r.section) === key, seen = {}, answers = [];
  const drops = (rules.dropParagraphs || []).map(x => new RegExp(x, 'i'));
  let bs = blocks.filter(b => !((b.t === 'p' || b.t === 'li') && drops.some(re => re.test(blockText_(b)))));
  let timeline = '';
  (rules.cut || []).filter(forMe).forEach(rule => {
    const i = findFrom_(bs, rule.from, 0, rule.exact);
    if (i < 0) return;
    const j = rule.to ? findFrom_(bs, rule.to, i + 1) : -1;
    const cut = bs.splice(i, (j < 0 ? bs.length : j) - i), tb = cut.find(x => x.t === 'table');
    if (rule.keep === 'timeline' && tb) timeline = tb.rows.slice(1).map(r => r.map(cellText_).filter(Boolean).join(': ')).filter(Boolean).join('\n');   // the doc's stages start the TL's timeline
  });
  let reflection = [];
  (rules.reflection || []).filter(forMe).forEach(rule => { reflection = reflection.concat(takeReflection_(bs, rule, seen)); });
  const opt = {
    answers: !!isTask,
    dropTables: Object.keys(rules.dropTables || {}).filter(k => docKey_(k) === key).reduce((a, k) => a.concat(rules.dropTables[k]), []),
    toInstructions: (rules.tablesToInstructions || []).some(x => docKey_(x) === key),
    tables: (rules.tables || []).filter(forMe),
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
  return { blocks: bs, answers: answers, reflection: reflection, timeline: timeline };
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
    const parts = partsOf_(blocksToHtml_(shaped.blocks));
    // a section whose text was all moved out (for example into the Reflection section) is still found
    return { title: s.title, key: s.key, parts: parts.length ? parts : [''], answers: shaped.answers, reflection: shaped.reflection, timeline: shaped.timeline };
  });
}
