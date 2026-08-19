import './cendre.css';

import { boot } from '../lib/site.js';
import { Stage } from '../lib/gl.js';
import { onTick } from '../lib/ticker.js';
import { track, scroll, viewport } from '../lib/scroll.js';
import { env, hasWebGL, q } from '../lib/env.js';
import { countUp } from '../lib/ui.js';
import { clamp, rng, TAU, damp } from '../lib/math.js';

boot({ split: false });

/* ── header ───────────────────────────────────────────────────────────── */
(() => {
  const top = document.getElementById('top');
  if (!top) return;
  let solid = false;
  onTick(() => {
    const want = scroll.y > 40;
    if (want !== solid) {
      solid = want;
      top.classList.toggle('is-solid', solid);
    }
  }, 60);
})();

document.querySelectorAll('[data-count]').forEach((el) =>
  countUp(el, { to: parseFloat(el.dataset.count) })
);

/* ── the printed menu ─────────────────────────────────────────────────── */
(() => {
  const list = document.getElementById('menuList');
  if (!list) return;
  const MENU = [
    ['I', 'Pain de cendre', 'Sourdough baked in the ash, aged beef fat'],
    ['II', 'Céleri', 'Ash-baked celeriac, hazelnut, four-year vinegar'],
    ['III', 'Langoustine', 'Over embers, fennel, burnt lemon'],
    ['IV', 'Oignon', 'Onion cooked twelve hours in its own skin'],
    ['V', 'Turbot', 'On the bone, seaweed butter, green almond'],
    ['VI', 'Cèpes', 'Grilled, raw, and as a broth, in that order'],
    ['VII', 'Pigeon', 'Cherry, smoked marrow, elderberry'],
    ['VIII', 'Chou', 'Hispi cabbage, three-year miso, bone fat'],
    ['IX', 'Fromage', 'One cheese. Whichever one is ready.'],
    ['X', 'Sorbet', 'Woodruff, buttermilk, cold ash'],
    ['XI', 'Miel brûlé', 'Burnt honey, sheep’s milk, pine'],
    ['XII', 'Café', 'And whatever is left of the fire'],
  ];
  const frag = document.createDocumentFragment();
  for (const [num, name, desc] of MENU) {
    const li = document.createElement('li');
    li.setAttribute('data-rv', 'up');
    li.innerHTML =
      `<span class="menu__num">${num}</span>` +
      `<span class="menu__name">${name}</span>` +
      `<span class="menu__desc">${desc}</span>`;
    frag.appendChild(li);
  }
  list.appendChild(frag);
})();

/* ── hero embers, 2D and cheap ────────────────────────────────────────── */
(() => {
  const canvas = document.getElementById('heroEmbers');
  if (!canvas || env.reducedMotion) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const COUNT = q(46, 80, 130);
  const rand = rng(608);
  let w = 0, h = 0, dpr = 1;
  const p = [];

  /* Embers come off a fire, and the fire is in one place. Seeded across the
     full width they read as dust in a beam; seeded in a narrow band over the
     hearth and allowed to spread as they climb, they read as a plume — which
     is the whole difference between atmosphere and grain. The hearth's x
     matches the warm pool painted underneath in CSS. */
  const HEARTH_X = 0.26;

  const seed = (i, initial) => ({
    x: HEARTH_X + (rand() - 0.5) * 0.2,
    y: initial ? rand() : 1 + rand() * 0.15,
    // one ember in seven is a spark: bigger, brighter, and gone sooner
    r: rand() < 0.14 ? 2.6 + rand() * 2.4 : 0.6 + rand() * 1.6,
    v: 0.02 + rand() * 0.055,
    d: rand() * TAU,
    s: 0.3 + rand() * 1.1,
    a: 0.25 + rand() * 0.6,
    drift: (rand() - 0.5) * 1.15,
  });
  for (let i = 0; i < COUNT; i++) p.push(seed(i, true));

  const size = () => {
    const r = canvas.getBoundingClientRect();
    if (r.width < 2) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  };
  let ready = size();
  addEventListener('resize', () => { ready = size(); }, { passive: true });

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  let t = 0;
  onTick((dt) => {
    if (!ready) { ready = size(); return; }
    if (!visible) return;
    t += dt;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < p.length; i++) {
      const e = p[i];
      e.y -= e.v * dt;
      if (e.y < -0.06) Object.assign(e, seed(i, false));
      // the plume widens with height, and the flutter widens with it
      const rise = 1 - e.y;
      const x = (e.x + e.drift * rise * rise * 0.62
                 + Math.sin(t * e.s + e.d) * 0.026 * (0.35 + rise)) * w;
      const y = e.y * h;
      // brightest just off the fire, gone by the top of the frame
      const fade = clamp(e.y * 1.9) * clamp((1.02 - e.y) * 4) * e.a;
      const g = ctx.createRadialGradient(x, y, 0, x, y, e.r * 5);
      g.addColorStop(0, `rgba(255,180,110,${fade})`);
      g.addColorStop(0.4, `rgba(226,112,58,${fade * 0.5})`);
      g.addColorStop(1, 'rgba(226,112,58,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, e.r * 5, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, 35);
})();

/* ── booking ──────────────────────────────────────────────────────────── */
(() => {
  const form = document.getElementById('bookForm');
  const ok = document.getElementById('bookOk');
  const err = document.getElementById('bookErr');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) {
      err.hidden = false;
      ok.hidden = true;
      form.elements.name.focus();
      return;
    }
    err.hidden = true;
    ok.hidden = false;
    ok.textContent =
      `Held for ${name} — ${form.elements.seats.value} couverts, ${form.elements.date.value}, ` +
      `19h30. We'll confirm by email within the day. (This is a demonstration, so nothing was actually booked.)`;
  });
})();

