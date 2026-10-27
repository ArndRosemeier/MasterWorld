/**
 * Sunlight thrown about a room (the open building's storey one is in): the sun comes in through the
 * windows and the open door facing it, lands on the floor and the walls, and what they throw back lights
 * every face of the room a little, the dark corners and the far side of the counter too. Pure: the sky
 * view feeds it the sun, the room's openings come from the building's shape (@futuremagic/settlement), so
 * every town's rooms get it alike. At night (and with the sun behind cloud) it is about nothing, so rooms
 * keep the light they had before: the sky's share by their openings, and the lamp.
 */
import { houseShape, type InteriorPlan, type TownBuilding } from '@futuremagic/settlement';
import { roomFrame } from './interiorWorld';

/** An opening of a room: its outward normal (world x, z: level) and area (m²; a window's less its frame). */
export interface RoomOpening { nx: number; nz: number; area: number }

/** What a storey lets the sun in by, and what it throws it back with. */
export interface RoomSun {
  openings: RoomOpening[];
  /** The room's inside surface (m²): floor, ceiling and walls. */
  surface: number;
  /** Albedos (0..1): the floor and the walls. */
  floor: number;
  wall: number;
}

/** Albedo of boards and of flags; of a lime wash and of stone walls; of the ceiling's boards. */
const BOARDS = 0.2, FLAGS = 0.35, LIME = 0.6, STONE_WALL = 0.4, CEILING = 0.15;
/**
 * The light is thrown about more than once, and the eye opens to a room's dim (the exposure only partly
 * follows): this many times the single bounce, so a face that sees no opening reads as dark, not black.
 */
const GAIN = 20;

/** Storey `k` of the open building `b` (its interior `plan`): its openings and surfaces. The door counts when open. */
export function roomSun(b: TownBuilding, plan: InteriorPlan, k: number, doorOpen = true): RoomSun {
  const st = plan.storeys[Math.max(0, Math.min(plan.storeys.length - 1, k))]!;
  const sh = houseShape(b).storeys[Math.max(0, Math.min(plan.storeys.length - 1, k))];
  const frame = roomFrame(b, { x: 0, z: 0 });
  const openings: RoomOpening[] = [];
  for (const w of sh?.walls ?? []) {
    const len = Math.hypot(w.a1 - w.a0, w.b1 - w.b0);
    if (len <= 0) continue;
    // Outward in the building's frame (the inward normal is (-db, da)), then in the world.
    const [nx, nz] = frame.toWorld((w.b1 - w.b0) / len, -(w.a1 - w.a0) / len);
    for (const q of w.opens) {
      if (q.door && !doorOpen) continue;
      openings.push({ nx, nz, area: (q.s1 - q.s0) * (q.t1 - q.t0) * (q.door ? 1 : 0.8) });
    }
  }
  const wa = st.a1 - st.a0, wb = st.b1 - st.b0;
  const stoneWalls = b.wall === 'stone' || b.kind === 'temple';
  return { openings, surface: 2 * (wa * wb + (wa + wb) * st.height), floor: k === 0 && plan.stoneFloor ? FLAGS : BOARDS, wall: stoneWalls ? STONE_WALL : LIME };
}

/**
 * The light the room throws about (in the sun light's units, as irradiance on every inside face):
 * `sunDir` towards the sun (unit, y up), `sun` the sun light's strength as it falls outside (weather and
 * all). The sun through each opening it faces, times what it first lands on throws back (the floor under
 * a high sun, the walls under a low one), spread over the room and thrown about again.
 */
export function roomBounce(r: RoomSun, sunDir: readonly [number, number, number], sun: number): number {
  const up = sunDir[1];
  if (up <= 0 || sun <= 0 || r.surface <= 0) return 0;
  // Low sun reaches the floor through a window too (and the walls take more of it): fades in over the first degrees.
  const rise = Math.min(1, up / 0.08);
  let flux = 0;
  for (const o of r.openings) flux += o.area * Math.max(0, sunDir[0] * o.nx + sunDir[2] * o.nz);
  flux *= sun * rise;
  const first = r.wall + (r.floor - r.wall) * Math.min(1, up * 2);
  const mean = Math.min(0.9, 0.25 * r.floor + 0.25 * CEILING + 0.5 * r.wall);
  return (GAIN * flux * first) / (r.surface * (1 - mean));
}
