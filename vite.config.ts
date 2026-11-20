import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Relative base so the build works under any GitHub Pages path.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts'],
    // Run courier through Vitest rather than Node, which can't load PeerJS
    // as an ES module (and so mocks of it apply).
    server: { deps: { inline: ['@wabmalia/courier'] } },
  },
});
