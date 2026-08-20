/* One call that every page makes to wire up the shared runtime. */

import { initScroll, refreshScroll } from './scroll.js';
import { initReveal } from './reveal.js';
import { autoSplit } from './split.js';
import { env } from './env.js';

/* ── --chrome ──────────────────────────────────────────────────────────────
   The height of whatever sits above <main>: a masthead, a ticker, both. A
   first section written as `min-height: 100svh` is a full viewport tall *from
   where it starts*, so on every page with a masthead it hangs off the bottom
   of the screen by exactly that much — which centres the hero's composition
   below the fold and buries whatever was pinned to its base. Measured once
   here rather than hard-coded per site, because the bar's height depends on
   the type it contains.
   ────────────────────────────────────────────────────────────────────────── */
function measureChrome() {
  const main = document.getElementById('main');
  if (!main) return;
  const root = document.documentElement;
  const top = Math.max(0, Math.round(main.getBoundingClientRect().top + window.scrollY));
  root.style.setProperty('--chrome', `${top}px`);

  /* And the same measurement for the bars that were taken out of flow.
     A fixed masthead contributes nothing to layout, so `--chrome` is zero on
     every site that has one — but it still covers the top of the first
     section. On a tall screen the hero's padding happens to be deeper than
     the bar and nobody notices; on a phone held sideways the padding collapses
     to its minimum and the headline is sliced off at the cap line. This is the
     height a first section has to clear before it starts. */
  let fixed = 0;
  for (const el of document.body.children) {
    if (el === main || el.contains(main)) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.top > 80) continue;    // a bar at the top, not the back-link
    fixed = Math.max(fixed, Math.round(r.bottom));
  }
  root.style.setProperty('--chrome-fixed', `${fixed}px`);
}

export function boot({ split = true, reveal = true, onReady } = {}) {
  const run = () => {
    measureChrome();
    // A resize changes the bar's wrapping, and the fonts change its metrics.
    addEventListener('resize', () => setTimeout(measureChrome, 180), { passive: true });
    document.fonts?.ready.then(measureChrome);
    initScroll();
    if (split) autoSplit();
    if (reveal) initReveal();
    document.documentElement.classList.add('is-ready');
    onReady?.();
    // Fonts land after first paint and change line wrapping — re-measure once.
    document.fonts?.ready.then(() => {
      document.documentElement.classList.add('fonts-ready');
      refreshScroll();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

export { env };
