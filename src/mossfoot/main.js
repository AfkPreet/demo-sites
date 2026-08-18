import './mossfoot.css';

import { boot } from '../lib/site.js';
import { onTick } from '../lib/ticker.js';
import { track, scroll } from '../lib/scroll.js';
import { watch } from '../lib/reveal.js';
import { env } from '../lib/env.js';
import { countUp } from '../lib/ui.js';
import { clamp, damp } from '../lib/math.js';
import { createPip } from './pip.js';

boot();

/* ── header ───────────────────────────────────────────────────────────── */
(() => {
  const bar = document.getElementById('bar');
  if (!bar) return;
  let solid = false;
  onTick(() => {
    const want = scroll.y > 30;
    if (want !== solid) {
      solid = want;
      bar.classList.toggle('is-solid', solid);
    }
  }, 60);
})();

document.querySelectorAll('[data-count]').forEach((el) =>
  countUp(el, { to: parseFloat(el.dataset.count) })
);

/* ── hero parallax ─────────────────────────────────────────────────────
   Four painted layers moving at four speeds. Transform only — the layers are
   never resized, never repainted, and the whole effect costs four matrix
   updates a frame.
   ─────────────────────────────────────────────────────────────────────── */
(() => {
  const hero = document.querySelector('.hero');
  if (!hero || env.reducedMotion) return;

  const layers = [
    ['.layer--clouds', -0.16],
    ['.layer--far', 0.1],
    ['.layer--mid', 0.19],
    ['.layer--near', 0.3],
  ]
    .map(([sel, k]) => {
      const el = hero.querySelector(sel);
      return el ? { el, k } : null;
    })
    .filter(Boolean);
  if (!layers.length) return;

  let live = true;
  watch(hero, () => (live = true), () => (live = false));

  onTick(() => {
    if (!live) return;
    const y = scroll.smooth;
    for (const l of layers) {
      l.el.style.transform = `translate3d(0, ${(y * l.k).toFixed(1)}px, 0)`;
    }
  }, 20);
})();

/* ── key art: only animate while it is on screen ──────────────────────── */
(() => {
  const fig = document.getElementById('keyart');
  if (!fig) return;
  watch(fig, () => fig.classList.add('is-live'), () => fig.classList.remove('is-live'), {
    rootMargin: '10% 0px',
  });

  const svg = fig.querySelector('.keyart__svg');
  if (!svg || env.reducedMotion) return;
  const t = track(fig, { start: 'top bottom', end: 'bottom top', scrub: 9 });
  onTick(() => {
    // A slow drift through the glade as it passes: 0.5 in the middle of the
    // screen, so the art is dead level exactly when you are looking at it.
    svg.style.transform = `translate3d(0, ${((t.eased - 0.5) * -46).toFixed(1)}px, 0)`;
  }, 20);
})();

/* ══════════════════════════════════════════════════════════════════════
   THE LANTERN — the dark panel you have to carry a light across.
   One damped point, three CSS custom properties, no canvas.
   ══════════════════════════════════════════════════════════════════════ */
