// Checks that the generated files are in step with programme.json (so nobody edits one and forgets to rebuild). Run: node tests/build.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), dir = path.join(root, 'apps-script');
const prog = JSON.parse(fs.readFileSync(path.join(root, 'programme.json'), 'utf8'));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const sandbox = vm.runInNewContext(fs.readFileSync(path.join(dir, 'Config.gs'), 'utf8') + ';PROGRAMME', {});

t('Config.gs matches programme.json (everything except the colours)', () => {
  const want = JSON.parse(JSON.stringify(prog)); delete want.theme; delete want._about;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox)), want);
});
t('Styles define every theme colour for light and for both dark modes', () => {
  const css = fs.readFileSync(path.join(dir, 'Styles.html'), 'utf8');
  Object.entries(prog.theme.light).forEach(([k, v]) => assert.ok(css.includes(k + ':' + v), 'light ' + k));
  const dark = (css.match(new RegExp(Object.entries(prog.theme.dark)[0].join(':'), 'g')) || []).length;
  assert.strictEqual(dark, 2, 'the dark colours are written twice: for the device setting and for the manual switch');
  Object.entries(prog.theme.dark).forEach(([k, v]) => assert.ok(css.includes(k + ':' + v), 'dark ' + k));
  assert.strictEqual(prog.theme.light['--blue'], '#0050A0'); assert.strictEqual(prog.theme.light['--red'], '#B02020'); assert.strictEqual(prog.theme.light['--yellow'], '#F2C21A');
});
t('every colour the interface uses is a theme variable (no hard-coded colours outside the variable blocks except the hero text)', () => {
  const css = fs.readFileSync(path.join(dir, 'Styles.html'), 'utf8') + fs.readFileSync(path.join(dir, 'Styles2.html'), 'utf8');
  const body = css.split('\n').filter(l => !/^\s*--|^:root|^@media \(prefers-color-scheme/.test(l)).join('\n');
  const hard = (body.match(/#[0-9A-Fa-f]{6}\b/g) || []).filter(c => !['#FFFFFF', '#fff', '#0050A0', '#B02020', '#2E2200'].includes(c.toUpperCase()) && c.toUpperCase() !== '#FFFFFF');
  assert.ok(hard.length < 12, 'hard-coded colours: ' + [...new Set(hard)].join(' '));
});
t('every file stays small enough to paste into the Apps Script editor in one go', () => {
  fs.readdirSync(dir).forEach(f => assert.ok(fs.statSync(path.join(dir, f)).size < 25000, f + ' is ' + fs.statSync(path.join(dir, f)).size + ' bytes'));
});
t('the page lists every file it needs, and each exists', () => {
  const index = fs.readFileSync(path.join(dir, 'Index.html'), 'utf8');
  const inc = [...index.matchAll(/include_\('(\w+)'\)/g)].map(m => m[1]);
  assert.ok(inc.length >= 10); inc.forEach(f => assert.ok(fs.existsSync(path.join(dir, f + '.html')), f));
});
console.log('\n' + n + ' tests passed');
