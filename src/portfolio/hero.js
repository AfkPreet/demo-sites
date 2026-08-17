/*
 * Hero sculpture — "Obsidian".
 *
 * A faceted, noise-displaced icosahedron lit like a cut stone, wrapped by a
 * thin orbiting ring and a haze of motes. As you scroll past the opening
 * chapters the solid dissolves into the particle cloud it was made of.
 *
 * Deliberate performance choices:
 *   · the background glow is CSS, not a fullscreen shader pass — the canvas
 *     only ever shades the small part of the screen the sculpture occupies
 *   · flat normals come from screen-space derivatives, so no normal
 *     recalculation in the vertex shader
 *   · tessellation and octave count both drop with device tier
 */

import { Stage, THREE, pointer } from '../lib/gl.js';
import { onTick } from '../lib/ticker.js';
import { track, scroll } from '../lib/scroll.js';
import { env, q } from '../lib/env.js';
import { NOISE, FBM } from '../lib/glsl.js';
import { clamp, damp, seg, smoothstep, rng } from '../lib/math.js';

const VERT = /* glsl */ `
${NOISE}
${FBM}
uniform float uTime;
uniform float uAmp;
uniform float uFreq;
uniform float uOct;
varying vec3 vPos;
varying float vN;

void main() {
  vec3 p = position;
  float n = fbm(p * uFreq + vec3(0.0, uTime * 0.06, uTime * 0.11), int(uOct));
  float n2 = snoise(p * 2.3 + vec3(uTime * 0.18));
  vN = n;
  p += normal * (n * uAmp + n2 * uAmp * 0.22);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uBase;
uniform float uTime;
uniform float uOpacity;
varying vec3 vPos;
varying float vN;

void main() {
  // Flat facet normal straight from the derivative of view-space position:
  // exact, free, and immune to whatever the displacement did to the mesh.
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  vec3 v = normalize(-vPos);

  // Tight rim: the stone should read as near-black with light caught only on
  // the edges, not as a glowing ball.
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.4);

  vec3 key  = normalize(vec3(-0.5, 0.82, 0.62));
  vec3 fill = normalize(vec3(0.92, -0.3, 0.3));
  float d1 = max(dot(n, key), 0.0);
  float d2 = max(dot(n, fill), 0.0);
  float spec = pow(max(dot(reflect(-key, n), v), 0.0), 68.0);

  // Bias the hue toward violet; mint is the highlight, not the body.
  float t = pow(0.5 + 0.5 * sin(vN * 2.4 + fres * 4.4 + uTime * 0.26), 1.9);
  vec3 irid = mix(uColA, uColB, t);

  vec3 col = uBase;
  col += irid * fres * 0.95;
  col += irid * pow(d1, 2.0) * 0.055;
  col += vec3(0.5, 0.53, 0.7) * pow(d2, 3.0) * 0.03;
  col += mix(vec3(1.0), irid, 0.35) * spec * 0.55;

  gl_FragColor = vec4(col, uOpacity);
}
`;

const POINT_VERT = /* glsl */ `
attribute vec3 aDir;
attribute float aRand;
uniform float uTime;
uniform float uDissolve;
uniform float uSize;
uniform float uPix;
varying float vA;
varying float vR;

void main() {
  vec3 p = position;
  float d = uDissolve;
  p += aDir * d * (1.1 + aRand * 3.2);
  p += vec3(
    sin(uTime * 0.5 + aRand * 6.28),
    cos(uTime * 0.42 + aRand * 5.1),
    sin(uTime * 0.33 + aRand * 4.2)
  ) * 0.09 * d;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPix * (0.55 + aRand * 0.9) * (3.0 / max(-mv.z, 0.001));
  vA = smoothstep(0.0, 0.18, d) * (1.0 - smoothstep(0.62, 1.0, d));
  vR = aRand;
}
`;

