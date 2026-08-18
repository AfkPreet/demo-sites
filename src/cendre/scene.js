/*
 * CENDRE — the pass.
 *
 * One plate, turned on a lathe from a real plate profile, sitting on charred
 * wood. Four courses live above it; each is a small set of primitives with a
 * resting place on the plate and an entry arc above it. Scrolling the menu
 * drives one course at a time through fly-in → orbit → land → rest → lift.
 *
 * The room is lit by an environment map generated in a canvas: warm and low,
 * like a hearth, with a cool sliver from above so the ceramic reads as ceramic.
 */

import { THREE } from '../lib/gl.js';
import { rng, TAU, clamp, lerp, smoothstep, easeInOutCubic, easeOutCubic, seg } from '../lib/math.js';
import { q } from '../lib/env.js';

/* ------------------------------------------------------------------ *
 * Hearth environment
 * ------------------------------------------------------------------ */
function hearthEnv(w = 384) {
  const h = w / 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');

  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2b2723');
  g.addColorStop(0.4, '#171310');
  g.addColorStop(0.62, '#241611');
  g.addColorStop(0.86, '#7a3416');
  g.addColorStop(1, '#c2591f');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);

  const glow = (cx, cy, r, col, a) => {
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, `rgba(${col},${a})`);
    rg.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = rg;
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
  };

  // the fire, low and to one side
  glow(w * 0.28, h * 0.9, w * 0.3, '255,138,60', 1);
  glow(w * 0.6, h * 0.96, w * 0.22, '255,96,28', 0.8);
  // a cold window, high and opposite
  glow(w * 0.78, h * 0.16, w * 0.16, '200,222,255', 0.55);
  // warm bounce off the pass
  glow(w * 0.1, h * 0.62, w * 0.2, '255,190,120', 0.3);

  return c;
}

/* ------------------------------------------------------------------ *
 * The menu — twelve courses, four of them plated in 3D
 * ------------------------------------------------------------------ */

const CREAM = 0xefe6d6, ASH = 0x4b4642, CHAR = 0x241f1c;

