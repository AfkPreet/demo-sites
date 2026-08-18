/*
 * AETHERION — the deep field.
 *
 * Everything here is procedural GLSL rather than textures: the planets are
 * 3D fbm evaluated on the sphere (no equirect seams, no generation hitch at
 * load), the rings are a radius-driven band function, and the stars are line
 * segments so they can stretch into warp streaks without a post pass.
 *
 * The camera flies a keyframed path down -Z and, during the ring chapter,
 * descends through the ring plane — which is the whole point of the site.
 */

import { THREE } from '../lib/gl.js';
import { NOISE, FBM } from '../lib/glsl.js';
import { rng, TAU } from '../lib/math.js';
import { q } from '../lib/env.js';

/* ------------------------------------------------------------------ *
 * Stars — LineSegments so they can become streaks
 * ------------------------------------------------------------------ */

const STAR_VERT = /* glsl */ `
attribute float aSide;
attribute float aRand;
uniform float uTravel;
uniform float uSpan;
uniform float uWarp;
varying float vA;
varying float vR;

void main() {
  vec3 p = position;
  // Wrap the field around the camera so it never runs out, and slide it past
  // as the ship travels.
  float z = mod(p.z + uTravel, uSpan) - uSpan * 0.5;
  p.z = z;
  // The trailing vertex is pushed backwards along the direction of travel;
  // at rest the segment is short enough to read as a dot.
  p.z -= aSide * (0.06 + uWarp * (2.0 + aRand * 26.0));

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float depth = clamp(1.0 - (-mv.z) / (uSpan * 0.55), 0.0, 1.0);
  vA = (0.25 + aRand * 0.75) * depth;
  vR = aRand;
}
`;

const STAR_FRAG = /* glsl */ `
// No precision override here: uWarp is also declared in the vertex stage,
// where the default is highp, and a mismatch is a link error.
uniform float uFade;
uniform float uWarp;
varying float vA;
varying float vR;
void main() {
  vec3 cool = vec3(0.72, 0.82, 1.0);
  vec3 warm = vec3(1.0, 0.88, 0.72);
  vec3 col = mix(cool, warm, smoothstep(0.72, 1.0, vR));
  gl_FragColor = vec4(col, vA * uFade * (0.55 + uWarp * 0.9));
}
`;

