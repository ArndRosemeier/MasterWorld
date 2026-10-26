/**
 * The wild around the town in the game (plan 9.3, D27): the setting's groups placed on the land
 * (sim/wild.ts), each a den on open ground with its bodies and its encounter (app/encounter.ts). A group
 * is built once the hero comes within a few hundred metres (its bodies warm in the Stage's frame slots and
 * show once warm), lives while the hero is near and rests (unstepped, at home) when they are far. Who of
 * them died, was spared or searched goes into the save by territory id.
 */
import type { PerspectiveCamera, WebGPURenderer } from 'three/webgpu';
import { deriveSeed } from '@futuremagic/core';
import type { Stage } from '@futuremagic/stage';
import type { Character } from '../game/character';
import { Delve, type DelveSave } from '../game/delve';
import { CreatureView } from '../render/dungeon/CreatureView';
import type { SettingModule } from '../setting/contract';
import { Den } from '../sim/creatures';
import { OpenGround, awake, groupDanger, placeWild, type Land, type Territory } from '../sim/wild';
import type { Journal } from '../talk/journal';
import type { Director } from '../vgm/director';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';
import { Encounter, type Arena, type FightCue, type FightHost } from './encounter';
import type { FightHud } from './fightHud';
import type { Notes } from './notes';
import type { Player } from './player';

export interface WildHost {
  readonly stage: Stage;
  readonly renderer: WebGPURenderer;
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLElement;
  readonly player: Player;
  readonly notes: Notes;
  readonly setting: SettingModule;
  readonly character: Character;
  readonly seed: number;
  readonly director: Director;
  readonly journal: Journal;
  readonly hud: FightHud;
  readonly fight: FightHost;
  cue(c: FightCue): void;
  /** The hero walks or rides the land (not below, not behind a door, not flying). */
  out(): boolean;
  /** How far off the hero is seen out of doors now, metres (far by day, near by night). */
  light(): number;
}

/** A group is built (its bodies made and warmed) once the hero is this near its territory, metres. */
const BUILD = 420;

interface Group {
  readonly territory: Territory;
  awake: boolean;
  built: Promise<void> | null;
  /** Once its bodies are warm. */
  encounter: Encounter | null;
  delve: Delve | null;
}

export class WildLand {
  readonly territories: readonly Territory[];
  private readonly groups: Group[];

  constructor(private readonly host: WildHost, terrain: Terrain, town: Town, private readonly land: Land, private readonly saved: Readonly<Record<string, DelveSave>> = {}) {
    this.territories = placeWild(host.seed, terrain, town, host.setting.wild ?? []);
    this.groups = this.territories.map((territory) => ({ territory, awake: false, built: null, encounter: null, delve: null }));
  }

  /** Every frame, where the hero is: groups coming near are built, near ones wake, far ones rest. */
  near(x: number, z: number): void {
    const light = this.host.light();
    for (const g of this.groups) {
      const t = g.territory, d = Math.hypot(x - t.x, z - t.z) - t.r;
      if (!g.built && d < BUILD) g.built = this.build(g);
      g.awake = awake(g.awake, d);
      if (g.delve) g.delve.fight.light = light;
    }
  }

  /** The encounters standing (app/encounter.ts plays those the hero is near). */
  get encounters(): Encounter[] {
    const out: Encounter[] = [];
    for (const g of this.groups) if (g.encounter) out.push(g.encounter);
    return out;
  }

  /** What each group's meetings changed, by territory id (groups not built since loading keep the save's). */
  diffs(): Record<string, DelveSave> {
    const out: Record<string, DelveSave> = { ...this.saved };
    for (const g of this.groups) if (g.delve) out[g.territory.id] = g.delve.tally();
    return out;
  }

  /** A living member of the first built group of a kind, where it is now (for `wild=<kind>`: look at them). */
  sight(kind: string): { x: number; y: number; z: number } | null {
    const g = this.groups.find((g) => g.territory.def.id === kind && g.delve);
    const c = g?.delve?.den.creatures.find((c) => c.state !== 'dead');
    return c ? { x: c.x, y: c.y, z: c.z } : null;
  }

  /** Groups being built near the hero whose bodies are not drawn yet. */
  get warming(): number { return this.groups.filter((g) => g.built && !g.encounter).length; }

  /** The HUD's line: groups built and awake. */
  get hudText(): string {
    const up = this.groups.filter((g) => g.encounter), on = up.filter((g) => g.awake);
    return `wild ${on.map((g) => g.territory.id).join(' ') || '-'} (${up.length}/${this.groups.length} built)`;
  }

  private async build(g: Group): Promise<void> {
    const h = this.host, t = g.territory, saved = this.saved[t.id];
    const den = new Den(new OpenGround(this.land, [t]), t.members.map((creature) => ({ creature, room: 0 })), h.setting.creatures, deriveSeed(t.seed, 'den'), saved?.dead ?? []);
    const delve = new Delve(null, den, h.setting, h.character, h.seed, saved);
    const creatures = await CreatureView.build(den, deriveSeed(h.seed, 'wild'), { x: 0, y: 0, z: 0 }, h.renderer);
    creatures.group.visible = false;
    await creatures.warm(h.stage);
    h.stage.add(creatures.group);
    const def = h.setting.creatures.find((c) => c.id === t.members[0]);
    const arena: Arena = {
      get inside() { return g.awake && h.out(); },
      get shown() { return g.awake; },
      enclosed: false,
      place: `the ${def?.plural ?? 'creatures'} about here`,
      danger: groupDanger(t.members, h.setting.creatures),
      promise: null,
      quietLine: null,
      thanks: (coins) => `You are paid ${coins}.`,
    };
    const e = new Encounter(arena, delve, creatures, h.hud, h.player, h.notes, h.director, h.setting, h.journal, h.camera, h.canvas, h.fight);
    e.onCue = (c) => h.cue(c);
    g.delve = delve;
    g.encounter = e;
  }
}
