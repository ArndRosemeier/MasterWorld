/**
 * Formed caves alone (phase K1, K2): the gallery of seeds Arnd looks at before anything goes into play.
 *   formed.html?rock=massive&n=24&size=medium&seed0=1            a sheet: each tile a cave seen from above and the side as a solid
 *                                                                (the air of the cave; colour by height), with its plan and numbers
 *   formed.html?view=floor&rock=thin-bedded&seed=3&size=medium   one cave from inside, standing in its widest way, rock in its bed colours
 * Caves are formed, carved and meshed in workers (src/workers/cave.worker.ts); `node tools/preview/formed.mjs out-dir` takes the pictures.
 */
import * as T from 'three';
import { createCavePool } from '../../src/workers/pool';
import type { CaveResult } from '../../src/workers/cave.worker';

const q = new URLSearchParams(location.search), view = q.get('view') ?? 'sheet';
const rock = q.get('rock') ?? 'massive', size = q.get('size') ?? 'medium', n = Number(q.get('n') ?? 24), seed0 = Number(q.get('seed0') ?? 1);
const pool = createCavePool();
const done = (o: unknown) => { (window as unknown as { done: string }).done = JSON.stringify(o); };
const geometry = (r: CaveResult, ramp?: (y: number) => [number, number, number]): T.BufferGeometry => {
  const m = r.mesh!, g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new T.BufferAttribute(m.normal, 3));
  const col = new Float32Array(m.position.length);
  for (let i = 0; i < m.position.length / 3; i++) {
    const c = ramp ? ramp(m.position[3 * i + 1]) : [m.tint[3 * i], m.tint[3 * i + 1], m.tint[3 * i + 2]].map((v) => (v / 255) ** 2.2);
    col.set(c, 3 * i);
  }
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  g.setIndex(new T.BufferAttribute(m.index, 1));
  return g;
};

async function sheet(): Promise<void> {
  const W = 400, H = 300, cols = 6, rows = Math.ceil(n / cols);
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = W * cols; sheetCanvas.height = H * rows;
  document.body.appendChild(sheetCanvas);
  const ctx = sheetCanvas.getContext('2d')!;
  ctx.fillStyle = '#16191c'; ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  const t0 = performance.now();
  const jobs = Array.from({ length: n }, (_, i) => pool.run({ kind: 'form', setting: 'classic', seed: seed0 + i, rock, size, coarse: 2, dress: q.get('dress') === '1' }));
  const results = await Promise.all(jobs);
  const wall = performance.now() - t0;
  const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(W, H); r.toneMapping = T.AgXToneMapping;
  const stats: unknown[] = [];
  results.forEach((res, i) => {
    const { across, deep } = res.size, cx = across / 2, cz = across / 2;
    const scene = new T.Scene();
    scene.background = new T.Color(0x16191c);
    // Low is blue, high is warm: the levels read at a glance.
    const ramp = (y: number): [number, number, number] => { const t = Math.max(0, Math.min(1, y / deep)); return [0.18 + 0.8 * t, 0.3 + 0.35 * t, 0.85 - 0.7 * t]; };
    scene.add(new T.Mesh(geometry(res, ramp), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: T.DoubleSide })));
    scene.add(new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(across, deep, across)).translate(cx, deep / 2, cz), new T.LineBasicMaterial({ color: 0x556070 })));
    scene.add(new T.HemisphereLight(0xcfd8ff, 0x303038, 1.6));
    const sun = new T.DirectionalLight(0xffe8c8, 2.2); sun.position.set(-1, 2, 0.6); scene.add(sun);
    const cam = new T.PerspectiveCamera(34, W / H, 1, 3000), az = 0.6, el = 0.62, dist = across * 1.9;
    cam.position.set(cx + Math.sin(az) * Math.cos(el) * dist, deep / 2 + Math.sin(el) * dist, cz + Math.cos(az) * Math.cos(el) * dist);
    cam.lookAt(cx, deep * 0.35, cz);
    r.render(scene, cam);
    const x = (i % cols) * W, y = Math.floor(i / cols) * H;
    ctx.drawImage(r.domElement, x, y);
    // The plan, in the corner: conduits by level, sinks green, springs cyan.
    const s = 110 / across;
    ctx.fillStyle = 'rgba(10,12,14,0.8)'; ctx.fillRect(x + 4, y + H - 130, 114, 114);
    ctx.save(); ctx.translate(x + 6, y + H - 128);
    for (const c of res.skeleton.conduits) {
      ctx.strokeStyle = c.kind !== 'passage' ? '#6c6' : c.active ? '#6af' : ['#e84', '#ca3', '#9a4', '#a7d'][c.level % 4]; ctx.lineWidth = Math.max(1, 2 * c.points[0].A * s * 0.6);
      ctx.beginPath(); c.points.forEach((p, k) => (k ? ctx.lineTo(p.x * s, p.z * s) : ctx.moveTo(p.x * s, p.z * s))); ctx.stroke();
    }
    ctx.fillStyle = '#0ff'; for (const p of res.skeleton.springs) ctx.fillRect(p[0] * s - 2, p[2] * s - 2, 4, 4);
    ctx.restore();
    const k = res.skeleton.stats;
    ctx.fillStyle = '#dde'; ctx.font = '12px sans-serif';
    ctx.fillText(`${rock} #${seed0 + i} ${res.size.id}  ${Math.round(k.length)} m, ${k.junctions} junctions, ${k.loops} loops, ${res.skeleton.voids.length} collapses, ${res.skeleton.tables.length} levels`, x + 6, y + 15);
    ctx.fillText(`form ${Math.round(res.ms.form)} + carve ${Math.round(res.ms.carve)}${res.dressing ? ` + dress ${Math.round(res.ms.dress)}` : ''} ms   dip ${res.dip.toFixed(0)}°`, x + 6, y + 30);
    stats.push({ seed: seed0 + i, length: Math.round(k.length), junctions: k.junctions, loops: k.loops, voids: res.skeleton.voids.length, levels: res.skeleton.tables.length, form: Math.round(res.ms.form), carve: Math.round(res.ms.carve), dress: Math.round(res.ms.dress), speleos: res.dressing?.speleos.length, rocks: res.dressing?.rocks.length, level: res.dressing?.stats.level, mesh: Math.round(res.ms.mesh), tris: res.tris });
  });
  const ms = (f: (r: CaveResult) => number) => Math.max(...results.map(f));
  done({ rock, size, n, wall: Math.round(wall), worstFormCarve: Math.round(ms((x) => x.ms.form + x.ms.carve + x.ms.dress)), stats });
}