export const COURSES = [
  {
    num: 'II',
    name: 'Céleri',
    sub: 'Ash-baked celeriac, hazelnut, four-year vinegar',
    note: 'Buried in the embers at four in the afternoon and dug out at seven. The skin is charcoal. The inside is custard.',
    parts: [
      { g: 'ovoid', c: 0xd9c9a8, r: 0.5, s: [1.15, 0.72, 1.05], p: [0, 0.14, 0], rot: [0.1, 0.4, 0.06] },
      { g: 'ovoid', c: CHAR, r: 0.35, s: [0.62, 0.2, 0.58], p: [-0.36, 0.1, 0.3], rot: [0, 1.1, 0] },
      { g: 'sphere', c: 0x8a6134, r: 0.3, s: [1, 0.9, 1], p: [0.5, 0.11, 0.28] },
      { g: 'sphere', c: 0x8a6134, r: 0.3, s: [0.9, 0.85, 0.95], p: [0.66, 0.1, 0.06] },
      { g: 'sphere', c: 0x9c6f3e, r: 0.3, s: [0.8, 0.75, 0.85], p: [0.42, 0.1, -0.24] },
      { g: 'torus', c: 0xe8dcc0, r: 0.5, s: [1.5, 0.5, 1.5], p: [0, 0.075, 0], rot: [0, 0.4, 0] },
      { g: 'leaf', c: 0x5f6f45, r: 0.34, s: [1, 1, 1], p: [-0.5, 0.14, -0.34], rot: [0.2, 0.9, 0.3] },
      { g: 'leaf', c: 0x6d7c50, r: 0.28, s: [1, 1, 1], p: [0.14, 0.2, -0.5], rot: [-0.2, 2.1, -0.2] },
      { g: 'shard', c: 0x2b2522, r: 0.4, s: [1, 1, 1], p: [-0.2, 0.28, 0.44], rot: [0.4, 0.6, 0.2] },
    ],
  },
  {
    num: 'III',
    name: 'Langoustine',
    sub: 'Over embers, fennel, burnt lemon',
    note: 'Ninety seconds on the bars, split, and back on for eleven more. Anything longer and you are eating a memory of it.',
    parts: [
      { g: 'curl', c: 0xe08a72, r: 0.62, s: [1, 1, 1], p: [-0.1, 0.16, 0.04], rot: [0, 0.5, 0.2] },
      { g: 'curl', c: 0xd97c62, r: 0.5, s: [0.9, 0.9, 0.9], p: [0.38, 0.15, -0.3], rot: [0.1, 2.2, -0.15] },
      { g: 'cone', c: 0x7f8f5c, r: 0.3, s: [1, 1.6, 1], p: [-0.46, 0.2, -0.3], rot: [0.3, 0, 0.5] },
      { g: 'cone', c: 0x8fa066, r: 0.26, s: [1, 1.5, 1], p: [-0.6, 0.18, 0.06], rot: [-0.2, 0.8, -0.4] },
      { g: 'cyl', c: 0xe8c14e, r: 0.34, s: [1, 0.28, 1], p: [0.56, 0.11, 0.34], rot: [0, 0.3, 0.1] },
      { g: 'cyl', c: 0x2d2621, r: 0.3, s: [1, 0.1, 1], p: [0.56, 0.16, 0.34], rot: [0, 0.3, 0.1] },
      { g: 'torus', c: 0xd8a34a, r: 0.46, s: [1.4, 0.42, 1.4], p: [0, 0.075, 0], rot: [0, 1.2, 0] },
      { g: 'leaf', c: 0x6d7c50, r: 0.24, s: [1, 1, 1], p: [0.1, 0.24, 0.5], rot: [0.1, 1.4, 0.2] },
    ],
  },
  {
    num: 'VII',
    name: 'Pigeon',
    sub: 'Cherry, smoked marrow, elderberry',
    note: 'Hung eight days. Cooked on the bone over vine cuttings, rested longer than it cooked, carved at the pass.',
    parts: [
      { g: 'ovoid', c: 0x6e2b2a, r: 0.46, s: [1.25, 0.62, 0.85], p: [-0.1, 0.15, 0.02], rot: [0, 0.35, 0.05] },
      { g: 'ovoid', c: 0x7d3330, r: 0.4, s: [1.1, 0.5, 0.8], p: [0.34, 0.13, -0.32], rot: [0, 1.4, -0.08] },
      { g: 'sphere', c: 0x8c1533, r: 0.22, s: [1, 0.95, 1], p: [0.52, 0.1, 0.3] },
      { g: 'sphere', c: 0x7a1230, r: 0.2, s: [1, 0.95, 1], p: [0.66, 0.09, 0.08] },
      { g: 'sphere', c: 0x5f0f26, r: 0.17, s: [1, 0.95, 1], p: [-0.5, 0.09, 0.4] },
      { g: 'torus', c: 0x3a1712, r: 0.5, s: [1.45, 0.4, 1.45], p: [0, 0.075, 0], rot: [0, 0.7, 0] },
      { g: 'cyl', c: 0xe4d8bd, r: 0.2, s: [1, 0.55, 1], p: [-0.54, 0.14, -0.24], rot: [0, 0, 0.12] },
      { g: 'leaf', c: 0x4d5c3a, r: 0.26, s: [1, 1, 1], p: [-0.16, 0.24, -0.5], rot: [0.2, 1.9, 0.25] },
      { g: 'shard', c: 0x2b2522, r: 0.34, s: [1, 1, 1], p: [0.2, 0.3, 0.48], rot: [0.5, 1.2, 0.15] },
    ],
  },
  {
    num: 'XI',
    name: 'Miel brûlé',
    sub: 'Burnt honey, sheep’s milk, pine',
    note: 'The honey is taken to the exact second before it turns bitter, which is a decision, not a temperature.',
    parts: [
      { g: 'quenelle', c: CREAM, r: 0.46, s: [1, 1, 1], p: [-0.06, 0.19, 0.02], rot: [0, 0.5, 0.05] },
      { g: 'quenelle', c: 0xf3e9d6, r: 0.34, s: [0.9, 0.9, 0.9], p: [0.42, 0.16, -0.3], rot: [0, 2.1, -0.1] },
      { g: 'torus', c: 0xb87a1f, r: 0.52, s: [1.4, 0.36, 1.4], p: [0, 0.075, 0], rot: [0, 0.2, 0] },
      { g: 'torus', c: 0xd39a35, r: 0.34, s: [1.3, 0.34, 1.3], p: [0.1, 0.085, 0.2], rot: [0, 1.1, 0] },
      { g: 'cone', c: 0x46583c, r: 0.2, s: [0.7, 2.1, 0.7], p: [-0.44, 0.22, -0.32], rot: [0.5, 0, 0.6] },
      { g: 'cone', c: 0x51643f, r: 0.18, s: [0.65, 2, 0.65], p: [-0.56, 0.2, 0.1], rot: [-0.3, 0.6, -0.7] },
      { g: 'shard', c: 0xe0b45c, r: 0.3, s: [1, 1, 1], p: [0.04, 0.3, 0.28], rot: [0.85, 0.4, 0.3] },
      { g: 'sphere', c: 0x2b2522, r: 0.1, s: [1, 1, 1], p: [0.6, 0.09, 0.34] },
    ],
  },
];

