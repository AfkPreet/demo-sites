/*
 * CAST — the hero object.
 *
 * A slab of plaster on a studio sweep, lit by one hard key that never moves
 * for the entire page. The name is not text laid over a 3D thing; it is
 * debossed into the thing, and it is legible because light is falling on it.
 *
 * Two draw calls. No THREE.Light objects, no shadow map, no render target, no
 * post pass, no image download:
 *
 *   1. the ground — one fullscreen quad carrying the sweep's falloff, the
 *      horizon, the grain, and the slab's cast shadow as a screen-space
 *      quad SDF whose softness grows with distance from the contact edge
 *   2. the slab — extruded geometry with an analytic three-light rig, an
 *      Oren–Nayar diffuse (plaster is rough; Lambert looks injection-moulded)
 *      and a relief derived from one height texture by screen-space
 *      derivatives, which is what removes the whole normal-map build step
 *
 * The DOM headline sits over the same ground in `mix-blend-mode: multiply`,
 * so where the cast shadow passes, the letterforms darken with the ground.
 * That is the point of the whole page: the type and the object are provably
 * in one lighting environment.
 */

import { THREE, Stage } from '../lib/gl.js';
import { onTick } from '../lib/ticker.js';
import { track, viewport } from '../lib/scroll.js';
import { env, q } from '../lib/env.js';
import { clamp, lerp, damp, smoothstep } from '../lib/math.js';
import { HASH } from '../lib/glsl.js';

/* THE LAW. World space, upper-right and well to the side, and nothing may
   move it. Lateral matters: a steep key throws its shadow almost straight
   down a backdrop, and the whole point of this hero is that the shadow
   travels sideways across the headline. Every CSS shadow on the site falls
   the same way — down and to the left — from --shadow-x / --shadow-y. */
const LIGHT = new THREE.Vector3(0.78, 0.34, 0.52).normalize();

/* The sweep is a wall behind the object, not a floor: a camera looking down
   its own axis sees a floor edge-on, and the cast shadow disappears into a
   sliver at the bottom of the frame.

   How far behind depends on the viewport, and this is the one honest way to
   keep the law. A key this lateral throws its shadow 1.5 units sideways for
   every unit of clearance; on a phone the frame is only 1.26 units wide, so a
   desktop gap of 0.9 puts the entire shadow off-screen and the hero loses the
   only thing it is about. The light does not move — the object is set nearer
   the wall, which is what a photographer does in a small room. */
const SWEEP_FAR = -0.9;
const SWEEP_NEAR = -0.26;

const STONE = new THREE.Color(0xbab5a6);
const STONE_DEEP = new THREE.Color(0xa29d8e);
const CHALK = new THREE.Color(0xf3f0e6);
const SKY_FILL = new THREE.Color(0xc4cde0);


/* ── the sweep ──────────────────────────────────────────────────────────── */

const GROUND_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.999, 1.0);
}
`;

const GROUND_FRAG = /* glsl */ `
precision mediump float;
${HASH}
uniform vec3 uStone;
uniform vec3 uDeep;
uniform vec2 uAspect;      // x: ndc→square correction
uniform vec2 uQuad[4];     // the slab's corners projected onto the sweep, in ndc
uniform vec2 uContact;     // the corner closest to the ground
uniform float uSoft;
uniform float uShade;      // how dark the shadow is right now
uniform float uHorizon;    // ndc y of the value break
varying vec2 vNdc;

/* Linear → sRGB. A ShaderMaterial gets no colour-space epilogue from three,
   so without this the canvas is several stops darker than the CSS ground it
   is supposed to continue seamlessly. */
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
             step(vec3(0.0031308), c));
}

/* Signed distance to a convex quad: negative inside, positive outside, and
   the magnitude is the true distance to the nearest edge — which is what lets
   the softness be a physical quantity rather than a tuned blur.

   The winding has to be derived rather than assumed. The quad is not the
   slab; it is the slab's four corners cast along the key onto the sweep, and
   as the slab rotates past the light that projection flips handedness. Assume
   one winding and the shadow inverts — everything *except* the shadow goes
   dark — for part of the scroll. Twice the shoelace area gives the sign for
   free. */
