/**
 * A fight where the hero is (plan 11.2, D13): down in a cellar, or out on the land with a band of the
 * wild (sim/wild.ts); its `Arena` says which. Each frame the hero's pose goes to the delve, its events
 * become notes, the HUD's moments and the hero's blows; Tab and a click pick a target, the action bar's
 * keys use abilities; G searches the fallen and opens chests (the hero kneels to it, a chest's lid lifts). The Director (vgm/director.ts) watches it
 * all, warns at the door of a place too hard, and its messages come one at a time. Falling ends as the
 * game's mode says (game/death.ts): waking at the inn without the pack, or the hero's end. A place gone
 * quiet that was promised is reported to the game once the hero leaves it: its household waits to be told
 * (the talk's report topic), and pays then. Only one encounter plays at a time
 * (`stepEncounters`); the others rest.
 */
import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { SettingModule } from '../setting/contract';
import { keepApart, type Creature, type Den } from '../sim/creatures';
import type { Delve, Lootable } from '../game/delve';
import type { Fight, FightEvent, HeroPose } from '../game/fight';
import { POTION } from '../game/actionBar';
import type { Character } from '../game/character';
import type { RecipeEvent, Recipes } from '../game/recipe';
import type { SpellFrame } from './spellView';
import { defOf, type Item, type Loot } from '../game/items';
import type { Bindings } from '../input/controls';
import { onClick, onKeyDown } from '../input/keys';
import type { CreatureView } from '../render/dungeon/CreatureView';
import { joltOf } from '../render/jolt';
import { warning, type Director } from '../vgm/director';
import { cap } from '../talk/townTalk';
import { fill } from '../talk/folk';
import type { FightHud } from './fightHud';
import { OVER_HEAD } from './speech';
import type { Notes } from './notes';
import type { Player } from './player';
import { SearchKneel } from './searchKneel';

export interface FightHost {
  readonly bindings: Bindings;
  /** A dialog is open (keys are the dialog's). */
  readonly blocked: boolean;
  /**
   * Fallen and the wards gone dark (game/death.ts): in classic mode the hero is carried off, wakes and this
   * is the waking line; in roguelike mode the hero's tale ends (null) and they stay down.
   */
  wake(): string | null;
  /** Hold the hero still (fallen) or let go. */
  still(on: boolean): void;
  /** What the hero holds changed. */
  armed(): void;
  /**
   * The place of a promise is quiet and the hero has left it (its id: the dungeon's, or the move-in's):
   * its household can be told. True once the game has taken it in (it is not said again).
   */
  quiet(id: string): boolean;
  /**
   * The place of a promise has just gone quiet with the hero in it: whoever waits to hear of it may come to the hero
   * (a cellar's household down its ladder, app/ownerComes.ts). True if someone comes (then no line says it is quiet).
   */
  stilled(id: string): boolean;
  /** The place of a promise ended without what it asked (D62: a parley the hero broke): nobody pays. True once taken in. */
  failed(id: string): boolean;
  /** Someone down there speaks (a parley's leader): a bubble over them while `at` gives where (null: gone). */
  say(text: string, at: () => { x: number; y: number; z: number } | null): void;
}

/** Where an encounter is: a cellar, a band's ground. */
export interface Arena {
  /** The hero is in it (down in the cellar; out near the band). */
  readonly inside: boolean;
  /** Its creatures are drawn (a cellar's while the hero is down; a band's while it is awake). */
  readonly shown: boolean;
  /** Walls all round (a cellar): the fight's HUD stays up while the hero is in it; out on the land only while it matters. */
  readonly enclosed: boolean;
  /** As the Director's warning names it ('this cellar'). */
  readonly place: string;
  /** Its danger (D29: from who lives there). */
  readonly danger: number;
  /** The promise whose household waits to hear once it is quiet and the hero has left (null: none). */
  readonly promise: string | null;
  /** The Director's line when it goes quiet (null: none). */
  readonly quietLine: string | null;
}


/**
 * What happened in the cellar, for sound and music (each fight event, plus the moments around the fight):
 * `who` carries the creature (its def, and x/y/z in the world) for placing a sound.
 */
export type FightCue =
  | FightEvent
  | { readonly kind: 'down' | 'up' }
  | { readonly kind: 'battle'; readonly on: boolean }
  | { readonly kind: 'quiet' }
  | { readonly kind: 'found'; readonly loot: Loot }
  | { readonly kind: 'woke' }
  | { readonly kind: 'paid'; readonly coins: number };

