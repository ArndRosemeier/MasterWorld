/**
 * The solution former (D63, phase K2; docs/design/caves.md 3.2; pure, seeded, runs in a worker): water opens limestone.
 *
 * Water seeps from the sinks to the springs along a coarse 3D lattice, on the joints and bedding planes. Each round the
 * water takes the way of least resistance (a multi-source Dijkstra from the springs, so every sink follows its parent
 * pointers down), the flow of each path is summed, and every path widens in proportion to its flow, which draws in more
 * flow. After some rounds a few paths have won (branchwork); dense joints, many sinks and an uneven rock keep many
 * (a network maze); a thin soluble bed with jittered ease keeps several near-equal paths (braids).
 *
 * The water table drops in stages (the valley cuts deeper): each stage opens the rock again for the water table of
 * its time, and what the older stages opened stays open. Below its table a path is a phreatic tube, above it a vadose
 * canyon; an old tube cut by a later stream is a keyhole. Where passages cross or span too wide, the ceiling falls.
 */
import { MinHeap, Noise, Rng, deriveSeed, lerp } from '@futuremagic/core';
import type { CavesDef } from '../../setting/contract';
import { bedCoord, bedEdgeDistance, bedIndex, faultDistance, jointDistance, type RockBlock } from './block';
import type { CondPoint, Conduit, Skeleton, Void } from './skeleton';

/** The 18 neighbour offsets; the first 9 are the "forward" ones, an edge belongs to the node it goes forward from. */
const DIRS: [number, number, number][] = [];
for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
  // Faces and edges of the cube only (18 neighbours): the corners cost a third more time and add little.
  if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 2 || (dx === 0 && dy === 0 && dz === 0)) continue;
  if (dz > 0 || (dz === 0 && (dy > 0 || (dy === 0 && dx > 0)))) DIRS.unshift([dx, dy, dz]);
  else DIRS.push([dx, dy, dz]);
}
const FWD = 9;
const LEN = DIRS.map(([x, y, z]) => Math.hypot(x, y, z));
/** The slot of the direction opposite to d (an edge is stored under the forward one of the pair). */
const OPP = DIRS.map(([x, y, z]) => DIRS.findIndex((o) => o[0] === -x && o[1] === -y && o[2] === -z));

/** Share of a path's own ease the vadose zone costs along the level and downward (a stream runs best down). */
const LEVEL_COST = 1.15, DROP_COST = 0.95;
/** Rising in a tube costs a bit more than running level. */
const RISE_COST = 0.2;
/** Passages along the water table are a little cheaper (water-table caves). */
const TABLE_BONUS = 0.9;

