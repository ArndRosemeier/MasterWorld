/**
 * Each school's first spell (implementation plan C2): `node tools/shot/spells.mjs [out dir]` after `npm run build`
 * (and `npm run packs`: the wolves), SHOT_GPU=1 on the reference machine. One page: the hero 11 m from the wolves
 * out on the land at mid-morning, then for each school of magic its first spell is learned (the debug menu's
 * way, which opens the school and lifts the hero to its level), the mana filled, a wolf picked with Tab and the spell cast; the picture is taken
 * once the spell shows (in flight, bursting or flaring), the spells' drawing held still for it. JPEGs into
 * `<out dir>` (default `shots/spells/<date>-<commit>/`). A slow check (docs/CHECKS.md), well under 5 min.
 *
 * `SPELLS_AT=cellar`: the same down in the town's cellar, 8 m from the nearest goblin (spells must show below too:
 * the land leaves the frame there, the spells must not). Each shot also checks the spells are in the drawn scene.
 *
 * F3 in a fight with every school (C4): no shader is built for a spell once play has begun (the spells' one
 * shader is built just after the start, within the budget), and the shader monitor counts no violations.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { FIGHT, faceNearest, meet } from './acts.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
/** More of the page's query (SwiftShader in the cloud: `&trees=0` for a quicker load). */
const EXTRA = process.env.SPELLS_QUERY ?? '';
const gl = process.env.SET_GL !== '0';
const below = process.env.SPELLS_AT === 'cellar';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join(below ? 'shots/spells-cellar' : 'shots/spells', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?title=0&day=0&hour=10&weather=fair${gl ? '&gl' : ''}${below ? '&cellar=2&dweller=goblins' : ''}${EXTRA}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
// The first spell of every school, in the setting's order (the lowest level of the school).
const firsts = await page.evaluate(() => {
  const g = window.game, setting = g.setting;
  return setting.schools.map((k) => setting.abilities.filter((a) => a.school === k.id).sort((a, b) => (a.level ?? 1) - (b.level ?? 1))[0]?.id).filter(Boolean);
});
// The spells' shader is built just after the start, within the budget (F4).
await page.waitForFunction(() => window.game.spellView.entered, null, { timeout: TIMEOUT });
// Every first spell learned up front, the hero lifted to the highest one's level (fire and shadow come a level
// later, D58); the level ring is let play out before the first picture, so it is not taken for a spell.
await page.evaluate((ids) => { for (const id of ids) window.game.character.learnToUse(id); }, firsts);
await page.waitForFunction(() => window.game.spellView.ringing, null, { timeout: 10000 }).catch(() => {});
await page.waitForFunction(() => !window.game.spellView.ringing, null, { timeout: 30000 }).catch(() => {});
if (below) {
  // Up the ladder and down again once the spells are in the scene: the game starts below before they are built,
  // which is not how a hero comes down in play (the land leaves the frame then, and must not take the spells along).
  await page.evaluate(() => { const v = window.game.cellar; v.depart(); v.arrive(); });
  await page.waitForFunction(`!!${FIGHT}`, null, { timeout: 30000 });
  await faceNearest(page, 8);
} else await meet('wolves', 11)(page);
await page.waitForTimeout(2000);
/** The spells are in the drawn scene: their group and everything above it shown. */
const inScene = () => page.evaluate(() => { let o = window.game.spellView.group; const top = window.game.view.scene; while (o && o !== top) { if (!o.visible) return false; o = o.parent; } return o === top && top.visible; });

let failed = false;
const shaders = () => page.evaluate(() => { const m = window.shaders; return m ? { ...m.summary(), lines: m.violations(), built: m.events.filter((e) => e.phase === 'run').map((e) => e.what) } : null; });
// Casting builds no shader (F4).
const before = await shaders();
for (const [i, id] of firsts.entries()) {
  await page.evaluate((id) => {
    const g = window.game, h = g.character;
    g.spellView.frozen = false;
    h.mana = h.maxMana;
    h.health = h.maxHealth;
    h.cooldowns.clear();
  }, id);
  // The last spell's leftovers (smoke, a fading circle) gone first, so the picture is of this spell.
  await page.waitForFunction(() => { const s = window.game.spellView.shown; return !s.shots && !s.flashes && !s.motes; }, null, { timeout: 20000 }).catch(() => {});
  // Tab picks a foe (the fight leads once the hero is near the band).
  await page.waitForFunction(`!!${FIGHT}`, null, { timeout: TIMEOUT });
  await page.keyboard.press('Tab');
  // A spell on oneself (mend) may still be gathering from the last turn: wait for it to finish.
  let why = null;
  for (let tries = 0; tries < 40; tries++) {
    why = await page.evaluate((id) => window.game.useAbility(id), id);
    if (!why?.startsWith('You are casting')) break;
    await page.waitForTimeout(250);
  }
  if (why) { console.log(`${id}: ${why}`); failed = true; continue; }
  // Taken once the spell has left the hands: a bolt while it flies, anything else once gathering is over and it shows.
  const shown = await page.waitForFunction(`(() => {
    const g = window.game, s = g.spellView.shown, f = ${FIGHT}, def = g.setting.abilities.find((a) => a.id === '${id}');
    if (def.ops.some((o) => o.op === 'projectile')) return s.shots > 0;
    return (f ? f.fighting.recipes.castShare : g.alone.castShare) === null && s.flashes > 0;
  })()`, null, { timeout: 60000, polling: 'raf' }).then(() => true, () => false);
  await page.evaluate(() => { window.game.spellView.frozen = true; });
  const file = join(dir, `${String(i + 1).padStart(2, '0')}-${id}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 92, timeout: TIMEOUT });
  const seen = await inScene();
  const state = shown ? '' : await page.evaluate(`(() => { const f = ${FIGHT}, r = f ? f.fighting.recipes : window.game.alone; return JSON.stringify({ casting: r.casting?.def.id ?? null, left: r.casting?.left, shown: window.game.spellView.shown }); })()`);
  console.log(`${file}${shown ? '' : ` (the spell never showed: ${state})`}${seen ? '' : ' (the spells are not in the drawn scene)'}`);
  if (!shown || !seen) failed = true;
  await page.evaluate(() => { window.game.spellView.frozen = false; });
  await page.waitForTimeout(500);
}
const after = await shaders();
if (!after) { failed = true; console.log('F3: no shader monitor'); }
else {
  const spellBuilds = after.built.slice(before.built.length).filter((w) => /spell/i.test(w));
  console.log(`F3: ${after.violations} shader violations · ${after.run - before.run} builds while casting${spellBuilds.length ? ` · spell shaders built in play: ${spellBuilds.join(', ')}` : ''} · worst build ${after.worstMs.toFixed(1)} ms`);
  if (after.violations || spellBuilds.length) { failed = true; console.log(after.lines.join('\n')); }
}
if (errors.length) { failed = true; console.log(errors.join('\n')); }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
