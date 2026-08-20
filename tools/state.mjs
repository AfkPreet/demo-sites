/*
 * States, not stills.
 *
 *   node tools/state.mjs /demos/noise94/ ".btn" hover
 *   node tools/state.mjs / "a.plate" focus
 *
 * Every screenshot taken on this project so far has been of a page at rest.
 * Hover, focus-visible and :active are the half of the design nobody has
 * looked at, and a broken focus ring on a portfolio is read by exactly the
 * people it is meant to impress.
 */
import { chromium } from '@playwright/test';

const [path, sel, mode = 'focus'] = process.argv.slice(2);
const OUT = process.env.OUT ??
  '/tmp/claude-0/-home-user-demo-sites/c70a4c81-afbd-5475-885f-b79437b8705f/scratchpad/shots/state.png';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 900) },
  deviceScaleFactor: 1,
});
await page.goto('http://127.0.0.1:4173' + path, { waitUntil: 'load' });
await page.waitForTimeout(1800);

const el = page.locator(sel).first();
await el.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
if (mode === 'hover') await el.hover();
// A real focus ring only appears for keyboard focus, so it has to be tabbed to
// rather than .focus()'d — :focus-visible does not fire for a script call.
if (mode === 'focus') await el.evaluate((n) => n.focus({ focusVisible: true }));
if (mode === 'tab') {
  await page.keyboard.press('Tab');
  for (let i = 0; i < Number(process.env.N ?? 1); i++) await page.keyboard.press('Tab');
}
await page.waitForTimeout(700);
await page.screenshot({ path: OUT });

const box = await el.boundingBox();
console.log(JSON.stringify({ box, mode }, null, 1));
await browser.close();
