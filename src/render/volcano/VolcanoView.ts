/**
 * Active volcanoes drawn (K7d, docs/design/volcanoes.md; the land and its lava are world/volcano.ts, `Terrain.lavaAt`): for each
 * volcano within sight, the lava lake in its crater, the flows down its flank, the sulphur crusts and crystals round its vents,
 * and the steam and ash that rise from them. The lava is a flat disc at the lake's level that the crater's walls hide, cut back
 * to where the ground meets that level, and a ribbon along each flow's line laid on the ground it is cut into (the same
 * functions that cut the channels, world/volcano.ts); the materials (render/materials/volcano.ts) do the rest.
 *
 * The meshes are built on the main thread a piece at a time (one a frame) once a volcano comes within `NEAR`, and dropped
 * again beyond `FAR`; the steam is one instanced draw for every volcano in sight.
 */
import { BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, Vector3, type Object3D } from 'three/webgpu';
import { puffMesh } from '../smoke/SmokeView';
import type { Stage } from '@futuremagic/stage';
import { Rng, deriveSeed } from '@futuremagic/core';
import { kindMesh } from '../materials';
import { GLOW, GLOW_FEET, GLOW_MAX, LAVA, STEAM, STEAM_COLUMNS, STEAM_FEET, STEAM_PUFFS, STEAM_SHAPE, VOLCANO_CRUST, VOLCANO_LAVA, VOLCANO_SULPHUR, createGlowMaterial, createSteamMaterial } from '../materials/volcano';
import { ORIGIN } from '../origin';
import type { Terrain } from '../../world/terrain';
import { acrossFlow, flowHalf, type Flow, type Volcano } from '../../world/volcano';

/** A volcano is drawn from this far off (m, from its middle) and let go beyond the second. */
const NEAR = 3200, FAR = 4400;
/** The clock wraps (s): the plates' drift then jumps, once in nine hours. */
const WRAP = 32768;
/** How the lake's disc is cut: rays, rings, and the least it reaches beyond where the ground meets its level (m). */
const RAYS = 160, RINGS = 18, LAP = 0.7;
/** The lava lies this far over the ground it is laid on (m; `Terrain.lavaAt` says 0.3, the mesh's far levels of detail lie lower). */
const ON = 0.62;
/** A flow's ribbon: metres between its cross-sections, and points across it. */
const STEP = 4, ACROSS = 9;

interface Piece {
  readonly v: Volcano;
  /** What is built so far (each added to the scene once its shaders are compiled), and what is still to be built, in order. */
  readonly objects: Object3D[];
  todo: (() => Object3D | null)[];
}

export class VolcanoView {
  readonly steam: Mesh<InstancedBufferGeometry>;
  /** The halos over lakes. */
  readonly halo: Mesh<InstancedBufferGeometry>;
  private halos: { x: number; y: number; z: number; r: number }[] = [];
  private readonly pieces = new Map<string, Piece>();
  private seconds = 0;
  private clock = 0;
  private columns: { x: number; y: number; z: number; ash: number; high: number; thick: number; size: number; glow: number }[] = [];
  /** Set once the late shaders may be built (the game is playable). */
  on = false;

  constructor(private readonly terrain: Terrain, private readonly stage: Stage, seed: number) {
    this.steam = puffMesh(deriveSeed(seed, 'volcano steam'), STEAM_COLUMNS, STEAM_PUFFS, createSteamMaterial(), 'volcano steam');
    const h = new InstancedBufferGeometry();
    h.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
    h.setIndex([0, 1, 2, 2, 1, 3]);
    h.setAttribute('pGlow', new InstancedBufferAttribute(Float32Array.from({ length: GLOW_MAX }, (_, i) => i), 1));
    h.instanceCount = GLOW_MAX;
    this.halo = new Mesh(h, createGlowMaterial());
    this.halo.name = 'volcano halo';
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 5;
    ORIGIN.pin(this.halo);
  }

  /** The steam's shader built (under the shader cap) and drawn; from now on volcanoes in sight are built. */
  async enter(): Promise<void> {
    await this.stage.add(this.steam);
    await this.stage.add(this.halo);
    this.on = true;
  }

