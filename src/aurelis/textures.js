/*
 * Everything Aurelis is made of, drawn in a <canvas> at runtime.
 *
 *  · guilloché()  — the hand-turned wave pattern on the dial, plus its printed
 *                   minute track and signature
 *  · studioEnv()  — a soft-box lighting environment so the gold reflects
 *                   something instead of being flat-shaded paint
 */

import { TAU, rng } from '../lib/math.js';

const cv = (w, h = w) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/* ------------------------------------------------------------------ *
 * Dial
 * ------------------------------------------------------------------ */
export function guilloche(size = 1024) {
  const c = cv(size);
  const x = c.getContext('2d');
  const S = size;
  const R = S * 0.5;

  // Midnight base with the light coming from upper-left, as on a real dial
  // photographed under a loupe.
  const g = x.createRadialGradient(S * 0.38, S * 0.32, S * 0.01, R, R, S * 0.66);
  g.addColorStop(0, '#28527f');
  g.addColorStop(0.4, '#16324f');
  g.addColorStop(0.76, '#0b1c33');
  g.addColorStop(1, '#06101f');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);

  x.save();
  x.translate(R, R);
  // A cylinder's top cap maps u from the dial's z axis and v from its x axis —
  // a quarter turn. Rotating the drawing by the same quarter turn up front is
  // more predictable than fighting three's UV matrix, and the guilloché itself
  // is rotationally symmetric so only the printing notices.
  x.rotate(-Math.PI / 2);

  // Two interfering families of wavy concentric rings — that interference is
  // what makes guilloché read as guilloché rather than as stripes.
  const ring = (radius, petals, amp, phase, alpha, width) => {
    x.beginPath();
    const steps = Math.max(160, Math.round(radius * 1.6));
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * TAU;
      const rr = radius + Math.sin(t * petals + phase) * amp;
      const px = Math.cos(t) * rr;
      const py = Math.sin(t) * rr;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath();
    x.strokeStyle = `rgba(196, 222, 255, ${alpha})`;
    x.lineWidth = width;
    x.stroke();
  };

  const outer = R * 0.9;
  for (let i = 0; i < 150; i++) {
    const t = i / 149;
    const r = R * 0.05 + t * (outer - R * 0.05);
    ring(r, 72, S * 0.0032, i * 0.42, 0.1 + 0.09 * (1 - t), 1);
  }
  for (let i = 0; i < 96; i++) {
    const t = i / 95;
    const r = R * 0.07 + t * (outer - R * 0.07);
    ring(r, 44, S * 0.0046, -i * 0.31 + 1.1, 0.062, 1);
  }

  // Radial sunburst on the outer flange
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * TAU;
    x.beginPath();
    x.moveTo(Math.cos(a) * outer, Math.sin(a) * outer);
    x.lineTo(Math.cos(a) * R * 0.985, Math.sin(a) * R * 0.985);
    x.strokeStyle = `rgba(180,210,250,${i % 2 ? 0.05 : 0.02})`;
    x.lineWidth = 1.4;
    x.stroke();
  }
  x.globalCompositeOperation = 'source-over';

  // Minute track
  x.strokeStyle = 'rgba(226, 200, 138, .62)';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU - Math.PI / 2;
    const long = i % 5 === 0;
    const r1 = R * 0.925;
    const r2 = r1 - (long ? S * 0.028 : S * 0.014);
    x.beginPath();
    x.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    x.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    x.lineWidth = long ? S * 0.006 : S * 0.0025;
    x.stroke();
  }

  // Signature. Small, high, and understated — the way a real dial is printed.
  x.fillStyle = 'rgba(232, 210, 156, .92)';
  x.textAlign = 'center';
  x.font = `600 ${S * 0.052}px "Cormorant Garamond", Georgia, serif`;
  x.letterSpacing = `${S * 0.012}px`;
  x.fillText('AURELIS', 0, -S * 0.2);
  x.font = `400 ${S * 0.022}px Jost, system-ui, sans-serif`;
  x.letterSpacing = `${S * 0.006}px`;
  x.fillStyle = 'rgba(232, 210, 156, .62)';
  x.fillText('GENÈVE', 0, -S * 0.16);
  x.fillText('AUTOMATIQUE', 0, S * 0.372);

  x.restore();

  // Vignette so the dial edge falls away under the bezel
  const v = x.createRadialGradient(R, R, S * 0.26, R, R, S * 0.5);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,.5)');
  x.fillStyle = v;
  x.fillRect(0, 0, S, S);

  return c;
}

/* ------------------------------------------------------------------ *
 * Moon-phase subdial
 * ------------------------------------------------------------------ */