/** Walling up a breach (D62): seconds the stones take, and where the hero kneels before it (m out from it). */
const SEAL_BUSY = 7, SEAL_FRONT = 0.75;
/** What G does to what is near, as the HUD offers it. */
const PROMPT: Record<Lootable['kind'], string> = { body: 'Search', hoard: 'Search', breach: 'Wall up', chief: 'Speak with' };

export class Encounter {
  /** Hears every cue (the game's sound sets it); nothing listens by default. */
  onCue: (cue: FightCue) => void = () => {};
  /** A chest's lid lifted by k (0 shut, 1 open): its view sets it (a cellar's); nothing by default. */
  onLid: (hoard: number, k: number) => void = () => {};
  /** A seal's breach walled up so far (D62; 0..1), as the hero sets the stones. */
  onSeal: (k: number) => void = () => {};
  /** The hero kneeling to search (null: not searching). */
  private kneel: SearchKneel | null = null;
  private wasInside = false;
  private warned = false;
  private quietSaid = false;
  private metSaid = false;
  /** The promise was kept and paid (its household was told). */
  paid: boolean;
  /** The game took in that it is quiet. */
  private reported = false;
  /** Its dwellers were replaced by new ones (a move-in): it no longer plays. */
  retired = false;
  private down = 0;
  private fallenFor = -1;
  private wasFighting = 0;
  private near: Lootable | null = null;
  private readonly ray = new Vector3();
  /** What the hero's spells did since they were last drawn. */
  private readonly spellCues: RecipeEvent[] = [];

  constructor(
    readonly arena: Arena,
    readonly delve: Delve,
    private readonly creatures: CreatureView,
    private readonly hud: FightHud,
    private readonly player: Player,
    private readonly notes: Notes,
    private readonly director: Director,
    private readonly setting: SettingModule,
    private readonly camera: PerspectiveCamera,
    canvas: HTMLElement,
    private readonly host: FightHost,
    paid = false,
  ) {
    this.paid = paid;
    this.creatures.group.visible = false;
    onKeyDown((e) => this.keyDown(e));
    // A click (not a drag of the camera) picks what is under the pointer.
    onClick(canvas, (x, y) => { if (this.active) this.click(x, y, canvas); });
  }

  /** It played last frame (it owns the keys, the HUD and the hero's stance). */
  private active = false;

  private get fight() { return this.delve.fight; }
  private get hero() { return this.delve.hero; }

  /** The hero's pose in the creatures' frame. */
  private heroPose(): HeroPose {
    const w = this.player.walker, O = this.creatures.group.position;
    return { x: w.pos.x - O.x, y: w.pos.y - O.y, z: w.pos.z - O.z, yaw: w.yaw, speed: w.groundSpeed };
  }

  private keyDown(e: KeyboardEvent): void {
    if (!this.active || this.host.blocked || e.repeat || !this.hero.alive) return;
    const b = this.host.bindings, is = (a: keyof Bindings) => b[a].includes(e.code);
    let said: string | null = null;
    if (is('target')) { e.preventDefault(); if (!this.fight.tab(this.heroPose())) said = 'Nothing in sight to fight.'; }
    else if (is('search')) said = this.search();
    else return;
    if (said) this.notes.say(said, 2.5);
  }

  /** Its spells for drawing (app/spellView.ts): the runner, the den's frame, the hero in it, what happened. */
  spellFrame(): SpellFrame {
    const O = this.creatures.group.position, me = this.heroPose();
    return { recipes: this.fight.recipes, offset: { x: O.x, y: O.y, z: O.z }, me, yaw: me.yaw, cues: this.spellCues.splice(0) };
  }

  /**
   * Does a walker of radius `r` at (x, z) in the world, feet at `y`, press into one of its living bodies (those
   * shown)? One it already touches where it stands, (ax, az), lets it go.
   */
  pressedBy(x: number, z: number, r: number, y: number, ax: number, az: number): boolean {
    if (this.retired || !this.arena.shown) return false;
    const O = this.creatures.group.position;
    return this.delve.den.pressedBy(x - O.x, y - O.y, z - O.z, r, ax - O.x, az - O.z);
  }

  /** It owns the keys and the HUD now (the one playing). */
  get leading(): boolean { return this.active; }

  /** The fight, for the action bar's cooldowns. */
  get fighting(): Fight { return this.fight; }

  /** An ability from the action bar (or the potion's quick slot): a line why not if it cannot be used now. */
  use(id: string): string | null {
    if (!this.hero.alive) return null;
    return id === POTION ? this.fight.drink() : this.fight.use(id);
  }

