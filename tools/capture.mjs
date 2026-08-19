/*
 * Design-review capture: a page at several scroll stops, both sizes.
 *
 *   node tools/capture.mjs <path> [--stops=8] [--mobile] [--desktop] [--tag=name]
 *
 * Unlike qa.mjs --shots this does no perf sampling, so it is quick enough to
 * run repeatedly while art-directing.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--')) ?? '/';
const stops = Number(args.find((a) => a.startsWith('--stops='))?.split('=')[1] ?? 8);
const tag = args.find((a) => a.startsWith('--tag='))?.split('=')[1];
const wantM = args.includes('--mobile') || !args.includes('--desktop');
const wantD = args.includes('--desktop') || !args.includes('--mobile');

const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4173';
const OUT = process.env.QA_OUT ?? '/tmp/claude-0/-home-user-demo-sites/c70a4c81-afbd-5475-885f-b79437b8705f/scratchpad/shots';
mkdirSync(OUT, { recursive: true });
const slug = tag ?? (path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root');

const VPS = [
  wantD && { n: 'd', w: 1440, h: 900, dsf: 1, mobile: false },
  wantM && { n: 'm', w: 390, h: 844, dsf: 2, mobile: true },
].filter(Boolean);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

for (const vp of VPS) {
  const page = await browser.newPage({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.dsf,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  for (let i = 0; i < stops; i++) {
    const f = stops === 1 ? 0 : i / (stops - 1);
    await page.evaluate((y) => {
      const max = document.documentElement.scrollHeight - innerHeight;
      window.scrollTo({ top: max * y, behavior: 'instant' });
    }, f);
    await page.waitForTimeout(950);
    await page.screenshot({ path: resolve(OUT, `${slug}-${vp.n}${i}.png`) });
  }
  console.log(`   ${slug} ${vp.n}: ${stops} stops`);
  await page.close();
}
await browser.close();
console.log(`   → ${OUT}`);