export function moonDisc(size = 512) {
  const c = cv(size, size / 2);
  const x = c.getContext('2d');
  const W = size, H = size / 2;

  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#16294a');
  g.addColorStop(0.55, '#0b1730');
  g.addColorStop(1, '#050a16');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  /* Pierced stars. Only a thin arc of this disc is ever visible through the
     aperture at six o'clock, and the two moons take most of it, so the stars
     have to be few and large — ninety sub-pixel specks simply averaged away
     to nothing on the way through the texture filter. */
  const r = rng(88);
  for (let i = 0; i < 34; i++) {
    const sx = r() * W;
    const sy = r() * H;
    const rad = H * (0.012 + r() * 0.022);
    const a = 0.5 + r() * 0.5;
    const g2 = x.createRadialGradient(sx, sy, 0, sx, sy, rad * 3.2);
    g2.addColorStop(0, `rgba(255,248,222,${a})`);
    g2.addColorStop(0.35, `rgba(226,214,180,${a * 0.35})`);
    g2.addColorStop(1, 'rgba(226,214,180,0)');
    x.fillStyle = g2;
    x.beginPath();
    x.arc(sx, sy, rad * 3.2, 0, TAU);
    x.fill();
    x.fillStyle = `rgba(255,251,236,${Math.min(1, a + 0.25)})`;
    x.beginPath();
    x.arc(sx, sy, rad, 0, TAU);
    x.fill();
  }
  x.globalAlpha = 1;

  // Two moons, half a rotation apart, as on a real moon-phase disc.
  for (const cx of [W * 0.25, W * 0.75]) {
    const mg = x.createRadialGradient(cx - H * 0.08, H * 0.42, H * 0.02, cx, H * 0.5, H * 0.3);
    mg.addColorStop(0, '#fdf6e2');
    mg.addColorStop(0.6, '#e6d7ae');
    mg.addColorStop(1, '#b7a377');
    x.fillStyle = mg;
    x.beginPath();
    x.arc(cx, H * 0.5, H * 0.3, 0, TAU);
    x.fill();
    x.fillStyle = 'rgba(120,105,74,.35)';
    for (let i = 0; i < 6; i++) {
      x.beginPath();
      x.arc(cx + (r() - 0.5) * H * 0.4, H * 0.5 + (r() - 0.5) * H * 0.4, H * 0.03 + r() * H * 0.04, 0, TAU);
      x.fill();
    }
  }
  return c;
}

/* ------------------------------------------------------------------ *
 * Environment — a photographer's light tent, in 256×128 equirect.
 * Without something to reflect, polished gold renders as flat paint.
 * ------------------------------------------------------------------ */
export function studioEnv(w = 512) {
  const h = w / 2;
  const c = cv(w, h);
  const x = c.getContext('2d');

  /* The ambient floor.
     Two hundred movement parts tumbling through the explosion turn away from
     the softboxes at every possible angle, and against a near-black tent they
     simply vanished. Lifting the floor here rather than adding a third
     analytic light costs nothing per fragment — the image-based lookup is
     already happening — and it lifts the darkest face of every part off pure
     black without touching the crisp reflections that make the case read as
     gold. */
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#5c5c68');
  g.addColorStop(0.42, '#31313a');
  g.addColorStop(0.58, '#22222a');
  g.addColorStop(1, '#191920');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);

  const softbox = (cx, cy, rw, rh, str, warm) => {
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rw, rh));
    rg.addColorStop(0, warm ? `rgba(255,238,206,${str})` : `rgba(226,236,255,${str})`);
    rg.addColorStop(0.5, warm ? `rgba(255,232,190,${str * 0.35})` : `rgba(200,215,245,${str * 0.35})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.save();
    x.translate(cx, cy);
    x.scale(rw / Math.max(rw, rh), rh / Math.max(rw, rh));
    x.translate(-cx, -cy);
    x.fillStyle = rg;
    x.fillRect(cx - rw * 2, cy - rh * 2, rw * 4, rh * 4);
    x.restore();
  };

  // key, rim, and a warm bounce — the classic three-light watch set-up
  softbox(w * 0.24, h * 0.2, w * 0.2, h * 0.34, 1, false);
  softbox(w * 0.72, h * 0.3, w * 0.13, h * 0.26, 0.7, true);
  softbox(w * 0.5, h * 0.02, w * 0.4, h * 0.16, 0.55, false);
  softbox(w * 0.9, h * 0.62, w * 0.1, h * 0.2, 0.35, true);

  // a couple of hard strip lights for the crisp streaks on the bezel
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.fillRect(w * 0.06, h * 0.06, w * 0.02, h * 0.3);
  x.fillStyle = 'rgba(255,246,224,.34)';
  x.fillRect(w * 0.62, h * 0.1, w * 0.012, h * 0.22);

  return c;
}
