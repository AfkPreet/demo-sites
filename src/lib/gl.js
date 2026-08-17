/*
 * Three.js stage harness.
 *
 * Everything WebGL on this project goes through here so the same guarantees
 * hold on every site:
 *   · pixel ratio capped by device tier (never renders 3x on a phone)
 *   · rendering stops the moment the canvas leaves the viewport
 *   · resize is observed on the canvas box, debounced into the frame loop
 *   · context loss degrades to the CSS fallback instead of a white rectangle
 */

import * as THREE from 'three';
import { onTick } from './ticker.js';
import { env } from './env.js';

export { THREE };

export class Stage {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {boolean} [opts.alpha=true]
   * @param {boolean} [opts.antialias]      defaults to true only on tier 'high'
   * @param {number}  [opts.dprScale=1]     multiply the capped DPR (0.75 for heavy fullscreen shaders)
   * @param {number}  [opts.maxDpr]
   * @param {object|null} [opts.camera]     perspective opts, or null for a raw Camera (fullscreen quads)
   * @param {number}  [opts.priority=50]    tick order
   * @param {string}  [opts.toneMapping]    'aces' | 'none'
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.visible = false;
    /** Manual override — set true to stop rendering a fixed canvas that is
     *  faded out but technically still "intersecting". */
    this.paused = false;
    this.lost = false;
    this.width = 1;
    this.height = 1;
    this.time = 0;
    this._frames = [];
    this._disposers = [];

    const antialias = opts.antialias ?? env.tier === 'high';

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: opts.alpha ?? true,
      antialias,
      powerPreference: 'high-performance',
      stencil: false,
      depth: opts.depth ?? true,
      failIfMajorPerformanceCaveat: false,
    });

    const cap = opts.maxDpr ?? env.dpr;
    this._dpr = Math.max(0.6, cap * (opts.dprScale ?? 1));
    this.renderer.setPixelRatio(this._dpr);
    this.renderer.setClearColor(0x000000, 0);
    if (opts.toneMapping === 'aces') {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = opts.exposure ?? 1;
    }

    this.scene = new THREE.Scene();

    if (opts.camera === null) {
      this.camera = new THREE.Camera();
    } else {
      const c = opts.camera ?? {};
      this.camera = new THREE.PerspectiveCamera(c.fov ?? 40, 1, c.near ?? 0.1, c.far ?? 200);
      this.camera.position.z = c.z ?? 5;
    }

    canvas.addEventListener('webglcontextlost', this._onLost, false);
    canvas.addEventListener('webglcontextrestored', this._onRestored, false);

    this._ro = new ResizeObserver(() => this._resizePending = true);
    this._ro.observe(canvas);

    this._io = new IntersectionObserver(
      ([e]) => {
        this.visible = e.isIntersecting;
      },
      { rootMargin: '120px' }
    );
    this._io.observe(canvas);

    this._resizePending = true;
    this.resize();

    this._off = onTick((dt, t) => this._tick(dt, t), opts.priority ?? 50);

    addEventListener('pagehide', () => this.dispose(), { once: true });
  }

  _onLost = (e) => {
    e.preventDefault();
    this.lost = true;
    this.canvas.classList.add('gl-lost');
    document.documentElement.classList.add('gl-lost');
  };

  _onRestored = () => {
    this.lost = false;
    this.canvas.classList.remove('gl-lost');
    document.documentElement.classList.remove('gl-lost');
    this._resizePending = true;
  };

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.opts.onResize?.(w, h, this);
  }

  /** @param {(dt:number, t:number, stage:Stage) => void} fn */
  onFrame(fn) {
    this._frames.push(fn);
    return () => {
      const i = this._frames.indexOf(fn);
      if (i > -1) this._frames.splice(i, 1);
    };
  }

  track(disposable) {
    this._disposers.push(disposable);
    return disposable;
  }

  _tick(dt, t) {
    if (this.lost) return;
    if (this._resizePending) {
      this._resizePending = false;
      this.resize();
    }
    if (!this.visible || this.paused) return;
    this.time += dt;
    for (let i = 0; i < this._frames.length; i++) this._frames[i](dt, this.time, this);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._off?.();
    this._ro?.disconnect();
    this._io?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this._onLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onRestored);
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
      else m?.dispose?.();
    });
    for (const d of this._disposers) d.dispose?.();
    this.renderer.dispose();
  }
}

/**
 * Fullscreen shader quad. Uses a raw Camera + clip-space vertex shader so no
 * projection maths happens at all.
 */
export function fullscreenQuad(stage, fragmentShader, uniforms = {}, vertexShader) {
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vertexShader ?? `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  stage.scene.add(mesh);
  return { mesh, material: mat, uniforms: mat.uniforms };
}

/** Pointer position in -1..1, damped, with a graceful idle drift on touch. */
export function pointer(el = window) {
  const p = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  const target = el === window ? window : el;
  const set = (cx, cy) => {
    const r = el === window
      ? { left: 0, top: 0, width: innerWidth, height: innerHeight }
      : el.getBoundingClientRect();
    p.tx = ((cx - r.left) / r.width) * 2 - 1;
    p.ty = ((cy - r.top) / r.height) * 2 - 1;
    p.active = true;
  };
  target.addEventListener('pointermove', (e) => set(e.clientX, e.clientY), { passive: true });
  target.addEventListener('pointerleave', () => (p.active = false), { passive: true });
  return p;
}
