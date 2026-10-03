// Measures text contrast (WCAG) for every visible piece of text, in light and dark mode, on the main screens.
// Run: NODE_PATH=$(npm root -g) node tests/contrast.js      Exit code 1 if anything is below 4.5:1 (3:1 for large text).
const { chromium } = require('playwright');
const { open, ADMIN } = require('./sample-world');

function auditInPage() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const root = getComputedStyle(document.documentElement), v = n => rgba(root.getPropertyValue(n).trim());
  const over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); return a ? [0, 1, 2].map(i => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a) : [0, 0, 0, 0]; };
  const lum = c => { const f = x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
  const backgrounds = el => {                       // every plausible background colour behind el (the hero is a gradient, so two)
    const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
    let cands = [v('--bg')];
    chain.forEach(e => {
      if (e === document.documentElement || e === document.body) return;
      const cs = getComputedStyle(e);
      if (e.classList && (e.classList.contains('hero2') || e.classList.contains('banner'))) { cands = [v('--hero-a'), v('--hero-b')]; return; }
      const bg = rgba(cs.backgroundColor); if (bg[3] > 0) cands = cands.map(c => over(bg, c));
    }); return cands;
  };
  const opacityOf = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const out = [], seen = new Set();
  const visible = el => { if (el.closest('svg,[hidden],script,style')) return false; const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const check = (el, label) => {
    const cs = getComputedStyle(el), px = parseFloat(cs.fontSize), w = parseInt(cs.fontWeight, 10) || 400, large = px >= 24 || (px >= 18.66 && w >= 700);
    const fg0 = rgba(cs.color), o = opacityOf(el); fg0[3] *= o;
    const worst = Math.min(...backgrounds(el).map(bg => ratio(over(fg0, bg), bg)));
    const need = large ? 3 : 4.5;
    if (worst < need) { const key = label + cs.color + cs.backgroundColor; if (!seen.has(key)) { seen.add(key); out.push({ el: label, text: (el.textContent || el.value || '').trim().slice(0, 40), ratio: +worst.toFixed(2), need, color: cs.color }); } }
  };
  document.querySelectorAll('body *').forEach(el => {
    if (!visible(el)) return;
    const direct = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    const label = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    if (direct) check(el, label);
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'file') check(el, label + '[value]');
  });
  return out;
}

(async () => {
  const browser = await chromium.launch(); let bad = 0;
  const views = [
    ['trainee home + open task', 'asha@fsksurat.in', async p => { await p.locator('.task').first().locator('summary').click(); await p.locator('details[data-key=gates] summary').click(); }],
    ['guide', 'asha@fsksurat.in', async p => { await p.locator('.tab', { hasText: 'Guide' }).click(); }],
    ['review queue', 'tl@fsksurat.in', async () => {}],
    ['team', ADMIN, async p => { await p.locator('.tab', { hasText: 'Team' }).click(); }],
    ['curriculum', ADMIN, async p => { await p.locator('.tab', { hasText: 'Curriculum' }).click(); await p.locator('[data-act=task-edit]').first().click(); }],
    ['assessor view of a trainee', 'tl@fsksurat.in', async p => { await p.locator('.tab', { hasText: 'Trainee' }).click(); await p.locator('.task').first().locator('summary').click(); }],
    ['not enrolled', 'nobody@fsksurat.in', async () => {}],
  ];
  for (const scheme of ['light', 'dark']) for (const [name, email, prep] of views) {
    const p = await open(browser, email, scheme); await prep(p); await p.waitForTimeout(400);
    const res = await p.evaluate(auditInPage);
    console.log((res.length ? 'FAIL ' : 'ok   ') + scheme.padEnd(5) + name + (res.length ? '  (' + res.length + ')' : ''));
    res.forEach(r => console.log('       ' + r.ratio + ' < ' + r.need + '  ' + r.el + '  "' + r.text + '"  ' + r.color)); bad += res.length;
    await p.context().close();
  }
  await browser.close(); console.log(bad ? '\n' + bad + ' contrast problem(s)' : '\nall text meets WCAG AA in light and dark'); process.exit(bad ? 1 : 0);
})();
