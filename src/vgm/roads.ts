/**
 * The Builder's roads (plan 7): when a place is founded, a road links it to the network along the cheapest
 * way over the land (@futuremagic/settlement routeRoad: grades, fords, round the houses). The road is a
 * decision with its route and profile in it, so it is routed once and never moves.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
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

/**
 * A stand-in for a hamlet (`?hamlet`) until the regions (plan B1) found real ones: dry, gentle ground
 * 1.6 to 2.6 km from `home`, in a direction chosen by the seed. Nothing is built there; the road leads to it.
 */
export function standInHamlet(t: Terrain, home: { x: number; z: number }): Place | null {
  const seed = deriveSeed(t.seed, 'vgm', 'stand-in-hamlet');
  const turn = hash2f(seed, 0, 0) * Math.PI * 2;
  let best: Place | null = null, bestScore = Infinity;
  for (let a = 0; a < 24; a++) for (const r of [1600, 2000, 2300, 2600]) {
    const ang = turn + (a / 24) * Math.PI * 2;
    const x = home.x + Math.cos(ang) * r, z = home.z + Math.sin(ang) * r, h = t.height(x, z);
    if (h < 4 || t.waterDepth(x, z) > 0) continue;
    let steep = 0;
    for (let i = 0; i < 8; i++) {
      const q = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(q) * 35, pz = z + Math.sin(q) * 35;
      if (t.waterDepth(px, pz) > 0) steep += 1;
      steep = Math.max(steep, Math.abs(t.height(px, pz) - h) / 35);
    }
    const score = steep + r / 20000 + hash2f(seed, a, r) * 0.01;
    if (steep < 0.15 && score < bestScore) { bestScore = score; best = { id: 'hamlet-standin', x, z, r: 30 }; }
  }
  return best;
}
