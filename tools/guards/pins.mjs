/**
 * Submodule pins only move forward (plan floor F6): CI fails when a change moves a submodule (vendor/assetgenerator)
 * to a commit that does not descend from the base branch's pin. A stale submodule in a worktree, committed by
 * accident, once put main back on an older AssetGenerator (#131, fixed by #133).
 *
 * `node tools/guards/pins.mjs [base]`: base defaults to origin/<GITHUB_BASE_REF> in a pull request, else the
 * commit before HEAD (a push to main). Fetches the pins into the submodule when its clone lacks them.
 */
import { execFileSync } from 'node:child_process';

const git = (args, cwd = '.') => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ok = (args, cwd) => { try { git(args, cwd); return true; } catch { return false; } };

const base = process.argv[2] ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'HEAD^');
if (process.env.GITHUB_BASE_REF && !ok(['rev-parse', '--verify', base])) git(['fetch', '--no-tags', 'origin', process.env.GITHUB_BASE_REF]);

const paths = ok(['config', '-f', '.gitmodules', '--get-regexp', 'path'])
  ? git(['config', '-f', '.gitmodules', '--get-regexp', 'path']).split('\n').map((l) => l.split(' ')[1])
  : [];
const pin = (ref, path) => { const m = /\b([0-9a-f]{40})\b/.exec(ok(['ls-tree', ref, path]) ? git(['ls-tree', ref, path]) : ''); return m ? m[1] : null; };

let failed = false;
for (const path of paths) {
  const was = pin(base, path), now = pin('HEAD', path);
  if (!was || !now || was === now) { console.log(`${path}: ${now ? now.slice(0, 7) : 'none'} (unchanged)`); continue; }
  for (const c of [was, now]) if (!ok(['cat-file', '-e', `${c}^{commit}`], path)) ok(['fetch', '--no-tags', 'origin', c], path);
  if (ok(['merge-base', '--is-ancestor', was, now], path)) { console.log(`${path}: ${was.slice(0, 7)} -> ${now.slice(0, 7)} (forward)`); continue; }
  failed = true;
  console.error(`${path}: ${was.slice(0, 7)} -> ${now.slice(0, 7)} does not descend from the base's pin. A stale submodule? Run \`git submodule update\` (or move it forward) before committing.`);
}
process.exit(failed ? 1 : 0);
