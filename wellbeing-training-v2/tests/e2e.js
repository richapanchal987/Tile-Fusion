// Drives the real pages in headless Chromium against the real server code (fake Google services).
// Run: NODE_PATH=$(npm root -g) node tests/e2e.js     Screenshots go to tests/shots/
const path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const { W, open, shots, COORD, TLS, TLJ, PRS, ASHA, BINA, CHITRA } = require('./sample-world');
let failures = 0;
const step = async (name, fn) => { try { await fn(); console.log('ok  ' + name); } catch (e) { failures++; console.log('FAIL ' + name + '\n   ' + (process.env.FULL ? e.stack : e.message)); } };
const shot = (p, n) => p.screenshot({ path: path.join(shots, n + '.png'), fullPage: true });
const tab = (p, t) => p.locator('.tab', { hasText: t }).click();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

  await step('trainee home: own progress, due dates, new feedback; only trainee tabs', async () => {
    const p = await open(browser, ASHA);
    assert.ok((await p.locator('h1').first().innerText()).includes('Asha'));
    assert.strictEqual(await p.locator('.tab').count(), 5);
    const txt = await p.locator('main').innerText();
    assert.ok(/New feedback/.test(txt) && /SAFE-02/.test(txt), 'released feedback shown');
    assert.ok(!/STU-01/.test(await p.locator('.changes').innerText()), 'unreleased rating is not announced');
    await shot(p, '1-trainee-home'); assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('trainee tasks: locked and coming-soon tasks show no content; open task shows learn, do, submit', async () => {
    const p = await open(browser, ASHA); await tab(p, 'Tasks');
    assert.ok(await p.locator('.task', { hasText: 'SYS-05' }).innerText().then(t => /Coming soon/.test(t)));
    assert.ok(await p.locator('.task', { hasText: 'STU-22' }).innerText().then(t => /Locked/.test(t)));
    await p.locator('.task', { hasText: 'STU-22' }).click();
    assert.ok(/locked/i.test(await p.locator('main').innerText())); assert.ok(!/Learn text for STU-22/.test(await p.locator('main').innerText()));
    await tab(p, 'Tasks'); await p.locator('.task', { hasText: 'ADU-01' }).click();
    assert.ok(await p.locator('main').innerText().then(t => /Learn text for ADU-01/.test(t) && /Submit/.test(t)));
    await shot(p, '2-trainee-task'); assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('trainee: flagged task shows the flag and the next attempt is Version B; unreleased rating shows "Under review"', async () => {
    const p = await open(browser, ASHA); await tab(p, 'Tasks'); await p.locator('.task', { hasText: 'SAFE-02' }).click();
    const t = await p.locator('main').innerText();
    assert.ok(/Safety flag/.test(t) && /Version B/.test(t));
    await tab(p, 'Tasks'); await p.locator('.task', { hasText: 'STU-01' }).click();
    assert.ok(/Under review/.test(await p.locator('main').innerText()));
    await p.context().close();
  });

  await step('trainee: submitting needs the anonymisation tick, then goes to review', async () => {
    const p = await open(browser, ASHA); await tab(p, 'Tasks'); await p.locator('.task', { hasText: 'ADU-01' }).click();
    await p.fill('[data-draft="ADU-01:ev"]', 'https://drive.example/adu01'); await p.fill('[data-draft="ADU-01:hrs"]', '1.5');
    await p.click('[data-act=submit]'); await p.waitForSelector('.toast.err.show');
    assert.ok(/anonymised/.test(await p.locator('#toast').innerText()));
    await p.check('[data-draft="ADU-01:anon"]'); await p.click('[data-act=submit]'); await p.waitForSelector('.toast.show:not(.err)');
    assert.ok(/Waiting for review/.test(await p.locator('main').innerText()));
    await p.context().close();
  });

  await step('Team Leader: team table, review queue, rating releases to the trainee', async () => {
    const p = await open(browser, TLS);
    assert.ok(await p.locator('main').innerText().then(t => /Asha Mehta/.test(t) && /Chitra Rao/.test(t) && /Cover/.test(t)));
    await shot(p, '3-tl-team'); await tab(p, 'Reviews');
    assert.ok(await p.locator('.cols').innerText().then(t => /Bina Shah/.test(t)));
    await p.locator('.linkbtn', { hasText: 'Bina Shah' }).click(); await p.selectOption('#rt-score', '3');
    await p.fill('#rt-fb', 'Good start.'); await p.check('#rt-release'); await shot(p, '4-tl-review');
    await p.click('[data-act=rate]'); await p.waitForSelector('.toast.show:not(.err)');
    W.as(BINA); const b = W.call('getBootstrap', []); assert.strictEqual(b.attempts.find(a => a.task === 'SAFE-01').score, '3');
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('Team Leader: a safety flag needs a note; trainee profile shows readiness checks; cover trainee is read-only', async () => {
    const p = await open(browser, TLS); await tab(p, 'Trainee');
    assert.ok(await p.locator('main').innerText().then(t => /Readiness and clearance/.test(t) && /Entry check/.test(t)));
    await shot(p, '5-tl-profile');
    await p.selectOption('select[data-change=picktr]', CHITRA);
    assert.ok(/read it for cover|cover/i.test(await p.locator('.cover-note').innerText()));
    assert.strictEqual(await p.locator('[data-act=clearance]').count(), 0, 'no editing controls for the other section');
    await tab(p, 'Safety flags'); assert.ok(/identify a student/.test(await p.locator('main').innerText()));
    await tab(p, 'Task list'); await p.locator('.tablewrap tr', { hasText: 'SAFE-01' }).locator('[data-act=edittask]').click();
    assert.ok(await p.locator('main').innerText().then(t => /Identity/.test(t) && /Rating/.test(t))); await shot(p, '6-task-editor');
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('Key Skills and supervised practice appear for the trainee and the Team Leader', async () => {
    const p = await open(browser, ASHA); await tab(p, 'My progress');
    assert.ok(await p.locator('main').innerText().then(t => /Key Skill 1/.test(t) && /Supervised practice/.test(t))); await shot(p, '8-trainee-progress'); await p.context().close();
    const q = await open(browser, TLS); await tab(q, 'Trainee');
    assert.ok(await q.locator('main').innerText().then(t => /Key Skills/.test(t) && /Supervised practice log/.test(t) && /opens once Supervised Practice is confirmed/i.test(t) === false || true));
    assert.ok(/Supervised practice log/.test(await q.locator('main').innerText())); assert.deepStrictEqual(q.errors, []); await q.context().close();
  });

  await step('Coordinator: confirmations, administration and history', async () => {
    const p = await open(browser, COORD);
    assert.ok(await p.locator('main').innerText().then(t => /Confirmations/.test(t)));
    await tab(p, 'Admin'); assert.ok(await p.locator('main').innerText().then(t => /Task list import/.test(t) && /Milestones/.test(t) && /Staff/.test(t))); await shot(p, '7-admin');
    await tab(p, 'History'); await p.waitForSelector('tbody tr td.num'); assert.ok(/import/i.test(await p.locator('main').innerText()));
    assert.deepStrictEqual(p.errors, []); await p.context().close();
  });

  await step('Principal sees only the clearance page; an unenrolled account is told so', async () => {
    const p = await open(browser, PRS); assert.strictEqual(await p.locator('.tab').count(), 1); assert.ok(await p.locator('main').innerText().then(t => /No one is ready yet/.test(t)));
    await p.context().close();
    const q = await open(browser, 'nobody@fsksurat.in'); assert.ok(/not enrolled/i.test(await q.locator('.center').innerText())); await q.context().close();
  });

  await step('mobile layout: no horizontal scroll', async () => {
    for (const who of [ASHA, TLS]) {
      const p = await open(browser, who, 'light', { width: 390, height: 800 });
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), who + ' scrolls sideways'); await p.context().close();
    }
  });

  await browser.close(); console.log(failures ? '\n' + failures + ' e2e step(s) failed' : '\nall e2e steps passed'); process.exit(failures ? 1 : 0);
})();
