/**
 * What a shot script does on the loaded page before it shoots (set.mjs, spells.mjs).
 */
const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);

/** The hero a few metres from a group of the wild (`kind`), facing it, once it is built near them. */
export const meet = (kind, d) => async (page) => {
  await page.evaluate((kind) => {
    const g = window.game, t = g.wild.territories.find((t) => t.def.id === kind);
    g.player.teleport(t.x + t.r + 20, undefined, t.z, Math.PI / 2);
  }, kind);
  await page.waitForFunction((kind) => !!window.game.wild.sight(kind), kind, { timeout: TIMEOUT });
  await page.evaluate(([kind, d]) => {
    const g = window.game, seen = g.wild.sight(kind), p = g.player.walker.pos;
    const l = Math.max(1, Math.hypot(p.x - seen.x, p.z - seen.z)), x = seen.x + (p.x - seen.x) / l * d, z = seen.z + (p.z - seen.z) / l * d;
    g.player.teleport(x, undefined, z, Math.atan2(x - seen.x, z - seen.z));
  }, [kind, d]);
};