/** Integer hash to 0..1. */
function hashf(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

interface EdgeRec {
  /** The largest share of the water the edge carried as a tube (below the table of its stage) and as a canyon (above). */
  ph: number;
  va: number;
  /** Stage of the larger. */
  stage: number;
  best: number;
  /** Did it carry water in the last stage? */
  act: boolean;
}

export function formSolution(block: RockBlock, caves: CavesDef, scale: number, h: number, time: () => number = Date.now): Skeleton {
  const t0 = time();
  const rock = block.rock, fm = rock.former;
  const nx = Math.ceil(block.across / h) + 1, ny = Math.ceil(block.deep / h) + 1, nz = nx, N = nx * ny * nz, E = N * FWD;
  const rng = new Rng(deriveSeed(block.seed, 'cave', 'solution'));
  const node = (i: number, j: number, k: number) => i + nx * (j + ny * k);

  // --- the lattice: what each node is in the rock ---
  const ease = new Float32Array(N), easeNoise = new Noise(deriveSeed(block.seed, 'cave', 'ease'));
  const sol = new Float32Array(N), bprox = new Float32Array(N), fprox = new Float32Array(N), jprox = block.joints.map(() => new Float32Array(N));
  const tauJ = 0.55 * h, tauF = 0.9 * h, tauB = Math.max(0.45 * h, 0.8);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = node(i, j, k), x = i * h, y = j * h, z = k * h;
    const bi = bedIndex(block.beds, bedCoord(block.beds, x, y, z)), d = bedEdgeDistance(block.beds, x, y, z);
    sol[n] = block.beds.sol[bi];
    // The rock is not even over a few metres either: soft and hard patches the water winds round.
    ease[n] = Math.exp(rock.former.noise * 1.5 * (0.7 * easeNoise.n3(x / 17, y / 11, z / 17) + 0.3 * easeNoise.n3(x / 6 + 31, y / 5, z / 6)));
    bprox[n] = Math.exp(-((d / tauB) ** 2)) * sol[n];
    block.joints.forEach((set, s) => { jprox[s][n] = Math.exp(-((jointDistance(set, x, z) / tauJ) ** 2)); });
    let f = 0;
    for (const fl of block.faults) f = Math.max(f, Math.exp(-((faultDistance(fl, x, y, z) / tauF) ** 2)));
    fprox[n] = f;
  }

  // --- the ease of every edge (a conductance; the water's cost is length over this) ---
  const bn = Math.hypot(block.beds.slope, 1), nbx = -block.beds.slope * block.beds.ux / bn, nby = 1 / bn, nbz = -block.beds.slope * block.beds.uz / bn;
  const para = DIRS.map(([dx, dy, dz], d) => (1 - Math.abs((dx * nbx + dy * nby + dz * nbz) / LEN[d])) ** 2);
  const align = block.joints.map((s) => DIRS.map(([dx, , dz], d) => (1 - ((dx * s.nx + dz * s.nz) / LEN[d]) ** 2) ** 2));
  const cond = new Float32Array(E);
  const eseed = deriveSeed(block.seed, 'cave', 'ease');
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u = node(i, j, k);
    for (let d = 0; d < FWD; d++) {
      const i2 = i + DIRS[d][0], j2 = j + DIRS[d][1], k2 = k + DIRS[d][2];
      if (i2 < 0 || j2 < 0 || k2 < 0 || i2 >= nx || j2 >= ny || k2 >= nz) continue;
      const v = node(i2, j2, k2), solMid = (sol[u] + sol[v]) / 2;
      let c = 0.1 + 0.9 * solMid;
      c *= 1 + rock.bedding.parting * Math.min(bprox[u], bprox[v]) * para[d];
      let jb = 0;
      for (let s = 0; s < jprox.length; s++) jb = Math.max(jb, Math.min(jprox[s][u], jprox[s][v]) * align[s][d]);
      c *= 1 + rock.joints.strength * jb;
      c *= 1 + rock.faults.strength * Math.min(fprox[u], fprox[v]);
      // The rock is not even: cracks and pockets make some edges easy, some hard.
      c *= (1 + fm.noise * (2 * hashf(eseed, u * FWD + d) - 1) * 0.9) * Math.sqrt(ease[u] * ease[v]);
      cond[u * FWD + d] = c;
    }
  }
  const cond0 = cond.slice();
  const tPrep = time();

  // --- the stages: flow, widen, repeat ---
  const heap = new MinHeap();
  const dist = new Float64Array(N), parent = new Int32Array(N), pedge = new Int32Array(N), order = new Int32Array(N), flow = new Float64Array(N), isSink = new Uint8Array(N);
  const rf = new Float32Array(E), sf = new Float32Array(E), mark = new Uint8Array(E), smark = new Uint8Array(E);
  const clampTo = (v: number, hi: number) => Math.max(0, Math.min(hi - 1, v));
  const nodeNear = (x: number, y: number, z: number) => node(clampTo(Math.round(x / h), nx), clampTo(Math.round(y / h), ny), clampTo(Math.round(z / h), nz));
  const sinkNodes = block.water.sinks.map((s) => ({ n: nodeNear(s.x, s.y, s.z), flow: s.flow }));
  const totalFlow = sinkNodes.reduce((a, s) => a + s.flow, 0);
  const rec = new Map<number, EdgeRec>();
  const lastStage = block.water.stages.length - 1;
  let runs = 0, noiseKey = 0;

  /** One flow: every sink's water to the springs by the cheapest way; adds each edge's share to `rf`. */
  const run = (springNodes: readonly number[], table: number, jitter: number, touched: number[]): void => {
    runs++;
    dist.fill(Infinity);
    heap.clear();
    isSink.fill(0);
    for (const s of sinkNodes) isSink[s.n] = 1;
    let left = new Set(sinkNodes.map((s) => s.n)).size, settled = 0;
    for (const s of springNodes) { dist[s] = 0; parent[s] = -1; pedge[s] = -1; heap.push(0, s); }
    const loop = rock.water.loop, nk = noiseKey++;
    while (heap.size && left > 0) {
      const p = heap.pop(), dp = heap.lastPriority;
      if (dp > dist[p]) continue;
      order[settled++] = p;
      if (isSink[p]) left--;
      const pi = p % nx, pj = ((p / nx) | 0) % ny, pk = (p / (nx * ny)) | 0, yp = pj * h;
      for (let d = 0; d < DIRS.length; d++) {
        const q_i = pi + DIRS[d][0], q_j = pj + DIRS[d][1], q_k = pk + DIRS[d][2];
        if (q_i < 0 || q_j < 0 || q_k < 0 || q_i >= nx || q_j >= ny || q_k >= nz) continue;
        const q = node(q_i, q_j, q_k), e = d < FWD ? p * FWD + d : q * FWD + OPP[d];
        // The water flows from q to p. Height of q and p; the edge's length.
        const yq = q_j * h, len = LEN[d] * h, dy = yp - yq;
        let f: number;
        if (yq > table) {
          // Vadose: water only runs level or down.
          if (dy > 0) continue;
          f = LEVEL_COST + (DROP_COST - LEVEL_COST) * (-dy / len);
        } else {
          const depth = table - yq;
          if (depth > loop) continue;
          f = 1 + (dy > 0 ? RISE_COST * dy / len : 0) + 0.8 * (depth / loop) ** 2;
        }
        if (Math.abs((yq + yp) / 2 - table) < h) f *= TABLE_BONUS;
        const c = cond[e];
        if (c <= 0) continue;
        const nd = dp + len * f / (c * (1 + jitter * (2 * hashf(e, nk) - 1)));
        if (nd < dist[q]) { dist[q] = nd; parent[q] = p; pedge[q] = e; heap.push(nd, q); }
      }
    }
    // Sum the flow back from the sinks to the springs, in reverse order of settling.
    flow.fill(0, 0, N);
    for (const s of sinkNodes) if (dist[s.n] < Infinity) flow[s.n] += s.flow;
    for (let o = settled - 1; o >= 0; o--) {
      const u = order[o], par = parent[u];
      if (par < 0 || flow[u] === 0) continue;
      flow[par] += flow[u];
      const e = pedge[u];
      if (!mark[e]) { mark[e] = 1; touched.push(e); }
      rf[e] += flow[u] / totalFlow;
    }
  };

  const stages = block.water.stages;
  for (let s = 0; s < stages.length; s++) {
    const table = stages[s].table, springNodes = stages[s].springs.map((p) => nodeNear(p.x, p.y, p.z));
    // The water table dropped: old passages stay open, but silt and the lower water take some of their ease.
    if (s > 0) for (const e of rec.keys()) cond[e] = cond0[e] * (cond[e] / cond0[e]) ** fm.reuse;
    const stageTouched: number[] = [];
    let wsum = 0;
    for (let r = 0; r < fm.rounds; r++) wsum += (r + 1) ** 2;
    for (let r = 0; r < fm.rounds; r++) {
      const touched: number[] = [];
      for (let m = 0; m < fm.samples; m++) run(springNodes, table, fm.noise * 0.8, touched);
      const w = (r + 1) ** 2 / wsum;
      for (const e of touched) {
        const share = rf[e] / fm.samples;
        cond[e] *= (1 + fm.growth * Math.sqrt(Math.min(1, share))) ** fm.feedback;
        if (!smark[e]) { smark[e] = 1; stageTouched.push(e); }
        sf[e] += share * w;
        rf[e] = 0; mark[e] = 0;
      }
    }
    for (const e of stageTouched) {
      const share = sf[e];
      sf[e] = 0; smark[e] = 0;
      if (share < fm.keep) continue;
      const u = (e / FWD) | 0, d = e % FWD, yMid = (((u / nx) | 0) % ny) * h + DIRS[d][1] * h / 2;
      let r = rec.get(e);
      if (!r) { r = { ph: 0, va: 0, stage: s, best: 0, act: false }; rec.set(e, r); }
      if (yMid <= table) r.ph = Math.max(r.ph, share); else r.va = Math.max(r.va, share);
      if (share > r.best) { r.best = share; r.stage = s; }
      if (s === lastStage) r.act = true;
    }
  }
  const tFlow = time();

  // --- the network of kept edges, from the springs ---
  const springNodes = new Set(stages.flatMap((st) => st.springs.map((p) => nodeNear(p.x, p.y, p.z))));
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number, e: number) => { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b, e); };
  for (const e of rec.keys()) { const u = (e / FWD) | 0, v = u + DIRS[e % FWD][0] + nx * (DIRS[e % FWD][1] + ny * DIRS[e % FWD][2]); link(u, v, e); link(v, u, e); }
  const reach = new Set<number>(), todo = [...springNodes].filter((n) => adj.has(n));
  for (const n of todo) reach.add(n);
  while (todo.length) {
    const a = todo.pop()!, nb = adj.get(a)!;
    for (let i = 0; i < nb.length; i += 2) if (!reach.has(nb[i])) { reach.add(nb[i]); todo.push(nb[i]); }
  }
  for (const n of [...adj.keys()]) if (!reach.has(n)) adj.delete(n);
  // (Whatever a reached node touches is reached too, so what is left is consistent.)
  let degrees = 0;
  for (const nb of adj.values()) degrees += nb.length / 2;
  const net: Net = { adj, rec, nx, ny, h, bprox, jprox, springNodes, sinkNodes: sinkNodes.map((s) => s.n), totalFlow, edgeCount: degrees / 2 };
  const tChains0 = time();
  const out = shape(block, caves, scale, net, rng);
  const tEnd = time();
  return { ...out, stats: { ...out.stats, nodes: N, runs, ms: { prep: tPrep - t0, flow: tFlow - tPrep, chains: tEnd - tChains0 } } };
}

