/*
 * Tab through a page and check every stop actually shows a focus ring.
 *
 *   node tools/kbd.mjs /demos/noise94/
 *
 * A focus ring drawn in a colour close to what is behind it, or clipped by an
 * `overflow: hidden` ancestor, or sitting on an element scrolled out of view,
 * is the same as no focus ring — and it is invisible to every screenshot
 * taken of a page at rest.
 */
import { chromium } from '@playwright/test';

const path = process.argv[2] ?? '/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4173' + path, { waitUntil: 'load' });
await page.waitForTimeout(1600);

const seen = [];
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('Tab');
  const info = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // is anything between it and the document clipping it away?
    let clippedBy = null;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n);
      if (p.overflow === 'visible' && p.overflowX === 'visible') continue;
      const pr = n.getBoundingClientRect();
      if (r.top < pr.top - 2 || r.bottom > pr.bottom + 2 ||
          r.left < pr.left - 2 || r.right > pr.right + 2) {
        clippedBy = n.className || n.tagName; break;
      }
    }
    return {
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 34),
      outline: cs.outlineStyle === 'none' ? null : `${cs.outlineWidth} ${cs.outlineColor}`,
      offset: cs.outlineOffset,
      onScreen: r.top >= -2 && r.bottom <= innerHeight + 2,
      size: [Math.round(r.width), Math.round(r.height)],
      clippedBy,
    };
  });
  if (!info) break;
  const key = info.tag + '|' + info.label;
  if (seen.some((s) => s.key === key)) break;
  seen.push({ key, ...info });
}

let bad = 0;
for (const s of seen) {
  const problems = [];
  if (!s.outline) problems.push('NO RING');
  if (s.clippedBy) problems.push('clipped by .' + String(s.clippedBy).split(' ')[0]);
  if (s.size[0] < 8 || s.size[1] < 8) problems.push(`tiny ${s.size.join('×')}`);
  if (problems.length) bad++;
  console.log(`   ${problems.length ? '✗' : '✓'} ${s.tag.padEnd(6)} ${s.label.padEnd(36)} ${problems.join(', ')}`);
}
console.log(`\n   ${seen.length} stops, ${bad} with problems`);
await browser.close();
