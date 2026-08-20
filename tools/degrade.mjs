/*
 * The two states nobody screenshots.
 *
 *   node tools/degrade.mjs reduce      (prefers-reduced-motion: reduce)
 *   node tools/degrade.mjs nogl        (WebGL refused)
 *
 * Both are real for real visitors — one is a system setting a lot of people
 * turn on, the other is an old phone, a locked-down browser or a GPU driver
 * that gave up. A page that is beautiful only with animation and a canvas is
 * a page that is beautiful only sometimes.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const mode = process.argv[2] ?? 'reduce';
const OUT = '/tmp/claude-0/-home-user-demo-sites/c70a4c81-afbd-5475-885f-b79437b8705f/scratchpad/shots';
mkdirSync(OUT, { recursive: true });

const PAGES = ['/', '/demos/aurelis/', '/demos/aetherion/', '/demos/noise94/',
               '/demos/cendre/', '/demos/mossfoot/', '/demos/volume-zero/'];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

for (const path of PAGES) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: mode === 'reduce' ? 'reduce' : 'no-preference',
  });
  if (mode === 'nogl') {
    // Refuse a context the way a machine without one would, before any script
    // on the page has had a chance to ask for it.
    await ctx.addInitScript(() => {
      const no = () => null;
      HTMLCanvasElement.prototype.getContext = new Proxy(
        HTMLCanvasElement.prototype.getContext,
        { apply: (t, self, args) =>
            /webgl/i.test(String(args[0])) ? no() : Reflect.apply(t, self, args) });
    });
  }
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 110)));
  await page.goto('http://127.0.0.1:4173' + path, { waitUntil: 'load' });
  await page.waitForTimeout(2400);

  const name = path === '/' ? 'home' : path.split('/')[2];
  await page.screenshot({ path: `${OUT}/deg-${mode}-${name}.png` });

  const s = await page.evaluate(() => ({
    ready: document.documentElement.classList.contains('is-ready'),
    noWebgl: document.documentElement.classList.contains('no-webgl'),
    h1: (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  const ok = s.ready && !errs.length && s.scrollW <= s.clientW + 1;
  console.log(`   ${ok ? '✓' : '✗'} ${path.padEnd(22)} ready=${s.ready} no-webgl=${s.noWebgl}` +
    (s.scrollW > s.clientW + 1 ? `  SIDEWAYS ${s.scrollW}>${s.clientW}` : '') +
    (errs.length ? `  ERR ${errs[0]}` : ''));
  await ctx.close();
}
await browser.close();
