/*
 * The Aurelis Nocturne 01, built from primitives at runtime.
 *
 * Two objects live here: the finished watch (case, bezel, crystal, guilloché
 * dial, moon phase, hands, crown, lugs, strap) and the calibre inside it —
 * 214 components spread across eight InstancedMeshes, so the whole movement
 * costs eight draw calls whether it is assembled or blown apart.
 */

import { THREE } from '../lib/gl.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { guilloche, moonDisc, studioEnv } from './textures.js';
import { rng, TAU, clamp, smoothstep, easeInOutCubic, lerp } from '../lib/math.js';
import { q, env } from '../lib/env.js';

/* Component census — this adds up to the 214 the copy claims. */
export const CENSUS = [
  { key: 'plate', count: 9 },
  { key: 'gear', count: 18 },
  { key: 'wheel', count: 22 },
  { key: 'lever', count: 12 },
  { key: 'spring', count: 6 },
  { key: 'jewel', count: 41 },
  { key: 'screw', count: 62 },
  { key: 'pin', count: 44 },
];
export const TOTAL_PARTS = CENSUS.reduce((n, p) => n + p.count, 0); // 214

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

/** A real gear silhouette — trapezoidal teeth around a hub. */
function gearGeometry(teeth = 14, seg = 1) {
  const shape = new THREE.Shape();
  const rOut = 1, rIn = 0.84, rHub = 0.22;
  const step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const p = [
      [a + step * 0.06, rIn],
      [a + step * 0.16, rOut],
      [a + step * 0.34, rOut],
      [a + step * 0.44, rIn],
      [a + step * 0.5, rIn],
    ];
    for (const [ang, r] of p) {
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      i === 0 && ang === a + step * 0.06 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    }
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, rHub, 0, TAU, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: seg * 8 });
  g.translate(0, 0, -0.03);
  g.rotateX(-Math.PI / 2); // lie flat in the XZ plane
  return g;
}

/** An organic bridge plate, the shape a watchmaker would recognise. */
function bridgeGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.9, -0.25);
  s.bezierCurveTo(-0.55, -0.72, 0.3, -0.78, 0.78, -0.42);
  s.bezierCurveTo(1.05, -0.2, 1.02, 0.28, 0.72, 0.5);
  s.bezierCurveTo(0.3, 0.82, -0.4, 0.76, -0.78, 0.42);
  s.bezierCurveTo(-0.98, 0.24, -1.0, -0.05, -0.9, -0.25);
  const hole = new THREE.Path();
  hole.absarc(0.12, 0.02, 0.24, 0, TAU, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -0.035);
  g.rotateX(-Math.PI / 2);
  return g;
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

