/*
 * Scroll engine.
 *
 * Deliberately does NOT hijack scrolling. Native scroll is the smoothest thing
 * a phone can do; wrapping it in a transformed container costs you momentum,
 * address-bar behaviour, accessibility and battery. Instead we sample scrollY
 * once per frame and expose a damped copy that animations read from — which
 * gives the same silky "scrub" feel with none of the cost.
 *
 * Element positions are measured in batched passes (never per-frame) so the
 * per-frame cost of a hundred tracked elements is a hundred subtractions.
 */

import { onTick } from './ticker.js';
import { clamp, damp } from './math.js';

export const viewport = { w: 0, h: 0, doc: 0 };

export const scroll = {
  /** Raw window.scrollY, sampled once per frame. */
  y: 0,
  /** Damped copy of y — use this for anything visual. */
  smooth: 0,
  /** px/second, damped. Positive = scrolling down. */
  velocity: 0,
  /** -1 up, 1 down. */
  direction: 1,
  /** 0..1 through the whole document. */
  progress: 0,
};

const EDGES = { top: 0, center: 0.5, centre: 0.5, middle: 0.5, bottom: 1, start: 0, end: 1 };

function parseEdge(part) {
  if (part in EDGES) return EDGES[part];
  const n = parseFloat(part);
  return Number.isFinite(n) ? (part.endsWith('%') ? n / 100 : n) : 0;
}

function parseSpec(spec) {
  const [a, b] = String(spec).trim().split(/\s+/);
  return [parseEdge(a), parseEdge(b ?? 'top')];
}

class Track {
  /**
   * @param {Element} el
   * @param {object} opts
   * @param {string} [opts.start='top bottom'] "<elementEdge> <viewportEdge>" — progress hits 0 here
   * @param {string} [opts.end='bottom top']   progress hits 1 here
   * @param {number} [opts.scrub=0]            >0 enables `.eased`, higher = snappier
   */
  constructor(el, opts = {}) {
    this.el = el;
    this.start = parseSpec(opts.start ?? 'top bottom');
    this.end = parseSpec(opts.end ?? 'bottom top');
    this.scrub = opts.scrub ?? 0;
    this.progress = 0;
    this.eased = 0;
    this.active = false;
    this.s = 0;
    this.e = 1;
    this.measure();
  }

  measure() {
    // NB: never hand a position:sticky element to track(). Its rect reports the
    // pinned position, so the measurement would depend on where the page
    // happened to be scrolled. Track the tall outer section instead and let the
    // inner stage be the sticky one.
    const r = this.el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    const h = r.height;
    this.s = top + this.start[0] * h - this.start[1] * viewport.h;
    this.e = top + this.end[0] * h - this.end[1] * viewport.h;
    if (this.e - this.s < 1) this.e = this.s + 1;
  }

  update(dt) {
    const p = clamp((scroll.y - this.s) / (this.e - this.s));
    this.progress = p;
    this.eased = this.scrub > 0 ? damp(this.eased, p, this.scrub, dt) : p;
    this.active = p > 0 && p < 1;
  }

  destroy() {
    tracks.delete(this);
  }
}

const tracks = new Set();

/** Create a scroll-linked progress value for an element. */
export function track(el, opts) {
  if (!el) return { progress: 0, eased: 0, active: false, measure() {}, destroy() {} };
  const t = new Track(el, opts);
  tracks.add(t);
  return t;
}

/* ------------------------------------------------------------------ *
 * Measurement
 * ------------------------------------------------------------------ */

let lastW = 0;
let lastH = 0;

function readViewport() {
  viewport.w = document.documentElement.clientWidth;
  viewport.h = window.innerHeight;
  viewport.doc = Math.max(1, document.documentElement.scrollHeight - viewport.h);
}

export function measureAll() {
  readViewport();
  // One read pass, no interleaved writes → a single layout flush.
  for (const t of tracks) t.measure();
  lastW = viewport.w;
  lastH = viewport.h;
}

let measureQueued = false;
function queueMeasure() {
  if (measureQueued) return;
  measureQueued = true;
  requestAnimationFrame(() => {
    measureQueued = false;
    measureAll();
  });
}

let resizeTimer;
addEventListener(
  'resize',
  () => {
    const w = document.documentElement.clientWidth;
    const h = window.innerHeight;
    // On phones the URL bar collapsing fires resize with a ~10% height delta.
    // Re-measuring there makes pinned sections visibly jump, so ignore it.
    const significant = w !== lastW || Math.abs(h - lastH) > lastH * 0.2;
    if (!significant) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(queueMeasure, 120);
  },
  { passive: true }
);

addEventListener('orientationchange', () => setTimeout(queueMeasure, 300), { passive: true });
addEventListener('load', queueMeasure, { passive: true });
document.fonts?.ready.then(queueMeasure);

/** Call after adding/removing content that changes page height. */
export const refreshScroll = queueMeasure;

/* ------------------------------------------------------------------ *
 * Per-frame update — priority -100 so it always resolves first.
 * ------------------------------------------------------------------ */

let initialised = false;
export function initScroll() {
  if (initialised) return;
  initialised = true;
  readViewport();
  scroll.y = scroll.smooth = window.scrollY;

  onTick((dt) => {
    const y = window.scrollY;
    const dy = y - scroll.y;
    if (dy !== 0) scroll.direction = dy > 0 ? 1 : -1;
    scroll.y = y;
    scroll.smooth = damp(scroll.smooth, y, 12, dt);
    scroll.velocity = damp(scroll.velocity, dy / Math.max(dt, 0.001), 10, dt);
    scroll.progress = clamp(y / viewport.doc);

    for (const t of tracks) t.update(dt);
  }, -100);

  // The document grows as lazy content settles; a couple of cheap re-measures
  // in the first seconds beats a ResizeObserver running forever.
  let n = 0;
  const settle = setInterval(() => {
    const d = Math.max(1, document.documentElement.scrollHeight - viewport.h);
    if (Math.abs(d - viewport.doc) > 4) measureAll();
    if (++n > 6) clearInterval(settle);
  }, 500);
}
