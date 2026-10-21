// Sample data (from the made-up fixture workbook) plus a helper that opens the real pages in Chromium. Used by the e2e and contrast checks.
const fs = require('fs'), path = require('path');
const { makeWorld } = require('./fake-google');
const { build } = require('./fixture');
const dir = path.join(__dirname, '..', 'apps-script'), shots = path.join(__dirname, 'shots');
fs.mkdirSync(shots, { recursive: true });
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const HTML = read('Index.html').replace(/<\?!= include_\('(\w+)'\) \?>/g, (m, n) => read(n + '.html')).replace(/<link[^>]*fonts\.[^>]*>/g, '');

const COORD = 'richa.panchal@fsksurat.in', TLS = 'tl.senior@fsksurat.in', TLJ = 'tl.junior@fsksurat.in', PRS = 'pr.senior@fsksurat.in', ASHA = 'asha@fsksurat.in', BINA = 'bina@fsksurat.in', CHITRA = 'chitra@fsksurat.in';
const W = makeWorld(); W.setNow('2026-11-10'); W.as(COORD); W.api.setup();
W.state.workbooks.wb = build(W.api.SHEETS.Tasks);
const as = (who, fn, ...a) => { W.as(who); return W.call(fn, a); };
as(COORD, 'importWorkbook', 'wb', false, false);
as(COORD, 'saveUser', TLS, 'Priya Nair', 'Team Leader – Senior School', true);
as(COORD, 'saveUser', TLJ, 'Kabir Shah', 'Team Leader – Junior School', true);
as(COORD, 'saveUser', PRS, 'Meera Desai', 'Principal – Senior School', true);
as(COORD, 'savePolicy', 'Code of Conduct', 'https://example.org/coc', '2026-10-01');
as(TLS, 'enrolTrainee', { name: 'Asha Mehta', email: ASHA, start: '2026-11-02' });
as(TLS, 'enrolTrainee', { name: 'Bina Shah', email: BINA, start: '2026-11-09' });
as(TLJ, 'enrolTrainee', { name: 'Chitra Rao', email: CHITRA, start: '2026-11-02' });
const submit = (who, id, extra) => as(who, 'submitAttempt', id, Object.assign({ evidence: 'https://drive.example/' + id, reflection: 'What I did and learned.', anon: true, hours: 2 }, extra));
const attemptId = (email, task, no) => as(TLS, 'getBootstrap').trainees.find(t => t.record.email === email).attempts.find(a => a.task === task && a.no === no).id;
submit(ASHA, 'SAFE-01'); as(TLS, 'rateAttempt', attemptId(ASHA, 'SAFE-01', 1), { score: 4, obsType: 'Written', feedback: 'Clear and careful.', release: true });
submit(ASHA, 'SAFE-02'); as(TLS, 'rateAttempt', attemptId(ASHA, 'SAFE-02', 1), { score: 2, flag: true, flagNote: 'Shared a detail that could identify a student.', feedback: 'Please redo with the detail removed.', release: true });
submit(ASHA, 'STU-01'); as(TLS, 'rateAttempt', attemptId(ASHA, 'STU-01', 1), { score: 'Complete', release: false });
as(ASHA, 'saveDraft', 'ADU-01', { evidence: 'https://drive.example/draft', reflection: 'Half written', hours: 1 });
submit(BINA, 'SAFE-01');
as(TLS, 'setEntryCheck', ASHA, 'Counselling skills', 3, 'Focus', '');

async function open(browser, email, scheme, vp) {
  W.as(email);
  const ctx = await browser.newContext({ viewport: vp || { width: 1280, height: 900 }, colorScheme: scheme || 'light' });
  const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon/i.test(m.text())) page.errors.push(m.text()); });
  await page.exposeFunction('__srv', async (fn, args) => { W.as(email); try { return { ok: W.call(fn, args) }; } catch (e) { return { error: String(e.message || e).replace(/^Error: /, '') }; } });
  await page.addInitScript(() => { const mk = (s, f) => new Proxy({}, { get: (_, fn) => (...a) => window.__srv(fn, a).then(r => r.error ? f(new Error(r.error)) : s(r.ok)) }); window.google = { script: { run: { withSuccessHandler: s => ({ withFailureHandler: f => mk(s, f) }) } } }; });
  await page.route('http://app.test/', r => r.fulfill({ contentType: 'text/html', body: HTML })); await page.goto('http://app.test/');
  await page.waitForSelector('.top, .center h1'); await page.waitForTimeout(1900);
  return page;
}
module.exports = { W, HTML, open, shots, COORD, TLS, TLJ, PRS, ASHA, BINA, CHITRA, as };
