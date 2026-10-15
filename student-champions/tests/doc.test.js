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

console.log('\n' + n + ' tests passed');
