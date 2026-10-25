/**
 * A den's creatures drawn (plan 9.3, 12): rats and spiders are procedural animals (@futuremagic/creatures,
 * grown once per kind from the setting's seed: a rat a plain furred quadruped, a spider a chitin
 * eight-legger) on one flesh shader; goblins, smugglers, the dead and ghouls are humanoids
 * (@futuremagic/humanoid) in the cellar's outfits, holding their weapons, the skeleton only its bones.
 * Each is posed every frame from what the den says it is doing: walking, running, rummaging, the wind-up
 * and blow, a flinch when struck, begging, falling. Built behind the loading screen; placed at the
 * cellar's origin.
 */
import { Group, type Object3D } from 'three/webgpu';
import { Rng, deriveSeed, hexToRgb } from '@futuremagic/core';
import { grow, type BodyPlan, type Integument } from '@futuremagic/creatures';
import { CritterModel, type CritterFigure, type RigInput } from '@futuremagic/creatures/three';
import { randomAppearance, setHumanAssetBase, type EquipmentVisuals, type RaceId } from '@futuremagic/humanoid';
import { Humanoid, type ActionAnim, type MoveState } from '@futuremagic/humanoid/three';
import type { CreatureDef } from '../../setting/contract';
import type { Creature, Den } from '../../sim/creatures';
import { critterMaterials } from '../materials/creatures';
import { TRAVELLER, visual } from '../hero/wardrobe';

const ASSETS = `${import.meta.env.BASE_URL}humanoid/`;
/** A blow from the start of its wind-up to its follow-through, seconds. */
const BLOW = 0.75;
/** A flinch, seconds. */
const FLINCH = 0.35;

type Body =
  | { readonly kind: 'critter'; readonly fig: CritterFigure; readonly scale: number }
  | { readonly kind: 'humanoid'; readonly body: Humanoid; readonly scale: number };

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

/** What a humanoid creature wears, by its outfit. */
function outfitOf(def: CreatureDef, k: number, rng: Rng): EquipmentVisuals {
  const b = def.body;
  if (b.kind !== 'humanoid') return {};
  const held = b.held ? { mainhand: { defId: b.held, visual: visual(k, [1, 1, 1], b.held) } } : {};
  const dull = (r: number, g: number, bl: number): [number, number, number] => [r * rng.range(0.8, 1.2), g * rng.range(0.8, 1.2), bl * rng.range(0.8, 1.2)];
  if (b.bones) return held;
  if (b.outfit === 'rags') return { chest: { defId: 'rags', visual: visual(k, dull(0.34, 0.28, 0.19)) }, legs: { defId: 'trousers', visual: visual(k + 1, dull(0.2, 0.16, 0.11)) }, ...held };
  if (b.outfit === 'bandit') {
    return {
      chest: { defId: 'shirt', visual: visual(k, dull(0.45, 0.4, 0.33)) }, legs: { defId: 'trousers', visual: visual(k + 1, dull(0.16, 0.14, 0.12)) },
      back: { defId: 'jerkin', visual: visual(k + 2) }, feet: { defId: 'boots', visual: visual(k + 3) }, ...held,
    };
  }
  return { chest: { defId: 'shroud', visual: visual(k, dull(0.38, 0.37, 0.32)) }, ...held };
}

