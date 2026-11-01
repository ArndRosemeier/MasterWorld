/**
 * Touchable ground against drawn ground in the running game (a "floating hero / grass" report):
 * `node tools/shot/groundprobe.mjs "<?query with seed, pos, look>" out.png` after a build (SHOT_GPU=1 on a GPU).
 * Loads the spot, waits GROUND_SETTLE ms (default 15000), then at the hero and on rings round it (2, 5, 10, 20 m)
 * reads, per point: the drawn terrain mesh (the shown chunks' triangles, as the GPU has them), the walker's ground
 * (`world.height`, what the hero stands on), the land's own height (`terrain.height`) and the grass mask's ground
 * (what the blades are rooted on). Prints the worst gaps and where, and takes a shot.
 */
import { launch } from './launch.mjs';
const query = process.argv[2], out = process.argv[3];
const { server, base, browser } = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.goto(base + query);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 900000 });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.waitForTimeout(Number(process.env.GROUND_SETTLE ?? 15000));
const res = await page.evaluate(() => {
  const g = window.game, w = g.player.walker, p = w.pos;
  // Every shown terrain chunk's triangles by square of 8 m, in world coordinates.
  const chunks = [];
  g.view.scene.traverse((o) => {
    const m = /^terrain (\d+):(-?\d+):(-?\d+)$/.exec(o.name || '');
    if (!m || !o.visible || !o.geometry?.index) return;
    const size = 128 * 2 ** Number(m[1]), ox = Number(m[2]) * size, oz = Number(m[3]) * size;
    chunks.push({ level: Number(m[1]), ox, oz, size, pos: o.geometry.attributes.position.array, idx: o.geometry.index.array });
  });
  const mesh = (x, z) => {
    let best = null;
    for (const c of chunks) {
      if (x < c.ox || x >= c.ox + c.size || z < c.oz || z >= c.oz + c.size) continue;
      for (let t = 0; t < c.idx.length; t += 3) {
        const a = c.idx[t] * 3, b = c.idx[t + 1] * 3, d = c.idx[t + 2] * 3;
        const ax = c.pos[a] + c.ox, az = c.pos[a + 2] + c.oz, bx = c.pos[b] + c.ox, bz = c.pos[b + 2] + c.oz, cx = c.pos[d] + c.ox, cz = c.pos[d + 2] + c.oz;
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (!det) continue;
        const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, wc = 1 - wa - wb;
        if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
        const y = wa * c.pos[a + 1] + wb * c.pos[b + 1] + wc * c.pos[d + 1];
        // A skirt or an overhang may stack triangles: the highest is what is seen from above.
        if (best === null || y > best.y) best = { y, level: c.level };
      }
    }
    return best;
  };
  // The grass mask as the blades read it: ground height (R) read bilinear at world (x, z), null outside it.
  const gm = g.grass?.mask?.mask;
  const grassGround = (x, z) => {
    if (!gm) return null;
    const o = gm.origin.value, fx = (x - o.x) / gm.side * gm.res - 0.5, fz = (z - o.y) / gm.side * gm.res - 0.5, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    if (i < 0 || j < 0 || i + 1 >= gm.res || j + 1 >= gm.res) return null;
    const q = (a, b) => gm.data[((j + b) * gm.res + i + a) * 4];
    return q(0, 0) * (1 - u) * (1 - v) + q(1, 0) * u * (1 - v) + q(0, 1) * (1 - u) * v + q(1, 1) * u * v;
  };
  const rows = [];
  const at = (x, z, tag) => {
    const m = mesh(x, z), walk = w.world.height(x, z), land = g.terrain.height(x, z), gg = grassGround(x, z);
    rows.push({ tag, x: +x.toFixed(1), z: +z.toFixed(1), mesh: m ? +m.y.toFixed(3) : null, level: m?.level ?? null, walk: +walk.toFixed(3), land: +land.toFixed(3), grass: gg === null ? null : +gg.toFixed(3), floor: w.world.floor?.(x, z, walk) ?? null });
  };
  at(p.x, p.z, 'hero');
  for (const r of [2, 5, 10, 20]) for (let a = 0; a < 16; a++) at(p.x + Math.cos(a * Math.PI / 8) * r, p.z + Math.sin(a * Math.PI / 8) * r, `r${r}`);
  // And a grid, 1 m apart, 24 m each way.
  for (let dz = -24; dz <= 24; dz++) for (let dx = -24; dx <= 24; dx++) at(Math.floor(p.x) + dx + 0.5, Math.floor(p.z) + dz + 0.5, 'grid');
  const seen = rows.filter((r) => r.mesh !== null);
  const worst = (key) => seen.filter((r) => r[key] !== null).map((r) => ({ ...r, gap: +(r[key] - r.mesh).toFixed(3) })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 6);
  return { hero: { x: p.x, y: p.y, z: p.z, mode: w.mode }, seed: g.terrain.seed, chunks: chunks.map((c) => `${c.level}@${c.ox},${c.oz}`).join(' '), points: rows.length, noMesh: rows.length - seen.length, noGrass: rows.filter((r) => r.grass === null).length, heroRow: rows[0], worstWalk: worst('walk'), worstGrass: worst('grass'), worstLand: worst('land') };
});
console.log(JSON.stringify(res, null, 1));
await page.screenshot({ path: out });
await browser.close(); await server.close();
