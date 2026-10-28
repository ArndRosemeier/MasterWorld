/**
 * Lessons (plan 11.4, 11.5): townsfolk who teach a few skills for coin, as the setting's `trainers` say.
 * A lesson is one point of a skill and a few game hours. It costs more the higher the skill, and above
 * what the teacher knows (`upTo`) there is nothing more to learn from them. Prices are the teacher's,
 * never scaled to the hero's power (D29). Lessons are the only way a skill rises (D54). Pure.
 */
import { skillOf, type SettingModule, type TrainerDef } from '../setting/contract';
import type { Person } from '../sim/people';
import type { Character } from './character';
import { keeperOf } from './trade';

/** What a townsperson teaches, if anything: their own trade's teaching, by role, or their guild's (D49). */
export function teacherOf(setting: SettingModule, p: Person): TrainerDef | null {
  const k = keeperOf(p);
  return setting.trainers.find((t) => t.keeper === k) ?? setting.guilds?.find((g) => g.keeper === k) ?? null;
}

/**
 * How far this teacher's lessons take a skill now: their own knowledge, and in a skill with ranks (D49) the
 * top of the rank opened; nothing in a skill not opened yet.
 */
export function lessonTop(t: TrainerDef, hero: Character, skill: string): number {
  const r = hero.rankOf(skill);
  if (r === null) return t.upTo;
  return r < 0 ? 0 : Math.min(t.upTo, hero.capOf(skill));
}

/** Copper for the next point of a skill now at `level` (whole points). */
export function lessonPrice(t: TrainerDef, level: number): number {
  const l = Math.floor(level);
  return Math.round(t.price * (1 + l / 20) ** 2);
}

export interface Lesson {
  readonly skill: string;
  readonly name: string;
  /** The skill now (whole points, without what gear adds). */
  readonly level: number;
  /** Copper for the next point; null when the teacher has taught all they know of it. */
  readonly price: number | null;
  /** How far lessons go now (the rank's top, or the teacher's knowledge); 0: not opened. */
  readonly top: number;
}

/** The lessons a teacher offers this hero, in the teacher's order. */
export function lessonsFor(setting: SettingModule, t: TrainerDef, hero: Character): Lesson[] {
  return t.skills.map((id) => {
    const level = Math.floor(hero.skills.get(id) ?? 0);
    const name = skillOf(setting, id)?.name ?? id;
    const top = lessonTop(t, hero, id);
    return { skill: id, name, level, top, price: level >= top ? null : lessonPrice(t, level) };
  });
}

/** Why a lesson did not happen (null: it did). */
export type LessonRefusal = 'coin' | 'taught-out' | 'not-taught' | 'closed' | null;

/** Take one lesson: the coin goes, the skill rises to its next whole point. */
export function takeLesson(hero: Character, t: TrainerDef, skill: string): LessonRefusal {
  if (!t.skills.includes(skill)) return 'not-taught';
  const v = hero.skills.get(skill) ?? 0;
  if (hero.rankOf(skill) === -1) return 'closed';
  if (Math.floor(v) >= lessonTop(t, hero, skill)) return 'taught-out';
  const price = lessonPrice(t, v);
  if (hero.coins < price) return 'coin';
  hero.coins -= price;
  hero.skills.set(skill, Math.floor(v) + 1);
  return null;
}
