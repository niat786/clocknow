// @ts-check
import { defineConfig } from 'astro/config';

import solidJs from '@astrojs/solid-js';
import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://clocknow.net',
  integrations: [solidJs(), sitemap()],
  // Strict CSP: no inline scripts or styles, so never inline small assets into the HTML.
  build: { inlineStylesheets: 'never' },

  vite: {
    plugins: [tailwindcss()],
    // The engine worker imports ESM + Wasm, so build workers as modules.
    worker: { format: 'es' },
    build: { assetsInlineLimit: 0, sourcemap: false }
  }
});