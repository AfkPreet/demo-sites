/*
 * HOUSE FOR A GLASSBLOWER — the assembly.
 *
 * An axonometric drawing that builds itself. Two decisions make it read as a
 * drawing rather than a render:
 *
 *   1. An OrthographicCamera. No perspective convergence, so parallel edges
 *      stay parallel exactly the way they do on a drawing board.
 *   2. Every solid carries a LineSegments of its own edges in ink. The white
 *      volumes only exist to occlude the lines behind them.
 *
 * Geometry is authored in metres and merged per part, so the fourteen parts of
 * a whole house cost twenty-eight draw calls rather than several hundred.
 */

import { THREE } from '../lib/gl.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, easeOutCubic, smoothstep } from '../lib/math.js';
import { q } from '../lib/env.js';

/* The house, in metres. 12 × 8 on plan is the 96 m² on the drawing. */
const W = 12;
const D = 8;
const WALL = 3.2;      // eaves height, south side
const RIDGE = 5.4;     // high side, north — the furnace needs the volume
const T = 0.2;         // nominal timber section

/* ── geometry helpers ─────────────────────────────────────────────────── */

const box = (w, h, d, x = 0, y = 0, z = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

const cyl = (r, h, x, y, z, seg = 8) => {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  g.translate(x, y, z);
  return g;
};

/** A box rotated about the X axis — used for the pitched roof and its rafters. */
const slab = (w, h, d, rx, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx);
  g.translate(x, y, z);
  return g;
};

const ROOF_RISE = RIDGE - WALL;
const ROOF_ANGLE = Math.atan2(ROOF_RISE, D);
const ROOF_LEN = Math.hypot(D, ROOF_RISE);

/* ── materials ─────────────────────────────────────────────────────────
   Lambert, not physical. There is no environment map and no specular story
   here — the whole image is white paper, ink and one earth colour, and a
   physical material would only cost fragment time to look the same.
   ─────────────────────────────────────────────────────────────────────── */

