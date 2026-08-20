/*
 * Viewport sweep.
 *
 *   node tools/vp.mjs 768 1024        (every page, at each width given)
 *   node tools/vp.mjs --landscape     (844x390, the phone turned sideways)
 *
 * Every page on this project has only ever been composed at 390 and 1440.
 * Everything between those is where a layout quietly falls apart: two-column
 * grids that have not collapsed yet, headlines sized off vw that outgrow their
 * measure, heroes whose content stops fitting a short frame. This screenshots
 * the top of each page and reports anything overflowing horizontally.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:4173';
const OUT = process.env.SHOTS ??
  '/tmp/claude-0/-home-user-demo-sites/c70a4c81-afbd-5475-885f-b79437b8705f/scratchpad/shots';
mkdirSync(OUT, { recursive: true });

const PAGES = ['/', '/demos/aurelis/', '/demos/aetherion/', '/demos/noise94/',
               '/demos/cendre/', '/demos/mossfoot/', '/demos/volume-zero/'];

const args = process.argv.slice(2);
const land = args.includes('--landscape');
const widths = args.filter((a) => /^\d+$/.test(a)).map(Number);
const SIZES = land
  ? [{ w: 844, h: 390, tag: 'land' }]
  : (widths.length ? widths : [768, 1024]).map((w) => ({ w, h: 900, tag: String(w) }));

const stops = Number(process.env.STOPS ?? 1);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

for (const size of SIZES) {
  console.log(`\n── ${size.w}×${size.h} ───────────────────────────`);
  for (const path of PAGES) {
    const ctx = await browser.newContext({
      viewport: { width: size.w, height: size.h },
      deviceScaleFactor: 1,
      isMobile: size.w < 900,
      hasTouch: size.w < 900,
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
    await page.goto(BASE + path, { waitUntil: 'load' });
    await page.waitForTimeout(2200);

    const name = path === '/' ? 'home' : path.split('/')[2];
    for (let i = 0; i < stops; i++) {
      if (i) {
        await page.evaluate((f) => {
          const max = document.documentElement.scrollHeight - innerHeight;
          scrollTo({ top: max * f, behavior: 'instant' });
        }, i / (stops - 1 || 1));
        await page.waitForTimeout(900);
      }
      await page.screenshot({ path: `${OUT}/vp-${size.tag}-${name}${stops > 1 ? i : ''}.png` });
    }

    /* Who is actually sticking out.
       Not "whose box is wider than the viewport" — a marquee track, an SVG
       drawn with preserveAspectRatio="slice" and a full-bleed parallax layer
       are all meant to be wider than the frame, and every one of them sits
       inside something that clips. The only overflow worth a word is the kind
       that reaches the document unclipped, so this walks up the ancestor
       chain and drops anything already contained by a clipping box. */
    const bad = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const clipped = (el) => {
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          if (n.namespaceURI === 'http://www.w3.org/2000/svg') return true;
          const cs = getComputedStyle(n);
          if (cs.overflowX !== 'visible' || cs.clipPath !== 'none') return true;
        }
        return false;
      };
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= w + 1 && r.left >= -1) continue;
        if (getComputedStyle(el).position === 'fixed') continue;
        if (clipped(el)) continue;
        if (out.some((o) => o.el.contains(el))) continue;   // the parent said it
        out.push({ el, sel: el.tagName.toLowerCase() +
          (el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
          left: Math.round(r.left), right: Math.round(r.right) });
      }
      return {
        w,
        scrollW: document.documentElement.scrollWidth,
        out: out.slice(0, 6).map(({ sel, left, right }) => ({ sel, left, right })),
      };
    });

    const scrolls = bad.scrollW > bad.w + 1;
    const flag = bad.out.length || scrolls || errs.length ? '✗' : '✓';
    console.log(`   ${flag} ${path.padEnd(22)}` +
      (scrolls ? `  page scrolls sideways (${bad.scrollW} > ${bad.w})` : '') +
      (errs.length ? '  JS ERRORS: ' + errs[0] : ''));
    for (const b of bad.out) console.log(`       overflow  ${b.sel}  ${b.left}…${b.right} of ${bad.w}`);
    await ctx.close();
  }
}
await browser.close();
