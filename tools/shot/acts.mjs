/**
 * What a shot script does on the loaded page before it shoots (set.mjs, spells.mjs).
 */
const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);

/** The hero a few metres from a group of the wild (`kind`), facing it, once it is built near them. */
export const meet = (kind, d) => async (page) => {
  await page.evaluate((kind) => {
    const g = window.game, t = g.wild.territories.find((t) => t.kind === kind);
    g.player.teleport(t.x + t.r + 20, undefined, t.z, Math.PI / 2);
  }, kind);
  await page.waitForFunction((kind) => !!window.game.wild.sight(kind), kind, { timeout: TIMEOUT });
  await page.evaluate(([kind, d]) => {
    const g = window.game, seen = g.wild.sight(kind), p = g.player.walker.pos;
    const l = Math.max(1, Math.hypot(p.x - seen.x, p.z - seen.z)), x = seen.x + (p.x - seen.x) / l * d, z = seen.z + (p.z - seen.z) / l * d;
    g.player.teleport(x, undefined, z, Math.atan2(x - seen.x, z - seen.z));
  }, [kind, d]);
};

/**
 * The hero `d` metres from (x, z), facing it, on the side where no tree trunk stands between the camera
 * (`zoom` m behind the hero) and it; the camera close behind, looking `pitch` up. Wait first for the trunks
 * round there to be known (a teleport near, a moment).
 */
export const standClear = (page, at, d, { zoom = 2.2, pitch = -0.08 } = {}) => page.evaluate(([at, d, zoom, pitch]) => {
  const g = window.game, trunks = g.trunks;
  const clear = (a) => {
    for (let s = 0; s <= d + zoom; s += 0.5) if (trunks?.blocks(at.x + Math.cos(a) * s, at.z + Math.sin(a) * s, 0.5)) return false;
    return true;
  };
  let a = 0;
  for (let k = 0; k < 16; k++) if (clear((k / 16) * Math.PI * 2)) { a = (k / 16) * Math.PI * 2; break; }
  const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
  g.player.teleport(x, undefined, z, Math.atan2(x - at.x, z - at.z));
  const cam = g.player.heroCam;
  cam.yaw = g.player.walker.yaw;
  cam.pitch = pitch;
  cam.zoom = zoom;
  return { x, z };
}, [at, d, zoom, pitch]);

/** A hurt traveller (C10) made by the hero's way out west of the start town: its decision, or null. */
export const hurtTraveller = async (page) => {
  await page.evaluate(() => {
    const g = window.game, d = g.towns.every[0].town.decision;
    g.player.teleport(d.x - d.radius - 260, undefined, d.z - 600, Math.PI / 2);
  });
  await page.waitForTimeout(2500);
  return page.evaluate(() => { const m = window.game.situationNow('hurt-traveller'); return m ? { id: m.decision.id, ...m.decision } : null; });
};

/** A farm raided now (C6, C10): what the debug menu says, and its barn (where the smoke rises), or null. */
export const raidFarm = async (page) => {
  const said = await page.evaluate(() => window.game.storyEvent('farm-raid'));
  const barn = await page.evaluate(() => {
    const g = window.game, e = g.log.filter((d) => d.kind === 'event' && d.paddock !== undefined).at(-1);
    if (!e) return null;
    const t = g.towns.get(e.town).town, pd = t.plan.paddocks[e.paddock], b = t.plan.buildings[t.plan.farms[pd.farm].barn];
    const [cx, cz] = t.plan.centre;
    return { x: b.cx, z: b.cz, centre: { x: cx, z: cz } };
  });
  return { said, barn };
};