/* ══════════════════════════════════════════════════════════════════════
   SIGNATURE MOMENT — the pass
   Each course flies in, orbits, lands on the plate, rests while you read it,
   and lifts away as the next one begins.
   ══════════════════════════════════════════════════════════════════════ */
(async () => {
  const canvas = document.getElementById('plate');
  const pass = document.querySelector('.pass');
  const courseEls = Array.from(document.querySelectorAll('.course'));
  if (!canvas || !pass || !courseEls.length) return;

  if (!hasWebGL()) {
    document.documentElement.classList.add('no-webgl');
    canvas.remove();
    return;
  }

  const stage = new Stage(canvas, {
    alpha: true,
    antialias: env.tier !== 'low',
    dprScale: env.tier === 'high' ? 1 : 0.9,
    camera: { fov: 34, z: 5.4, near: 0.1, far: 60 },
    toneMapping: 'aces',
    exposure: 1.0,
  });

  const { buildPass } = await import('./scene.js');
  const rig = buildPass(stage);

  const tracks = courseEls.map((el) => track(el, { start: 'top bottom', end: 'bottom top', scrub: 8 }));

  new IntersectionObserver(
    ([e]) => { stage.paused = !e.isIntersecting; },
    { rootMargin: '12% 0px' }
  ).observe(pass);

  let camX = 0;

  stage.onFrame((dt, t) => {
    // The live course is whichever one is nearest the middle of the screen.
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < tracks.length; i++) {
      const d = Math.abs(tracks[i].eased - 0.5);
      if (d < best) { best = d; idx = i; }
    }
    rig.setCourse(idx, tracks[idx].eased, t);
    rig.update(dt, t);

    /* Framing.
       The camera's field of view is vertical, so a portrait phone has a much
       narrower horizontal field than a laptop — at the same distance the plate
       simply runs off both sides. Narrow screens therefore get a smaller,
       more top-down setting, and the camera aims above the plate so the copy
       has the upper half of the frame to itself. */
    const wide = viewport.w >= 900;
    camX = damp(camX, wide ? 0.72 : 0, 5, dt);
    rig.root.position.x = camX;
    rig.root.scale.setScalar(wide ? 1 : 0.7);

    const spin = env.reducedMotion ? 0.5 : t * 0.06 + scroll.smooth * 0.00022;
    const r = wide ? 8.6 : 9.6;
    stage.camera.position.set(
      Math.sin(spin) * r * 0.3 + camX,
      (wide ? 4.0 : 5.4) + Math.sin(t * 0.22) * 0.12,
      Math.cos(spin) * r
    );
    stage.camera.lookAt(camX, wide ? 0.1 : 1.05, 0);
  });
})();
