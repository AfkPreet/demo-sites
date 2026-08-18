/*
 * Social cards, generated from the sites themselves.
 *
 *   node tools/og.mjs            (writes public/og/*.png)
 *
 * Every card is a real screenshot of the page it links to, taken at the OG
 * aspect with the harness furniture (the back-to-portfolio pill) hidden. No
 * separate templates to keep in sync: if a hero changes, the card changes.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4173';
const OUT = resolve(process.cwd(), 'public/og');
mkdirSync(OUT, { recursive: true });

/* `at` is how far down the page to capture — a few sites are stronger a
   little past the hero. */
const CARDS = [
  { name: 'portfolio', path: '/', at: 0 },
  { name: 'aurelis', path: '/demos/aurelis/', at: 0 },
  { name: 'aetherion', path: '/demos/aetherion/', at: 0 },
  { name: 'noise94', path: '/demos/noise94/', at: 0 },
  { name: 'cendre', path: '/demos/cendre/', at: 0 },
  { name: 'mossfoot', path: '/demos/mossfoot/', at: 0 },
  { name: 'volume-zero', path: '/demos/volume-zero/', at: 0 },
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

for (const card of CARDS) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(BASE + card.path, { waitUntil: 'load' });
  await page.addStyleTag({
    content: '.pk-back, .skip { display: none !important; }',
  });
  if (card.at) {
    await page.evaluate((f) => {
      const max = document.documentElement.scrollHeight - innerHeight;
      window.scrollTo({ top: max * f, behavior: 'instant' });
    }, card.at);
  }
  await page.waitForTimeout(3200);
  const file = resolve(OUT, `${card.name}.png`);
  await page.screenshot({ path: file });
  console.log(`   ${card.name.padEnd(12)} → public/og/${card.name}.png`);
  await page.close();
}

await browser.close();
