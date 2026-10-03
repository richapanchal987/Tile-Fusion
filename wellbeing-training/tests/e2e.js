// Drives the real pages in headless Chromium against the real Code.gs (fake Google services).
// Run: NODE_PATH=$(npm root -g) node tests/e2e.js     Screenshots go to tests/shots/
const fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const { makeWorld } = require('./fake-google');
const dir = path.join(__dirname, '..', 'apps-script'), shots = path.join(__dirname, 'shots');
fs.mkdirSync(shots, { recursive: true });
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const HTML = read('Index.html').replace("<?!= include_('Styles') ?>", read('Styles.html')).replace("<?!= include_('Art') ?>", read('Art.html')).replace("<?!= include_('App') ?>", read('App.html'))
  .replace(/<link[^>]*fonts\.[^>]*>/g, '');
const ADMIN = 'richa.panchal@fsksurat.in', W = makeWorld();
W.as(ADMIN); W.api.setup();
W.call('saveStaff', ['tl@fsksurat.in', 'Priya (TL)', 'Assessor']);
W.call('enrolTrainee', ['Asha Mehta', 'asha@fsksurat.in', ['tl@fsksurat.in'], 'Standard', '2026-10-05']);
W.call('enrolTrainee', ['Bina Shah', 'bina@fsksurat.in', [], 'Urgent', '2026-10-12']);
['1.1', '1.2', '1.3', '1.4', '2.1', '2.2'].forEach(id => W.call('assessTask', ['asha@fsksurat.in', id, 'complete', id === '1.3' ? 4 : 3, 'Solid.']));
W.as('asha@fsksurat.in'); W.call('saveMyTask', ['2.3', 'submit', 'https://drive.example/ss-referral', 'Learned the SS routes.']);
W.as('asha@fsksurat.in'); W.call('uploadEvidence', ['2.4', 'decisions.pdf', 'application/pdf', Buffer.from('%PDF-1.4 fake').toString('base64')]);
W.call('saveMyTask', ['2.4', 'submit', '', '']);

let failures = 0;
const step = async (name, fn) => { try { await fn(); console.log('ok  ' + name); } catch (e) { failures++; console.log('FAIL ' + name + '\n   ' + (process.env.FULL ? (e.stack || e.message) : (e.message || e).split('\n')[0])); } };

