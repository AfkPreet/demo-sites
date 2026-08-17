/* One call that every page makes to wire up the shared runtime. */

import { initScroll, refreshScroll } from './scroll.js';
import { initReveal } from './reveal.js';
import { autoSplit } from './split.js';
import { env } from './env.js';

export function boot({ split = true, reveal = true, onReady } = {}) {
  const run = () => {
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
