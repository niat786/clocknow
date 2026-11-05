// @ts-check
import { defineConfig } from 'astro/config';

import solidJs from '@astrojs/solid-js';
import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://clocknow.net',
  integrations: [
    solidJs(),
    sitemap({
      // Canonical URLs have no trailing slash (Cloudflare Pages redirects /x/ to /x), so the sitemap must match.
      serialize(item) {
        const u = new URL(item.url);
        if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
        item.url = u.href;
        return item;
      },
    }),
  ],
  // Strict CSP: no inline scripts or styles, so never inline small assets into the HTML.
  build: { inlineStylesheets: 'never' },

  vite: {
    plugins: [tailwindcss()],
    // The engine worker imports ESM + Wasm, so build workers as modules.
    worker: { format: 'es' },
    build: { assetsInlineLimit: 0, sourcemap: false }
  }
});