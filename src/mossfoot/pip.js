/*
 * PIP — the moss sprite who follows you down the page.
 *
 * The whole character is one inline SVG and about a dozen transform writes a
 * frame; there is no WebGL here and no images, because a mascot that has to
 * survive from the hero to the footer on a four-year-old phone cannot afford a
 * render loop of its own.
 *
 * Everything Pip does is a damped scalar in [0,1] — look, alarm, cheer, sleep,
 * blink — and every scalar is blended into the same set of transforms. Nothing
 * branches on "is Pip currently cheering", so two feelings can happen at once
 * (startled *and* mid-hop) and no state can get stuck on.
 */

import { onTick } from '../lib/ticker.js';
import { scroll, viewport } from '../lib/scroll.js';
import { env } from '../lib/env.js';
import { clamp, damp, lerp, smoothstep } from '../lib/math.js';

const MOUTH = {
  smile: 'M-17 66q17 17 34 0',
  grin:  'M-27 58q27 36 54 0',
  oh:    'M-11 66a11 12 0 1 0 22 0a11 12 0 1 0 -22 0',
  soft:  'M-13 68q13 9 26 0',
};

export function createPip(el, heroEl, { onCheer } = {}) {
  const svg = el.querySelector('.pip__svg');
  if (!svg) return null;

  const hop = el.querySelector('.pip__hop');
  const body = el.querySelector('.pip__body');
  const face = el.querySelector('.pip__face');
  const eyes = el.querySelector('.pip__eyes');
  const lids = el.querySelector('.pip__lids');
  const mouth = el.querySelector('.pip__mouth');
  const leaf = el.querySelector('.pip__leaf');
  const armL = el.querySelector('.pip__arm--l');
  const armR = el.querySelector('.pip__arm--r');
  const sparkles = el.querySelector('.pip__sparkles');
  const zzz = el.querySelector('.pip__zzz');
  const alarmG = el.querySelector('.pip__alarm');
  const shadow = el.querySelector('.pip__shadow');

  /* ── where Pip stands ────────────────────────────────────────────────── */

  let heroTop = 0;
  let heroH = 1;
  const measureHero = () => {
    if (!heroEl) return;
    const r = heroEl.getBoundingClientRect();
    heroTop = r.top + window.scrollY;
    heroH = Math.max(1, r.height);
  };
  measureHero();
  addEventListener('load', measureHero, { passive: true });
  addEventListener('resize', () => setTimeout(measureHero, 140), { passive: true });
  document.fonts?.ready.then(measureHero);

  /* ── what Pip feels ──────────────────────────────────────────────────── */

  const s = {
    x: -999, y: -999, scale: 1,     // feet position, in viewport px
    lookX: 0, lookY: 0,             // −1…1, where they are looking
    alarm: 0,                       // pointer is uncomfortably close
    away: 0,                        // unit direction to shrink away from
    cheer: 0,                       // 1 at the click, decaying to 0
    sleep: 0,                       // nobody has moved for a while
    blink: 0,                       // 0 open, 1 shut
  };

  let px = viewport.w * 0.5;        // last known pointer, viewport px
  let py = viewport.h * 0.42;
  let hasPointer = false;
  let idle = 0;                     // seconds since the pointer last moved
  let blinkIn = 1.6 + Math.random() * 2.4;
  let blinkT = -1;                  // >0 while a blink is playing
  let first = true;
  let mouthNow = 'smile';
  let track = null;                 // the hero's scroll progress, handed in below

  const setMouth = (k) => {
    if (k === mouthNow) return;
    mouthNow = k;
    mouth.setAttribute('d', MOUTH[k]);
  };

  const wake = (x, y) => {
    px = x;
    py = y;
    hasPointer = true;
    idle = 0;
  };

  addEventListener('pointermove', (e) => wake(e.clientX, e.clientY), { passive: true });
  addEventListener('pointerdown', (e) => wake(e.clientX, e.clientY), { passive: true });
  addEventListener('pointerleave', () => { hasPointer = false; }, { passive: true });

  // A click anywhere on the page is a compliment.
  addEventListener('click', () => {
    s.cheer = 1;
    idle = 0;
    onCheer?.();
  }, { passive: true });

  /* ── the frame ───────────────────────────────────────────────────────── */

  onTick((dt, t) => {
    /* 1. Placement: planted on the hero's ground, then tucked into the
          bottom-right corner once the hero has gone. `e` is a damped 0→1, so
          the two poses are blended, never switched. */
    /* The blend is deliberately pushed past 1 and clamped.
       A damped progress approaches 1 without arriving, and the pose it is
       blending away from — the hero's ground line — keeps falling as you
       scroll, so a plain lerp left Pip drifting further up the screen the
       deeper you went. Saturating the blend pins the dock exactly, and the
       clamp is still a pure function of the current progress, so scrolling
       back up unwinds it. */
    const e = track ? clamp(track.eased * 1.14) : 0;
    const wide = viewport.w >= 60 * 16;

    // Standing on the front hill: a little above the very bottom of the hero,
    // so the shadow under the feet is never clipped by the fold.
    const ground = heroTop + heroH - scroll.y;
    const heroScale = wide ? 1 : Math.min(0.62, viewport.w / 640);
    const heroX = wide ? viewport.w * 0.75 : viewport.w - Math.min(98, viewport.w * 0.25);
    const heroY = Math.max(
      Math.min(ground - 46, viewport.h - (wide ? 96 : 70)),
      -viewport.h * 0.4
    );

    // Small on a phone: docked Pip floats over whatever is at the bottom of
    // the page, so they stay the size of a chat badge and no larger.
    const dockScale = wide ? 0.34 : 0.26;
    const dockX = viewport.w - (wide ? 62 : 42);
    const dockY = viewport.h - (wide ? 24 : 16);

    const tx = lerp(heroX, dockX, e);
    const ty = lerp(heroY, dockY, e);
    const ts = lerp(heroScale, dockScale, e);

    if (first) { s.x = tx; s.y = ty; s.scale = ts; }
    s.x = damp(s.x, tx, 9, dt);
    s.y = damp(s.y, ty, 9, dt);
    s.scale = damp(s.scale, ts, 9, dt);

    /* 2. Where is the pointer, relative to their eyes? */
    const eyeY = s.y - 92 * s.scale;
    const dx = px - s.x;
    const dy = py - eyeY;
    const dist = Math.hypot(dx, dy);

    const reach = 420 * (0.55 + s.scale * 0.9);
    const lookTargetX = hasPointer ? clamp(dx / reach, -1, 1) : 0;
    const lookTargetY = hasPointer ? clamp(dy / (reach * 0.8), -1, 1) : 0;
    const lam = env.reducedMotion ? 14 : 7;
    s.lookX = damp(s.lookX, lookTargetX, lam, dt);
    s.lookY = damp(s.lookY, lookTargetY, lam, dt);

    /* 3. Too close.
       Note the direction here is the *unit* vector to the pointer, not lookX.
       lookX is a soft, long-range value — at arm's length it is still only 0.2,
       and multiplying the recoil by it made the flinch invisible exactly when
       it needed to be biggest. */
    const bubble = 90 + 190 * s.scale;
    const nearT = hasPointer ? smoothstep(clamp(1 - dist / bubble)) : 0;
    s.alarm = damp(s.alarm, nearT, 9, dt);
    s.away = damp(s.away, dist > 1 ? dx / dist : 0, 8, dt);

    /* 4. Cheer decays on a fixed clock so the hop always lands. */
    if (s.cheer > 0) s.cheer = Math.max(0, s.cheer - dt / 1.05);

    /* 5. Boredom, then sleep. Scrolling counts as company. */
    idle += dt;
    if (Math.abs(scroll.velocity) > 40) idle = 0;
    const sleepy = idle > 13 && s.cheer <= 0 ? 1 : 0;
    s.sleep = damp(s.sleep, sleepy, 1.6, dt);

    /* 6. Blinking — never while startled, never while asleep. */
    if (blinkT >= 0) {
      blinkT += dt;
      const b = blinkT / 0.16;
      s.blink = b < 1 ? Math.sin(b * Math.PI) : 0;
      if (b >= 1) { blinkT = -1; s.blink = 0; }
    } else {
      blinkIn -= dt;
      if (blinkIn <= 0) {
        blinkIn = 2.2 + Math.random() * 3.4;
        if (s.alarm < 0.4 && s.sleep < 0.4) blinkT = 0;
      }
    }

    /* 7. The hop. One big bounce, one small one, then still. */
    const cp = 1 - s.cheer;                                   // 0 → 1
    const b1 = Math.sin(Math.PI * clamp(cp / 0.52));
    const b2 = Math.sin(Math.PI * clamp((cp - 0.56) / 0.34)) * 0.34;
    const jump = env.reducedMotion ? 0 : (b1 + Math.max(0, b2)) * (s.cheer > 0 ? 1 : 0);
    const crouch = clamp((0.07 - cp) / 0.07) * (s.cheer > 0 ? 1 : 0);

    /* 8. Write it all out. Every value below is a blend, not a branch. */
    const breathe = env.reducedMotion ? 0 : Math.sin(t * 1.7) * 0.016;
    const float = env.reducedMotion ? 0 : Math.sin(t * 1.7) * 2.4;

    el.style.transform =
      `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) scale(${s.scale.toFixed(3)})`;

    // Hop: squash on the crouch, stretch in the air.
    const sy = 1 + breathe - crouch * 0.2 + jump * 0.1;
    const sx = 1 - breathe + crouch * 0.18 - jump * 0.07;
    hop.setAttribute(
      'transform',
      `translate(0 ${(-jump * 54 + float).toFixed(1)}) translate(0 118) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(0 -118)`
    );

    // Lean toward what they are looking at — and throw themselves away from it
    // when startled, ducking a little as they go.
    const lean = s.lookX * 7 - s.away * s.alarm * 17;
    const shove = -s.away * s.alarm * 30;
    const duck = s.alarm * 8;
    body.setAttribute(
      'transform',
      `translate(${shove.toFixed(1)} ${duck.toFixed(1)}) rotate(${lean.toFixed(2)} 0 118)`
    );

    face.setAttribute(
      'transform',
      `translate(${(s.lookX * 11).toFixed(1)} ${(s.lookY * 7 + s.alarm * 2).toFixed(1)})`
    );

    // Eyes: pupils shift a little further than the face, widen when startled,
    // and shut for blinks and for sleep on the same channel.
    const shut = clamp(Math.max(s.blink, s.sleep));
    const eyeW = 1 + s.alarm * 0.34;
    const eyeH = (1 + s.alarm * 0.4) * (1 - shut * 0.94);
    eyes.setAttribute(
      'transform',
      `translate(${(s.lookX * 6).toFixed(1)} ${(s.lookY * 4).toFixed(1)}) ` +
      `translate(0 34) scale(${eyeW.toFixed(3)} ${Math.max(0.02, eyeH).toFixed(3)}) translate(0 -34)`
    );
    lids.setAttribute('opacity', s.sleep.toFixed(3));

    setMouth(
      s.cheer > 0.12 ? 'grin' :
      s.alarm > 0.32 ? 'oh' :
      s.sleep > 0.5 ? 'soft' : 'smile'
    );

    // The sprout: sways gently, whips when startled, bounces on the hop.
    const leafA = Math.sin(t * 1.3) * 5 + s.lookX * 8 + s.alarm * -22 - jump * 14;
    leaf.setAttribute('transform', `rotate(${leafA.toFixed(2)} 0 -70)`);

    // Arms go up for the cheer and tuck in tight when frightened.
    const up = Math.max(jump * 0.9, s.cheer * 0.45);
    armL.setAttribute('transform', `rotate(${(-up * 122 + s.alarm * 34).toFixed(1)} -84 62)`);
    armR.setAttribute('transform', `rotate(${(up * 122 - s.alarm * 34).toFixed(1)} 84 62)`);

    sparkles.setAttribute('opacity', (s.cheer * 0.95).toFixed(3));
    sparkles.setAttribute('transform', `scale(${(0.5 + cp * 0.85).toFixed(3)})`);

    zzz.setAttribute('opacity', (s.sleep * 0.85).toFixed(3));
    zzz.setAttribute('transform', `translate(0 ${(Math.sin(t * 1.1) * 5 - s.sleep * 6).toFixed(1)})`);

    alarmG.setAttribute('opacity', clamp(s.alarm * 1.5).toFixed(3));
    alarmG.setAttribute(
      'transform',
      `translate(${shove.toFixed(1)} 0) scale(${(0.55 + s.alarm * 0.62).toFixed(3)})`
    );

    // The shadow shrinks as they leave the ground.
    shadow.setAttribute('opacity', (0.22 * (1 - jump * 0.55)).toFixed(3));
    shadow.setAttribute('transform', `translate(0 0) scale(${(1 - jump * 0.16).toFixed(3)} 1)`);

    first = false;
  }, 30);

  return {
    useTrack(t) { track = t; },
    remeasure: measureHero,
  };
}
