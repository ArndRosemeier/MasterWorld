/**
 * A hold's gate as it stands on the land (pure): a front of dressed stone cut into the hill, a tall doorway
 * with its two great doors banded in iron, square pillars under a heavy lintel, a ward-band of runes, two
 * carved wardens on plinths, and a paved court walled at its sides with braziers at the walls' ends. In the
 * building mesh format, so it draws with the town's one building shader (nothing new to compile). Its own
 * frame (world/hold.ts): the doorway's middle at the origin, out of the gate towards +z, the court at y 0.
 */
import { Rng } from '@futuremagic/core';
import type { BuildingMesh } from '@futuremagic/settlement';
import { BuildingMat, CellarMat, MeshKit, WildMat, varyTint, type Tint } from './dungeon/meshKit';
import { COURT, GATE, WALLS } from './hold';

/** Dwarf-dressed granite, warm grey; the rune band paler; the doors' oak dark with age; iron nearly black. */
const STONE: Tint = [184, 178, 168];
const DARKER: Tint = [140, 134, 126];
const RUNES: Tint = [214, 220, 226];
const OAK: Tint = [96, 74, 56];
const IRON: Tint = [46, 44, 44];
const FLAGS: Tint = [168, 160, 146];
const EMBER: Tint = [255, 150, 60];
const SOOT: Tint = [24, 22, 20];

export function holdMesh(seed = 1): BuildingMesh {
  const k = new MeshKit(), rng = new Rng(seed);
  front(k, rng);
  doorway(k);
  pillars(k, rng);
  wardens(k, rng);
  court(k, rng);
  return k.mesh();
}

/** The front: a wall of dressed stone from the court up the face, deep into the hill, with a cornice and buttresses. */
function front(k: MeshKit, rng: Rng): void {
  const { half, h, door, doorH } = GATE, back = -9;
  // The face around the doorway: left, right and above it.
  for (const [x0, x1, y0, y1] of [[-half, -door, 0, h], [door, half, 0, h], [-door, door, doorH, h]] as const) {
    // Walked from +x to −x, a wall faces out of the gate (+z).
    k.wall(x1, 0, x0, 0, y0, y1, BuildingMat.Ashlar, STONE, 0, DARKER, STONE);
  }
  // Its sides and top run back into the hill (the hill covers most of them).
  k.wall(-half, 0, -half, back, -1, h, BuildingMat.Ashlar, STONE);
  k.wall(half, back, half, 0, -1, h, BuildingMat.Ashlar, STONE);
  k.flat(-half, back, half, 0, h, true, BuildingMat.Ashlar, DARKER);
  // A heavy cornice of stepped courses along the top, and a plinth course at the foot.
  k.box(0, h - 1.1, 0.35, 2 * half + 0.9, 0.55, 0.7, 0, BuildingMat.Ashlar, STONE);
  k.box(0, h - 0.55, 0.6, 2 * half + 1.6, 0.6, 1.2, 0, BuildingMat.Ashlar, STONE);
  for (const side of [-1, 1]) k.box(side * (half + door) / 2, 0, 0.2, half - door, 0.6, 0.4, 0, BuildingMat.Ashlar, DARKER);
  // Buttresses at either end, stepped in twice as they rise.
  for (const side of [-1, 1]) {
    const x = side * (half - 0.2);
    k.box(x, 0, 0.6, 1.6, 6, 1.6, 0, BuildingMat.Ashlar, varyTint(rng, STONE, 0.04));
    k.box(x, 6, 0.45, 1.35, 4.4, 1.3, 0, BuildingMat.Ashlar, varyTint(rng, STONE, 0.04));
    k.box(x, 10.4, 0.3, 1.1, h - 10.4 - 1.1, 1.0, 0, BuildingMat.Ashlar, varyTint(rng, STONE, 0.04));
  }
  // The ward-band: a course of pale rune stones across the face above the lintel, each cut with a sign.
  const y = 9.4, n = 13;
  for (let i = 0; i < n; i++) {
    const x = -half + 1.6 + (i + 0.5) * ((2 * half - 3.2) / n);
    k.box(x, y, 0.06, (2 * half - 3.2) / n - 0.12, 0.9, 0.14, 0, BuildingMat.Ashlar, varyTint(rng, RUNES, 0.03));
    // The sign: a few strokes in dark relief (an upright and one or two bars, seeded).
    const s = new Rng(rng.int(1, 1 << 30));
    k.box(x, y + 0.12, 0.14, 0.07, 0.66, 0.04, 0, BuildingMat.Ashlar, DARKER);
    for (let b = 0; b < 1 + s.int(0, 1); b++) k.box(x + s.range(-0.12, 0.12), y + 0.2 + s.range(0, 0.45), 0.14, s.range(0.18, 0.32), 0.06, 0.04, s.range(-0.7, 0.7), BuildingMat.Ashlar, DARKER);
  }
}

