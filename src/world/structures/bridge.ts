/**
 * The fortified bridge (D69, Z4; pure): a camp's structure on an old road where it crosses a gap. A grammar of
 * parts, each from the seed, so two of them look very distinct (Arnd 2026-11-17):
 *
 * - **Form**: an arcade of even arches, one great arch with flood arches beside it, or a long low causeway of
 *   many small ones; arches in tiers where the gap is deep (the upper tier split in small arches or not); the
 *   deck level, humped or ramped; piers with cutwaters, low or carried up as refuges.
 * - **Its fortification**: gatehouses at one end, the other or both (a gate tower, a gate between two drum towers,
 *   or a keep beside a low gate), towers on piers over the road, turrets on the parapet, a covered walk, a
 *   drawbridge; crenellated or plain parapets.
 * - **The land**: measured along the road, never assumed: where the banks' lips are, how high each bank, how deep.
 * - **Who built it** (the setting's builders): stone, colours, arches, tower shapes, proportions, ornament.
 * - **History and decay**: spans fallen (bridged again with planks, a trestle or a rope bridge), tower tops fallen,
 *   rebuilt in other stone, roofs burned; parapets broken; grown over.
 * - **Its holders' additions**: barricades, palisades, lookouts, tents, hides, spikes, skulls, totems, banners, graves.
 *
 * The road runs along x and crosses the gap; `planBridge` reads the land and decides, `fortifiedBridgeMesh` builds.
 */
import { Rng, deriveSeed, type Ground } from '@futuremagic/core';
import type { StructureArch, StructureTower, StructuresDef, StructureAddition } from '../../setting/contract';
import { BuildingMat, CellarMat, MeshKit, scaleTint, type PlacedMesh, type Tint } from '../dungeon/meshKit';
import { archRise, grimed, beam, roundPts, floorOf, gable, prism, rect, wallRing, rubble, spire, wall, type Opening, type P2, type Site } from './masonry';
import { banner, barricade, bones, cage, cart, coffin, grave, pelt, lookout, onLand, palisade, rope, room, skull, stakeRow, statue, tent, totem, type Floor } from './props';
import { tower, type TowerTop } from './tower';
import { apart, fallen, pickStructure, styleOf, type Picks, type Signature, type Style } from './style';

export type BridgeForm = 'arcade' | 'grand' | 'causeway';
export type Patch = 'planks' | 'trestle' | 'rope' | 'drawbridge' | 'raised';

export interface BridgeTower {
  readonly role: 'gate' | 'mid';
  /** Its middle along the road and its half-length along it, its half-width across. */
  readonly cx: number;
  readonly hx: number;
  readonly hz: number;
  readonly top: number;
  readonly roof: TowerTop;
  readonly broken: number;
  readonly fallSide: number;
  readonly rebuilt: number | null;
  /** A gate between two drum towers (their shape, radius, top), or a keep beside the gate on one side. */
  readonly flank?: { readonly shape: StructureTower; readonly r: number; readonly top: number; readonly keep: boolean; readonly side: number; readonly broken: number; readonly roof: TowerTop };
}

export interface Span { readonly x0: number; readonly x1: number; readonly spring: number; readonly arch: StructureArch; readonly lower: readonly Opening[]; readonly split: number; readonly sill: number | null }
export interface Gap { readonly x0: number; readonly x1: number; readonly patch: Patch; readonly fallen: boolean }

export interface BridgePlan {
  readonly seed: number;
  readonly picks: Picks;
  readonly form: BridgeForm;
  /** Half the deck's width (to the parapets' outer faces). */
  readonly hw: number;
  /** Where the masonry starts and ends along the road, the banks' lips, the deck's levels there and its hump. */
  readonly xs: number;
  readonly xe: number;
  readonly lipA: number;
  readonly lipB: number;
  readonly yA: number;
  readonly yB: number;
  readonly hump: number;
  readonly spans: readonly Span[];
  readonly piers: readonly { readonly x: number; readonly w: number }[];
  readonly towers: readonly BridgeTower[];
  readonly gaps: readonly Gap[];
  readonly tiers: number;
  readonly cutwaters: 'none' | 'low' | 'refuge';
  readonly parapet: 'crenels' | 'plain';
  readonly covered: boolean;
  readonly turrets: boolean;
  readonly adds: readonly StructureAddition[];
  /** The lowest ground under it and its highest point, m. */
  readonly low: number;
  readonly high: number;
}

/** The deck's height at x along the road. */
export function deckAt(p: Pick<BridgePlan, 'lipA' | 'lipB' | 'yA' | 'yB' | 'hump'>, x: number): number {
  const t = Math.max(0, Math.min(1, (x - p.lipA) / (p.lipB - p.lipA)));
  return p.yA + (p.yB - p.yA) * t + p.hump * Math.sin(Math.PI * t);
}

/** The ground along the road: the highest of three lines across the deck (so the deck clears it). */
const along = (g: Ground, x: number, hw = 3) => Math.max(g(x, -hw), g(x, 0), g(x, hw));
const lowAlong = (g: Ground, x: number, hw = 3) => Math.min(g(x, -hw), g(x, 0), g(x, hw));

