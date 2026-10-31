/**
 * Sleeping through a crossing (S4, plan 5.4): aboard the ship of a voyage, by a bunk in a cabin or below deck, the use
 * key (E) lies the hero down until she is about to come in. The screen goes dark as for a night at the inn while the
 * clock runs on; the ship sails on meanwhile and carries the hero, so they wake aboard her off the far harbour and
 * see her come in. Awake, the crossing is played aboard in full (no fade past it: rule 11).
 */
import { byBunk, type Decks } from '../world/deck';
import type { Voyage } from '../world/fleet';
import type { Player } from './player';
import { Sleep } from './sleep';

export interface BunkSleepHost {
  readonly player: Player;
  readonly decks: Decks;
  /** The voyages in the log: from which harbour town's ship. */
  voyages(): readonly { readonly from: string; readonly v: Voyage }[];
  hours(): number;
  setClock(hours: number): void;
}

/** The hero wakes this long before she comes in (game hours: some 40 s, to be on deck as she makes the harbour). */
const WAKE = 0.28;

export class BunkSleep {
  private readonly sleep = new Sleep();

  constructor(private readonly host: BunkSleepHost) {}

  /** The voyage the hero could sleep through now: aboard her ship, standing by a bunk, long enough before she comes in. */
  get offered(): Voyage | null {
    const P = this.host.player, on = this.host.decks.riderOn();
    if (!on || this.sleep.busy || P.puppet || P.offFoot || P.walker.mode !== 'ground') return null;
    const now = this.host.hours(), plan = this.host.decks.planOf(on.id);
    const o = this.host.voyages().find((x) => on.id.startsWith(`${x.from}/`) && x.v.at <= now && now < x.v.arrive - WAKE - 0.05);
    return o && plan && byBunk(plan, on.a, on.h, on.b) ? o.v : null;
  }

  /** The use key (E): to sleep until she is about to come in. Whether it was used. */
  use(): boolean {
    const v = this.offered;
    if (!v) return false;
    // The ship is put where she is then on the next frame, carrying the hero (the camera follows them).
    void this.sleep.through(() => this.host.setClock(v.arrive - WAKE), 'The sea goes by…');
    return true;
  }
}