async function open(browser, email, opts) {
  W.as(email);
  const ctx = (opts && opts.reuse) || await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opts));
  ctx.setDefaultTimeout(6000); const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon/i.test(m.text())) page.errors.push(m.text()); });
  await page.exposeFunction('__srv', async (fn, args) => { W.as(email); try { return { ok: W.call(fn, args) }; } catch (e) { return { error: String(e.message || e).replace(/^Error: /, '') }; } });
  await page.addInitScript(() => {
    window.google = { script: { run: new Proxy({}, { get: () => null }) } };
    const mk = (s, f) => new Proxy({}, { get: (_, fn) => (...a) => window.__srv(fn, a).then(r => r.error ? f(new Error(r.error)) : s(r.ok)) });
    window.google.script.run = { withSuccessHandler: s => ({ withFailureHandler: f => mk(s, f) }) };
  });
  const LIBS = process.env.LIBS_DIR || '/tmp/claude-0/libs/node_modules';
  const local = { 'pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js', 'mammoth.browser.min.js': 'mammoth/mammoth.browser.min.js' };
  await page.route('https://cdnjs.cloudflare.com/**', r => { const f = local[r.request().url().split('/').pop()]; return f && fs.existsSync(path.join(LIBS, f)) ? r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(LIBS, f)) }) : r.abort(); });
  await page.route('http://app.test/', r => r.fulfill({ contentType: 'text/html', body: HTML })); await page.goto('http://app.test/'); await page.waitForSelector('.top, .center h1');
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

  await step('trainee: sees own training, readiness, cycle path and gates', async () => {
    const p = await open(browser, 'asha@fsksurat.in');
    assert.strictEqual(await p.locator('h1').first().innerText(), 'Asha Mehta');
    assert.ok(await p.locator('.ready').innerText().then(t => /Not cleared/.test(t)));
    assert.strictEqual(await p.locator('.node').count(), 10);
    assert.ok((await p.locator('aside').innerText()).includes('Critical gates: 4 of 38'));
    assert.strictEqual(await p.locator('.tab').count(), 2, 'trainee sees only My training and Guide');
    assert.strictEqual(await p.locator('.assessform').count(), 0, 'no assess controls for a trainee');
    await p.screenshot({ path: path.join(shots, '1-trainee-home.png'), fullPage: true });
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('trainee: write a draft, attach a file, submit for review', async () => {
    const p = await open(browser, 'asha@fsksurat.in');
    await p.locator('.node[data-c="3"]').click();
    await p.locator('.task', { hasText: 'Observe Session 1' }).locator('summary').click();
    const card = p.locator('.task', { hasText: 'Observe Session 1' });
    await card.locator('[data-f=evidence]').fill('Observation sheet in restricted Drive');
    await card.locator('[data-f=reflection]').fill('I noticed the opening was rushed.');
    await card.locator('input[data-up]').setInputFiles({ name: 'sheet.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 hi') });
    await p.waitForSelector('.toast.show:has-text("File attached")');
    const again = p.locator('.task', { hasText: 'Observe Session 1' });
    assert.ok((await again.innerText()).includes('sheet.pdf'));
    assert.strictEqual(await again.locator('[data-f=reflection]').inputValue(), 'I noticed the opening was rushed.', 'typed draft survives the upload re-render');
    await again.locator('[data-act=submit]').click();
    await p.waitForSelector('.toast:has-text("Submitted for review")');
    assert.ok((await p.locator('.task', { hasText: 'Observe Session 1' }).innerText()).includes('Waiting for review'));
    await p.screenshot({ path: path.join(shots, '2-trainee-submitted.png'), fullPage: true });
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('trainee: cannot submit without evidence (clear message)', async () => {
    const p = await open(browser, 'asha@fsksurat.in');
    await p.locator('.node[data-c="3"]').click();
    await p.locator('.task', { hasText: 'Observe Session 2' }).locator('summary').click();
    await p.locator('.task', { hasText: 'Observe Session 2' }).locator('[data-act=submit]').click();
    await p.waitForSelector('.toast.err:has-text("evidence")'); await p.context().close();
  });

  await step('assessor: review queue, open the uploaded file, score it', async () => {
    const p = await open(browser, 'tl@fsksurat.in');
    assert.ok((await p.locator('.tab', { hasText: 'Reviews' }).innerText()).match(/\d/), 'pending count on the tab');
    assert.ok((await p.locator('.rv').count()) >= 3);
    await p.screenshot({ path: path.join(shots, '3-review-queue.png'), fullPage: true });
    const rv = p.locator('.rv', { hasText: 'Observe Session 1' });
    const [dl] = await Promise.all([p.waitForEvent('download'), rv.locator('[data-act=openfile]').click()]);
    assert.strictEqual(dl.suggestedFilename(), 'sheet.pdf');
    await rv.locator('label[for^="sc-"][for$="-3"]').click();
    assert.ok(await rv.locator('input[data-f=outcome][value=complete]').isChecked(), 'score 3 suggests Complete');
    await rv.locator('textarea').fill('Good attention to the opening.');
    await rv.locator('[data-act=assess]').click();
    await p.waitForSelector('.toast:has-text("Assessment saved")');
    assert.strictEqual(await p.locator('.rv', { hasText: 'Observe Session 1' }).count(), 0, 'leaves the queue once assessed');
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('assessor: a critical gate scored 2 defaults to Rework and Complete is refused', async () => {
    const p = await open(browser, 'tl@fsksurat.in');
    const rv = p.locator('.rv', { hasText: 'Referral Decision Lab' });
    await rv.locator('label[for$="-2"]').click();
    assert.ok(await rv.locator('input[data-f=outcome][value=rework]').isChecked());
    await rv.locator('label[for$="-complete"]').click();
    await rv.locator('textarea').fill('x'); await rv.locator('[data-act=assess]').click();
    await p.waitForSelector('.toast.err:has-text("critical gate")'); await p.context().close();
  });

  await step('assessor: record a role play directly, then confirm readiness is blocked until gates pass', async () => {
    const p = await open(browser, 'tl@fsksurat.in');
    await p.locator('.tab', { hasText: 'Trainee' }).click();
    await p.locator('.node[data-c="3"]').click();
    const card = p.locator('.task', { hasText: 'Role Play - Reluctant Student' });
    await card.locator('summary').click();
    await card.locator('label[for$="-complete"]').click(); await card.locator('label[for$="-3"]').click();
    await card.locator('textarea').fill('Built rapport without pushing.'); await card.locator('[data-act=assess]').click();
    await p.waitForSelector('.toast:has-text("Assessment saved")');
    assert.ok((await p.locator('.task', { hasText: 'Role Play - Reluctant Student' }).innerText()).includes('Complete'));
    assert.strictEqual(await p.locator('[data-act=ready]').count(), 0, 'no clearance buttons while gates are open');
    await p.screenshot({ path: path.join(shots, '4-assessor-trainee-view.png'), fullPage: true });
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('review tab: names the trainee on every card and filters by trainee', async () => {
    const t = await open(browser, 'bina@fsksurat.in');    // a second trainee with a submission
    await t.locator('.task', { hasText: 'Well-being Pyramid' }).locator('summary').click();
    await t.locator('.task', { hasText: 'Well-being Pyramid' }).locator('[data-f=evidence]').fill('Notes in the shared handbook');
    await t.locator('.task', { hasText: 'Well-being Pyramid' }).locator('[data-act=submit]').click();
    await t.waitForSelector('.toast:has-text("Submitted for review")'); await t.context().close();
    const p = await open(browser, ADMIN);
    const cards = p.locator('.rv'), n = await cards.count();
    assert.ok(n >= 2, 'at least two cards');
    for (let i = 0; i < n; i++) assert.ok((await cards.nth(i).locator('.who').innerText()).trim().length > 2, 'trainee name on card ' + i);
    assert.ok((await cards.nth(0).locator('.avatar').innerText()).trim().length >= 1);
    assert.ok((await p.locator('.rvchips').innerText()).includes('Asha Mehta') && (await p.locator('.rvchips').innerText()).includes('Bina Shah'));
    await p.locator('.chipbtn', { hasText: 'Bina Shah' }).click();
    assert.strictEqual(await p.locator('.rv').count(), 1); assert.ok((await p.locator('.rv .who').innerText()).includes('Bina Shah'));
    await p.locator('.chipbtn', { hasText: 'Everyone' }).click(); assert.strictEqual(await p.locator('.rv').count(), n);
    await p.locator('.rv', { hasText: 'Asha Mehta' }).first().locator('[data-act=open]').click();
    assert.strictEqual(await p.locator('h1').first().innerText(), 'Asha Mehta');
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('assessor views evidence inside the app: pdf, docx, image, text; other Office files get a clear message', async () => {
    const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n));
    const mime = { pdf: 'application/pdf', png: 'image/png', txt: 'text/plain', xlsx: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    W.as('asha@fsksurat.in');
    const up = (task, name) => W.call('uploadEvidence', [task, name, mime[name.split('.').pop()], fx(name).toString('base64')]);
    ['sample.pdf', 'sample.docx', 'sample.png', 'notes.txt', 'budget.xlsx'].forEach(n => up('3.1', n));
    W.call('saveMyTask', ['3.1', 'submit', 'See files', '']);
    const p = await open(browser, 'tl@fsksurat.in');
    const rv = p.locator('.rv', { hasText: 'Nucleus Navigation' });
    const row = n => rv.locator('li', { hasText: n });
    await row('sample.pdf').locator('[data-act=viewfile]').click();
    await row('sample.pdf').locator('.pdfpages canvas').first().waitFor();
    assert.ok(await row('sample.pdf').locator('.pdfpages canvas').first().evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) return true; return false; }), 'the PDF page has drawn text');
    assert.strictEqual(await p.evaluate(() => document.querySelectorAll('a[download]').length), 0, 'viewing is not a download');
    await row('sample.docx').locator('[data-act=viewfile]').click();
    await row('sample.docx').locator('iframe.vdoc').waitFor();
    assert.ok((await row('sample.docx').locator('iframe.vdoc').getAttribute('srcdoc')).includes('Boundary casebook: scenario 1'));
    assert.strictEqual(await row('sample.docx').locator('iframe.vdoc').getAttribute('sandbox'), '', 'documents are shown with scripts disabled');
    await row('sample.png').locator('[data-act=viewfile]').click();
    await row('sample.png').locator('img.vimg').waitFor();
    assert.ok(await row('sample.png').locator('img.vimg').evaluate(i => i.complete && i.naturalWidth === 60));
    await row('notes.txt').locator('[data-act=viewfile]').click();
    await row('notes.txt').locator('.vtext').waitFor();
    assert.ok((await row('notes.txt').locator('.vtext').innerText()).includes('opened up after the third question'));
    await row('budget.xlsx').locator('[data-act=viewfile]').click();
    await row('budget.xlsx').locator('.viewer .note').waitFor();
    assert.ok((await row('budget.xlsx').locator('.viewer').innerText()).includes('Download'));
    await rv.locator('textarea').fill('Looked at all five files.');       // a re-render keeps open viewers
    await rv.locator('label[for$="-complete"]').click(); await rv.locator('label[for$="-3"]').click();
    await p.locator('.chipbtn', { hasText: 'Everyone' }).click();
    await row('sample.png').locator('img.vimg').waitFor();
    await row('sample.png').locator('[data-act=viewfile]').click();     // Hide
    assert.strictEqual(await row('sample.png').locator('img.vimg').count(), 0);
    await p.screenshot({ path: path.join(shots, '8-evidence-viewer.png'), fullPage: true });
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('delight: scoreboard, medals, "since you last visited" card, confetti on Complete, calm for reduced motion', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let p = await open(browser, 'bina@fsksurat.in', { reuse: ctx });                       // first visit: nothing to compare with
    assert.strictEqual(await p.locator('.changes').count(), 0, 'no card on a first visit');
    assert.strictEqual(await p.locator('.board .gnum').count(), 2, 'two big numbers: completion and the calendar');
    assert.ok((await p.locator('.board').innerText()).includes('/100'));
    assert.ok(await p.locator('.medalitem').count() >= 6, 'milestone medals are listed');
    assert.strictEqual(await p.locator('.medalitem.on').count(), 0, 'nothing earned yet');
    assert.strictEqual(await p.locator('canvas.confetti').count(), 0);
    W.as(ADMIN); W.call('assessTask', ['bina@fsksurat.in', '1.4', 'complete', 3, 'Clear and honest statement.']);
    W.call('assessTask', ['bina@fsksurat.in', '1.1', 'rework', 2, 'Add the Principal to your role map.']);
    p = await open(browser, 'bina@fsksurat.in', { reuse: ctx });                           // second visit: sees what changed
    const card = p.locator('.changes'); assert.strictEqual(await card.count(), 1);
    const text = await card.innerText();
    assert.ok(text.includes('1.4 Professional Practice Statement') && text.includes('marked complete'), 'complete is reported');
    assert.ok(text.includes('First task done') && text.includes('medal'), 'a newly earned medal is announced');
    assert.strictEqual(await p.locator('.medalitem.on.new').count() >= 1, true, 'and marked New');
    assert.ok(text.includes('1.1 Role Mapping') && text.includes('another attempt') && text.includes('Add the Principal'), 'rework is reported with its feedback');
    await p.waitForSelector('canvas.confetti');                                            // celebration for the Complete
    await p.waitForSelector('canvas.confetti', { state: 'detached', timeout: 6000 });      // and it cleans up after itself
    await card.locator('[data-act=dismiss-changes]').click(); assert.strictEqual(await p.locator('.changes').count(), 0);
    assert.deepStrictEqual(p.errors, []); await ctx.close();
    // someone who has asked for less motion gets the information but no animation
    const calm = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    p = await open(browser, 'bina@fsksurat.in', { reuse: calm });
    W.as(ADMIN); W.call('assessTask', ['bina@fsksurat.in', '1.2', 'complete', 4, 'Even better.']);
    p = await open(browser, 'bina@fsksurat.in', { reuse: calm });
    assert.strictEqual(await p.locator('.changes').count(), 1);
    await p.waitForTimeout(500); assert.strictEqual(await p.locator('canvas.confetti').count(), 0, 'no confetti with reduced motion');
    assert.strictEqual(await p.locator('.hero-bg .doodles').evaluate(e => getComputedStyle(e).animationName), 'none', 'the doodles stop drifting');
    await calm.close();
  });

  await step('admin: team table, enrol a trainee, add staff', async () => {
    const p = await open(browser, ADMIN);
    await p.locator('.tab', { hasText: 'Team' }).click();
    assert.ok((await p.locator('table').first().innerText()).includes('Asha Mehta'));
    await p.fill('#nt-name', 'Devi Rao'); await p.fill('#nt-email', 'devi@fsksurat.in'); await p.fill('#nt-start', '2026-10-19');
    await p.locator('input[name="nt-as"]').first().check(); await p.selectOption('#nt-path', 'Experienced');
    await p.locator('[data-act=enrol]').click(); await p.waitForSelector('.toast:has-text("Trainee enrolled")');
    assert.ok((await p.locator('table').first().innerText()).includes('Devi Rao'));
    await p.fill('#nt-email', 'devi2@gmail.com'); await p.fill('#nt-name', 'Bad');
    await p.locator('[data-act=enrol]').click(); await p.waitForSelector('.toast.err:has-text("@fsksurat.in")');
    await p.locator('[data-act=log]').click(); await p.waitForSelector('text=Enrolled trainee');
    await p.screenshot({ path: path.join(shots, '5-admin-team.png'), fullPage: true });
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('admin: edit a task, add a task and resources, archive, change settings', async () => {
    const p = await open(browser, ADMIN);
    await p.locator('.tab', { hasText: 'Curriculum' }).click();
    assert.ok((await p.innerText('main')).includes('Topic weights add up to 100%'));
    const row = p.locator('li', { hasText: 'Boundary Casebook' }).first();
    await row.locator('[data-act=task-edit]').click();
    await p.fill('#tf-name', 'Boundary Casebook (updated)');
    await p.locator('[data-act=task-save]').click(); await p.waitForSelector('.toast:has-text("Task saved")');
    assert.ok((await p.innerText('main')).includes('Boundary Casebook (updated)'));
    await p.locator('[data-act=task-new][data-topic="2"]').click();
    await p.fill('#tf-name', 'Escalation drill'); await p.check('[data-tf=gate]');
    await p.locator('[data-act=task-save]').click(); await p.waitForSelector('.toast:has-text("Task saved")');
    assert.ok((await p.innerText('main')).includes('2.7'));
    await p.locator('li', { hasText: 'Escalation drill' }).locator('[data-act=task-archive]').click();
    await p.waitForSelector('.toast:has-text("Task archived")');
    await p.locator('[data-act=res-add][data-scope="5|5.12"], [data-act=res-add][data-scope="5|"]').first().click();
    const lbl = p.locator('input[data-rs="5|"]').last(); await lbl.fill('PSPE handbook');
    await p.locator('input[data-rs="5|"][data-rf=url]').last().fill('https://example.org/handbook');
    await p.locator('[data-act=res-save][data-topic="5"][data-task=""]').click(); await p.waitForSelector('.toast:has-text("Resources saved")');
    await p.fill('#st-passScore', '4'); await p.locator('[data-act=settings-save]').click(); await p.waitForSelector('.toast:has-text("Settings saved")');
    await p.fill('#st-passScore', '3'); await p.locator('[data-act=settings-save]').click(); await p.waitForSelector('.toast:has-text("Settings saved")');
    await p.screenshot({ path: path.join(shots, '6-admin-curriculum.png'), fullPage: true });
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('stranger and trainee see the right empty/limited screens; guide renders', async () => {
    const s = await open(browser, 'nobody@fsksurat.in');
    assert.ok((await s.innerText('.center')).includes("not enrolled")); await s.context().close();
    const p = await open(browser, 'asha@fsksurat.in');
    await p.locator('.tab', { hasText: 'Guide' }).click();
    const guide = await p.innerText('main');
    assert.ok(guide.includes('Critical gates') && guide.includes('What each part is worth'));
    assert.ok(guide.includes('5. Counseling & Helping Conversations') && guide.includes('20%') && guide.includes('1. Role, Scope, Ethics & Professional Boundaries') && guide.includes('add up to 100%'), 'every topic and its weight is listed');
    assert.strictEqual(await p.locator('.tw li').count(), 10);
    await p.context().close();
  });

  await step('mobile and dark mode render without errors', async () => {
    const p = await open(browser, 'asha@fsksurat.in', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal page scroll');
    await p.screenshot({ path: path.join(shots, '7-mobile-dark.png'), fullPage: false });
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await browser.close();
  console.log(failures ? `\n${failures} step(s) failed` : '\nall UI steps passed'); process.exit(failures ? 1 : 0);
})();
