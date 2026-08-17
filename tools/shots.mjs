/*
 * Section-level screenshots for design review.
 *
 *   node tools/shots.mjs <path> "<sel1>,<sel2>,…" [--mobile] [--desktop] [--at=0.5]
 *
 * Scrolls each selector into view, waits for motion to settle, and captures the
 * viewport. Far more useful than blind percentage stops when you want to judge
 * one section at a time.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const path = positional[0] ?? '/';
const selectors = (positional[1] ?? 'body').split(',').map((s) => s.trim()).filter(Boolean);
const at = parseFloat(args.find((a) => a.startsWith('--at='))?.split('=')[1] ?? '0.5');
const wantMobile = args.includes('--mobile') || !args.includes('--desktop');
const wantDesktop = args.includes('--desktop') || !args.includes('--mobile');

const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4173';
const OUT = process.env.QA_OUT ?? '/tmp/claude-0/-home-user-demo-sites/c70a4c81-afbd-5475-885f-b79437b8705f/scratchpad/shots';
mkdirSync(OUT, { recursive: true });

const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'x';

const VIEWPORTS = [
  wantMobile && { name: 'm', width: 390, height: 844, dsf: 2, mobile: true },
  wantDesktop && { name: 'd', width: 1440, height: 900, dsf: 1, mobile: false },
].filter(Boolean);

const browser = await chromium.launch({
  executablePath: process.env.QA_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(1200);

  // A slow pass down the page first, so every IntersectionObserver reveal has
  // fired and scroll-linked scenes have been through their whole range.
  // Slow enough that IntersectionObserver actually delivers for every section
  // — a fast programmatic pass can skip elements that enter and leave between
  // two deliveries, which reads as "the reveals are broken" when they are not.
  await page.evaluate(async () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const steps = Math.max(40, Math.ceil(max / (innerHeight * 0.45)));
    for (let i = 0; i <= steps; i++) {
      window.scrollTo({ top: (max * i) / steps, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 70));
    }
    await new Promise((r) => setTimeout(r, 400));
  });

  // Measure every target from the top of the document. Sticky elements report
  // their pinned position once they are pinned, so measuring mid-page would
  // send us to the wrong offset.
  const targets = await page.evaluate(
    ([sels, frac]) => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return sels.map((s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const absTop = r.top + window.scrollY;
        const h = r.height;
        return Math.max(
          0,
          h > innerHeight ? absTop + (h - innerHeight) * frac : absTop - (innerHeight - h) / 2
        );
      });
    },
    [selectors, at]
  );

  for (let si = 0; si < selectors.length; si++) {
    const sel = selectors[si];
    if (targets[si] == null) {
      console.log(`   ! selector not found: ${sel}`);
      continue;
    }
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), targets[si]);
    // Nudge to force fixed/composited layers to re-raster, then let every
    // transition finish before capturing.
    await page.evaluate(async () => {
      window.scrollBy({ top: 1, behavior: 'instant' });
      await new Promise((r) => requestAnimationFrame(() => r()));
      window.scrollBy({ top: -1, behavior: 'instant' });
    });
    await page.waitForTimeout(1800);
    const file = resolve(OUT, `${slug(path)}-${slug(sel)}-${vp.name}.png`);
    await page.screenshot({ path: file });
    console.log(`   ${file}`);
  }

  await ctx.close();
}

await browser.close();
