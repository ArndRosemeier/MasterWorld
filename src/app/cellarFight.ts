/**
 * The fight down in the cellar (plan 11.2, D13): each frame the hero's pose goes to the delve, its events
 * become notes, the HUD's moments and the hero's blows; Tab, a click and the belt's keys pick a target
 * and use abilities; G searches the fallen and opens chests. The Director (vgm/director.ts) watches it
 * all, warns at the door of a place too hard, and its messages come one at a time. Falling ends in
 * waking at the inn, lighter of coin. Coming up from a cellar gone quiet keeps the promise: the journal
 * marks it done and the household pays.
 */
import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { SettingModule } from '../setting/contract';
import type { Creature } from '../sim/creatures';
import type { Delve, Lootable } from '../game/delve';
import type { FightEvent, HeroPose } from '../game/fight';
import { coinText, defOf, type Item, type Loot } from '../game/items';
import type { Bindings } from '../input/controls';
import { onKeyDown } from '../input/keys';
import type { CreatureView } from '../render/dungeon/CreatureView';
import { warning, type Director } from '../vgm/director';
import { cellarDanger } from '../world/dungeon/treasure';
import type { Journal } from '../talk/journal';
import { cap } from '../talk/townTalk';
import type { CellarVisit } from './cellarVisit';
import type { FightHud } from './fightHud';
import type { Notes } from './notes';
import type { Player } from './player';

export interface FightHost {
  readonly bindings: Bindings;
  /** A dialog is open (keys are the dialog's). */
  readonly blocked: boolean;
  /** Fallen: carry the hero to the inn. */
  wake(): void;
  /** Hold the hero still (fallen) or let go. */
  still(on: boolean): void;
  /** What the hero holds changed. */
  armed(): void;
}

/** What the household pays for a cellar made safe, copper per point of its danger. */
export const REWARD_PER_DANGER = 12;


export class CellarFight {
  private readonly danger: number;
  private warned = false;
  private quietSaid = false;
  /** The promise was kept and paid. */
  paid: boolean;
  private down = 0;
  private fallenFor = -1;
  private wasFighting = 0;
  private near: Lootable | null = null;
  private readonly ray = new Vector3();