export function planBridge(defs: StructuresDef, seed: number, ground: Ground): BridgePlan {
  const rng = new Rng(deriveSeed(seed, 'bridge'));
  const picks = pickStructure(defs, 'fortified-bridge', rng), b = picks.builder, fall = fallen(picks.state);
  // The land: the gap's bottom, each bank's level (the high quarter of its ground), the lips where the banks reach it.
  let lowX = 0, lowY = Infinity;
  for (let x = -90; x <= 90; x += 1) { const y = along(ground, x); if (y < lowY) { lowY = y; lowX = x; } }
  // A bank's lip: going out from the bottom, where the ground has come up nine tenths of the way to the highest near it.
  const lip = (dir: number, over = -Infinity) => {
    let top = -Infinity;
    for (let x = lowX; Math.abs(x - lowX) <= 95; x += dir) top = Math.max(top, along(ground, x));
    const want = Math.max(lowY + 0.9 * (top - lowY), over);
    for (let x = lowX; Math.abs(x - lowX) < 200; x += dir) if (along(ground, x) >= want - 0.05) return x;
    return lowX + dir * 200;
  };
  let lipA = lip(-1), lipB = lip(1);
  let gA = along(ground, lipA), gB = along(ground, lipB);
  // Banks of two heights: the deck ramps at most 1 in 9; the low side is carried further out, to where the land comes up to it.
  const maxSlope = 0.11;
  if (Math.abs(gA - gB) / (lipB - lipA) > maxSlope) {
    if (gA < gB) { gA = gB - maxSlope * (lipB - lipA); lipA = lip(-1, gA); } else { gB = gA - maxSlope * (lipB - lipA); lipB = lip(1, gB); }
  }
  const yA = gA + 0.25, yB = gB + 0.25, L = lipB - lipA, depth = Math.min(yA, yB) - lowY;
  const hw = rng.range(2.5, 3.4) * (b.thick > 1.3 ? 1.2 : 1);
  // The form.
  const form = rng.weighted<BridgeForm>(['arcade', 'grand', 'causeway'], (f) => (f === 'arcade' ? 3 : f === 'grand' ? (L < 75 ? 2.5 : 0.6) : depth < 13 && L > 55 ? 3 : 0));
  const hump = form === 'causeway' || (depth < 14 && rng.chance(0.45)) ? Math.min(3.2, L * rng.range(0.03, 0.06)) : 0;
  const deck = (x: number) => deckAt({ lipA, lipB, yA, yB, hump }, x);
  const [s0, s1] = ({ 'old-realm': [11, 18], dwarves: [16, 26], valley: [7, 13], river: [9, 16] } as Record<string, [number, number]>)[b.id] ?? [9, 16];
  const target = rng.range(s0, s1) * (form === 'causeway' ? 0.6 : 1);
  const pierW = Math.max(2, Math.min(5, target * 0.22)) * Math.sqrt(b.thick);
  // Spans: their widths (a great arch in the middle of the gap for the grand form), then the piers between.
  let widths: number[];
  if (form === 'grand') {
    const big = Math.max(16, Math.min(46, L * rng.range(0.42, 0.62)));
    const side = (L - big - 2 * pierW * 1.5) / 2, ns = side > 4 ? Math.max(1, Math.round(side / (target * 0.7))) : 0;
    const sw = ns ? (side - (ns - 1) * pierW) / ns : 0;
    widths = [...Array(ns).fill(sw), big, ...Array(ns).fill(sw)];
  } else {
    const n = Math.max(2, Math.round(L / target));
    widths = Array(n).fill(0);
  }
  // Fortification: gatehouses and towers on piers (a tower's pier is as long as the tower).
  const gateAt = rng.weighted(['none', 'A', 'B', 'both'], (g) => ({ none: 1, A: 2, B: 2, both: 2 })[g as 'none']);
  const nPiers = widths.length - 1;
  const midCount = Math.min(nPiers, rng.weighted([0, 1, 2, 3], (c) => [gateAt === 'none' ? 0 : 2, 3, form === 'grand' ? 3 : 1.5, nPiers >= 5 ? 1 : 0][c]));
  const midPiers = new Set<number>();
  if (form === 'grand' && midCount >= 2 && nPiers >= 2) { const g = widths.indexOf(Math.max(...widths)); midPiers.add(g - 1); midPiers.add(g); }
  for (let i = 1; midPiers.size < midCount && i <= midCount; i++) midPiers.add(Math.max(0, Math.min(nPiers - 1, Math.round((i * nPiers) / (midCount + 1) - 0.5))));
  for (let i = 0; midPiers.size < midCount && i < nPiers; i++) midPiers.add(i);
  const towerHx = rng.range(3.4, 4.6) * Math.sqrt(b.thick);
  const pierWs = Array.from({ length: nPiers }, (_, i) => (midPiers.has(i) ? 2 * towerHx : form === 'grand' && widths[i] !== widths[i + 1] ? pierW * 1.5 : pierW));
  if (form !== 'grand') { const w = (L - pierWs.reduce((a, c) => a + c, 0)) / widths.length; widths = widths.map(() => w); }
  else { const rest = L - pierWs.reduce((a, c) => a + c, 0), sum = widths.reduce((a, c) => a + c, 0); widths = widths.map((w) => (w * rest) / sum); }
  const piers: { x: number; w: number }[] = [];
  const spanX: [number, number][] = [];
  let x = lipA;
  widths.forEach((w, i) => { spanX.push([x, x + w]); x += w; if (i < nPiers) { piers.push({ x: x + pierWs[i] / 2, w: pierWs[i] }); x += pierWs[i]; } });
  // Arches: the builder's shape (no flat lintel over 8 m), springing so the crown sits a little under the deck.
  const archOf = (w: number): StructureArch => (picks.arch === 'flat' && w > 8 ? 'segmental' : picks.arch);
  const tierable = depth > 16;
  const tiers = tierable ? (depth > 30 && rng.chance(0.5) ? 3 : rng.chance(0.75) ? 2 : 1) : 1;
  const split = tiers > 1 && rng.chance(0.45) ? rng.int(2, 3) : 0;
  const spans: Span[] = spanX.map(([x0, x1]) => {
    const w = x1 - x0, arch = archOf(w), crown = 1 + 0.035 * w, mid = (x0 + x1) / 2;
    let lowG = Infinity;
    for (let t = x0; t <= x1; t += 1) lowG = Math.min(lowG, lowAlong(ground, t, hw));
    const top = deck(mid) - crown, spring = top - archRise(arch, w);
    const lower: Opening[] = [];
    let sill: number | null = null;
    if (tiers > 1 && spring - lowG > 10) {
      // Tiers: each a row of arches over the one below, a band of masonry between them.
      const h = spring - lowG;
      for (let t = 0; t < tiers - 1; t++) {
        const bandTop = lowG + (h * (t + 1)) / tiers, rise = archRise(arch, w), y0 = t === 0 ? -1e4 : lowG + (h * t) / tiers, y1 = Math.max(lowG - rise, bandTop - 1.6 - rise);
        // (A wide arch in a shallow band leaves no room for its opening: the band stays solid.)
        if (y1 - y0 > 2) lower.push({ s0: x0, s1: x1, y0, y1, arch });
        sill = bandTop;
      }
    }
    return { x0, x1, spring, arch, lower, split: sill !== null ? split : 0, sill };
  });
  // Towers: gate towers on the banks over the road; towers on their piers.
  const roofs: Record<string, [TowerTop, number][]> = {
    'old-realm': [['spire', 3], ['crenels', 3]], dwarves: [['machicolations', 4], ['crenels', 2], ['spire', 1]],
    valley: [['hoarding', 3], ['spire', 2], ['crenels', 1]], river: [['spire', 2], ['machicolations', 2], ['crenels', 1]],
  };
  const roofPick = (): TowerTop => {
    const r = rng.weighted(roofs[b.id] ?? [['crenels', 1]], (o) => o[1])[0];
    return (r === 'spire' || r === 'hoarding') && fall > 0.3 && rng.chance(0.5) ? 'burned' : r;
  };
  const towerBroken = (): number => (fall === 0 ? 0 : rng.chance(0.25 + fall * 0.6) ? rng.range(0.15, 0.25 + fall * 0.5) : 0);
  const rebuiltPick = (top: number, floor: number): number | null => (fall >= 0.6 && rng.chance(0.4) ? floor + (top - floor) * rng.range(0.45, 0.7) : null);
  const towerTall = rng.range(9, 14) * b.tall;
  const gateType = rng.weighted(['block', 'twin', 'keep'], (t) => ({ block: 3, twin: 2.5, keep: 1.5 })[t as 'block']);
  const towers: BridgeTower[] = [];
  const gate = (at: number, dir: number) => {
    const hx = rng.range(3.2, 4.4) * Math.sqrt(b.thick), hz = hw + rng.range(1.3, 2.2), cx = at - dir * (hx + 0.5), floor = deck(cx);
    const broken = towerBroken();
    const flankShape = rng.pick(b.towers);
    const flank = gateType === 'block' ? undefined : {
      shape: flankShape, r: rng.range(2.6, 3.8) * Math.sqrt(b.thick), top: floor + towerTall * (gateType === 'keep' ? rng.range(1.5, 2) : rng.range(1.05, 1.3)),
      keep: gateType === 'keep', side: rng.sign(), broken: towerBroken(), roof: roofPick(),
    };
    const top = floor + (gateType === 'block' ? towerTall : towerTall * rng.range(0.6, 0.75));
    towers.push({ role: 'gate', cx, hx, hz, top, roof: roofPick(), broken, fallSide: rng.int(0, 3), rebuilt: rebuiltPick(top, floor), flank });
  };
  if (gateAt === 'A' || gateAt === 'both') gate(lipA, -1);
  if (gateAt === 'B' || gateAt === 'both') gate(lipB, 1);
  for (const i of [...midPiers].sort((p, q) => p - q)) {
    const cx = piers[i].x, floor = deck(cx), top = floor + towerTall * rng.range(0.85, 1.15), broken = towerBroken();
    // A pier next to a gate tower carries no tower of its own: the gate stands there.
    if (towers.some((t) => Math.abs(t.cx - cx) < t.hx + piers[i].w / 2 + 1)) continue;
    towers.push({ role: 'mid', cx, hx: piers[i].w / 2, hz: hw + rng.range(1.2, 2), top, roof: roofPick(), broken, fallSide: rng.int(0, 3), rebuilt: rebuiltPick(top, floor) });
  }
  // History: spans that fell and how they were crossed again; a drawbridge before a gate.
  const gaps: Gap[] = [];
  const nearTower = (s: Span) => towers.some((t) => t.role === 'gate' && Math.min(Math.abs(s.x0 - (t.cx + t.hx)), Math.abs(s.x1 - (t.cx - t.hx))) < 1);
  // A broken bridge has lost a span (so it reads broken from afar), a ruinous one one or two, a weathered one now and then.
  const falls = fall === 0 ? 0 : fall < 0.5 ? (rng.chance(0.2) ? 1 : 0) : fall < 0.9 ? 1 : rng.int(1, 2);
  const under = (x0: number, x1: number) => towers.some((t) => t.cx + t.hx > x0 + 0.3 && t.cx - t.hx < x1 - 0.3);
  const free = spans.filter((s) => !nearTower(s) && !under(s.x0, s.x1) && s.x1 - s.x0 < 48);
  for (const s of rng.sample(free, Math.min(falls, free.length, Math.max(0, spans.length - 2)))) {
    // A short span falls with its neighbour and the pier between (its stump left standing), so the gap reads from afar.
    const i = spans.indexOf(s), next = spans[i + 1];
    const wide = s.x1 - s.x0 < 12 && next && free.includes(next) && !gaps.some((g) => g.x0 <= next.x1 && g.x1 >= next.x0) && !towers.some((t) => t.cx > s.x1 && t.cx < next.x0);
    const x0 = s.x0, x1 = wide ? next.x1 : s.x1;
    // (Never under a tower: a tower stands on its pier or its bank.)
    if (gaps.some((g) => g.x0 <= x1 && g.x1 >= x0) || under(x0, x1)) continue;
    const high = deck((x0 + x1) / 2) - lowY;
    const patch: Patch = high > 18 && rng.chance(0.6) ? 'rope' : x1 - x0 < 12 && rng.chance(0.6) ? 'planks' : high > 26 ? 'rope' : 'trestle';
    gaps.push({ x0, x1, patch, fallen: true });
  }
  for (const t of towers) {
    if (t.role !== 'gate' || !rng.chance(0.35)) continue;
    const inward = t.cx < (lipA + lipB) / 2 ? 1 : -1, face = t.cx + inward * t.hx;
    const s = spans.find((p) => Math.abs((inward > 0 ? p.x0 : p.x1) - face) < 2.5 && p.x1 - p.x0 < 14);
    if (s && !gaps.some((g) => g.x0 === s.x0)) gaps.push({ x0: s.x0, x1: s.x1, patch: rng.chance(0.25) ? 'raised' : 'drawbridge', fallen: false });
  }
  gaps.sort((p, q) => p.x0 - q.x0);
  const covered = rng.chance(b.id === 'valley' || b.id === 'river' ? 0.3 : b.id === 'dwarves' ? 0 : 0.08);
  const cutwaters = rng.weighted(['none', 'low', 'refuge'] as const, (c) => ({ none: 1, low: b.id === 'dwarves' ? 4 : 2, refuge: b.id === 'valley' || b.id === 'old-realm' ? 3 : 1.5 })[c]);
  const adds = [...picks.holder.always, ...rng.sample(picks.holder.adds, rng.int(2, 3))];
  // The masonry runs out onto the banks a little past the lips.
  const xs = Math.min(lipA - 4, ...towers.map((t) => t.cx - t.hx)), xe = Math.max(lipB + 4, ...towers.map((t) => t.cx + t.hx));
  const high = Math.max(...towers.map((t) => t.top + (t.roof === 'spire' || t.roof === 'hoarding' ? t.hz : 0)), ...towers.map((t) => t.flank?.top ?? -Infinity), deck((lipA + lipB) / 2) + 1.5);
  return {
    seed, picks, form, hw, xs, xe, lipA, lipB, yA, yB, hump, spans, piers, towers, gaps, tiers: spans.some((s) => s.sill !== null) ? tiers : 1, cutwaters,
    parapet: covered || rng.chance(0.3) ? 'plain' : 'crenels', covered, turrets: !covered && rng.chance(0.3), adds, low: lowY, high,
  };
}

