/**
 * The spell lab (spell-lab.html): every spell of the setting played on a meadow, a caster dummy and a foe dummy 7 m
 * away, lit and graded as in the game, drawn with the game's own spell drawing (app/spellFx). Click a spell to see
 * it loop; `?spell=<id>&t=<s>` holds one moment; `&cam=side|foe` looks from the side or at the foe; `&hour=` the
 * time of day; `&gl` WebGL. `window.lab.seek(id, t, cam)` holds a moment for the shots (tools/shot/spellfx.mjs).
 *
 * The lab times a spell itself (it gathers for its cast time, a bolt flies at its speed to the foe, an area bursts,
 * a zone lies for its time, a spell on the caster flares round them): what the recipe runner would do, without a
 * fight, so every moment can be seen again.
 */
import { BufferGeometry, CapsuleGeometry, CircleGeometry, Float32BufferAttribute, Group, Mesh, Vector3 } from 'three/webgpu';
import { createView } from '../render/view';
import { LAB_FLOOR } from '../render/materials/lab';
import { classic } from '../setting/classic';
import type { AbilityDef, AbilityOp, SpellMotif } from '../setting/contract';
import { SHAPES, SPRITES, SpellBits, type Vec3 } from '../app/spellFx/particles';
import { lookOf, type Caster, type FxLook } from '../app/spellFx/looks';
import { FxView } from '../app/spellFx/fxView';

const q = new URLSearchParams(location.search);
const STEP = 1 / 60;
const FEET: Vec3 = [0, 0, 0], HAND: Vec3 = [0.18, 1.38, -0.42], FOE: Vec3 = [0, 0, -7], CHEST: Vec3 = [0, 1.05, -7];
const CASTER: Caster = { feet: FEET, hand: HAND, facing: [0, 0, -1] };
const CAMS: Record<string, { at: Vec3; look: Vec3 }> = {
  behind: { at: [1.5, 2.3, 3.4], look: [0, 1, -3.8] },
  side: { at: [7.5, 2.0, -3.2], look: [0, 1, -3.4] },
  foe: { at: [2.6, 1.9, -3.2], look: [0, 0.9, -7] },
};

const setting = classic;
const spells = setting.abilities.filter((a) => a.glow || setting.skills.find((s) => s.id === a.skill)?.group === 'magic');
const motifOf = (a: AbilityDef): SpellMotif => a.glow?.motif ?? setting.skills.find((s) => s.id === a.skill)?.motif ?? 'radiance';

/** One spell played from its start: what has happened so far. */
class Run {
  readonly bits = new SpellBits(0x1ab);
  readonly fx: FxLook;
  t = 0;
  private released = false;
  private readonly bolt: { op: Extract<AbilityOp, { op: 'projectile' }>; at: Vec3; flight: number; done: boolean } | null;
  private readonly bursts: { at: number; fire: () => void }[] = [];
  private readonly zones: { from: number; life: number; ground: Vec3; radius: number; begun: boolean }[] = [];
  readonly cast: number;
  readonly length: number;
  /** When it strikes (a bolt lands; else when it is let go). */
  readonly strike: number;

  constructor(readonly def: AbilityDef) {
    this.fx = lookOf(motifOf(def));
    this.cast = def.cast ?? 0;
    const p = def.ops.find((o) => o.op === 'projectile') as Extract<AbilityOp, { op: 'projectile' }> | undefined;
    const d = Math.hypot(CHEST[0] - HAND[0], CHEST[1] - HAND[1], CHEST[2] - HAND[2]);
    this.bolt = p ? { op: p, at: HAND, flight: d / p.speed, done: false } : null;
    let end = this.cast + 2.5;
    // A bolt's onHit ops land where it struck, unless they name the caster.
    const placeOf = (onHit: boolean) => (o: { at?: string; to?: string }): Vec3 => (o.at === 'target' || o.to === 'target' || (onHit && o.at !== 'self') ? FOE : FEET);
    let place = placeOf(false);
    const areaOf = (o: AbilityOp, at: number) => {
      if (o.op === 'area' && o.look) { const g = place(o); this.bursts.push({ at, fire: () => this.fx.area(this.bits, g, o.radius) }); }
      if (o.op === 'zone') { this.zones.push({ from: at, life: o.duration, ground: place(o), radius: o.radius, begun: false }); end = Math.max(end, at + o.duration + 1); }
      if (o.op === 'look' && o.at !== 'target') this.bursts.push({ at, fire: () => this.fx.flare(this.bits, FEET) });
    };
    for (const o of def.ops) areaOf(o, this.cast);
    if (p) {
      const hitAt = this.cast + this.bolt!.flight;
      place = placeOf(true);
      if (p.onHit) for (const o of p.onHit) areaOf(o, hitAt);
      else this.bursts.push({ at: hitAt, fire: () => this.fx.hit(this.bits, CHEST, norm(sub(CHEST, HAND)), HAND) });
      end = Math.max(end, hitAt + 2);
    }
    this.length = end;
    this.strike = this.cast + (this.bolt?.flight ?? 0);
  }