float quadDist(vec2 p) {
  float area = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 a = uQuad[i];
    vec2 b = uQuad[i == 3 ? 0 : i + 1];
    area += a.x * b.y - b.x * a.y;
  }
  float sgn = area > 0.0 ? -1.0 : 1.0;

  float d = -1e9;
  for (int i = 0; i < 4; i++) {
    vec2 a = uQuad[i];
    vec2 b = uQuad[i == 3 ? 0 : i + 1];
    vec2 e = b - a;
    float len = max(length(e), 1e-5);
    d = max(d, sgn * (e.x * (p.y - a.y) - e.y * (p.x - a.x)) / len);
  }
  return d;
}

void main() {
  vec2 p = vNdc * uAspect;

  /* The sweep. A studio sweep is brightest where the light hits it and
     falls off upward into the cove; the break is what turns a background
     into a place. */
  float up = smoothstep(-1.0, 1.25, vNdc.y);
  vec3 col = mix(uStone, uDeep, up * 0.42);
  col = mix(col, uStone * 1.035, smoothstep(uHorizon + 0.22, uHorizon - 0.30, vNdc.y) * 0.5);

  /* The cast shadow. The penumbra straddles the edge rather than sitting
     outside it, and it widens with distance from the contact corner — which
     is the one thing that separates a shadow from a shape. */
  float d = quadDist(p);
  float grow = 0.55 + 1.05 * clamp(length(p - uContact) / 1.5, 0.0, 1.0);
  float soft = uSoft * grow;
  float sh = 1.0 - smoothstep(-soft, soft, d);

  /* A shadow on a warm sweep is not the sweep times a number. The key is out
     of it, so what remains is sky — cooler and a little bluer. Darkening
     alone gives you grey, and grey is the tell. */
  vec3 shadowed = col * (1.0 - uShade) * vec3(0.95, 0.985, 1.075);
  col = mix(col, shadowed, sh);

  // the stone's tooth
  float g = hash21(gl_FragCoord.xy) - 0.5;
  col += g * 0.016;

  gl_FragColor = vec4(toSRGB(col), 1.0);
}
`;

/* ── the slab ───────────────────────────────────────────────────────────── */

const SLAB_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  vUv = uv;
  vLocal = position;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const SLAB_FRAG = /* glsl */ `
precision highp float;
${HASH}
uniform sampler2D uDeboss;
uniform float uRelief;
uniform vec3 uKeyDir;      // view space
uniform vec3 uKeyCol;
uniform vec3 uSkyCol;
uniform vec3 uBounceCol;
uniform vec3 uBase;
uniform float uTooth;
uniform float uOct;
uniform vec2 uFace;        // half-extents of the face, for uv reconstruction
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;

/* Linear → sRGB. A ShaderMaterial gets no colour-space epilogue from three,
   so without this the canvas is several stops darker than the CSS ground it
   is supposed to continue seamlessly. */
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
             step(vec3(0.0031308), c));
}

/* Oren–Nayar, the cheap closed form. Plaster is rough; Lambert on a rough
   dielectric always reads as injection-moulded plastic, and this is about six
   extra instructions. */
float oren(float NL, float NV, float LV, float sigma) {
  float s2 = sigma * sigma;
  float A = 1.0 - 0.5 * s2 / (s2 + 0.33);
  float B = 0.45 * s2 / (s2 + 0.09);
  float st = LV - NL * NV;
  float t = st > 0.0 ? max(NL, NV) : 1.0;
  return NL * (A + B * st / max(t, 1e-4));
}