export function buildWatch(stage) {
  const detail = q(0, 1, 2); // 0 low, 2 high
  const seg = (a, b, c) => (detail === 0 ? a : detail === 1 ? b : c);

  /* ---- environment ------------------------------------------------ */
  const envCanvas = studioEnv(detail === 0 ? 256 : 512);
  const envTex = new THREE.CanvasTexture(envCanvas);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(stage.renderer);
  const envRT = pmrem.fromEquirectangular(envTex);
  stage.scene.environment = envRT.texture;
  pmrem.dispose();
  envTex.dispose();

  // Two analytic lights, not three. The environment map already supplies the
  // ambient shape; every extra light is another full lighting evaluation per
  // pixel, and this scene is fragment-bound.
  // The key sits well forward of the piece. A steep key looks dramatic on a
  // three-quarter view and then leaves the dial almost black the moment the
  // camera comes face-on, which is where most of this story is spent.
  const key = new THREE.DirectionalLight(0xfff1d9, 2.5);
  key.position.set(1.5, 2.1, 3.3);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 1.25);
  rim.position.set(-3.1, 0.9, -2.1);
  stage.scene.add(key, rim);

  /* ---- materials -------------------------------------------------- */
  const M = {
    gold: new THREE.MeshStandardMaterial({ color: 0xc9a06a, metalness: 1, roughness: 0.23, envMapIntensity: 1.15 }),
    goldSoft: new THREE.MeshStandardMaterial({ color: 0xb98f52, metalness: 1, roughness: 0.34, envMapIntensity: 1.1 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8f96a1, metalness: 1, roughness: 0.4, envMapIntensity: 0.72 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc0a052, metalness: 1, roughness: 0.36, envMapIntensity: 0.95 }),
    blued: new THREE.MeshStandardMaterial({ color: 0x2f4f96, metalness: 1, roughness: 0.22, envMapIntensity: 1.3 }),
    ruby: new THREE.MeshStandardMaterial({
      color: 0x9c1230, metalness: 0.1, roughness: 0.08,
      emissive: 0x4a0512, emissiveIntensity: 0.55, envMapIntensity: 1.4,
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.6, roughness: 0.55 }),
  };

  const dialTex = new THREE.CanvasTexture(guilloche(detail === 0 ? 512 : 1024));
  dialTex.colorSpace = THREE.SRGBColorSpace;
  dialTex.anisotropy = Math.min(8, stage.renderer.capabilities.getMaxAnisotropy());
  // (The quarter-turn the cap UVs introduce is compensated inside guilloche().)
  const dialMat = new THREE.MeshStandardMaterial({
    map: dialTex, metalness: 0.08, roughness: 0.44, envMapIntensity: 1.15,
  });

  const moonTex = new THREE.CanvasTexture(moonDisc(512));
  moonTex.colorSpace = THREE.SRGBColorSpace;
  moonTex.wrapS = THREE.RepeatWrapping;
  // The disc carries two moons; the subdial should only ever show one.
  moonTex.repeat.set(0.46, 1);
  const moonMat = new THREE.MeshStandardMaterial({ map: moonTex, metalness: 0.2, roughness: 0.6 });

  // Clearcoat is a second specular lobe evaluated per pixel, and the crystal
  // covers most of the frame when the camera pushes in. Only high-tier devices
  // pay for it; everyone else gets a plain reflective sheet, which at 14%
  // opacity is visually near-identical.
  const crystalMat = detail === 2
    ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0, roughness: 0.02,
        transparent: true, opacity: 0.14,
        clearcoat: 1, clearcoatRoughness: 0.02,
        envMapIntensity: 2.4, depthWrite: false,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xffffff, metalness: 0.15, roughness: 0.04,
        transparent: true, opacity: 0.13,
        envMapIntensity: 2.6, depthWrite: false,
      });

  /* ---- assembly --------------------------------------------------- */
  const watch = new THREE.Group();
  // Built dial-up (natural for Y-axis cylinders), then tipped +90° about X so
  // the dial normal lands on +Z and looks straight down the camera.
  const face = new THREE.Group();
  face.rotation.x = Math.PI / 2;
  watch.add(face);

  const caseGrp = new THREE.Group();
  const dialGrp = new THREE.Group();
  const glassGrp = new THREE.Group();
  const handGrp = new THREE.Group();
  const movement = new THREE.Group();
  face.add(caseGrp, movement, dialGrp, handGrp, glassGrp);

  /* The case is seventeen primitives that never move relative to each other.
     Baking each one's transform into its geometry and merging by material
     turns seventeen draw calls into three — which is free on a desktop GPU and
     genuinely matters on a phone driver. */
  const bakeM = new THREE.Matrix4();
  const bakeQ = new THREE.Quaternion();
  const bakeE = new THREE.Euler();
  const bakeP = new THREE.Vector3();
  const bakeS = new THREE.Vector3(1, 1, 1);
  const bake = (geo, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const g = geo.clone();
    bakeE.set(rot[0], rot[1], rot[2]);
    bakeQ.setFromEuler(bakeE);
    bakeP.set(pos[0], pos[1], pos[2]);
    bakeM.compose(bakeP, bakeQ, bakeS);
    g.applyMatrix4(bakeM);
    return g;
  };

  const goldParts = [
    // openEnded — this is the case band, not a lid. A closed cap here would
    // cover the dial completely.
    bake(new THREE.CylinderGeometry(1, 0.955, 0.2, seg(40, 64, 88), 1, true)),
    bake(new THREE.CylinderGeometry(0.058, 0.058, 0.1, seg(10, 14, 18)), [1.045, 0, 0], [0, 0, Math.PI / 2]),
  ];
  /* Lugs. Kept short and tucked into the case band: with no strap modelled,
     a long horn standing out at z ±1.17 caught the top of the light tent and
     read as two bright flags floating off the top of the watch. */
  const lugGeo = new THREE.BoxGeometry(0.17, 0.092, 0.32);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    goldParts.push(bake(lugGeo, [sx * 0.42, -0.045, sz * 0.87], [sz * 0.26, 0, 0]));
  }
  lugGeo.dispose();

  const softParts = [
    bake(new THREE.CylinderGeometry(0.955, 0.88, 0.035, seg(32, 56, 72)), [0, -0.113, 0]),
    bake(new THREE.CylinderGeometry(0.032, 0.032, 0.06, 10), [0.995, 0, 0], [0, 0, Math.PI / 2]),
  ];

  const caseBody = new THREE.Mesh(mergeGeometries(goldParts, false), M.gold);
  const caseSoft = new THREE.Mesh(mergeGeometries(softParts, false), M.goldSoft);
  goldParts.forEach((g) => g.dispose());
  softParts.forEach((g) => g.dispose());

  // Bezel is separate — it lifts off during the explosion.
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.955, 0.052, seg(6, 10, 14), seg(48, 72, 96)), M.gold);
  bezel.rotation.x = Math.PI / 2;
  bezel.position.y = 0.1;
  caseGrp.add(caseBody, caseSoft, bezel);

  // dial + flange + indices
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.93, 0.93, 0.014, seg(40, 64, 88)), dialMat);
  dial.position.y = 0.078;
  const flange = new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.018, seg(5, 8, 10), seg(40, 64, 80)), M.goldSoft);
  flange.rotation.x = Math.PI / 2;
  flange.position.y = 0.086;
  dialGrp.add(dial, flange);

  const idxGeo = new THREE.BoxGeometry(0.036, 0.016, 0.135);
  const indices = new THREE.InstancedMesh(idxGeo, M.gold, 12);
  const m4 = new THREE.Matrix4();
  const e = new THREE.Euler();
  const qt = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const big = i % 3 === 0;
    e.set(0, -a, 0);
    qt.setFromEuler(e);
    v3.set(Math.sin(a) * 0.745, 0.092, -Math.cos(a) * 0.745);
    m4.compose(v3, qt, one.clone().set(big ? 1.5 : 1, 1, big ? 1.1 : 1));
    indices.setMatrixAt(i, m4);
  }
  indices.instanceMatrix.needsUpdate = true;
  dialGrp.add(indices);

  // moon phase at 6 o'clock
  const moonPos = new THREE.Vector3(0, 0.086, 0.4);
  const moon = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.006, seg(20, 32, 40)), moonMat);
  moon.position.copy(moonPos);
  const moonRing = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.011, 6, seg(24, 36, 48)), M.gold);
  moonRing.rotation.x = Math.PI / 2;
  moonRing.position.copy(moonPos).setY(0.092);
  dialGrp.add(moon, moonRing);

  // hands
  const mkHand = (w, len, mat, tail = 0.07) => {
    const g = new THREE.BoxGeometry(w, 0.011, len + tail);
    g.translate(0, 0, len / 2 - tail / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.y = 0.104;
    return m;
  };
  const hourHand = mkHand(0.036, 0.44, M.gold);
  const minHand = mkHand(0.026, 0.64, M.gold);
  const secHand = mkHand(0.011, 0.7, M.blued, 0.16);
  secHand.position.y = 0.116;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, seg(10, 16, 20)), M.gold);
  cap.position.y = 0.12;
  // θ = π − φ maps a clock angle φ (clockwise from 12) onto this rig.
  // Set to the 10:10:35 every watch is photographed at.
  hourHand.rotation.y = Math.PI - (305 * Math.PI) / 180;
  minHand.rotation.y = Math.PI - (60 * Math.PI) / 180;
  secHand.rotation.y = Math.PI - (210 * Math.PI) / 180;
  handGrp.add(hourHand, minHand, secHand, cap);

  // crystal — added last so it sorts above the dial
  const crystal = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.03, seg(40, 64, 88)), crystalMat);
  crystal.position.y = 0.112;
  glassGrp.add(crystal);

  /* ---- the calibre ------------------------------------------------ */
  const rnd = rng(1908);
  const parts = [];
  const meshes = [];

  const GEO = {
    plate: bridgeGeometry(),
    gear: gearGeometry(14, seg(0.6, 1, 1)),
    wheel: new THREE.CylinderGeometry(1, 1, 0.05, seg(12, 18, 24)),
    lever: new THREE.BoxGeometry(1, 0.5, 0.16),
    spring: new THREE.TorusGeometry(1, 0.07, seg(4, 5, 6), seg(12, 18, 24)),
    jewel: new THREE.SphereGeometry(1, seg(6, 8, 10), seg(4, 6, 8)),
    screw: new THREE.CylinderGeometry(1, 1, 1, seg(6, 8, 10)),
    pin: new THREE.CylinderGeometry(1, 1, 1, seg(5, 6, 8)),
  };
  const MAT = {
    plate: M.steel, gear: M.brass, wheel: M.brass, lever: M.steel,
    spring: M.blued, jewel: M.ruby, screw: M.blued, pin: M.steel,
  };
  const SPEC = {
    // radius band, vertical band, scale band
    plate: { r: [0.1, 0.5], y: [-0.05, 0.0], s: [0.42, 0.62] },
    gear: { r: [0.12, 0.62], y: [-0.055, 0.02], s: [0.1, 0.28] },
    wheel: { r: [0.1, 0.66], y: [-0.06, 0.03], s: [0.06, 0.19] },
    lever: { r: [0.2, 0.6], y: [-0.03, 0.03], s: [0.14, 0.3] },
    spring: { r: [0.24, 0.58], y: [-0.04, 0.02], s: [0.1, 0.2] },
    jewel: { r: [0.1, 0.72], y: [-0.05, 0.03], s: [0.016, 0.026] },
    screw: { r: [0.15, 0.8], y: [-0.02, 0.04], s: [0.018, 0.03] },
    pin: { r: [0.12, 0.76], y: [-0.055, 0.0], s: [0.012, 0.022] },
  };

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpP = new THREE.Vector3();
  const tmpS = new THREE.Vector3();

  for (const { key: k, count } of CENSUS) {
    const spec = SPEC[k];
    const im = new THREE.InstancedMesh(GEO[k], MAT[k], count);
    im.frustumCulled = false;
    const group = [];
    for (let i = 0; i < count; i++) {
      const a = rnd() * TAU;
      const r = lerp(spec.r[0], spec.r[1], Math.sqrt(rnd()));
      const y = lerp(spec.y[0], spec.y[1], rnd());
      const pos = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);

      let sx = lerp(spec.s[0], spec.s[1], rnd());
      const scale = new THREE.Vector3(sx, sx, sx);
      if (k === 'screw') scale.set(sx, sx * 0.9, sx);
      if (k === 'pin') scale.set(sx, sx * 3.4, sx);
      if (k === 'lever') scale.set(sx * 2.1, sx * 0.5, sx);
      if (k === 'plate') scale.set(sx, 1, sx * 0.8);

      const rot = new THREE.Euler(
        k === 'jewel' || k === 'gear' || k === 'wheel' || k === 'plate' ? 0 : (rnd() - 0.5) * 0.5,
        rnd() * TAU,
        (rnd() - 0.5) * 0.4
      );
      if (k === 'spring') rot.x = Math.PI / 2 + (rnd() - 0.5) * 0.3;

      // exploded target: outward from the centre, plus a personal drift
      const dir = pos.clone().normalize().multiplyScalar(0.85 + rnd() * 1.5);
      dir.x += (rnd() - 0.5) * 1.5;
      dir.y += (rnd() - 0.5) * 2.6 + (k === 'plate' ? 0.4 : 0);
      dir.z += (rnd() - 0.5) * 1.5;

      group.push({
        pos, rot, scale, dir,
        spin: new THREE.Vector3((rnd() - 0.5) * 1.6, (rnd() - 0.5) * 2.2, (rnd() - 0.5) * 1.6),
        delay: rnd() * 0.3,
      });
      parts.push(1);
    }
    movement.add(im);
    meshes.push({ im, group });
  }

  watch.userData.partCount = parts.length;

  /* ---- update ------------------------------------------------------ */
  /*
   * Shell peel-away. Local axes inside `face` are: +X right, +Y toward the
   * viewer, +Z down the dial (six o'clock). Each layer gets its own escape
   * vector so the case fans open instead of five parts sliding the same way,
   * and each is far enough to clear the frustum before it is hidden.
   */
  const ESCAPE = {
    glass: new THREE.Vector3(2.1, 1.1, -3.3),
    bezel: new THREE.Vector3(-2.6, 0.9, -2.4),
    dial: new THREE.Vector3(1.3, 0.7, 3.4),
    hands: new THREE.Vector3(-3.2, 1.5, 1.0),
    case: new THREE.Vector3(0.2, -1.3, 3.9),
  };
  const SHELL_TRAVEL = 2.0;

  /**
   * @param {number} explode 0 = finished watch, 1 = 214 parts in space
   * @param {number} time    seconds, for the idle drift of loose components
   */
  function setExplode(explode, time) {
    const t = clamp(explode);

    // The case, crystal, dial and hands leave first, so the calibre is exposed
    // before the calibre itself starts to come apart.
    const lift = smoothstep(clamp(t / 0.34));
    const travel = lift * SHELL_TRAVEL;

    glassGrp.position.copy(ESCAPE.glass).multiplyScalar(travel);
    glassGrp.rotation.set(lift * 0.6, 0, lift * 0.3);
    crystalMat.opacity = (detail === 2 ? 0.14 : 0.13) * (1 - lift * 0.85);
    glassGrp.visible = lift < 0.995;

    dialGrp.position.copy(ESCAPE.dial).multiplyScalar(travel);
    dialGrp.rotation.set(lift * 0.4, lift * 0.5, lift * 0.35);
    dialGrp.visible = lift < 0.995;

    handGrp.position.copy(ESCAPE.hands).multiplyScalar(travel);
    handGrp.rotation.set(-lift * 0.5, lift * 1.4, 0);
    handGrp.visible = lift < 0.995;

    // While the case is shut the calibre is behind an opaque dial, so there is
    // nothing to see and eight draw calls to save — and no chance of a stray
    // component poking through the dial face.
    movement.visible = lift > 0.015;

    caseGrp.position.copy(ESCAPE.case).multiplyScalar(travel);
    caseGrp.rotation.set(lift * 0.35, lift * 0.6, 0);
    caseGrp.visible = lift < 0.995;

    // The bezel is a child of caseGrp, so it only needs its own extra offset
    // to peel off the case as the case leaves.
    bezel.position.copy(ESCAPE.bezel).multiplyScalar(lift * 0.9).setY(0.1 + lift * 1.6);

    // Calibre
    const spread = smoothstep(clamp((t - 0.16) / 0.84));
    for (const { im, group } of meshes) {
      for (let i = 0; i < group.length; i++) {
        const p = group[i];
        const local = clamp((spread - p.delay) / (1 - p.delay));
        const eased = easeInOutCubic(local);
        tmpP.copy(p.pos).addScaledVector(p.dir, eased * 1.55);
        if (eased > 0.001) {
          tmpP.x += Math.sin(time * 0.5 + i) * 0.02 * eased;
          tmpP.y += Math.cos(time * 0.43 + i * 1.7) * 0.025 * eased;
        }
        tmpE.set(
          p.rot.x + p.spin.x * eased * 2.4 + (eased > 0 ? time * 0.06 * p.spin.x : 0),
          p.rot.y + p.spin.y * eased * 2.4,
          p.rot.z + p.spin.z * eased * 2.4
        );
        tmpQ.setFromEuler(tmpE);
        tmpS.copy(p.scale);
        tmpM.compose(tmpP, tmpQ, tmpS);
        im.setMatrixAt(i, tmpM);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }

  /** Runs the hands like a real watch: smooth sweep seconds, slow hour hand. */
  function tickHands(dt, rate = 1) {
    secHand.rotation.y -= dt * (TAU / 60) * rate;
    minHand.rotation.y -= dt * (TAU / 3600) * rate;
    hourHand.rotation.y -= dt * (TAU / 43200) * rate;
    moonTex.offset.x = (moonTex.offset.x + dt * 0.006 * rate) % 1;
  }

  function dispose() {
    envRT.dispose();
    dialTex.dispose();
    moonTex.dispose();
    for (const g of Object.values(GEO)) g.dispose();
  }

  setExplode(0, 0);

  return { watch, face, setExplode, tickHands, dispose, parts: TOTAL_PARTS, materials: M };
}