/** What a player tells two fortified bridges apart by (style.ts Signature), and how much each counts. */
export const BRIDGE_WEIGHTS: Readonly<Record<string, number>> = {
  builder: 2, holder: 1, form: 1.5, spans: 1, tiers: 1.5, gates: 1, gateType: 1, mids: 1.5, covered: 1, fallen: 1, drawbridge: 0.5, state: 0.5, length: 1, height: 1, cutwaters: 0.5,
};
export function bridgeSignature(p: BridgePlan): Signature {
  const gates = p.towers.filter((t) => t.role === 'gate'), n = p.spans.length;
  return {
    builder: p.picks.builder.id, holder: p.picks.holder.id, form: p.form, spans: n <= 1 ? 1 : n <= 3 ? 3 : n <= 5 ? 5 : 7, tiers: p.tiers,
    gates: gates.length === 0 ? 'none' : gates.length === 2 ? 'both' : gates[0].cx < (p.lipA + p.lipB) / 2 ? 'A' : 'B',
    gateType: gates.length ? (gates[0].flank ? (gates[0].flank.keep ? 'keep' : 'twin') : 'block') : 'none',
    mids: p.towers.length - gates.length, covered: p.covered ? 1 : 0, fallen: p.gaps.filter((g) => g.fallen).length,
    drawbridge: p.gaps.some((g) => !g.fallen) ? 1 : 0, state: p.picks.state, length: Math.round((p.xe - p.xs) / 25), height: Math.round((p.high - p.low) / 10), cutwaters: p.cutwaters,
  };
}
export const bridgesApart = (a: BridgePlan, b: BridgePlan): number => apart(bridgeSignature(a), bridgeSignature(b), BRIDGE_WEIGHTS);

