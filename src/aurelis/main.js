import './aurelis.css';

import { boot } from '../lib/site.js';
import { Stage } from '../lib/gl.js';
import { onTick } from '../lib/ticker.js';
import { track, scroll, viewport } from '../lib/scroll.js';
import { env, hasWebGL } from '../lib/env.js';
import { countUp } from '../lib/ui.js';
import { clamp, lerp, seg, smoothstep, easeInOutCubic, damp } from '../lib/math.js';

boot({ split: false });

/* ── header ───────────────────────────────────────────────────────────── */
(() => {
  const hdr = document.getElementById('hdr');
  if (!hdr) return;
  let solid = false;
  onTick(() => {
    const want = scroll.y > 40;
    if (want !== solid) {
      solid = want;
      hdr.classList.toggle('is-solid', solid);
    }
  }, 60);
})();

/* ── figures ──────────────────────────────────────────────────────────── */
document.querySelectorAll('[data-count]').forEach((el) =>
  countUp(el, { to: parseFloat(el.dataset.count) })
);

/* ── private viewing ──────────────────────────────────────────────────── */
(() => {
  const btn = document.getElementById('viewingBtn');
  const ok = document.getElementById('viewingOk');
  if (!btn || !ok) return;
  btn.addEventListener('click', () => {
    ok.hidden = false;
    btn.disabled = true;
    btn.style.opacity = '.45';
    btn.querySelector('span').textContent = 'Requested';
    ok.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
})();

/* ── the story beats dissolve rather than scroll away ──────────────────
   A beat that simply scrolls off the top slides underneath the header, where
   it stayed legible through the blur and collided with the navigation. Each
   one now fades up as it arrives and dissolves before it reaches the bar, on
   a scroll track — measured once, so the per-frame cost is a subtraction.
   ─────────────────────────────────────────────────────────────────────── */
(() => {
  const beats = Array.from(document.querySelectorAll('.journey .beat'));
  if (!beats.length) return;

  const rig = beats.map((el) => ({
    el,
    t: track(el, { start: 'top bottom', end: 'bottom top', scrub: 0 }),
    o: -1,
    y: -999,
  }));

  /* Writes are guarded on a quantised value. Assigning style.opacity every
     frame to a number that has not visibly changed still dirties the element,
     and eight blocks of type being invalidated sixty times a second cost more
     than the whole watch render. */
  onTick(() => {
    for (const b of rig) {
      const p = b.t.progress;
      // in over 0.10–0.30, hold, out over 0.62–0.84 — the exit finishes well
      // before the beat can reach the header.
      const o = Math.round(
        smoothstep(clamp((p - 0.1) / 0.2)) * (1 - smoothstep(clamp((p - 0.62) / 0.22))) * 50
      ) / 50;
      const y = Math.round((0.5 - p) * 26);
      if (o !== b.o) { b.o = o; b.el.style.opacity = o === 1 ? '' : String(o); }
      if (y !== b.y) { b.y = y; b.el.style.transform = y ? `translate3d(0, ${y}px, 0)` : ''; }
    }
  }, 25);
})();

/* ── the journey ──────────────────────────────────────────────────────── */
(async () => {
  const canvas = document.getElementById('watch');
  const journey = document.getElementById('journey');
  if (!canvas || !journey) return;

  if (!hasWebGL()) {
    document.documentElement.classList.add('no-webgl');
    canvas.remove();
    return;
  }

  const stage = new Stage(canvas, {
    alpha: true,
    // Full PBR with an environment map is the most expensive shading on this
    // whole project, so the render target is trimmed below the display's
    // pixel ratio. The scene is dark and vignetted; nobody will see the
    // difference, and everybody would feel a dropped frame.
    antialias: env.tier === 'high',
    dprScale: env.tier === 'high' ? 1 : env.tier === 'mid' ? 0.88 : 0.8,
    camera: { fov: 34, z: 6.4, near: 0.1, far: 60 },
    toneMapping: 'aces',
    exposure: 1.16,
  });

  const { buildWatch } = await import('./watch.js');
  const rig = buildWatch(stage);
  stage.scene.add(rig.watch);

  const scene = (name) => {
    const el = journey.querySelector(`[data-scene="${name}"]`);
    return el ? track(el, { start: 'top top', end: 'bottom top', scrub: 7 }) : { eased: 0 };
  };
  const T = {
    hero: scene('hero'),
    dial: scene('dial'),
    cal: scene('calibre'),
    comp: scene('complication'),
  };

  const counter = document.getElementById('counter');
  const counterN = document.getElementById('counterN');
  let shownCount = -1;

  // Pause the whole scene once the story is behind us.
  new IntersectionObserver(
    ([e]) => { stage.paused = !e.isIntersecting; },
    { rootMargin: '10% 0px' }
  ).observe(journey);

  /* The end of the journey.
     The sticky stage un-pins when the story runs out and slides up with the
     page. At that point the watch is at its closest and fills the frame, so
     the bottom edge of the stage drew a hard horizontal line straight through
     the dial. Fading alone could not fix it — the edge is already halfway up
     the screen before a fade would be complete. So the piece withdraws first:
     the camera pulls back over the last stretch and only then does the stage
     dissolve, which reads as the film ending rather than the canvas leaving. */
  const outro = track(journey, { start: 'bottom bottom', end: 'bottom top', scrub: 6 });
  const stageEl = journey.querySelector('.journey__stage');
  if (stageEl) {
    let shown = -1;
    onTick(() => {
      const o = Math.round((1 - smoothstep(clamp((outro.eased - 0.16) / 0.34))) * 50) / 50;
      if (o === shown) return;
      shown = o;
      stageEl.style.opacity = o === 1 ? '' : String(o);
    }, 24);
  }

  let idle = 0;
  let camX = 0;
  const DEBUG = location.search.includes('debug');

  stage.onFrame((dt, t) => {
    const pH = T.hero.eased;
    const pD = T.dial.eased;
    const pC = T.cal.eased;
    const pP = T.comp.eased;

    /* ── explosion ────────────────────────────────────────────────────
       Ramps up over the first two thirds of the calibre chapter, holds
       fully apart, then reassembles before the chapter ends. */
    const ex = pC < 0.72
      ? smoothstep(seg(pC, 0.08, 0.66))
      : 1 - smoothstep(seg(pC, 0.8, 0.99));

    rig.setExplode(ex, t);
    if (ex < 0.25) rig.tickHands(dt, 1);

    /* ── camera and framing ───────────────────────────────────────────
       Chained lerps, never `if (p > 0)` branches.
       Every scene progress here is a *damped* value: once it has moved it
       approaches zero asymptotically and never actually reaches it, so a
       `> 0` guard latches on for the rest of the session and the last
       chapter's framing sticks after you scroll back up. Chaining is both
       branch-free and exactly equivalent: lerp(z, next, 0) === z. */
    const eH = easeInOutCubic(pH);
    const eD = easeInOutCubic(pD);
    const eC = easeInOutCubic(pC);
    const eP = easeInOutCubic(pP);

    const wide = viewport.w >= 900;
    let z = wide ? 9.4 : 9.9;
    z = lerp(z, 5.6, eH);
    z = lerp(z, 3.3, eD);
    z = lerp(z, 4.4, eC);
    z = lerp(z, wide ? 2.65 : 3.5, eP);   // a phone needs margin round the dial for the copy
    z += ex * (wide ? 5.2 : 9.4);
    z += easeInOutCubic(outro.eased) * 7.5;   // the withdrawal, see above

    let rx = -0.55;
    rx = lerp(rx, -0.34, eH);
    rx = lerp(rx, -0.03, eD);
    rx = lerp(rx, -0.03, eC);
    rx = lerp(rx, 0.02, eP);
    rx -= ex * 0.5;

    let ry = 0.5;
    ry = lerp(ry, 0.1, eH);
    ry = lerp(ry, -0.12, eD);
    ry = lerp(ry, 0.62, eC);
    ry = lerp(ry, 0, eP);

    // a slow drift so the piece is never completely still
    idle += dt * (env.reducedMotion ? 0 : 0.045);
    rig.watch.rotation.x = rx + Math.sin(idle * 0.7) * 0.012;
    rig.watch.rotation.y = ry + Math.sin(idle) * 0.03;
    rig.watch.rotation.z = Math.sin(idle * 0.53) * 0.01;

    /* ── framing ─────────────────────────────────────────────────────────
       Hero: wordmark on top, piece sitting low and centred.
       Chapters: copy in the right-hand column on wide screens, so the piece
       slides left — except while the calibre is in the air, which owns the
       whole frame. Chapter III lifts the piece so the moon aperture centres. */
    // Hero: wordmark occupies the top third, so the piece is framed below it.
    let wy = wide ? -1.06 : -1.36;
    wy = lerp(wy, -0.12, eH);
    wy = lerp(wy, 0, eD);
    wy = lerp(wy, 0, eC);
    wy = lerp(wy, 0.46, eP);
    rig.watch.position.y = wy;

    const targetX = wide ? -0.62 * eH * (1 - ex * 0.9) : 0;
    camX = damp(camX, targetX, 6, dt);
    rig.watch.position.x = camX;

    stage.camera.position.set(0, 0, z);
    stage.camera.lookAt(0, 0, 0);

    if (DEBUG) {
      window.__aurelis = {
        pH: +pH.toFixed(3), pD: +pD.toFixed(3), pC: +pC.toFixed(3), pP: +pP.toFixed(3),
        ex: +ex.toFixed(3), z: +z.toFixed(2), wx: +camX.toFixed(2), wy: +wy.toFixed(2),
        w: stage.width, h: stage.height, dpr: stage.renderer.getPixelRatio(),
      };
    }

    /* ── counter ─────────────────────────────────────────────────────── */
    if (counter) {
      const on = ex > 0.03;
      counter.style.opacity = on ? String(clamp(ex * 2.2)) : '0';
      const n = Math.round(easeInOutCubic(ex) * rig.parts);
      if (n !== shownCount) {
        shownCount = n;
        counterN.textContent = String(n);
      }
    }
  });

  // Reduced motion: hold the finished watch, no explosion, no drift.
  if (env.reducedMotion) {
    rig.setExplode(0, 0);
  }
})();