  private click(x: number, y: number, canvas: HTMLElement): void {
    const r = canvas.getBoundingClientRect();
    this.ray.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const c = this.creatures.under(this.camera.position, this.ray);
    if (c) this.fight.pick(c);
  }

  /** The hero steps up to what is near, kneels to it (a chest's lid lifts), and what was there comes once the hands are in. */
  private search(): string | null {
    const l = this.near, p = this.player;
    if (!l || this.kneel || p.puppet) return null;
    const O = this.creatures.group.position, w = p.walker;
    // A seal's breach (D62): kneeling before it, the stones go in course by course until it is walled up.
    if (l.kind === 'breach') {
      const b = this.delve.breach!, f = [-Math.sin(b.yaw), -Math.cos(b.yaw)];
      this.kneel = new SearchKneel(w.pos, w.yaw, { x: O.x + l.x, z: O.z + l.z }, null, () => { this.delve.seal(); this.onSeal(1); }, { x: O.x + l.x + f[0] * SEAL_FRONT, z: O.z + l.z + f[1] * SEAL_FRONT }, { busy: SEAL_BUSY, work: (k) => this.onSeal(k) });
      p.puppet = this.kneel;
      return null;
    }
    // A parley's leader (D62): spoken with where the hero stands, the words over the leader's head.
    if (l.kind === 'chief') {
      const said = this.delve.speak();
      if (said) {
        // The bubble floats OVER_HEAD over the point it is given (their feet), so give the feet less that much below the head.
        const who = l.who, head = (who.def.body.kind === 'humanoid' ? who.def.body.height + 0.25 : 1) - OVER_HEAD;
        this.host.say(said.text, () => (who.state === 'dead' ? null : { x: O.x + who.x, y: O.y + who.y + head, z: O.z + who.z }));
      }
      return null;
    }
    const lid = l.kind === 'hoard' && l.hoard.prop ? (k: number) => this.onLid(l.hoard.id, k) : null;
    // A chest is opened from its front.
    const f = l.kind === 'hoard' ? l.hoard.front : undefined;
    this.kneel = new SearchKneel(w.pos, w.yaw, { x: O.x + l.x, z: O.z + l.z }, lid, () => this.found(l), f && { x: O.x + f[0], z: O.z + f[1] });
    p.puppet = this.kneel;
    return null;
  }

  /** The hands are in what was searched: what it held, if anything. */
  private found(l: Lootable): void {
    const loot = this.delve.plunder(l);
    if (!loot) return;
    this.takeUp(loot);
    this.director.met('reward', loot.items.some((i) => i.rarity !== 'common') ? 1 : 0.4);
  }

  /** The kneel played out (or the hero fell meanwhile): the keys are the player's again. */
  private getUp(): void {
    if (this.kneel && this.player.puppet === this.kneel) this.player.puppet = null;
    this.kneel = null;
  }

  /** A find: its cards, and what is better than what is worn is taken up at once. */
  private takeUp(loot: Loot): void {
    this.hud.showFinds(loot);
    this.onCue({ kind: 'found', loot });
    // What is better is worn at once: it is seen on the hero, and its card says what it is.
    let took = false;
    for (const it of loot.items) if (this.better(it)) { this.hero.equip(it); took = true; }
    if (took) this.host.armed();
  }

  /** Worth wearing instead: the slot is empty, or it is rarer than what is there. */
  private better(it: Item): boolean {
    const d = defOf(this.setting.items, it.def);
    if (!d.slot) return false;
    const now = this.hero.worn[d.slot];
    const rank = ['common', 'uncommon', 'rare', 'legendary'];
    if (!now) return d.kind !== 'weapon' || !this.hero.worn.main;
    return rank.indexOf(it.rarity) > rank.indexOf(now.rarity);
  }

  /** Not the one playing: its creatures shown or not, and a quiet place made known once the hero is away. */
  rest(): void {
    this.active = false;
    if (this.retired) return;
    this.cueInside();
    this.creatures.group.visible = this.arena.shown;
    if (!this.arena.inside && !this.paid && !this.reported && this.arena.promise && this.delve.met) this.reported = this.host.quiet(this.arena.promise);
    if (!this.paid && !this.reported && this.arena.promise && this.delve.failed) this.reported = this.paid = this.host.failed(this.arena.promise);
  }

  private cueInside(): void {
    const inside = this.arena.inside;
    if (inside !== this.wasInside) { this.wasInside = inside; this.onCue({ kind: inside ? 'down' : 'up' }); }
  }

