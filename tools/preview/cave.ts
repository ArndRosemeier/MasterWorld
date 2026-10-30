/**
 * A cave's carved rock alone (plan P1), for looking at its shapes without the game: plain lit geometry in its
 * tint, its water blue, its shafts' cones pale. `npx vite` then tools/preview/cave.html?n=4&view=floor; or
 * `node tools/preview/cave.mjs out-dir` for pictures (SwiftShader is quick enough for this, not for the game).
 */
import * as T from 'three';
import { classic } from '../../src/setting/classic/index';
import { outlineCellar } from '../../src/world/dungeon/cellar';
import { caveField, caveShell } from '../../src/world/dungeon/caveRock';
import { caveFeatures, keepSpots } from '../../src/world/dungeon/caveFeatures';
import { testDecision, testHouse } from '../../src/world/dungeon/variety';

const q = new URLSearchParams(location.search), n = Number(q.get('n') ?? 4);
const c = outlineCellar(testDecision(n, 1, 'cave'), testHouse(n), classic.dungeons.cave!);
const f = caveFeatures(c.layout, n, keepSpots(c)), field = caveField(c.layout, n, f), m = caveShell(field, c.layout, n, f);
const g = new T.BufferGeometry();
g.setAttribute('position', new T.BufferAttribute(m.position, 3));
g.setAttribute('normal', new T.BufferAttribute(m.normal, 3));
g.setAttribute('color', new T.BufferAttribute(Float32Array.from(m.tint, (v) => (v / 255) ** 2.2), 3));
g.setIndex(new T.BufferAttribute(m.index, 1));
const scene = new T.Scene();
scene.add(new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: T.DoubleSide, flatShading: false })));
for (const p of f.pools) {
  const d = new T.Mesh(new T.CircleGeometry(p.r, 28).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x203848, roughness: 0.1 }));
  d.position.set(p.x, p.top, p.z); scene.add(d);
}
for (const s of f.streams) for (let i = 1; i < s.pts.length; i++) {
  const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i], l = Math.hypot(bx - ax, bz - az);
  const b = new T.Mesh(new T.PlaneGeometry(s.w * 1.9, l).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x203848, roughness: 0.1 }));
  b.position.set((ax + bx) / 2, s.top, (az + bz) / 2); b.rotation.y = Math.atan2(bx - ax, bz - az); scene.add(b);
}
for (const s of f.shafts) {
  const cone = new T.Mesh(new T.CylinderGeometry(s.r * 0.8, s.r * 1.6, s.top - s.floor, 18, 1, true), new T.MeshBasicMaterial({ color: 0x8090a0, transparent: true, opacity: 0.08, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
  cone.position.set(s.x, (s.top + s.floor) / 2, s.z); scene.add(cone);
  const l = new T.PointLight(0xc4d4ff, 25, 48, 1.25); l.position.set(s.x, s.floor + 7, s.z); scene.add(l);
}
scene.add(new T.AmbientLight(0x404858, 0.35));
const top = c.layout.rooms.reduce((a, r) => (r.height > a.height ? r : a)), { cell, storey } = c.layout.scale;
const x0 = top.x * cell, z0 = top.z * cell, W = top.w * cell, D = top.d * cell, fl = top.level * storey;
const at = (u: number, up: number, w: number) => new T.Vector3(x0 + W * u, fl + up, z0 + D * w);
const views: Record<string, [T.Vector3, T.Vector3]> = {
  floor: [at(0.25, 2.2, 0.3), at(0.85, 1.5, 0.8)],
  floor2: [at(0.75, 2.2, 0.7), at(0.15, 2, 0.2)],
  above: [at(0.42, 10, 0.3), at(0.5, 0, 0.75)],
  shaft: [at(0.2, 2, 0.5), at(f.shafts[0] ? (f.shafts[0].x - x0) / W : 0.5, 12, f.shafts[0] ? (f.shafts[0].z - z0) / D : 0.5)],
  wall: [at(0.5, 1.6, 0.5), at(1, 0.5, 0.5)],
};
const [eye, look] = views[q.get('view') ?? 'floor'];
const cam = new T.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 200);
cam.position.copy(eye); cam.lookAt(look);
const lantern = new T.PointLight(0xffc27a, 13, 14, 1.6); lantern.position.copy(eye); scene.add(lantern);
const r = new T.WebGLRenderer({ antialias: true });
r.setSize(innerWidth, innerHeight);
r.toneMapping = T.AgXToneMapping;
document.body.appendChild(r.domElement);
r.render(scene, cam);
(window as unknown as { done: string }).done = JSON.stringify({ pools: f.pools.length, streams: f.streams.length, shafts: f.shafts.length, blocks: f.blocks.length, mites: f.mites.length, w: W, d: D });
