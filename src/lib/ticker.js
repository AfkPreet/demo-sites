/*
 * One requestAnimationFrame loop for the entire page.
 *
 * Every animated thing subscribes here instead of starting its own rAF. That
 * keeps ordering deterministic (scroll math always resolves before anything
 * reads it) and means the browser only ever schedules a single callback.
 */

const subs = [];
let running = false;
let last = 0;
let dirty = false;

function frame(now) {
  if (!running) return;
  const t = now * 0.001;
  // Clamp dt so a backgrounded tab or a long task can't fire a huge step
  // that teleports every damped value.
  const dt = last ? Math.min(t - last, 1 / 20) : 1 / 60;
  last = t;

  if (dirty) {
    subs.sort((a, b) => a.p - b.p);
    dirty = false;
  }

  for (let i = 0; i < subs.length; i++) subs[i].fn(dt, t);

  requestAnimationFrame(frame);
}

function start() {
  if (running) return;
  running = true;
  last = 0;
  requestAnimationFrame(frame);
}

function stop() {
  running = false;
}

/**
 * @param {(dt:number, t:number) => void} fn
 * @param {number} priority lower runs first. Scroll uses -100.
 * @returns {() => void} unsubscribe
 */
export function onTick(fn, priority = 0) {
  const entry = { fn, p: priority };
  subs.push(entry);
  dirty = true;
  start();
  return () => {
    const i = subs.indexOf(entry);
    if (i > -1) subs.splice(i, 1);
  };
}

document.addEventListener(
  'visibilitychange',
  () => {
    if (document.hidden) stop();
    else start();
  },
  { passive: true }
);
