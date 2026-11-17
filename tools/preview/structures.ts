/**
 * The gallery of a camp structure kind (D69, Z4: "a gallery of 12 seeds per kind with Arnd's eye on it before the kind
 * goes into play"): each seed's structure on its own land, drawn with the game's building shader (the town's texture
 * arrays), sun and sky, a figure of the hero for the size.
 *   structures.html?kind=bridge&from=1&n=12&view=gallery[&gl=1]
 * Views: `gallery` (three quarters from above), `far` (from 300 m at eye height: the silhouette; a bridge from down its river), `close` (standing
 * on its way in). `node tools/preview/structures.mjs out-dir` takes the pictures (WebGPU on a GPU with SHOT_GPU=1).
 */
import * as T from 'three/webgpu';
import { classic } from '../../src/setting/classic/index';
import { bridgeLand, ruinLand, type Land } from '../../src/world/structures/land';
import { fortifiedBridgeMesh, bridgeSignature, deckAt, planBridge } from '../../src/world/structures/bridge';
import { greatRuinMesh, planGreatRuin, ruinSignature } from '../../src/world/structures/ruin';
import { MeshKit, WildMat } from '../../src/world/dungeon/meshKit';
import { buildingMeshAt } from '../../src/render/materials/building';
import { useTownTextures } from '../../src/render/materials/townGround';
import { loadTownTextures } from '../../src/render/terrain/groundTextures';
import { createTexturePool } from '../../src/workers/pool';

const q = new URLSearchParams(location.search);
const kind = q.get('kind') ?? 'bridge', from = Number(q.get('from') ?? 1), n = Number(q.get('n') ?? 12), view = q.get('view') ?? 'gallery';
const cols = Number(q.get('cols') ?? 4), W = Number(q.get('w') ?? 640), H = Number(q.get('h') ?? 420);
const done = (o: unknown) => { (window as unknown as { done: string }).done = JSON.stringify(o); };

/** The land round the middle as a mesh in the building format: grass, rock where it is steep. */
function landMesh(land: Land, step: number, r = land.reach): ReturnType<MeshKit['mesh']> {
  const k = new MeshKit(), g = land.ground, N = Math.ceil((2 * r) / step);
  const h: number[] = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) h.push(g(-r + i * step, -r + j * step));
  const at = (i: number, j: number) => [-r + i * step, h[j * (N + 1) + i], -r + j * step];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    const steep = Math.max(Math.abs(a[1] - c[1]), Math.abs(b[1] - d[1])) / (step * Math.SQRT2);
    const rock = steep > 0.9;
    const tint: [number, number, number] = rock ? [200, 192, 180] : [236, 240, 214];
    // Rock's texture runs up the slope (x + z, y), grass's lies flat.
    const uv = (p: number[]) => (rock ? [p[0] + p[2], p[1]] : [p[0], p[2]]);
    k.quad(a, d, c, b, [uv(a), uv(d), uv(c), uv(b)], rock ? WildMat.Rock : WildMat.Grass, tint);
  }
  return k.mesh();
}

interface Built { mesh: ReturnType<MeshKit['mesh']>; label: string; centre: T.Vector3; radius: number; eye: T.Vector3; look: T.Vector3; hero: T.Vector3 }

function build(seed: number): { land: Land; built: Built } {
  if (kind === 'bridge') {
    const land = bridgeLand(seed), plan = planBridge(classic.structures!, seed, land.ground), mesh = fortifiedBridgeMesh(plan, land.ground);
    const s = bridgeSignature(plan);
    // Standing on the road a few steps before the first tower or span, looking along the deck.
    const mid = (plan.xs + plan.xe) / 2, x0 = Math.max(plan.xs, Math.min(plan.spans[0]?.x0 ?? plan.lipA, ...plan.towers.map((t) => t.cx - t.hx)) - 8);
    return {
      land, built: {
        mesh, label: `${seed}: ${plan.picks.builder.id}, ${s.form}, ${plan.spans.length} spans${plan.tiers > 1 ? ` in ${plan.tiers} tiers` : ''}, ${s.gates} gate ${s.gateType}, ${s.mids} on piers, ${plan.picks.state}, ${plan.picks.holder.id} (${land.kind})`,
        centre: new T.Vector3(mid, (plan.low + plan.high) / 2, 0), radius: Math.max(plan.xe - plan.xs, plan.high - plan.low) / 2 + 6,
        eye: new T.Vector3(x0 - 7, deckAt(plan, x0) + 2.2, -plan.hw * 0.3), look: new T.Vector3(x0 + 30, deckAt(plan, x0 + 30) + 2.2, 0), hero: new T.Vector3(x0 + 2.5, deckAt(plan, x0 + 2.5), 1),
      },
    };
  }
  const land = ruinLand(seed), plan = planGreatRuin(classic.structures!, seed, land.ground), mesh = greatRuinMesh(plan, land.ground);
  const s = ruinSignature(plan);
  return {
    land, built: {
      mesh, label: `${seed}: ${plan.picks.builder.id}, ${s.layout}, ${s.halls} halls, ${s.towers} towers, ${s.terraces} terraces, ${plan.picks.state} (${land.kind})`,
      centre: new T.Vector3(plan.cx, (plan.low + plan.high) / 2, plan.cz), radius: plan.radius,
      eye: new T.Vector3(plan.gate[0], Math.max(plan.gate[2], land.ground(plan.gate[0], plan.gate[1] - 11)) + 1.7, plan.gate[1] - 11), look: new T.Vector3(plan.cx, plan.gate[2] + 4, plan.cz), hero: new T.Vector3(plan.gate[0] + 1, land.ground(plan.gate[0] + 1, plan.gate[1] - 6), plan.gate[1] - 6),
    },
  };
}

