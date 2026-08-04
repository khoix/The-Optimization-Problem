import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built bundle runs from any static host or subpath
  // (GitHub Pages, itch.io, a plain file server).
  base: './',
});
