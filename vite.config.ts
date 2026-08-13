import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const BOOT_CSS = fileURLToPath(new URL('./src/boot.css', import.meta.url));

/**
 * Put the boot screen's stylesheet in the document rather than beside it.
 *
 * A `<link>` is render-blocking in the build and so would do, but the dev
 * server injects imported CSS from JavaScript — which meant the first screen
 * of the game rendered as unstyled default HTML until the entry module had
 * loaded and run. Inlining is the only arrangement that behaves the same in
 * both, and it costs one request less in either.
 *
 * Read on every transform rather than once at config time, so editing
 * `boot.css` during `npm run dev` shows up on reload.
 */
function inlineBootCss(): Plugin {
  return {
    name: 'inline-boot-css',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const css = readFileSync(BOOT_CSS, 'utf8');
        if (!html.includes('<!--boot-css-->')) {
          throw new Error('index.html has no <!--boot-css--> slot for the boot stylesheet');
        }
        return html.replace('<!--boot-css-->', `<style>\n${css}</style>`);
      },
    },
    configureServer(server) {
      // The dev server does not watch a file nothing imports.
      server.watcher.add(BOOT_CSS);
      server.watcher.on('change', (file) => {
        if (file === BOOT_CSS) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

export default defineConfig({
  // Relative base so the built `dist/` runs from anywhere it is put — the
  // filesystem, a plain static server, a subpath — without being rebuilt for
  // the location. Nothing is fetched at runtime, so that is the whole of it.
  base: './',
  plugins: [inlineBootCss()],
});