/** The doorway: its recess (sides, ceiling, threshold) and the two great doors, oak in iron bands, studded. */
function doorway(k: MeshKit): void {
  const { door, doorH, recess } = GATE, d = -recess;
  k.wall(-door, d, -door, 0, 0, doorH, BuildingMat.Ashlar, DARKER);
  k.wall(door, 0, door, d, 0, doorH, BuildingMat.Ashlar, DARKER);
  k.flat(-door, d, door, 0, doorH, false, BuildingMat.Ashlar, DARKER);
  k.box(0, 0, d / 2, 2 * door, 0.12, recess, 0, BuildingMat.Ashlar, DARKER);
  // The two leaves, a hand's breadth apart in the middle, then their bands and studs.
  for (const side of [-1, 1]) {
    const x0 = side * 0.03, x1 = side * door, z = d + 0.02;
    k.wall(Math.max(x0, x1), z, Math.min(x0, x1), z, 0.12, doorH, CellarMat.Boards, OAK);
    for (const y of [0.9, 2.6, 4.3, 5.9]) k.box(side * door / 2, y, z + 0.04, door - 0.2, 0.18, 0.06, 0, BuildingMat.Plaster, IRON);
    for (const y of [0.9, 2.6, 4.3, 5.9]) for (let i = 0; i < 4; i++) k.box(side * (0.35 + i * 0.6), y + 0.03, z + 0.09, 0.09, 0.12, 0.05, 0, BuildingMat.Plaster, IRON);
    // A great ring to knock with.
    k.cylinder(side * 0.55, 3.3, z + 0.12, 0.2, 0.06, 10, BuildingMat.Plaster, IRON);
  }
}

/** Square pillars either side of the door under a heavy lintel that runs across both. */
function pillars(k: MeshKit, rng: Rng): void {
  const top = 11.6;
  for (const side of [-1, 1]) {
    const x = side * 4.4;
    k.box(x, 0, 0.75, 2.4, 0.7, 1.7, 0, BuildingMat.Ashlar, varyTint(rng, DARKER, 0.04));
    k.box(x, 0.7, 0.7, 2.0, top - 1.6, 1.4, 0, BuildingMat.Ashlar, varyTint(rng, STONE, 0.04));
    // Fluting: three shallow ribs up the front.
    for (const dx of [-0.55, 0, 0.55]) k.box(x + dx, 1.0, 1.42, 0.22, top - 2.4, 0.06, 0, BuildingMat.Ashlar, STONE);
    k.box(x, top - 0.9, 0.75, 2.5, 0.9, 1.8, 0, BuildingMat.Ashlar, varyTint(rng, STONE, 0.04));
  }
  // The lintel over the door, from pillar to pillar, deep enough to throw a shadow over the doors.
  k.box(0, GATE.doorH, 0.7, 2 * 4.4 - 2.0, 1.5, 1.4, 0, BuildingMat.Ashlar, STONE);
  k.box(0, GATE.doorH + 1.5, 0.75, 2 * 4.4 + 0.4, 0.5, 1.6, 0, BuildingMat.Ashlar, DARKER);
}

/**
 * Two carved wardens on plinths before the pillars, a little over twice a dwarf's height: broad robed
 * bodies, folded arms over a beard to the belt, a helm, a great axe upright before them.
 */
