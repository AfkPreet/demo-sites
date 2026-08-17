import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const r = (p) => resolve(import.meta.dirname, p);

const PAGES = {
  portfolio: 'index.html',
  aurelis: 'demos/aurelis/index.html',
  aetherion: 'demos/aetherion/index.html',
  noise94: 'demos/noise94/index.html',
  cendre: 'demos/cendre/index.html',
  mossfoot: 'demos/mossfoot/index.html',
  volumezero: 'demos/volume-zero/index.html',
};

// Build whatever exists. Keeps `vite build` usable while the demo sites are
// still being written, and shouts about anything missing rather than failing
// with an opaque rollup error.
const input = {};
for (const [name, file] of Object.entries(PAGES)) {
  if (existsSync(r(file))) input[name] = r(file);
  else console.warn(`\n  [build] skipping "${name}" — ${file} does not exist yet\n`);
}

export default defineConfig({
  base: '/',
  appType: 'mpa',
  build: {
    target: 'es2020',
    cssTarget: 'safari15',
    assetsInlineLimit: 8192,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input,
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
