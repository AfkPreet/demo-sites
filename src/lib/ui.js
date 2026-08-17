/*
 * Shared interaction primitives. All of them run off the single ticker and
 * only ever write transform/opacity.
 */

import { onTick } from './ticker.js';
import { env } from './env.js';
import { scroll } from './scroll.js';
import { clamp, damp, lerp } from './math.js';

/* ------------------------------------------------------------------ *
 * Magnetic buttons — pointer-seeking. Desktop only; on touch it would
 * just add latency to a tap.
 * ------------------------------------------------------------------ */
export function magnetic(el, { strength = 0.32, radius = 1.6, lambda = 12 } = {}) {
  if (env.touch || env.reducedMotion || !el) return () => {};
  let tx = 0, ty = 0, x = 0, y = 0, inside = false;

  const onMove = (e) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const max = Math.max(r.width, r.height) * radius;
    if (Math.hypot(dx, dy) > max) {
      inside = false;
      tx = ty = 0;
      return;
    }
    inside = true;
    tx = dx * strength;
    ty = dy * strength;
  };

  addEventListener('pointermove', onMove, { passive: true });
  const off = onTick((dt) => {
    x = damp(x, tx, lambda, dt);
    y = damp(y, ty, lambda, dt);
    if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01 && !inside) {
      el.style.transform = '';
      return;
    }
    el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
  });

  return () => {
    removeEventListener('pointermove', onMove);
    off();
    el.style.transform = '';
  };
}

/* ------------------------------------------------------------------ *
 * Infinite marquee that leans into scroll velocity.
 * Expects: <div class="mq"><div class="mq__track">…one copy…</div></div>
 * ------------------------------------------------------------------ */
