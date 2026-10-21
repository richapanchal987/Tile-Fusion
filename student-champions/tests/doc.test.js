// The converter that turns the Google Doc into safe HTML. Run: node tests/doc.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'apps-script');
const D = vm.runInNewContext(['Config.gs', 'Logic.gs', 'DocSync.gs'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') + ';({ docKey_, docBlocksToSections_, blocksToHtml_, listHtml_, DOC_MAX_PART })', {});
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const p = (text, h, extra) => Object.assign({ t: 'p', h: h || '', runs: [{ text }] }, extra);
const li = (text, level, ordered) => ({ t: 'li', level: level || 0, ordered: !!ordered, runs: [{ text }] });
const title = x => p(x, 'title');

t('section keys ignore case, spacing and punctuation, and "&" means "and"', () => {
  assert.strictEqual(D.docKey_('Q&A'), D.docKey_('Q & A'));
  assert.strictEqual(D.docKey_('POCSO, CPP & SPACE Model'), D.docKey_('pocso cpp and space model'));
  assert.notStrictEqual(D.docKey_('Case Studies: 1'), D.docKey_('Case Studies: 2'));
});
t('the doc is split at Title headings; text before the first Title is left out', () => {
  const s = D.docBlocksToSections_([p('stray'), title('Intro'), p('Hello'), title('M1: Role'), p('Role text'), p('More')]);
  assert.strictEqual(s.map(x => x.title).join('|'), 'Intro|M1: Role');
  assert.strictEqual(s[0].parts[0], '<p>Hello</p>'); assert.strictEqual(s[1].parts[0], '<p>Role text</p><p>More</p>');
  assert.ok(!JSON.stringify(s).includes('stray'));
});
t('text is escaped, so nothing in the doc can run as script', () => {
  const [s] = D.docBlocksToSections_([title('T'), p('<img src=x onerror=alert(1)> & "quoted"')]);
  assert.strictEqual(s.parts[0], '<p>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;</p>');
});
t('bold, italic and web links are kept; other kinds of link are dropped', () => {
  const [s] = D.docBlocksToSections_([title('T'), { t: 'p', runs: [{ text: 'a ', b: true }, { text: 'b', i: true }, { text: ' c', link: 'https://example.com/x?a=1&b=2' }, { text: ' d', link: 'javascript:alert(1)' }] }]);
  assert.strictEqual(s.parts[0], '<p><strong>a </strong><em>b</em><a href="https://example.com/x?a=1&amp;b=2" target="_blank" rel="noopener"> c</a> d</p>');
});
t('short headings become headings; long text styled as a heading stays a paragraph; empty paragraphs vanish', () => {
  const [s] = D.docBlocksToSections_([title('T'), p('Purpose', 'h2'), p('x'.repeat(200), 'h2'), p('   '), p('Part', 'h3')]);
  assert.ok(s.parts[0].startsWith('<h4>Purpose</h4><p>xxx')); assert.ok(s.parts[0].endsWith('<h5>Part</h5>')); assert.ok(!s.parts[0].includes('<p></p>'));
});
t('lists: bullets, numbers and nesting', () => {
  const [s] = D.docBlocksToSections_([title('T'), li('a'), li('a1', 1), li('a2', 1), li('b'), p('gap'), li('one', 0, true), li('two', 0, true)]);
  assert.strictEqual(s.parts[0], '<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul><p>gap</p><ol><li>one</li><li>two</li></ol>');
  assert.doesNotThrow(() => D.listHtml_([{ level: 2, ordered: false, html: 'deep first' }, { level: 0, ordered: false, html: 'then shallow' }]));
});
t('tables keep their cells, including lists inside a cell', () => {
  const [s] = D.docBlocksToSections_([title('T'), { t: 'table', rows: [[[p('Level')], [p('Meaning')]], [[p('3')], [li('Meets criteria'), li('No gaps')]]] }]);
  assert.strictEqual(s.parts[0], '<table><tbody><tr><td><p>Level</p></td><td><p>Meaning</p></td></tr><tr><td><p>3</p></td><td><ul><li>Meets criteria</li><li>No gaps</li></ul></td></tr></tbody></table>');
});
t('pictures are replaced by a note', () => {
  const [s] = D.docBlocksToSections_([title('T'), { t: 'img' }]);
  assert.ok(/not shown here/.test(s.parts[0]));
});
t('long sections are cut into pieces that each fit one Sheet cell, and a huge table is split by rows', () => {
  const paras = Array.from({ length: 400 }, (_, i) => p('Paragraph ' + i + ' ' + 'word '.repeat(60)));
  const big = { t: 'table', rows: Array.from({ length: 300 }, (_, i) => [[p('Row ' + i + ' ' + 'cell '.repeat(40))], [p('x')]]) };
  const [s] = D.docBlocksToSections_([title('T'), ...paras, big]);
  assert.ok(s.parts.length >= 3, 'pieces: ' + s.parts.length);
  s.parts.forEach(x => assert.ok(x.length <= D.DOC_MAX_PART, 'a piece is ' + x.length));
  const all = s.parts.join(''); assert.ok(all.includes('Paragraph 399') && all.includes('Row 299'));
  assert.strictEqual((all.match(/<table>/g) || []).length, (all.match(/<\/table>/g) || []).length);
});

/* ---------- the team's changes (October 2026): answer boxes, reflection, removed lines ---------- */
const cell = text => text ? [p(text)] : [];
const table = rows => ({ t: 'table', rows: rows.map(r => r.map(cell)) });
const tasks = { [D.docKey_('Case')]: true, [D.docKey_('Talk')]: true, [D.docKey_('Rules')]: true };
const conv = (blocks, rules) => D.docBlocksToSections_(blocks, rules || {}, tasks);
const boxes = html => (html.match(/class="ansbox"/g) || []).length;

t('empty response cells in a task become answer boxes labelled by the cells around them; not in sections that are not tasks', () => {
  const tb = table([['Situation', 'What you would do'], ['Late to class', ''], ['Upset after a test', '']]);
  const [a] = conv([title('Talk'), tb]), [b] = conv([title('Notes'), tb]);
  assert.strictEqual(a.answers.map(x => x.label).join('|'), 'Late to class — What you would do|Upset after a test — What you would do');
  assert.strictEqual(boxes(a.parts.join('')), 2); assert.strictEqual(b.answers.length, 0); assert.strictEqual(boxes(b.parts.join('')), 0);
});
t('a one-column case table: each box is labelled with its scenario and the question above it; extra boxes follow "issue identification"', () => {
  const rules = { addAnswersAfter: [{ sections: ['Case'], match: 'issue identification', add: ['What should the Student Champion do?', 'Who else would you involve?'] }] };
  const [s] = conv([title('Case'), table([['Scenario 1: A student stops eating lunch.'], ['Issue identification'], ['']])], rules);
  assert.strictEqual(s.answers.map(x => x.label).join('|'), 'Scenario 1 — Issue identification|Scenario 1 — What should the Student Champion do?|Scenario 1 — Who else would you involve?');
});
t('the same doc gives the same answer keys every time, so typed answers stay attached after a refresh', () => {
  const doc = () => [title('Talk'), table([['Q', 'A'], ['One', ''], ['Two', '']]), table([['Q', 'A'], ['One', '']])];
  const k1 = conv(doc())[0].answers.map(x => x.key), k2 = conv(doc())[0].answers.map(x => x.key);
  assert.strictEqual(k1.join(), k2.join()); assert.strictEqual(new Set(k1).size, k1.length, 'keys are unique within a section');
  k1.forEach(k => assert.match(k, /^a-[a-z0-9-]{1,40}$/));
});
t('empty tables and named tables are removed; a one-cell box becomes a centred heading; a table can be reduced to its instructions', () => {
  const rules = { dropTables: { Talk: ['Name:'] }, tablesToInstructions: ['Rules'] };
  const [s] = conv([title('Talk'), table([['', ''], ['', '']]), table([['Name:', ''], ['Date:', '']]), table([['BOOK 1']]), p('after')], rules);
  const h = s.parts.join(''); assert.ok(!h.includes('<table') && !h.includes('Name:')); assert.ok(/BOOK 1/.test(h) && h.includes('after')); assert.strictEqual(s.answers.length, 0);
  const long = 'Observe two classes and note how the teacher builds routines, checks understanding and responds to students who need support.';
  const [r] = conv([title('Rules'), { t: 'table', rows: [[[p(long)], [p('Date')]], [[], []]] }], rules);
  assert.ok(r.parts.join('').includes(long) && !r.parts.join('').includes('<table') && !r.parts.join('').includes('Date'));
});
t('"link the document here" lines are removed; other text is kept', () => {
  const rules = { dropParagraphs: ['^(link|add|attach|paste|upload|insert)\\b[^.]{0,40}\\bhere\\b\\s*:?\\s*$'] };
  const [s] = conv([title('Talk'), p('Link the document here'), p('Add your notes here:'), p('Add a summary of what the parent said, then agree a next step here and with the TL.')], rules);
  const h = s.parts.join(''); assert.ok(!/document here|notes here/.test(h)); assert.ok(h.includes('agree a next step'));
});
t('a part of the doc can be cut out (the timeline in the dummy session)', () => {
  const rules = { cut: [{ section: 'Talk', from: 'TIMELINE', to: 'Reflection Questions', exact: true }] };
  const [s] = conv([title('Talk'), p('Plan'), p('TIMELINE', 'h2'), p('Week 1: topic'), p('Reflection Questions', 'h2'), li('What went well?')], rules);
  const h = s.parts.join(''); assert.ok(!h.includes('Week 1') && h.includes('Plan') && h.includes('Reflection Questions'));
});
t('reflection questions move out of the text into the Reflection section, grouped, with "Case {n}" for repeated blocks', () => {
  const rules = { reflection: [{ section: 'Talk', from: 'Professional Reflection', to: 'Expected Submission', every: true, label: 'Case {n}' }] };
  const [s] = conv([title('Talk'), p('Case 1 text'), p('Professional Reflection', 'h3'), li('What worked?'), li('What would you change?'), p('Expected Submission'),
    p('Case 2 text'), p('Professional Reflection', 'h3'), li('What worked?'), p('Expected Submission')], rules);
  assert.strictEqual(s.reflection.map(x => x.group + ': ' + x.label).join('|'), 'Case 1: What worked?|Case 1: What would you change?|Case 2: What worked?');
  assert.strictEqual(new Set(s.reflection.map(x => x.key)).size, 3); s.reflection.forEach(x => assert.match(x.key, /^r-/));
  const h = s.parts.join(''); assert.ok(!h.includes('What worked') && !h.includes('Professional Reflection') && h.includes('Case 2 text') && h.includes('Expected Submission'));
});
t('a one-line reflection prompt is split into separate questions', () => {
  const rules = { reflection: [{ section: 'Talk', from: 'Reflection:', single: true, split: '→' }] };
  const [s] = conv([title('Talk'), p('Reflection: What did you notice? → What will you do next?'), p('kept')], rules);
  assert.strictEqual(s.reflection.map(x => x.label).join('|'), 'What did you notice?|What will you do next?'); assert.ok(!s.parts.join('').includes('notice'));
});
t('a list of situations gets one answer box each, with a hint; boxes can also be added at the end of a task', () => {
  const rules = { listAnswers: [{ section: 'Rules', from: 'Situations', to: 'What to submit', hint: 'Classification and one line' }], appendAnswers: { Rules: [['Conversation with the student', 'Summary and notes']] } };
  const [s] = conv([title('Rules'), p('Situations'), li('A parent asks for a report'), li('A teacher shares a worry'), p('What to submit')], rules);
  assert.strictEqual(s.answers.map(x => x.label).join('|'), '1. A parent asks for a report|2. A teacher shares a worry|Conversation with the student');
  const h = s.parts.join(''); assert.strictEqual(boxes(h), 3); assert.ok(h.includes('data-h="Classification and one line"') && h.includes('data-h="Summary and notes"'));
});
t('answer box labels and hints from the doc are escaped', () => {
  const [s] = conv([title('Talk'), table([['<b onmouseover=x>"Q"</b>', 'A'], ['One', '']])]);
  const h = s.parts.join(''); assert.ok(!h.includes('<b onmouseover') && !/data-l="[^"]*"Q/.test(h));
});
t('a case told in one table and answered in the next: each box says which case it belongs to', () => {
  const [s] = conv([title('Talk'), table([['Case 1: A student stops coming'], ['Details']]), table([['Your Task'], ['What would you do?'], ['']]),
    table([['Case: Academic support is not enough'], ['Details']]), table([['Your Task'], ['What would you do?'], ['']])]);
  assert.strictEqual(s.answers.map(x => x.label).join('|'), 'Case 1 — What would you do?|Case 2 — What would you do?');
  assert.notStrictEqual(s.answers[0].key, s.answers[1].key);
});

console.log('\n' + n + ' tests passed');
