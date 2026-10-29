/**
 * The hero as numbers (plan 11.4, 11.5, D29, D58, D59): a level earned with experience from everything they do
 * and no skills (the level is the skill: it sets the hero's prowess at everything), abilities taught by the guild
 * houses, health, stamina and mana that grow with the level, what is worn and carried (gear adds to its
 * qualities), and the one "power" number the VGM reads. No classes, nothing rises by use. Pure: saved as plain data.
 */
import { abilityOf, type AbilityDef, type BackgroundDef, type DamageKind, type GrowthSource, type ItemCatalog, type Quality, type SettingModule, type Slot, type WeaponSwing } from '../setting/contract';
import type { Blow, Guard } from '../sim/combat';
import { addToBar, cleanBar, clearSlot, defaultBar, type Bar } from './actionBar';
import type { Worn } from './recipe';
import { defOf, plainItem, withQualities, type Item } from './items';
import { strengthOf, wearState, wornBy, type Lodging, type WearState } from './upkeep';
import { levelOf } from './growth';

export interface CharacterSave {
  /** Old saves only (before D59): dropped on loading. */
  readonly skills?: Readonly<Record<string, number>>;
  readonly health: number;
  readonly stamina: number;
  /** Absent in saves from before magic (C1): full. */
  readonly mana?: number;
  readonly worn: Partial<Record<Slot | 'ring2', Item>>;
  readonly pack: readonly Item[];
  readonly coins: number;
  /** The hero's past (a background id; absent in saves from before backgrounds). */
  readonly background?: string;
  /** The inn where the hero last took a room: where they wake after a fall (absent: none yet). */
  readonly lodging?: Lodging;
  /** Old saves only (D49's skill ranks, before D59): dropped on loading. */
  readonly ranks?: Readonly<Record<string, number>>;
  /** Abilities a teacher (or the debug menu) opened (absent: none). */
  readonly learned?: readonly string[];
  /** The action bar as arranged (absent in older saves: the default bar). */
  readonly bar?: Bar;
  /** Experience (D58; absent in saves from before levels: none, or what the old reputation was worth). */
  readonly xp?: number;
  /** The deeds and discoveries already counted for experience, by key (each once). */
  readonly earned?: readonly string[];
}

export interface WeaponStats {
  readonly swing: WeaponSwing;
  readonly damage: readonly [number, number];
  readonly kind: DamageKind;
  readonly time: number;
  readonly reach: number;
}

/** Fists, when nothing is held. */
const FISTS: WeaponStats = { swing: 'punch', damage: [1, 3], kind: 'blunt', time: 1.3, reach: 0.6 };

export class Character {
  health: number;
  stamina: number;
  /** For spells (plan 10, D59); none until the first spell is learned. */
  mana: number;
  /** Sitting down to rest (game/rest.ts): health, mana and stamina come back faster. Not saved. */
  resting = false;
  /** On a rock face (D56): stamina does not come back meanwhile. Not saved. */
  climbing = false;
  readonly worn: Partial<Record<Slot | 'ring2', Item>> = {};
  readonly pack: Item[] = [];
  coins = 0;
  /** The hero's past (plan 11.4): a background id, '' before one is chosen. */
  background = '';
  /** The inn where the hero last took a room (plan 11.2: where they wake after a fall); null: none yet. */
  lodging: Lodging | null = null;
  /** Taught abilities the hero has learned (setting abilities with `taught`). */
  readonly learned = new Set<string>();
  /** The action bar (game/actionBar.ts): ten slots of ability ids. */
  bar: Bar;
  /** Seconds before each ability is ready again (not saved): the same in a fight and out of one. */
  readonly cooldowns = new Map<string, number>();
  /** Status effects on the hero (not saved; game/recipe.ts): the same in a fight and out of one. */
  readonly effectsOn: Worn[] = [];
  /** Experience (D58): the level follows from it. */
  xp = 0;
  /** Deeds and discoveries counted for experience already (each once, D58). */
  readonly earned = new Set<string>();
  private readonly cat: ItemCatalog;

