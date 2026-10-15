// A realistic spread of sample data plus a helper that opens the real pages in Chromium. Used by the design and contrast checks.
const fs = require('fs'), path = require('path');
const { makeWorld } = require('./fake-google');
const dir = path.join(__dirname, '..', 'apps-script'), shots = path.join(__dirname, 'shots');
fs.mkdirSync(shots, { recursive: true });
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
// Index.html pulls in the other files with include_('Name'); do the same here, and drop the font links (no network in tests).
const HTML = read('Index.html').replace(/<\?!= include_\('(\w+)'\) \?>/g, (_, n) => read(n + '.html')).replace('<?= appName ?>', 'Student Champion Training').replace(/<link[^>]*fonts\.[^>]*>/g, '');
const ADMIN = 'richa.panchal@fsksurat.in', W = makeWorld(); W.as(ADMIN); W.api.setup();
const P = W.api.PROGRAMME;

W.call('saveStaff', ['tl@fsksurat.in', 'Priya Nair', 'Assessor']);
W.call('saveStaff', ['mentor@fsksurat.in', 'Rohan Desai', 'Assessor']);
W.call('saveStaff', ['cm@fsksurat.in', 'Meera Kulkarni', 'Assessor', true]);
W.call('saveStaff', [ADMIN, 'Richa Panchal', 'Admin', true]);
const today = new Date(); const iso = d => d.toISOString().slice(0, 10); const daysAgo = n => iso(new Date(today.getTime() - n * 864e5)); const inDays = n => daysAgo(-n);
const people = { mentors: ['mentor@fsksurat.in'], tl: 'tl@fsksurat.in', certifier: 'cm@fsksurat.in' };
const enrol = (n, e, start) => W.call('enrolTrainee', [n, e, people, start]);
enrol('Asha Mehta', 'asha@fsksurat.in', daysAgo(38)); enrol('Bina Shah', 'bina@fsksurat.in', daysAgo(12)); enrol('Chitra Rao', 'chitra@fsksurat.in', daysAgo(80)); enrol('Devi Iyer', 'devi@fsksurat.in', daysAgo(2));

const tasks = W.call('getBootstrap').tasks, rubrics = W.call('getBootstrap').rubrics;
const crit = (id, s) => { const o = {}; rubrics.filter(r => r.task === id && r.use === 'score').forEach((r, i) => { o[r.order] = Array.isArray(s) ? s[i % s.length] : s; }); return o; };
const assess = (e, id, s, fb) => W.call('assessTask', [e, id, { criteria: crit(id, s), feedback: fb || 'Clear, honest and well reasoned.' }]);
const tick = () => Array(14).fill(true);

// Asha: mid-way through Module 4; one task needing a reattempt, a critical-gate struggle and deadlines set
tasks.filter(t => t.cycle <= 5).forEach(t => assess('asha@fsksurat.in', t.id, [3, 4, 3, 4]));
assess('asha@fsksurat.in', '2.4', [2, 2, 3], 'Decisions 3 and 6 skip the escalation step. Redo those two.');
assess('asha@fsksurat.in', '1.5', [4, 3, 4]);
W.call('setTaskPlan', ['asha@fsksurat.in', '4.3', daysAgo(2), '']);
W.call('setTaskPlan', ['asha@fsksurat.in', '4.4', inDays(2), 'no']);
W.call('setTaskPlan', ['asha@fsksurat.in', '5.1', inDays(9), 'yes']);
W.as('asha@fsksurat.in'); ['4.3', '5.1'].forEach(id => W.call('saveMyTask', [id, 'submit', 'https://drive.example/' + id, 'Notes on what I learned.']));
W.call('saveMyTask', ['4.4', 'save', 'Notes in progress', '']);
// Bina: early on, one submission
W.as(ADMIN);
tasks.filter(t => t.cycle <= 2).forEach(t => assess('bina@fsksurat.in', t.id, [3, 3, 4]));
W.as('bina@fsksurat.in'); W.call('saveMyTask', ['2.5', 'submit', 'Programme guide notes in the team folder', '']);
// Chitra: far along, with a critical error to reattempt and everything else strong
W.as(ADMIN);
tasks.filter(t => t.cycle <= 10).forEach(t => assess('chitra@fsksurat.in', t.id, 4));
W.as('chitra@fsksurat.in'); ['6.3', '6.4', '6.5', '7.2', '7.3'].forEach(id => { W.call('saveChecklist', [id, 'G10-S1', tick()]); });
W.call('saveChecklist', ['6.3', 'G11-S2', tick()]);
W.as(ADMIN);
W.call('assessTask', ['chitra@fsksurat.in', '7.3', { criteria: crit('7.3', 4), feedback: 'Told a parent "I think she has anxiety". Remediation with the TL booked, then reattempt.', critical: { type: P.criticalErrors[3][0] } }]);
// Devi: just started, one draft
W.as('devi@fsksurat.in'); W.call('saveMyTask', ['1.1', 'save', 'First notes', '']);
W.as(ADMIN);
// Module text from the (sample of the) real doc
const blocks = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'doc-sample.json'), 'utf8'));
W.state.doc = { blocks: blocks }; W.call('refreshModuleText', []);

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
