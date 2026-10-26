/**
 * The Builder's roads (plan 7): when a place is founded, a road links it to the network along the cheapest
 * way over the land (@futuremagic/settlement routeRoad: grades, fords, round the houses). The road is a
 * decision with its route and profile in it, so it is routed once and never moves.
 */
import { deriveSeed } from '@futuremagic/core';
import { roadProfile, routeRoad } from '@futuremagic/settlement';
import type { DecisionLog, RoadDecision, RoadWay } from '../world/decisions';
import type { Terrain } from '../world/terrain';

/** A place a road can lead to: its middle and how far its houses reach, m. */
export interface Place {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

/** A point where a new road may join the network, and what it joins (a town or a road). */
interface Join { x: number; z: number; id: string }

/** The ends of every town's roads out (past its fields), and every tenth point of the roads already laid. */
function joins(t: Terrain, log: DecisionLog, not: string): Join[] {
  const out: Join[] = [];
  for (const town of t.towns) {
    if (town.decision.id === not) continue;
    for (const s of town.plan.streets) {
      if (s.kind !== 'road' || s.pts.length < 4) continue;
      out.push({ x: s.pts[s.pts.length - 2], z: s.pts[s.pts.length - 1], id: town.decision.id });
    }
  }
  for (const d of log) {
    if (d.kind !== 'road' || d.from === not) continue;
    for (let k = 0; k < d.pts.length; k += 30) out.push({ x: d.pts[k], z: d.pts[k + 2], id: d.id });
  }
  return out;
}

/**
 * A road from `place` to the nearest point of the network (a town's road out, or a road already laid), or
 * null when there is nothing to join or no way over the land. Deterministic per seed, log and place.
 */
export function linkRoad(t: Terrain, log: DecisionLog, place: Place, way: RoadWay = 'track', at?: number): RoadDecision | null {
  const targets = joins(t, log, place.id);
  if (!targets.length) return null;
  const to = targets.reduce((a, b) => (Math.hypot(b.x - place.x, b.z - place.z) < Math.hypot(a.x - place.x, a.z - place.z) ? b : a));
  // From the edge of the place's houses, towards the network.
  const dx = to.x - place.x, dz = to.z - place.z, L = Math.hypot(dx, dz) || 1;
  const from: [number, number] = [place.x + (dx / L) * Math.min(place.r, L / 2), place.z + (dz / L) * Math.min(place.r, L / 2)];
  const id = `road-${log.filter((d) => d.kind === 'road').length + 1}`;
  const route = routeRoad({
    seed: deriveSeed(t.seed, 'road', id),
    height: t.height.bind(t),
    water: t.waterDepth.bind(t),
    blocked: (x, z) => t.towns.some((town) => town.solid(x, z, 2)),
  }, from, [to.x, to.z]);
  if (!route) return null;
  const ys = roadProfile(route.pts, t.height.bind(t));
  const pts: number[] = [];
  for (let k = 0; k < ys.length; k++) pts.push(round(route.pts[k * 2]), round(ys[k]), round(route.pts[k * 2 + 1]));
  return { kind: 'road', id, way, from: place.id, to: to.id, pts, ...(at === undefined ? {} : { at }) };
}

const round = (v: number): number => Math.round(v * 100) / 100;
