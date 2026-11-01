/**
 * Formations as meshes (D63, K3; pure): stalactites, stalagmites, columns and straws grown in layers. A stalagmite
 * is a stack of saucers (each layer swells slowly and drops at its rim), a stalactite is ringed like a candle,
 * a column flares where it meets roof and floor. Each is lumpy, leans a little, has an oval section, and takes its
 * colour from its layer: creams, ambers and browns, or the greys of a dead one. Smooth normals are computed here.
 */
import { Noise, Rng, deriveSeed, lerp } from '@futuremagic/core';
import type { Speleo } from './dress';
import { PartBuilder, type PartMesh } from './parts';

const CREAM = [0xece3cf, 0xdccaa6, 0xcda76c, 0xe6d8bd, 0xbf9159, 0xf1e9d8] as const;
const GREY = [0x9d998e, 0x86827a, 0xaaa59a, 0x76726b] as const;
const hexBytes = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const frac = (v: number): number => v - Math.floor(v);

/** The mesh of formations, in the cave's frame. */
export function formationMesh(list: readonly Speleo[], seed: number): PartMesh {
  const b = new PartBuilder(), noise = new Noise(deriveSeed(seed, 'cave', 'formations'));
  for (const s of list) grow(b, noise, s, seed);
  return b.build();
}

function grow(b: PartBuilder, noise: Noise, s: Speleo, seed: number): void {
  const len = s.y1 - s.y0;
  if (len < 0.05) return;
  const rng = new Rng(deriveSeed(seed, 'formation', Math.round(s.x * 37) * 7919 + Math.round(s.z * 41) + Math.round(s.y0 * 13)));
  const hang = s.kind === 'stalactite' || s.kind === 'straw';
  const rings = Math.max(5, Math.min(30, Math.round(len * (s.kind === 'straw' ? 3 : 7)))), mean = (s.rb + s.rt) / 2;
  const sides = mean < 0.08 ? 6 : mean < 0.2 ? 8 : 12;
  const layers = hang ? Math.max(4, Math.round(len * 9)) : Math.max(3, Math.round(len * 5.5));
  const phase = rng.float(), oval = rng.range(0.82, 1.18), turn = rng.range(0, Math.PI), lean = rng.range(-1, 1) * Math.min(len, 2.2) * (hang ? 0.07 : 0.1), leanDir = rng.range(0, Math.PI * 2);
  const palette = s.dead ? GREY : CREAM, bandSeed = rng.int(0, 99999), v0 = b.vertexCount, i0 = b.idx.length;
  const ring: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, y = s.y0 + t * len;
    // Radius along the body: a stalactite fattens quickly from its tip, a stalagmite is blunt and falls away from its foot, a column has a waist.
    let r = s.kind === 'stalactite' ? lerp(s.rb, s.rt, t ** 0.65) : s.kind === 'stalagmite' ? lerp(s.rt, s.rb, 1 - t ** 1.7) : lerp(s.rb, s.rt, t);
    r *= 1 - (1 - s.waist) * Math.sin(Math.PI * t);
    const saw = frac(t * layers + phase);
    if (s.kind === 'stalagmite' || s.kind === 'column') r *= 1 + 0.17 * (saw ** 2.2 - 0.4);
    else r *= 1 + 0.07 * Math.sin((t * layers + phase) * Math.PI * 2) + 0.05 * (frac(t * layers * 0.5 + phase) - 0.5);
    if (s.kind === 'column') r *= 1 + 0.9 * (1 - t) ** 5 + 0.9 * t ** 5;
    const bend = (hang ? (1 - t) ** 2 : t * t) * lean;
    const cx = s.x + Math.cos(leanDir) * bend, cz = s.z + Math.sin(leanDir) * bend;
    const band = Math.floor(t * layers + phase) + bandSeed, [cr, cg, cb] = hexBytes(palette[Math.abs(Math.imul(band, 2654435761) >>> 0) % palette.length]);
    // Darker, dirtier near the floor; paler towards a stalactite's tip.
    const shade = hang ? 0.85 + 0.2 * (1 - t) : 0.78 + 0.25 * t;
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2, lump = 1 + 0.1 * noise.n3(Math.cos(a) * 2 + s.x * 2.7, y * 3.5, Math.sin(a) * 2 + s.z * 2.7);
      const rr = Math.max(0.006, r * lump), ca = Math.cos(a + turn), sa = Math.sin(a + turn);
      const k = shade * (0.94 + 0.12 * noise.n3(s.x * 5 + j, y * 7, s.z * 5));
      ring.push(b.vertex(cx + ca * rr * oval, y, cz + sa * rr / oval, 0, 1, 0, Math.min(255, cr * k), Math.min(255, cg * k), Math.min(255, cb * k)));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
    const a = ring[i * sides + j], c = ring[i * sides + (j + 1) % sides], d = ring[(i + 1) * sides + j], e = ring[(i + 1) * sides + (j + 1) % sides];
    b.tri(a, d, c); b.tri(c, d, e);
  }
  // Close the end that is free: a stalactite's tip, a stalagmite's top (dished a little).
  const topLayer = hang ? 0 : rings, apexY = hang ? s.y0 - 0.02 : s.y1 - Math.min(0.05, s.rt * 0.4), last = ring.slice(topLayer * sides, topLayer * sides + sides);
  const cx = last.reduce((acc, v) => acc + b.pos[v * 3], 0) / sides, cz = last.reduce((acc, v) => acc + b.pos[v * 3 + 2], 0) / sides;
  const apex = b.vertex(cx, apexY, cz, 0, hang ? -1 : 1, 0, b.tint[last[0] * 3], b.tint[last[0] * 3 + 1], b.tint[last[0] * 3 + 2]);
  for (let j = 0; j < sides; j++) hang ? b.tri(last[j], apex, last[(j + 1) % sides]) : b.tri(last[j], last[(j + 1) % sides], apex);
  b.smooth(v0, i0);
}
