/**
 * The hero as numbers (plan 11.4, 11.5, D29, D30): skills that grow by use (no classes, no XP), health
 * and stamina that grow with the skills that use them, what is worn and carried, and the one "power"
 * number the VGM reads wherever it needs a level. Pure: saved as plain data.
 */
import { abilityOf, type BackgroundDef, type DamageKind, type ItemCatalog, type SettingModule, type Slot } from '../setting/contract';
import type { Blow, Guard } from '../sim/combat';
import { addToBar, cleanBar, clearSlot, defaultBar, type Bar } from './actionBar';
import type { Worn } from './recipe';
import { defOf, plainItem, type Item } from './items';
import { strengthOf, wearState, wornBy, type Lodging, type WearState } from './upkeep';

export interface CharacterSave {
  readonly skills: Readonly<Record<string, number>>;
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
  /** The rank opened in each skill a guild teaches (D49; absent in older saves: what they had, opened). */
  readonly ranks?: Readonly<Record<string, number>>;
  /** Abilities a teacher (or the debug menu) opened (absent: none). */
  readonly learned?: readonly string[];
  /** The action bar as arranged (absent in older saves: the default bar). */
  readonly bar?: Bar;
}

/** A skill rose to a new whole point. */
export interface SkillUp {
  readonly skill: string;
  readonly name: string;
  readonly level: number;
}

export interface WeaponStats {
  readonly skill: string;
  readonly damage: readonly [number, number];
  readonly kind: DamageKind;
  readonly time: number;
  readonly reach: number;
}

/** Fists, when nothing is held. */
const FISTS: WeaponStats = { skill: 'unarmed', damage: [1, 3], kind: 'blunt', time: 1.3, reach: 0.6 };

export class Character {
  readonly skills = new Map<string, number>();
  /**
   * The rank opened in each skill a guild teaches (D49): use and lessons raise it only up to that rank's
   * top, and not at all before a trainer (or the hero's past) opened it. Skills no guild teaches rise freely.
   */
  readonly ranks = new Map<string, number>();
  health: number;
  stamina: number;
  /** For spells (plan 10); none until a school of magic is opened. */
  mana: number;
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
  private readonly cat: ItemCatalog;

  constructor(private readonly setting: SettingModule, saved?: CharacterSave) {
    this.cat = setting.items;
    for (const s of setting.skills) this.skills.set(s.id, saved?.skills[s.id] ?? s.start);
    if (saved) {
      Object.assign(this.worn, saved.worn);
      for (const k of Object.keys(this.worn) as (Slot | 'ring2')[]) this.worn[k] = this.granting(this.worn[k]!);
      this.pack.push(...saved.pack.map((it) => this.granting(it)));
      this.coins = saved.coins;
      this.background = saved.background ?? '';
      this.lodging = saved.lodging ?? null;
      // A save from before the ranks opens what the hero had, as far as it had come; magic never opens so,
      // nor does a skill a guild began to teach after the save (a school of magic: C3).
      for (const id of this.rankedSkills()) this.ranks.set(id, saved.ranks?.[id] ?? (saved.ranks || this.isMagic(id) ? this.freshRank(id) : this.rankFor(this.skills.get(id) ?? 0)));
      // A school of magic opened by a spell learned (no guild teaches it yet) keeps its rank too.
      for (const [id, r] of Object.entries(saved.ranks ?? {})) if (!this.ranks.has(id) && this.skills.has(id)) this.ranks.set(id, r);
      for (const id of saved.learned ?? []) if (setting.abilities.some((a) => a.id === id && a.taught)) this.learned.add(id);
    } else this.beginAs(setting.backgrounds[0]);
    this.bar = saved ? cleanBar(saved.bar, this.known) : defaultBar(this.known);
    this.health = Math.min(saved?.health ?? Infinity, this.maxHealth);
    this.stamina = Math.min(saved?.stamina ?? Infinity, this.maxStamina);
    this.mana = Math.min(saved?.mana ?? Infinity, this.maxMana);
  }