async function main(): Promise<void> {
  const pool = createTexturePool();
  useTownTextures(await loadTownTextures(pool));
  const r = new T.WebGPURenderer({ antialias: true, forceWebGL: q.has('gl') });
  r.setSize(W, H); r.toneMapping = T.AgXToneMapping; r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true;
  await r.init();
  const out = document.createElement('canvas'); out.width = W * cols; out.height = H * Math.ceil(n / cols);
  document.body.appendChild(out);
  const ctx = out.getContext('2d')!;
  const stats: unknown[] = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const seed = from + i, tb = performance.now();
    const { land, built } = build(seed);
    const ms = performance.now() - tb;
    const scene = new T.Scene();
    scene.background = new T.Color(0xa8c0d6);
    scene.fog = new T.Fog(0xb4c7d8, 350, 1400);
    scene.add(new T.HemisphereLight(0xcfe0f0, 0x6b6450, 1.1));
    const sun = new T.DirectionalLight(0xfff1dc, 3.1);
    sun.position.set(built.centre.x - 120, built.centre.y + 160, built.centre.z - 90); sun.target.position.copy(built.centre);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera as T.OrthographicCamera, R = built.radius * 1.3;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 600; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);
    // From far off the land reaches past the eye, so the structure stands in a country, not on an island.
    const reach = view === 'far' ? 380 : land.reach;
    scene.add(buildingMeshAt(landMesh(land, view === 'far' ? 2.5 : 2, reach), 0, 0, 0, 'land'));
    if (land.water !== null) {
      const water = new T.Mesh(new T.PlaneGeometry(reach * 2, reach * 2).rotateX(-Math.PI / 2), new T.MeshPhysicalMaterial({ color: 0x4a6470, roughness: 0.08, metalness: 0.1 }));
      water.position.y = land.water; scene.add(water);
    }
    scene.add(buildingMeshAt(built.mesh, 0, 0, 0, 'structure'));
    const hero = new T.Group();
    hero.add(new T.Mesh(new T.CapsuleGeometry(0.28, 1.2, 4, 10), new T.MeshStandardMaterial({ color: 0x3d5a80, roughness: 0.8 })).translateY(0.9));
    hero.add(new T.Mesh(new T.SphereGeometry(0.16, 10, 8), new T.MeshStandardMaterial({ color: 0xd9b38c })).translateY(1.72));
    hero.position.copy(built.hero); hero.traverse((o) => { o.castShadow = true; });
    scene.add(hero);
    const cam = new T.PerspectiveCamera(view === 'close' ? 70 : view === 'far' ? 24 : 38, W / H, 0.3, 3000);
    if (view === 'gallery') {
      const d = built.radius / Math.sin((38 * Math.PI) / 360) * 0.95;
      const dir = new T.Vector3(-0.58, 0.4, -0.71).normalize();
      cam.position.copy(built.centre).addScaledVector(dir, d); cam.lookAt(built.centre);
    } else if (view === 'far') {
      if (kind === 'bridge') {
        // A bridge is seen from afar up its river (from the banks above a gorge it is hidden): the lowest ground 300 m downstream.
        let bx = 0, by = Infinity;
        for (let x = -90; x <= 90; x += 2) { const y = land.ground(x, -300); if (y < by) { by = y; bx = x; } }
        cam.position.set(bx, Math.max(by, land.water ?? -Infinity) + 1.8, -300);
      } else {
        const ax = new T.Vector3(-0.5, 0, -0.866), at = built.centre.clone().addScaledVector(ax, 300);
        cam.position.set(at.x, land.ground(at.x, at.z) + 1.8, at.z);
      }
      cam.lookAt(built.centre.x, built.centre.y, built.centre.z);
      sun.shadow.camera.far = 900;
    } else { cam.position.copy(built.eye); cam.lookAt(built.look); }
    await r.renderAsync(scene, cam);
    const x = (i % cols) * W, y = Math.floor(i / cols) * H;
    ctx.drawImage(r.domElement, x, y);
    ctx.font = '15px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y + H - 24, W, 24); ctx.fillStyle = '#f2ece0'; ctx.fillText(built.label, x + 8, y + H - 7);
    stats.push({ seed, tris: built.mesh.index.length / 3, ms: Math.round(ms) });
    scene.traverse((o) => { if ((o as T.Mesh).geometry) (o as T.Mesh).geometry.dispose(); });
  }
  pool.dispose();
  done({ kind, view, n, ms: Math.round(performance.now() - t0), stats });
}
main().catch((e) => { console.error(e); done({ error: String(e && (e as Error).stack || e) }); });
