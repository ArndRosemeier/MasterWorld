/**
 * The town fights back (D65, R6): every living town has a `TownFight` (sim/townFight.ts), stepped each frame with the dens of the
 * wild near it. When raiders come in, the watch and the able folk are called out (a cry over the first watchman's head), the rest
 * run indoors, and the town's fighters are bodies of a den of their own, which the encounters take for their neighbour so the
 * raiders see and fight them. Nobody of the town dies of it.
 */
import type { Quarry, Den } from '../sim/creatures';
import type { Land } from '../sim/wild';
import { TownFight } from '../sim/townFight';
import type { SettingModule } from '../setting/contract';
import type { Township } from '../game/township';
import { deriveSeed } from '@futuremagic/core';

export interface TownDefenceHost {
  readonly setting: Pick<SettingModule, 'creatures' | 'factions' | 'routines'>;
  readonly seed: number;
  /** The land the fight is on (the wild's own). */
  readonly land: Land;
  /** Every den of the wild now built (the raiders are among them). */
  dens(): readonly Den[];
  /** A cry over someone's head (the first watchman's). */
  say(text: string, over: () => { x: number; y: number; z: number } | null): void;
  /** The hero as the dens read them (the fight is at peace with them). */
  hero(): Quarry;
}

/** What the watch calls out. */
const CRIES = ['To arms! Raiders in the street!', 'The watch! To me!', 'Out with them! Out!'];

export class TownDefence {
  private readonly fights = new Map<string, TownFight>();

  constructor(private readonly h: TownDefenceHost) {}

  /** Every fighter's den now (the encounters take them for neighbours). */
  get dens(): Den[] {
    const out: Den[] = [];
    for (const f of this.fights.values()) if (f.den) out.push(f.den);
    return out;
  }

  /** One frame for each of the living towns. */
  guard(dt: number, living: readonly Township[]): void {
    const dens = this.h.dens();
    if (!dens.length) return;
    for (const t of living) {
      let f = this.fights.get(t.id);
      if (!f) {
        const d = t.town.decision;
        this.fights.set(t.id, (f = new TownFight(t.life, { x: d.x, z: d.z, radius: d.radius }, this.h.setting, this.h.land, deriveSeed(this.h.seed, 'townFight', d.x, d.z))));
      }
      for (const e of f.raidStep(dt, dens, this.h.hero())) {
        if (e.kind !== 'muster') continue;
        const crier = e.watch[0] ?? e.able[0];
        if (crier) this.h.say(CRIES[Math.abs(Math.round(crier.x + crier.z)) % CRIES.length], () => (crier.hidden ? null : { x: crier.x, y: this.h.land.height(crier.x, crier.z) + 1.9, z: crier.z }));
      }
    }
  }
}