/** What the flow left: the kept edges as a graph and what the nodes are in the rock. */
interface Net {
  /** Node to [neighbour, edge, neighbour, edge, ...]. */
  readonly adj: Map<number, number[]>;
  readonly rec: Map<number, EdgeRec>;
  readonly nx: number;
  readonly ny: number;
  readonly h: number;
  readonly bprox: Float32Array;
  readonly jprox: readonly Float32Array[];
  readonly springNodes: ReadonlySet<number>;
  readonly sinkNodes: readonly number[];
  readonly totalFlow: number;
  readonly edgeCount: number;
}

/** A chain of lattice nodes between two ends or junctions (or round a loop), with what each node carries. */
interface Chain {
  readonly nodes: number[];
}

/** The section of a point from what the water did there. */
interface Wet { ph: number; va: number; pb: number; jb: number; stage: number; act: boolean }

/** The shortest stretch of a way cut as one straight piece, metres (a wider way is cut in longer pieces). */
const SEG = 1.6;

/** Chains, smoothed and cut into points with sections, voids, shafts and mouths: the skeleton. */
function shape(block: RockBlock, caves: CavesDef, scale: number, net: Net, rng: Rng): Omit<Skeleton, 'stats'> & { stats: Omit<Skeleton['stats'], 'nodes' | 'runs' | 'ms'> & { ms?: never } } {
  const { adj, rec, nx, ny, h } = net, way = caves.way, rock = block.rock;
  const noise = new Noise(deriveSeed(block.seed, 'cave', 'wander'));
  const xyz = (n: number): [number, number, number] => [(n % nx) * h, (((n / nx) | 0) % ny) * h, ((n / (nx * ny)) | 0) * h];
  const stageN = block.water.stages.length;
  const wetOf = (n: number): Wet => {
    const w: Wet = { ph: 0, va: 0, pb: net.bprox[n] * Math.min(1, rock.bedding.parting / 2), jb: 0, stage: 0, act: false };
    let best = -1;
    const nb = adj.get(n) ?? [];
    for (let i = 1; i < nb.length; i += 2) {
      const r = rec.get(nb[i])!;
      w.ph = Math.max(w.ph, r.ph); w.va = Math.max(w.va, r.va); w.act ||= r.act;
      if (r.best > best) { best = r.best; w.stage = r.stage; }
    }
    for (const j of net.jprox) w.jb = Math.max(w.jb, j[n]);
    return w;
  };
  const degreeOf = (n: number) => (adj.get(n)?.length ?? 0) / 2;

  // Chains: from each end or junction along its edges to the next.
  const used = new Set<number>(), chains: Chain[] = [];
  const followChain = (start: number, nb: number, e: number): void => {
    const nodes = [start];
    let cur = nb, edge = e;
    used.add(edge);
    nodes.push(cur);
    while (degreeOf(cur) === 2 && cur !== start) {
      const list = adj.get(cur)!, k = list[1] === edge ? 2 : 0;
      edge = list[k + 1]; cur = list[k];
      if (used.has(edge)) break;
      used.add(edge); nodes.push(cur);
    }
    chains.push({ nodes });
  };
  for (const [n, list] of adj) if (degreeOf(n) !== 2) for (let i = 0; i < list.length; i += 2) if (!used.has(list[i + 1])) followChain(n, list[i], list[i + 1]);
  for (const [n, list] of adj) for (let i = 0; i < list.length; i += 2) if (!used.has(list[i + 1])) followChain(n, list[i], list[i + 1]);

  const rMax = way.maxRadius * scale, Amin = way.minWidth / 2 + 0.1, Bmin = way.minHeight / 2 + 0.1;
  /** A section from what the water did at a point; `m` and `n` vary the size along the way (noise, -1..1). */
  const section = (w: Wet, m: number, n: number): { A: number; B: number; C: number; D: number } => {
    let A: number, B: number, C = 0, D = 0;
    if (w.ph > 0) {
      const tube = w.ph ** 0.7;
      A = lerp(Amin, rMax, tube) * (1 + 0.9 * w.pb - 0.35 * w.jb);
      B = lerp(Bmin, rMax * 0.5, tube) * (1 - 0.25 * w.pb + 0.5 * w.jb);
    } else { A = Amin; B = Bmin; }
    if (w.va > 0) {
      const v = w.va;
      C = lerp(Amin, 3.2 * Math.sqrt(scale), v ** 0.5);
      D = way.maxCut * scale * v ** 0.6;
      if (w.ph <= 0) A = C;
    }
    A = Math.max(Amin, A * (1 + 0.45 * m)); B = Math.max(Bmin, B * (1 + 0.35 * n));
    return { A, B, C: C > 0 ? Math.max(Amin, C * (1 + 0.2 * n)) : 0, D };
  };

  // Smooth the chains' lattice zigzag, cut them into points, and give each point a section.
  const smoothed = new Map<number, [number, number, number]>();
  const conduits: Conduit[] = [];
  let length = 0;
  const levelOf = (nodes: number[]) => Math.min(stageN - 1, Math.round(nodes.reduce((a, n) => a + wetOf(n).stage, 0) / nodes.length));
  for (const ch of chains) {
    const ns = ch.nodes, P = ns.map(xyz), W = ns.map(wetOf);
    for (let it = 0; it < 3; it++) {
      const Q = P.map((p) => [...p] as [number, number, number]);
      for (let i = 1; i < P.length - 1; i++) for (let a = 0; a < 3; a++) Q[i][a] = lerp(P[i][a], (P[i - 1][a] + P[i + 1][a]) / 2, 0.55);
      for (let i = 0; i < P.length; i++) P[i] = Q[i];
    }
    ns.forEach((n, i) => { if (!smoothed.has(n)) smoothed.set(n, P[i]); });
    const pts: CondPoint[] = [];
    const cr = (a: number, b: number, c: number, d: number, t: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    for (let i = 0; i + 1 < P.length; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const e0 = i === 0 ? [2 * p1[0] - p2[0], 2 * p1[1] - p2[1], 2 * p1[2] - p2[2]] : p0, e3 = i + 2 >= P.length ? [2 * p2[0] - p1[0], 2 * p2[1] - p1[1], 2 * p2[2] - p1[2]] : p3;
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]), steps = Math.max(1, Math.ceil(segLen / Math.min(5, Math.max(SEG, 1.1 * Math.max(Amin, section(W[i], 0, 0).A))))), last = i + 2 >= P.length;
      for (let s = 0; s < steps + (last ? 1 : 0); s++) {
        const t = s / steps;
        let x = cr(e0[0], p1[0], p2[0], e3[0], t), y = cr(e0[1], p1[1], p2[1], e3[1], t), z = cr(e0[2], p1[2], p2[2], e3[2], t);
        const w: Wet = {
          ph: lerp(W[i].ph, W[i + 1].ph, t), va: lerp(W[i].va, W[i + 1].va, t), pb: lerp(W[i].pb, W[i + 1].pb, t), jb: lerp(W[i].jb, W[i + 1].jb, t), stage: W[i].stage, act: W[i].act,
        };
        const m = noise.n3(x / 10 + 40, y / 10, z / 10), n = noise.n3(x / 8, y / 8 + 60, z / 8), sec = section(w, m, n);
        // The way wanders a little off the lattice's smoothed line; a point on the chain's ends stays (junctions meet).
        if (!(i === 0 && s === 0) && !(last && s === steps)) {
          const amp = Math.min(1.3, 0.3 * sec.A);
          x += noise.n3(x / 13 + 7, y / 13, z / 13) * amp; y += noise.n3(x / 13, y / 13 + 9, z / 13) * amp * 0.6; z += noise.n3(x / 13, y / 13, z / 13 + 11) * amp;
        }
        pts.push({ x, y, z, A: sec.A, B: sec.B, C: sec.C, D: sec.D, flow: Math.max(w.ph, w.va) });
      }
    }
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    conduits.push({ kind: 'passage', points: pts, level: levelOf(ns), active: W.some((w) => w.act) });
  }

  // Collapse voids: at junctions of big passages and where one spans too wide, the ceiling falls.
  const voids: Void[] = [], vrng = rng.fork('collapse'), c = rock.collapse, apart = 24 * scale;
  const cands: { x: number; y: number; z: number; A: number; B: number; weight: number }[] = [];
  for (const n of adj.keys()) {
    if (degreeOf(n) < 3) continue;
    const w = wetOf(n), [x, y, z] = smoothed.get(n) ?? xyz(n), sec = section(w, 0, 0), f = Math.max(w.ph, w.va);
    cands.push({ x, y, z, A: sec.A, B: sec.B, weight: c.junction * Math.min(1, f * 4) });
  }
  for (const ch of conduits) {
    let wide = ch.points[0];
    for (const p of ch.points) if (p.A > wide.A) wide = p;
    if (wide.A >= c.span * scale) cands.push({ x: wide.x, y: wide.y, z: wide.z, A: wide.A, B: wide.B, weight: 0.45 });
  }
  cands.sort((a, b) => b.A * b.weight - a.A * a.weight);
  for (const k of cands) {
    if (voids.length >= c.most) break;
    if (!vrng.chance(k.weight) || voids.some((v) => Math.hypot(v.x - k.x, v.z - k.z) < apart)) continue;
    const floor = k.y - k.B, ground = block.land.surface(k.x, k.z);
    let height = vrng.range(7, 22) * Math.sqrt(scale);
    const room = block.deep - floor - 3;
    if (room < 6) continue;
    const skylight = ground < floor + height + 3 && ground <= block.deep + 2;
    if (skylight) height = Math.max(6, ground - floor + 2); else height = Math.min(height, room);
    const rx = k.A * vrng.range(1.5, 2.5) + 2, rz = k.A * vrng.range(1.5, 2.5) + 2;
    voids.push({ x: k.x, z: k.z, floor, rx, rz, height, heapR: 0.6 * Math.min(rx, rz), heapH: Math.min(0.4 * height, 7), skylight, seed: deriveSeed(block.seed, 'void', voids.length) });
  }

  // Shafts at the sinks (water comes in through the land) and mouths at the springs (it goes out through the valley side).
  const top = block.deep;
  for (const n of net.sinkNodes) {
    if (!adj.has(n)) continue;
    const [x, y, z] = smoothed.get(n) ?? xyz(n), w = wetOf(n), sec = section(w, 0, 0), a = Math.max(Amin + 0.4, Math.min(sec.A, 3.4 * Math.sqrt(scale))), up = Math.min(top + 2, block.land.surface(x, z) + 1);
    if (up - y < 3) continue;
    const shaftRing = (yy: number, k: number): CondPoint => ({ x, y: yy, z, A: a * k, B: a * k, C: 0, D: 0, flow: Math.max(w.ph, w.va) });
    conduits.push({ kind: 'shaft', points: [shaftRing(y, 1), shaftRing((y + up) / 2, 1), shaftRing(up, 1.5)], level: stageN - 1, active: true });
    length += up - y;
  }
  const dirOut = block.water.face === 'west' ? [-1, 0] : block.water.face === 'east' ? [1, 0] : block.water.face === 'south' ? [0, -1] : [0, 1];
  for (const n of net.springNodes) {
    if (!adj.has(n)) continue;
    const [x, y, z] = smoothed.get(n) ?? xyz(n), w = wetOf(n), sec = section(w, 0, 0);
    const outAt = (d: number): CondPoint => ({ x: x + dirOut[0] * d, y, z: z + dirOut[1] * d, A: sec.A, B: sec.B, C: sec.C, D: sec.D, flow: 1 });
    conduits.push({ kind: 'mouth', points: [outAt(0), outAt(4), outAt(8)], level: stageN - 1, active: true });
    length += 8;
  }

  let junctions = 0;
  for (const n of adj.keys()) if (degreeOf(n) >= 3) junctions++;
  // Loops of the network: edges - nodes + parts.
  const seen = new Set<number>();
  let parts = 0;
  for (const n of adj.keys()) {
    if (seen.has(n)) continue;
    parts++;
    const todo = [n];
    seen.add(n);
    while (todo.length) { const a = todo.pop()!, nb = adj.get(a)!; for (let i = 0; i < nb.length; i += 2) if (!seen.has(nb[i])) { seen.add(nb[i]); todo.push(nb[i]); } }
  }
  return {
    conduits, voids,
    sinks: net.sinkNodes.map((n) => xyz(n)), springs: [...net.springNodes].map((n) => xyz(n)),
    tables: block.water.stages.map((s) => s.table),
    stats: { length, junctions, loops: net.edgeCount - adj.size + parts },
  };
}