(() => {
  const panel = document.getElementById('rotPanel');
  if (!panel) return;

  const glim = document.getElementById('rotGlim');
  const countEl = document.getElementById('rotCount');
  const totalEl = document.getElementById('rotTotal');
  const foundEl = document.getElementById('rotFound');

  const finds = Array.from(glim?.querySelectorAll('[data-find]') ?? []).map((el) => {
    const [x, y] = el.dataset.find.split(/\s+/).map(Number);
    return { el, x, y, got: false };
  });
  if (totalEl) totalEl.textContent = String(finds.length);
  let got = 0;

  // Panel geometry, measured — never read per frame.
  let box = { w: 1, h: 1, left: 0, top: 0 };
  let fit = { scale: 1, ox: 0, oy: 0 };   // viewBox → panel px (xMidYMid slice)
  const VB_W = 1200;
  const VB_H = 700;

  const measure = () => {
    const r = panel.getBoundingClientRect();
    box = { w: r.width, h: r.height, left: r.left + window.scrollX, top: r.top + window.scrollY };
    const scale = Math.max(r.width / VB_W, r.height / VB_H);
    fit = { scale, ox: (r.width - VB_W * scale) / 2, oy: (r.height - VB_H * scale) / 2 };
  };
  measure();
  addEventListener('resize', () => setTimeout(measure, 140), { passive: true });
  addEventListener('load', measure, { passive: true });

  // Target and current lantern position, in panel px.
  let tx = box.w * 0.5;
  let ty = box.h * 0.5;
  let cx = tx;
  let cy = ty;
  let touched = false;
  let live = false;

  watch(panel, () => (live = true), () => (live = false), { rootMargin: '15% 0px' });

  const toLocal = (e) => {
    // getBoundingClientRect() every pointermove would be a layout read per
    // event; the cached box plus the current scroll is exact and free.
    tx = e.clientX - (box.left - window.scrollX);
    ty = e.clientY - (box.top - window.scrollY);
    if (!touched) {
      touched = true;
      panel.classList.add('is-touched');
    }
  };

  panel.addEventListener('pointermove', toLocal, { passive: true });
  panel.addEventListener('pointerdown', toLocal, { passive: true });
  panel.addEventListener('pointerleave', () => { touched = false; }, { passive: true });

  onTick((dt, t) => {
    if (!live) return;

    // Untouched, the lantern wanders on its own so the panel is never dead.
    if (!touched) {
      const w = box.w;
      const h = box.h;
      tx = w * (0.5 + Math.sin(t * 0.31) * 0.26);
      ty = h * (0.5 + Math.sin(t * 0.23 + 1.4) * 0.2);
    }

    const lam = env.reducedMotion ? 30 : 11;
    cx = damp(cx, tx, lam, dt);
    cy = damp(cy, ty, lam, dt);

    const r = clamp(Math.min(box.w, box.h) * 0.36, 104, 250);
    panel.style.setProperty('--mx', `${cx.toFixed(1)}px`);
    panel.style.setProperty('--my', `${cy.toFixed(1)}px`);
    panel.style.setProperty('--r', `${r.toFixed(0)}px`);

    // Anything the light has properly landed on counts as found.
    if (got < finds.length) {
      const hit = r * 0.5;
      for (const f of finds) {
        if (f.got) continue;
        const fx = fit.ox + f.x * fit.scale;
        const fy = fit.oy + f.y * fit.scale;
        if (Math.hypot(fx - cx, fy - cy) > hit) continue;
        f.got = true;
        got++;
        f.el.classList.add('is-found');
        if (countEl) countEl.textContent = String(got);
        if (got === finds.length && foundEl) {
          foundEl.innerHTML = 'All found — that is the whole game, really.';
        }
      }
    }
  }, 25);
})();

/* ── the cast: poke them ──────────────────────────────────────────────── */
(() => {
  const cards = Array.from(document.querySelectorAll('.cast__card'));
  if (!cards.length) return;

  for (const card of cards) {
    let timer;
    const poke = () => {
      card.classList.remove('is-poked');
      // Force the animation to restart even on a rapid second poke.
      void card.offsetWidth;
      card.classList.add('is-poked');
      clearTimeout(timer);
      timer = setTimeout(() => card.classList.remove('is-poked'), 1400);
    };
    card.addEventListener('pointerenter', poke);
    card.addEventListener('click', poke);
    card.addEventListener('focus', poke);
  }
})();

/* ── the wishlist form ────────────────────────────────────────────────── */
(() => {
  const form = document.getElementById('joinForm');
  const ok = document.getElementById('joinOk');
  const err = document.getElementById('joinErr');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.elements.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      err.hidden = false;
      ok.hidden = true;
      form.elements.email.focus();
      return;
    }
    err.hidden = true;
    ok.hidden = false;
    ok.textContent =
      `Lamp lit. The First Lamp is on its way to ${email}, and we'll write again when ` +
      `there's something worth showing. (This is a demonstration site, so no email was actually sent.)`;
  });
})();

/* ══════════════════════════════════════════════════════════════════════
   PIP
   ══════════════════════════════════════════════════════════════════════ */
(() => {
  const dock = document.getElementById('pipDock');
  const hero = document.querySelector('.hero');
  const counter = document.getElementById('cheerCount');
  if (!dock || !hero) return;

  let cheers = 0;
  const pip = createPip(dock, hero, {
    onCheer() {
      cheers++;
      if (counter) counter.textContent = String(cheers);
    },
  });
  // The hero is a plain block, never sticky, so it is safe to track directly.
  pip?.useTrack(track(hero, { start: 'top top', end: '62% top', scrub: 7 }));
})();
