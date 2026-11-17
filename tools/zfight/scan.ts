/**
 * Z-fighting over the whole world's built geometry (`npm run zfight [-- report.md]`): every generator of
 * things that stand (ruined towers and the warden's keep, barrows, holds, the camps' structures, the places and
 * sights the VGM lays out, cave mouths, ships, bridges, remains, every kind of dungeon's shell and props as the
 * game draws them, formed caves with their dressing, and the towns' buildings, open houses, guild houses as the
 * hero opens them, walls, fixtures, fences and harbours, and each town's pieces together) is built from seeds
 * and scanned with world/zFight.ts for faces that lie in one plane, face the same way and overlap. A slow
 * check, run on demand (about 3 min); the tower is held to none in npm test (test/zFight.test.ts).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePack } from '@futuremagic/props';
import { parseSeed } from '@futuremagic/core';
import { buildingMesh, fixtureMesh, gangplankMesh, harbourMesh, planShip, propMesh, shipMesh, wallMesh, type BuildingMesh, type ShipKind } from '@futuremagic/settlement';
import { classic } from '../../src/setting/classic/index';
import type { SightShape } from '../../src/setting/contract';
import { firstDecisions, startPlace } from '../../src/vgm/builder';
import { regionDecisions, walkFrontier } from '../../src/vgm/frontier';
import { settlementOf, type DungeonTemplate, type RegionDecision, type SightDecision } from '../../src/world/decisions';
import { barrowMesh, sealedBarrowMesh } from '../../src/world/dungeon/barrowMesh';
import { outlineCellar } from '../../src/world/dungeon/cellar';
import { cellarMeshes } from '../../src/world/dungeon/cellarMesh';
import { caveFeatures, keepSpots } from '../../src/world/dungeon/caveFeatures';
import { CaveSpace, caveField, caveShell } from '../../src/world/dungeon/caveRock';
import { DungeonSpace } from '../../src/world/dungeon/space';
import { caveSeed } from '../../src/world/dungeon/torches';
import { remainsMesh } from '../../src/world/dungeon/remainsMesh';
import { towerMesh, towerSize } from '../../src/world/dungeon/towerMesh';
import { testDecision, testHouse } from '../../src/world/dungeon/variety';
import { holdMesh } from '../../src/world/holdMesh';
import { warden } from '../../src/world/holdRock';
import { layOutSight, layOutSite, type Place } from '../../src/world/sites';
import { Terrain } from '../../src/world/terrain';
import { mergeMeshes, openHouse } from '../../src/world/townMesh';
import { LEVEL } from '../../src/world/dungeon/meshKit';
import { seenFights, zFights, zFightSpots } from '../../src/world/zFight';
import { fortifiedBridgeMesh, planBridge } from '../../src/world/structures/bridge';
import { greatRuinMesh, planGreatRuin } from '../../src/world/structures/ruin';
import { bridgeLand, ruinLand } from '../../src/world/structures/land';
import { bridgeMesh, townBridges } from '../../src/world/bridges';
import { RoadNet } from '../../src/world/roads';
import { guildHouses, guildSigns } from '../../src/game/guilds';
import { caveMouth, CLIFF_RISE } from '../../src/world/dungeon/caveMouth';
import { runCaveJob } from '../../src/world/cave/job';
import type { PartMesh } from '../../src/world/cave/parts';
import { floorUnder } from '../../src/world/cave/waterMesh';

type Mesh = BuildingMesh;
/** Per generator: meshes and triangles scanned; fighting pairs that show, their area; pairs that do not (drawn twice alike, or inside a solid). */
interface Row { what: string; meshes: number; tris: number; pairs: number; area: number; quiet: number; spots: string[] }
const rows = new Map<string, Row>();

/** Scans one mesh and adds what it finds to its generator's row. */
function scan(what: string, m: Mesh, where = '', ground?: (x: number, z: number, y: number) => number | null): void {
  const r = rows.get(what) ?? { what, meshes: 0, tris: 0, pairs: 0, area: 0, quiet: 0, spots: [] };
  rows.set(what, r);
  const all = zFights(m, { ground }), f = seenFights(all);
  r.meshes++; r.tris += m.index.length / 3; r.pairs += f.length; r.quiet += all.length - f.length;
  for (const s of zFightSpots(f, 1)) {
    r.area += s.area;
    if (r.spots.length < 12) r.spots.push(`${where} at (${s.at.map((v) => v.toFixed(2)).join(', ')}) facing (${s.normal.map((v) => v.toFixed(2)).join(', ')}): ${(s.area * 1e4).toFixed(0)} cm², ${s.pairs} pairs`);
  }
}