/** The bridge as one mesh in the building format, in its own frame (the road along x). */
export function fortifiedBridgeMesh(p: BridgePlan, ground: Ground): PlacedMesh {
  const k = new MeshKit(), rng = new Rng(deriveSeed(p.seed, 'bridge-mesh'));
  // Kept up, its stone is clean; the further it has fallen, the older and dirtier it looks.
  const site: Site = { k, rng, ground, moss: p.picks.moss, wear: fallen(p.picks.state) * 0.85 };
  const base = styleOf(p.picks.builder), style: Style = { ...base, floorTint: grimed(base.floorTint, site.wear!) }, fall = fallen(p.picks.state), hw = p.hw;
  const deck = (x: number) => deckAt(p, x);
  const towerX = p.towers.map((t) => [t.cx - t.hx, t.cx + t.hx] as const);
  // Masonry runs: from end to end, less the towers and the gaps.
  let runs: [number, number][] = [[p.xs, p.xe]];
  const cut = (a: number, b: number) => { runs = runs.flatMap(([x0, x1]) => (b <= x0 || a >= x1 ? [[x0, x1]] : [...(a > x0 ? [[x0, a]] : []), ...(b < x1 ? [[b, x1]] : [])]) as [number, number][]); };
  for (const [a, b] of towerX) cut(a, b);
  // A fallen span leaves a stub of its arch on one side; the run there ends ragged.
  const stubs = new Map<Gap, [number, number]>();
  for (const g of p.gaps) {
    if (!g.fallen) { cut(g.x0, g.x1); continue; }
    const w = g.x1 - g.x0, a = rng.range(0.08, 0.28) * w, b = rng.range(0.04, 0.2) * w;
    stubs.set(g, [g.x0 + a, g.x1 - b]);
    cut(g.x0 + a, g.x1 - b);
  }
  runs = runs.filter(([a, b]) => b - a > 0.3);
  const ragged = (x: number) => {
    let drop = 0;
    for (const [a, b] of stubs.values()) { const d = Math.min(Math.abs(x - a), Math.abs(x - b)); if (d < 3) drop = Math.max(drop, (3 - d) * 0.5 + rng.range(0, 0.4)); }
    return drop;
  };
  const openings: Opening[] = [];
  for (const s of p.spans) {
    openings.push(...s.lower);
    if (s.split > 0 && s.sill !== null) {
      // The upper tier in small arches, small piers between them.
      const sp = 1.2, w = (s.x1 - s.x0 - (s.split - 1) * sp) / s.split;
      for (let i = 0; i < s.split; i++) { const a = s.x0 + i * (w + sp), arch = s.arch; openings.push({ s0: a, s1: a + w, y0: s.sill, y1: deck((s.x0 + s.x1) / 2) - 1.2 - archRise(arch, w), arch }); }
    } else openings.push({ s0: s.x0, s1: s.x1, y0: s.sill ?? -1e4, y1: s.spring, arch: s.arch });
  }
  const tops = new Map<string, number>();
  for (const [x0, x1] of runs) {
    const sOps = openings.filter((o) => o.s1 > x0 && o.s0 < x1).map((o) => ({ ...o, s0: o.s0 - x0, s1: o.s1 - x0 }));
    const atTowerA = towerX.some(([, b]) => Math.abs(b - x0) < 0.01), atTowerB = towerX.some(([a]) => Math.abs(a - x1) < 0.01);
    const top = (s: number) => { const x = x0 + s, key = (Math.round(x * 4) / 4).toFixed(2); let d = tops.get(key); if (d === undefined) tops.set(key, (d = ragged(x))); return deck(x) - d; };
    wall(site, { a: [x0, -hw], b: [x1, -hw], ia: [x0, hw], ib: [x1, hw], base: null, top, openings: sOps, mat: style.wall, tint: style.tint, topMat: style.floor, topTint: style.floorTint, trimMat: style.trimMat, trimTint: style.trim, capA: atTowerA ? Infinity : undefined, capB: atTowerB ? Infinity : undefined, vary: 0.04 });
    parapets(site, style, p, x0, x1, deck, ragged);
    ornament(site, style, p, x0, x1, deck);
  }
  // Cutwaters on the piers that carry no tower, upstream and down.
  for (const pr of p.piers) {
    if (p.cutwaters === 'none' || towerX.some(([a, b]) => pr.x > a && pr.x < b)) continue;
    const hwp = pr.w / 2 - 0.05, top = p.cutwaters === 'refuge' ? deck(pr.x) : Math.min(...p.spans.map((s) => (Math.abs(s.x1 - (pr.x - pr.w / 2)) < 0.5 || Math.abs(s.x0 - (pr.x + pr.w / 2)) < 0.5 ? (s.lower[0]?.y1 ?? s.spring) : Infinity))) + 0.5;
    for (const side of [-1, 1]) {
      const z0 = side * hw, nose = side * (hw + pr.w * 0.75);
      const pts: P2[] = [[pr.x - hwp, z0], [pr.x, nose], [pr.x + hwp, z0]];
      prism(site, pts, null, top, style.wall, style.tint, { open: [2], apex: p.cutwaters === 'low' ? 1.4 : undefined, topMat: p.cutwaters === 'refuge' ? style.floor : style.trimMat, topTint: p.cutwaters === 'refuge' ? style.floorTint : style.trim });
      // A refuge's parapet round its nose: the two outer sides of the cutwater's ring, mitred at the nose.
      if (p.cutwaters === 'refuge') wallRing(pts, 0.4, () => ({ base: top, top: () => top + 1, mat: style.wall, tint: style.trim })).slice(0, 2).forEach((w) => wall(site, w));
    }
  }
  // Tall piers step out at their feet, a set-back or two each under its course, so a deep gorge's piers are no flat slabs.
  for (const pr of p.piers) {
    const near = p.spans.filter((q) => Math.abs(q.x1 - (pr.x - pr.w / 2)) < 0.5 || Math.abs(q.x0 - (pr.x + pr.w / 2)) < 0.5);
    if (!near.length) continue;
    const g = Math.min(lowAlong(ground, pr.x - pr.w / 2, hw), lowAlong(ground, pr.x, hw), lowAlong(ground, pr.x + pr.w / 2, hw));
    const H = Math.min(...near.map((q) => q.spring)) - g, n = H > 22 ? 2 : H > 9 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      // (Odd heights: a course never lies in one plane with a sill or a band.)
      const d = (n - i) * 0.55 * style.builder.thick, y = g + H * (i + 1) * (n === 2 ? 0.27 : 0.38) + 0.013 * (i + 1);
      prism(site, rect(pr.x, 0, pr.w / 2 + d, hw + d), null, y, style.wall, style.tint, { topMat: style.trimMat, topTint: style.trim });
    }
  }
  // Towers.
  for (const t of p.towers) {
    const floor = deck(t.cx), pts = rect(t.cx, 0, t.hx, t.hz), ways = { sides: [1, 3], half: Math.min(hw - 0.6, 2.2), spring: floor + 4.4 - archRise(p.spans[0]?.arch === 'flat' ? 'segmental' : style.builder.arches[0], 2 * Math.min(hw - 0.6, 2.2)), arch: style.builder.arches[0] === 'flat' ? 'segmental' as const : style.builder.arches[0] };
    tower(site, style, {
      pts, base: null, floor, top: t.top, roof: t.roof, thick: 1.1 * style.builder.thick, ways, broken: t.broken, fallSide: t.fallSide,
      rebuilt: t.rebuilt === null ? undefined : { y: t.rebuilt, mat: BuildingMat.Rubble, tint: rebuiltTint(style) }, slits: true, merlon: style.builder.merlon,
    });
    if (t.broken > 0.2) rubble(site, t.cx + rng.range(-3, 3), (t.fallSide === 0 ? -1 : t.fallSide === 2 ? 1 : rng.sign()) * (t.hz + 3), 4, 10, style.wall, style.tint, 1.2);
    if (!t.flank) continue;
    const f = t.flank, sides = f.keep ? [f.side] : [-1, 1];
    for (const side of sides) {
      const cz = side * (t.hz + f.r * (f.keep ? 1.1 : 0.55)), cx = t.cx + (f.keep ? (t.cx < (p.lipA + p.lipB) / 2 ? -1 : 1) * f.r * 0.4 : 0);
      const fp = f.shape === 'square' ? rect(cx, cz, f.r, f.r) : roundPts(cx, cz, f.r, f.shape === 'round' ? 14 : 8, f.shape === 'octagon' ? Math.PI / 8 : 0);
      tower(site, style, { pts: fp, base: null, floor: Math.max(ground(cx, cz), floor) + 0.35, top: f.top, roof: f.roof, thick: 1.2 * style.builder.thick, broken: f.broken, fallSide: rng.int(0, fp.length - 1), slits: true, merlon: style.builder.merlon });
    }
  }
  for (const g of p.gaps) patch(site, style, p, g, deck, stubs.get(g));
  if (p.covered) for (const [x0, x1] of runs) coveredWalk(site, style, p, x0, x1, deck);
  // The stump of a pier that fell with its spans.
  for (const g of p.gaps) for (const pr of p.piers) {
    if (!g.fallen || pr.x <= g.x0 || pr.x >= g.x1) continue;
    const foot = lowAlong(ground, pr.x, hw), y = foot + Math.max(1.5, (deck(pr.x) - foot) * rng.range(0.2, 0.5));
    prism(site, rect(pr.x, 0, pr.w / 2, hw), null, y, style.wall, style.tint);
    rubble(site, pr.x + rng.range(-1, 1), rng.range(-hw, hw), 2.5, 6, style.wall, style.tint, 1);
  }
  if (fall > 0) for (const g of p.gaps.filter((q) => q.fallen)) rubble(site, (g.x0 + g.x1) / 2, rng.range(-hw, hw), (g.x1 - g.x0) * 0.45, 18, style.wall, style.tint, 1.4);
  additions(site, style, p, deck, runs);
  return k.mesh();
}

