/**
 * A people's hold in the game (plan 11.6, D34): its gate and court stand on the land from the start (the
 * town's building shader: nothing new to compile), and its wardens are built once the hero comes within a
 * few hundred metres, like a band of the wild (app/wildLand.ts). Each frame the watch (game/hold.ts) says
 * what the wardens make of the hero: a hail for someone welcome, warnings and then a fight for anyone else.
 * The lines and the changes of standing go to the notes; who of the wardens fell goes into the save.
 */
import type { Mesh } from 'three/webgpu';
import { deriveSeed } from '@futuremagic/core';
import { Delve, type DelveSave } from '../game/delve';
import { HOLD_WARN, HoldWatch, holdDen } from '../game/hold';
import type { Standing, StandingChange } from '../game/standing';
import { buildingMeshAt } from '../render/materials/building';
import { CreatureView } from '../render/dungeon/CreatureView';
import type { PeopleDef } from '../setting/contract';
import { awake, groupDanger, type Land } from '../sim/wild';
import type { HoldDecision } from '../world/decisions';
import { inHoldShape } from '../world/hold';
import { inFrame } from '../world/dungeon/site';
import { holdMesh } from '../world/holdMesh';
import { Encounter, type Arena } from './encounter';
import type { WildHost } from './wildLand';

/** What the hold asks of the game: what a band of the wild does (but the light: the wardens watch by day and night alike), and standing. */
export interface HoldHost extends Omit<WildHost, 'light'> {
  readonly standing: Standing;
  /** Standing with a people changed. */
  changed(c: StandingChange): void;
}

/** The wardens are built once the hero is this near the gate, metres. */
const BUILD = 420;

export class HoldGate {
  readonly mesh: Mesh;
  private built: Promise<void> | null = null;
  private awake = false;
  private watch: HoldWatch | null = null;
  private encounter: Encounter | null = null;
  private delve: Delve | null = null;

  constructor(private readonly host: HoldHost, readonly site: HoldDecision, readonly people: PeopleDef, private readonly land: Land, private readonly saved?: DelveSave) {
    this.mesh = buildingMeshAt(holdMesh(deriveSeed(host.seed, 'hold', site.id)), site.x, site.level, site.z, 'hold', site.yaw);
    void host.stage.add(this.mesh);
  }

  /** How far the hero at (x, z) is from the court (0 in it). */
  private off(x: number, z: number): number {
    return this.watch?.offCourt(x, z) ?? Math.max(0, Math.hypot(x - this.site.x, z - this.site.z) - 20);
  }

  /** Every frame, after the fights have stepped: the wardens built as the hero comes, and what they make of them. */
  tend(dt: number, x: number, z: number): void {
    const off = this.off(x, z);
    if (!this.built && off < BUILD) this.built = this.build();
    this.awake = awake(this.awake, off);
    const w = this.watch;
    if (!w || !this.awake || !this.host.out()) return;
    const h = this.host;
    for (const e of w.judge(dt, { x, z, alive: h.character.alive })) {
      if (e.kind === 'standing') h.changed(e.change);
      else h.notes.say(e.text, e.kind === 'hail' ? 6 : 7);
    }
    // Come to the gate: the lead that pointed here is done.
    if (off < HOLD_WARN && h.journal.open.some((l) => l.id === this.site.id)) h.journal.fulfil(this.site.id);
  }

  /** Is a body of radius `r` at (x, z) in the gate's stone or the court's walls? */
  solid(x: number, z: number, r: number): boolean {
    if (Math.abs(x - this.site.x) > 40 || Math.abs(z - this.site.z) > 40) return false;
    const [u, v] = inFrame(this.site, x, z);
    return inHoldShape(u, v, r);
  }

  /** The wardens' encounter once they stand (app/encounter.ts plays it while the hero is near). */
  get encounters(): Encounter[] { return this.encounter ? [this.encounter] : []; }

  /** Who of the wardens fell, was searched (none until they were built: the save's). */
  diff(): DelveSave | undefined { return this.delve?.tally() ?? this.saved; }

  /** Their bodies not drawn yet, though the hero is near (for screenshots). */
  get warming(): boolean { return this.awake && !!this.built && !this.encounter; }

  private async build(): Promise<void> {
    const h = this.host, hold = this.people.hold!;
    const den = holdDen(this.site, hold, this.land, h.setting.creatures, h.seed, this.saved?.dead ?? []);
    const delve = new Delve(null, den, h.setting, h.character, h.seed, this.saved);
    const creatures = await CreatureView.build(den, h.seed, { x: 0, y: 0, z: 0 }, h.renderer);
    creatures.group.visible = false;
    await creatures.warm(h.stage);
    h.stage.add(creatures.group);
    const watch = new HoldWatch(this.site, hold, den, h.standing, h.setting.standing);
    const danger = groupDanger(den.creatures.map((c) => c.def.id), h.setting.creatures);
    const self = this;
    const arena: Arena = {
      get inside() { return self.awake && h.out(); },
      get shown() { return self.awake; },
      enclosed: false,
      place: hold.name,
      // At peace the wardens are no danger to warn of; they warn for themselves.
      get danger() { return watch.atWar ? danger : 0; },
      promise: null,
      quietLine: null,
    };
    const e = new Encounter(arena, delve, creatures, h.hud, h.player, h.notes, h.director, h.setting, h.camera, h.canvas, h.fight);
    e.onCue = (c) => h.cue(c);
    this.delve = delve;
    this.watch = watch;
    this.encounter = e;
  }
}
