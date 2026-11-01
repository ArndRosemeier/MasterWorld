/**
 * Walk in a formed cave (phase K5): the real walker (src/game/walker.ts) over the carved field (src/game/formedWorld.ts), the
 * game's own node shaders, a lantern. Click to look round with the mouse; W A S D walk, shift walks slowly, space jumps
 * (and climbs the rock's faces: push into one), 1..9 stand at a place of the cave (ways in, voids, dead ends, junctions,
 * ledges, the bank), R goes back to the way in.
 *   walk.html?rock=massive&seed=6&size=medium[&gl][&at=3]
 * `&auto=1` takes a picture from each of the first places for the checks (window.done).
 */
import * as T from 'three/webgpu';
import { Walker } from '../../src/game/walker';
import { formedWorld } from '../../src/game/formedWorld';
import { pathTo } from '../../src/world/cave/reader';
import { createCavePool } from '../../src/workers/pool';
import { caveScene } from './caveScene';

const q = new URLSearchParams(location.search);
const rock = q.get('rock') ?? 'massive', size = q.get('size') ?? 'medium', seed = Number(q.get('seed') ?? 1);
const hud = document.getElementById('hud')!;
const done = (o: unknown) => { (window as unknown as { done: string }).done = JSON.stringify(o); };

async function main(): Promise<void> {
  hud.textContent = 'forming the cave...';
  const res = await createCavePool().run({ kind: 'form', setting: 'classic', seed, rock, size, coarse: 1, dress: true, read: true, field: true });
  const g = res.read!.reading, field = res.field!;
  const r = new T.WebGPURenderer({ antialias: true, forceWebGL: q.has('gl') });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(innerWidth, innerHeight);
  r.toneMapping = T.AgXToneMapping; r.toneMappingExposure = 1.3;
  await r.init();
  document.body.appendChild(r.domElement);
  const { scene } = caveScene(res);
  const lantern = new T.PointLight(0xffe2bd, 9, 40, 1.6); scene.add(lantern);
  const cam = new T.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 300);
  addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });

  const walker = new Walker(formedWorld(field)), keys = new Set<string>();
  let pitch = 0;
  const places = [...g.places].sort((a, b) => ['entry', 'skylight', 'void', 'junction', 'ledge', 'bank', 'alcove', 'deadEnd'].indexOf(a.kind) - ['entry', 'skylight', 'void', 'junction', 'ledge', 'bank', 'alcove', 'deadEnd'].indexOf(b.kind) || a.depth - b.depth);
  /** Stand at a cell, facing along the way (towards the deepest place for the way in). */
  const stand = (cell: number, towards?: number): void => {
    walker.place(g.x[cell], g.z[cell], g.y[cell] + 0.02);
    const to = towards ?? (g.edgeStart[cell] < g.edgeStart[cell + 1] ? g.edgeTo[g.edgeStart[cell]] : cell);
    walker.yaw = Math.atan2(-(g.x[to] - g.x[cell]), -(g.z[to] - g.z[cell])); pitch = -0.08;
  };
  const deepest = places.reduce((a, b) => (b.depth > a.depth ? b : a), places[0]);
  const wayIn = (): void => { const p = pathTo(g, deepest.cell); stand(g.entries[0] ?? p[0], p[Math.min(12, p.length - 1)]); };
  wayIn();
  if (q.has('at')) { const p = places[Number(q.get('at')) % places.length]; stand(p.cell, undefined); }
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyR') wayIn();
    if (/^Digit[1-9]$/.test(e.code)) { const p = places[Number(e.code.slice(5)) - 1]; if (p) stand(p.cell); }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  r.domElement.addEventListener('click', () => r.domElement.requestPointerLock?.());
  addEventListener('mousemove', (e) => { if (document.pointerLockElement) { walker.yaw -= e.movementX * 0.0025; pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * 0.0025)); } });

  const frame = (dt: number): void => {
    const k = (c: string) => (keys.has(c) ? 1 : 0);
    walker.step({ forward: k('KeyW') - k('KeyS'), strafe: k('KeyD') - k('KeyA'), heading: walker.yaw, walk: keys.has('ShiftLeft'), up: keys.has('Space'), down: false }, dt);
    const p = walker.pos, eye = p.y + 1.6;
    cam.position.set(p.x, eye, p.z);
    cam.rotation.set(pitch, walker.yaw, 0, 'YXZ');
    lantern.position.set(p.x - Math.sin(walker.yaw) * 0.4, p.y + 1.9, p.z - Math.cos(walker.yaw) * 0.4);
    const near = places.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a), places[0]);
    hud.textContent = `${rock} #${seed} ${size}   ${g.stats.cells} cells, ${places.length} places, ${res.read!.opened.length} ways cut\nmode ${walker.mode}   near: ${near.kind} (${Math.hypot(near.x - p.x, near.z - p.z).toFixed(0)} m)\nW A S D walk, shift slow, space jump/climb, 1-9 places, R way in, click to look`;
  };

  if (q.has('auto')) {
    // One picture from where it stands (`at` picks the place), for the checks (window.done once drawn).
    for (let i = 0; i < 4; i++) frame(1 / 30);
    await r.renderAsync(scene, cam);
    // The renderer's own canvas is cleared once presented: the picture is copied to a 2D canvas (the first on the page).
    const pic = document.createElement('canvas'); pic.width = innerWidth; pic.height = innerHeight;
    pic.getContext('2d')!.drawImage(r.domElement, 0, 0);
    document.body.prepend(pic);
    done({ rock, seed, places: places.length, reached: g.stats.reached, at: q.get('at') });
    return;
  }
  let last = performance.now();
  r.setAnimationLoop(() => { const now = performance.now(); frame(Math.min(0.1, (now - last) / 1000)); last = now; void r.render(scene, cam); });
}
main().catch((e) => { console.error(e); hud.textContent = String(e); done({ error: String(e) }); });