/** Stone of a later, rougher hand: the builder's own colour gone warmer and darker. */
const rebuiltTint = (s: Style): Tint => [Math.round(s.tint[0] * 0.82 + 30), Math.round(s.tint[1] * 0.8 + 20), Math.round(s.tint[2] * 0.75 + 8)];

/** The parapets along a run, crenellated or plain, broken where it has decayed; gaps for refuges and turrets. */
function parapets(site: Site, style: Style, p: BridgePlan, x0: number, x1: number, deck: (x: number) => number, ragged: (x: number) => number): void {
  const { rng } = site, hw = p.hw, pt = 0.45 * Math.sqrt(style.builder.thick), fall = fallen(p.picks.state);
  const holes: [number, number][] = [];
  if (p.cutwaters === 'refuge') for (const pr of p.piers) holes.push([pr.x - pr.w / 2 + 0.05, pr.x + pr.w / 2 - 0.05]);
  if (p.turrets) p.piers.forEach((pr, i) => { if (i % 2 === 0) holes.push([pr.x - 1.4, pr.x + 1.4]); });
  // Decay: stretches where the parapet is gone.
  const lost: [number, number][] = [];
  for (let x = x0; x < x1; x += 4) if (rng.chance(fall * 0.4)) lost.push([x, x + rng.range(1.5, 5)]);
  const merlon = 0.9 * style.builder.merlon, gapW = 0.75;
  for (const side of [-1, 1]) {
    const pieces: [number, number][] = [];
    let at = x0;
    for (const [a, b] of [...holes, ...lost].filter(([a, b]) => b > x0 && a < x1).sort((q, r) => q[0] - r[0])) { if (a > at + 0.3) pieces.push([at, a]); at = Math.max(at, b); }
    if (x1 > at + 0.3) pieces.push([at, x1]);
    for (const [a, b] of pieces) {
      const len = b - a, breaks: number[] = [];
      if (p.parapet === 'crenels') for (let s = gapW / 2 - ((a - p.xs) % (merlon + gapW)); s < len; s += merlon + gapW) if (s > 0) breaks.push(s, s + merlon);
      const crenel = (s: number) => { if (p.parapet !== 'crenels') return 0; const u = (((a + s - p.xs - gapW / 2) % (merlon + gapW)) + merlon + gapW) % (merlon + gapW); return u < merlon ? 0.85 : 0; };
      const top = (s: number) => deck(a + s) + 1 + crenel(s) - (ragged(a + s) > 0 ? 1.5 : 0);
      const zo = side * hw, zi = side * (hw - pt);
      // (Its foot 5 mm over the deck: its face and the body's are one plane, and their columns' chords of a humped deck cross.)
      wall(site, { a: [a, zo], b: [b, zo], ia: [a, zi], ib: [b, zi], base: (s) => deck(a + s) + 0.005, top, stepped: true, breaks: breaks.filter((s) => s < len), mat: style.wall, tint: style.trim, vary: 0.03 });
    }
  }
}

