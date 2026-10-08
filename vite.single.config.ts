import { defineConfig } from 'vite';

// One-bundle build for scripts/make-single-html.mjs: everything (game, C++ core as WebAssembly,
// data, text) ends up in a single JavaScript file that is then inlined into one HTML page.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-single',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
