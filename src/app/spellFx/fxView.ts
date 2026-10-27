/**
 * Draws the spells' bits (particles.ts) with the two spell shaders (render/materials/spellFx.ts): every sprite as
 * one instance of one quad mesh, every solid as an instance of its shape's mesh. All of it built and compiled
 * behind the loading screen (`enter`); in play only buffers change.
 *
 * Floating origin: the group is pinned (its matrix is the identity relative to the origin) and every position is
 * written minus ORIGIN.at.
 */
import { BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, OctahedronGeometry, PlaneGeometry, Quaternion, Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { Rng } from '@futuremagic/core';
import { ORIGIN } from '../../render/origin';
import { SOLID_ATTR, SPELL_SOLID, SPELL_SPRITE, SPRITE_CAP, SPRITE_DATA } from '../../render/materials/spellFx';
import { SHAPES, SpellBits } from './particles';

/** Solids of each shape drawn at once, at most. */
const SOLID_CAP = 64;
const UP = new Vector3(0, 1, 0);

export class FxView {
  readonly group = Object.assign(new Group(), { name: 'spell fx' });
  private readonly solids: InstancedMesh[];
  private readonly fx: InstancedBufferAttribute[];
  private readonly o = new Object3D();
  private readonly q = new Quaternion();
  private readonly d = new Vector3();
  /** What the last frame drew (shots wait for it). */
  drawn = { sprites: 0, solids: 0 };

  constructor() {
    const quad = new PlaneGeometry(1, 1);
    const sprites = new Mesh(quad, SPELL_SPRITE.make());
    // Always the whole cap (spare quads have no size): the count never changes, so the draw is built once.
    Object.assign(sprites, { name: 'spell sprites', frustumCulled: false, castShadow: false, receiveShadow: false, count: SPRITE_CAP });
    this.group.add(sprites);
    const geos = SHAPES.map((s) => shapeGeometry(s));
    this.fx = geos.map(() => new InstancedBufferAttribute(new Float32Array(SOLID_CAP * 4), 4));
    this.solids = geos.map((g, i) => {
      g.setAttribute(SOLID_ATTR, this.fx[i]!);
      const mesh = new InstancedMesh(g, SPELL_SOLID.make(), SOLID_CAP);
      Object.assign(mesh, { name: `spell ${SHAPES[i]}`, frustumCulled: false, castShadow: SPELL_SOLID.shadow.cast, receiveShadow: SPELL_SOLID.shadow.receive, count: 0 });
      this.group.add(mesh);
      return mesh;
    });
    ORIGIN.pin(this.group);
  }

  /** Built and compiled now (hidden until a spell shows). */
  async enter(stage: Stage): Promise<void> {
    for (const s of this.solids) s.count = 1;
    await stage.add(this.group);
    for (const s of this.solids) s.count = 0;
    this.clearSprites(0);
    SPRITE_DATA.at.needsUpdate = true;
  }

  /** Draw what `bits` holds now (moving ones and this frame's held ones). */
  draw(bits: SpellBits): void {
    const ox = ORIGIN.at.x, oz = ORIGIN.at.z;
    const A = SPRITE_DATA.at.array as Float32Array, W = SPRITE_DATA.way.array as Float32Array;
    const C = SPRITE_DATA.color.array as Float32Array, L = SPRITE_DATA.look.array as Float32Array;
    let n = 0;
    for (const p of bits.parts) {
      if (n >= SPRITE_CAP) break;
      const { a, size, strength } = SpellBits.now(p), i = n * 4;
      A[i] = p.x - ox; A[i + 1] = p.y; A[i + 2] = p.z - oz; A[i + 3] = size;
      if (p.flat) { W[i] = p.flat[0]; W[i + 1] = p.flat[1]; W[i + 2] = p.flat[2]; W[i + 3] = -Math.max(1, p.aspect); }
      else if (p.way) { W[i] = p.way[0]; W[i + 1] = p.way[1]; W[i + 2] = p.way[2]; W[i + 3] = Math.max(1.01, p.aspect); }
      else if (p.stretch > 0) {
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        W[i] = p.vx; W[i + 1] = p.vy; W[i + 2] = p.vz; W[i + 3] = Math.max(1.01, (sp * p.stretch) / Math.max(1e-3, size));
      } else { W[i] = 0; W[i + 1] = 1; W[i + 2] = 0; W[i + 3] = 0; }
      const k = strength;
      C[i] = (p.c0[0] + (p.c1[0] - p.c0[0]) * a) * k; C[i + 1] = (p.c0[1] + (p.c1[1] - p.c0[1]) * a) * k; C[i + 2] = (p.c0[2] + (p.c1[2] - p.c0[2]) * a) * k;
      C[i + 3] = (p.cover0 + (p.cover1 - p.cover0) * a) * k;
      L[i] = p.sprite; L[i + 1] = p.seed; L[i + 2] = a; L[i + 3] = p.rot;
      n++;
    }
    for (const h of bits.held) {
      if (n >= SPRITE_CAP) break;
      const i = n * 4;
      A[i] = h.x - ox; A[i + 1] = h.y; A[i + 2] = h.z - oz; A[i + 3] = h.size;
      if (h.flat) { W[i] = h.flat[0]; W[i + 1] = h.flat[1]; W[i + 2] = h.flat[2]; W[i + 3] = -Math.max(1, h.aspect); }
      else if (h.stretch) { W[i] = h.stretch[0]; W[i + 1] = h.stretch[1]; W[i + 2] = h.stretch[2]; W[i + 3] = Math.max(1.01, h.aspect); }
      else { W[i] = 0; W[i + 1] = 1; W[i + 2] = 0; W[i + 3] = 0; }
      C[i] = h.c[0]; C[i + 1] = h.c[1]; C[i + 2] = h.c[2]; C[i + 3] = h.cover;
      L[i] = h.sprite; L[i + 1] = h.seed; L[i + 2] = h.age; L[i + 3] = h.rot;
      n++;
    }
    const was = this.drawn.sprites;
    this.drawn.sprites = n;
    this.clearSprites(n, Math.max(n, was));
    for (const a of [SPRITE_DATA.at, SPRITE_DATA.way, SPRITE_DATA.color, SPRITE_DATA.look]) a.needsUpdate = true;

    const counts = this.solids.map(() => 0);
    const put = (shape: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, roll: number, w: number, l: number, stuff: number, seed: number, glow: number) => {
      const mesh = this.solids[shape]!, c = counts[shape]!;
      if (c >= SOLID_CAP || w <= 1e-4 || l <= 1e-4) return;
      this.d.set(dx, dy, dz);
      if (this.d.lengthSq() < 1e-8) this.d.set(0, 1, 0);
      this.q.setFromUnitVectors(UP, this.d.normalize());
      this.o.quaternion.setFromAxisAngle(UP, roll).premultiply(this.q);
      this.o.position.set(x - ox, y, z - oz);
      this.o.scale.set(w, l, w);
      this.o.updateMatrix();
      mesh.setMatrixAt(c, this.o.matrix);
      this.fx[shape]!.setXYZW(c, stuff, seed, glow, 0);
      counts[shape] = c + 1;
    };
    for (const s of bits.solids) {
      const { scale, sunk } = SpellBits.standing(s);
      put(s.shape, s.x, s.y - sunk, s.z, s.dx, s.dy, s.dz, s.roll, s.width * scale, s.length * scale, s.stuff, s.seed, s.glow);
    }
    for (const h of bits.heldSolids) put(h.shape, h.x, h.y, h.z, h.dx, h.dy, h.dz, h.roll, h.width, h.length, h.stuff, h.seed, h.glow);
    let solids = 0;
    this.solids.forEach((mesh, i) => {
      mesh.count = counts[i]!;
      solids += counts[i]!;
      if (counts[i]) { mesh.instanceMatrix.needsUpdate = true; this.fx[i]!.needsUpdate = true; }
    });
    this.drawn.solids = solids;
    bits.clearHeld();
  }

  /** Spare quads from `from` (to `to`) get no size. */
  private clearSprites(from: number, to = SPRITE_CAP): void {
    const A = SPRITE_DATA.at.array as Float32Array;
    for (let i = from; i < to; i++) A[i * 4 + 3] = 0;
  }
}

/**
 * Each shape's mesh, standing on its base at the origin along +y (one unit long, one across), faceted (every
 * face its own normal) and roughened by a fixed seed, so they read as broken ice and rock.
 */
function shapeGeometry(shape: typeof SHAPES[number]): BufferGeometry {
  const rng = new Rng(0x5e11 + SHAPES.indexOf(shape));
  let g: BufferGeometry;
  switch (shape) {
    case 'shard': {
      // A long six-sided crystal pointed at both ends, its base end short.
      g = new OctahedronGeometry(0.5, 0);
      // Spans 0..1 along y: the short end at the base, the long point ahead.
      stretchY(g, (y) => (y > 0 ? y * 1.6 : y * 0.4) + 0.2);
      break;
    }
    case 'spike': {
      g = new ConeGeometry(0.5, 1, 7, 4, false);
      g.translate(0, 0.5, 0);
      roughen(g, rng, 0.08, (y) => 1 - y * 0.6);
      break;
    }
    case 'chunk': {
      g = new IcosahedronGeometry(0.5, 0);
      roughen(g, rng, 0.14, () => 1);
      break;
    }
    case 'leaf': {
      // A leaf bent along its midrib, its stalk at the origin.
      g = new PlaneGeometry(0.5, 1, 2, 4);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i) + 0.5, w = Math.sin(Math.PI * Math.min(1, y)) * (1 - y * 0.3);
        p.setXYZ(i, x * w * 2 * 0.5, y, Math.abs(x) * 0.35 - y * (1 - y) * 0.2);
      }
      break;
    }
    case 'root':
    default: {
      // A root that bends as it rises and tapers to a point.
      g = new CylinderGeometry(0.15, 0.5, 1, 6, 8, false);
      g.translate(0, 0.5, 0);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setX(i, p.getX(i) + Math.sin(y * 2.4) * 0.45 * y);
        p.setZ(i, p.getZ(i) + Math.sin(y * 3.7) * 0.15 * y);
      }
      roughen(g, rng, 0.05, () => 1);
      break;
    }
  }
  const flat = g.index ? g.toNonIndexed() : g;
  flat.computeVertexNormals();
  flat.computeBoundingSphere();
  return flat;
}

function stretchY(g: BufferGeometry, f: (y: number) => number): void {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, f(p.getY(i)));
}

/** Push each corner in or out a little (the same corner the same way, so faces stay closed). */
function roughen(g: BufferGeometry, rng: Rng, amount: number, by: (y: number) => number): void {
  const p = g.getAttribute('position') as Float32BufferAttribute;
  const moved = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let m = moved.get(key);
    if (!m) { m = [rng.range(-1, 1) * amount, rng.range(-1, 1) * amount * 0.5, rng.range(-1, 1) * amount]; moved.set(key, m); }
    const k = by(p.getY(i));
    p.setXYZ(i, p.getX(i) + m[0] * k, p.getY(i) + m[1] * k, p.getZ(i) + m[2] * k);
  }
}
