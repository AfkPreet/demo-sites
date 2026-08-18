import './vz.css';

import { boot } from '../lib/site.js';
import { Stage, THREE } from '../lib/gl.js';
import { onTick } from '../lib/ticker.js';
import { track, scroll } from '../lib/scroll.js';
import { watch } from '../lib/reveal.js';
import { env, hasWebGL } from '../lib/env.js';
import { countUp } from '../lib/ui.js';
import { clamp, lerp, smoothstep } from '../lib/math.js';

boot();

/* ── header ───────────────────────────────────────────────────────────── */
(() => {
  const bar = document.getElementById('bar');
  if (!bar) return;
  let solid = false;
  onTick(() => {
    const want = scroll.y > 24;
    if (want !== solid) {
      solid = want;
      bar.classList.toggle('is-solid', solid);
    }
  }, 60);
})();

document.querySelectorAll('[data-count]').forEach((el) =>
  countUp(el, { to: parseFloat(el.dataset.count), dur: 1400 })
);

/* ── the hero plan draws itself ───────────────────────────────────────── */
(() => {
  const fig = document.querySelector('.hero__plan');
  if (!fig) return;
  fig.querySelectorAll('.draw').forEach((path, i) => {
    // Each path times its own dash from its own length, so a long wall takes
    // longer to draw than a door swing — which is how a hand does it.
    const len = Math.ceil(path.getTotalLength());
    path.style.setProperty('--len', len);
    path.style.setProperty('--i', i);
    path.style.animationDuration = `${clamp(len / 900, 0.5, 2.1)}s`;
  });
  watch(fig, () => fig.classList.add('is-live'), null, { rootMargin: '0px 0px -10% 0px' });
})();

/* ══════════════════════════════════════════════════════════════════════
   SIGNATURE MOMENT — the house assembles itself
   ══════════════════════════════════════════════════════════════════════ */
(async () => {
  const canvas = document.getElementById('house');
  const runway = document.getElementById('build');
  const caps = Array.from(document.querySelectorAll('.cap'));
  const ticks = Array.from(document.querySelectorAll('[data-tick]'));
  if (!canvas || !runway) return;

  const CH = 6;   // chapters 00…06, so progress runs 0 → 6

  if (!hasWebGL()) {
    // The stylesheet collapses the runway and lays the seven chapters out as
    // text; nothing here should set inline opacity and fight it.
    document.documentElement.classList.add('no-webgl');
    canvas.remove();
    return;
  }

  const stage = new Stage(canvas, {
    alpha: true,
    antialias: env.tier !== 'low',
    dprScale: env.tier === 'high' ? 1 : 0.92,
    camera: null,
  });

  /* An orthographic camera, because an axonometric with perspective in it is
     not an axonometric. Stage only manages aspect for perspective cameras, so
     the frustum is fitted here instead. */
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  stage.camera = cam;

  let fitW = 0;
  let fitH = 0;
  const fit = (w, h) => {
    fitW = w;
    fitH = h;
    const a = w / h;
    let halfW;
    let halfH;
    if (a >= 1.15) {
      // Landscape: fit the height, then make sure the 12 m plan still fits.
      halfH = 9.4;
      halfW = halfH * a;
      if (halfW < 13.2) { halfW = 13.2; halfH = halfW / a; }
    } else {
      // Portrait: fit the width and let the sheet be tall.
      halfW = 9.2;
      halfH = halfW / a;
    }
    // The caption sits bottom-left on wide screens, so the drawing is nudged
    // up and to the right out of its way.
    const sx = a >= 1.15 ? -halfW * 0.1 : 0;
    const sy = a >= 1.15 ? -halfH * 0.05 : -halfH * 0.17;
    cam.left = -halfW + sx;
    cam.right = halfW + sx;
    cam.top = halfH + sy;
    cam.bottom = -halfH + sy;
    cam.updateProjectionMatrix();
  };
  fit(stage.width, stage.height);

  const { buildHouse } = await import('./house.js');
  const rig = buildHouse(stage);

  const t = track(runway, { start: 'top top', end: 'bottom bottom', scrub: 7 });

  let started = false;
  let shown = -1;

  stage.onFrame((dt) => {
    if (stage.width !== fitW || stage.height !== fitH) fit(stage.width, stage.height);

    const p = t.eased * CH;
    rig.setProgress(p);

    /* The view turns slowly as the house goes up — 26° in total, so it reads
       as the drawing being turned on the table rather than a camera move. */
    const turn = lerp(-0.30, 0.16, smoothstep(t.eased));
    const lift = lerp(0.66, 0.86, smoothstep(clamp(t.eased * 1.2)));
    /* Looking from the south-east: that is the side with the opening, the
       glazing and the steps on it, and it puts the tall blank north wall at
       the back where it belongs. */
    const d = 60;
    const az = Math.PI * 0.75 + turn;
    cam.position.set(Math.sin(az) * d, lift * d * 0.6, Math.cos(az) * d);

    /* The sheet opens out as the building rises. At chapter 00 there is
       nothing but a flat site, so the view is close and aimed at the ground;
       by chapter 06 it has pulled back and lifted to take in the roof. An
       orthographic zoom is the honest way to do this — moving the camera
       would change nothing at all. */
    const grow = smoothstep(clamp(t.eased * 1.12));
    cam.zoom = lerp(1.32, 1, grow);
    cam.updateProjectionMatrix();
    cam.lookAt(0, lerp(0.6, 3.1, grow), 0);

    /* Captions. Each one is a plateau around its own chapter with a short
       fade either side — a pure function of p, so scrolling back up plays it
       backwards exactly. */
    for (let i = 0; i < caps.length; i++) {
      const d0 = Math.abs(p - i);
      const o = smoothstep(clamp((0.86 - d0) / 0.46));
      caps[i].style.opacity = o.toFixed(3);
      caps[i].style.transform = `translate3d(0, ${((p - i) * -14).toFixed(1)}px, 0)`;
      caps[i].style.visibility = o > 0.004 ? 'visible' : 'hidden';
    }

    const near = Math.round(clamp(p, 0, CH));
    if (near !== shown) {
      shown = near;
      for (let i = 0; i < ticks.length; i++) ticks[i].classList.toggle('is-on', i === near);
    }

    const go = p > 0.12;
    if (go !== started) {
      started = go;
      runway.classList.toggle('is-started', started);
    }
  });
})();

/* ── work index: one drawer open at a time ────────────────────────────── */
(() => {
  const rows = Array.from(document.querySelectorAll('.row'));
  if (!rows.length) return;

  const open = (row) => {
    for (const r of rows) {
      const on = r === row;
      r.classList.toggle('is-active', on);
      r.querySelector('.row__hit')?.setAttribute('aria-expanded', String(on));
    }
  };

  for (const row of rows) {
    const hit = row.querySelector('.row__hit');
    hit?.addEventListener('click', () => {
      // Clicking the open row closes nothing — an index always shows one.
      open(row);
    });
  }
})();

/* ── enquiry form ─────────────────────────────────────────────────────── */
(() => {
  const form = document.getElementById('vzForm');
  const ok = document.getElementById('vzOk');
  const err = document.getElementById('vzErr');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      err.hidden = false;
      ok.hidden = true;
      (name ? form.elements.email : form.elements.name).focus();
      return;
    }
    err.hidden = true;
    ok.hidden = false;
    ok.textContent =
      `Received, ${name}. Lene or Idris will write to ${email} within the week — ` +
      `we answer everything, including the ones we turn down. ` +
      `(This is a demonstration site, so nothing was actually sent.)`;
  });
})();
