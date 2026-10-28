/** Places worth a look, for the debug menu's "Go to" (found while building them; seed 'masterworld'), and where to stand to see one. */
import type { TownBuilding, TownGate } from '@futuremagic/settlement';
import type { Decision, DecisionLog, RegionDecision } from '../world/decisions';
import type { Place } from './debugMenu';

const MASTERWORLD: Place[] = [
  { label: 'Stone arch', pos: [-30633, 34120], look: [294, 8], hour: 15, fly: false },
  { label: 'Waterfall', pos: [-30637, 53, 34634], look: [215, -4], hour: 10, fly: true },
  { label: 'Beach', pos: [-33540, 4, 29800], look: [150, -4], hour: 15, fly: true },
  { label: 'Sea cliff', pos: [-31888, 8, 30715], look: [185, 2], fly: true },
  { label: 'Meadow', pos: [-32000, 39000], fly: false },
  { label: 'Swim in the sea', pos: [-31110, 31110], fly: false },
];

/** The start, and the known places of this seed. */
export function placesFor(seed: string, start: { x: number; z: number }): Place[] {
  return [{ label: 'Start', pos: [start.x, start.z], fly: false }, ...(seed === 'masterworld' ? MASTERWORLD : [])];
}

interface At { readonly x: number; readonly z: number }

/** Where the hero stands, and the way they face (the walker's yaw: 0 faces −z); `at`: what they look at; `pitch`: the camera's (rad, up positive). */
export interface Stand { readonly x: number; readonly z: number; readonly yaw: number; readonly at?: At; readonly pitch?: number }

/** The way that faces `at` from (x, z). */
const toward = (x: number, z: number, at: At): number => Math.atan2(x - at.x, z - at.z);

/** `d` m out from a place whose front faces `yaw` (a barrow's, a region site's), looking at it. */
export const before = (s: At & { readonly yaw: number }, d: number): Stand => ({ x: s.x + Math.sin(s.yaw) * d, z: s.z + Math.cos(s.yaw) * d, yaw: s.yaw, at: { x: s.x, z: s.z } });

/** `d` m from `at` on the side `from` is on, facing it. */
export function beside(at: At, from: At, d: number): Stand {
  const k = Math.hypot(from.x - at.x, from.z - at.z);
  const ux = k > 1e-6 ? (from.x - at.x) / k : 0, uz = k > 1e-6 ? (from.z - at.z) / k : 1;
  return { x: at.x + ux * d, z: at.z + uz * d, yaw: Math.atan2(ux, uz), at };
}

/** In the street `d` m before a building's door, facing it. */
export const atDoor = (b: TownBuilding, d = 6): Stand => ({ x: b.door[0] - b.vx * d, z: b.door[1] - b.vz * d, yaw: Math.atan2(-b.vx, -b.vz), at: { x: b.door[0], z: b.door[1] } });

/** Outside a town wall's gate, `d` m out on its road, facing in through it. */
export const outsideGate = (g: TownGate, d = 24): Stand => ({ x: g.x + Math.cos(g.angle) * d, z: g.z + Math.sin(g.angle) * d, yaw: Math.atan2(Math.cos(g.angle), Math.sin(g.angle)), at: { x: g.x, z: g.z } });

/**
 * A stand from which the hero is seen and sees: `s` itself if `clear` there (no tree, wall or water at the hero,
 * at the camera behind them or across the view), else the nearest clear one round what it looks at (turned up to 180° either
 * way, then a third nearer), else `s`.
 */
export function clearStand(s: Stand, clear: (x: number, z: number, yaw: number, at?: At) => boolean): Stand {
  if (clear(s.x, s.z, s.yaw, s.at) || !s.at) return s;
  const a = s.at, d0 = Math.hypot(s.x - a.x, s.z - a.z), a0 = Math.atan2(s.x - a.x, s.z - a.z);
  for (const d of [d0, d0 * 0.67]) {
    for (let k = 1; k <= 12; k++) {
      const t = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12) * 2;
      const x = a.x + Math.sin(t) * d, z = a.z + Math.cos(t) * d, yaw = toward(x, z, a);
      if (clear(x, z, yaw, a)) return { ...s, x, z, yaw };
    }
  }
  return s;
}

/** The one of `xs` nearest `at` (null: none). */
export function nearestTo<T extends At>(xs: readonly T[], at: At): T | null {
  let best: T | null = null, low = Infinity;
  for (const x of xs) {
    const d = Math.hypot(x.x - at.x, x.z - at.z);
    if (d < low) { low = d; best = x; }
  }
  return best;
}

/** The regions in the log whose fill places a `place` (a hamlet, ruins...), each with its site. */
export function regionsOf(log: DecisionLog, fills: readonly { readonly id: string; readonly place: string }[], place: string): (RegionDecision & { readonly site: NonNullable<RegionDecision['site']> })[] {
  const ids = new Set(fills.filter((f) => f.place === place).map((f) => f.id));
  return log.filter((d): d is RegionDecision & { site: NonNullable<RegionDecision['site']> } => d.kind === 'region' && ids.has(d.fill) && !!d.site);
}

/** The decisions of one kind in the log. */
export const decisionsOf = <K extends Decision['kind']>(log: DecisionLog, kind: K): Extract<Decision, { kind: K }>[] => log.filter((d): d is Extract<Decision, { kind: K }> => d.kind === kind);