  /** Starts a new hero's life with this past: its skills over the starts, its kit and coins, fully rested. */
  beginAs(bg: BackgroundDef): void {
    this.background = bg.id;
    this.lodging = null;
    for (const s of this.setting.skills) this.skills.set(s.id, s.start + (bg.skills[s.id] ?? 0));
    // What everyone can do, and what this past taught, is open; the rest waits for a guild's trainer.
    this.ranks.clear();
    for (const id of this.rankedSkills()) this.ranks.set(id, this.setting.skills.find((s) => s.id === id)?.open || bg.skills[id] ? 0 : -1);
    for (const k of Object.keys(this.worn) as (Slot | 'ring2')[]) delete this.worn[k];
    this.pack.length = 0;
    const p = (id: string) => plainItem(this.cat, id);
    for (const [slot, id] of Object.entries(bg.kit.worn)) this.worn[slot as Slot] = p(id);
    this.pack.push(...bg.kit.pack.map(p));
    this.coins = bg.kit.coins;
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.mana = this.maxMana;
    this.learned.clear();
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

  /** A taught ability learned (from a teacher, or the debug menu): onto the bar's first free slot. False if there is no such ability or it is known already. */
  learn(id: string): boolean {
    const a = abilityOf(this.setting, id);
    if (this.knows(id) || !a || a.item) return false;
    this.learned.add(id);
    // A spell opens its school (at its first rank) if nothing opened it before.
    if (a.skill && !this.opened(a.skill)) this.openSkill(a.skill);
    this.bar = addToBar(this.bar, id);
    return true;
  }

  /** A skill opened at its first rank (a trainer, a spell learned); a school of magic fills the mana with it. */
  openSkill(id: string): void {
    this.ranks.set(id, 0);
    if (this.isMagic(id)) this.mana = this.maxMana;
  }

  /** A learned ability forgotten (the debug menu): off the bar too. */
  forget(id: string): boolean {
    if (!this.learned.delete(id)) return false;
    this.bar = this.bar.map((x) => (x === id ? null : x));
    return true;
  }

  /** Skills some guild teaches (they have ranks). */
  private rankedSkills(): string[] {
    const g = new Set((this.setting.guilds ?? []).flatMap((x) => x.skills));
    return this.setting.skills.map((s) => s.id).filter((id) => g.has(id));
  }

  private isMagic(id: string): boolean { return this.setting.skills.find((s) => s.id === id)?.group === 'magic'; }

  /** A ranked skill's rank for a new hero with no past: open to all at 0, else not opened. */
  private freshRank(id: string): number { return this.setting.skills.find((s) => s.id === id)?.open ? 0 : -1; }

  /** The rank whose span holds a skill level (an older save's skills open as far as they had come). */
  private rankFor(v: number): number {
    const r = this.setting.skillRanks ?? [];
    const i = r.findIndex((x) => x.upTo > v);
    return i < 0 ? r.length - 1 : i;
  }

  /** The rank opened in a skill (-1: not opened; null: no guild teaches it, it has no ranks). */
  rankOf(id: string): number | null {
    return this.ranks.get(id) ?? null;
  }

  /** How high use and lessons may raise a skill now (its rank's top; where it is, before it is opened). */
  capOf(id: string): number {
    const r = this.ranks.get(id);
    if (r === undefined) return 100;
    return r < 0 ? this.skills.get(id) ?? 0 : this.setting.skillRanks?.[r]?.upTo ?? 100;
  }

  /** A skill with what is worn added. */
  skill(id: string): number {
    let v = this.skills.get(id) ?? 0;
    for (const it of Object.values(this.worn)) v += it?.bonuses[id] ?? 0;
    return v;
  }

  /** Health grows with the skills that take blows. */
  get maxHealth(): number { return Math.round(55 + (this.base('armour') + this.base('shields')) * 0.35 + this.bestWeapon() * 0.25); }
  get maxStamina(): number { return Math.round(60 + (this.base('dodge') + this.bestWeapon()) * 0.3); }
  /** Mana grows with the schools of magic opened: 30, and the best one most (none opened: none). */
  get maxMana(): number {
    let best = -1, all = 0;
    for (const s of this.setting.skills) {
      if (s.group !== 'magic' || !this.opened(s.id)) continue;
      const v = this.base(s.id);
      best = Math.max(best, v);
      all += v;
    }
    return best < 0 ? 0 : Math.round(30 + best * 0.6 + all * 0.2);
  }

  /** A skill the hero may use: opened by a trainer or the past, or open to all where no guild teaches it. */
  opened(id: string): boolean {
    const r = this.ranks.get(id);
    return r === undefined ? !!this.setting.skills.find((s) => s.id === id)?.open : r >= 0;
  }

  get alive(): boolean { return this.health > 0; }

  private base(id: string): number { return this.skills.get(id) ?? 0; }
  private bestWeapon(): number { return Math.max(...['blades', 'axes', 'maces', 'spears', 'unarmed'].map((s) => this.base(s))); }

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
    // Wearing it well: the armour skill makes it count for more.
    return a * (1 + this.skill('armour') / 150);
  }