function makeStars(count, span) {
  const pos = new Float32Array(count * 2 * 3);
  const side = new Float32Array(count * 2);
  const rand = new Float32Array(count * 2);
  const r = rng(2031);

  for (let i = 0; i < count; i++) {
    // Distribute in a hollow cylinder around the flight path so nothing
    // materialises in the camera's lap.
    const a = r() * TAU;
    const rad = 12 + Math.pow(r(), 0.55) * 240;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad * 0.7;
    const z = r() * span;
    const rr = r();
    for (let s = 0; s < 2; s++) {
      const o = (i * 2 + s) * 3;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      side[i * 2 + s] = s;
      rand[i * 2 + s] = rr;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  return g;
}

/* ------------------------------------------------------------------ *
 * Planets
 * ------------------------------------------------------------------ */

const PLANET_VERT = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vPos = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const TERRA_FRAG = /* glsl */ `
precision highp float;
${NOISE}
${FBM}
uniform vec3 uLight;
uniform float uTime;
uniform float uOct;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec3 p = normalize(vPos);
  float h = fbm(p * 2.1, int(uOct));
  float h2 = fbm(p * 5.4 + 11.0, int(uOct) - 1) * 0.4;
  float land = h + h2;

  vec3 deep    = vec3(0.012, 0.055, 0.165);
  vec3 shallow = vec3(0.045, 0.20, 0.40);
  vec3 shore   = vec3(0.10, 0.28, 0.20);
  vec3 grass   = vec3(0.10, 0.26, 0.13);
  vec3 rock    = vec3(0.34, 0.29, 0.20);

  vec3 col = mix(deep, shallow, smoothstep(-0.35, 0.02, land));
  col = mix(col, shore, smoothstep(0.015, 0.055, land));
  col = mix(col, grass, smoothstep(0.05, 0.16, land));
  col = mix(col, rock, smoothstep(0.24, 0.44, land));

  // ice at the poles, thicker where the terrain is high
  float ice = smoothstep(0.66, 0.92, abs(p.y)) + smoothstep(0.5, 0.9, land) * 0.25;
  col = mix(col, vec3(0.86, 0.90, 0.95), clamp(ice, 0.0, 1.0));

  // weather
  float cl = fbm(p * 3.0 + vec3(uTime * 0.012, 0.0, uTime * 0.006), int(uOct) - 1);
  col = mix(col, vec3(0.95, 0.96, 1.0), smoothstep(0.16, 0.55, cl) * 0.6);

  vec3 n = normalize(vNormal);
  float d = dot(n, uLight);
  float lit = smoothstep(-0.22, 0.35, d);
  // faint night side so the terminator does not turn into a hard edge
  col *= 0.035 + lit * 1.25;

  float fres = pow(1.0 - max(dot(n, vView), 0.0), 3.0);
  col += vec3(0.22, 0.46, 1.0) * fres * (0.35 + lit * 1.1);

  gl_FragColor = vec4(col, 1.0);
}
`;

const GIANT_FRAG = /* glsl */ `
precision highp float;
${NOISE}
${FBM}
uniform vec3 uLight;
uniform float uTime;
uniform float uOct;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec3 p = normalize(vPos);
  // Bands are latitude with turbulence dragged along the equator — the shear
  // is what makes it read as a gas giant rather than a striped ball.
  float turb = fbm(vec3(p.x * 1.4, p.y * 4.0, p.z * 1.4) + vec3(uTime * 0.01, 0.0, 0.0), int(uOct));
  float lat = p.y * 6.5 + turb * 1.35;
  float band = sin(lat) * 0.5 + 0.5;
  float fine = sin(lat * 3.4 + turb * 2.0) * 0.5 + 0.5;

  vec3 cream = vec3(0.94, 0.82, 0.62);
  vec3 amber = vec3(0.80, 0.50, 0.26);
  vec3 rust  = vec3(0.46, 0.24, 0.17);
  vec3 pale  = vec3(0.98, 0.92, 0.80);

  vec3 col = mix(rust, amber, band);
  col = mix(col, cream, smoothstep(0.45, 0.95, band));
  col = mix(col, pale, fine * 0.18);

  // the storm
  vec2 sp = vec2(atan(p.z, p.x), asin(clamp(p.y, -1.0, 1.0)));
  float storm = 1.0 - smoothstep(0.0, 0.46, length((sp - vec2(1.1, -0.42)) * vec2(0.55, 1.7)));
  col = mix(col, vec3(0.62, 0.24, 0.16), storm * 0.85);

  vec3 n = normalize(vNormal);
  float lit = smoothstep(-0.2, 0.4, dot(n, uLight));
  col *= 0.05 + lit * 1.2;

  float fres = pow(1.0 - max(dot(n, vView), 0.0), 2.6);
  col += vec3(0.95, 0.72, 0.45) * fres * (0.16 + lit * 0.7);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ *
 * Rings
 * ------------------------------------------------------------------ */

const RING_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vView;
void main() {
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const RING_FRAG = /* glsl */ `
precision highp float;
${NOISE}
uniform float uInner;
uniform float uOuter;
uniform float uOpacity;
varying vec3 vLocal;
varying vec3 vView;

float bands(float t) {
  float v = 0.55;
  v += 0.30 * sin(t * 74.0);
  v += 0.18 * sin(t * 191.0 + 1.3);
  v += 0.12 * sin(t * 37.0 - 0.7);
  v += 0.10 * snoise(vec2(t * 120.0, 0.0));
  // the two big divisions
  v *= 1.0 - 0.92 * exp(-pow((t - 0.42) * 46.0, 2.0));
  v *= 1.0 - 0.70 * exp(-pow((t - 0.71) * 62.0, 2.0));
  return clamp(v, 0.0, 1.0);
}

void main() {
  float r = length(vLocal.xz);
  float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
  float a = bands(t);

  // fade both edges so the disc has no cut rim
  a *= smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.86, 1.0, t));

  vec3 icy  = vec3(0.86, 0.88, 0.94);
  vec3 warm = vec3(0.82, 0.68, 0.50);
  vec3 col = mix(warm, icy, smoothstep(0.25, 0.8, t));

  gl_FragColor = vec4(col, a * uOpacity * 0.9);
}
`;

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

export const LAYOUT = {
  terra: new THREE.Vector3(36, 8, -96),
  terraR: 22,
  giant: new THREE.Vector3(0, 0, -820),
  giantR: 34,
  ringInner: 48,
  ringOuter: 96,
};

export function buildSpace(stage) {
  const detail = q(0, 1, 2);
  const seg = (a, b, c) => (detail === 0 ? a : detail === 1 ? b : c);
  const SPAN = 900;

  const root = new THREE.Group();
  stage.scene.add(root);

  const sunDir = new THREE.Vector3(0.55, 0.42, 0.72).normalize();

  /* ---- stars ------------------------------------------------------ */
  const starU = {
    uTravel: { value: 0 },
    uSpan: { value: SPAN },
    uWarp: { value: 0 },
    uFade: { value: 1 },
  };
  const stars = new THREE.LineSegments(
    makeStars(seg(1400, 2600, 4200), SPAN),
    new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: starU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  stars.frustumCulled = false;
  stage.scene.add(stars); // follows the camera, so not in `root`

  /* ---- planets ---------------------------------------------------- */
  const terraU = {
    uLight: { value: sunDir },
    uTime: { value: 0 },
    uOct: { value: seg(3, 4, 5) },
  };
  const terra = new THREE.Mesh(
    new THREE.SphereGeometry(LAYOUT.terraR, seg(28, 44, 64), seg(18, 30, 44)),
    new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: TERRA_FRAG, uniforms: terraU })
  );
  terra.position.copy(LAYOUT.terra);
  terra.rotation.z = 0.32;
  root.add(terra);

  const giantU = {
    uLight: { value: sunDir },
    uTime: { value: 0 },
    uOct: { value: seg(3, 4, 5) },
  };
  const giant = new THREE.Mesh(
    new THREE.SphereGeometry(LAYOUT.giantR, seg(32, 48, 72), seg(22, 34, 48)),
    new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: GIANT_FRAG, uniforms: giantU })
  );
  giant.position.copy(LAYOUT.giant);
  giant.rotation.z = -0.16;
  root.add(giant);

  /* ---- ring system ------------------------------------------------- */
  const ringU = {
    uInner: { value: LAYOUT.ringInner },
    uOuter: { value: LAYOUT.ringOuter },
    uOpacity: { value: 1 },
  };
  const ringGeo = new THREE.RingGeometry(LAYOUT.ringInner, LAYOUT.ringOuter, seg(96, 160, 240), 1);
  ringGeo.rotateX(-Math.PI / 2); // lie in the XZ plane, normal +Y
  const rings = new THREE.Mesh(
    ringGeo,
    new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: ringU,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  rings.position.copy(LAYOUT.giant);
  rings.rotation.z = -0.16;
  root.add(rings);

  /* ---- ring debris — only near the crossing ------------------------ */
  const rockCount = seg(300, 700, 1200);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.ShaderMaterial({
    uniforms: { uLight: { value: sunDir } },
    vertexShader: `
      varying vec3 vN;
      void main() {
        vN = normalize((instanceMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      precision mediump float;
      uniform vec3 uLight;
      varying vec3 vN;
      void main() {
        float d = max(dot(normalize(vN), uLight), 0.0);
        vec3 col = mix(vec3(0.20, 0.23, 0.30), vec3(0.93, 0.95, 1.0), d);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocks.frustumCulled = false;
  {
    const r = rng(77);
    const m = new THREE.Matrix4();
    const qt = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < rockCount; i++) {
      const a = r() * TAU;
      const rad = LAYOUT.ringInner + r() * (LAYOUT.ringOuter - LAYOUT.ringInner);
      p.set(Math.cos(a) * rad, (r() - 0.5) * 1.6, Math.sin(a) * rad).add(LAYOUT.giant);
      e.set(r() * TAU, r() * TAU, r() * TAU);
      qt.setFromEuler(e);
      const sc = 0.14 + Math.pow(r(), 2.4) * 1.5;
      s.set(sc, sc * (0.6 + r() * 0.7), sc);
      m.compose(p, qt, s);
      rocks.setMatrixAt(i, m);
    }
    rocks.instanceMatrix.needsUpdate = true;
  }
  rocks.rotation.z = -0.16;
  root.add(rocks);

  /* ---- the sun ----------------------------------------------------- */
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec2 vUv;
        uniform float uOpacity;
        void main(){
          float d = length(vUv - 0.5) * 2.0;
          float core = smoothstep(0.10, 0.0, d);
          float halo = smoothstep(1.0, 0.0, d);
          halo = pow(halo, 3.4);
          vec3 col = mix(vec3(1.0, 0.82, 0.55), vec3(1.0), core);
          gl_FragColor = vec4(col, (core + halo * 0.5) * uOpacity);
        }`,
      uniforms: { uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
  );
  sun.position.copy(sunDir).multiplyScalar(620).add(new THREE.Vector3(0, 0, -300));
  sun.renderOrder = -1;
  root.add(sun);

  return {
    root,
    stars,
    starU,
    terra,
    terraU,
    giant,
    giantU,
    rings,
    ringU,
    rocks,
    sun,
    sunDir,
    LAYOUT,
    update(dt, t) {
      terraU.uTime.value = t;
      giantU.uTime.value = t;
      terra.rotation.y += dt * 0.012;
      giant.rotation.y += dt * 0.006;
      rocks.rotation.y += dt * 0.004;
      rings.rotation.y += dt * 0.004;
    },
  };
}
