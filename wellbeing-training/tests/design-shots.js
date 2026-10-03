// Takes light and dark screenshots of the main screens with a realistic spread of sample data.
// Run: NODE_PATH=$(npm root -g) node tests/design-shots.js   -> tests/shots/design-*.png
const path = require('path');
const { chromium } = require('playwright');
const { HTML, open, shots } = require('./sample-world');
(async () => {
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    let p = await open(browser, 'asha@fsksurat.in', scheme);
    await p.screenshot({ path: path.join(shots, `design-trainee-${scheme}.png`) });
    await p.locator('.task').first().locator('summary').click(); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(shots, `design-trainee-full-${scheme}.png`), fullPage: true });
    if (p.errors.length) console.log('ERRORS', scheme, p.errors); await p.context().close();
    p = await open(browser, 'tl@fsksurat.in', scheme); await p.screenshot({ path: path.join(shots, `design-review-${scheme}.png`) });
    await p.locator('.tab', { hasText: 'Team' }).click(); await p.waitForTimeout(400); await p.screenshot({ path: path.join(shots, `design-team-${scheme}.png`) });
    if (p.errors.length) console.log('ERRORS', scheme, p.errors); await p.context().close();
    p = await open(browser, 'chitra@fsksurat.in', scheme, { width: 390, height: 844 }); await p.screenshot({ path: path.join(shots, `design-mobile-${scheme}.png`) }); await p.context().close();
    p = await open(browser, 'nobody@fsksurat.in', scheme, { width: 800, height: 520 }); await p.screenshot({ path: path.join(shots, `design-notenrolled-${scheme}.png`) }); await p.context().close();
    // every medal, earned and locked
    const c = await browser.newContext({ viewport: { width: 1100, height: 340 }, colorScheme: scheme }); const g = await c.newPage();
    await g.route('http://app.test/', r => r.fulfill({ contentType: 'text/html', body: HTML })); await g.addInitScript(() => { window.google = { script: { run: { withSuccessHandler: () => ({ withFailureHandler: () => new Proxy({}, { get: () => () => {} }) }) } } }; }); await g.goto('http://app.test/');
    await g.evaluate(() => { document.body.className = 'intro'; const names = [['check', 'First task done'], ['shield', 'First gate passed'], ['book', 'Foundation complete'], ['spark', 'Halfway there'], ['target', 'Skill Development complete'], ['users', 'Supervised practice'], ['eye', 'Supervised Practice complete'], ['star', 'Independent practice']];
      document.getElementById('app').innerHTML = MEDAL_DEFS + '<main><ul class="medals" style="padding-top:20px">' + names.map((n, i) => '<li class="medalitem ' + (i < 4 ? 'on' : 'off') + '">' + medal(n[0], i < 4) + '<span class="mt">' + n[1] + '</span><small>' + (i < 4 ? 'Earned' : 'Locked') + '</small></li>').join('') + '</ul></main>'; });
    await g.waitForTimeout(1500); await g.screenshot({ path: path.join(shots, `design-medals-${scheme}.png`) }); await c.close();
  }
  await browser.close(); console.log('done');
})();