const POINT_FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uColA;
uniform vec3 uColB;
varying float vA;
varying float vR;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float a = smoothstep(0.25, 0.02, d) * vA;
  vec3 col = mix(uColA, uColB, vR);
  gl_FragColor = vec4(col, a * 0.85);
}
`;

const MOTE_VERT = /* glsl */ `
attribute float aRand;
uniform float uTime;
uniform float uPix;
varying float vA;
void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.22 + aRand * 6.28) * 0.28;
  p.x += cos(uTime * 0.17 + aRand * 5.0) * 0.24;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.9 + aRand * 1.6) * uPix;
  vA = 0.18 + 0.5 * (0.5 + 0.5 * sin(uTime * 0.9 + aRand * 12.0));
}
`;

const MOTE_FRAG = /* glsl */ `
precision mediump float;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(0.82, 0.84, 0.95, vA * 0.55);
}
`;

export function initHero(canvas) {
  const heroEl = document.querySelector('.hero');
  const manifestoEl = document.querySelector('.manifesto');
  if (!canvas || !heroEl) return null;

  const stage = new Stage(canvas, {
    alpha: true,
    antialias: env.tier === 'high',
    dprScale: env.tier === 'low' ? 0.85 : 1,
    camera: { fov: 38, z: 5, near: 0.1, far: 40 },
  });

  const COL_A = new THREE.Color('#9d7cff');
  const COL_B = new THREE.Color('#79f0d2');
  const BASE = new THREE.Color('#050509');

  const group = new THREE.Group();
  stage.scene.add(group);

  /* ── the solid ─────────────────────────────────────────────────────── */
  const detail = q(3, 4, 5);
  const geo = new THREE.IcosahedronGeometry(1, detail);

  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.34 },
    uFreq: { value: 0.82 },
    uOct: { value: q(2, 3, 4) },
    uColA: { value: COL_A },
    uColB: { value: COL_B },
    uBase: { value: BASE },
    uOpacity: { value: 1 },
  };

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    extensions: { derivatives: true },
  });

  const solid = new THREE.Mesh(geo, mat);
  group.add(solid);

  /* ── the dust it turns into ────────────────────────────────────────── */
  const pDetail = q(2, 3, 4);
  const pGeo = new THREE.IcosahedronGeometry(1, pDetail);
  const pPos = pGeo.attributes.position;
  const count = pPos.count;
  const dirs = new Float32Array(count * 3);
  const rands = new Float32Array(count);
  const rand = rng(7351);
  for (let i = 0; i < count; i++) {
    const x = pPos.getX(i), y = pPos.getY(i), z = pPos.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    // outward, nudged by a stable per-point jitter so the cloud isn't a shell
    dirs[i * 3] = x / l + (rand() - 0.5) * 0.5;
    dirs[i * 3 + 1] = y / l + (rand() - 0.5) * 0.5;
    dirs[i * 3 + 2] = z / l + (rand() - 0.5) * 0.5;
    rands[i] = rand();
  }
  pGeo.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
  pGeo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
  pGeo.deleteAttribute('normal');
  pGeo.deleteAttribute('uv');

  const pUniforms = {
    uTime: { value: 0 },
    uDissolve: { value: 0 },
    uSize: { value: 2.1 },
    uPix: { value: 1 },
    uColA: { value: COL_A },
    uColB: { value: COL_B },
  };

  const dust = new THREE.Points(
    pGeo,
    new THREE.ShaderMaterial({
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      uniforms: pUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(dust);

  /* ── orbiting ring ─────────────────────────────────────────────────── */
  const ringGeo = new THREE.TorusGeometry(1.44, 0.007, 3, q(90, 150, 220));
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#b9a6ff'),
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = 1.22;
  ring.rotation.y = 0.35;
  group.add(ring);

  const ring2 = new THREE.Mesh(ringGeo, ringMat.clone());
  ring2.material.opacity = 0.2;
  ring2.material.color = new THREE.Color('#8fe8cf');
  ring2.scale.setScalar(1.14);
  ring2.rotation.x = -0.68;
  ring2.rotation.z = 0.6;
  group.add(ring2);

  /* ── ambient motes ─────────────────────────────────────────────────── */
  const moteCount = q(120, 240, 420);
  const mPos = new Float32Array(moteCount * 3);
  const mRand = new Float32Array(moteCount);
  const mr = rng(9182);
  for (let i = 0; i < moteCount; i++) {
    const r = 2.1 + mr() * 3.6;
    const th = mr() * Math.PI * 2;
    const ph = Math.acos(2 * mr() - 1);
    mPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    mPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
    mPos[i * 3 + 2] = r * Math.cos(ph) * 0.6;
    mRand[i] = mr();
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  moteGeo.setAttribute('aRand', new THREE.BufferAttribute(mRand, 1));
  const moteU = { uTime: { value: 0 }, uPix: { value: 1 } };
  const motes = new THREE.Points(
    moteGeo,
    new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      uniforms: moteU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  stage.scene.add(motes);

  /* ── scroll wiring ─────────────────────────────────────────────────── */
  const tHero = track(heroEl, { start: 'top top', end: 'bottom top', scrub: 9 });
  const tOut = manifestoEl
    ? track(manifestoEl, { start: 'top bottom', end: 'bottom center', scrub: 7 })
    : { eased: 0 };

  const ptr = pointer();
  let px = 0, py = 0;
  let tiltX = 0, tiltY = 0;
  if (env.touch) {
    addEventListener(
      'deviceorientation',
      (e) => {
        if (e.gamma == null) return;
        tiltX = clamp(e.gamma / 45, -1, 1);
        tiltY = clamp((e.beta - 50) / 45, -1, 1);
      },
      { passive: true }
    );
  }

  const place = () => {
    const vw = document.documentElement.clientWidth;
    const wide = vw >= 900;
    const midW = vw >= 620;
    // Wide: pushed right, clear of the headline column.
    // Narrow: lifted into the top third, above where the copy begins.
    group.position.x = wide ? 1.52 : 0.1;
    group.position.y = wide ? 0.14 : 1.06;
    const s = wide ? 1.08 : midW ? 0.86 : 0.7;
    group.scale.setScalar(s);
    group.userData.baseScale = s;
    group.userData.baseY = group.position.y;
    pUniforms.uPix.value = stage.renderer.getPixelRatio();
    moteU.uPix.value = stage.renderer.getPixelRatio();
  };
  place();
  stage.opts.onResize = place;

  let opacity = 1;

  stage.onFrame((dt, t) => {
    uniforms.uTime.value = t;
    pUniforms.uTime.value = t;
    moteU.uTime.value = t;

    const hp = tHero.eased;
    const op = tOut.eased;

    // dissolve ramps in over the back half of the hero exit
    const dissolve = smoothstep(seg(op, 0.02, 0.72));
    pUniforms.uDissolve.value = dissolve;
    uniforms.uOpacity.value = 1 - smoothstep(seg(dissolve, 0.02, 0.55));
    uniforms.uAmp.value = 0.2 + dissolve * 0.5;

    solid.visible = uniforms.uOpacity.value > 0.01;

    // slow constant turn + scroll-driven spin
    group.rotation.y += dt * 0.075;
    group.rotation.y += (scroll.velocity * 0.00002);
    group.rotation.x = -0.12 + hp * 0.5;
    ring.rotation.z += dt * 0.09;
    ring2.rotation.y -= dt * 0.06;
    ringMat.opacity = 0.5 * (1 - dissolve);
    ring2.material.opacity = 0.24 * (1 - dissolve);

    const base = group.userData.baseScale;
    group.scale.setScalar(base * (1 - hp * 0.14 + dissolve * 0.06));
    group.position.y = group.userData.baseY + hp * 0.55;

    // parallax: pointer on desktop, gyroscope on phones
    const targetX = env.touch ? tiltX * 0.16 : (ptr.active ? ptr.tx * 0.2 : 0);
    const targetY = env.touch ? tiltY * 0.12 : (ptr.active ? -ptr.ty * 0.14 : 0);
    px = damp(px, targetX, 3.2, dt);
    py = damp(py, targetY, 3.2, dt);
    stage.camera.position.x = px;
    stage.camera.position.y = py;
    stage.camera.lookAt(group.position.x * 0.35, group.position.y * 0.35, 0);

    motes.rotation.y += dt * 0.012;
  });

  // Layer fade lives on the global ticker, not on stage.onFrame — a paused
  // stage stops calling its frame callbacks, so the thing that decides when to
  // un-pause has to run outside of it.
  onTick((dt) => {
    const targetOpacity = 1 - smoothstep(seg(tOut.eased, 0.35, 0.95));
    opacity = damp(opacity, targetOpacity, 8, dt);
    canvas.style.opacity = opacity.toFixed(3);
    stage.paused = opacity < 0.015;
  }, 40);

  // Reduced motion: hold a single beautiful frame, no rotation, no dissolve.
  if (env.reducedMotion) {
    stage.onFrame(() => {
      group.rotation.y = 0.6;
      group.rotation.x = -0.12;
    });
  }

  return stage;
}
