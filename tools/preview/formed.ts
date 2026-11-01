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

const q = new URLSearchParams(location.search);
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

sheet().catch((e) => { document.title = 'error'; console.error(e); done({ error: String(e) }); });
