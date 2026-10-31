// Lists stale extra worktrees of this repository and removes them with --yes.
// A worktree is stale when nothing in it changed for --hours (default 24),
// it has no changes to tracked files, and every commit it holds is on GitHub
// (pushed, or landed on origin/main under the same subject as a squash merge).
// Untracked scratch (shots, probe scripts, logs) is thrown away with it.
//   node tools/worktrees/clean.mjs            list what would go
//   node tools/worktrees/clean.mjs --yes      remove it
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const remove = args.includes("--yes");
const hoursArg = args.find((a) => a.startsWith("--hours="));
const hours = hoursArg ? Number(hoursArg.slice(8)) : 24;

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const lines = (s) => (s ? s.split("\n") : []);

const root = git(process.cwd(), "rev-parse", "--path-format=absolute", "--git-common-dir").replace(/[\/]\.git$/, "");
try { git(root, "fetch", "-q", "origin"); } catch { console.warn("fetch failed: using the last known origin"); }
const mainSubjects = new Set(lines(git(root, "log", "origin/main", "--format=%s", "-n", "2000")));

const worktrees = git(root, "worktree", "list", "--porcelain").split("\n\n")
  .map((block) => block.match(/^worktree (.+)$/m)?.[1]).filter(Boolean).slice(1); // first is the main checkout

function lastChange(dir) {
  const gitDir = git(dir, "rev-parse", "--absolute-git-dir");
  const times = [dir, join(gitDir, "index"), join(gitDir, "logs", "HEAD")]
    .filter((p) => existsSync(p)).map((p) => statSync(p).mtimeMs);
  return Math.max(...times);
}

function verdict(dir) {
  if (!existsSync(dir)) return "gone";
  if (!existsSync(join(dir, ".git"))) return "stale"; // half-removed: only the folder is left
  const idle = (Date.now() - lastChange(dir)) / 3.6e6;
  if (idle < hours) return `in use (changed ${idle.toFixed(1)} h ago)`;
  if (git(dir, "status", "--porcelain", "--untracked-files=no", "--ignore-submodules=all")) return "keep: changed tracked files";
  const unpushed = lines(git(dir, "log", "HEAD", "--not", "--remotes", "--format=%s"));
  const lost = unpushed.filter((s) => !mainSubjects.has(s) && !mainSubjects.has(s.replace(/ \(#\d+\)$/, "")));
  if (lost.length) return `keep: ${lost.length} unpushed commit(s)`;
  return "stale";
}

let count = 0;
for (const dir of worktrees) {
  const v = verdict(dir);
  console.log(`${v.padEnd(34)} ${dir}`);
  if (v !== "stale" || !remove) continue;
  try { git(root, "worktree", "remove", "--force", "--force", dir); } catch { /* locked or half-gone: delete below */ }
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  count++;
}
git(root, "worktree", "prune");
console.log(remove ? `removed ${count} worktree(s)` : "dry run: add --yes to remove the stale ones");
