/*
 * Device capability probe. Every site reads from here so that quality decisions
 * are made once, consistently, and always err toward "smoother".
 */

const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false, addEventListener() {} });

const reducedMQ = mq('(prefers-reduced-motion: reduce)');
const coarseMQ = mq('(pointer: coarse)');

export const env = {
  /** User asked the OS for less motion — we honour it everywhere. */
  reducedMotion: reducedMQ.matches,
  /** Touch-first device. */
  touch: coarseMQ.matches,
  /** Phone-sized viewport (recomputed on resize). */
  mobile: false,
  /** 'low' | 'mid' | 'high' */
  tier: 'mid',
  dpr: 1,
  /** Set true once the page has painted at least once. */
  ready: false,
};

function computeTier() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || (env.touch ? 4 : 8);
  const small = Math.min(innerWidth, innerHeight) < 500;

  env.mobile = innerWidth < 768 || (env.touch && small);

  if (mem <= 2 || cores <= 3) return 'low';
  if (env.touch) return cores >= 8 && mem >= 6 ? 'mid' : 'low';
  return cores >= 8 ? 'high' : 'mid';
}

function computeDpr() {
  const raw = window.devicePixelRatio || 1;
  if (env.tier === 'low') return Math.min(raw, 1.25);
  if (env.tier === 'mid') return Math.min(raw, 1.6);
  return Math.min(raw, 2);
}

export function refreshEnv() {
  env.tier = computeTier();
  env.dpr = computeDpr();
  document.documentElement.dataset.tier = env.tier;
  if (env.reducedMotion) document.documentElement.dataset.reduced = 'true';
}

refreshEnv();

let rt;
addEventListener(
  'resize',
  () => {
    clearTimeout(rt);
    rt = setTimeout(refreshEnv, 200);
  },
  { passive: true }
);

reducedMQ.addEventListener?.('change', (e) => {
  env.reducedMotion = e.matches;
  refreshEnv();
  location.reload();
});

/** Particle / segment counts scaled by tier. */
export const q = (low, mid, high) => (env.tier === 'low' ? low : env.tier === 'mid' ? mid : high);

/** True when WebGL2 is actually usable. */
export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
