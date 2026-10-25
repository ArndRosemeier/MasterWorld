/**
 * The hero as numbers (plan 11.4, 11.5, D29, D30): skills that grow by use (no classes, no XP), health
 * and stamina that grow with the skills that use them, what is worn and carried, and the one "power"
 * number the VGM reads wherever it needs a level. Pure: saved as plain data.
 */
import type { AbilityDef, DamageKind, ItemCatalog, SettingModule, Slot } from '../setting/contract';
import type { Blow, Guard } from '../sim/combat';
import { defOf, plainItem, type Item } from './items';

export interface CharacterSave {
  readonly skills: Readonly<Record<string, number>>;
  readonly health: number;
  readonly stamina: number;
  readonly worn: Partial<Record<Slot | 'ring2', Item>>;
  readonly pack: readonly Item[];
  readonly coins: number;
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
  health: number;
  stamina: number;
  readonly worn: Partial<Record<Slot | 'ring2', Item>> = {};
  readonly pack: Item[] = [];
  coins = 0;
  private readonly cat: ItemCatalog;

  constructor(private readonly setting: SettingModule, saved?: CharacterSave) {
    this.cat = setting.items;
    for (const s of setting.skills) this.skills.set(s.id, saved?.skills[s.id] ?? s.start);
    if (saved) {
      Object.assign(this.worn, saved.worn);
      this.pack.push(...saved.pack);
      this.coins = saved.coins;
    } else {
      // The starting kit (a background will choose it later, plan 11.4).
      const p = (id: string) => plainItem(this.cat, id);
      this.worn.main = p('short-sword');
      this.worn.body = p('padded-jack');
      this.worn.feet = p('boots');
      this.pack.push(p('minor-potion'), p('minor-potion'), p('bread'), p('torch'));
      this.coins = 24;
    }
    this.health = Math.min(saved?.health ?? Infinity, this.maxHealth);
    this.stamina = Math.min(saved?.stamina ?? Infinity, this.maxStamina);
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
  get alive(): boolean { return this.health > 0; }

  private base(id: string): number { return this.skills.get(id) ?? 0; }
  private bestWeapon(): number { return Math.max(...['blades', 'axes', 'maces', 'spears', 'unarmed'].map((s) => this.base(s))); }

  /** What the main hand swings. */
  get weapon(): WeaponStats {
    const it = this.worn.main;
    return (it && defOf(this.cat, it.def).weapon) || FISTS;
  }

  get armour(): number {
    let a = 0;
    for (const it of Object.values(this.worn)) a += it ? defOf(this.cat, it.def).armour ?? 0 : 0;
    // Wearing it well: the armour skill makes it count for more.
    return a * (1 + this.skill('armour') / 150);
  }

  get blockChance(): number {
    const it = this.worn.off, b = it ? defOf(this.cat, it.def).block ?? 0 : 0;
    return b ? Math.min(0.6, b * (1 + this.skill('shields') / 80)) : 0;
  }

  /** The blow an ability throws now. */
  blow(ability?: AbilityDef): Blow {
    const w = this.weapon;
    return { damage: w.damage, kind: w.kind, skill: this.skill(w.skill), power: ability?.power ?? 1, aim: ability?.aim ?? 0 };
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
    if (!def || v === undefined || v >= 100) return null;
    const fit = Math.min(1.6, Math.max(0.05, challenge / Math.max(4, v * 0.45)));
    const gain = (0.16 * def.rate * fit * amount) / (1 + v / 18);
    const next = Math.min(100, v + gain);
    this.skills.set(id, next);
    return Math.floor(next) > Math.floor(v) ? { skill: id, name: def.name, level: Math.floor(next) } : null;
  }

  /** Put an item from the pack on; what was there goes into the pack. */
  equip(item: Item): void {
    const d = defOf(this.cat, item.def);
    if (!d.slot) return;
    const slot: Slot | 'ring2' = d.slot === 'ring' && this.worn.ring ? 'ring2' : d.slot;
    const i = this.pack.indexOf(item);
    if (i >= 0) this.pack.splice(i, 1);
    const old = this.worn[slot];
    if (old) this.pack.push(old);
    this.worn[slot] = item;
    this.health = Math.min(this.health, this.maxHealth);
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

  /** The best healing in the pack (a potion first), for the quick slot. */
  get remedy(): Item | null {
    const heals = this.pack.filter((i) => defOf(this.cat, i.def).kind === 'potion');
    return heals.sort((a, b) => (defOf(this.cat, a.def).heal ?? 0) - (defOf(this.cat, b.def).heal ?? 0))[0] ?? null;
  }

  /** Breathe: stamina comes back fast; health only out of a fight, and faster when resting (`still` s). */
  recover(dt: number, fighting: boolean, still = 0): void {
    this.stamina = Math.min(this.maxStamina, this.stamina + dt * (fighting ? 4 : 12));
    if (!fighting && this.alive) this.health = Math.min(this.maxHealth, this.health + dt * (still > 4 ? 1.2 : 0.3));
  }

  get carried(): number {
    let w = 0;
    for (const it of [...this.pack, ...Object.values(this.worn)]) w += it ? defOf(this.cat, it.def).weight : 0;
    return w;
  }

  save(): CharacterSave {
    return { skills: Object.fromEntries(this.skills), health: this.health, stamina: this.stamina, worn: { ...this.worn }, pack: [...this.pack], coins: this.coins };
  }
}