  /**
   * A frame of the hero in its arena. `lead`: the one that owns the keys, the HUD and the hero's stance
   * (others in reach at once, a second band out on the land, still live and strike, but quietly).
   */
  play(dt: number, lead = true): void {
    this.active = lead;
    this.cueInside();
    this.creatures.group.visible = true;
    const pose = this.heroPose();
    if (lead) {
      this.hud.shown = this.arena.enclosed || this.delve.den.fighting.length > 0 || !!this.fight.target || this.hero.health < this.hero.maxHealth || !this.hero.alive;
      if (!this.warned) {
        this.warned = true;
        const w = warning(this.arena.danger, this.hero.power, this.arena.place, this.director.fairness);
        if (w) this.director.queue(w, 3);
      }
    }
    // Fallen: the wards go dark, then the hero wakes at the inn.
    if (!this.hero.alive) {
      this.getUp();
      this.down += dt;
      if (lead && this.down > 3.2 && this.fallenFor >= 0) this.wakeUp();
      this.creatures.pose(dt);
      return;
    }
    // Attacking a target close by: the hero turns to it.
    const t = this.fight.target;
    if (lead && this.fight.attacking && t && Math.hypot(t.x - pose.x, t.z - pose.z) < 3.5) {
      const want = Math.atan2(-(t.x - pose.x), -(t.z - pose.z));
      const w = this.player.walker;
      let d = want - w.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      w.yaw += Math.sign(d) * Math.min(Math.abs(d), 6 * dt);
    }
    for (const e of this.delve.step(dt, pose, lead)) this.event(e);
    const head = this.player.walker.height * 0.9;
    this.creatures.pose(dt, [pose.x, pose.y + head, pose.z]);
    const fighting = this.delve.den.fighting.length;
    if (this.wasFighting > 0 && fighting === 0) this.director.met('challenge');
    if ((this.wasFighting > 0) !== (fighting > 0)) this.onCue({ kind: 'battle', on: fighting > 0 });
    this.wasFighting = fighting;
    // Aura round every creature near in a fight, strong round the hero's target (sim/aura.ts).
    this.creatures.auras(dt, pose, lead ? this.fight.target : null, fighting > 0 || !!this.fight.target);
    if (!this.quietSaid && this.delve.beaten) {
      this.quietSaid = true;
      this.onCue({ kind: 'quiet' });
    }
    // What was asked is done (D62: a fetch once the keepsake is in hand, someone lost once found): the household may come to the hero.
    if (!this.metSaid && this.delve.met) {
      this.metSaid = true;
      const comes = !this.paid && !!this.arena.promise && this.arena.inside && this.host.stilled(this.arena.promise);
      if (this.arena.quietLine && !comes && (this.delve.ask?.verb ?? 'clear') === 'clear') this.director.queue(this.arena.quietLine, 2);
    }
    if (!lead) return;
    if (this.kneel?.done) this.getUp();
    this.near = this.kneel ? null : this.delve.within(pose);
    const stance = this.player.stance;
    const swinging = stance.action && this.player.hero ? this.player.hero.clock - stance.action.t0 < stance.action.dur : false;
    this.player.stance = { combat: fighting > 0 || this.fight.attacking, action: swinging ? stance.action : undefined };
    this.hud.follow(this.fight, this.hero, this.near ? `${PROMPT[this.near.kind]} ${this.near.name}` : null);
  }

  /** What the Director watches (plan 4.3): who fights the hero, and how much danger knows of them. */
  get pressure(): { readonly fighting: number; readonly pressure: number } {
    const den = this.delve.den;
    // At peace (a hold's wardens watching the hero go by) it is no danger.
    if (!this.arena.inside || this.retired || den.peace) return { fighting: 0, pressure: 0 };
    return { fighting: den.fighting.length, pressure: den.alive.filter((c) => c.aware > 0.3).reduce((a, c) => a + c.def.danger, 0) / Math.max(1, this.hero.power) };
  }

  /** How much it wants the hero now (the most pressing one plays). */
  get stir(): number {
    if (this.retired || !this.arena.inside) return -1;
    return this.delve.den.alive.reduce((a, c) => a + c.aware, 0);
  }

  private act(id: string, dur: number): void {
    const h = this.player.hero;
    if (h) this.player.stance = { combat: true, action: { id, t0: h.clock, dur } };
  }

