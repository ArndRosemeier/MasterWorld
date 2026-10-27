import { defineConfig } from 'vite';
import { readRelease } from './tools/release/release.ts';

export default defineConfig({
  // GitHub Pages serves the game under /MasterWorld/ (set by .github/workflows/pages.yml); locally it is /.
  base: process.env.VITE_BASE ?? '/',
  // The version and "What's new" (src/app/release.ts); the Pages build of main is the release.
  define: { __RELEASE__: JSON.stringify(readRelease(process.cwd(), process.env.GITHUB_REF === 'refs/heads/main')) },
  // One three.js: the vendored packages must not bring a second copy (it would split TSL's state).
  resolve: { dedupe: ['three'] },
  server: { port: 5200, host: true, fs: { allow: ['.', 'vendor/assetgenerator/packages'] } },
  preview: { port: 5201 },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    // three.js in a chunk of its own: it changes only on an upgrade, so the browser keeps it cached.
    // The game, and the spell lab (spell-lab.html: every spell on a meadow, for looking at them).
    rolldownOptions: { input: { main: 'index.html', lab: 'spell-lab.html' }, output: { codeSplitting: { groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }] } } },
  },
});