  constructor(private readonly setting: SettingModule, saved?: CharacterSave) {
    this.cat = setting.items;
    if (saved) {
      // Old saves: skills and ranks are dropped (D59); what they learned stays, gear's skill bonuses become qualities.
      Object.assign(this.worn, saved.worn);
      for (const k of Object.keys(this.worn) as (Slot | 'ring2')[]) this.worn[k] = withQualities(this.granting(this.worn[k]!));
      this.pack.push(...saved.pack.map((it) => withQualities(this.granting(it))));
      this.coins = saved.coins;
      this.background = saved.background ?? '';
      this.lodging = saved.lodging ?? null;
      for (const id of saved.learned ?? []) if (setting.abilities.some((a) => a.id === id && a.taught)) this.learned.add(id);
      this.xp = saved.xp ?? 0;
      for (const k of saved.earned ?? []) this.earned.add(k);
    } else this.beginAs(setting.backgrounds[0]);
    this.bar = saved ? cleanBar(saved.bar, this.known) : defaultBar(this.known);
    this.health = Math.min(saved?.health ?? Infinity, this.maxHealth);
    this.stamina = Math.min(saved?.stamina ?? Infinity, this.maxStamina);
    this.mana = Math.min(saved?.mana ?? Infinity, this.maxMana);
  }

  /** Starts a new hero's life with this past: its kit and coins, the abilities it taught, fully rested. */
  beginAs(bg: BackgroundDef): void {
    this.background = bg.id;
    this.lodging = null;
    this.xp = 0;
    this.earned.clear();
    this.learned.clear();
    for (const id of bg.abilities) this.learned.add(id);
    for (const k of Object.keys(this.worn) as (Slot | 'ring2')[]) delete this.worn[k];
    this.pack.length = 0;
    const p = (id: string) => plainItem(this.cat, id);
    for (const [slot, id] of Object.entries(bg.kit.worn)) this.worn[slot as Slot] = p(id);
    this.pack.push(...bg.kit.pack.map(p));
    this.coins = bg.kit.coins;
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.mana = this.maxMana;
    this.bar = defaultBar(this.known);
  }

  /**
   * The abilities this hero can use, in the setting's order: every untaught one, those learned, and those a
   * worn item gives (D31, C5).
   */
  get known(): string[] {
    const given = new Set(Object.values(this.worn).map((it) => it?.grants));
    return this.setting.abilities.filter((a) => (a.item ? given.has(a.id) : !a.taught || this.learned.has(a.id))).map((a) => a.id);
  }

  /** A legendary item from a save older than item abilities (C5), with what its canon's piece gives. */
  private granting(it: Item): Item {
    if (it.rarity !== 'legendary' || it.grants) return it;
    const u = this.cat.uniques.find((x) => x.name === it.name && x.base === it.def);
    return u?.grants ? { ...it, grants: u.grants } : it;
  }

  /** After putting something on or off: what a worn item gives goes onto the bar, what is no longer given off it. */
  private regrant(had: readonly string[]): void {
    const now = this.known;
    for (const id of now) if (!had.includes(id)) this.bar = addToBar(this.bar, id);
    for (const id of had) if (!now.includes(id)) { const i = this.bar.indexOf(id); if (i >= 0) this.bar = clearSlot(this.bar, i); }
  }

  knows(id: string): boolean { return this.known.includes(id); }

  /** The hero's level (D58), 1 .. the setting's top, from the experience earned. */
  get level(): number { return levelOf(this.setting.growth, this.xp); }

  /** Experience from a fight or the like (D58): the levels it brought (0: none). */
  gain(xp: number): number {
    if (!(xp > 0)) return 0;
    const was = this.level;
    this.xp = Math.round((this.xp + xp) * 10) / 10;
    const up = this.level - was;
    // A new level comes with its health, stamina and mana, filled by what it adds.
    if (up) {
      const p = this.setting.growth.perLevel;
      this.health = Math.min(this.maxHealth, this.health + p.health * up);
      this.stamina = Math.min(this.maxStamina, this.stamina + p.stamina * up);
      if (this.maxMana) this.mana = Math.min(this.maxMana, this.mana + p.mana * up);
    }
    return up;
  }

  /** A deed or discovery counted for experience once by `key` (D58): the levels it brought; a second time nothing. */
  earn(key: string, source: GrowthSource): number {
    if (this.earned.has(key)) return 0;
    this.earned.add(key);
    return this.gain(this.setting.growth.deeds[source]);
  }

  /** A taught ability learned (from a teacher, or the debug menu): onto the bar's first free slot. False if there is no such ability or it is known already. */
  learn(id: string): boolean {
    const a = abilityOf(this.setting, id);
    if (this.knows(id) || !a || a.item) return false;
    const magic = this.hasMagic;
    this.learned.add(id);
    this.earn(`learn:${id}`, 'learn');
    // The first spell wakes the hero's mana (D59), full.
    if (!magic && this.hasMagic) this.mana = this.maxMana;
    this.bar = addToBar(this.bar, id);
    return true;
  }

  /** The debug menu's learn: also lifts the hero to the ability's level (never lowers it), so they can use it at once. */
  learnToUse(id: string): boolean {
    if (!this.learn(id)) return false;
    const need = abilityOf(this.setting, id)?.level ?? 1;
    if (this.level < need) this.gain(this.setting.growth.xp[need - 1] - this.xp);
    return true;
  }

