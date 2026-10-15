// Takes light and dark screenshots of the main screens with a realistic spread of sample data.
// Run: NODE_PATH=$(npm root -g) node tests/design-shots.js   -> tests/shots/design-*.png
const path = require('path');
const { chromium } = require('playwright');
const { HTML, open, shots, ADMIN } = require('./sample-world');
const sel = (p, s) => p.locator(s);
(async () => {
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const snap = async (p, name, full) => { await p.waitForTimeout(350); await p.screenshot({ path: path.join(shots, `design-${name}-${scheme}.png`), fullPage: !!full }); if (p.errors.length) console.log('ERRORS', name, scheme, p.errors); };
    // the new joiner's home, and a task opened out
    let p = await open(browser, 'asha@fsksurat.in', scheme);
    await snap(p, 'trainee', false);
    await p.locator('.task > summary').first().click(); await p.locator('details.rubric > summary').first().click(); await snap(p, 'trainee-task', true); await p.context().close();
    // a task with module text from the doc, the consent checklist and a plan
    p = await open(browser, 'asha@fsksurat.in', scheme); await p.locator('.node[data-c="1"]').click();
    const cs = p.locator('.task', { hasText: 'Case Studies 01' }); await cs.locator('summary').first().click(); await cs.locator('[data-act=doc]').click(); await snap(p, 'module-text', true); await p.context().close();
    p = await open(browser, 'chitra@fsksurat.in', scheme); await p.locator('.node[data-c="8"]').click();
    await p.locator('.task', { hasText: '6.3' }).locator('summary').first().click(); await snap(p, 'checklist', true); await p.context().close();
    p = await open(browser, 'chitra@fsksurat.in', scheme); await p.locator('.node[data-c="10"]').click();
    await p.locator('.task', { hasText: '7.3' }).locator('summary').first().click(); await snap(p, 'critical', true); await p.context().close();
    // the mentor or TL: reviews, rubric scoring, plan, team
    p = await open(browser, 'tl@fsksurat.in', scheme); await snap(p, 'review', false);
    await p.locator('.rv').first().locator('.critrow input[value="3"] + label').evaluateAll(ls => ls.forEach(l => l.click())); await snap(p, 'assess', true);
    await p.locator('.tab', { hasText: 'Team' }).click(); await snap(p, 'team', false); await p.context().close();
    p = await open(browser, ADMIN, scheme); await p.locator('.tab', { hasText: 'Curriculum' }).click(); await snap(p, 'curriculum', false);
    await p.locator('[data-act=rub-edit]').nth(1).click(); await snap(p, 'rubric-editor', false); await p.context().close();
    p = await open(browser, 'asha@fsksurat.in', scheme); await p.locator('.tab', { hasText: 'Guide' }).click(); await snap(p, 'guide', true); await p.context().close();
    p = await open(browser, 'chitra@fsksurat.in', scheme, { width: 390, height: 844 }); await snap(p, 'mobile', false); await p.context().close();
    p = await open(browser, 'nobody@fsksurat.in', scheme, { width: 800, height: 520 }); await snap(p, 'notenrolled', false); await p.context().close();
  }
  await browser.close(); console.log('done');
})();