  /** On by one step. */
  step(dt: number): void {
    const b = this.bits, t0 = this.t;
    this.t += dt;
    if (this.t < this.cast) this.fx.gather(b, CASTER, this.t / this.cast, dt, this.t);
    if (!this.released && this.t >= this.cast) { this.released = true; this.fx.release(b, HAND, [0, 0, -1]); }
    const bolt = this.bolt;
    if (bolt && !bolt.done && this.t >= this.cast) {
      const a = (this.t - this.cast) / bolt.flight;
      if (a >= 1) bolt.done = true;
      else {
        const dir = norm(sub(CHEST, HAND));
        bolt.at = [HAND[0] + (CHEST[0] - HAND[0]) * a, HAND[1] + (CHEST[1] - HAND[1]) * a, HAND[2] + (CHEST[2] - HAND[2]) * a];
        this.fx.bolt(b, bolt.at, dir, bolt.op.speed, HAND, dt, this.t);
      }
    }
    for (const x of this.bursts) if (x.at > t0 - 1e-9 && x.at <= this.t) x.fire();
    for (const z of this.zones) {
      if (this.t < z.from || this.t > z.from + z.life) continue;
      if (!z.begun) { z.begun = true; this.fx.zoneStart?.(b, z.ground, z.radius, z.life); }
      this.fx.zone(b, z.ground, z.radius, dt, z.from + z.life - this.t, this.t);
    }
    b.step(dt);
  }
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

async function main(): Promise<void> {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const view = await createView(canvas, { forceWebGL: q.has('gl'), hour: Number(q.get('hour') ?? 10.5), dayMinutes: 0 });
  const world = new Group();
  const floor = new Mesh(withColor(new CircleGeometry(60, 64).rotateX(-Math.PI / 2), [1, 1, 1]), LAB_FLOOR.make());
  floor.receiveShadow = true;
  const dummy = (x: number, z: number, c: Vec3) => {
    const m = new Mesh(withColor(new CapsuleGeometry(0.28, 1.15, 4, 12), c), LAB_FLOOR.make());
    m.position.set(x, 0.86, z);
    m.castShadow = true;
    return m;
  };
  world.add(floor, dummy(0, 0, [2.2, 1.8, 2.6]), dummy(FOE[0], FOE[2], [3, 1.5, 1.4]));
  view.scene.add(world);
  const fx = new FxView();
  view.scene.add(fx.group);
  await view.stage.add(world);
  await view.stage.add(view.sky.dome);
  await fx.enter(view.stage);

  let cam = q.get('cam') ?? 'behind';
  const place = () => {
    const c = CAMS[cam] ?? CAMS.behind!;
    view.camera.position.set(...c.at);
    view.camera.lookAt(new Vector3(...c.look));
  };
  place();
  const name = document.getElementById('name')!;
  let run: Run | null = null, playing = true;
  const start = (def: AbilityDef) => { run = new Run(def); name.textContent = def.name; for (const b of bar.children) b.classList.toggle('on', b.textContent === def.name); };
  const bar = document.getElementById('bar')!;
  for (const s of spells) {
    const b = document.createElement('button');
    b.textContent = s.name;
    b.onclick = () => { playing = true; start(s); };
    bar.append(b);
  }
  const frame = () => { view.sky.update(0, view.camera); view.draw(); };
  const lab = {
    spells: spells.map((s) => s.id),
    /** Hold spell `id` at `t` seconds from its start, seen from `camera`; resolves once drawn. */
    async seek(id: string, t: number, camera = 'behind'): Promise<{ sprites: number; solids: number }> {
      const def = spells.find((s) => s.id === id);
      if (!def) throw new Error(`no spell ${id}`);
      playing = false;
      cam = camera;
      place();
      start(def);
      while (run!.t + STEP <= t + 1e-9) run!.step(STEP);
      fx.draw(run!.bits);
      frame();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      // Held bits were cleared by the draw: step 0 to hold them again and draw once more.
      run!.step(0);
      fx.draw(run!.bits);
      frame();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      return fx.drawn;
    },
    timeline(id: string): { cast: number; strike: number; length: number } {
      const r = new Run(spells.find((s) => s.id === id)!);
      return { cast: r.cast, strike: r.strike, length: r.length };
    },
    shaders: () => view.stage.monitor,
    /** Every sprite picture side by side (and every solid below), held still, for judging the pictures alone. */
    async gallery(): Promise<void> {
      playing = false;
      cam = 'behind';
      place();
      const b = new SpellBits(1);
      for (let n = 0; n < 3; n++) {
      SPRITES.forEach((sp, i) => {
        const at: Vec3 = [-2.7 + (i % 5) * 1.35, 2.6 - Math.floor(i / 5) * 1.3, -3];
        b.hold(sp, at, 1.1, sp === 'puff' ? [0.35, 0.33, 0.3] : sp === 'leaf' ? [0.3, 0.6, 0.2] : sp === 'flame' ? [0.9, 0.75, 0.65] : [2, 1.2, 0.5], { cover: sp === 'puff' || sp === 'leaf' || sp === 'flame' ? 0.9 : 0.1, seed: 0.3, age: 0.3, stretch: sp === 'ray' || sp === 'wisp' || sp === 'spark' ? [0.3, 1, 0] : null, aspect: sp === 'ray' || sp === 'wisp' ? 3 : 1 });
      });
      SHAPES.forEach((sh, i) => b.holdSolid(sh, (['ice', 'rock', 'rock', 'leaf', 'wood'] as const)[i]!, [-2.4 + i * 1.2, 0.1, -2], [0, 1, 0], 0.5, 0.9, { glow: 0.3 }));
      fx.draw(b);
      frame();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
    },
  };
  (window as unknown as { lab: typeof lab }).lab = lab;
  const first = spells.find((s) => s.id === q.get('spell')) ?? spells[0]!;
  start(first);
  if (q.has('t')) await lab.seek(first.id, Number(q.get('t')), cam);
  let last = performance.now();
  const loop = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing && run) {
      run.step(dt);
      if (run.t > run.length) start(run.def);
      fx.draw(run.bits);
      frame();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  (window as unknown as { __labReady: boolean }).__labReady = true;
}

/** A vertex colour on every corner (the lab floor's material tints by it). */
function withColor(g: BufferGeometry, c: Vec3): BufferGeometry {
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => c[i % 3]!), 3));
  return g;
}

void main();
