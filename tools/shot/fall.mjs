/**
 * Falling and waking (app/fallen.ts): `node tools/shot/fall.mjs` after `npm run build` and `npm run packs`.
 * One page (the start town's cellar by default): the hero is struck down (no health), lies fallen, wakes carried to
 * the temple or inn, and then must mend like anyone: health climbs while standing, faster sitting, and the most
 * health is unchanged. Time is counted in drawn frames (the game steps at most 0.1 s a frame), so a slow software
 * renderer (the cloud container's) gives the same numbers as a GPU. `FALL_QUERY` changes the page's query,
 * `FALL_LOG=1` prints the page's console. A slow check (docs/CHECKS.md).
 */
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const WAIT = Number(process.env.FALL_WAIT ?? 600000);
const QUERY = process.env.FALL_QUERY ?? '&cellar=2&dweller=goblins';
const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
if (process.env.FALL_LOG) page.on('console', (m) => console.log(`[page] ${m.text()}`.slice(0, 200)));
await page.addInitScript(() => { window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
await page.goto(`${base}?title=0&day=0&hour=12&weather=fair&gl${QUERY}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.click('canvas', { position: { x: 160, y: 90 } }).catch(() => {});

let failed = false;
const fail = (line) => { failed = true; console.log(`FAIL ${line}`); };
const sheet = () => page.evaluate(() => {
  const g = window.game, h = g.character, f = g.cellars?.fightBelow ?? g.wild?.encounters.find((e) => e.leading) ?? null;
  return { frames: window.__frames, health: +h.health.toFixed(2), max: h.maxHealth, alive: h.alive, resting: h.resting, fighting: f ? f.delve.den.fighting.length : null, puppet: !!g.player.puppet, inside: g.rooms?.inside ?? null, wards: !!document.querySelector('.fallen') };
});
const say = async (what) => { const s = await sheet(); console.log(what, JSON.stringify(s)); return s; };
/** Wait for `test` in the page, in real time (software rendering is slow). */
const until = (test, arg) => page.waitForFunction(test, arg, { timeout: WAIT, polling: 500 }).then(() => true, () => false);
/** Wait for `n` more drawn frames. */
const frames = async (n) => { const f0 = (await sheet()).frames; await until((a) => window.__frames >= a, f0 + n); };

await say('start');
const max0 = (await sheet()).max;
await page.evaluate(() => { window.game.character.health = 0; });
if (!(await until(() => window.game.character.alive))) fail('the hero did not wake');
const woke = await say('woke');
if (woke.max !== max0) fail(`the most health changed: ${max0} -> ${woke.max}`);
// Carried in: the walk in ends, the wards are light again.
if (!(await until(() => !window.game.player.puppet && !document.querySelector('.fallen')))) fail('the carrying never ended');
await frames(20);
const a = await say('settled');
await frames(300);
const b = await say('300 frames later');
// 300 frames of at most 0.1 s: standing mends 0.3 health a second, so at least 0.3 health once frames run at 10 fps.
if (!(b.health > a.health)) fail(`standing, health did not mend (${a.health} -> ${b.health})`);
await page.keyboard.press('KeyX');
await frames(20);
const sat = await say('sat');
if (!sat.resting) fail('the rest key did not sit the hero down');
await frames(300);
const c = await say('sat, 300 frames later');
if (!(c.health > sat.health + 3)) fail(`resting, health did not mend (${sat.health} -> ${c.health})`);
if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
await server.close();
console.log(failed ? 'FALL FAILED' : 'fall ok');
process.exit(failed ? 1 : 0);