/**
 * Fights between pieces drawn side by side (a town's houses, its fixtures, props, wall, harbour and bridges): the
 * pieces put together in one frame, and only the pairs of two different pieces counted (each piece's own are its row).
 */
function scanBetween(what: string, parts: readonly Mesh[], where: string, ground?: (x: number, z: number, y: number) => number | null): void {
  const r = rows.get(what) ?? { what, meshes: 0, tris: 0, pairs: 0, area: 0, quiet: 0, spots: [] };
  rows.set(what, r);
  const ends: number[] = [];
  let n = 0;
  for (const p of parts) ends.push((n += p.index.length / 3));
  const piece = (t: number) => ends.findIndex((e) => t < e);
  const all = zFights(mergeMeshes(parts), { ground }).filter((f) => piece(f.a) !== piece(f.b)), f = seenFights(all);
  r.meshes += parts.length; r.tris += n; r.pairs += f.length; r.quiet += all.length - f.length;
  for (const s of zFightSpots(f, 1)) {
    r.area += s.area;
    if (r.spots.length < 12) r.spots.push(`${where} at (${s.at.map((v) => v.toFixed(2)).join(', ')}) facing (${s.normal.map((v) => v.toFixed(2)).join(', ')}): ${(s.area * 1e4).toFixed(0)} cm², ${s.pairs} pairs`);
  }
}

/** A formed cave's part (no texture place) as a building mesh, to be put together with the rock. */
const asMesh = (p: PartMesh): Mesh => ({ ...p, uv: new Float32Array((p.position.length / 3) * 2) });

