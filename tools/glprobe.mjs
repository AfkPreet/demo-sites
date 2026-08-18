/*
 * Is a slow page slow because of JavaScript, or because the software
 * rasteriser is shading a million pixels?
 *
 *   node tools/glprobe.mjs <path> [selector]
 *
 * Renders the same scene at full size and then at a postage-stamp size. If the
 * small canvas is fast, the cost is fill rate — which a real GPU eats for
 * breakfast — and not something wrong with the scene graph.
 */

import { chromium } from '@playwright/test';

const path = process.argv[2] ?? '/';
const sel = process.argv[3] ?? 'canvas';
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4173';

const browser = await chromium.launch({
  executablePath: process.env.QA_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(BASE + path, { waitUntil: 'load' });
await page.waitForTimeout(1500);

// park somewhere the scene is definitely doing its heaviest work
await page.evaluate(() => {
  const max = document.documentElement.scrollHeight - innerHeight;
  window.scrollTo({ top: max * 0.42, behavior: 'instant' });
});
await page.waitForTimeout(1200);

const sample = async (label, shrink) => {
  const r = await page.evaluate(
    async ([s, small, lbl]) => {
      const c = document.querySelector(s);
      const prev = { w: c.style.width, h: c.style.height };
      if (small) {
        c.style.width = '160px';
        c.style.height = '100px';
      }
      await new Promise((r) => setTimeout(r, 700)); // let ResizeObserver settle

      const d = [];
      let last = performance.now();
      await new Promise((res) => {
        let n = 0;
        const loop = (t) => {
          d.push(t - last);
          last = t;
          if (++n < 40) requestAnimationFrame(loop);
          else res();
        };
        requestAnimationFrame(loop);
      });

      const info = window.__glinfo?.() ?? null;
      c.style.width = prev.w;
      c.style.height = prev.h;
      d.sort((a, b) => a - b);
      return {
        lbl,
        px: c.width * c.height,
        p50: +d[20].toFixed(1),
        p90: +d[36].toFixed(1),
        info,
      };
    },
    [sel, shrink, label]
  );
  console.log(
    `   ${r.lbl.padEnd(12)} ${String(r.px).padStart(9)} px   p50 ${String(r.p50).padStart(6)}ms   p90 ${String(r.p90).padStart(6)}ms`
  );
  return r;
};

console.log(`\n── GL probe ${path} ─────────────────────────`);
const full = await sample('full size', false);
const small = await sample('160×100', true);

const ratio = full.p50 / Math.max(small.p50, 0.01);
console.log(
  `\n   full/small = ${ratio.toFixed(1)}×  →  ${
    ratio > 3
      ? 'fragment-bound (fill rate). A real GPU will not care; SwiftShader does.'
      : 'NOT fill-rate bound — the cost is in JavaScript or the scene graph. Investigate.'
  }\n`
);

await browser.close();
