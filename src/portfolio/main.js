import './portfolio.css';

import { boot } from '../lib/site.js';
import { onTick } from '../lib/ticker.js';
import { scroll, viewport } from '../lib/scroll.js';
import { env, hasWebGL } from '../lib/env.js';
import { magnetic, cursor, countUp, scrollProgressBar } from '../lib/ui.js';
import { clamp } from '../lib/math.js';
import { initInk } from './inkfield.js';

boot();

/* ── nav: solid on scroll, out of the way when reading downward ───────── */
(() => {
  const nav = document.getElementById('nav');
  if (!nav) return;
  let hidden = false;
  let solid = false;
  onTick(() => {
    const y = scroll.y;
    const wantSolid = y > 40;
    if (wantSolid !== solid) {
      solid = wantSolid;
      nav.classList.toggle('is-solid', solid);
    }
    const wantHidden = y > 520 && scroll.direction > 0 && scroll.velocity > 60;
    const wantShown = scroll.direction < 0 || y < 200;
    if (wantHidden && !hidden) {
      hidden = true;
      nav.classList.add('is-hidden');
    } else if (wantShown && hidden) {
      hidden = false;
      nav.classList.remove('is-hidden');
    }
  }, 60);
})();

/* ── hero WebGL (progressively enhanced) ──────────────────────────────── */
(async () => {
  const canvas = document.getElementById('stage');
  if (!canvas) return;
  if (!hasWebGL()) {
    canvas.remove();
    document.documentElement.classList.add('no-webgl');
    return;
  }
  const { initHero } = await import('./hero.js');
  initHero(canvas);
})();

/* ── generative ink drawing in the Studio section ─────────────────────── */
initInk(document.getElementById('ink'), {
  caption: document.querySelector('.studio__cap'),
});

/* ── the stacked work cards ───────────────────────────────────────────── */
(() => {
  const list = document.querySelector('.work__list');
  const slots = Array.from(document.querySelectorAll('.wslot'));
  if (!list || !slots.length) return;

  const cards = slots.map((s) => s.querySelector('.wcard'));
  let tops = [];
  let pinTop = 0;
  let sectionVisible = false;
  let live = -2;

  const absTop = (el) => {
    let y = 0;
    let n = el;
    while (n) {
      y += n.offsetTop;
      n = n.offsetParent;
    }
    return y;
  };

  // Both getBoundingClientRect() and offsetTop report a sticky element at its
  // *pinned* position, not where it sits in layout. Measuring mid-page would
  // therefore collapse every already-pinned slot onto the same offset. Drop
  // the slots out of sticky for the duration of the read — they are ordinary
  // block-level <li>s either way, so layout is identical.
  const measure = () => {
    for (const s of slots) s.style.position = 'static';
    tops = slots.map(absTop);
    for (const s of slots) s.style.position = '';
    pinTop = parseFloat(getComputedStyle(slots[0]).top) || 0;
  };

  measure();
  addEventListener('resize', () => setTimeout(measure, 200), { passive: true });
  addEventListener('load', measure, { passive: true });
  document.fonts?.ready.then(measure);

  new IntersectionObserver(
    ([e]) => {
      sectionVisible = e.isIntersecting;
      if (!sectionVisible) {
        cards.forEach((c) => c.classList.remove('is-live'));
        live = -2;
      }
    },
    { rootMargin: '20% 0px 20% 0px' }
  ).observe(list);

  const last = slots.length - 1;

  onTick(() => {
    if (!sectionVisible || !tops.length) return;
    const y = scroll.smooth;
    let active = -1;

    for (let i = 0; i < slots.length; i++) {
      const start = tops[i] - pinTop;
      if (y >= start - viewport.h * 0.55) active = i;

      // How far the *next* card has come to cover this one.
      const span = i < last ? tops[i + 1] - tops[i] : viewport.h;
      const p = i < last ? clamp((y - start) / span) : 0;

      const card = cards[i];
      if (p <= 0.0005 && card.dataset.flat === '1') continue;
      card.dataset.flat = p <= 0.0005 ? '1' : '0';
      card.style.transform = `translate3d(0, ${(-p * 26).toFixed(2)}px, 0) scale(${(1 - p * 0.07).toFixed(4)})`;
      card.style.setProperty('--dim', (p * 0.55).toFixed(3));
    }

    if (active !== live) {
      cards.forEach((c, i) => c.classList.toggle('is-live', i === active || i === active + 1));
      live = active;
    }
  }, 20);
})();

/* ── micro-interactions ───────────────────────────────────────────────── */
document.querySelectorAll('[data-magnetic]').forEach((el) => magnetic(el));
document.querySelectorAll('[data-count]').forEach((el) =>
  countUp(el, { to: parseFloat(el.dataset.count) })
);
scrollProgressBar(document.getElementById('scrollbar'));
if (!env.touch) cursor();

/* ── copy email ───────────────────────────────────────────────────────── */
(() => {
  const btn = document.getElementById('copyMail');
  const hint = document.getElementById('hint');
  if (!btn) return;
  let t;
  btn.addEventListener('click', async () => {
    const text = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('is-copied');
      clearTimeout(t);
      t = setTimeout(() => btn.classList.remove('is-copied'), 1800);
    } catch {
      if (!hint) return;
      hint.hidden = false;
      hint.querySelector('span').textContent = text;
      hint.classList.add('is-on');
      clearTimeout(t);
      t = setTimeout(() => hint.classList.remove('is-on'), 4000);
    }
  });
})();

/* ── housekeeping ─────────────────────────────────────────────────────── */
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());
