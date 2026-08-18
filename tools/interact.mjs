/*
 * Drive a page's signature interaction and screenshot the result.
 *
 *   node tools/interact.mjs <path> <script-name> [--mobile]
 *
 * Interactions can't be judged from a static screenshot, so each one gets a
 * scripted rehearsal here: perform the gesture the way a visitor would, then
 * capture what they'd see.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [path, name] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const mobile = process.argv.includes('--mobile');
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4173';
const OUT = '/tmp/claude-0/-home-user-demo-sites/c70a4c81-afbd-5475-885f-b79437b8705f/scratchpad/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: mobile ? 2 : 1,
  hasTouch: mobile,
  isMobile: mobile,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_CONNECTION_RESET/.test(m.text())) {
    errors.push(m.text());
  }
});

await page.goto(BASE + path, { waitUntil: 'load' });
await page.waitForTimeout(1200);

const shot = async (tag) => {
  await page.screenshot({ path: resolve(OUT, `ix-${name}-${tag}-${mobile ? 'm' : 'd'}.png`) });
};

const SCRIPTS = {
  /* NOISE94 — drag the poster to tear the drop open */
  async tear() {
    await page.evaluate(() => document.getElementById('tear').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForTimeout(700);
    const box = await page.locator('#tearStage').boundingBox();
    const y = box.y + box.height * 0.5;
    await page.mouse.move(box.x + box.width * 0.25, y);
    await page.mouse.down();
    for (let i = 1; i <= 18; i++) {
      await page.mouse.move(box.x + box.width * 0.25 + i * (box.width * 0.045), y);
      await page.waitForTimeout(16);
    }
    await shot('mid');
    await page.mouse.up();
    await page.waitForTimeout(1400);
    await shot('after');
    return page.evaluate(() => ({
      open: document.getElementById('tear').classList.contains('is-open'),
      tear: getComputedStyle(document.getElementById('tear')).getPropertyValue('--tear').trim(),
    }));
  },

  /* MOSSFOOT — move the pointer and see whether the character follows */
  async pip() {
    await page.evaluate(() => document.querySelector('.hero').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.waitForTimeout(600);
    await page.mouse.move(200, 200);
    await page.waitForTimeout(700);
    await shot('left');
    await page.mouse.move(1200, 700);
    await page.waitForTimeout(900);
    await shot('right');
    await page.mouse.click(1200, 700);
    await page.waitForTimeout(600);
    await shot('click');
    return {};
  },
};

const fn = SCRIPTS[name];
if (!fn) {
  console.log(`no script named "${name}". have: ${Object.keys(SCRIPTS).join(', ')}`);
} else {
  const result = await fn();
  console.log(`   ${name}:`, JSON.stringify(result));
}
console.log(errors.length ? `   ✗ ${errors.length} console error(s): ${errors[0]}` : '   ✓ console clean');
await browser.close();