/** The dressing as scene objects: formations (lathe bodies; dead ones grey), the stream and pools, the drips falling. */
function dressingScene(scene: T.Scene, res: CaveResult): void {
  const d = res.dressing;
  if (!d) return;
  const live = new T.MeshStandardMaterial({ color: 0xcdb892, roughness: 0.55 }), dead = new T.MeshStandardMaterial({ color: 0x8d8a82, roughness: 0.95 });
  // Stalactites fatten quickly from the tip; stalagmites are blunt and fall away from the foot; a column has a waist.
  const profile = (kind: string, rb: number, rt: number, waist: number): T.Vector2[] => Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, base = kind === 'stalagmite' ? rt + (rb - rt) * (1 - t ** 1.7) : kind === 'stalactite' ? rb + (rt - rb) * t ** 0.65 : rb + (rt - rb) * t;
    return new T.Vector2(Math.max(0.006, base * (1 - (1 - waist) * Math.sin(Math.PI * t))), t);
  });
  const geos = new Map<string, T.LatheGeometry>();
  for (const s of d.speleos) {
    const key = `${s.kind}|${s.rb.toFixed(2)}|${s.rt.toFixed(2)}|${s.waist}`;
    let g = geos.get(key);
    if (!g) geos.set(key, g = new T.LatheGeometry(profile(s.kind, s.rb, s.rt, s.waist), 12));
    const m = new T.Mesh(g, s.dead ? dead : live);
    m.position.set(s.x, s.y0, s.z); m.scale.set(1, s.y1 - s.y0, 1);
    scene.add(m);
  }
  const water = new T.MeshStandardMaterial({ color: 0x1f5f8f, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.72, side: T.DoubleSide });
  for (const st of d.streams) {
    const pos: number[] = [], idx: number[] = [];
    st.pts.forEach((p, i) => {
      const q = st.pts[Math.min(st.pts.length - 1, i + 1)], o = st.pts[Math.max(0, i - 1)], dx = q[0] - o[0], dz = q[2] - o[2], l = Math.hypot(dx, dz) || 1;
      pos.push(p[0] - dz / l * p[3], p[1], p[2] + dx / l * p[3], p[0] + dz / l * p[3], p[1], p[2] - dx / l * p[3]);
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    });
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    scene.add(new T.Mesh(g, water));
  }
  for (const p of d.pools) { const m = new T.Mesh(new T.CircleGeometry(p.r * 0.94, 20).rotateX(-Math.PI / 2), water); m.position.set(p.x, p.y + 0.01, p.z); scene.add(m); }
  // A drip: a drop falling a little below the tip, a thin wet thread, and the ring it makes where it lands.
  const drop = new T.MeshBasicMaterial({ color: 0xbfe4ff }), ring = new T.MeshBasicMaterial({ color: 0x9fd0f0, transparent: true, opacity: 0.6, side: T.DoubleSide });
  const dg = new T.SphereGeometry(0.035, 6, 6), rg = new T.RingGeometry(0.1, 0.13, 14).rotateX(-Math.PI / 2);
  d.drips.forEach((p, i) => {
    const fall = 0.25 + 0.5 * ((i * 0.618) % 1), m = new T.Mesh(dg, drop); m.position.set(p.x, p.y - fall * (p.y - p.floor) * 0.6, p.z); m.scale.y = 1.8; scene.add(m);
    const r = new T.Mesh(rg, ring); r.position.set(p.x, p.floor + 0.02, p.z); r.scale.setScalar(0.6 + ((i * 0.37) % 1)); scene.add(r);
  });
}

