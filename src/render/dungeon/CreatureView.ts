/**
 * A den's creatures drawn (plan 9.3, 12): rats are Dunfinity's modelled quarry rat (public/creatures, its
 * clips: sniffing, scurrying, the run, rearing up, the bite, a flinch, dying), scaled to their kind;
 * spiders are procedural animals (@futuremagic/creatures, grown once per kind from the setting's seed: a
 * chitin eight-legger) on one flesh shader; goblins, smugglers, the dead and ghouls are Actors people
 * (./foes.ts: their looks and clips) in the cellar's rags, holding their weapons, the skeleton Actors' bones.
 * Each is posed every frame from what the den says it is doing: walking, running, rummaging, the wind-up
 * and blow, a flinch when struck, begging, falling. Built behind the loading screen; placed at the
 * cellar's origin.
 */
import { Box3, Group, Vector3, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { Rng, deriveSeed, hexToRgb } from '@futuremagic/core';
import { Character } from '@actors/generator';
import { nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '@actors/human/worker?worker';
import { grow, type BodyPlan, type Integument } from '@futuremagic/creatures';
import { CritterModel, ModelledCreature, type ClipUse, type CritterFigure, type ModelledFigure, type RigInput } from '@futuremagic/creatures/three';
import type { CreatureDef } from '../../setting/contract';
import type { Creature, Den } from '../../sim/creatures';
import { critterMaterials, ratMaterial } from '../materials/creatures';
import { buildArm } from '../hero/arms';
import { gripHeld } from '../hero/grips';
import { playClip } from '../hero/play';
import { foeClip, foeLook, type FoeDoing } from './foes';
import type { Stage } from '@futuremagic/stage';

/** Where the build serves the people's pack (`npm run packs` fills public/packs). */
const PACK = `${import.meta.env.BASE_URL}packs/human/manifest.json`;
/** A blow from the start of its wind-up to its follow-through, seconds. */
const BLOW = 0.75;
/** A flinch, seconds. */
const FLINCH = 0.35;
/** The rat's clips (AssetGenerator's quadruped rat_clips.py; strides at size 1). */
const RAT_CLIPS: Record<string, ClipUse> = {
  Sniff: { loop: true }, Scurry: { loop: true, stride: 0.22 }, Run: { loop: true, stride: 0.45 }, Rear: { loop: true },
  Graze: { loop: true }, Bite: { loop: false }, Die: { loop: false },
};

type Body =
  | { readonly kind: 'critter'; readonly fig: CritterFigure; readonly scale: number }
  | { readonly kind: 'modelled'; readonly fig: ModelledFigure; readonly scale: number }
  | { readonly kind: 'person'; readonly ch: Character; readonly place: Group; readonly held: Object3D | null; clip: string; drawn: boolean | null };

interface Shown {
  readonly c: Creature;
  readonly body: Body;
  px: number;
  pz: number;
  /** When its current blow began, the health it had last frame, when it was last hurt. */
  blowAt: number;
  health: number;
  hurtAt: number;
  act: string;
  variant: number;
  /** Metres walked (a modelled body's stride). */
  walked: number;
}

const yawOf = (dir: number) => Math.atan2(-Math.cos(dir), -Math.sin(dir));

/** The animal a rat or spider is (one species per creature kind, from the seed). */
function speciesFor(def: CreatureDef, seed: number) {
  const b = def.body;
  const spider = b.kind === 'spider';
  const force: { plan: BodyPlan; integument: Integument } = spider ? { plan: 'octopod', integument: 'chitin' } : { plan: 'quadruped', integument: 'fur' };
  const sp = grow(new Rng(deriveSeed(seed, 'creature', def.id)), spider ? 'hunter' : 'scuttler', 0, def.id, force);
  const tone = hexToRgb(parseInt((b.kind === 'humanoid' ? '#000000' : b.color).slice(1), 16));
  // The setting's colour over the grown coat, its pattern kept.
  return { ...sp, colors: { ...sp.colors, base: tone, secondary: tone.map((v) => v * 0.75) as typeof tone, belly: tone.map((v) => Math.min(1, v * 1.5)) as typeof tone } };
}

export class CreatureView {
  readonly group = new Group();
  private readonly shown: Shown[] = [];
  private time = 0;
  /** The height (cellar frame) of the creature being posed: where its feet look for the floor. */
  private near = 0;
  private readonly eyeWorld: [number, number, number] = [0, 0, 0];
  private readonly input: { -readonly [K in keyof RigInput]: RigInput[K] } = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, dead: false, action: '', actionT: 0, lookAt: null, running: false, pose: '', time: 0, scale: 1 };

  private constructor(readonly den: Den, origin: { x: number; y: number; z: number }) {
    this.group.name = 'creatures';
    this.group.position.set(origin.x, origin.y, origin.z);
  }

  static async build(den: Den, seed: number, origin: { x: number; y: number; z: number }, renderer: WebGPURenderer): Promise<CreatureView> {
    const v = new CreatureView(den, origin);
    const models = new Map<string, CritterModel>();
    let rat: { model: ModelledCreature; length: number } | null = null;
    // The cellar's people: the first loads the pack (in its own worker), the others share it.
    let lead: Character | null = null;
    const person = async () => {
      const ch = await Character.load({ pack: PACK, renderer, materials: nodeMaterials, clipLibraries: false, ...(lead ? { shareWith: lead } : { worker: new HumanWorker() }) });
      lead ??= ch;
      return ch;
    };
    // The rig plants feet in the world: the cellar's floor under them (near the storey the creature is on).
    const O = v.group.position;
    const ground = (x: number, z: number) => (den.space.floorAt(x - O.x, z - O.z, v.near + 0.8) ?? v.near) + O.y;
    for (const c of den.creatures) {
      const b = c.def.body;
      let body: Body;
      if (b.kind === 'humanoid') {
        const ch = await person();
        await ch.set(foeLook(c.def, seed, c.id));
        ch.setLod(0); // a cellar is small: always close
        // Never placed directly (Actors keeps its own offset): a group carries it, at the setting's height.
        const place = new Group();
        place.name = c.def.name;
        place.add(ch.object);
        place.scale.setScalar(b.height / (ch.height || 1.75));
        ch.object.traverse((m) => { if ((m as { isMesh?: boolean }).isMesh) m.castShadow = !m.name.startsWith('genitals'); });
        v.group.add(place);
        body = { kind: 'person', ch, place, held: b.held ? buildArm(b.held) : null, clip: '', drawn: null };
      } else if (b.kind === 'rat') {
        if (!rat) {
          const model = await ModelledCreature.load(`${import.meta.env.BASE_URL}creatures/quarry_rat.glb`, ratMaterial);
          const f = model.figure(RAT_CLIPS);
          const size = new Box3().setFromObject(f.root).getSize(new Vector3());
          rat = { model, length: Math.max(size.x, size.z) };
        }
        const fig = rat.model.figure(RAT_CLIPS, 'Hurt');
        // Its length without the tail, as the setting gives it (the tail is about two fifths of the model).
        const scale = b.length / (rat.length * 0.6);
        fig.root.name = c.def.name;
        v.group.add(fig.root);
        body = { kind: 'modelled', fig, scale };
      } else {
        let m = models.get(c.def.id);
        if (!m) { m = new CritterModel(speciesFor(c.def, seed), critterMaterials()); models.set(c.def.id, m); }
        const fig = m.figure(ground);
        // Its length, legs and all, as the setting gives it.
        const scale = b.length / Math.max(0.05, m.species.totalLength);
        fig.root.name = c.def.name;
        v.group.add(fig.root);
        body = { kind: 'critter', fig, scale };
      }
      v.shown.push({ c, body, px: c.x, pz: c.z, blowAt: -9, health: c.health, hurtAt: -9, act: c.act, variant: c.id, walked: 0 });
    }
    v.pose(0);
    return v;
  }

  /** Everything drawn (for the warm-up). */
  get objects(): Object3D[] { return [this.group]; }

  /** Pose everyone after the den's last step; `eye`: the hero's head, in the cellar's frame (they watch it). */
  pose(dt: number, eye?: readonly [number, number, number]): void {
    this.time += dt;
    const t = this.time;
    for (const s of this.shown) {
      const c = s.c;
      const vx = dt > 0 ? (c.x - s.px) / dt : 0, vz = dt > 0 ? (c.z - s.pz) / dt : 0;
      s.px = c.x; s.pz = c.z;
      if (c.act === 'swing' && s.act !== 'swing') { s.blowAt = t; s.variant++; }
      if (c.health < s.health) s.hurtAt = t;
      s.health = c.health;
      s.act = c.act;
      const blowT = (t - s.blowAt) / BLOW, hurtT = (t - s.hurtAt) / FLINCH;
      const dead = c.state === 'dead';
      const yaw = yawOf(c.dir);
      const watching = !dead && (c.state === 'alert' || c.state === 'fight' || c.state === 'beg') && eye ? eye : null;
      if (s.body.kind === 'modelled') {
        const f = s.body.fig, k = s.body.scale, speed = Math.hypot(vx, vz) / k;
        s.walked += Math.hypot(vx, vz) * dt;
        f.root.position.set(c.x, c.y, c.z);
        f.root.rotation.set(0, yaw + Math.PI, 0);
        f.root.scale.setScalar(k);
        const clip = dead ? 'Die' : blowT < 1 ? 'Bite' : c.state === 'alert' ? 'Rear' : speed > 2.2 ? 'Run' : speed > 0.2 ? 'Scurry' : c.act === 'gnaw' || c.act === 'rummage' ? 'Graze' : 'Sniff';
        f.play(clip);
        f.pace(s.walked / k);
        if (hurtT < 1 && hurtT * FLINCH < dt + 1e-6 && !dead) f.hurt();
        f.advance(dt);
      } else if (s.body.kind === 'critter') {
        const i = this.input;
        i.x = c.x; i.y = c.y; i.z = c.z; i.yaw = yaw; i.vx = vx; i.vz = vz; i.dead = dead; i.time = t; i.scale = s.body.scale;
        i.running = c.act === 'run' || c.state === 'fight' || c.state === 'flee';
        i.pose = c.act === 'gnaw' || c.act === 'sniff' || c.act === 'rummage' || c.act === 'spin' ? 'feed' : '';
        const O = this.group.position;
        if (watching) { this.eyeWorld[0] = watching[0] + O.x; this.eyeWorld[1] = watching[1] + O.y; this.eyeWorld[2] = watching[2] + O.z; }
        i.lookAt = watching ? this.eyeWorld : null;
        this.near = c.y;
        if (blowT < 1 && !dead) { i.action = c.def.body.kind === 'spider' ? 'lunge' : 'bite'; i.actionT = blowT; }
        else if (hurtT < 1 && !dead) { i.action = 'flinch'; i.actionT = hurtT; }
        else { i.action = ''; i.actionT = 0; }
        s.body.fig.animate(i, dt, hurtT < 1 ? 1 - hurtT : 0);
      } else {
        const p = s.body;
        const fighting = c.state === 'fight' || c.state === 'alert';
        const doing: FoeDoing = {
          dead, speed: Math.hypot(vx, vz), fighting,
          low: c.act === 'beg' ? 'beg' : c.act === 'rummage' || c.act === 'gnaw' ? 'rummage' : null,
          action: dead ? null : blowT < 1 ? (c.def.body.kind === 'humanoid' && c.def.body.held === 'knife' ? 'stab' : c.def.body.kind === 'humanoid' && c.def.body.held ? 'swing_1h' : 'slam') : hurtT < 1 ? 'flinch' : null,
          variant: s.variant,
        };
        const clip = foeClip(c.def, doing);
        // A blow or flinch starts again when a new one comes, even of the same clip.
        const fresh = (doing.action === 'flinch' && hurtT * FLINCH < dt + 1e-6) || (doing.action && doing.action !== 'flinch' && blowT * BLOW < dt + 1e-6);
        if (clip !== p.clip || fresh) {
          p.clip = clip;
          const once = !!doing.action || dead;
          playClip(p.ch, clip, once, () => p.clip === clip, doing.action === 'flinch' ? FLINCH * 1.5 : doing.action ? BLOW : undefined);
        }
        if (p.drawn !== fighting) { p.drawn = fighting; gripHeld(p.held, null, fighting, p.ch.actor.bones, p.place); }
        p.ch.update(dt);
        p.place.position.set(c.x, c.y, c.z);
        // The den's yaw turns −z; Actors' people face +z.
        p.place.rotation.y = yaw + Math.PI;
      }
    }
  }

  /**
   * Compile every shader its people draw with, each one's shadow casters too (Actors people's shadow
   * builds are their own), meshes Actors keeps hidden included (compileAsync skips hidden ones).
   */
  async warm(stage: Stage): Promise<void> {
    const hidden: Object3D[] = [];
    this.group.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    await stage.prepare(this.group, { everyCaster: true });
    for (const o of hidden) o.visible = false;
  }

  /** The creature drawn nearest to a ray from the camera (a click), within `slack` metres of it. */
  under(from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, slack = 0.6): Creature | null {
    let best: Creature | null = null, bd = Infinity;
    const O = this.group.position;
    for (const s of this.shown) {
      const c = s.c;
      const h = c.def.body.kind === 'humanoid' ? c.def.body.height * 0.6 : 0.2;
      const px = c.x + O.x - from.x, py = c.y + h + O.y - from.y, pz = c.z + O.z - from.z;
      const along = px * dir.x + py * dir.y + pz * dir.z;
      if (along < 0) continue;
      const off = Math.hypot(px - dir.x * along, py - dir.y * along, pz - dir.z * along);
      if (off < slack + (c.def.body.kind === 'humanoid' ? 0.2 : 0) && along < bd) { bd = along; best = c; }
    }
    return best;
  }
}
