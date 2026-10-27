/**
 * Time budgets for CI steps (docs/CHECKS.md), so CI does not creep back to minutes unnoticed.
 *
 *   node tools/guards/budget.mjs <warn s> <fail s> -- <command...>
 *
 * Runs the command, then prints how long it took. Past `warn` seconds it adds a GitHub warning (shown on the
 * run's summary page) naming the step; past `fail` seconds it fails, even if the command passed. A failing
 * command fails as before.
 */
import { spawn } from 'node:child_process';

/** The verdict for a step that took `seconds`: ok, warn or fail. */
export function verdict(seconds, warn, fail) {
  return seconds > fail ? 'fail' : seconds > warn ? 'warn' : 'ok';
}

async function main() {
  const at = process.argv.indexOf('--');
  const [warn, fail] = process.argv.slice(2, at).map(Number);
  const cmd = process.argv.slice(at + 1);
  if (at < 0 || !(warn > 0) || !(fail >= warn) || !cmd.length) {
    console.error('usage: node tools/guards/budget.mjs <warn s> <fail s> -- <command...>');
    process.exit(2);
  }
  const t0 = performance.now();
  const code = await new Promise((done) => spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' }).on('close', done));
  const s = (performance.now() - t0) / 1000, name = cmd.join(' ');
  const v = verdict(s, warn, fail);
  console.log(`budget: \`${name}\` took ${s.toFixed(1)} s (warn at ${warn} s, fail at ${fail} s)`);
  if (v === 'warn') console.log(`::warning title=Slow step::\`${name}\` took ${s.toFixed(0)} s, past its ${warn} s warning (fails at ${fail} s). See docs/CHECKS.md.`);
  if (v === 'fail') console.log(`::error title=Step over budget::\`${name}\` took ${s.toFixed(0)} s, past its ${fail} s budget. See docs/CHECKS.md.`);
  process.exit(code !== 0 ? code ?? 1 : v === 'fail' ? 1 : 0);
}

if (import.meta.main) await main();
