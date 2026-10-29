/**
 * What a shot script does on the loaded page before it shoots (set.mjs, spells.mjs).
 */
const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);

/** The fight the hero is in now (out on the land, or down in the cellar), as page code. */
export const FIGHT = `(() => { const g = window.game; return g.cellars?.fightBelow ?? g.wild?.encounters.find((e) => e.leading) ?? null; })()`;

/** The hero `d` m (at most where they stand) from the nearest foe of the fight, facing it; that foe kept as `window.__hitWho`. */
export const faceNearest = (page, d) => page.evaluate(`(() => {
  const g = window.game, f = ${FIGHT}, O = f.spellFrame().offset, p = g.player.walker.pos;
  const c = f.delve.den.alive.reduce((a, b) => Math.hypot(b.x + O.x - p.x, b.z + O.z - p.z) < Math.hypot(a.x + O.x - p.x, a.z + O.z - p.z) ? b : a);
  const cx = c.x + O.x, cz = c.z + O.z, l = Math.max(0.01, Math.hypot(p.x - cx, p.z - cz)), d = Math.min(${d}, l);
  const x = cx + (p.x - cx) / l * d, z = cz + (p.z - cz) / l * d;
  g.player.teleport(x, c.y + O.y, z, Math.atan2(x - cx, z - cz));
  window.__hitWho = c;
})()`);

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
 * (`zoom` m behind the hero) and it (or its edge, `r` m out); the camera close behind, looking `pitch` up, turned `side` rad off the
 * hero's back (so the hero does not hide what lies before them). `avoid`: what else must not stand in the
 * way (circles {x, z, r}: other buildings) or right by the hero and the camera (fences: closed lines, flat x, z, x, z, ...).
 * Wait first for the trunks round there to be known (a teleport near, a moment).
 */
export const standClear = (page, at, d, { zoom = 2.2, pitch = -0.08, side = 0, avoid = {} } = {}) => page.evaluate(([at, d, zoom, pitch, side, avoid]) => {
  const g = window.game, trunks = g.trunks, circles = avoid.circles ?? [], fences = avoid.fences ?? [];
  const nearFence = (x, z) => fences.some((f) => f.some((_, i) => {
    if (i % 2) return false;
    const ax = f[i], az = f[i + 1], bx = f[(i + 2) % f.length], bz = f[(i + 3) % f.length], ux = bx - ax, uz = bz - az, l = ux * ux + uz * uz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / l));
    return Math.hypot(x - ax - ux * t, z - az - uz * t) < 2;
  }));
  // How much stands in the way looking from angle `a` (0: nothing), from the edge of what is looked at (`at.r`).
  const blocked = (a) => {
    let n = 0;
    for (let s = at.r ?? 0; s <= d + zoom; s += 0.5) {
      const x = at.x + Math.cos(a) * s, z = at.z + Math.sin(a) * s;
      if (trunks?.blocks(x, z, 0.5) || circles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) n++;
    }
    if (nearFence(at.x + Math.cos(a) * d, at.z + Math.sin(a) * d) || nearFence(at.x + Math.cos(a) * (d + zoom), at.z + Math.sin(a) * (d + zoom))) n += 100;
    return n;
  };
  // The first clear side; none clear: the least blocked.
  let a = 0, least = Infinity;
  for (let k = 0; k < 32 && least > 0; k++) { const b = blocked((k / 32) * Math.PI * 2); if (b < least) { least = b; a = (k / 32) * Math.PI * 2; } }
  const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
  g.player.teleport(x, undefined, z, Math.atan2(x - at.x, z - at.z));
  const cam = g.player.heroCam;
  cam.yaw = g.player.walker.yaw + side;
  cam.pitch = pitch;
  cam.zoom = zoom;
  return { x, z };
}, [at, d, zoom, pitch, side, avoid]);

/** A hurt traveller (C10) made by the hero's way out west of the start town: its decision, or null. */
export const hurtTraveller = async (page) => {
  await page.evaluate(() => {
    const g = window.game, d = g.towns.every[0].town.decision;
    g.player.teleport(d.x - d.radius - 260, undefined, d.z - 600, Math.PI / 2);
  });
  await page.waitForTimeout(2500);
  return page.evaluate(() => { const m = window.game.situationNow('hurt-traveller'); return m ? { id: m.decision.id, ...m.decision } : null; });
};

/** A farm raided now (C6, C10): what the debug menu says, and its barn (where the smoke rises; what could hide it), or null. */
export const raidFarm = async (page) => {
  const said = await page.evaluate(() => window.game.storyEvent('farm-raid'));
  const barn = await page.evaluate(() => {
    const g = window.game, e = g.log.filter((d) => d.kind === 'event' && d.paddock !== undefined).at(-1);
    if (!e) return null;
    const t = g.towns.get(e.town).town, pd = t.plan.paddocks[e.paddock], b = t.plan.buildings[t.plan.farms[pd.farm].barn];
    const [cx, cz] = t.plan.centre;
    // What could hide the barn (the farm's other buildings, any near) and the fences not to stand in.
    const circles = t.plan.buildings.filter((o) => o.id !== b.id && Math.hypot(o.cx - b.cx, o.cz - b.cz) < 80).map((o) => ({ x: o.cx, z: o.cz, r: Math.hypot(o.hu, o.hv) + 1 }));
    const fences = t.plan.paddocks.filter((p) => Math.hypot(p.poly[0] - b.cx, p.poly[1] - b.cz) < 150).map((p) => p.poly);
    return { x: b.cx, z: b.cz, r: Math.hypot(b.hu, b.hv), centre: { x: cx, z: cz }, avoid: { circles, fences } };
  });
  return { said, barn };
};