float ggx(vec3 n, vec3 l, vec3 v, float rough) {
  vec3 h = normalize(l + v);
  float a = rough * rough;
  float nh = max(dot(n, h), 0.0);
  float d = nh * nh * (a * a - 1.0) + 1.0;
  return (a * a) / max(3.14159 * d * d, 1e-4);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);

  /* The deboss. One texture fetch and two derivatives — the relief is
     reconstructed from the height field's own slope, which is why there is
     no normal map to bake and no idle pass to run. */
  float h = texture2D(uDeboss, vUv).r;
  float hx = dFdx(h);
  float hy = dFdy(h);
  // Sign matters: positive here raises the strokes, which reads as an
  // embossed badge. Cut in is the whole idea.
  vec3 relief = normalize(vec3(hx * uRelief, hy * uRelief, 1.0));

  // the tooth of cast plaster
  vec2 tp = vLocal.xy * 190.0;
  float t1 = valueNoise(tp);
  float t2 = uOct > 1.5 ? valueNoise(tp * 2.7) * 0.5 : 0.0;
  float t3 = uOct > 2.5 ? valueNoise(tp * 6.1) * 0.25 : 0.0;
  float tooth = (t1 + t2 + t3) / (1.0 + (uOct > 1.5 ? 0.5 : 0.0) + (uOct > 2.5 ? 0.25 : 0.0));

  // Perturb only where the face points at the viewer; the extruded sides keep
  // their own normals so the chamfer stays crisp.
  float faceness = clamp(abs(n.z) * 1.4, 0.0, 1.0);
  n = normalize(n + vec3(relief.xy * faceness, 0.0)
                  + vec3((tooth - 0.5) * uTooth, (tooth - 0.5) * uTooth, 0.0));

  float NV = max(dot(n, v), 0.0);

  // key
  vec3 l = normalize(uKeyDir);
  float NL = max(dot(n, l), 0.0);
  float LV = dot(l, v);
  vec3 lit = uKeyCol * oren(NL, NV, LV, 0.5);
  lit += uKeyCol * ggx(n, l, v, 0.62) * 0.06 * step(0.001, NL);

  // sky fill from above, half-Lambert wrapped — the single thing that makes
  // the shadow side read as plaster instead of grey plastic
  vec3 sky = normalize(vec3(0.06, 1.0, 0.18));
  lit += uSkyCol * (dot(n, sky) * 0.5 + 0.5) * 0.34;

  // bounce off the sweep
  vec3 bnc = normalize(vec3(0.1, -1.0, 0.35));
  lit += uBounceCol * max(dot(n, bnc), 0.0) * 0.16;

  vec3 col = uBase * lit;

  // Cavity: the debossed strokes carry value as well as relief, so the name
  // holds at grazing angles and at a phone's pixel ratio.
  col *= mix(1.0, 0.6, h);
  col *= 0.965 + tooth * 0.07;

  gl_FragColor = vec4(toSRGB(col), 1.0);
}
`;

/* ── the deboss height field ───────────────────────────────────────────── */

/* `tight` is the phone cut. A card 280 css pixels wide cannot hold two lines
   of 8px letterpress — the relief falls below a pixel and the derivative
   turns the strokes into noise. Real print solves this the same way: the
   small format gets fewer words, set larger. */
function debossCanvas(w, h, tight) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, w, h);

  // A slope, not a cliff: without the blur the relief has vertical walls and
  // the derivative-based normal turns into an aliased outline.
  x.filter = 'blur(1.3px)';
  x.fillStyle = '#fff';
  x.textAlign = 'left';

  const left = w * 0.115;
  const nameSize = w * (tight ? 0.128 : 0.108);
  const nameTop = h * (tight ? 0.4 : 0.44);
  x.font = `800 ${nameSize}px "Bricolage Grotesque", system-ui, sans-serif`;
  x.letterSpacing = `${-nameSize * 0.02}px`;
  x.fillText('PREET', left, nameTop);
  x.fillText('KUMAR', left, nameTop + nameSize * 0.94);

  const subSize = w * (tight ? 0.05 : 0.03);
  x.font = `500 ${subSize}px "Bricolage Grotesque", system-ui, sans-serif`;
  x.letterSpacing = `${subSize * (tight ? 0.1 : 0.16)}px`;
  x.fillText('INTERACTION DESIGN', left + 2, h * 0.78);
  if (!tight) x.fillText('CREATIVE DEVELOPMENT', left + 2, h * 0.78 + subSize * 1.7);

  // a rule, cut in the same pass
  x.fillRect(left, nameTop + nameSize * 1.32, w * 0.30, Math.max(2, w * 0.0035));
  x.filter = 'none';
  return c;
}

/* ── build ──────────────────────────────────────────────────────────────── */

export function initHero(canvas) {
  const heroEl = document.querySelector('.hero');
  if (!heroEl) return;

  const stage = new Stage(canvas, {
    alpha: false,
    antialias: env.tier !== 'low',
    camera: { fov: 24, z: 6.4, near: 0.1, far: 40 },
    priority: 30,
  });
  stage.renderer.setClearColor(0xbab5a6, 1);

  /* ---- ground ---------------------------------------------------------- */
  const quadPts = [
    new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(),
  ];
  const groundU = {
    uStone: { value: STONE.clone() },
    uDeep: { value: STONE_DEEP.clone() },
    uAspect: { value: new THREE.Vector2(1, 1) },
    uQuad: { value: quadPts },
    uContact: { value: new THREE.Vector2(0, 0) },
    uSoft: { value: 0.09 },
    uShade: { value: 0.3 },
    uHorizon: { value: 0.18 },
  };
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      uniforms: groundU,
      depthTest: false,
      depthWrite: false,
    })
  );
  ground.frustumCulled = false;
  ground.renderOrder = -1;
  stage.scene.add(ground);

  /* ---- slab ------------------------------------------------------------ */
  const W = 1.62;
  const H = W / 1.5;
  const D = W / 12;

  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, -H / 2);
  shape.lineTo(W / 2, -H / 2);
  shape.lineTo(W / 2, H / 2);
  shape.lineTo(-W / 2, H / 2);
  shape.lineTo(-W / 2, -H / 2);

  // the one signature mark on the site: a hole punched off-axis, through
  // which the sweep is visible
  const hole = new THREE.Path();
  const hx = -W / 2 + W * 0.155;
  const hy = H / 2 - H * 0.185;
  const hr = W * 0.031;
  hole.absarc(hx, hy, hr, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: D,
    bevelEnabled: true,
    bevelSize: 0.01,
    bevelThickness: 0.01,
    bevelSegments: 2,
    curveSegments: q(10, 14, 18),
  });
  geo.center();
  // ExtrudeGeometry's uv generator maps the face in world units; rebuild the
  // face uvs so the deboss texture lands exactly on the 3:2 rectangle.
  {
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getY(i) + H / 2) / H);
    }
    uv.needsUpdate = true;
  }

  const TEX_W = q(640, 896, 1024);
  const slabU = {
    uDeboss: { value: null },
    uRelief: { value: 26 },
    uKeyDir: { value: new THREE.Vector3().copy(LIGHT) },
    uKeyCol: { value: CHALK.clone() },
    uSkyCol: { value: SKY_FILL.clone() },
    uBounceCol: { value: STONE_DEEP.clone() },
    uBase: { value: new THREE.Color(0xcfcabb) },
    uTooth: { value: 0.035 },
    uOct: { value: q(1, 2, 3) },
    uFace: { value: new THREE.Vector2(W / 2, H / 2) },
  };

  const slab = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      vertexShader: SLAB_VERT,
      fragmentShader: SLAB_FRAG,
      uniforms: slabU,
    })
  );
  stage.scene.add(slab);

  /* The deboss has to be drawn after the webfont has loaded or it bakes the
     fallback face into the object for the life of the page. */
  const makeDeboss = (tight) => {
    const tex = new THREE.CanvasTexture(debossCanvas(TEX_W, Math.round(TEX_W / 1.5), tight));
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = Math.min(4, stage.renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    const prev = slabU.uDeboss.value;
    slabU.uDeboss.value = tex;
    prev?.dispose();
  };
  const tight = () => viewport.w < 768;
  let tightNow = tight();
  makeDeboss(tightNow);
  document.fonts?.ready.then(() => makeDeboss(tightNow));
  // Only when the cut actually changes — a resize inside one bracket redraws
  // nothing.
  addEventListener('resize', () => {
    const t2 = tight();
    if (t2 === tightNow) return;
    tightNow = t2;
    makeDeboss(t2);
  }, { passive: true });

  /* ---- choreography ---------------------------------------------------- */
  const t = track(heroEl, { start: 'top top', end: 'bottom bottom', scrub: 8 });

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!env.touch && !env.reducedMotion) {
    addEventListener('pointermove', (e) => {
      pointer.tx = (e.clientX / innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
  }

  const corner = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const CORNERS = [
    new THREE.Vector3(-W / 2, -H / 2, D / 2),
    new THREE.Vector3(W / 2, -H / 2, D / 2),
    new THREE.Vector3(W / 2, H / 2, D / 2),
    new THREE.Vector3(-W / 2, H / 2, D / 2),
  ];

  let lastW = 0;
  stage.onFrame((dt) => {
    const p = t.eased;
    const wide = viewport.w >= 900;

    if (stage.width !== lastW) {
      lastW = stage.width;
      const a = stage.width / stage.height;
      groundU.uAspect.value.set(a >= 1 ? a : 1, a >= 1 ? 1 : 1 / a);
    }

    pointer.x = damp(pointer.x, pointer.tx, 9, dt);
    pointer.y = damp(pointer.y, pointer.ty, 9, dt);

    /* Chained lerps, never `if (p > 0)`: the progress is damped and never
       lands on zero, so a guard would latch for the rest of the session. */
    const a1 = smoothstep(clamp(p / 0.35));
    const a2 = smoothstep(clamp((p - 0.35) / 0.4));
    const a3 = smoothstep(clamp((p - 0.75) / 0.25));

    let rx = lerp(-0.105, 0.21, a1);
    rx = lerp(rx, 0.44, a2);
    let ry = lerp(0.245, 0.035, a1);
    ry = lerp(ry, -0.16, a2);
    let rz = lerp(0.0, -0.055, a2);

    if (!env.reducedMotion) {
      rx += pointer.y * 0.05;
      ry += pointer.x * 0.07;
    }
    slab.rotation.set(rx, ry, rz);

    const baseX = wide ? 1.02 : 0;
    const baseY = wide ? 0.30 : 0.62;
    let x = baseX;
    let y = baseY;
    x = lerp(x, baseX - 0.30, a2);
    y = lerp(y, baseY + 0.34, a2);
    /* The exit leaves on the side it lives on. Dragging it left across the
       headline turned the last third of the hero into a grey rectangle
       sliding over the type, back-face first. */
    x = lerp(x, baseX + 1.35, a3);
    y = lerp(y, baseY + 2.1, a3);
    /* On a phone the slab has to be an object you can see the edges of, not a
       wall. At 0.82 it was 2.1× the frame width and read as a texture. */
    const s = wide ? 1 : 0.55;
    slab.position.set(x, y, 0);
    slab.scale.setScalar(s);

    /* The shadow. Four corners cast along the light onto the sweep, projected
       to the screen — so its length and softness are always a consequence of
       the slab's actual angle rather than a decoration. */
    slab.updateMatrixWorld();
    const sweepZ = wide ? SWEEP_FAR : SWEEP_NEAR;
    let nearest = Infinity;
    for (let i = 0; i < 4; i++) {
      corner.copy(CORNERS[i]).applyMatrix4(slab.matrixWorld);
      const tHit = (corner.z - sweepZ) / LIGHT.z;
      hit.set(corner.x - LIGHT.x * tHit, corner.y - LIGHT.y * tHit, sweepZ);
      ndc.copy(hit).project(stage.camera);
      const ax = groundU.uAspect.value.x;
      const ay = groundU.uAspect.value.y;
      quadPts[i].set(ndc.x * ax, ndc.y * ay);
      if (corner.z < nearest) {
        nearest = corner.z;
        groundU.uContact.value.copy(quadPts[i]);
      }
    }
    /* Further off the wall → softer and weaker. The numbers are in
       aspect-corrected ndc, where 1.0 is half the viewport height: a penumbra
       of 0.05 is about twenty-two pixels on a laptop. Anything looser than
       that stops being a hard key and becomes a smudge, and a smudge is
       exactly the thing this page is arguing against. */
    const lift = clamp((slab.position.z - sweepZ) / 2.6);
    groundU.uSoft.value = 0.011 + lift * 0.05;
    groundU.uShade.value = (0.4 - lift * 0.07) * (1 - a3 * 0.9);
    groundU.uHorizon.value = 0.2 - a2 * 0.5;

    // the key never moves in world space; it is only re-expressed in view space
    slabU.uKeyDir.value.copy(LIGHT).transformDirection(stage.camera.matrixWorldInverse);
  });

  // Reduced motion: one composed frame, and the loop never runs again.
  if (env.reducedMotion) {
    onTick(() => {}, 99);
  }

  return stage;
}
