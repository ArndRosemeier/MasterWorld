import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Skeleton } from '../src/world/skeleton';
import { Terrain } from '../src/world/terrain';
import { CHUNK0, SEGS, buildChunk, finerFor, chunkIndex } from '../src/world/chunkMesh';
import { DrawnGround, drawnSource, type DrawnSource } from '../src/world/drawnGround';
import { classic } from '../src/setting/classic/index';
import { SMALL } from './small';

/** The mesh's height at (x, z) in a chunk at (x0, z0): the triangle the point falls in, read off its vertices. */
function meshAt(m: ReturnType<typeof buildChunk>, x0: number, z0: number, x: number, z: number): number {
  const step = CHUNK0 / m.segs, idx = m.index ?? chunkIndex(m.segs), p = m.position;
  const i = Math.min(m.segs - 1, Math.floor((x - x0) / step)), j = Math.min(m.segs - 1, Math.floor((z - z0) / step));
  const q = (j * m.segs + i) * 6;
  for (const t of [q, q + 3]) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((v) => [p[v * 3] + x0, p[v * 3 + 1], p[v * 3 + 2] + z0]);
    // Barycentric weights in the xz plane.
    const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    const wa = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det, wb = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det, wc = 1 - wa - wb;
    if (wa >= -1e-9 && wb >= -1e-9 && wc >= -1e-9) return wa * a[1] + wb * b[1] + wc * c[1];
  }
  throw new Error(`no triangle at ${x}, ${z}`);
}

test('drawn ground: the hero stands on exactly what the finest chunk draws, cut quads and brooks\' finer chunks too', () => {
  const t = new Terrain(parseSeed('masterworld'), classic, SMALL), src = drawnSource(t), g = new DrawnGround(src);
  // A chunk of sea cliff north of the start (quads cut along a rim) and one by the start with a brook in it.
  const chunks: [number, number][] = [[-31872, 30848], [-24448, 34432]];
  assert.ok(src.segs(-24448, 34432) > SEGS, 'a chunk with a brook, drawn finer');
  let cut = false, worst = 0;
  for (const [x0, z0] of chunks) {
    const m = buildChunk(t, { x0, z0, size: CHUNK0, segs: finerFor(t, { x0, z0, size: CHUNK0, segs: SEGS }) });
    cut ||= !!m.index;
    for (let k = 0; k < 400; k++) {
      const x = x0 + ((k * 37.31) % CHUNK0), z = z0 + ((k * 61.7) % CHUNK0);
      worst = Math.max(worst, Math.abs(g.footing(x, z) - meshAt(m, x0, z0, x, z)));
    }
  }
  assert.ok(cut, 'some quads cut along a rim');
  assert.ok(worst < 1e-3, `${worst.toFixed(4)} m off the drawn ground`);
});

test('drawn ground: asks each corner once, and starts over when the land changes', () => {
  let asked = 0, lift = 0;
  const src: DrawnSource & { version: number } = { height: (x, z) => { asked++; return 0.1 * x - 0.05 * z + lift; }, version: 0, segs: () => SEGS };
  const g = new DrawnGround(src);
  assert.ok(Math.abs(g.footing(3.3, 7.1) - (0.33 - 0.355)) < 1e-9, 'a plane drawn as it is');
  asked = 0;
  for (let k = 0; k < 100; k++) g.footing(3.3, 7.1);
  assert.equal(asked, 0);
  lift = 10;
  assert.ok(g.footing(3.3, 7.1) < 1, 'kept until the land changes');
  src.version++;
  assert.ok(g.footing(3.3, 7.1) > 9, 'then read anew');
});

/**
 * The land's big shape has little narrower than the ground's mesh shows: the hero stands on the drawn ground, but
 * a tree or a stone set on the land's own height would float or sink there (Arnd, seed poev7x by 37691, -1576: a sea
 * cliff's gully was a slot the hero sank into up to the chest). Each 2 m cell's middle against its corners' mean.
 */
function worstCell(sk: Skeleton, cx: number, cz: number, r: number): { dev: number; x: number; z: number } {
  let worst = { dev: 0, x: cx, z: cz };
  for (let z = cz - r; z < cz + r; z += 2) for (let x = cx - r; x < cx + r; x += 2) {
    const m = sk.elevation(x + 1, z + 1);
    const dev = m - (sk.elevation(x, z) + sk.elevation(x + 2, z) + sk.elevation(x, z + 2) + sk.elevation(x + 2, z + 2)) / 4;
    if (Math.abs(dev) > Math.abs(worst.dev)) worst = { dev, x: x + 1, z: z + 1 };
  }
  return worst;
}

test('drawn ground: a sea cliff\'s gullies are wide enough for the mesh to show', () => {
  const at = (w: { dev: number; x: number; z: number }) => `${w.dev.toFixed(1)} m at ${w.x}, ${w.z}`;
  // Arnd's spot, on the crest of a sea cliff.
  const poev = worstCell(new Skeleton(parseSeed('poev7x'), classic.world), 37691, -1576, 20);
  // (Volcanic country since K7: this coast is cinder rock now, its gullies a little rougher than the old mesa's.)
  assert.ok(Math.abs(poev.dev) < 2, at(poev));
  // A stretch of cliff coast with gullies (up to 8.5 m off before they were widened).
  const coast = worstCell(new Skeleton(parseSeed('brazok'), classic.world), -200, 420, 80);
  assert.ok(Math.abs(coast.dev) < 1.5, at(coast));
});

test('drawn ground: a mesa pass\'s ramp runs out on the valley floor, without a step at its foot', () => {
  // Where the valley's quick out cut it off, it ended in a step some 17 m high here (62 m in from the coast).
  const sk = new Skeleton(parseSeed('poev7x'), classic.world);
  let prev = sk.elevation(37445, -1869), most = 0;
  for (let x = 37445.25; x <= 37455; x += 0.25) { const h = sk.elevation(x, -1869); most = Math.max(most, Math.abs(h - prev)); prev = h; }
  assert.ok(most < 1, `${most.toFixed(1)} m in a quarter metre`);
});