/** The builder's dressing of a run: string courses, pilasters over the piers, figures on the parapet (the old realm). */
function ornament(site: Site, style: Style, p: BridgePlan, x0: number, x1: number, deck: (x: number) => number): void {
  const orn = style.builder.ornament, hw = p.hw;
  for (const side of [-1, 1]) {
    if (orn.includes('pilasters')) for (const pr of p.piers) {
      if (pr.x < x0 + 0.7 || pr.x > x1 - 0.7) continue;
      const y = deck(pr.x) - 0.6, z0 = side * hw, z1 = side * (hw + 0.2);
      prism(site, [[pr.x - 0.6, z0], [pr.x - 0.6, z1], [pr.x + 0.6, z1], [pr.x + 0.6, z0]], null, y, style.trimMat, style.trim, { open: [3] });
    }
    if (orn.includes('courses')) {
      // A course along the run under the parapet, on short level pieces so it follows the deck.
      for (let a = x0; a < x1 - 0.05; a += 2) {
        const b = Math.min(x1, a + 2), y = Math.min(deck(a), deck(b)) - 0.75, z0 = side * hw, z1 = side * (hw + 0.14);
        prism(site, [[a, z0], [a, z1], [b, z1], [b, z0]], y, y + 0.28, style.trimMat, style.trim, { open: [3] });
      }
    }
    if (orn.includes('statues') && p.parapet === 'plain') for (const pr of p.piers) {
      if (pr.x < x0 + 1 || pr.x > x1 - 1 || site.rng.chance(0.4)) continue;
      statue(site, pr.x, side * (hw - 0.6), deck(pr.x) + 1, style.trimMat, style.trim, p.picks.state === 'broken' || p.picks.state === 'ruinous');
    }
  }
  // Corbelled turrets over every other pier, on alternate sides.
  if (p.turrets) p.piers.forEach((pr, i) => {
    if (i % 2 !== 0 || pr.x < x0 + 1 || pr.x > x1 - 1) return;
    const side = i % 4 === 0 ? -1 : 1, cz = side * (hw + 0.4), y = deck(pr.x), pts = roundPts(pr.x, cz, 1.35, 8, Math.PI / 8);
    wallRing(pts, 0.35, () => ({ base: y - 1.2, top: () => y + 2.6, openings: [], mat: style.wall, tint: style.trim })).forEach((w) => wall(site, w));
    floorOf(site.k, pts, y - 1.2, style.wall, style.trim, false);
    spire(site.k, pts, y - 1.2, y - 2.8, style.wall, style.trim, false);
    spire(site.k, roundPts(pr.x, cz, 1.7, 8, Math.PI / 8), y + 2.6, y + 2.6 + 2.4 * style.builder.tall, style.roof, style.roofTint);
  });
}