  /** A learned ability forgotten (the debug menu): off the bar too. */
  forget(id: string): boolean {
    if (!this.learned.delete(id)) return false;
    this.bar = this.bar.map((x) => (x === id ? null : x));
    return true;
  }

  /**
   * The hero's prowess at everything they do (D59: the level is the skill), on the scale of the creatures' aim
   * and defence (0..100).
   */
  get prowess(): number { const p = this.setting.growth.prowess; return p.base + p.step * (this.level - 1); }

  /** What worn gear adds to a quality. */
  bonus(q: Quality): number {
    let v = 0;
    for (const it of Object.values(this.worn)) v += it?.bonuses[q] ?? 0;
    return v;
  }

  /** How well the hero's blows land and bite. */
  get aim(): number { return this.prowess + this.bonus('aim'); }
  /** How well the hero slips blows. */
  get defence(): number { return this.prowess * 0.8 + this.bonus('guard'); }
  /** How quietly the hero moves (0..100): a little with the level, more with gear made for it. */
  get stealth(): number { return this.prowess * 0.4 + this.bonus('stealth'); }
  /** How well the hero bargains (0..100). */
  get speech(): number { return this.prowess * 0.75 + this.bonus('speech'); }
  /** How strongly an ability works: a spell with the gear that adds to spells. */
  powerOf(def: AbilityDef): number { return this.prowess + (def.school ? this.bonus('spell') : 0); }
  /** The hero knows a spell (D59: mana comes with the first). */
  get hasMagic(): boolean { return this.known.some((id) => !!abilityOf(this.setting, id)?.school); }

  /** What the levels above the first add (D58). */
  private perLevel(k: 'health' | 'stamina' | 'mana'): number { return this.setting.growth.perLevel[k] * (this.level - 1); }

  /** Health and stamina grow with the level (and gear made for it). */
  get maxHealth(): number { return Math.round(66 + this.perLevel('health') + this.bonus('health')); }
  get maxStamina(): number { return Math.round(69 + this.perLevel('stamina')); }
  /** Mana comes with the first spell and grows with the level (none before). */
  get maxMana(): number { return this.hasMagic ? Math.round(30 + this.perLevel('mana')) : 0; }

  get alive(): boolean { return this.health > 0; }

  /** What the main hand swings. */
  get weapon(): WeaponStats {
    const it = this.worn.main, w = it && defOf(this.cat, it.def).weapon;
    if (!w) return FISTS;
    // A worn blade cuts less well (plan 11.5: gear wears, the smith mends it).
    const k = strengthOf(it);
    return k === 1 ? w : { ...w, damage: [w.damage[0] * k, w.damage[1] * k] };
  }

  get armour(): number {
    let a = 0;
    for (const it of Object.values(this.worn)) a += it ? (defOf(this.cat, it.def).armour ?? 0) * strengthOf(it) : 0;
    // Wearing it well: prowess and gear made for it make it count for more.
    return a * (1 + this.armourKnack / 150);
  }

  get blockChance(): number {
    const it = this.worn.off, b = it ? (defOf(this.cat, it.def).block ?? 0) * strengthOf(it) : 0;
    return b ? Math.min(0.6, b * (1 + this.shieldKnack / 80)) : 0;
  }

  /** How well armour and a shield are worn (prowess, and what gear adds). */
  private get armourKnack(): number { return this.prowess * 0.5 + this.bonus('armour'); }
  private get shieldKnack(): number { return this.prowess * 0.5 + this.bonus('block'); }

  /** The blow a weapon ability's `blow` step throws now. */
  blow(step?: { readonly power: number; readonly aim?: number }): Blow {
    const w = this.weapon;
    return { damage: w.damage, kind: w.kind, prowess: this.aim, power: step?.power ?? 1, aim: step?.aim ?? 0 };
  }

  guard(open = false): Guard {
    return { defence: this.defence, armour: this.armour, block: this.blockChance, open };
  }

  /**
   * Power, on the creatures' danger scale (a fresh hero is about 15): prowess plus gear. The VGM reads it
   * wherever it needs one; the world itself is never scaled to it (D29).
   */
  get power(): number {
    const w = this.weapon, avg = (w.damage[0] + w.damage[1]) / 2;
    const knack = (this.aim + this.defence + this.armourKnack * 0.5 + (this.worn.off ? this.shieldKnack * 0.5 : 0)) / 5;
    return Math.round((knack + avg * (1 + this.aim / 220) / w.time * 2.2 + this.armour * 0.9 + this.blockChance * 8 + (this.maxHealth - 55) * 0.08) * 10) / 10;
  }

