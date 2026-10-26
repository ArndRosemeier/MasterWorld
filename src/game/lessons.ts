/**
 * Lessons (plan 11.4, 11.5): townsfolk who teach a few skills for coin, as the setting's `trainers` say.
 * A lesson is one point of a skill and a few game hours. It costs more the higher the skill, and above
 * what the teacher knows (`upTo`) there is nothing more to learn from them. Prices are the teacher's,
 * never scaled to the hero's power (D29); skills still grow by use (D30), lessons only shorten the way.
 * Pure.
 */
import type { SettingModule, TrainerDef } from '../setting/contract';
import type { Person } from '../sim/people';
import type { Character } from './character';
import { keeperOf } from './trade';

/** What a townsperson teaches, if anything: their own trade's teaching, or by role (a market trader, the temple keeper). */
export function teacherOf(setting: SettingModule, p: Person): TrainerDef | null {
  return setting.trainers.find((t) => t.keeper === keeperOf(p)) ?? null;
}

/** Copper for the next point of a skill now at `level` (whole points). */
export function lessonPrice(t: TrainerDef, level: number): number {
  const l = Math.floor(level);
  return Math.round(t.price * (1 + l / 10) ** 2);
}

export interface Lesson {
  readonly skill: string;
  readonly name: string;
  /** The skill now (whole points, without what gear adds). */
  readonly level: number;
  /** Copper for the next point; null when the teacher has taught all they know of it. */
  readonly price: number | null;
}

/** The lessons a teacher offers this hero, in the teacher's order. */
export function lessonsFor(setting: SettingModule, t: TrainerDef, hero: Character): Lesson[] {
  return t.skills.map((id) => {
    const level = Math.floor(hero.skills.get(id) ?? 0);
    const name = setting.skills.find((s) => s.id === id)?.name ?? id;
    return { skill: id, name, level, price: level >= t.upTo ? null : lessonPrice(t, level) };
  });
}

/** Why a lesson did not happen (null: it did). */
export type LessonRefusal = 'coin' | 'taught-out' | 'not-taught' | null;

/** Take one lesson: the coin goes, the skill rises to its next whole point. */
export function takeLesson(hero: Character, t: TrainerDef, skill: string): LessonRefusal {
  if (!t.skills.includes(skill)) return 'not-taught';
  const v = hero.skills.get(skill) ?? 0;
  if (Math.floor(v) >= t.upTo) return 'taught-out';
  const price = lessonPrice(t, v);
  if (hero.coins < price) return 'coin';
  hero.coins -= price;
  hero.skills.set(skill, Math.floor(v) + 1);
  return null;
}
