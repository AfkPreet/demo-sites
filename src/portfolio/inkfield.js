/*
 * "Ink" — a curl-flow field drawn stroke by stroke as the Studio section
 * scrolls into place. Nothing is precomputed and nothing is stored: each frame
 * draws only the strokes that the scroll position has newly unlocked, capped
 * so a fast flick can never turn into a long task.
 */

import { onTick } from '../lib/ticker.js';
import { track } from '../lib/scroll.js';
import { env, q } from '../lib/env.js';
import { rng, clamp, easeInOutCubic, TAU } from '../lib/math.js';

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a, b, t) => a + (b - a) * t;

function perlin2(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  const r = rng(seed);
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad = (h, x, y) => ((h & 1) ? x : -x) + ((h & 2) ? y : -y);

  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const X = xi & 255, Y = yi & 255;
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    return mix(
      mix(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      mix(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v
    );
  };
}

export function initInk(canvas, { caption } = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const TOTAL = q(2600, 5200, 9000);
  const STEPS = q(20, 26, 30);
  const PER_FRAME = 420;

  const PALETTE = ['#efece6', '#efece6', '#efece6', '#efece6', '#efece6', '#c9bcff', '#8fe8cf', '#9aa6ff'];

  let w = 0, h = 0, dpr = 1;
  let drawn = 0;
  let noise = perlin2(4242);
  let rand = rng(1177);

  function setup() {
    const r = canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    dpr = Math.min(window.devicePixelRatio || 1, env.tier === 'low' ? 1.25 : 2);
    w = Math.round(r.width);
    h = Math.round(r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawn = 0;
    noise = perlin2(4242);
    rand = rng(1177);
    return true;
  }

  let ready = setup();

  // One stroke: seed a point, walk the flow field, stroke the polyline.
  function drawStroke(i) {
    const scale = 0.0022 + (i % 3) * 0.0006;
    let x = rand() * w;
    let y = rand() * h;

    // Bias seeds toward a soft ellipse so the drawing has a centre of mass
    // instead of filling the frame like wallpaper.
    const cx = w * 0.5, cy = h * 0.47;
    const tighten = rand();
    if (tighten > 0.35) {
      const a = rand() * TAU;
      const rr = Math.pow(rand(), 0.62);
      x = cx + Math.cos(a) * rr * w * 0.52;
      y = cy + Math.sin(a) * rr * h * 0.5;
    }

    const life = STEPS * (0.45 + rand() * 0.75);
    const step = 2 + rand() * 2.4;
    const accent = rand() > 0.86;
    ctx.strokeStyle = accent ? PALETTE[5 + ((i % 3) | 0)] : PALETTE[0];
    ctx.globalAlpha = accent ? 0.1 : 0.055 + rand() * 0.05;
    ctx.lineWidth = accent ? 0.75 : 0.5 + rand() * 0.7;

    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < life; s++) {
      const n = noise(x * scale, y * scale);
      const n2 = noise(x * scale * 2.3 + 91.7, y * scale * 2.3 - 41.2) * 0.35;
      const a = (n + n2) * TAU * 1.35;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      if (x < -30 || x > w + 30 || y < -30 || y > h + 30) break;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const t = track(canvas.parentElement ?? canvas, {
    start: 'top bottom',
    end: 'bottom center',
  });

  let lastW = window.innerWidth;
  addEventListener(
    'resize',
    () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(setup._t);
      setup._t = setTimeout(() => { ready = setup(); }, 220);
    },
    { passive: true }
  );

  onTick(() => {
    if (!ready) {
      ready = setup();
      if (!ready) return;
    }
    if (drawn >= TOTAL) return;

    // Reduced motion gets the finished picture rather than a growing one.
    const p = env.reducedMotion ? 1 : easeInOutCubic(clamp(t.progress / 0.86));
    const want = Math.min(TOTAL, Math.floor(p * TOTAL));
    if (want <= drawn) return;

    const end = Math.min(want, drawn + PER_FRAME);
    for (let i = drawn; i < end; i++) drawStroke(i);
    drawn = end;

    if (caption && drawn >= TOTAL) {
      caption.textContent = caption.textContent.replace(/[\d,]+ strokes/, `${TOTAL.toLocaleString('en-US')} strokes`);
    }
  }, 30);

  if (caption) {
    caption.textContent = caption.textContent.replace(/[\d,]+ strokes/, `${TOTAL.toLocaleString('en-US')} strokes`);
  }
}