  private event(e: FightEvent): void {
    this.onCue(e);
    const name = (c: Creature) => `the ${c.def.name}`;
    switch (e.kind) {
      case 'struck': {
        this.hud.struck(e.strike.damage, e.strike.outcome);
        if (e.spell) break;
        const w = this.hero.worn.main, shape = w ? defOf(this.setting.items, w.def).weapon?.swing : 'punch';
        this.act(shape === 'punch' ? 'punch' : shape === 'slam' ? 'slam' : e.ability === 'shove' ? 'kick' : 'swing_1h', Math.min(0.9, this.hero.weapon.time * 0.6));
        break;
      }
      case 'hurt':
        if (e.strike.outcome !== 'miss') {
          this.hud.hurt();
          // Knocked back from the blow at once; the whole flinch when not busy with a blow of its own.
          const me = this.heroPose();
          this.player.hero?.struck(me.x - e.by.x, me.z - e.by.z, joltOf(e.strike.outcome));
          if (!this.player.stance.action) this.act('flinch', 0.45);
        }
        break;
      case 'heal': this.hud.healed(); this.act('drink', 1.1); break;
      // Noticed, fleeing, slinking off spared: all seen on the creature, so nothing is said.
      case 'plea': this.notes.say(`“${e.text}”`, 7); break;
      case 'spared': this.director.met('people', 0.5); break;
      case 'killed': if (e.loot.items.length || e.loot.coins) this.director.queue(cap(`${name(e.who)} carried something. (${this.host.bindings.search[0].replace(/^Key/, '')} to search)`), 0.4); break;
      case 'refused': this.notes.say(e.text, 2.5); break;
      case 'recipe': if (this.active) this.spellCues.push(e.event); break;
      case 'worn': if (e.state !== 'new') this.director.queue(fill(this.setting.upkeep.words[e.state], { item: e.item.name.toLowerCase() }), 1); break;
      case 'fallen':
        this.fallenFor = 0;
        this.down = 0;
        this.hud.fallen(true, 'You fall.');
        this.host.still(true);
        break;
      default: break;
    }
  }

  /** The wards gone dark: the hero wakes somewhere safe (classic), or stays down for good (roguelike). */
  private wakeUp(): void {
    this.fallenFor = -1;
    this.fight.pick(null);
    const woke = this.host.wake();
    if (woke === null) return;
    this.hud.fallen(false);
    this.host.still(false);
    this.onCue({ kind: 'woke' });
    this.notes.say(woke, 8);
  }
}

/**
 * One frame of every encounter: those the hero is in play (the most stirred leads), the others rest;
 * with none, the hero catches breath and the HUD shows only while they are hurt.
 */
export function stepEncounters(dt: number, all: readonly Encounter[], calm: { readonly hero: Character; readonly player: Player; readonly hud: FightHud; readonly alone?: Recipes; readonly notes?: Notes; readonly cues?: RecipeEvent[] }): void {
  let best: Encounter | null = null;
  // A bird in the hero's place (bird form) is nothing the dwellers fight: every encounter rests meanwhile.
  const flown = !!calm.player.shape?.aloft;
  for (const e of all) if (!flown && e.stir >= 0 && (!best || e.stir > best.stir)) best = e;
  // Out on the land, the bodies of different groups block each other too (cellars have frames of their own).
  const open: Den[] = [];
  for (const e of all) if (!flown && e.stir >= 0 && !e.arena.enclosed) open.push(e.delve.den);
  for (const d of open) d.neighbours = open.filter((o) => o !== d);
  for (const e of all) {
    if (flown || e.stir < 0) { e.rest(); e.delve.den.neighbours = []; }
    else e.play(dt, e === best);
  }
  keepApart(open);
  if (best) return;
  // Out of a fight: no fighting stance, but a spell's hands (or any action) play out.
  const act = calm.player.stance.action, h = calm.player.hero;
  calm.player.stance = { combat: false, action: act && h && h.clock - act.t0 < act.dur ? act : undefined };
  const w = calm.player.walker;
  for (const e of calm.alone?.elapse(dt, w.pos, w.groundSpeed) ?? []) {
    calm.cues?.push(e);
    if (e.kind === 'refused' || e.kind === 'broken') calm.notes?.say(e.kind === 'broken' ? e.why : e.text, 2.5);
    else if (e.kind === 'healed' && !e.over) calm.hud.healed();
  }
  calm.hero.recover(dt, false, 0);
  calm.hud.shown = calm.hero.health < calm.hero.maxHealth;
  calm.hud.calm(calm.hero);
}