/** A gap crossed again: planks on beams, a trestle, a rope bridge, or a drawbridge, down or raised. */
function patch(site: Site, style: Style, p: BridgePlan, g: Gap, deck: (x: number) => number, stub?: [number, number]): void {
  const { k, rng, ground } = site, [x0, x1] = stub ?? [g.x0, g.x1], hw = p.hw, wood = style.timber;
  const plank = (a: number, b: number, half: number, y: (x: number) => number) => {
    for (let x = a; x < b - 0.1; x += 0.34) {
      if (rng.chance(0.06)) continue;
      const yy = y(x + 0.15);
      beam(k, [x + 0.15, yy, -half], [x + 0.15, yy, half], 0.3, 0.08, CellarMat.Boards, scaleTint(wood, rng.range(0.8, 1.15)));
    }
  };
  if (g.patch === 'drawbridge' || g.patch === 'raised') {
    // The timber deck hinged at the gate tower's face; chains from high on the tower.
    const gateAt = p.towers.find((t) => Math.abs(t.cx + t.hx - x0) < 0.1 || Math.abs(t.cx - t.hx - x1) < 0.1);
    const hinge = gateAt && Math.abs(gateAt.cx + gateAt.hx - x0) < 0.1 ? x0 : x1, dir = hinge === x0 ? 1 : -1, len = x1 - x0, y = deck(hinge);
    const ang = g.patch === 'raised' ? 1.25 : 0, end = [hinge + dir * len * Math.cos(ang), y - 0.2 + len * Math.sin(ang), 0];
    beam(k, [hinge, y - 0.2, 0], end, 2 * hw - 1.4, 0.35, CellarMat.Boards, wood);
    for (const z of [-hw + 1, hw - 1]) beam(k, [hinge, y + 5.2, z], [end[0], end[1] + 0.1, z], 0.08, 0.08, BuildingMat.Slate, [56, 54, 52]);
    return;
  }
  if (g.patch === 'rope') {
    // A rope bridge sagging across, narrow, with hand ropes.
    const len = x1 - x0, sag = len * 0.07, y = (x: number) => deck(x0) + (deck(x1) - deck(x0)) * ((x - x0) / len) - sag * Math.sin((Math.PI * (x - x0)) / len) - 0.2;
    plank(x0, x1, 0.75, y);
    for (const z of [-0.8, 0.8]) for (let x = x0; x < x1 - 0.01; x += 2) {
      const b = Math.min(x1, x + 2);
      beam(k, [x, y(x) + 1.05, z], [b, y(b) + 1.05, z], 0.05, 0.05, CellarMat.Limewash, [150, 126, 92]);
      beam(k, [x, y(x) - 0.05, z], [b, y(b) - 0.05, z], 0.05, 0.05, CellarMat.Limewash, [150, 126, 92]);
      beam(k, [x, y(x), z], [x, y(x) + 1.05, z], 0.04, 0.04, CellarMat.Limewash, [150, 126, 92]);
    }
    return;
  }
  // Planks on two beams; a trestle of posts under them where the gap is long.
  const y = (x: number) => Math.min(deck(x0), deck(x1)) + (x - x0) * 0 - 0.05;
  for (const z of [-hw + 1.2, hw - 1.2]) beam(k, [x0 - 0.5, y(x0) - 0.3, z], [x1 + 0.5, y(x1) - 0.3, z], 0.35, 0.4, BuildingMat.Oak, scaleTint(wood, 0.85));
  plank(x0, x1, hw - 0.9, y);
  if (g.patch === 'trestle' || x1 - x0 > 12) for (let x = x0 + 3; x < x1 - 1.5; x += 4) {
    const gy = Math.min(ground(x, -hw + 1.2), ground(x, hw - 1.2));
    for (const z of [-hw + 1.2, hw - 1.2]) beam(k, [x, gy - 0.5, z * 1.15], [x, y(x) - 0.5, z], 0.3, 0.3, BuildingMat.Oak, wood);
    beam(k, [x, gy + 0.5, -hw + 1.2], [x, y(x) - 0.8, hw - 1.2], 0.16, 0.16, BuildingMat.Oak, wood);
  }
  // A rail of poles on one side.
  for (let x = x0; x < x1; x += 2.5) beam(k, [x, y(x), hw - 1.1], [Math.min(x1, x + 2.5), y(x) + 1, hw - 1.1], 0.08, 0.08, BuildingMat.Oak, wood);
}

/** A covered walk: posts inside the parapets, a beam along each side, a gable roof over the deck in short pieces. */
function coveredWalk(site: Site, style: Style, p: BridgePlan, x0: number, x1: number, deck: (x: number) => number): void {
  const { k } = site, hz = p.hw - 0.75;
  for (let a = x0; a < x1 - 1.5; a += 6) {
    const b = Math.min(x1, a + 6), y = Math.max(deck(a), deck(b)) + 2.7, over = 0.5;
    for (const x of [a + 0.3, b - 0.3]) for (const z of [-hz, hz]) beam(k, [x, deck(x) - 0.1, z], [x, y, z], 0.22, 0.22, BuildingMat.Oak, style.timber);
    for (const z of [-hz, hz]) beam(k, [a, y - 0.15, z], [b, y - 0.15, z], 0.2, 0.25, BuildingMat.Oak, style.timber);
    gable(k, (a + b) / 2, 0, (b - a) / 2 - over, hz, 0, y, y + hz * 0.75, style.roof, style.roofTint, over);
  }
}