/* full twelve, kept here for reference; the page renders its own copy */
const FULL_MENU = [
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
void FULL_MENU;

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

export function buildPass(stage) {
  const detail = q(0, 1, 2);
  const seg2 = (a, b, c) => (detail === 0 ? a : detail === 1 ? b : c);

  /* ---- environment + light ---------------------------------------- */
  const envTex = new THREE.CanvasTexture(hearthEnv(detail === 0 ? 256 : 384));
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(stage.renderer);
  const envRT = pmrem.fromEquirectangular(envTex);
  stage.scene.environment = envRT.texture;
  pmrem.dispose();
  envTex.dispose();

  const fire = new THREE.PointLight(0xff8a3c, 26, 22, 2);
  fire.position.set(-2.4, 1.1, 2.2);
  const key = new THREE.DirectionalLight(0xffd9b0, 1.5);
  key.position.set(1.6, 3.4, 2.2);
  stage.scene.add(fire, key);

  /* ---- geometry pool ---------------------------------------------- */
  const S = seg2;
  const GEO = {
    sphere: new THREE.SphereGeometry(1, S(10, 16, 22), S(8, 12, 16)),
    ovoid: new THREE.SphereGeometry(1, S(12, 18, 26), S(9, 13, 18)),
    quenelle: new THREE.SphereGeometry(1, S(12, 18, 26), S(9, 13, 18)),
    cone: new THREE.ConeGeometry(1, 1, S(6, 9, 12)),
    cyl: new THREE.CylinderGeometry(1, 0.96, 1, S(10, 16, 22)),
    torus: new THREE.TorusGeometry(1, 0.062, S(5, 7, 9), S(20, 32, 44)),
    leaf: new THREE.SphereGeometry(1, S(7, 10, 14), S(5, 7, 9)),
    shard: new THREE.TetrahedronGeometry(1, 0),
    curl: new THREE.TorusGeometry(1, 0.34, S(6, 9, 12), S(12, 18, 24), Math.PI * 1.25),
  };
  // shape adjustments baked into the geometry
  GEO.quenelle.scale(0.62, 0.5, 1);
  GEO.leaf.scale(0.42, 0.07, 1);
  GEO.shard.scale(1, 0.055, 1);
  GEO.torus.rotateX(Math.PI / 2);
  GEO.curl.rotateX(Math.PI / 2);

  const matCache = new Map();
  const mat = (color, rough = 0.6, metal = 0.02) => {
    const k = `${color}|${rough}|${metal}`;
    if (!matCache.has(k)) {
      matCache.set(k, new THREE.MeshStandardMaterial({
        color, roughness: rough, metalness: metal, envMapIntensity: 1.05,
      }));
    }
    return matCache.get(k);
  };

  const rootGrp = new THREE.Group();
  stage.scene.add(rootGrp);

  /* ---- the pass (charred wood) + contact shadow -------------------- */
  // The board fills most of the frame and is matte, unlit charred wood — full
  // PBR with image-based lighting buys nothing here and costs a lot of
  // fragment time, so it gets a Lambert surface and a smaller footprint.
  const board = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.2, 0.24, S(24, 36, 48)),
    new THREE.MeshLambertMaterial({ color: 0x1a1512 })
  );
  board.position.y = -0.24;
  rootGrp.add(board);

  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,.72)');
    g.addColorStop(0.55, 'rgba(0,0,0,.34)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 5.4),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -0.115;
  rootGrp.add(contact);

  /* ---- the plate, turned from a profile ---------------------------- */
  const profile = [
    [0, 0.062], [0.42, 0.05], [0.78, 0.058], [1.06, 0.098], [1.3, 0.128],
    [1.5, 0.138], [1.58, 0.142], [1.575, 0.112], [1.42, 0.1], [1.16, 0.074],
    [0.86, 0.028], [0.44, 0.008], [0, 0.004],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const plate = new THREE.Mesh(
    new THREE.LatheGeometry(profile, S(36, 56, 76)),
    mat(0xd8cec0, 0.5, 0.02)
  );
  plate.geometry.computeVertexNormals();
  rootGrp.add(plate);

  /* ---- courses ----------------------------------------------------- */
  const rand = rng(1789);
  const courses = COURSES.map((course, ci) => {
    const grp = new THREE.Group();
    grp.visible = false;
    rootGrp.add(grp);

    const parts = course.parts.map((p, i) => {
      const m = new THREE.Mesh(GEO[p.g] ?? GEO.sphere, mat(p.c, p.g === 'torus' ? 0.35 : 0.62));
      const rest = new THREE.Vector3(p.p[0], p.p[1], p.p[2]);
      const restRot = new THREE.Euler(p.rot?.[0] ?? 0, p.rot?.[1] ?? 0, p.rot?.[2] ?? 0);
      const sc = new THREE.Vector3(
        (p.s?.[0] ?? 1) * p.r, (p.s?.[1] ?? 1) * p.r, (p.s?.[2] ?? 1) * p.r
      );

      // entry: a wide slow arc above and outside the plate
      const a = (i / course.parts.length) * TAU + ci * 0.7 + rand() * 0.5;
      const orbitR = 2.1 + rand() * 0.9;
      const orbitY = 1.5 + rand() * 1.3;

      m.scale.copy(sc);
      grp.add(m);
      return {
        m, rest, restRot, sc,
        a, orbitR, orbitY,
        spin: new THREE.Vector3((rand() - 0.5) * 3, (rand() - 0.5) * 4, (rand() - 0.5) * 3),
        delay: (i / course.parts.length) * 0.34,
      };
    });

    return { grp, parts, meta: course };
  });

  /* ---- embers ------------------------------------------------------ */
  const emberCount = q(160, 320, 520);
  const ePos = new Float32Array(emberCount * 3);
  const eRand = new Float32Array(emberCount);
  const er = rng(451);
  for (let i = 0; i < emberCount; i++) {
    const a = er() * TAU;
    const r = 0.4 + er() * 5.2;
    ePos[i * 3] = Math.cos(a) * r;
    ePos[i * 3 + 1] = er() * 6 - 0.4;
    ePos[i * 3 + 2] = Math.sin(a) * r;
    eRand[i] = er();
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  eGeo.setAttribute('aRand', new THREE.BufferAttribute(eRand, 1));
  const eU = { uTime: { value: 0 }, uPix: { value: 1 }, uFlare: { value: 0 } };
  const embers = new THREE.Points(
    eGeo,
    new THREE.ShaderMaterial({
      uniforms: eU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aRand;
        uniform float uTime;
        uniform float uPix;
        uniform float uFlare;
        varying float vA;
        varying float vR;
        void main() {
          vec3 p = position;
          float life = mod(uTime * (0.16 + aRand * 0.3) + aRand * 6.4, 1.0);
          p.y = -0.4 + life * (5.2 + aRand * 2.0);
          p.x += sin(uTime * 0.6 + aRand * 20.0) * (0.22 + life * 0.5);
          p.z += cos(uTime * 0.5 + aRand * 17.0) * (0.2 + life * 0.45);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.9 + aRand * 2.4) * uPix * (1.0 + uFlare * 1.6) * (6.0 / max(-mv.z, 0.001));
          vA = (1.0 - life) * (0.25 + aRand * 0.75) * (0.5 + uFlare);
          vR = aRand;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        varying float vR;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c);
          if (d > 0.25) discard;
          float a = smoothstep(0.25, 0.0, d) * vA;
          vec3 col = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.86, 0.6), vR * 0.7);
          gl_FragColor = vec4(col, a * 0.9);
        }`,
    })
  );
  embers.frustumCulled = false;
  rootGrp.add(embers);

  /* ---- update ------------------------------------------------------ */
  const tmpV = new THREE.Vector3();
  let active = -1;

  /**
   * @param {number} index which course is on the pass
   * @param {number} f     0..1 through that course: fly in, land, rest, lift
   * @param {number} t     seconds
   */
  function setCourse(index, f, t) {
    if (index !== active) {
      courses.forEach((c, i) => (c.grp.visible = i === index));
      active = index;
    }
    const course = courses[index];
    if (!course) return;

    for (const p of course.parts) {
      // land: staggered so the plate builds up rather than snapping together
      const land = easeOutCubic(clamp((f - p.delay * 0.6) / (0.44 - p.delay * 0.25)));
      // lift: everything leaves together at the end of the course
      const lift = easeInOutCubic(seg(f, 0.78, 0.98));

      const ang = p.a + t * 0.5 * (1 - land) + land * 0.0;
      tmpV.set(Math.cos(ang) * p.orbitR, p.orbitY, Math.sin(ang) * p.orbitR);
      p.m.position.lerpVectors(tmpV, p.rest, land);

      // rise away again at the end
      p.m.position.y += lift * (2.4 + p.orbitY * 0.6);
      p.m.position.x += lift * Math.cos(p.a) * 0.9;
      p.m.position.z += lift * Math.sin(p.a) * 0.9;

      const tumble = (1 - land) + lift;
      p.m.rotation.set(
        p.restRot.x + p.spin.x * tumble,
        p.restRot.y + p.spin.y * tumble + (1 - land) * t * 0.8,
        p.restRot.z + p.spin.z * tumble
      );

      const pop = 0.6 + 0.4 * land;
      const gone = 1 - lift;
      p.m.scale.set(p.sc.x * pop * gone, p.sc.y * pop * gone, p.sc.z * pop * gone);
      p.m.visible = gone > 0.02;
    }

    // the fire answers when a dish lands
    eU.uFlare.value = Math.exp(-Math.pow((f - 0.42) / 0.12, 2)) * 0.9;
  }

  function update(dt, t) {
    eU.uTime.value = t;
    eU.uPix.value = stage.renderer.getPixelRatio();
    fire.intensity = 24 + Math.sin(t * 2.3) * 4 + Math.sin(t * 5.1) * 2.5;
  }

  return { root: rootGrp, plate, courses, setCourse, update, COURSES };
}
