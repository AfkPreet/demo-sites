import './noise94.css';

import { boot } from '../lib/site.js';
import { onTick } from '../lib/ticker.js';
import { scroll } from '../lib/scroll.js';
import { env } from '../lib/env.js';
import { marquee } from '../lib/ui.js';
import { clamp, damp } from '../lib/math.js';

boot({ split: false });

/* ── marquees: three type rows and two tickers, all leaning into scroll ── */
document.querySelectorAll('.ticker').forEach((t, i) =>
  marquee(t, { speed: 62, direction: i ? -1 : 1, velocity: 0.09 })
);

const WALL = [
  { speed: 44, direction: 1, skew: 6 },
  { speed: 66, direction: -1, skew: 9 },
  { speed: 34, direction: 1, skew: 5 },
];
document.querySelectorAll('.wall__row').forEach((row, i) => {
  const cfg = WALL[i] ?? WALL[0];
  marquee(row, { speed: cfg.speed, direction: cfg.direction, velocity: 0.11, maxSkew: cfg.skew });
});

/* ── header hides while you read downward ─────────────────────────────── */
(() => {
  const bar = document.getElementById('bar');
  const tick = document.querySelector('.ticker');
  if (!bar) return;
  let hidden = false;
  onTick(() => {
    const want = scroll.y > 460 && scroll.direction > 0 && scroll.velocity > 70;
    const show = scroll.direction < 0 || scroll.y < 200;
    if (want && !hidden) {
      hidden = true;
      bar.classList.add('is-hidden');
      tick?.classList.add('is-hidden');
    } else if (show && hidden) {
      hidden = false;
      bar.classList.remove('is-hidden');
      tick?.classList.remove('is-hidden');
    }
  }, 60);
})();

/* ── stickers turn as the page moves ──────────────────────────────────── */
(() => {
  if (env.reducedMotion) return;
  const stickers = Array.from(document.querySelectorAll('.sticker'));
  if (!stickers.length) return;
  const base = [-8, 6, -14];
  const rate = [0.014, -0.019, 0.011];
  onTick(() => {
    if (scroll.y > 1600) return; // they live in the hero only
    for (let i = 0; i < stickers.length; i++) {
      stickers[i].style.transform = `rotate(${(base[i] + scroll.smooth * rate[i]).toFixed(2)}deg)`;
    }
  }, 40);
})();

/* ══════════════════════════════════════════════════════════════════════
   SIGNATURE MOMENT — tear the drop open
   A range input does the work: pointer, touch and keyboard for free. The
   sealed panel is thirteen clipped bands that slide apart in alternating
   directions, so it comes apart like a torn poster rather than a curtain.
   ══════════════════════════════════════════════════════════════════════ */
(() => {
  const section = document.getElementById('tear');
  const over = document.getElementById('tearOver');
  const range = document.getElementById('tearRange');
  const hint = document.getElementById('tearHint');
  if (!section || !over || !range) return;

  const N = 13;
  over.style.setProperty('--n', String(N));
  over.style.setProperty('--band', `${(100 / N).toFixed(4)}%`);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < N; i++) {
    const s = document.createElement('span');
    s.className = 'tear__slice';
    s.style.setProperty('--i', String(i));
    s.style.setProperty('--dir', i % 2 ? '1' : '-1');
    // Two levels, so the poster carries the embargo the whole page has been
    // repeating rather than one word in a box.
    s.innerHTML = '<b>SEALED</b><i>Do not open before 14 Jun · 04:00 GMT</i>';
    frag.appendChild(s);
  }
  over.appendChild(frag);
  section.classList.add('is-armed');

  let target = 0;
  let current = 0;
  let open = false;

  const setHint = (txt) => hint && (hint.lastChild.textContent = ` ${txt}`);

  // Release decides: far enough and it rips the rest of the way, otherwise it
  // snaps shut. A half-torn poster is nobody's idea of a drop.
  const commit = () => {
    if (open) return;
    if (target > 0.5) {
      target = 1;
      open = true;
      range.value = '1000';
      range.disabled = true;
      section.classList.add('is-open', 'is-tearing');
      // the headline stops lying about the state
      const word = section.querySelector('.tear__h em');
      if (word) word.textContent = 'OPEN';
      setHint('Open. Good luck at four in the morning.');
      setTimeout(() => section.classList.remove('is-tearing'), 700);
    } else {
      target = 0;
      range.value = '0';
    }
  };

  range.addEventListener('input', () => {
    if (open) return;
    target = +range.value / 1000;
  });
  range.addEventListener('change', commit);

  /* The poster itself is draggable too. It is the more natural gesture, it
     works when the rail's left end is under the portfolio pill, and
     touch-action:pan-y means a vertical swipe still scrolls the page. */
  const stage = document.getElementById('tearStage');
  if (stage) {
    let dragging = false;
    let startX = 0;
    let startVal = 0;

    stage.addEventListener('pointerdown', (e) => {
      if (open) return;
      dragging = true;
      startX = e.clientX;
      startVal = target;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-dragging');
    });

    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const reach = Math.max(180, stage.clientWidth * 0.5);
      target = clamp(startVal + (e.clientX - startX) / reach);
      range.value = String(Math.round(target * 1000));
    });

    const end = () => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('is-dragging');
      commit();
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('lostpointercapture', end);
  }

  onTick((dt) => {
    if (Math.abs(current - target) < 0.0004) return;
    current = damp(current, target, 15, dt);
    section.style.setProperty('--tear', clamp(current).toFixed(4));
  }, 30);

  // Reduced motion: no drag choreography, just show what is underneath.
  if (env.reducedMotion) {
    section.style.setProperty('--tear', '1');
    section.classList.add('is-open');
    range.disabled = true;
    const word = section.querySelector('.tear__h em');
    if (word) word.textContent = 'OPEN';
    setHint('Open.');
  }
})();

/* ── the 4am text ─────────────────────────────────────────────────────── */
(() => {
  const form = document.getElementById('alertForm');
  const input = document.getElementById('alertPhone');
  const ok = document.getElementById('alertOk');
  const err = document.getElementById('alertErr');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const digits = (input.value.match(/\d/g) ?? []).length;
    const good = digits >= 7;
    ok.hidden = !good;
    err.hidden = good;
    if (good) {
      input.value = '';
      input.blur();
    } else {
      input.focus();
    }
  });
})();