  constructor(
    private readonly visit: CellarVisit,
    readonly delve: Delve,
    private readonly creatures: CreatureView,
    private readonly hud: FightHud,
    private readonly player: Player,
    private readonly notes: Notes,
    private readonly director: Director,
    private readonly setting: SettingModule,
    private readonly journal: Journal,
    private readonly camera: PerspectiveCamera,
    canvas: HTMLElement,
    private readonly host: FightHost,
    paid = false,
  ) {
    this.paid = paid;
    this.danger = cellarDanger(visit.cellar, setting.creatures);
    this.creatures.group.visible = false;
    onKeyDown((e) => this.keyDown(e));
    // A click (not a drag of the camera) picks what is under the pointer.
    let at: { x: number; y: number; t: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => { if (e.button === 0) at = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!at || e.button !== 0) return;
      const click = Math.hypot(e.clientX - at.x, e.clientY - at.y) < 6 && performance.now() - at.t < 350;
      at = null;
      if (click && this.visit.inside) this.click(e.clientX, e.clientY, canvas);
    });
  }

  private get fight() { return this.delve.fight; }
  private get hero() { return this.delve.hero; }

  /** The hero's pose in the cellar's frame. */
  private heroPose(): HeroPose {
    const w = this.player.walker, O = this.creatures.group.position;
    return { x: w.pos.x - O.x, y: w.pos.y - O.y, z: w.pos.z - O.z, yaw: w.yaw, speed: w.groundSpeed };
  }

  private keyDown(e: KeyboardEvent): void {
    if (!this.visit.inside || this.host.blocked || e.repeat || !this.hero.alive) return;
    const b = this.host.bindings, is = (a: keyof Bindings) => b[a].includes(e.code);
    let said: string | null = null;
    if (is('target')) { e.preventDefault(); if (!this.fight.tab(this.heroPose())) said = 'Nothing in sight to fight.'; }
    else if (is('strike')) said = this.fight.use('strike');
    else if (is('heavy')) said = this.fight.use('heavy');
    else if (is('shove')) said = this.fight.use('shove');
    else if (is('breath')) said = this.fight.use('breath');
    else if (is('potion')) said = this.fight.drink();
    else if (is('search')) said = this.search();
    else return;
    if (said) this.notes.say(said, 2.5);
  }

  private click(x: number, y: number, canvas: HTMLElement): void {
    const r = canvas.getBoundingClientRect();
    this.ray.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const c = this.creatures.under(this.camera.position, this.ray);
    if (c) this.fight.pick(c);
  }

  private search(): string | null {
    const l = this.near;
    if (!l) return 'There is nothing here to search.';
    const loot = this.delve.plunder(l);
    if (!loot) return `${cap(l.name)} holds nothing more.`;
    this.takeUp(loot);
    this.director.met('reward', loot.items.some((i) => i.rarity !== 'common') ? 1 : 0.4);
    return null;
  }

  /** A find: its cards, and what is better than what is worn is taken up at once. */
  private takeUp(loot: Loot): void {
    this.hud.showFinds(loot, this.setting.items);
    const took: string[] = [];
    for (const it of loot.items) if (this.better(it)) { this.hero.equip(it); took.push(it.name); }
    if (took.length) { this.notes.say(`You take up ${took.join(' and ')}.`, 4); this.host.armed(); }
    else if (loot.coins) this.notes.say(`${cap(coinText(loot.coins))} into your purse.`, 3);
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

  play(dt: number): void {
    const inside = this.visit.inside;
    this.hud.shown = inside || this.hero.health < this.hero.maxHealth;
    this.creatures.group.visible = inside;
    if (!inside) {
      this.player.stance = { combat: false };
      this.hero.recover(dt, false, 0);
      if (!this.paid && this.delve.beaten) this.keepPromise();
      this.hud.show(this.fight, this.hero, null);
      return;
    }
    if (!this.warned) {
      this.warned = true;
      const w = warning(this.danger, this.hero.power, 'this cellar');
      if (w) this.director.queue(w, 3);
    }
    const pose = this.heroPose();
    // Fallen: the wards go dark, then the hero wakes at the inn.
    if (!this.hero.alive) {
      this.down += dt;
      if (this.down > 3.2 && this.fallenFor >= 0) this.wakeUp();
      this.creatures.pose(dt);
      return;
    }
    // Attacking a target close by: the hero turns to it.
    const t = this.fight.target;
    if (this.fight.attacking && t && Math.hypot(t.x - pose.x, t.z - pose.z) < 3.5) {
      const want = Math.atan2(-(t.x - pose.x), -(t.z - pose.z));
      const w = this.player.walker;
      let d = want - w.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      w.yaw += Math.sign(d) * Math.min(Math.abs(d), 6 * dt);
    }
    for (const e of this.delve.step(dt, pose)) this.event(e);
    const head = this.player.walker.height * 0.9;
    this.creatures.pose(dt, [pose.x, pose.y + head, pose.z]);
    const fighting = this.delve.den.fighting.length;
    if (this.wasFighting > 0 && fighting === 0) this.director.met('challenge');
    this.wasFighting = fighting;
    if (!this.quietSaid && this.delve.beaten) {
      this.quietSaid = true;
      this.director.queue(`The cellar of ${this.visit.cellar.house} is quiet now. Its household will want to hear.`, 2);
    }
    this.near = this.delve.within(pose);
    const stance = this.player.stance;
    const swinging = stance.action && this.player.hero ? this.player.hero.clock - stance.action.t0 < stance.action.dur : false;
    this.player.stance = { combat: fighting > 0 || this.fight.attacking, action: swinging ? stance.action : undefined };
    this.hud.show(this.fight, this.hero, this.near ? `Search ${this.near.name}` : null);
  }

  /** The Director's turn: it watches, and says what waits (call every frame, inside or out). */
  direct(dt: number, signals: { inTown: boolean; talking: boolean; leads: number }): void {
    const den = this.delve.den;
    const inside = this.visit.inside;
    const pressure = inside ? den.alive.filter((c) => c.aware > 0.3).reduce((a, c) => a + c.def.danger, 0) / Math.max(1, this.hero.power) : 0;
    this.director.observe(dt, { fighting: inside ? den.fighting.length : 0, pressure, health: this.hero.health / this.hero.maxHealth, talking: signals.talking, underground: inside, inTown: signals.inTown && !inside, leads: signals.leads });
    const m = this.director.next();
    if (m) this.notes.say(m, 6);
  }

  private act(id: string, dur: number): void {
    const h = this.player.hero;
    if (h) this.player.stance = { combat: true, action: { id, t0: h.clock, dur } };
  }

  private event(e: FightEvent): void {
    const name = (c: Creature) => `the ${c.def.name}`;
    switch (e.kind) {
      case 'struck': {
        this.hud.struck(e.strike.damage, e.strike.outcome);
        const w = this.hero.worn.main, shape = w ? defOf(this.setting.items, w.def).weapon?.skill : 'unarmed';
        this.act(shape === 'unarmed' ? 'punch' : shape === 'maces' ? 'slam' : e.ability === 'shove' ? 'kick' : 'swing_1h', Math.min(0.9, this.hero.weapon.time * 0.6));
        break;
      }
      case 'hurt':
        if (e.strike.outcome !== 'miss') {
          this.hud.hurt();
          if (!this.player.stance.action) this.act('flinch', 0.45);
        }
        break;
      case 'heal': this.hud.healed(); this.act('drink', 1.1); break;
      case 'notice': if (e.who.def.temper !== 'skittish') this.director.queue(cap(`${name(e.who)} has seen you.`), 0.5); break;
      case 'flee': this.notes.say(cap(`${name(e.who)} flees.`), 2.5); break;
      case 'plea': this.notes.say(`“${e.text}”`, 7); break;
      case 'spared': this.notes.say(cap(`${name(e.who)} slinks away into the dark, alive.`), 4); this.director.met('people', 0.5); break;
      case 'killed': if (e.loot.items.length || e.loot.coins) this.director.queue(cap(`${name(e.who)} carried something. (${this.host.bindings.search[0].replace(/^Key/, '')} to search)`), 0.4); break;
      case 'skill': this.director.queue(`Your ${e.up.name} rises to ${e.up.level}.`, 1); break;
      case 'refused': this.notes.say(e.text, 2.5); break;
      case 'fallen':
        this.fallenFor = 0;
        this.down = 0;
        this.hud.fallen(true, 'You fall.');
        this.host.still(true);
        break;
      default: break;
    }
  }

  /** Waking at the inn (classic mode): half the purse gone, sore but alive. */
  private wakeUp(): void {
    this.fallenFor = -1;
    const lost = Math.floor(this.hero.coins / 2);
    this.hero.coins -= lost;
    this.hero.health = Math.round(this.hero.maxHealth * 0.5);
    this.hero.stamina = this.hero.maxStamina;
    this.fight.pick(null);
    this.hud.fallen(false);
    this.host.still(false);
    this.host.wake();
    this.notes.say(`You wake in the inn, aching. Someone carried you up${lost ? `, and ${coinText(lost)} went with them` : ''}.`, 8);
  }

  /** Up from a quiet cellar: the promise is kept and the household pays. */
  private keepPromise(): void {
    this.paid = true;
    const d = this.visit.cellar.decision;
    const lead = this.journal.leads.find((l) => l.id === d.id);
    if (lead) lead.done = true;
    const pay = Math.round(this.danger * REWARD_PER_DANGER);
    this.hero.coins += pay;
    this.director.met('purpose');
    this.director.queue(`The household of ${this.visit.cellar.house} hears the cellar is safe and presses ${coinText(pay)} into your hand.`, 3);
  }
}