/** Six looks from the floor, as the hero sees: standing in a stream's bed (or on a way's floor), eye 1.7 m over it, a lantern, a hero's figure ahead for the size. */
async function floor(): Promise<void> {
  const seed = Number(q.get('seed') ?? 1), dress = q.get('dress') !== '0', tiles = Number(q.get('tiles') ?? 6), W = 550, H = 340, cols = 3;
  const res = await pool.run({ kind: 'form', setting: 'classic', seed, rock, size, coarse: 1, dress });
  const scene = new T.Scene();
  const mesh = new T.Mesh(geometry(res), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: T.DoubleSide }));
  scene.add(mesh);
  dressingScene(scene, res);
  scene.add(new T.AmbientLight(0x6a7488, 0.4));
  scene.background = new T.Color(0x07080a);
  scene.fog = new T.FogExp2(0x07080a, 0.03);
  const ray = new T.Raycaster(), up = new T.Vector3(0, -1, 0);
  const floorOf = (x: number, z: number, y: number): number => { ray.set(new T.Vector3(x, y + 1.5, z), up); ray.far = 8; const h = ray.intersectObject(mesh)[0]; return h ? h.point.y : y; };
  // Candidate places: points along the streams (the longest first), else the ways.
  type Spot = { x: number; y: number; z: number; tx: number; tz: number };
  const spots: Spot[] = [];
  const streams = [...(res.dressing?.streams ?? [])].sort((a, b) => b.pts.length - a.pts.length).slice(0, 8);
  for (const st of streams) for (let i = 4; i + 10 < st.pts.length; i += 6) { const a = st.pts[i], b = st.pts[i + 9]; spots.push({ x: a[0], y: a[1], z: a[2], tx: b[0], tz: b[2] }); }
  if (spots.length < tiles * 3) for (const c of res.skeleton.conduits.filter((k) => k.kind === 'passage')) for (let i = 2; i + 7 < c.points.length; i += 4) { const a = c.points[i], b = c.points[i + 6]; spots.push({ x: a.x, y: a.y - a.B - a.D, z: a.z, tx: b.x, tz: b.z }); }
  const eyeAt = (s: Spot) => new T.Vector3(s.x, floorOf(s.x, s.z, s.y) + 1.7, s.z);
  /** How far one can see from a spot (the first wall along the line of the way). */
  const open = (s: Spot): number => { const e = eyeAt(s), d = new T.Vector3(s.tx - s.x, 0, s.tz - s.z).normalize(); ray.set(e, d); ray.far = 30; const h = ray.intersectObject(mesh)[0]; return h ? h.distance : 30; };
  const picked = spots.map((s, i) => ({ s, i, open: open(s) })).filter((o) => o.open > 4).sort((a, b) => b.open - a.open);
  // Spread the picks: not two close ones.
  const chosen: Spot[] = [];
  for (const o of picked) { if (chosen.length >= tiles) break; if (chosen.every((c) => Math.hypot(c.x - o.s.x, c.z - o.s.z) > 14)) chosen.push(o.s); }
  const out = document.createElement('canvas'); out.width = W * cols; out.height = H * Math.ceil(chosen.length / cols);
  document.body.appendChild(out);
  const ctx = out.getContext('2d')!;
  const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(W, H); r.toneMapping = T.AgXToneMapping; r.toneMappingExposure = 1.3;
  const lantern = new T.PointLight(0xffc27a, 22, 40, 1.6); scene.add(lantern);
  const hero = new T.Group();
  hero.add(new T.Mesh(new T.CapsuleGeometry(0.28, 1.2, 4, 10), new T.MeshStandardMaterial({ color: 0x3d5a80, roughness: 0.8 })).translateY(0.95));
  hero.add(new T.Mesh(new T.SphereGeometry(0.16, 10, 8), new T.MeshStandardMaterial({ color: 0xd9b38c })).translateY(1.78));
  scene.add(hero);
  const cam = new T.PerspectiveCamera(80, W / H, 0.1, 200);
  chosen.forEach((s, n) => {
    const eye = eyeAt(s), dir = new T.Vector3(s.tx - s.x, 0, s.tz - s.z).normalize();
    hero.position.set(eye.x + dir.x * 4.5, floorOf(eye.x + dir.x * 4.5, eye.z + dir.z * 4.5, eye.y - 1.7), eye.z + dir.z * 4.5);
    cam.position.copy(eye); cam.lookAt(eye.x + dir.x * 5, eye.y - 0.25, eye.z + dir.z * 5);
    lantern.position.copy(eye).setY(eye.y + 0.3);
    r.render(scene, cam);
    ctx.drawImage(r.domElement, (n % cols) * W, Math.floor(n / cols) * H);
  });
  const dd = res.dressing;
  done({ rock, size, seed, views: chosen.length, ms: res.ms, tris: res.tris, dressing: dd && { speleos: dd.speleos.length, drips: dd.drips.length, rocks: dd.rocks.length, streams: dd.streams.length, pools: dd.pools.length, ...dd.stats } });
}

(view === 'floor' ? floor() : sheet()).catch((e) => { document.title = 'error'; console.error(e); done({ error: String(e) }); });
