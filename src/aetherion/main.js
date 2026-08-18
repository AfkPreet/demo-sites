import './aetherion.css';

import { boot } from '../lib/site.js';
import { Stage, THREE } from '../lib/gl.js';
import { onTick } from '../lib/ticker.js';
import { track, scroll } from '../lib/scroll.js';
import { env, hasWebGL } from '../lib/env.js';
import { countUp } from '../lib/ui.js';
import { clamp, seg, smoothstep, easeInOutCubic } from '../lib/math.js';

boot({ split: false });

const root = document.documentElement;

/* ── header ───────────────────────────────────────────────────────────── */
const hud = document.getElementById('hud');
(() => {
  if (!hud) return;
  let solid = false;
  onTick(() => {
    const want = scroll.y > 40;
    if (want !== solid) {
      solid = want;
      hud.classList.toggle('is-solid', solid);
    }
  }, 60);
})();

document.querySelectorAll('[data-count]').forEach((el) =>
  countUp(el, { to: parseFloat(el.dataset.count) })
);

/* ── manifest ─────────────────────────────────────────────────────────── */
(() => {
  const btn = document.getElementById('joinBtn');
  const ok = document.getElementById('joinOk');
  if (!btn || !ok) return;
  btn.addEventListener('click', () => {
    ok.hidden = false;
    btn.disabled = true;
    btn.querySelector('span').textContent = 'On the list';
    ok.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
})();

/* ══════════════════════════════════════════════════════════════════════
   The flight
   ══════════════════════════════════════════════════════════════════════ */
(async () => {
  const canvas = document.getElementById('space');
  const journey = document.getElementById('journey');
  if (!canvas || !journey) return;

  if (!hasWebGL()) {
    root.classList.add('no-webgl');
    canvas.remove();
    return;
  }

  const stage = new Stage(canvas, {
    alpha: true,
    antialias: env.tier !== 'low',
    dprScale: env.tier === 'high' ? 1 : 0.92,
    camera: { fov: 52, z: 30, near: 0.6, far: 2200 },
  });

  const { buildSpace, LAYOUT } = await import('./scene.js');
  const sky = buildSpace(stage);

  const scene = (name) => {
    const el = journey.querySelector(`[data-scene="${name}"]`);
    return el ? track(el, { start: 'top top', end: 'bottom top', scrub: 6 }) : { eased: 0 };
  };
  const T = {
    hero: scene('hero'),
    leave: scene('leave'),
    dark: scene('dark'),
    rings: scene('rings'),
    day: scene('daylight'),
  };

  /* Camera keyframes. The whole flight is one chain of lerps between these,
     which keeps it continuous in both scroll directions — see scroll.js on
     why `if (progress > 0)` branching is a trap with damped values. */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const POS = [
    V(-10, 3, 34),       // hero — Terra big and close, the giant a distant coin
    V(2, 3, -6),         // hero out
    V(22, 12, -76),      // close pass of Terra
    V(32, 2, -400),      // into the long dark
    V(58, 27, -690),     // above the ring plane, giant ahead
    V(72, 0, -786),      // *** crossing the plane ***
    V(86, -19, -858),    // through, below the plane
    V(104, -12, -922),   // outbound, looking back
  ];
  const LOOK = [
    V(26, 9, -76),
    V(32, 8, -86),
    V(36, 8, -98),
    V(8, 0, -740),
    V(0, 0, -820),
    V(0, 0, -820),
    V(6, 2, -820),
    V(10, 5, -816),
  ];

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  const crossing = document.getElementById('crossing');
  const crossingN = document.getElementById('crossingN');
  const crossingU = document.querySelector('.crossing__u');
  const hudPhase = document.getElementById('hudPhase');
  const hudBar = document.getElementById('hudBar');
  const hudDist = document.getElementById('hudDist');

  const PHASES = ['PRE-LAUNCH', 'ASCENT', 'CRUISE', 'RING PLANE', 'OUTBOUND'];
  let lastPhase = -1;
  let lastKm = -1;
  let lastAu = -1;
  let isDay = false;

  new IntersectionObserver(
    ([e]) => { stage.paused = !e.isIntersecting; },
    { rootMargin: '10% 0px' }
  ).observe(journey);

  stage.onFrame((dt, t) => {
    const eH = easeInOutCubic(T.hero.eased);
    const eL = easeInOutCubic(T.leave.eased);
    const eD = easeInOutCubic(T.dark.eased);
    const pR = T.rings.eased;
    const eDay = easeInOutCubic(T.day.eased);

    // ── camera ────────────────────────────────────────────────────────
    camPos.copy(POS[0]);
    camPos.lerp(POS[1], eH);
    camPos.lerp(POS[2], eL);
    camPos.lerp(POS[3], eD);
    camPos.lerp(POS[4], smoothstep(seg(pR, 0, 0.32)));
    camPos.lerp(POS[5], smoothstep(seg(pR, 0.32, 0.6)));
    camPos.lerp(POS[6], smoothstep(seg(pR, 0.6, 1)));
    camPos.lerp(POS[7], eDay);

    camLook.copy(LOOK[0]);
    camLook.lerp(LOOK[1], eH);
    camLook.lerp(LOOK[2], eL);
    camLook.lerp(LOOK[3], eD);
    camLook.lerp(LOOK[4], smoothstep(seg(pR, 0, 0.32)));
    camLook.lerp(LOOK[5], smoothstep(seg(pR, 0.32, 0.6)));
    camLook.lerp(LOOK[6], smoothstep(seg(pR, 0.6, 1)));
    camLook.lerp(LOOK[7], eDay);

    // a slow roll so the frame is never dead still
    const drift = env.reducedMotion ? 0 : t;
    stage.camera.position.copy(camPos);
    stage.camera.position.x += Math.sin(drift * 0.13) * 0.6;
    stage.camera.position.y += Math.cos(drift * 0.11) * 0.45;
    stage.camera.lookAt(camLook);
    stage.camera.rotation.z += Math.sin(drift * 0.07) * 0.012;

    // ── warp ──────────────────────────────────────────────────────────
    // a low hum through the cruise, spiking hard as the ship punches the plane
    const spike = Math.exp(-Math.pow((pR - 0.6) / 0.115, 2));
    const warp = clamp(T.dark.eased * 0.1 + spike * 0.95);
    sky.starU.uWarp.value = warp;
    sky.starU.uTravel.value = -camPos.z * 1.35;

    // stars and the sun ride with the ship — they are effectively at infinity
    sky.stars.position.copy(stage.camera.position);
    sky.sun.position.copy(stage.camera.position).addScaledVector(sky.sunDir, 900);
    sky.sun.lookAt(stage.camera.position);

    sky.update(dt, t);

    // ── night → day ───────────────────────────────────────────────────
    const day = smoothstep(seg(pR, 0.58, 0.95));
    root.style.setProperty('--day', day.toFixed(3));
    sky.starU.uFade.value = 1 - day * 0.86;
    sky.ringU.uOpacity.value = 1;
    const wantDay = day > 0.5;
    if (wantDay !== isDay) {
      isDay = wantDay;
      root.classList.toggle('is-day', isDay);
    }

    // ── readouts ──────────────────────────────────────────────────────
    if (crossing) {
      const near = clamp((pR - 0.16) / 0.22) * (1 - clamp((pR - 0.86) / 0.12));
      crossing.style.opacity = near.toFixed(3);
      // 1 world unit ≈ 1 180 km at this scale
      const km = Math.round(Math.abs(camPos.y) * 1180);
      if (km !== lastKm) {
        lastKm = km;
        crossingN.textContent = km.toLocaleString('en-US');
        if (crossingU) crossingU.textContent = camPos.y >= 0 ? 'km above' : 'km below';
      }
    }

    if (hudBar) {
      const prog = clamp((34 - camPos.z) / 956);
      hudBar.style.transform = `scaleX(${prog.toFixed(4)})`;
      const au = (prog * 5.2).toFixed(2);
      if (au !== lastAu) {
        lastAu = au;
        hudDist.textContent = `${au} AU`;
      }
      const ph = pR > 0.06 ? (day > 0.55 ? 4 : 3) : T.dark.eased > 0.06 ? 2 : T.leave.eased > 0.06 ? 1 : 0;
      if (ph !== lastPhase) {
        lastPhase = ph;
        hudPhase.textContent = PHASES[ph];
      }
    }
  });
})();
