// A realistic spread of sample data plus a helper that opens the real pages in Chromium. Used by the design and contrast checks.
const fs = require('fs'), path = require('path');
const { makeWorld } = require('./fake-google');
const dir = path.join(__dirname, '..', 'apps-script'), shots = path.join(__dirname, 'shots');
fs.mkdirSync(shots, { recursive: true });
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const HTML = read('Index.html').replace("<?!= include_('Styles') ?>", read('Styles.html')).replace("<?!= include_('Art') ?>", read('Art.html')).replace("<?!= include_('App') ?>", read('App.html')).replace(/<link[^>]*fonts\.[^>]*>/g, '');
const ADMIN = 'richa.panchal@fsksurat.in', W = makeWorld(); W.as(ADMIN); W.api.setup();
W.call('saveStaff', ['tl@fsksurat.in', 'Priya Nair (TL)', 'Assessor']);
const today = new Date(); const iso = d => d.toISOString().slice(0, 10); const daysAgo = n => iso(new Date(today.getTime() - n * 864e5));
const enrol = (n, e, start, path) => W.call('enrolTrainee', [n, e, ['tl@fsksurat.in'], path || 'Standard', start]);
enrol('Asha Mehta', 'asha@fsksurat.in', daysAgo(20)); enrol('Bina Shah', 'bina@fsksurat.in', daysAgo(9)); enrol('Chitra Rao', 'chitra@fsksurat.in', daysAgo(50), 'Experienced'); enrol('Devi Iyer', 'devi@fsksurat.in', daysAgo(2));
const tasks = W.call('getBootstrap').tasks;
const assess = (e, id, oc, sc, fb) => W.call('assessTask', [e, id, oc, sc, fb || 'Good work.']);
tasks.filter(t => t.cycle <= 2).forEach(t => assess('asha@fsksurat.in', t.id, 'complete', t.id === '2.4' ? 4 : 3));
assess('asha@fsksurat.in', '2.4', 'rework', 2, 'Decisions 3 and 6 need the escalation step. Redo those two.');
tasks.filter(t => t.cycle <= 5 && t.id !== '5.9').forEach(t => assess('chitra@fsksurat.in', t.id, 'complete', 4)); assess('chitra@fsksurat.in', '5.12', 'partial', 2, 'Certificate seen; application discussion still to do.');
tasks.filter(t => t.cycle <= 1).forEach(t => assess('bina@fsksurat.in', t.id, 'complete', 3));
W.as('asha@fsksurat.in'); ['2.4', '5.1'].forEach(id => W.call('saveMyTask', [id, 'submit', 'https://drive.example/' + id, 'Notes on what I learned.']));
W.as('bina@fsksurat.in'); W.call('saveMyTask', ['3.3', 'submit', 'Audit notes in the team folder', '']);
W.as('devi@fsksurat.in'); W.call('saveMyTask', ['1.1', 'save', 'draft', '']);

async function open(browser, email, scheme, vp) {
  W.as(email);
  const ctx = await browser.newContext({ viewport: vp || { width: 1280, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.exposeFunction('__srv', async (fn, args) => { W.as(email); try { return { ok: W.call(fn, args) }; } catch (e) { return { error: String(e.message || e).replace(/^Error: /, '') }; } });
  await page.addInitScript(() => { const mk = (s, f) => new Proxy({}, { get: (_, fn) => (...a) => window.__srv(fn, a).then(r => r.error ? f(new Error(r.error)) : s(r.ok)) }); window.google = { script: { run: { withSuccessHandler: s => ({ withFailureHandler: f => mk(s, f) }) } } }; });
  await page.route('http://app.test/', r => r.fulfill({ contentType: 'text/html', body: HTML })); await page.goto('http://app.test/');
  await page.waitForSelector('.top, .center h1'); await page.waitForTimeout(2300);   // let the intro animation settle
  return page;
}

module.exports = { W, HTML, open, shots, ADMIN };
