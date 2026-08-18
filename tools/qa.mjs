/*
 * Visual + health QA sweep.
 *
 *   node tools/qa.mjs <path> [--shots] [--only=mobile|desktop]
 *
 * Loads a built page in Chromium at phone and desktop sizes, records console
 * errors, checks for horizontal overflow, scripts a scroll through the whole
 * page while sampling frame deltas, and (optionally) writes screenshots.
 *
 * Note: headless Chromium renders WebGL through SwiftShader, so the frame
 * numbers here are a floor, not a prediction of real-device performance. They
 * are useful for catching catastrophes and regressions, not for bragging.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--')) ?? '/';
const wantShots = args.includes('--shots');
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:4173';
const OUT = process.env.QA_OUT ?? '/tmp/claude-0/-home-user-demo-sites/c70a4c81-afbd-5475-885f-b79437b8705f/scratchpad/shots';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, isMobile: true, deviceScaleFactor: 2, hasTouch: true },
  { name: 'desktop', width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1, hasTouch: false },
].filter((v) => !only || v.name === only);

const slug = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.QA_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});

let failed = false;

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    userAgent: vp.isMobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  });
  const page = await ctx.newPage();

  const errors = [];
  const warnings = [];
  page.on('console', (m) => {
    const t = m.text();
    // Google Fonts is blocked by this sandbox's egress policy; that failure is
    // environmental, not a defect in the page.
    if (m.type() === 'error') {
      if (/fonts\.(googleapis|gstatic)|ERR_CONNECTION_RESET/.test(t)) return;
      errors.push(t);
    }
    else if (m.type() === 'warning' && !/Download the React|DevTools/.test(t)) warnings.push(t);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.includes('fonts.g')) return;
    errors.push(`[404?] ${u} — ${r.failure()?.errorText}`);
  });

  const url = BASE + path;
  const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  if (!resp || resp.status() >= 400) {
    console.log(`  ✗ ${vp.name}: HTTP ${resp?.status()}`);
    failed = true;
    await ctx.close();
    continue;
  }

  await page.waitForTimeout(1400);

  // ── overflow ─────────────────────────────────────────────────────────
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    const over = de.scrollWidth - de.clientWidth;
    if (over <= 1) return { over: 0, culprits: [] };
    const culprits = [];
    const limit = de.clientWidth + 1;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > limit + 0.5 || r.left < -0.5) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && cs.pointerEvents === 'none') continue;
        culprits.push(
          `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.')} ` +
          `[${Math.round(r.left)}…${Math.round(r.right)}]`
        );
      }
      if (culprits.length > 8) break;
    }
    return { over, culprits };
  });

  // ── page facts ───────────────────────────────────────────────────────
  const facts = await page.evaluate(() => {
    const de = document.documentElement;
    const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => ({
      id: c.id || c.className,
      w: c.width,
      h: c.height,
      gl: !!(c.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) || null),
    }));
    return {
      docHeight: de.scrollHeight,
      screens: +(de.scrollHeight / innerHeight).toFixed(1),
      tier: de.dataset.tier,
      ready: de.classList.contains('is-ready'),
      canvases: canvases.length,
      title: document.title,
      h1: document.querySelector('h1')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 90),
      backLink: !!document.querySelector('.pk-back'),
      imgs: document.querySelectorAll('img').length,
    };
  });

  // ── scripted scroll with frame sampling ──────────────────────────────
  const perf = await page.evaluate(async () => {
    const de = document.documentElement;
    const max = de.scrollHeight - innerHeight;
    const deltas = [];
    let last = performance.now();
    let running = true;
    const loop = (t) => {
      deltas.push(t - last);
      last = t;
      if (running) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    const STEPS = 90;
    for (let i = 0; i <= STEPS; i++) {
      window.scrollTo({ top: (max * i) / STEPS, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 26));
    }
    running = false;
    deltas.sort((a, b) => a - b);
    const p = (q) => +deltas[Math.floor(deltas.length * q)]?.toFixed(1);
    return { frames: deltas.length, p50: p(0.5), p95: p(0.95), max: +deltas.at(-1)?.toFixed(1) };
  });

  // ── screenshots ──────────────────────────────────────────────────────
  if (wantShots) {
    const stops = [0, 0.12, 0.28, 0.44, 0.6, 0.76, 0.92, 1];
    for (let i = 0; i < stops.length; i++) {
      await page.evaluate((f) => {
        const max = document.documentElement.scrollHeight - innerHeight;
        window.scrollTo({ top: max * f, behavior: 'instant' });
      }, stops[i]);
      await page.waitForTimeout(720);
      await page.screenshot({ path: resolve(OUT, `${slug}-${vp.name}-${i}.png`) });
    }
  }

  const bad = errors.length > 0 || overflow.over > 1;
  if (bad) failed = true;

  console.log(`\n── ${path}  ·  ${vp.name} ${vp.width}×${vp.height} ────────────────`);
  console.log(`   title    ${facts.title}`);
  console.log(`   h1       ${facts.h1 ?? '—'}`);
  console.log(`   height   ${facts.docHeight}px  (${facts.screens} screens)   tier=${facts.tier}  canvases=${facts.canvases}  imgs=${facts.imgs}`);
  console.log(`   boot     is-ready=${facts.ready}  back-link=${facts.backLink}`);
  console.log(`   overflow ${overflow.over > 1 ? `✗ ${overflow.over}px  →  ${overflow.culprits.join(' | ')}` : '✓ none'}`);
  console.log(`   frames   p50 ${perf.p50}ms  p95 ${perf.p95}ms  max ${perf.max}ms  (${perf.frames} sampled, swiftshader)`);
  console.log(`   console  ${errors.length ? `✗ ${errors.length} error(s)` : '✓ clean'}${warnings.length ? `  (${warnings.length} warn)` : ''}`);
  for (const e of errors.slice(0, 6)) console.log(`            ! ${e.slice(0, 200)}`);
  for (const w of warnings.slice(0, 3)) console.log(`            ~ ${w.slice(0, 160)}`);

  await ctx.close();
}

await browser.close();
if (wantShots) console.log(`\n   shots → ${OUT}`);
process.exit(failed ? 1 : 0);
