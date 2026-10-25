import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/** Package asset folders served under a path of their own (`/humanoid/…`): in dev from the package, in the build copied. */
const PACKAGE_ASSETS: Record<string, string> = { humanoid: 'vendor/assetgenerator/packages/humanoid/assets' };

function packageAssets(): Plugin {
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  return {
    name: 'package-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]);
        for (const [name, dir] of Object.entries(PACKAGE_ASSETS)) {
          if (!url.startsWith(`/${name}/`)) continue;
          const file = path.resolve(dir, url.slice(name.length + 2));
          if (!file.startsWith(path.resolve(dir)) || !fs.existsSync(file)) break;
          res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
          fs.createReadStream(file).pipe(res);
          return;
        }
        next();
      });
    },
    generateBundle() {
      for (const [name, dir] of Object.entries(PACKAGE_ASSETS)) {
        for (const f of files(dir)) this.emitFile({ type: 'asset', fileName: `${name}/${path.relative(dir, f).split(path.sep).join('/')}`, source: fs.readFileSync(f) });
      }
    },
  };
}

export default defineConfig({
  plugins: [packageAssets()],
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
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }] } } },
  },
});