  /**
   * Use wears what is worn in `slot` by `amount` (upkeep.ts WEAR); returns its new look when that changed
   * (worn, battered, broken), so the game can say so.
   */
  wear(slot: Slot | 'ring2', amount: number): { readonly item: Item; readonly state: WearState } | null {
    const it = this.worn[slot];
    if (!it || amount <= 0) return null;
    const next = wornBy(it, amount);
    this.worn[slot] = next;
    const state = wearState(next);
    return state !== wearState(it) ? { item: next, state } : null;
  }

  /** Put an item from the pack on; what was there goes into the pack. */
  equip(item: Item): void {
    const d = defOf(this.cat, item.def);
    if (!d.slot) return;
    const slot: Slot | 'ring2' = d.slot === 'ring' && this.worn.ring ? 'ring2' : d.slot;
    const had = this.known, i = this.pack.indexOf(item);
    if (i >= 0) this.pack.splice(i, 1);
    const old = this.worn[slot];
    if (old) this.pack.push(old);
    this.worn[slot] = item;
    this.health = Math.min(this.health, this.maxHealth);
    this.regrant(had);
  }

  /** Take off what is worn in `slot`, into the pack. */
  unequip(slot: Slot | 'ring2'): void {
    const it = this.worn[slot];
    if (!it) return;
    const had = this.known;
    delete this.worn[slot];
    this.pack.push(it);
    this.health = Math.min(this.health, this.maxHealth);
    this.regrant(had);
  }

  /** Drink or eat something from the pack: the health it gave. */
  consume(item: Item): number {
    const d = defOf(this.cat, item.def);
    if (!d.heal) return 0;
    const i = this.pack.indexOf(item);
    if (i < 0) return 0;
    this.pack.splice(i, 1);
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + d.heal);
    return this.health - before;
  }

  /** Read a writing from the pack (C3): its ability is learned and the writing crumbles. A line why not, or null. */
  readWriting(item: Item): string | null {
    const d = defOf(this.cat, item.def), i = this.pack.indexOf(item);
    if (!d.teaches || i < 0) return 'There is nothing in it to learn.';
    if (this.knows(d.teaches)) return 'You know what it teaches already.';
    this.pack.splice(i, 1);
    this.earn(`read:${d.teaches}`, 'read');
    this.learn(d.teaches);
    return null;
  }

  /** The best healing in the pack (a potion first), for the quick slot. */
  get remedy(): Item | null {
    const heals = this.pack.filter((i) => defOf(this.cat, i.def).kind === 'potion');
    return heals.sort((a, b) => (defOf(this.cat, a.def).heal ?? 0) - (defOf(this.cat, b.def).heal ?? 0))[0] ?? null;
  }

  /**
   * Breathe: stamina comes back fast; health only out of a fight, and faster when standing still (`still` s);
   * sitting down to rest (`resting`) brings all three back faster still.
   */
  recover(dt: number, fighting: boolean, still = 0): void {
    const sat = this.resting && !fighting;
    // (On a rock face it does not come back: the climb spends it.)
    if (!this.climbing) this.stamina = Math.min(this.maxStamina, this.stamina + dt * (fighting ? 4 : sat ? 30 : 12));
    this.mana = Math.min(this.maxMana, this.mana + dt * (fighting ? 0.5 : sat ? 6 : 2));
    if (!fighting && this.alive) this.health = Math.min(this.maxHealth, this.health + dt * (sat ? 3.5 : still > 4 ? 1.2 : 0.3));
  }

  get carried(): number {
    let w = 0;
    for (const it of [...this.pack, ...Object.values(this.worn)]) w += it ? defOf(this.cat, it.def).weight : 0;
    return w;
  }

  save(): CharacterSave {
    return { health: this.health, stamina: this.stamina, mana: this.mana, worn: { ...this.worn }, pack: [...this.pack], coins: this.coins, background: this.background, ...(this.lodging ? { lodging: this.lodging } : {}), learned: [...this.learned], bar: [...this.bar], xp: this.xp, ...(this.earned.size ? { earned: [...this.earned] } : {}) };
  }
}

/** Strength a climb spends (stamina per second): hanging still, and more while moving on the face. */
export const CLIMB_COST = { hang: 0.2, move: 0.55 };

/** Health a fall of `metres` costs: nothing up to 4 m, then more and more (a fall of 20 m nearly kills). */
export function fallHurt(metres: number): number {
  return metres <= 4 ? 0 : Math.round(1.6 * (metres - 4) ** 1.45);
}