/** What the holders have added, by the plan's list. */
function additions(site: Site, style: Style, p: BridgePlan, deck: (x: number) => number, runs: [number, number][]): void {
  const { rng, ground } = site, hw = p.hw, cloth = p.picks.holder.cloth, land = onLand(ground), wood = style.timber;
  const onDeck: Floor = (x) => deck(x), free = room();
  const gateA = p.towers.some((t) => t.role === 'gate' && t.cx < p.lipA + 5), gateB = p.towers.some((t) => t.role === 'gate' && t.cx > p.lipB - 5);
  // The open end (no gatehouse) is where they bar the way; their camp is on that bank.
  const endA = !gateA || (gateB && rng.chance(0.5)), end = endA ? p.lipA : p.lipB, out = endA ? -1 : 1;
  const bank = (dx: number, dz: number): P2 => [end + out * dx, dz];
  const deckRun = runs.filter(([a, b]) => b - a > 6);
  const onRun = (): number | null => { if (!deckRun.length) return null; const [a, b] = rng.pick(deckRun); return rng.range(a + 2, b - 2); };
  for (const add of p.adds) switch (add) {
    case 'barricade': { const x = end - out * 4; if (deckRun.some(([a, b]) => x > a && x < b)) barricade(site, [x, -hw + 0.7], [x, hw - 2.2], onDeck, wood); else barricade(site, bank(6, -4), bank(6, 3), land, wood); break; }
    case 'palisade': { const c = bank(rng.range(16, 22), rng.sign() * rng.range(12, 16)); palisade(site, rect(c[0], c[1], rng.range(7, 10), rng.range(6, 8), rng.range(-0.2, 0.2)), land, wood, rng.int(0, 3)); for (let i = 0; i < 2; i++) tent(site, c[0] + rng.range(-3, 3), c[1] + rng.range(-2, 2), rng.pick(cloth), rng.range(0, Math.PI * 2)); break; }
    case 'lookout': {
      const t = p.towers.find((q) => q.roof === 'crenels' && q.broken === 0);
      if (t) lookout(site, t.cx, 0, t.top - 1.2, 2.2, wood, rng.pick(cloth));
      else { const c = bank(8, -(hw + 6)); lookout(site, c[0], c[1], ground(c[0], c[1]), rng.range(6, 8), wood, rng.pick(cloth)); }
      break;
    }
    case 'tents': for (let i = 0; i < 3; i++) { const c = bank(rng.range(10, 24), rng.sign() * rng.range(7, 16)); tent(site, c[0], c[1], rng.pick(cloth), rng.range(0, Math.PI * 2)); } break;
    case 'cart': { const x = onRun(); if (x !== null) cart(site, x, rng.range(-1, 1), onDeck, wood, rng.range(-0.4, 0.4) + Math.PI / 2, rng.chance(0.5)); break; }
    case 'banners': for (const t of p.towers) if (t.broken === 0 && t.roof !== 'spire' && t.roof !== 'hoarding') banner(site, t.cx, 0, t.top - 1.2, 4, rng.pick(cloth), Math.PI / 2, p.picks.holder.id === 'undead'); else banner(site, t.cx - t.hx - 1, -hw + 1, deck(t.cx - t.hx - 1), 4.5, rng.pick(cloth), 0, p.picks.holder.id === 'undead'); break;
    case 'hides': for (const [a, b] of deckRun) for (let x = a + 2; x < b - 1; x += rng.range(4, 7)) pelt(site, x, deck(x) - 1.6, -hw, [0, -1], rng.range(1.1, 1.6), rng.pick(cloth)); break;
    case 'spikes': for (const [a, b] of deckRun) for (const side of [-1, 1]) if (rng.chance(0.7)) { const s = rng.range(a + 1, Math.max(a + 1.5, b - 6)); stakeRow(site, [s, side * (hw - 0.2)], [Math.min(b - 0.5, s + rng.range(3, 6)), side * (hw - 0.2)], (x) => deck(x) + 1, scaleTint(wood, 0.9), 1.3, [0, side], 0.45); } break;
    case 'skulls': for (let i = 0; i < 6; i++) { const c = bank(rng.range(2, 8), rng.sign() * rng.range(hw + 1, hw + 4)); const y = ground(c[0], c[1]); site.k.footed(() => beam(site.k, [c[0], y - 0.4, c[1]], [c[0], y + 2, c[1]], 0.1, 0.1, BuildingMat.Oak, wood)); skull(site, c[0], y + 2, c[1], 0.28); } break;
    case 'totem': { const c = bank(rng.range(5, 9), rng.sign() * (hw + rng.range(2, 4))); totem(site, c[0], c[1], ground(c[0], c[1]), rng.pick(cloth)); break; }
    case 'ropes': for (const [a, b] of deckRun) { if (!rng.chance(0.6)) continue; const x = rng.range(a + 1, b - 1), side = rng.sign(), z = side * (hw + 0.15), y = deck(x) + 0.9; rope(site, x, y, z, Math.max(2, y - ground(x, z)), true); } break;
    case 'cages': { const t = p.towers[0]; if (t) { const side = rng.sign(), z = side * (t.hz + 1.6), y = Math.min(t.top - 2.3, deck(t.cx) + 7); beam(site.k, [t.cx, y, side * (t.hz - 0.3)], [t.cx, y, z], 0.2, 0.2, BuildingMat.Oak, wood); cage(site, t.cx, y, z); } break; }
    case 'graves': for (let i = 0; i < 7; i++) { const c = bank(rng.range(9, 26), rng.sign() * rng.range(hw + 4, 18)); if (free(c[0], c[1], 1.3)) grave(site, c[0], c[1], ground, rng.range(0, Math.PI * 2), style.trim); } break;
    case 'bones': for (let i = 0; i < 3; i++) { const x = onRun(); if (x !== null) bones(site, x, rng.range(-hw + 1, hw - 1), onDeck); } break;
    case 'coffins': for (let i = 0; i < 2; i++) { const x = onRun(), z = rng.range(-hw + 1.5, hw - 1.5); if (x !== null && free(x, z, 1.2)) coffin(site, x, z, deck(x), rng.range(0, Math.PI), wood); } break;
  }
}
