/**
 * A formed cave from inside, as the hero sees it (phase K3), drawn with the game's own node shaders (the formed cave
 * kinds in src/render/materials/formedCave.ts) on WebGPURenderer's WebGL backend, which SwiftShader runs in the cloud:
 *   inside.html?rock=massive&seed=1&size=medium[&tiles=6][&frac=0.4]
 * Six looks, each standing in a stream's bed (or on a way's floor), eye 1.7 m over the floor, a lantern, and a figure of
 * the hero ahead for the size. `node tools/preview/formed.mjs out-dir n size rocks floorSeeds` takes the pictures.
 */
import * as T from 'three/webgpu';
import { FORMED_CALCITE, FORMED_ROCK } from '../../src/render/materials/formedCave';
import { FORMED_WATER } from '../../src/render/materials/formedWater';
import { kindMesh } from '../../src/render/materials';
import { createCavePool } from '../../src/workers/pool';
import type { CaveResult } from '../../src/workers/cave.worker';

const q = new URLSearchParams(location.search);
const rock = q.get('rock') ?? 'massive', size = q.get('size') ?? 'medium', seed = Number(q.get('seed') ?? 1), tiles = Number(q.get('tiles') ?? 6);
const done = (o: unknown) => { (window as unknown as { done: string }).done = JSON.stringify(o); };

/** A geometry from a mesh of arrays: position, normal, tint (sRGB bytes to 0..1) and the material per vertex. */
function geometryOf(m: { position: Float32Array; normal: Float32Array; tint: Uint8Array; mat: Uint8Array; index: Uint32Array }): T.BufferGeometry {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new T.BufferAttribute(m.normal, 3));
  g.setAttribute('tint', new T.BufferAttribute(Float32Array.from(m.tint, (v) => v / 255), 3));
  g.setAttribute('mat', new T.BufferAttribute(Float32Array.from(m.mat), 1));
  g.setIndex(new T.BufferAttribute(m.index, 1));
  return g;
}

async function main(): Promise<void> {
  const W = 550, H = 340, cols = 3;
  const res: CaveResult = await createCavePool().run({ kind: 'form', setting: 'classic', seed, rock, size, coarse: 1, dress: true });
  const r = new T.WebGPURenderer({ antialias: true, forceWebGL: true });
  r.setSize(W, H); r.toneMapping = T.AgXToneMapping; r.toneMappingExposure = 1.3;
  await r.init();
  const scene = new T.Scene();
  const walls = kindMesh(geometryOf(res.mesh as never), FORMED_ROCK);
  scene.add(walls);
  // Formations and crystals (waxy calcite), stones (the wall's own stone).
  if (res.parts) {
    scene.add(kindMesh(geometryOf(res.parts.formations), FORMED_CALCITE));
    scene.add(kindMesh(geometryOf(res.parts.crystals), FORMED_CALCITE));
    scene.add(kindMesh(geometryOf(res.parts.stones), FORMED_ROCK));
  }
  if (res.parts) {
    const w = res.parts.water, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(w.position, 3));
    g.setAttribute('normal', new T.BufferAttribute(w.normal, 3));
    g.setAttribute('uv', new T.BufferAttribute(w.uv, 2));
    g.setAttribute('tint', new T.BufferAttribute(w.flow, 3));
    g.setIndex(new T.BufferAttribute(w.index, 1));
    const sheet = q.get('waterdebug') ? new T.Mesh(g, new T.MeshBasicMaterial({ color: 0xff00ff })) : kindMesh(g, FORMED_WATER); sheet.renderOrder = 2;
    scene.add(sheet);
  }
  scene.add(new T.AmbientLight(0x6a7488, 0.4));
  scene.background = new T.Color(0x07080a);
  scene.fog = new T.FogExp2(0x07080a, 0.03);
  const ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0);
  const floorOf = (x: number, z: number, y: number): number => { ray.set(new T.Vector3(x, y + 1.5, z), down); ray.far = 8; const h = ray.intersectObject(walls)[0]; return h ? h.point.y : y; };
  type Spot = { x: number; y: number; z: number; tx: number; tz: number };
  const spots: Spot[] = [];
  const streams = [...(res.dressing?.streams ?? [])].sort((a, b) => b.pts.length - a.pts.length).slice(0, 8);
  for (const st of streams) for (let i = 4; i + 10 < st.pts.length; i += 6) { const a = st.pts[i], b = st.pts[i + 9]; spots.push({ x: a[0], y: a[1], z: a[2], tx: b[0], tz: b[2] }); }
  if (spots.length < tiles * 3) for (const c of res.skeleton.conduits.filter((k) => k.kind === 'passage')) for (let i = 2; i + 7 < c.points.length; i += 4) { const a = c.points[i], b = c.points[i + 6]; spots.push({ x: a.x, y: a.y - a.B - a.D, z: a.z, tx: b.x, tz: b.z }); }
  const eyeAt = (s: Spot) => new T.Vector3(s.x, floorOf(s.x, s.z, s.y) + 1.7, s.z);
  const open = (s: Spot): number => { const e = eyeAt(s), d = new T.Vector3(s.tx - s.x, 0, s.tz - s.z).normalize(); ray.set(e, d); ray.far = 30; const h = ray.intersectObject(walls)[0]; return h ? h.distance : 30; };
  const picked = spots.map((s) => ({ s, open: open(s) })).filter((o) => o.open > 4).sort((a, b) => b.open - a.open);
  const chosen: Spot[] = [];
  for (const o of picked) { if (chosen.length >= tiles) break; if (chosen.every((c) => Math.hypot(c.x - o.s.x, c.z - o.s.z) > 14)) chosen.push(o.s); }
  const out = document.createElement('canvas'); out.width = W * cols; out.height = H * Math.ceil(chosen.length / cols);
  document.body.appendChild(out);
  const ctx = out.getContext('2d')!;
  const lantern = new T.PointLight(0xffc27a, 9, 40, 1.6); scene.add(lantern);
  const hero = new T.Group();
  hero.add(new T.Mesh(new T.CapsuleGeometry(0.28, 1.2, 4, 10), new T.MeshStandardMaterial({ color: 0x3d5a80, roughness: 0.8 })).translateY(0.95));
  hero.add(new T.Mesh(new T.SphereGeometry(0.16, 10, 8), new T.MeshStandardMaterial({ color: 0xd9b38c })).translateY(1.78));
  scene.add(hero);
  const cam = new T.PerspectiveCamera(80, W / H, 0.1, 200);
  for (let n = 0; n < chosen.length; n++) {
    const s = chosen[n], eye = eyeAt(s), dir = new T.Vector3(s.tx - s.x, 0, s.tz - s.z).normalize();
    hero.position.set(eye.x + dir.x * 4.5, floorOf(eye.x + dir.x * 4.5, eye.z + dir.z * 4.5, eye.y - 1.7), eye.z + dir.z * 4.5);
    cam.position.copy(eye); cam.lookAt(eye.x + dir.x * 5, eye.y - 0.25, eye.z + dir.z * 5);
    lantern.position.copy(eye).setY(eye.y + 0.3);
    await r.renderAsync(scene, cam);
    ctx.drawImage(r.domElement, (n % cols) * W, Math.floor(n / cols) * H);
  }
  done({ rock, size, seed, views: chosen.length, ms: res.ms, tris: res.tris });
}
main().catch((e) => { console.error(e); done({ error: String(e) }); });