  /** Each frame (`dt` s): the clock, the volcanoes in sight built and let go, and the steam's columns placed. */
  tend(dt: number, cam: Vector3): void {
    if (!this.on) return;
    this.seconds = (this.seconds + dt) % WRAP;
    LAVA.time.value = this.seconds;
    STEAM.time.value = this.seconds;
    if ((this.clock -= dt) <= 0) {
      this.clock = 0.5;
      const near = this.terrain.volcanoes.nearTo(cam.x, cam.z, NEAR);
      for (const v of near) if (!this.pieces.has(v.id)) this.pieces.set(v.id, this.begin(v));
      for (const [id, p] of this.pieces) if (Math.hypot(p.v.x - cam.x, p.v.z - cam.z) > FAR) { this.drop(p); this.pieces.delete(id); }
      const vs = [...this.pieces.values()].map((p) => p.v);
      this.columns = this.columnsOf(vs, cam);
      this.halos = this.haloesOf(vs);
    }
    // One piece of one volcano a frame: the heights it needs are the land's, a few thousand of them.
    for (const p of this.pieces.values()) {
      const make = p.todo.shift();
      if (!make) continue;
      const o = make();
      if (o) { p.objects.push(o); void this.stage.add(o); }
      break;
    }
    this.placeSteam();
  }

  /** The halos over the lakes of the volcanoes in sight: wide over a spilling lake, narrower over a quiet one. */
  private haloesOf(vs: readonly Volcano[]): typeof this.halos {
    const out: typeof this.halos = [];
    for (const v of vs) {
      const lake = this.terrain.lakeLevel(v);
      if (lake !== null && v.state !== 'steaming') out.push({ x: v.x, y: lake + 26, z: v.z, r: v.rimR * (v.state === 'erupting' ? 2.4 : 1.6) });
    }
    return out.slice(0, GLOW_MAX);
  }

  /** Everything is built and shown for volcano `v` (for checks). */
  built(v: Volcano): boolean { const p = this.pieces.get(v.id); return !!p && p.todo.length === 0; }

  private begin(v: Volcano): Piece {
    const lake = this.terrain.lakeLevel(v), todo: (() => Object3D | null)[] = [];
    if (lake !== null) todo.push(() => this.lake(v, lake));
    v.flows.forEach((f, i) => todo.push(() => this.flow(v, f, i)));
    todo.push(() => this.crusts(v), () => this.crystals(v));
    return { v, objects: [], todo };
  }

  private drop(p: Piece): void {
    for (const o of p.objects) { o.removeFromParent(); (o as Mesh).geometry?.dispose(); }
    p.objects.length = 0;
    p.todo = [];
  }

  // ---------------------------------------------------------------------------------------------------------------- lava

  /** The lake: a disc at its level over the crater, each ray cut back to where the ground rises to that level. */
  private lake(v: Volcano, level: number): Object3D {
    const h = (x: number, z: number) => this.terrain.height(x, z), reach = v.rimR * 1.25;
    const rad = new Float32Array(RAYS);
    for (let k = 0; k < RAYS; k++) {
      const a = (k / RAYS) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      let r = 2;
      // Out along the ray to the first ground at the lake's level (walls rise to it); the saddle's sill is a little over it.
      while (r < reach && h(v.x + c * r, v.z + s * r) < level + 0.05) r += 1.5;
      rad[k] = Math.min(r + LAP, reach);
    }
    const pos: number[] = [0, 0, 0], uv: number[] = [0, 0], fx: number[] = [0, 1, 0, 0.3], idx: number[] = [];
    for (let i = 1; i <= RINGS; i++) {
      const u = i / RINGS;
      for (let k = 0; k < RAYS; k++) {
        const a = (k / RAYS) * Math.PI * 2, r = rad[k] * u;
        pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
        uv.push(0, u);
        // Cooler toward the rim: the crust is thicker where the lake meets the wall.
        fx.push(0, 1 - 0.25 * u * u, 0, 0.3);
      }
    }
    const ring = (i: number, k: number) => 1 + (i - 1) * RAYS + (k % RAYS);
    for (let k = 0; k < RAYS; k++) idx.push(0, ring(1, k + 1), ring(1, k));
    for (let i = 1; i < RINGS; i++) for (let k = 0; k < RAYS; k++) idx.push(ring(i, k), ring(i, k + 1), ring(i + 1, k + 1), ring(i, k), ring(i + 1, k + 1), ring(i + 1, k));
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setAttribute('fx', new Float32BufferAttribute(fx, 4));
    g.setIndex(idx);
    const m = kindMesh(g, VOLCANO_LAVA, v.x, level, v.z);
    m.name = 'volcano lake';
    m.renderOrder = 3;
    return m;
  }

  /** The point on a flow's line at `r` metres from the volcano's middle (the azimuth where the line lies). */
  private onFlow(v: Volcano, f: Flow, r: number): [number, number] {
    let th = f.phi;
    for (let i = 0; i < 6; i++) th -= acrossFlow(f, r, th) / r;
    return [v.x + Math.cos(th) * r, v.z + Math.sin(th) * r];
  }