function materials() {
  const make = (color, opts = {}) =>
    new THREE.MeshLambertMaterial({ color, ...opts });
  return {
    /* Every one of these used to sit inside a few percent of every other —
       concrete 0xdedbd4 against roof 0xdedbd3 — so a building made of steel,
       timber, concrete, zinc and brick arrived on screen as one beige object
       and the assembly sequence had nothing to explain. The palette is still
       pale paper, but the values now separate and the timber is genuinely
       warm against a cool roof, which is what an axonometric is for. */
    ground: make(0xedeae2),
    concrete: make(0xcdc9c0),
    steel: make(0x8f8d86),
    timber: make(0xd9bf95),
    deck: make(0xe6d9bc),
    brick: make(0xb5806a),
    roof: make(0xb3b7b4),
    glass: new THREE.MeshLambertMaterial({
      color: 0xaecad4,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
    plant: make(0x8fa384),
    person: make(0xc2402b),
  };
}

/* ── the parts list ────────────────────────────────────────────────────
   Each entry becomes one merged mesh, one edge overlay, one landing.
   `stage` is which chapter it belongs to; `delay` staggers it inside that
   chapter; `from` is where it flies in from, in metres.
   ─────────────────────────────────────────────────────────────────────── */

function parts(M) {
  const P = [];
  const add = (name, stage, delay, from, material, geos, opts = {}) =>
    P.push({ name, stage, delay, from, material, geos, ...opts });

  /* 00 · SITE ---------------------------------------------------------- */
  const site = [box(W + 4, 0.26, D + 3.5, 0, -0.13, 0)];
  add('site', 0, 0, [0, -2.2, 0], M.ground, site);

  // Contour lines, drawn not extruded.
  const contours = [];
  for (let i = 0; i < 4; i++) {
    const r = 5.4 + i * 2.1;
    const pts = [];
    for (let a = 0; a <= 42; a++) {
      const th = (a / 42) * Math.PI * 2;
      const wob = 1 + Math.sin(th * 3 + i) * 0.09 + Math.cos(th * 5 - i) * 0.05;
      pts.push(new THREE.Vector3(Math.cos(th) * r * wob * 1.25, 0.02, Math.sin(th) * r * wob * 0.82));
    }
    contours.push(pts);
  }

  /* 01 · FOUNDATION ---------------------------------------------------- */
  const piles = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      const x = -W / 2 + 0.7 + (i * (W - 1.4)) / 3;
      const z = -D / 2 + 0.7 + (j * (D - 1.4)) / 2;
      piles.push(cyl(0.13, 1.5, x, -0.55, z, q(6, 8, 12)));
      piles.push(box(0.44, 0.1, 0.44, x, 0.25, z));
    }
  }
  add('piles', 1, 0, [0, 5.5, 0], M.steel, piles);

  const plinth = [
    box(W, 0.36, 0.36, 0, 0.48, -D / 2 + 0.18),
    box(W, 0.36, 0.36, 0, 0.48, D / 2 - 0.18),
    box(0.36, 0.36, D - 0.72, -W / 2 + 0.18, 0.48, 0),
    box(0.36, 0.36, D - 0.72, W / 2 - 0.18, 0.48, 0),
  ];
  add('plinth', 1, 0.34, [0, 6.5, 0], M.concrete, plinth);

  /* 02 · FLOOR --------------------------------------------------------- */
  const joists = [];
  for (let i = 0; i <= 12; i++) {
    const x = -W / 2 + 0.3 + (i * (W - 0.6)) / 12;
    joists.push(box(0.1, 0.3, D - 0.4, x, 0.81, 0));
  }
  joists.push(box(W, 0.14, 0.24, 0, 0.81, -D / 2 + 0.12));
  joists.push(box(W, 0.14, 0.24, 0, 0.81, D / 2 - 0.12));
  add('joists', 2, 0, [0, 7, 0], M.timber, joists);

  const deck = [box(W + 0.24, 0.09, D + 0.24, 0, 1.0, 0)];
  add('deck', 2, 0.36, [0, 8, 0], M.deck, deck);

  /* 03 · FRAME --------------------------------------------------------- */
  const posts = [];
  const postX = [-W / 2 + 0.2, -2.9, 0.9, W / 2 - 0.2];
  for (const x of postX) {
    posts.push(box(T, WALL, T, x, 1.05 + WALL / 2, -D / 2 + 0.2));
    const h = WALL + ROOF_RISE;
    posts.push(box(T, h, T, x, 1.05 + h / 2, D / 2 - 0.2));
  }
  add('posts', 3, 0, [0, 6, 0], M.timber, posts);

  const beams = [
    box(W, 0.34, T, 0, 1.05 + WALL + 0.17, -D / 2 + 0.2),
    box(W, 0.34, T, 0, 1.05 + RIDGE + 0.17, D / 2 - 0.2),
    box(T, 0.28, D - 0.4, -W / 2 + 0.2, 1.05 + WALL + 0.6, 0),
    box(T, 0.28, D - 0.4, W / 2 - 0.2, 1.05 + WALL + 0.6, 0),
  ];
  add('beams', 3, 0.32, [0, 7.5, 0], M.timber, beams);

  /* 04 · ROOF ---------------------------------------------------------- */
  const rafterY = 1.05 + WALL + 0.34 + ROOF_RISE / 2;
  const rafters = [];
  for (let i = 0; i <= 10; i++) {
    const x = -W / 2 + 0.4 + (i * (W - 0.8)) / 10;
    rafters.push(slab(0.09, 0.26, ROOF_LEN, -ROOF_ANGLE, x, rafterY, 0));
  }
  add('rafters', 4, 0, [0, 8, 0], M.timber, rafters);

  const roof = [slab(W + 0.7, 0.12, ROOF_LEN + 0.5, -ROOF_ANGLE, 0, rafterY + 0.24, 0)];
  add('roof', 4, 0.38, [0, 9.5, 0], M.roof, roof);

  /* 05 · ENVELOPE ------------------------------------------------------ */
  const brick = [
    // south wall, with the big opening left out of it
    box(4.4, WALL, 0.34, -W / 2 + 2.2, 1.05 + WALL / 2, -D / 2 + 0.17),
    box(2.2, WALL, 0.34, W / 2 - 1.1, 1.05 + WALL / 2, -D / 2 + 0.17),
    box(5.4, 0.5, 0.34, 0.6, 1.05 + WALL - 0.25, -D / 2 + 0.17),
    // west gable
    box(0.34, WALL, D - 0.34, -W / 2 + 0.17, 1.05 + WALL / 2, 0),
    // north wall, full height
    box(W, WALL + ROOF_RISE, 0.34, 0, 1.05 + (WALL + ROOF_RISE) / 2, D / 2 - 0.17),
  ];
  add('brick', 5, 0, [-9, 2, -6], M.brick, brick);

  const glass = [
    box(5.4, WALL - 0.5, 0.06, 0.6, 1.05 + (WALL - 0.5) / 2, -D / 2 + 0.17),
    box(0.06, WALL - 0.4, 5.6, W / 2 - 0.17, 1.05 + (WALL - 0.4) / 2, 0.5),
  ];
  add('glass', 5, 0.3, [0, 0, -7], M.glass, glass, { edges: true });

  const chimney = [
    box(1.15, 6.4, 1.15, -3.6, 1.05 + 3.2, 1.2),
    box(1.45, 0.3, 1.45, -3.6, 1.05 + 6.4, 1.2),
  ];
  add('chimney', 5, 0.5, [0, 11, 0], M.brick, chimney);

  /* 06 · IN USE -------------------------------------------------------- */
  const steps = [
    box(2.4, 0.16, 0.5, 0.6, 0.92, -D / 2 - 0.42),
    box(2.4, 0.16, 0.5, 0.6, 0.62, -D / 2 - 0.86),
    box(2.4, 0.16, 0.5, 0.6, 0.32, -D / 2 - 1.3),
  ];
  add('steps', 6, 0, [0, 3, 0], M.concrete, steps);

  // Kept inside the site plate — a tree standing off the edge of the drawing
  // looks like a mistake, not a tree.
  // Planted behind and to the west: from the south-east viewpoint the trees
  // then sit behind the building instead of standing in front of the glazing,
  // which is the one thing on the house worth looking at.
  const yard = [
    cyl(0.09, 2.6, -W / 2 - 1.5, 1.3, -1.6, 6),
    cyl(0.09, 2.2, -W / 2 - 1.2, 1.1, 2.4, 6),
    cyl(0.08, 1.8, 3.4, 0.9, D / 2 + 1.4, 6),
  ];
  add('trees', 6, 0.2, [0, 4, 0], M.plant, yard);

  const canopy = [
    box(1.5, 1.5, 1.5, -W / 2 - 1.5, 3.1, -1.6),
    box(1.25, 1.25, 1.25, -W / 2 - 1.2, 2.6, 2.4),
    box(1.05, 1.05, 1.05, 3.4, 2.1, D / 2 + 1.4),
  ];
  add('canopy', 6, 0.3, [0, 4.5, 0], M.plant, canopy);

  // A person, 1.88 m to the top of the head, standing on the ground rather
  // than on the floor level — they are outside the house.
  const figure = [
    box(0.36, 0.68, 0.24, -2.2, 0.34, -D / 2 - 1.7),
    box(0.42, 0.94, 0.26, -2.2, 1.15, -D / 2 - 1.7),
    box(0.3, 0.3, 0.26, -2.2, 1.73, -D / 2 - 1.7),
  ];
  add('figure', 6, 0.42, [0, 2.5, 0], M.person, figure);

  return { P, contours };
}

