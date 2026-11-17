/**
 * The wild around the town in the game (plan 9.3, D27): the setting's groups placed on the land
 * (sim/wild.ts), each a den on open ground with its bodies and its encounter (app/encounter.ts). A group
 * is built once the hero comes within a few hundred metres (its bodies warm in the Stage's frame slots and
 * show once warm), lives while the hero is near and rests (unstepped, at home) when they are far. Who of
 * them died, was spared or searched goes into the save by territory id. Bands a story event put on the land
 * (vgm/events.ts, C6) are groups too: a lead of their own, which the game hears of once they are beaten.
 */
import { leadOf } from '../sim/factions';
import type { PerspectiveCamera, WebGPURenderer } from 'three/webgpu';
import { deriveSeed } from '@futuremagic/core';
import type { Stage } from '@futuremagic/stage';
import type { Character } from '../game/character';
import type { Standing } from '../game/standing';
import { Delve, type DelveSave } from '../game/delve';
import { CreatureView } from '../render/dungeon/CreatureView';
import type { SettingModule } from '../setting/contract';
import { Den } from '../sim/creatures';
import { OpenGround, awake, bedOf, dangerOfAll, extraOf, groupDanger, type Land, type Territory } from '../sim/wild';
import { POST_GATHER, POST_R, RETURN_SEEN, campTerritory, died, postDef, returned, returnsDue, type CampSave, type CampsSave } from '../sim/camps';
import type { CampDecision } from '../world/decisions';
import type { Journal } from '../talk/journal';
import type { Director } from '../vgm/director';
import type { WildGroup } from '../vgm/events';
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
  /** What the factions make of the hero (D65): the foes read it before they fight. */
  readonly standing: Standing;
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
/** A camp is built this near (m): there are many of them (D69, Z5), and its landmark shows from far before its foes do. */
const CAMP_BUILD = 320;
/** Past this a camp's bodies are taken off the stage (what happened there is kept): the land holds dozens of camps a zone. */
const CAMP_DROP = 900;

interface Group {
  readonly territory: Territory;
  /** A fixed camp's decision (D69, Z2): its dead come back. */
  readonly camp?: CampDecision;
  /** The ground its den walks on, once built (what the hero sees of it). */
  ground?: OpenGround;
  awake: boolean;
  /** How much farther off than the usual it is built and awake (extraOf), once known. */
  extra?: number;
  built: Promise<void> | null;
  /** Once its bodies are warm. */
  encounter: Encounter | null;
  delve: Delve | null;
  /** Its bodies as drawn (a camp's are taken off the stage once the hero is far off). */
  view?: CreatureView;
}

export class WildLand {
  readonly territories: Territory[];
  private readonly groups: Group[];
  /** The bands of story events (their territory ids are the events' ids, each a promise). */
  private readonly events = new Set<string>();

  private readonly town: string;
  /** Seconds of play (the camps' respawn clock, kept in the save), each camp's dead, and when the returns were last looked at. */
  private clock: number;
  private readonly campState = new Map<string, CampSave>();
  private looked = 0;
  /** What happened at camps taken off the stage since loading (who fell, what was searched), by territory id. */
  private readonly kept = new Map<string, DelveSave>();

  /** `wild`: the town's wild groups (vgm/wild.ts, from the log); `bands`: the open story events' bands (vgm/events.ts openBands). */
  constructor(private readonly host: WildHost, town: Town, private readonly land: Land, private readonly saved: Readonly<Record<string, DelveSave>> = {}, wild: readonly Territory[] = [], bands: readonly Territory[] = [], camps?: CampsSave) {
    this.town = town.decision.id;
    this.clock = camps?.clock ?? 0;
    for (const [id, c] of Object.entries(camps?.camps ?? {})) this.campState.set(id, c);
    this.territories = [...wild];
    this.groups = this.territories.map((territory) => ({ territory, awake: false, built: null, encounter: null, delve: null }));
    for (const b of bands) this.add(b);
  }

  /** A band a story event put on the land (built as the hero comes near, like the others). */
  add(t: Territory): void {
    if (this.events.has(t.id)) return;
    this.events.add(t.id);
    this.territories.push(t);
    this.groups.push({ territory: t, awake: false, built: null, encounter: null, delve: null });
  }

  /**
   * A fixed camp (D69, Z2), built as the hero comes near like the wild's groups; its posts' kinds as they stand now. Its dead come back at
   * their posts (`tick`).
   */
  addCamp(d: CampDecision): void {
    if (this.groups.some((g) => g.territory.id === d.id)) return;
    const h = this.host, rules = h.setting.camps, def = rules?.camps.find((c) => c.id === d.camp);
    if (!rules || !def) return;
    const territory = campTerritory(d, def, rules, h.setting.creatures, h.setting.growth, this.campState.get(d.id));
    this.territories.push(territory);
    this.groups.push({ territory, camp: d, awake: false, built: null, encounter: null, delve: null });
  }

