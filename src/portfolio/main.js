import './portfolio.css';

import { boot } from '../lib/site.js';
import { onTick } from '../lib/ticker.js';
import { scroll, viewport } from '../lib/scroll.js';
import { env, hasWebGL } from '../lib/env.js';
import { watch } from '../lib/reveal.js';

/* No line-splitting: type never animates on this site. */
boot({ split: false });

/* ── the stone's tooth ─────────────────────────────────────────────────────
   A 128×128 tileable value-noise tile, generated once and handed to CSS as a
   data URI. It is painted on the ground elements themselves, underneath the
   type — never a fixed full-viewport overlay, never blended over text, never
   animated. That is the difference between a material and a filter.
   ─────────────────────────────────────────────────────────────────────────*/
(() => {
  if (viewport.w < 380) return;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d', { alpha: true });
  if (!x) return;
  const img = x.createImageData(S, S);
  const d = img.data;
  let seed = 20260819;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < S * S; i++) {
    const v = rnd();
    const a = v < 0.5 ? 10 : 8;              // half dark specks, half light
    d[i * 4] = v < 0.5 ? 0 : 255;
    d[i * 4 + 1] = d[i * 4];
    d[i * 4 + 2] = d[i * 4];
    d[i * 4 + 3] = Math.round(a * (0.35 + rnd() * 0.65));
  }
  x.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain', `url(${c.toDataURL('image/png')})`);
})();

/* ── the hero object ──────────────────────────────────────────────────── */
(async () => {
  const canvas = document.getElementById('slab');
  if (!canvas) return;
  if (!hasWebGL()) {
    canvas.remove();
    document.documentElement.classList.add('no-webgl');
    return;
  }
  const { initHero } = await import('./hero.js');
  initHero(canvas);
})();

/* ── rules draw; nothing else does ────────────────────────────────────────
   The site's single entrance move. A 1px hairline runs left to right across
   a section's top in 380ms. The content beneath it does not animate — it is
   simply there when you arrive.
   ─────────────────────────────────────────────────────────────────────────*/
document.querySelectorAll('.rule-draw').forEach((el) => {
  watch(el, () => el.classList.add('is-in'), null, { rootMargin: '0px 0px -8% 0px' });
});

/* ── the light moves across the work, because the work moves past it ──────
   The key is fixed relative to the viewport, not the page, so a plate's cast
   shadow swings as it travels. Quantised to whole pixels, so a typical frame
   writes nothing at all.
   ─────────────────────────────────────────────────────────────────────────*/
(() => {
  const plates = Array.from(document.querySelectorAll('.plate__art'));
  if (!plates.length) return;
  if (env.tier === 'low' || env.reducedMotion) return;

  const section = document.querySelector('.work');
  let live = false;
  if (section) watch(section, () => (live = true), () => (live = false), { rootMargin: '20% 0px' });

  let tops = [];
  const measure = () => {
    tops = plates.map((el) => {
      const r = el.getBoundingClientRect();
      return { y: r.top + window.scrollY + r.height / 2, h: r.height };
    });
  };
  measure();
  addEventListener('resize', () => setTimeout(measure, 200), { passive: true });
  addEventListener('load', measure, { passive: true });
  document.fonts?.ready.then(measure);

  const last = plates.map(() => ({ x: -99, y: -99 }));

  onTick(() => {
    if (!live || viewport.w < 768 || !tops.length) return;
    // the light, in page coordinates, sitting above and left of the viewport
    const lx = scroll.y + 0;                       // unused on x — the light is fixed
    const ly = scroll.y - viewport.h * 0.55;
    void lx;
    for (let i = 0; i < plates.length; i++) {
      const dy = tops[i].y - ly;
      const k = Math.max(0.35, Math.min(2.2, dy / (viewport.h * 1.15)));
      const sx = -Math.round(3 + k * 4);
      const sy = Math.round(4 + k * 5);
      if (sx === last[i].x && sy === last[i].y) continue;
      last[i].x = sx;
      last[i].y = sy;
      plates[i].style.setProperty('--shadow-x', `${sx}px`);
      plates[i].style.setProperty('--shadow-y', `${sy}px`);
    }
  }, 22);
})();

/* ── the rail's specimen label snaps, it does not fade ────────────────── */
(() => {
  const sections = Array.from(document.querySelectorAll('.sec'));
  if (!sections.length) return;
  for (const sec of sections) {
    const rail = sec.querySelector('.sec__rail-in');
    if (!rail) continue;
    watch(
      sec,
      () => rail.style.setProperty('opacity', '1'),
      () => rail.style.setProperty('opacity', '0.34'),
      { rootMargin: '-30% 0px -55% 0px' }
    );
  }
})();

/* ── housekeeping ─────────────────────────────────────────────────────── */
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());