export class CreatureView {
  readonly group = new Group();
  private readonly shown: Shown[] = [];
  private time = 0;
  private readonly input: { -readonly [K in keyof RigInput]: RigInput[K] } = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, dead: false, action: '', actionT: 0, lookAt: null, running: false, pose: '', time: 0, scale: 1 };

  private constructor(readonly den: Den, origin: { x: number; y: number; z: number }) {
    this.group.name = 'creatures';
    this.group.position.set(origin.x, origin.y, origin.z);
  }

  static async build(den: Den, seed: number, origin: { x: number; y: number; z: number }): Promise<CreatureView> {
    const v = new CreatureView(den, origin);
    setHumanAssetBase(ASSETS);
    const models = new Map<string, CritterModel>();
    const ground = (_x: number, _z: number) => 0;
    for (const c of den.creatures) {
      const b = c.def.body;
      let body: Body;
      if (b.kind === 'humanoid') {
        const rng = new Rng(deriveSeed(seed, 'creature look', c.id));
        const app = randomAppearance(b.race as RaceId, rng.int(0, 1e9), { gender: rng.chance(0.75) ? 1 : 0 });
        const h = await Humanoid.create(app, {
          wardrobe: TRAVELLER, castShadow: true,
          ...(b.bones ? { bones: { tint: b.skin ? hexToRgb(parseInt(b.skin.slice(1), 16)) : undefined, eyes: [0.3, 0.8, 1] as [number, number, number] } } : {}),
        });
        h.dress(outfitOf(c.def, c.id * 7 + 101, rng));
        h.object.name = c.def.name;
        body = { kind: 'humanoid', body: h, scale: b.height / h.height };
        h.object.scale.setScalar(body.scale);
        v.group.add(h.object);
      } else {
        let m = models.get(c.def.id);
        if (!m) { m = new CritterModel(speciesFor(c.def, seed), critterMaterials()); models.set(c.def.id, m); }
        const fig = m.figure(ground);
        // Its length without the tail, as the setting gives it.
        const scale = b.length / Math.max(0.05, m.species.totalLength * (b.kind === 'rat' ? 0.6 : 1));
        fig.root.name = c.def.name;
        v.group.add(fig.root);
        body = { kind: 'critter', fig, scale };
      }
      v.shown.push({ c, body, px: c.x, pz: c.z, blowAt: -9, health: c.health, hurtAt: -9, act: c.act, variant: c.id });
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
      if (s.body.kind === 'critter') {
        const i = this.input;
        i.x = c.x; i.y = c.y; i.z = c.z; i.yaw = yaw; i.vx = vx; i.vz = vz; i.dead = dead; i.time = t; i.scale = s.body.scale;
        i.running = c.act === 'run' || c.state === 'fight' || c.state === 'flee';
        i.pose = c.act === 'gnaw' || c.act === 'sniff' || c.act === 'rummage' || c.act === 'spin' ? 'feed' : '';
        i.lookAt = watching;
        if (blowT < 1 && !dead) { i.action = c.def.body.kind === 'spider' ? 'lunge' : 'bite'; i.actionT = blowT; }
        else if (c.state === 'alert' && c.def.body.kind === 'rat') { i.action = 'rear'; i.actionT = 0.5; }
        else if (hurtT < 1 && !dead) { i.action = 'flinch'; i.actionT = hurtT; }
        else { i.action = ''; i.actionT = 0; }
        s.body.fig.animate(i, dt, hurtT < 1 ? 1 - hurtT : 0);
      } else {
        const speed = Math.hypot(vx, vz);
        const move: MoveState = dead ? 'dead' : speed > 2.6 ? 'run' : speed > 0.2 ? 'walk' : c.act === 'rummage' || c.act === 'gnaw' ? 'crouch' : 'idle';
        let action: ActionAnim | undefined;
        const held = c.def.body.kind === 'humanoid' ? c.def.body.held : undefined;
        if (!dead && blowT < 1) action = { id: held === 'knife' ? 'stab' : held ? 'swing_1h' : 'slam', t0: s.blowAt, dur: BLOW };
        else if (!dead && hurtT < 1) action = { id: 'flinch', t0: s.hurtAt, dur: FLINCH * 1.5 };
        else if (c.act === 'beg') action = { id: 'cower', t0: t - 0.5, dur: 9 };
        const fighting = c.state === 'fight' || c.state === 'alert';
        const mood = c.state === 'beg' || c.state === 'flee' || c.state === 'meek' ? 'afraid' : fighting ? 'angry' : 'neutral';
        s.body.body.update({
          pos: [c.x, c.y, c.z], vel: [vx, 0, vz], yaw, combat: fighting,
          anim: { move, action, mood, lookAt: watching ? [watching[0], watching[1], watching[2]] : undefined },
        }, dt, t, null);
        s.body.body.object.scale.setScalar(s.body.scale);
      }
    }
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
