/* Tiny math helpers shared by every site. Pure functions, no allocations. */

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Map v from [a,b] into [c,d], clamped. */
export const map = (v, a, b, c = 0, d = 1) => clamp((v - a) / (b - a)) * (d - c) + c;

/** Frame-rate independent damping. lambda ~ 4 (lazy) .. 16 (snappy). */
export const damp = (current, target, lambda, dt) =>
  target + (current - target) * Math.exp(-lambda * dt);

export const smoothstep = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};

export const smootherstep = (t) => {
  t = clamp(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t) => Math.pow(clamp(t), 3);
export const easeInOutCubic = (t) =>
  (t = clamp(t)) < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutExpo = (t) => ((t = clamp(t)) === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  t = clamp(t);
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Progress of v across the window [a,b], clamped 0..1. */
export const seg = (v, a, b) => clamp((v - a) / (b - a));

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Mulberry32 — seeded RNG so generated art is identical on every load. */
export const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const TAU = Math.PI * 2;