  /** The camps' state for the save (D69, Z2): the play clock and who of each camp is dead since when. */
  campsSave(): CampsSave {
    return { clock: this.clock, camps: Object.fromEntries(this.campState) };
  }

  /**
   * Every frame (`dt` of play), the hero at `q`: the camps' clock runs, the fallen of a built camp are noted, and those whose time has come
   * come back (looked at once a second): the dead rise where they fell, the living walk in from the edge of their ground where the hero
   * does not see (sim/camps.ts returnsDue; rule 11).
   */
  keepCamps(dt: number, q: { readonly x: number; readonly y: number; readonly z: number }): void {
    this.clock += dt;
    if (this.clock - this.looked < 1) return;
    this.looked = this.clock;
    const h = this.host, rules = h.setting.camps;
    if (!rules) return;
    for (const g of this.groups) {
      const d = g.camp, den = g.delve?.den, ground = g.ground;
      if (!d || !den || !ground) continue;
      const def = rules.camps.find((c) => c.id === d.camp)!;
      let s = this.campState.get(d.id) ?? { dead: {}, rounds: {} };
      for (const c of den.creatures) if (c.state === 'dead' && !(c.id in s.dead)) s = died(s, c.id, this.clock);
      const seen = (x: number, z: number): boolean => Math.hypot(x - q.x, z - q.z) <= RETURN_SEEN && ground.sees(q.x, q.y, q.z, x, ground.floorAt(x, z), z, 1.6);
      const body = (post: number) => { const c = den.creatures[post]; return c?.state === 'dead' ? { x: c.x, z: c.z } : null; };
      for (const r of returnsDue(d, def, rules, s, this.clock, seen, body)) {
        const next = returned(s, r.post);
        const back = den.revive(r.post, postDef(d, def, rules, h.setting.creatures, h.setting.growth, r.post, next.rounds[r.post] ?? 0), r.from, def.arrive);
        if (!back) continue;
        g.delve!.revived(r.post);
        s = next;
      }
      this.campState.set(d.id, s);
    }
  }

  /** An event's band moves on (its event ran its course unseen, vgm/events.ts fadedFor): it is gone from the land. */
  moveOn(id: string): void {
    const i = this.groups.findIndex((x) => x.territory.id === id);
    if (i < 0) return;
    const [g] = this.groups.splice(i, 1);
    g.awake = false;
    this.territories.splice(this.territories.indexOf(g.territory), 1);
  }

  /** Every frame, where the hero is: groups coming near are built, near ones wake, far ones rest. */
  near(x: number, z: number): void {
    const light = this.host.light();
    for (const g of this.groups) {
      const d = this.away(g, x, z);
      if (!g.built && d < (g.camp ? CAMP_BUILD : BUILD)) g.built = this.raise(g);
      g.awake = awake(g.awake, d);
      if (g.camp && g.encounter && !g.awake && d > CAMP_DROP) this.drop(g);
      if (g.delve) g.delve.fight.light = light;
    }
  }

  /** A camp far behind: what happened there is kept, its encounter retired and its bodies taken off the stage; it is raised again as the hero comes back. */
  private drop(g: Group): void {
    this.kept.set(g.territory.id, g.delve!.tally());
    g.encounter!.retired = true;
    g.view?.retire();
    g.encounter = null;
    g.delve = null;
    g.view = undefined;
    g.ground = undefined;
    g.built = null;
  }

  /** How far the hero at (x, z) is from a group's territory edge, less how much farther than the usual it is built and awake (a giant's, sim/wild.ts extraOf). */
  private away(g: Group, x: number, z: number): number {
    const t = g.territory;
    return Math.hypot(x - t.x, z - t.z) - t.r - (g.extra ??= extraOf(t.members, this.host.setting.creatures));
  }

  /** Is the band of event `id` beaten or driven off (its bodies are all dead or beaten, or it is gone)? A band not built yet is not. */
  bandBeaten(id: string): boolean {
    const g = this.groups.find((x) => x.territory.id === id);
    return !g ? this.events.has(id) : !!g.delve?.den.beaten;
  }

  /** The wild's own groups (not the events' bands) and how many of each still live (raiders come from these). */
  groupsLeft(): WildGroup[] {
    return this.groups.filter((g) => !this.events.has(g.territory.id) && !g.camp).map((g) => {
      const dead = g.delve ? g.delve.den.dead : this.saved[g.territory.id]?.dead ?? [];
      return { town: this.town, territory: g.territory, left: g.territory.members.length - dead.length };
    });
  }

  /** The encounters standing (app/encounter.ts plays those the hero is near). */
  get encounters(): Encounter[] {
    const out: Encounter[] = [];
    for (const g of this.groups) if (g.encounter) out.push(g.encounter);
    return out;
  }