  get blockChance(): number {
    const it = this.worn.off, b = it ? (defOf(this.cat, it.def).block ?? 0) * strengthOf(it) : 0;
    return b ? Math.min(0.6, b * (1 + this.skill('shields') / 80)) : 0;
  }

  /** The blow a weapon ability's `blow` step throws now. */
  blow(step?: { readonly power: number; readonly aim?: number }): Blow {
    const w = this.weapon;
    return { damage: w.damage, kind: w.kind, skill: this.skill(w.skill), power: step?.power ?? 1, aim: step?.aim ?? 0 };
  }

  guard(open = false): Guard {
    return { defence: this.skill('dodge'), armour: this.armour, block: this.blockChance, open };
  }

  /**
   * Power, on the creatures' danger scale (a fresh hero is about 10): skills plus gear. The VGM reads it
   * wherever it needs a level; the world itself is never scaled to it (D29).
   */
  get power(): number {
    const w = this.weapon, avg = (w.damage[0] + w.damage[1]) / 2;
    const skill = (this.skill(w.skill) + this.skill('dodge') + this.skill('armour') * 0.5 + (this.worn.off ? this.skill('shields') * 0.5 : 0)) / 5;
    return Math.round((skill + avg * (1 + this.skill(w.skill) / 220) / w.time * 2.2 + this.armour * 0.9 + this.blockChance * 8 + (this.maxHealth - 55) * 0.08) * 10) / 10;
  }

  /**
   * A skill was used against something of `challenge` (a foe's danger, or a skill level for a task).
   * Use raises it, more slowly the higher it is and hardly at all against what is far too easy (D30).
   */
  practise(id: string, challenge: number, amount = 1): SkillUp | null {
    const def = this.setting.skills.find((s) => s.id === id);
    const v = this.skills.get(id);
    const cap = this.capOf(id);
    if (!def || v === undefined || v >= cap) return null;
    const fit = Math.min(1.6, Math.max(0.05, challenge / Math.max(4, v * 0.45)));
    const gain = (0.16 * def.rate * fit * amount) / (1 + v / 18);
    const next = Math.min(cap, v + gain);
    this.skills.set(id, next);
    return Math.floor(next) > Math.floor(v) ? { skill: id, name: def.name, level: Math.floor(next) } : null;
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
    this.learn(d.teaches);
    return null;
  }

  /** The best healing in the pack (a potion first), for the quick slot. */
  get remedy(): Item | null {
    const heals = this.pack.filter((i) => defOf(this.cat, i.def).kind === 'potion');
    return heals.sort((a, b) => (defOf(this.cat, a.def).heal ?? 0) - (defOf(this.cat, b.def).heal ?? 0))[0] ?? null;
  }

  /** Breathe: stamina comes back fast; health only out of a fight, and faster when resting (`still` s). */
  recover(dt: number, fighting: boolean, still = 0): void {
    this.stamina = Math.min(this.maxStamina, this.stamina + dt * (fighting ? 4 : 12));
    this.mana = Math.min(this.maxMana, this.mana + dt * (fighting ? 0.5 : 2));
    if (!fighting && this.alive) this.health = Math.min(this.maxHealth, this.health + dt * (still > 4 ? 1.2 : 0.3));
  }

  get carried(): number {
    let w = 0;
    for (const it of [...this.pack, ...Object.values(this.worn)]) w += it ? defOf(this.cat, it.def).weight : 0;
    return w;
  }

  save(): CharacterSave {
    return { skills: Object.fromEntries(this.skills), health: this.health, stamina: this.stamina, mana: this.mana, worn: { ...this.worn }, pack: [...this.pack], coins: this.coins, background: this.background, ...(this.lodging ? { lodging: this.lodging } : {}), ...(this.ranks.size ? { ranks: Object.fromEntries(this.ranks) } : {}), learned: [...this.learned], bar: [...this.bar] };
  }
}
