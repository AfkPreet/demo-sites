/*
 * Entrance reveals via IntersectionObserver — no scroll listeners, no per-frame
 * cost. Elements opt in with `data-rv`; CSS in base.css owns the actual motion.
 *
 *   <p data-rv="up">…</p>
 *   <div data-rv="up" data-rv-stagger>  → children stagger by --i
 */

import { env } from './env.js';

let io;

function activate(el) {
  el.classList.add('rv-in');
  if (el.hasAttribute('data-rv-stagger')) {
    Array.from(el.children).forEach((c, i) => c.style.setProperty('--i', i));
  }
}

export function initReveal(root = document) {
  const els = Array.from(root.querySelectorAll('[data-rv]'));
  if (!els.length) return;

  if (env.reducedMotion) {
    els.forEach(activate);
    return;
  }

  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        activate(e.target);
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.01 }
  );

  for (const el of els) {
    // Anything already on screen at load reveals immediately rather than
    // waiting for a scroll that may never come.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.9 && r.bottom > 0) {
      requestAnimationFrame(() => activate(el));
    } else {
      io.observe(el);
    }
  }
}

/** Observe a single element, calling back on enter/leave. */
export function watch(el, onEnter, onLeave, opts) {
  const obs = new IntersectionObserver(
    ([e]) => (e.isIntersecting ? onEnter?.(e) : onLeave?.(e)),
    { threshold: 0, ...opts }
  );
  obs.observe(el);
  return () => obs.disconnect();
}