// The props as the game draws them in dungeons and remains: AssetGenerator's models (render/dungeon/props.ts), not the
// kit's stand-ins.
const models = decodePack(readFileSync(new URL('../../public/props/cellar.fmpk', import.meta.url)));
const t0 = performance.now();
const slope = (x: number, z: number) => -x * 0.2 + Math.sin(z * 0.6) * 0.3;
for (let seed = 1; seed <= 12; seed++) {
  scan('ruined tower (dungeon)', towerMesh(towerSize(14, 16, 4), seed), `seed ${seed}`, LEVEL);
  scan("warden's keep (half-ruined tower)", towerMesh({ half: 5, depth: 10, storeys: 3 }, seed, slope), `seed ${seed}`, slope);
  scan('barrow', barrowMesh(seed, slope), `seed ${seed}`, slope);
  scan('sealed barrow', sealedBarrowMesh(seed, slope), `seed ${seed}`, slope);
}
for (let seed = 1; seed <= 4; seed++) scan('hold', holdMesh(seed), `seed ${seed}`, LEVEL);
// The camps' memorable structures (D69, Z4), each on its own land.
for (let seed = 1; seed <= 12; seed++) {
  const land = bridgeLand(seed);
  scan('fortified bridge (camp)', fortifiedBridgeMesh(planBridge(classic.structures!, seed, land.ground), land.ground), `seed ${seed}`, land.ground);
}
for (let seed = 1; seed <= 8; seed++) {
  const land = ruinLand(seed);
  scan('great ruin (camp)', greatRuinMesh(planGreatRuin(classic.structures!, seed, land.ground), land.ground), `seed ${seed}`, land.ground);
}
scan('hold warden', warden(), '', LEVEL);
for (const grave of [false, true]) for (let i = 0; i < 4; i++) scan(grave ? 'remains: grave' : 'remains: pack', remainsMesh({ grave, seed: `s${i}` }, models), `seed s${i}`, LEVEL);
const places: Place[] = ['camp', 'ruin', 'barrows'];
for (const place of places) for (let i = 0; i < 6; i++) {
  const d = { kind: 'region', id: `r${i}`, seed: 40 + i, site: { x: 3, z: -2, yaw: 0.7, r: 16 } } as unknown as RegionDecision;
  const l = layOutSite(d, place, slope);
  if (!l) continue;
  const [ox, oy, oz] = l.origin;
  scan(`site: ${place}`, l.mesh, `seed ${40 + i}`, (x, z) => slope(x + ox, z + oz) - oy);
}
const shapes: SightShape[] = ['stones', 'waystone', 'cairn', 'stash'];
for (const shape of shapes) for (let i = 0; i < 6; i++) {
  const d: SightDecision = { kind: 'sight', id: `s${i}`, sight: shape, x: -4, z: 5, yaw: 1.1, seed: 70 + i, at: 0 };
  const l = layOutSight(d, shape, slope), [ox, oy, oz] = l.origin;
  scan(`sight: ${shape}`, l.mesh, `seed ${70 + i}`, (x, z) => slope(x + ox, z + oz) - oy);
}
for (const kind of Object.keys(classic.dungeons) as DungeonTemplate[]) {
  const lore = classic.dungeons[kind];
  if (!lore) continue;
  for (let i = 0; i < 12; i++) {
    const c = outlineCellar(testDecision(i, 7, kind), kind === 'cellar' ? testHouse(i) : { kind, hu: 3, hv: 3, name: `the ${kind}` }, lore);
    // Its shell (a cave's carved rock, as app/cellars.ts makes it), props and doors together: a prop's foot lies on
    // the floor, and the floor hides it.
    const m = cellarMeshes(c, models), parts = [m.shell, m.props, ...m.doors.map((d) => d.mesh)];
    let space = new DungeonSpace(c.layout);
    if (c.form.space.carved) {
      const seed = caveSeed(c), feat = caveFeatures(c.layout, seed, keepSpots(c)), field = caveField(c.layout, seed, feat);
      parts.push(caveShell(field, c.layout, seed, feat));
      space = new CaveSpace(c.layout, field, feat);
    }
    scan(`dungeon: ${kind}`, mergeMeshes(parts), `case ${i}`, (x, z, y) => space.floorAt(x, z, y));
  }
}
// The cave mouths on the land (a hillside's and a cliff's), as app/cellars.ts lays them.
const cliff = (x: number, z: number) => slope(x, z) + (z < -12 ? CLIFF_RISE + 6 : 0);
for (let seed = 1; seed <= 8; seed++) {
  scan('cave mouth: hillside', caveMouth(seed, slope, false).mesh, `seed ${seed}`, slope);
  scan('cave mouth: cliff', caveMouth(seed, cliff, true).mesh, `seed ${seed}`, cliff);
}
// The ships in harbour and at sea, the boats, wrecks and the gangplank (render/ships.ts).
for (const kind of ['ship', 'boat'] as ShipKind[]) for (let seed = 1; seed <= 6; seed++) for (const sails of ['furled', 'set'] as const) {
  scan(`${kind} (${sails})`, shipMesh(planShip(seed, kind), 0, 0, 1, 0, 0, [0, 0, 0], sails, true), `seed ${seed}`);
}
scan('gangplank', gangplankMesh(6), '');
// The formed caves (phase K): each rock's carved shell with its formations, loose stones, crystals and mine fittings.
const formedRocks = classic.caves ? classic.caves.rocks.map((r) => r.id) : [];
for (const rock of formedRocks) for (let seed = 1; seed <= 2; seed++) {
  const { result } = runCaveJob({ kind: 'form', setting: classic.id, seed, rock, size: 'small', dress: true, read: true, field: true });
  if (!result.mesh || !result.parts || !result.field) continue;
  const p = result.parts, floor = floorUnder(result.field);
  scan(`formed cave: ${rock}`, mergeMeshes([result.mesh, ...[p.formations, p.stones, p.crystals, p.fittings].map(asMesh)]), `seed ${seed}`, (x, z, y) => floor(x, y, z));
}
console.log(`pieces scanned in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// The towns: the start's, and those the VGM founds on a walk out east and west (villages, hamlets, a capital, a harbour).
const t1 = performance.now();
const seed = parseSeed('masterworld'), terrain = new Terrain(seed, classic);
const start = startPlace(terrain), first = firstDecisions(terrain, start);
terrain.settle(first);
const home = first.find((d) => d.kind === 'town')!;
const log = [...first];
for (const dir of [0, Math.PI, Math.PI / 2]) log.push(...walkFrontier({ seed, log, terrain, regions: classic.regions, home: home as never }, dir, 7));
const founded = regionDecisions(log).filter((d) => settlementOf(d, classic.regions.fills));
terrain.settleMore(founded);
const height = (x: number, z: number) => terrain.height(x, z);
console.log(`${terrain.towns.length} towns in ${((performance.now() - t1) / 1000).toFixed(1)} s`);
/** Buildings of one kind looked at per town (a town of a thousand houses has the same few dozen shapes). */
const PER_KIND = 8;
for (const town of terrain.towns) {
  const size = town.decision.id === home.id ? 'start town' : `${town.decision.size ?? 'town'}${town.decision.harbour ? ' harbour' : ''}`;
  const name = `${size} ${town.decision.id}`;
  const kinds = new Map<string, number>();
  for (const b of town.plan.buildings) {
    const k = kinds.get(b.kind) ?? 0;
    kinds.set(b.kind, k + 1);
    if (k >= PER_KIND) continue;
    const at: [number, number, number] = [b.cx, 0, b.cz];
    const ground = (x: number, z: number) => height(x + b.cx, z + b.cz);
    scan(`building: ${b.kind}`, buildingMesh(b, at, true), `${name} #${b.id}`, ground);
    scan(`building far: ${b.kind}`, buildingMesh(b, at, false), `${name} #${b.id}`, ground);
    // Open (D38), as the game draws it when the hero goes in: its outside and every storey inside, one mesh.
    scan(`building open: ${b.kind}`, openHouse(b, { hatch: false, hall: b.kind === 'hall' }).mesh, `${name} #${b.id}`, ground);
  }
  // The guild houses as the hero opens them (app/interiorVisit.ts): a hall's rack and post, the sign, the door's leaves
  // and the cellar hatch's lid with it, shut.
  const guilds = guildHouses(town.plan, town.decision.size ?? 'town', classic), signs = guildSigns(guilds, town.plan, classic);
  for (const g of guilds) {
    const b = g.b, o = openHouse(b, { hatch: true, hall: !!g.guild.hall && !g.out }, signs.get(b.id));
    scan(`guild house open: ${g.guild.keeper}`, mergeMeshes([o.mesh, ...o.doors.map((d) => d.mesh), ...(o.lid ? [o.lid] : [])]), `${name} #${b.id}`, (x, z) => height(x + b.cx, z + b.cz));
    scan('guild house with its sign', buildingMesh(b, [b.cx, 0, b.cz], true, { sign: signs.get(b.id) }), `${name} #${b.id}`, (x, z) => height(x + b.cx, z + b.cz));
  }
  for (const p of town.plan.props) scan(`town prop: ${p.kind}`, propMesh(p, [0, 0, 0], true), name, height);
  if (town.plan.wall) scan('town wall', wallMesh(town.plan.wall, [0, 0, 0], true), name, height);
  scan('town fixtures', fixtureMesh(town.plan.fixtures, height, [0, 0, 0], true), name, height);
  if (town.plan.harbour) scan('harbour', harbourMesh(town.plan.harbour, height, [0, 0, 0], true), name, height);
  const bridges = townBridges(town, new RoadNet(), terrain.hydro, height, () => true) ?? [];
  for (const b of bridges) scan('bridge over a brook', bridgeMesh(b), `${name} ${b.id}`, (x, z) => height(x + b.x, z + b.z));
  // The town's pieces together, in the world's frame: where a house meets a fixture, a prop, the wall, a quay or a bridge.
  const together: Mesh[] = town.plan.buildings.map((b) => buildingMesh(b, [0, 0, 0], true));
  for (const p of town.plan.props) together.push(propMesh(p, [0, 0, 0], true));
  if (town.plan.wall) together.push(wallMesh(town.plan.wall, [0, 0, 0], true));
  together.push(fixtureMesh(town.plan.fixtures, height, [0, 0, 0], true));
  if (town.plan.harbour) together.push(harbourMesh(town.plan.harbour, height, [0, 0, 0], true));
  for (const b of bridges) {
    const m = bridgeMesh(b), pos = Float32Array.from(m.position);
    for (let i = 0; i < pos.length; i += 3) { pos[i] += b.x; pos[i + 2] += b.z; }
    together.push({ ...m, position: pos });
  }
  scanBetween('town: between pieces', together, name, height);
}
console.log(`all scanned in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

const list = [...rows.values()].sort((a, b) => b.area - a.area);
const lines = ['| Generator | Meshes | Triangles | Pairs that show | Their area | Pairs that do not show |', '|---|---|---|---|---|---|'];
for (const r of list) lines.push(`| ${r.what} | ${r.meshes} | ${r.tris} | ${r.pairs} | ${r.area.toFixed(2)} m² | ${r.quiet} |`);
const detail = list.filter((r) => r.pairs).map((r) => `### ${r.what}\n\n${r.spots.map((s) => `- ${s}`).join('\n')}\n`);
const report = `# Z-fighting scan\n\nFaces in one plane (within 1 mm), facing the same way, overlapping by 10 cm² or more, that look different there and do not lie inside a solid (those do not show: counted apart).\n\n${lines.join('\n')}\n\n## Where (up to 12 spots per generator, biggest first per mesh)\n\n${detail.join('\n')}`;
const out = process.argv[2];
if (out) writeFileSync(out, report);
console.log(lines.join('\n'));
const bad = list.filter((r) => r.pairs);
console.log(bad.length ? `${bad.length} generators with z-fighting` : 'no z-fighting');