  /** What each group's meetings changed, by territory id (groups not built since loading keep the save's). */
  diffs(): Record<string, DelveSave> {
    const out: Record<string, DelveSave> = { ...this.saved, ...Object.fromEntries(this.kept) };
    for (const g of this.groups) if (g.delve) out[g.territory.id] = g.delve.tally();
    return out;
  }

  /** A living member of the first built group of a kind, where it is now (for `wild=<kind>`: look at them). */
  sight(kind: string): { x: number; y: number; z: number } | null {
    const g = this.groups.find((g) => g.territory.kind === kind && g.delve);
    const c = g?.delve?.den.creatures.find((c) => c.state !== 'dead');
    return c ? { x: c.x, y: c.y, z: c.z } : null;
  }

  /** Groups near enough to be shown (awake) whose bodies are not drawn yet (a group built farther off is not in any picture). */
  get warming(): number { return this.groups.filter((g) => g.awake && g.built && !g.encounter).length; }

  /** The HUD's line: groups built and awake. */
  get hudText(): string {
    const up = this.groups.filter((g) => g.encounter), on = up.filter((g) => g.awake);
    return `wild ${on.map((g) => g.territory.id).join(' ') || '-'} (${up.length}/${this.groups.length} built)`;
  }

  private async raise(g: Group): Promise<void> {
    const h = this.host, t = g.territory, saved = this.kept.get(t.id) ?? this.saved[t.id];
    // Out at sea (S9) its swimmers come to the depth of a hero who swims.
    const w = h.player.walker, prey = () => (w.mode === 'swim' && !h.player.offFoot ? w.pos.y : null);
    const posts = t.posts, bed = bedOf(t.members, h.setting.creatures);
    // A camp's bodies each keep to their post (a patrol to its round); a wild group roams its territory together.
    const ground = posts ? new OpenGround(this.land, posts.map((p) => ({ x: p.x, z: p.z, r: POST_R })), prey, bed, POST_GATHER, posts.map((p) => p.round)) : new OpenGround(this.land, [t], prey, bed);
    g.ground = ground;
    // A camp's dead whose time came while nobody was near are back at their posts (unseen: the hero was far off).
    const camp = g.camp, rules = h.setting.camps, cdef = camp && rules?.camps.find((c) => c.id === camp.camp);
    let dead = saved?.dead ?? [];
    if (camp && rules && cdef) {
      let s = this.campState.get(camp.id) ?? { dead: {}, rounds: {} };
      for (const id of dead) if (!(id in s.dead)) s = died(s, id, this.clock);
      for (const r of returnsDue(camp, cdef, rules, s, this.clock, () => false, () => null)) s = returned(s, r.post);
      this.campState.set(camp.id, s);
      dead = dead.filter((id) => id in s.dead);
    }
    const spawns = posts ? t.members.map((creature, i) => ({ creature, room: i, def: camp && rules && cdef ? postDef(camp, cdef, rules, h.setting.creatures, h.setting.growth, i, this.campState.get(camp.id)?.rounds[i] ?? 0) : posts[i].def })) : t.members.map((creature) => ({ creature, room: 0 }));
    const den = new Den(ground, spawns, h.setting.creatures, deriveSeed(t.seed, 'den'), dead);
    const delve = new Delve(null, den, h.setting, h.character, h.seed, saved ? { ...saved, dead, searched: saved.searched.filter((i) => dead.includes(i)) } : saved);
    delve.fight.standing = h.standing;
    const creatures = await CreatureView.build(den, deriveSeed(h.seed, 'wild'), { x: 0, y: 0, z: 0 }, h.renderer);
    creatures.group.visible = false;
    await creatures.warm(h.stage);
    h.stage.add(creatures.group);
    const def = leadOf(h.setting, t.members);
    const arena: Arena = {
      get inside() { return g.awake && h.out(); },
      get shown() { return g.awake; },
      enclosed: false,
      id: t.id,
      place: cdef ? `${cdef.name}` : `the ${def?.plural ?? 'creatures'} about here`,
      danger: posts ? dangerOfAll(den.creatures.map((c) => c.def.danger)) : groupDanger(t.members, h.setting.creatures),
      // An event's band is a lead: once it is beaten and the hero moves on, the game takes it in. A foray the town fights off itself is none.
      promise: this.events.has(t.id) && h.setting.events?.find((x) => x.id === t.kind)?.kind !== 'foray' ? t.id : null,
      quietLine: null,
    };
    const e = new Encounter(arena, delve, creatures, h.hud, h.player, h.notes, h.director, h.setting, h.camera, h.canvas, h.fight);
    e.onCue = (c) => h.cue(c);
    g.delve = delve;
    g.encounter = e;
    g.view = creatures;
  }
}