  /** A flow: a ribbon along its line, laid on the ground its channel is cut into. */
  private flow(v: Volcano, f: Flow, n: number): Object3D {
    const steps = Math.max(2, Math.round((f.r1 - f.r0) / STEP)), pos: number[] = [], uv: number[] = [], fx: number[] = [], idx: number[] = [];
    const along = (f.r1 - f.r0) * 1.0;
    // The heat falls down the flow (the head is molten, the toe a crust with cracks).
    const hot = (s: number) => Math.pow(Math.max(0, 1 - s / (along * 0.95)), 1.1);
    let prev: [number, number] | null = null, s = 0;
    for (let i = 0; i <= steps; i++) {
      const r = f.r0 + (i / steps) * (f.r1 - f.r0), c = this.onFlow(v, f, r), nx = this.onFlow(v, f, Math.min(r + 2, f.r1 + 2));
      if (prev) s += Math.hypot(c[0] - prev[0], c[1] - prev[1]);
      prev = c;
      let tx = nx[0] - c[0], tz = nx[1] - c[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const half = flowHalf(f, r) * 1.0 + 0.4;
      for (let a = 0; a < ACROSS; a++) {
        const k = (a / (ACROSS - 1)) * 2 - 1, wx = c[0] - tz * half * k * 1.12, wz = c[1] + tx * half * k * 1.12;
        pos.push(wx - v.x, this.terrain.height(wx, wz) + ON, wz - v.z);
        uv.push(s, k);
        fx.push(1, hot(s) * (0.55 + 0.45 * Math.min(1, flowHalf(f, r) / 4)), half, ((v.seed + n * 977) % 1000) / 1000);
      }
    }
    for (let i = 0; i < steps; i++) for (let a = 0; a < ACROSS - 1; a++) {
      const p = i * ACROSS + a;
      idx.push(p, p + 1, p + ACROSS + 1, p, p + ACROSS + 1, p + ACROSS);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setAttribute('fx', new Float32BufferAttribute(fx, 4));
    g.setIndex(idx);
    const m = kindMesh(g, VOLCANO_LAVA, v.x, 0, v.z);
    m.name = `volcano flow ${n}`;
    m.renderOrder = 3;
    return m;
  }

  // -------------------------------------------------------------------------------------------------------------- sulphur

  /** The crust round every vent: a disc laid on the ground, a little domed, with a hollow at the vent. */
  private crusts(v: Volcano): Object3D {
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], fx: number[] = [], idx: number[] = [], RA = 20, RR = 6;
    const rng = new Rng(deriveSeed(v.seed, 'crusts'));
    for (const vent of v.vents) {
      const base = pos.length / 3, ph = rng.float() * 10, R = vent.r * 1.7;
      const h0 = this.terrain.height(vent.x, vent.z);
      for (let i = 0; i <= RR; i++) for (let k = 0; k < RA; k++) {
        const u = i / RR, a = (k / RA) * Math.PI * 2, x = vent.x + Math.cos(a) * R * u, z = vent.z + Math.sin(a) * R * u;
        // Dome up to a ring a third of the way out, hollow in the middle.
        const dome = 0.34 * Math.sin(Math.min(1, u * 2.2) * Math.PI * 0.5) * (1 - u) - 0.16 * Math.max(0, 1 - u * 5);
        pos.push(x - v.x, Math.max(this.terrain.height(x, z), h0 - 1.5) + 0.3 + dome, z - v.z);
        nor.push(0, 1, 0);
        uv.push(Math.cos(a) * u, Math.sin(a) * u);
        fx.push(ph, 0, 0, 0);
      }
      for (let i = 0; i < RR; i++) for (let k = 0; k < RA; k++) {
        const a = base + i * RA + k, b = base + i * RA + ((k + 1) % RA), c = base + (i + 1) * RA + ((k + 1) % RA), d = base + (i + 1) * RA + k;
        idx.push(a, b, c, a, c, d);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setAttribute('fx', new Float32BufferAttribute(fx, 4));
    g.setIndex(idx);
    const m = kindMesh(g, VOLCANO_CRUST, v.x, 0, v.z);
    m.name = 'volcano crust';
    m.renderOrder = 2;
    return m;
  }

  /** Crystals and crusted blocks standing round each vent: jagged prisms leaning out, some in clusters. */
  private crystals(v: Volcano): Object3D {
    const pos: number[] = [], nor: number[] = [], fx: number[] = [], idx: number[] = [];
    const rng = new Rng(deriveSeed(v.seed, 'crystals'));
    const spike = (x: number, y: number, z: number, h: number, w: number, lx: number, lz: number, grey: number, ph: number) => {
      // A prism of five sides leaning (lx, lz) with a point on top; its sides' normals out.
      const base = pos.length / 3, SIDES = 5;
      for (let k = 0; k < SIDES; k++) {
        const a = (k / SIDES) * Math.PI * 2 + ph, c = Math.cos(a), s = Math.sin(a);
        for (const [hh, ww, push] of [[0, w, 0], [h * 0.82, w * 0.62, 1]] as const) {
          pos.push(x + c * ww + lx * hh * 0.5 - v.x, y + hh, z + s * ww + lz * hh * 0.5 - v.z);
          nor.push(c, 0.25, s);
          fx.push(ph, grey, 0, push);
        }
      }
      const top = pos.length / 3;
      pos.push(x + lx * h * 0.5 + lx * 0.18 * h - v.x, y + h, z + lz * h * 0.5 + lz * 0.18 * h - v.z);
      nor.push(0, 1, 0);
      fx.push(ph, grey, 0, 1);
      for (let k = 0; k < SIDES; k++) {
        const k2 = (k + 1) % SIDES, a0 = base + k * 2, a1 = base + k * 2 + 1, b0 = base + k2 * 2, b1 = base + k2 * 2 + 1;
        idx.push(a0, b0, b1, a0, b1, a1, a1, b1, top);
      }
    };
    for (const vent of v.vents) {
      const n = rng.int(5, 10);
      for (let i = 0; i < n; i++) {
        const a = rng.float() * Math.PI * 2, d = vent.r * rng.range(0.15, 1.15), x = vent.x + Math.cos(a) * d, z = vent.z + Math.sin(a) * d;
        const big = rng.float() < 0.2, h = big ? rng.range(0.7, 1.5) : rng.range(0.18, 0.7), w = h * rng.range(0.16, 0.3);
        spike(x, this.terrain.height(x, z) + 0.05, z, h, w, Math.cos(a) * rng.range(0.1, 0.5) + rng.range(-0.2, 0.2), Math.sin(a) * rng.range(0.1, 0.5) + rng.range(-0.2, 0.2), rng.float() < 0.15 ? 0.7 : 0, rng.float() * 6);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    g.setAttribute('fx', new Float32BufferAttribute(fx, 4));
    g.setIndex(idx);
    const m = kindMesh(g, VOLCANO_SULPHUR, v.x, 0, v.z);
    m.name = 'volcano sulphur';
    return m;
  }

  // ---------------------------------------------------------------------------------------------------------------- steam

  /** The columns of steam and ash of the volcanoes in sight, the nearest first (up to STEAM_COLUMNS). */
  private columnsOf(vs: readonly Volcano[], cam: Vector3): typeof this.columns {
    const out: typeof this.columns = [];
    for (const v of [...vs].sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z))) {
      const lake = this.terrain.lakeLevel(v);
      // The crater: an ash plume over a spilling lake, a thinner one over a lake, a broad steam over a steaming crater.
      if (v.state === 'erupting' && lake !== null) for (let k = 0; k < 4; k++) out.push({ x: v.x + (k - 1.5) * 7, y: lake, z: v.z + ((k * 5) % 3 - 1) * 8, ash: 1, high: 300 - k * 25, thick: 1, size: 22 - k * 2, glow: 1 });
      else if (v.state === 'lake' && lake !== null) out.push({ x: v.x, y: lake, z: v.z, ash: 0.6, high: 120, thick: 0.75, size: 11, glow: 0.7 });
      else out.push({ x: v.x, y: this.terrain.height(v.x, v.z) + 1, z: v.z, ash: 0, high: 85, thick: 0.8, size: 9, glow: 0 });
      for (const vent of v.vents) out.push({ x: vent.x, y: this.terrain.height(vent.x, vent.z) + 0.4, z: vent.z, ash: 0, high: 28 + vent.r * 2.6, thick: 0.62, size: 1.7 + vent.r * 0.26, glow: 0 });
    }
    return out.slice(0, STEAM_COLUMNS);
  }

  /** The steam's columns into the shader's uniforms, relative to the floating origin. */
  private placeSteam(): void {
    const at = ORIGIN.at;
    for (let i = 0; i < STEAM_COLUMNS; i++) {
      const c = this.columns[i];
      STEAM_FEET[i].set(c ? c.x - at.x : 0, c ? c.y : 0, c ? c.z - at.z : 0, c ? c.ash : 0);
      STEAM_SHAPE[i].set(c ? c.high : 1, c ? c.thick : 0, c ? c.size : 1, c ? c.glow : 0);
    }
    this.steam.visible = this.columns.length > 0;
    for (let i = 0; i < GLOW_MAX; i++) {
      const g = this.halos[i];
      GLOW_FEET[i].set(g ? g.x - at.x : 0, g ? g.y : 0, g ? g.z - at.z : 0, g ? g.r : 0);
    }
    // The halos come out in the dark: faint by day, full when the eye has opened (the exposure up).
    GLOW.power.value = 0.05 + 0.4 * Math.min(1, Math.max(0, (this.stage.renderer.toneMappingExposure - 1.2) / 2.2));
    this.halo.visible = this.halos.length > 0;
  }
}