export function marquee(root, { speed = 40, velocity = 0.06, direction = 1, maxSkew = 0 } = {}) {
  const track = root.querySelector('[data-mq-track]') ?? root.firstElementChild;
  if (!track) return () => {};

  const original = track.innerHTML;
  let unit = 0;
  let x = 0;

  const build = () => {
    track.innerHTML = original;
    unit = track.scrollWidth;
    if (unit < 4) return;
    const need = Math.ceil((root.offsetWidth * 2) / unit) + 1;
    let html = original;
    for (let i = 1; i < need; i++) html += original;
    track.innerHTML = html;
  };

  build();
  let w = window.innerWidth;
  addEventListener(
    'resize',
    () => {
      if (window.innerWidth === w) return;
      w = window.innerWidth;
      build();
    },
    { passive: true }
  );

  if (env.reducedMotion) {
    track.style.transform = 'translate3d(0,0,0)';
    return () => {};
  }

  let skew = 0;
  const off = onTick((dt) => {
    if (!unit) return;
    const v = scroll.velocity * velocity;
    x -= (speed * direction + v) * dt;
    // keep x inside one copy so the number never grows unbounded
    x = ((x % unit) + unit) % unit;
    if (maxSkew) {
      skew = damp(skew, clamp(scroll.velocity * 0.004, -maxSkew, maxSkew), 8, dt);
      track.style.transform = `translate3d(${-x.toFixed(2)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
    } else {
      track.style.transform = `translate3d(${-x.toFixed(2)}px,0,0)`;
    }
  });

  return off;
}

/* ------------------------------------------------------------------ *
 * Count-up numbers, fired when the element enters view.
 * ------------------------------------------------------------------ */
export function countUp(el, { to, dur = 1600, decimals = 0, prefix = '', suffix = '' } = {}) {
  const target = to ?? parseFloat(el.dataset.count ?? el.textContent) ?? 0;
  const fmt = (v) => prefix + v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix;
  if (env.reducedMotion) {
    el.textContent = fmt(target);
    return;
  }
  el.textContent = fmt(0);
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const off = onTick(() => {
        const p = clamp((performance.now() - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = fmt(target * eased);
        if (p >= 1) off();
      });
    },
    { threshold: 0.4 }
  );
  io.observe(el);
}

/* ------------------------------------------------------------------ *
 * Custom cursor. Desktop + fine pointer only.
 * ------------------------------------------------------------------ */
export function cursor({ hoverSelector = 'a, button, [data-cursor]', className = 'pk-cursor' } = {}) {
  if (env.touch || !matchMedia('(pointer: fine)').matches) return null;

  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<span class="${className}__dot"></span><span class="${className}__ring"></span>`;
  document.body.appendChild(el);

  let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty;
  let scale = 1, tScale = 1;
  let label = '';

  addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });

  document.addEventListener('pointerover', (e) => {
    const hit = e.target.closest?.(hoverSelector);
    tScale = hit ? 1.9 : 1;
    const l = hit?.dataset?.cursor ?? '';
    if (l !== label) {
      label = l;
      el.dataset.label = l;
      el.classList.toggle(`${className}--label`, !!l);
    }
    el.classList.toggle(`${className}--hover`, !!hit);
  }, { passive: true });

  document.addEventListener('pointerdown', () => el.classList.add(`${className}--down`), { passive: true });
  document.addEventListener('pointerup', () => el.classList.remove(`${className}--down`), { passive: true });
  document.addEventListener('mouseleave', () => el.classList.add(`${className}--out`), { passive: true });
  document.addEventListener('mouseenter', () => el.classList.remove(`${className}--out`), { passive: true });

  onTick((dt) => {
    x = damp(x, tx, 26, dt);
    y = damp(y, ty, 26, dt);
    scale = damp(scale, tScale, 16, dt);
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    el.style.setProperty('--s', scale.toFixed(3));
  });

  document.documentElement.classList.add('has-custom-cursor');
  return el;
}

/* ------------------------------------------------------------------ *
 * 3D tilt on hover.
 * ------------------------------------------------------------------ */
export function tilt(el, { max = 8, scale = 1.02, lambda = 14, perspective = 900 } = {}) {
  if (env.touch || env.reducedMotion) return () => {};
  let tx = 0, ty = 0, ts = 1, cx = 0, cy = 0, cs = 1, live = false;

  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    tx = -py * max * 2;
    ty = px * max * 2;
    ts = scale;
    live = true;
  }, { passive: true });

  el.addEventListener('pointerleave', () => { tx = ty = 0; ts = 1; }, { passive: true });

  const off = onTick((dt) => {
    if (!live) return;
    cx = damp(cx, tx, lambda, dt);
    cy = damp(cy, ty, lambda, dt);
    cs = damp(cs, ts, lambda, dt);
    if (Math.abs(cx) < 0.005 && Math.abs(cy) < 0.005 && Math.abs(cs - 1) < 0.0005) {
      el.style.transform = '';
      live = false;
      return;
    }
    el.style.transform = `perspective(${perspective}px) rotateX(${cx.toFixed(2)}deg) rotateY(${cy.toFixed(2)}deg) scale(${cs.toFixed(3)})`;
  });
  return off;
}

/* ------------------------------------------------------------------ *
 * Device orientation → -1..1, so touch users get the parallax too.
 * ------------------------------------------------------------------ */
export function tiltSensor() {
  const s = { x: 0, y: 0, tx: 0, ty: 0, supported: false };
  if (!env.touch) return s;
  addEventListener(
    'deviceorientation',
    (e) => {
      if (e.gamma == null) return;
      s.supported = true;
      s.tx = clamp(e.gamma / 40, -1, 1);
      s.ty = clamp((e.beta - 45) / 40, -1, 1);
    },
    { passive: true }
  );
  onTick((dt) => {
    s.x = damp(s.x, s.tx, 6, dt);
    s.y = damp(s.y, s.ty, 6, dt);
  });
  return s;
}

/* ------------------------------------------------------------------ *
 * Progress bar bound to document scroll.
 * ------------------------------------------------------------------ */
export function scrollProgressBar(el) {
  if (!el) return;
  onTick(() => {
    el.style.transform = `scaleX(${scroll.progress.toFixed(4)})`;
  }, 60);
}

export { lerp, clamp, damp };
