// Drives the real pages in headless Chromium against the real server code (fake Google services).
// Run: NODE_PATH=$(npm root -g) node tests/e2e.js     Screenshots go to tests/shots/
// (the PDF/Word viewer step loads pdfjs-dist 3.11.174 and mammoth 1.6.0 from LIBS_DIR, default /tmp/claude-0/libs/node_modules)
const fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const { W, HTML, shots, ADMIN } = require('./sample-world');
const P = W.api.PROGRAMME;
const tick = () => Array(14).fill(true);

let failures = 0;
const step = async (name, fn) => { try { await fn(); console.log('ok  ' + name); } catch (e) { failures++; console.log('FAIL ' + name + '\n   ' + (process.env.FULL ? (e.stack || e.message) : (e.message || e).split('\n')[0])); } };

async function open(browser, email, opts) {
  W.as(email);
  const ctx = (opts && opts.reuse) || await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opts));
  ctx.setDefaultTimeout(6000); const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts|favicon/i.test(m.text())) page.errors.push(m.text()); });
  await page.exposeFunction('__srv', async (fn, args) => { W.as(email); try { return { ok: W.call(fn, args) }; } catch (e) { return { error: String(e.message || e).replace(/^Error: /, '') }; } });
  await page.addInitScript(() => {
    const mk = (s, f) => new Proxy({}, { get: (_, fn) => (...a) => window.__srv(fn, a).then(r => r.error ? f(new Error(r.error)) : s(r.ok)) });
    window.google = { script: { run: { withSuccessHandler: s => ({ withFailureHandler: f => mk(s, f) }) } } };
  });
  const LIBS = process.env.LIBS_DIR || '/tmp/claude-0/libs/node_modules';
  const local = { 'pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js', 'mammoth.browser.min.js': 'mammoth/mammoth.browser.min.js' };
  await page.route('https://cdnjs.cloudflare.com/**', r => { const f = local[r.request().url().split('/').pop()]; return f && fs.existsSync(path.join(LIBS, f)) ? r.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(LIBS, f)) }) : r.abort(); });
  await page.route('http://app.test/', r => r.fulfill({ contentType: 'text/html', body: HTML })); await page.goto('http://app.test/'); await page.waitForSelector('.top, .center h1');
  return page;
}
const card = (p, text) => p.locator('.task', { hasText: text });
const openCard = async (p, text) => { await card(p, text).locator('summary').first().click(); return card(p, text); };
const toast = (p, text, err) => p.waitForSelector(`.toast${err ? '.err' : ''}.show:has-text("${text}")`);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

  await step('trainee: sees own training, pass marks, cycle path with 13 cycles and the end date', async () => {
    const p = await open(browser, 'asha@fsksurat.in');
    assert.strictEqual(await p.locator('h1').first().innerText(), 'Asha Mehta');
    assert.ok(/Not yet certified/.test(await p.locator('.ready').innerText()));
    assert.strictEqual(await p.locator('.node').count(), 13);
    const hero = await p.locator('.hero2').innerText();
    assert.ok(/Ends \d+ \w+ \d{4}/.test(hero) && /Mentor: Rohan Desai/.test(hero) && /TL: Priya Nair/.test(hero) && /Certifying Mentor: Meera Kulkarni/.test(hero));
    const aside = await p.locator('aside').innerText();
    assert.ok(aside.includes('Module pass marks') && aside.includes('3 of 8 met') && aside.includes('Critical gates: 5 of 15') && aside.includes('Deadlines'));
    assert.strictEqual(await p.locator('.mods li').count(), 8);
    const more = p.locator('.ready [data-act=cert-more]');
    assert.ok((await more.innerText()).includes('more'), 'the remaining items can be opened');
    const before = await p.locator('.ready p').count(); await more.click();
    assert.ok((await p.locator('.ready p').count()) > before, 'all the items are listed');
    assert.ok((await p.locator('.ready').innerText()).includes('Module 8 is at'), 'including the last one');
    await p.locator('.ready [data-act=cert-more]').click(); assert.strictEqual(await p.locator('.ready p').count(), before, 'and it can be closed again');
    assert.strictEqual(await p.locator('.tab').count(), 2, 'a trainee sees only My training and Guide');
    assert.strictEqual(await p.locator('.assessform, .planbox').count(), 0, 'no assessor controls for a trainee');
    await p.screenshot({ path: path.join(shots, '1-trainee-home.png'), fullPage: true });
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('trainee: how the task is assessed, module text from the doc, deadline and AI setting', async () => {
    const p = await open(browser, 'asha@fsksurat.in');
    await p.locator('.node[data-c="1"]').click();
    const c = await openCard(p, 'Case Studies 01');
    assert.ok((await c.innerText()).includes('No due date set yet'));
    await c.locator('details.rubric > summary').click();
    assert.ok((await c.locator('details.rubric').innerText()).includes('Scenario 1'), 'case-study scenarios are shown');
    assert.ok((await c.locator('details.rubric').innerText()).includes('4 Strong'), 'what each score means');
    await c.locator('[data-act=doc]').click();
    await c.locator('.docbody').waitFor();
    assert.ok((await c.locator('.docbody').innerText()).includes('Scenario 1'), 'text from the doc appears in the app');
    await c.locator('[data-act=doc]').click(); assert.strictEqual(await c.locator('.docbody').count(), 0);
    await p.locator('.node[data-c="6"]').click();
    const t = await openCard(p, 'Observe SC meetings');                                   // no doc section in the sample doc
    assert.ok((await t.innerText()).includes('AI: Not allowed') && /Due \d+ \w+/.test(await t.innerText()), 'deadline and AI setting set by the TL');
    await t.locator('[data-act=doc]').click(); await p.waitForSelector('.note:has-text("not in the app yet")');
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('competency standard: not visible to the trainee, visible to the mentor/TL on the task and in Reviews', async () => {
    const STD = 'Can explain the SC programme';
    const t = await open(browser, 'asha@fsksurat.in'); await t.locator('.node[data-c="3"]').click();
    const tc = await openCard(t, 'About the school');
    const txt = await tc.innerText();
    assert.ok(!txt.includes(STD) && !/Competency standard/i.test(txt.replace(/competency standard for the role/i, '')), 'the trainee sees neither the standard nor a heading for it');
    assert.ok(txt.includes('scores this task against the competency standard for the role'));
    assert.ok(!(await t.content()).includes(STD), 'it is not even in the page');
    await t.context().close();
    const p = await open(browser, 'tl@fsksurat.in'); await p.locator('.tab', { hasText: 'Trainee' }).click(); await p.locator('select[data-act=pick]').selectOption('asha@fsksurat.in'); await p.locator('.node[data-c="3"]').click();
    const c = await openCard(p, 'About the school');
    assert.ok((await c.innerText()).includes('Competency standard') && (await c.innerText()).includes(STD));
    await p.context().close();
  });

  await step('trainee: a real-student task needs a consent checklist with a student code before it can be submitted', async () => {
    W.as(ADMIN); ['6.1', '6.2'].forEach(id => W.call('assessTask', ['asha@fsksurat.in', id, { score: 3, criteria: Object.fromEntries(W.call('getBootstrap').rubrics.filter(r => r.task === id).map(r => [r.order, 3])), feedback: 'ok' }]));
    const p = await open(browser, 'asha@fsksurat.in');
    await p.locator('.node[data-c="8"]').click();
    const c = await openCard(p, 'Understanding the Student');
    assert.ok((await c.innerText()).includes('0 of 2 students done'));
    assert.ok(await c.locator('[data-act=submit]').isDisabled(), 'submit is blocked');
    assert.ok(!/G10|for example/i.test(await c.locator('.checkform').innerText()), 'no format or example is suggested for the student code');
    assert.strictEqual(await c.locator('[data-cl=code]').getAttribute('placeholder'), 'The code you use for this student');
    await c.locator('[data-cl=item]').evaluateAll(xs => xs.forEach(x => x.click()));
    await c.locator('[data-act=checklist]').click(); await toast(p, 'Enter the student code', true);
    await card(p, 'Understanding the Student').locator('[data-cl=code]').fill('G10-S1');
    await card(p, 'Understanding the Student').locator('[data-act=checklist]').click(); await toast(p, 'every item', true);
    const c2 = card(p, 'Understanding the Student');
    await c2.locator('[data-cl=code]').fill('g10-s1'); await c2.locator('[data-cl=item]').evaluateAll(xs => xs.forEach(x => x.click()));
    await c2.locator('[data-act=checklist]').click(); await toast(p, 'Checklist saved');
    assert.ok((await card(p, 'Understanding the Student').innerText()).includes('1 of 2 students done'));
    const c3 = card(p, 'Understanding the Student');
    await c3.locator('[data-cl=code]').fill('Student 7'); await c3.locator('[data-cl=item]').evaluateAll(xs => xs.forEach(x => x.click()));
    await c3.locator('[data-act=checklist]').click(); await toast(p, 'Checklist saved');
    const c4 = card(p, 'Understanding the Student');
    assert.ok(await c4.locator('[data-act=submit]').isEnabled());
    await p.screenshot({ path: path.join(shots, '2-checklist.png'), fullPage: true });
    await c4.locator('[data-f=evidence]').fill('Notes for g10-s1 and Student 7 in the restricted folder');
    await c4.locator('[data-act=submit]').click(); await toast(p, 'Submitted for review');
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('mentor/TL: score a rubric criterion by criterion; the app shows the average and the result', async () => {
    const p = await open(browser, 'tl@fsksurat.in');
    assert.ok((await p.locator('.tab', { hasText: 'Reviews' }).innerText()).match(/\d/), 'pending count on the tab');
    await p.screenshot({ path: path.join(shots, '3-review-queue.png'), fullPage: true });
    const rv = p.locator('.rv', { hasText: 'Observe DP classes' });
    assert.strictEqual(await rv.locator('.critrow').count(), 3);
    assert.ok((await rv.locator('[data-result]').innerText()).includes('Scored 0 of 3'));
    await rv.locator('label[for$="-4"]').nth(0).click(); await rv.locator('label[for$="-3"]').nth(1).click();
    assert.ok((await rv.locator('[data-result]').innerText()).includes('Scored 2 of 3'));
    await rv.locator('label[for$="-3"]').nth(2).click();
    assert.ok((await rv.locator('[data-result]').innerText()).includes('Score 3, Secure. Result: Complete'), '(4+3+3)/3 = 3.33 rounds to 3');
    await rv.locator('textarea').fill('Good focus on what was seen rather than guessed.');
    await rv.locator('[data-act=assess]').click(); await toast(p, 'Assessment saved');
    assert.strictEqual(await p.locator('.rv', { hasText: 'Observe DP classes' }).count(), 0, 'leaves the queue once assessed');
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('mentor/TL: a critical error makes the task not yet met, needs a description, and shows to the trainee', async () => {
    const p = await open(browser, 'tl@fsksurat.in');
    const rv = p.locator('.rv', { hasText: 'Understanding the Student' });
    await rv.locator('label[for$="-4"]').evaluateAll(ls => ls.forEach(l => l.click()));
    assert.ok((await rv.locator('[data-result]').innerText()).includes('Score 4, Strong'));
    await rv.locator('select[data-f=critical]').selectOption(P.criticalErrors[1][0]);
    const rv2 = p.locator('.rv', { hasText: 'Understanding the Student' });
    assert.ok((await rv2.locator('[data-result]').innerText()).includes('Critical error: not yet met'));
    assert.ok((await rv2.innerText()).includes('For example: Noting a self-harm remark'));
    await rv2.locator('[data-act=assess]').click(); await toast(p, 'Describe what happened', true);
    await p.locator('.rv', { hasText: 'Understanding the Student' }).locator('textarea').fill('Did not tell the WBC about a remark. Meeting booked with TL.');
    await p.locator('.rv', { hasText: 'Understanding the Student' }).locator('[data-act=assess]').click(); await toast(p, 'Assessment saved');
    await p.context().close();
    const t = await open(browser, 'asha@fsksurat.in');
    assert.ok((await t.locator('.hero2').innerText()).includes('Critical error to reattempt: 6.3'));
    await t.locator('.node[data-c="8"]').click();
    const c = await openCard(t, 'Understanding the Student');
    assert.ok((await c.innerText()).includes('Critical error: Failing to escalate') && (await c.innerText()).includes('Not yet met'));
    assert.ok((await c.innerText()).includes('reattempt this task once more'));
    await t.screenshot({ path: path.join(shots, '4-critical-error.png'), fullPage: true });
    await t.context().close();
  });

  await step('mentor/TL: agree a due date and AI permission; the trainee sees them; the trainee cannot', async () => {
    const p = await open(browser, 'tl@fsksurat.in');
    await p.locator('.tab', { hasText: 'Trainee' }).click(); await p.locator('select[data-act=pick]').selectOption('asha@fsksurat.in');
    await p.locator('.node[data-c="6"]').click();
    const c = await openCard(p, 'Observe parent meetings');
    await c.locator('[data-plan=due]').fill('2030-01-15'); await c.locator('[data-plan=ai]').selectOption('yes');
    await c.locator('[data-act=plan]').click(); await toast(p, 'Plan saved');
    await p.context().close();
    const t = await open(browser, 'asha@fsksurat.in'); await t.locator('.node[data-c="6"]').click();
    const tc = await openCard(t, 'Observe parent meetings');
    assert.ok((await tc.innerText()).includes('Due 15 Jan') && (await tc.innerText()).includes('AI: Allowed'));
    assert.strictEqual(await tc.locator('[data-plan=due]').count(), 0);
    await t.context().close();
  });

  await step('certification: not offered until eligible; only a Certifying Mentor confirms; the trainee celebrates', async () => {
    W.as(ADMIN);
    const b = W.call('getBootstrap'), done = b.trainees.find(x => x.id === 'chitra@fsksurat.in').p;
    b.tasks.forEach(t => { const s = done[t.id]; if (!s || s.status !== 'complete' || s.critical) W.call('assessTask', ['chitra@fsksurat.in', t.id, { criteria: Object.fromEntries(b.rubrics.filter(r => r.task === t.id && r.use === 'score').map(r => [r.order, 4])), feedback: 'Strong.' }]); });
    W.as('chitra@fsksurat.in'); ['7.5'].forEach(id => ['G10-S1', 'G10-S2'].forEach(c => W.call('saveChecklist', [id, c, tick()])));
    const tl = await open(browser, 'tl@fsksurat.in');
    await tl.locator('.tab', { hasText: 'Trainee' }).click(); await tl.locator('select[data-act=pick]').selectOption('chitra@fsksurat.in');
    assert.ok((await tl.locator('.ready').innerText()).includes('Everything needed is in place'));
    assert.strictEqual(await tl.locator('[data-act=certify]').count(), 0, 'a mentor/TL who is not a Certifying Mentor has no confirm button');
    assert.ok((await tl.locator('.ready').innerText()).includes('Only a Certifying Mentor confirms'));
    await tl.context().close();
    const cm = await open(browser, 'cm@fsksurat.in');
    await cm.locator('.tab', { hasText: 'Trainee' }).click(); await cm.locator('select[data-act=pick]').selectOption('chitra@fsksurat.in');
    await cm.locator('#rd-note').fill('Excellent journey.');
    await cm.locator('[data-act=certify][data-lv=certified]').click(); await toast(cm, 'Student Champion certified');
    assert.ok((await cm.locator('.ready').innerText()).includes('Confirmed by Meera Kulkarni'));
    await cm.screenshot({ path: path.join(shots, '5-certified.png'), fullPage: false });
    assert.deepStrictEqual(cm.errors, []); await cm.context().close();
    const t = await open(browser, 'chitra@fsksurat.in');
    assert.ok((await t.locator('.ready').innerText()).includes('Student Champion certified'));
    assert.ok((await t.locator('.medalitem.on', { hasText: 'Student Champion certified' }).count()) === 1);
    await t.context().close();
  });

  await step('review tab: names the trainee on every card, filters, and shows evidence inside the app', async () => {
    const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n));
    const mime = { pdf: 'application/pdf', png: 'image/png', txt: 'text/plain', xlsx: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    W.as('bina@fsksurat.in');
    ['sample.pdf', 'sample.docx', 'sample.png', 'notes.txt', 'budget.xlsx'].forEach(n => W.call('uploadEvidence', ['3.1', n, mime[n.split('.').pop()], fx(n).toString('base64')]));
    W.call('saveMyTask', ['3.1', 'submit', 'See files', '']);
    const p = await open(browser, ADMIN);
    const cards = p.locator('.rv'), n = await cards.count();
    for (let i = 0; i < n; i++) assert.ok((await cards.nth(i).locator('.who').innerText()).trim().length > 2);
    await p.locator('.chipbtn', { hasText: 'Bina Shah' }).click(); assert.ok((await p.locator('.rv').count()) >= 2);
    await p.locator('.chipbtn', { hasText: 'Everyone' }).click();
    const rv = p.locator('.rv', { hasText: 'Books, Videos and Articles' });
    const row = x => rv.locator('li', { hasText: x });
    const [dl] = await Promise.all([p.waitForEvent('download'), row('sample.pdf').locator('[data-act=openfile]').click()]);
    assert.strictEqual(dl.suggestedFilename(), 'sample.pdf');
    await row('sample.pdf').locator('[data-act=viewfile]').click(); await row('sample.pdf').locator('.pdfpages canvas').first().waitFor();
    await row('sample.docx').locator('[data-act=viewfile]').click(); await row('sample.docx').locator('iframe.vdoc').waitFor();
    assert.strictEqual(await row('sample.docx').locator('iframe.vdoc').getAttribute('sandbox'), '', 'documents are shown with scripts disabled');
    await row('sample.png').locator('[data-act=viewfile]').click(); await row('sample.png').locator('img.vimg').waitFor();
    await row('notes.txt').locator('[data-act=viewfile]').click(); await row('notes.txt').locator('.vtext').waitFor();
    await row('budget.xlsx').locator('[data-act=viewfile]').click(); await row('budget.xlsx').locator('.viewer .note').waitFor();
    assert.ok((await row('budget.xlsx').locator('.viewer').innerText()).includes('Download'));
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('delight: scoreboard, medals, "since you last visited", confetti, calm for reduced motion', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let p = await open(browser, 'devi@fsksurat.in', { reuse: ctx });
    assert.strictEqual(await p.locator('.changes').count(), 0, 'no card on a first visit');
    assert.strictEqual(await p.locator('.board .gnum').count(), 2);
    assert.strictEqual(await p.locator('.medalitem.on').count(), 0, 'nothing earned yet');
    W.as(ADMIN); const b = W.call('getBootstrap');
    W.call('assessTask', ['devi@fsksurat.in', '1.4', { criteria: Object.fromEntries(b.rubrics.filter(r => r.task === '1.4').map(r => [r.order, 4])), feedback: 'Clear.' }]);
    p = await open(browser, 'devi@fsksurat.in', { reuse: ctx });
    const text = await p.locator('.changes').innerText();
    assert.ok(text.includes('1.4 POCSO, CPP and SPACE Model') && text.includes('marked complete (4 of 4, Strong)') && text.includes('First task done'));
    await p.waitForSelector('canvas.confetti'); await p.waitForSelector('canvas.confetti', { state: 'detached', timeout: 6000 });
    await ctx.close();
    const calm = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    p = await open(browser, 'devi@fsksurat.in', { reuse: calm });
    W.as(ADMIN); W.call('assessTask', ['devi@fsksurat.in', '1.5', { criteria: Object.fromEntries(b.rubrics.filter(r => r.task === '1.5').map(r => [r.order, 4])), feedback: 'Even better.' }]);
    p = await open(browser, 'devi@fsksurat.in', { reuse: calm });
    assert.strictEqual(await p.locator('.changes').count(), 1); await p.waitForTimeout(500);
    assert.strictEqual(await p.locator('canvas.confetti').count(), 0, 'no confetti with reduced motion');
    await calm.close();
  });

  await step('admin: team table with people and status, enrol with mentor/TL/certifier, make someone a Certifying Mentor', async () => {
    const p = await open(browser, ADMIN);
    await p.locator('.tab', { hasText: 'Team' }).click();
    const tbl = await p.locator('table.team').innerText();
    assert.ok(tbl.includes('Asha Mehta') && tbl.includes('Rohan Desai') && tbl.includes('Certified') && tbl.includes('Pass marks'));
    await p.fill('#nt-name', 'Esha Pillai'); await p.fill('#nt-email', 'esha@fsksurat.in'); await p.fill('#nt-start', '2026-11-02');
    await p.locator('input[name="nt-as"]').first().check(); await p.selectOption('#nt-tl', 'tl@fsksurat.in'); await p.selectOption('#nt-cm', 'cm@fsksurat.in');
    await p.locator('[data-act=enrol]').click(); await toast(p, 'Trainee enrolled');
    assert.ok((await p.locator('table.team').innerText()).includes('Esha Pillai'));
    await p.fill('#nt-name', 'Bad'); await p.fill('#nt-email', 'bad@gmail.com'); await p.locator('[data-act=enrol]').click(); await toast(p, '@fsksurat.in', true);
    await p.locator('[data-staffcert="tl@fsksurat.in"]').check(); await toast(p, 'Saved');
    assert.ok(W.call('getBootstrap').staff.find(s => s.email === 'tl@fsksurat.in').certifies);
    await p.locator('[data-staffcert="tl@fsksurat.in"]').uncheck(); await toast(p, 'Saved');
    await p.locator('[data-act=log]').click(); await p.waitForSelector('text=Enrolled trainee');
    await p.screenshot({ path: path.join(shots, '6-admin-team.png'), fullPage: true });
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('admin: refresh the module text from the doc, edit a task (AI, real student), edit a rubric, change settings', async () => {
    const p = await open(browser, ADMIN);
    await p.locator('.tab', { hasText: 'Curriculum' }).click();
    assert.ok((await p.innerText('main')).includes('Module weights add up to 100%'));
    await p.locator('[data-act=sync]').click(); await toast(p, 'Module text refreshed');
    const panel = await p.locator('section.topic', { hasText: 'Module text from the Google Doc' }).innerText();
    assert.ok(panel.includes('Last refreshed') && panel.includes('Not found in the doc'), 'reports the sections the sample doc does not have');
    const row = p.locator('li', { hasText: 'Programme Guide' }).first();
    await row.locator('[data-act=task-edit]').click();
    await p.selectOption('#tf-ai', 'no'); await p.check('[data-tf=real]'); await p.fill('[data-tf=students]', '2');
    await p.locator('[data-act=task-save]').click(); await toast(p, 'Task saved');
    const t = W.call('getBootstrap').tasks.find(x => x.id === '2.5'); assert.ok(t.real && t.students === 2 && t.ai === 'no');
    await p.locator('li', { hasText: 'Books, Videos and Articles' }).first().locator('[data-act=rub-edit]').click();
    await p.locator('[data-act=rub-add]').click();
    await p.locator('#rubed .rubrow').last().locator('input[data-rf=criterion]').fill('Links to a real moment in my practice');
    await p.locator('#rubed .rubrow').last().locator('input[data-rl="3"]').fill('Names the moment and what changed');
    await p.locator('[data-act=rub-save]').click(); await toast(p, 'Rubric saved');
    assert.strictEqual(W.call('getBootstrap').rubrics.filter(r => r.task === '3.1').length, 2);
    await p.fill('#st-reattempts', '2'); await p.locator('[data-act=settings-save]').click(); await toast(p, 'Settings saved');
    await p.fill('#st-reattempts', '1'); await p.locator('[data-act=settings-save]').click(); await toast(p, 'Settings saved');
    await p.screenshot({ path: path.join(shots, '7-admin-curriculum.png'), fullPage: true });
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('stranger sees "not enrolled"; the guide explains scores, critical errors, AI use and certification', async () => {
    const s = await open(browser, 'nobody@fsksurat.in');
    assert.ok((await s.innerText('.center')).includes('not enrolled')); await s.context().close();
    const p = await open(browser, 'asha@fsksurat.in');
    await p.locator('.tab', { hasText: 'Guide' }).click();
    const g = await p.innerText('main');
    for (const x of ['Scores and pass marks', '4 Strong', 'Critical gates and critical errors', 'Entering identifiable student information into an AI tool', 'Using AI tools', 'Working with real students', 'Becoming student champion certified', 'at least 60% in every module and 70% in modules 1, 6, 7', 'add up to 100%']) assert.ok(g.includes(x), x);
    assert.strictEqual(await p.locator('.tw li').count(), 8);
    await p.locator('[data-act=doc]').first().click(); await p.locator('.docbody').first().waitFor();
    assert.ok((await p.locator('.docbody').first().innerText()).length > 50, 'the introduction from the doc is readable in the guide');
    await p.context().close();
  });

  await step('mobile and dark mode render without errors or sideways scrolling', async () => {
    const p = await open(browser, 'asha@fsksurat.in', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal page scroll');
    await p.locator('.node[data-c="1"]').click(); await openCard(p, 'Case Studies 01');
    await card(p, 'Case Studies 01').locator('details.rubric > summary').click();
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal page scroll with a rubric open');
    await p.screenshot({ path: path.join(shots, '8-mobile-dark.png'), fullPage: false });
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await browser.close();
  console.log(failures ? `\n${failures} step(s) failed` : '\nall UI steps passed'); process.exit(failures ? 1 : 0);
})();