/* ── build ─────────────────────────────────────────────────────────────── */

export function buildHouse(stage) {
  const M = materials();
  const { P, contours } = parts(M);

  const root = new THREE.Group();
  stage.scene.add(root);

  const inkMat = new THREE.LineBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.9 });
  const guideMat = new THREE.LineBasicMaterial({ color: 0x9c9a94, transparent: true, opacity: 0.55 });

  // Every part fades in on its own clock, so every part owns its own material
  // instance — a shared one would fade the whole house at once.
  const built = P.map((p) => {
    const geo = mergeGeometries(p.geos, false);
    const group = new THREE.Group();

    const material = p.material.clone();
    material.transparent = true;
    const mesh = new THREE.Mesh(geo, material);
    group.add(mesh);

    let lines = null;
    if (p.edges !== false) {
      const lineMat = inkMat.clone();
      lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), lineMat);
      group.add(lines);
    }
    root.add(group);
    return { ...p, group, mesh, lines, material };
  });

  // Site contours, drawn as lines only.
  const contourGroup = new THREE.Group();
  for (const pts of contours) {
    contourGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), guideMat));
  }
  root.add(contourGroup);

  /* Light. One key, one fill, no shadows — this is a drawing and a cast
     shadow would only muddy the line work. */
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(7, 12, -6);
  const rim = new THREE.DirectionalLight(0xdfe6ea, 0.55);
  rim.position.set(-8, 4, 7);
  stage.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0xdcd8cf, 1.6));

  /* The setting-out line: the footprint marked on the ground before anything
     is built, in the red a site drawing reserves for dimensions. It hands
     over to the real plinth and fades away. */
  const setoutMat = new THREE.LineDashedMaterial({
    color: 0xc2402b,
    dashSize: 0.5,
    gapSize: 0.32,
    transparent: true,
  });
  const so = W / 2 + 0.3;
  const sd = D / 2 + 0.3;
  const setout = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-so, 0.04, -sd),
      new THREE.Vector3(so, 0.04, -sd),
      new THREE.Vector3(so, 0.04, sd),
      new THREE.Vector3(-so, 0.04, sd),
      new THREE.Vector3(-so, 0.04, -sd),
    ]),
    setoutMat
  );
  setout.computeLineDistances();
  root.add(setout);

  const STAGES = 6;
  const SPAN = 0.55;      // how much of one chapter a part takes to land

  /** @param {number} p 0…6, the chapter the drawing is on */
  function setProgress(p) {
    for (const b of built) {
      /* A part belonging to chapter n lands across [n-0.7, n-0.15], so it is
         already standing when the caption for chapter n is at full opacity.
         Landing *on* the chapter number, which is what this did first, meant
         the words described something that had not arrived yet — and chapter
         six never arrived at all, because a damped progress never reaches its
         end. */
      const local = clamp((p - (b.stage - 0.7) - b.delay * 0.4) / SPAN);
      const e = easeOutCubic(local);

      b.group.position.set(
        lerp(b.from[0], 0, e),
        lerp(b.from[1], 0, e),
        lerp(b.from[2], 0, e)
      );
      const s = lerp(0.9, 1, smoothstep(local));
      b.group.scale.setScalar(s);

      const fade = clamp(local * 2.6);
      b.material.opacity = b.name === 'glass' ? fade * 0.34 : fade;
      if (b.lines) b.lines.material.opacity = fade * 0.9;
      b.group.visible = fade > 0.004;
    }
    // Survey lines come up with the site and quieten once the house is on it.
    guideMat.opacity = clamp(p * 2) * 0.55 * (1 - clamp((p - 4.2) / 1.4) * 0.75);
    // The setting-out is only true until the foundation makes it real.
    setoutMat.opacity = 1 - clamp((p - 0.9) / 0.8);
  }

  setProgress(0);

  return {
    root,
    setProgress,
    stages: STAGES,
    /** Bounding radius used to fit the orthographic frustum. */
    extent: { w: W + 4, h: RIDGE + 6, d: D + 3.5 },
    dispose() {
      root.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material && o.material !== inkMat && o.material !== guideMat) o.material.dispose?.();
      });
    },
  };
}

export { W as HOUSE_W, D as HOUSE_D, RIDGE as HOUSE_H };