function wardens(k: MeshKit, rng: Rng): void {
  for (const side of [-1, 1]) {
    const x = side * 7.6, z = 2.6, tone = (v: number) => varyTint(rng, STONE, v);
    const turn = side * -0.25;
    k.box(x, 0, z, 1.9, 1.1, 1.9, turn, BuildingMat.Ashlar, tone(0.03));
    k.box(x, 1.1, z, 1.6, 0.25, 1.6, turn, BuildingMat.Ashlar, DARKER);
    // Robe, wider at the foot; the chest; the shoulders.
    k.stone(x, 1.35, z, 1.45, 1.6, 1.15, turn, BuildingMat.Ashlar, tone(0.03), rng, 0.02, 0.15);
    k.stone(x, 2.9, z, 1.3, 1.1, 1.0, turn, BuildingMat.Ashlar, tone(0.03), rng, 0.02, 0.15);
    k.stone(x, 3.9, z, 1.6, 0.45, 0.95, turn, BuildingMat.Ashlar, tone(0.03), rng, 0.02, 0.25);
    // The beard falls over the folded arms, the head under its helm.
    const fx = Math.sin(turn), fz = Math.cos(turn);
    k.stone(x + fx * 0.48, 2.6, z + fz * 0.48, 0.7, 1.55, 0.3, turn, BuildingMat.Ashlar, tone(0.02), rng, 0.03, 0.3);
    k.stone(x + fx * 0.42, 3.05, z + fz * 0.42, 1.25, 0.32, 0.32, turn, BuildingMat.Ashlar, tone(0.02), rng, 0.02, 0.3);
    k.stone(x, 4.3, z, 0.7, 0.75, 0.75, turn, BuildingMat.Ashlar, tone(0.02), rng, 0.02, 0.35);
    k.stone(x, 4.85, z, 0.9, 0.45, 0.9, turn, BuildingMat.Ashlar, DARKER, rng, 0.02, 0.55);
    // The axe: a haft from the plinth to the chin, its head beside the face.
    const ax = x + fx * 0.95, az = z + fz * 0.95;
    k.box(ax, 1.35, az, 0.14, 3.4, 0.14, turn, BuildingMat.Ashlar, DARKER);
    k.box(ax + Math.cos(turn) * side * 0.3, 4.0, az - Math.sin(turn) * side * 0.3, 0.6, 0.85, 0.1, turn, BuildingMat.Ashlar, DARKER);
  }
}

/** The court: flags laid out from the gate, low walls of rough stone along both sides, braziers on their ends. */
function court(k: MeshKit, rng: Rng): void {
  // Flags in rows, each a little lighter or darker, laid over the levelled ground.
  const rows = 12, step = COURT.depth / rows;
  for (let r = 0; r < rows; r++) {
    const z0 = 0.25 + r * step, z1 = z0 + step;
    const cols = 8, w = (2 * COURT.half) / cols;
    for (let c = 0; c < cols; c++) {
      const x0 = -COURT.half + c * w + (r % 2 ? w / 2 : 0), x1 = Math.min(COURT.half, x0 + w);
      if (x0 >= COURT.half) continue;
      k.flat(x0 + 0.03, z0 + 0.03, x1 - 0.03, z1 - 0.03, 0.05, true, CellarMat.Flagstone, varyTint(rng, FLAGS, 0.08));
    }
    if (r % 2) k.flat(-COURT.half, z0 + 0.03, -COURT.half + w / 2 - 0.03, z1 - 0.03, 0.05, true, CellarMat.Flagstone, varyTint(rng, FLAGS, 0.08));
  }
  // The joints show the ground's grit between the flags.
  k.flat(-COURT.half, 0.25, COURT.half, COURT.depth + 0.25, 0.02, true, WildMat.Rock, [120, 114, 104]);
  for (const side of [-1, 1]) {
    const x = side * (COURT.half + WALLS.thick / 2);
    k.box(x, -0.4, WALLS.out / 2, WALLS.thick, WALLS.h + 0.4, WALLS.out, 0, BuildingMat.Rubble, varyTint(rng, STONE, 0.05));
    k.box(x, WALLS.h, WALLS.out / 2, WALLS.thick + 0.2, 0.18, WALLS.out + 0.1, 0, BuildingMat.Ashlar, DARKER);
    // A brazier on a squat pillar at the wall's end: a bronze bowl, coals glowing in it.
    const bz = WALLS.out + 0.1;
    k.box(x, -0.3, bz, 1.0, WALLS.h + 0.9, 1.0, 0, BuildingMat.Ashlar, varyTint(rng, STONE, 0.04));
    k.cylinder(x, WALLS.h + 0.6, bz, 0.5, 0.35, 12, BuildingMat.Plaster, IRON, 0.15);
    k.cylinder(x, WALLS.h + 0.9, bz, 0.42, 0.04, 12, BuildingMat.Plaster, SOOT);
    for (let i = 0; i < 5; i++) k.stone(x + rng.range(-0.22, 0.22), WALLS.h + 0.88, bz + rng.range(-0.22, 0.22), 0.16, 0.1, 0.14, rng.range(0, 3), BuildingMat.Plaster, EMBER, rng, 0.02, 0.5);
  }
}
