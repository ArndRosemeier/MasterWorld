/**
 * The player model (plan 4.1, 4.3, C12): what this player seems to enjoy, from decayed evidence of what they
 * do (fights won, spells cast, people talked with, places come upon, trade and repairs), plus a plain history
 * of what they did (hints heard, leads taken). The Director leans on it: the needs a playstyle enjoys grow
 * faster (the setting's `styles` say how much), so the VGM's answers (C9) and situations (C10) come more
 * often of the kinds the player takes up. It never changes how dangerous a place is (D29). Pure; saved as
 * plain data.
 */
import type { DirectorDef } from '../setting/contract';
import type { Need } from './director';

/** The playstyles the model tells apart (plan 4.1; sneaking waits for stealth to exist). */
export const STYLES = ['explorer', 'fighter', 'socializer', 'crafter', 'mage'] as const;
export type Style = (typeof STYLES)[number];

/** What the player did, counted (the factual history). */
export interface PlayHistory {
  readonly hints: number;
  readonly leads: number;
  readonly fights: number;
  readonly casts: number;
}

export interface PlayerModelSave {
  readonly evidence: Readonly<Partial<Record<Style, number>>>;
  readonly history: PlayHistory;
}

/** The style a counted deed shows, and how much: a hint heard, a lead taken, a spell cast. */
const COUNTS: Partial<Record<keyof PlayHistory, readonly [Style, number]>> = { hints: ['socializer', 0.5], leads: ['explorer', 0.5], casts: ['mage', 0.4] };

/** Minutes of play over which old evidence halves: what the player does now counts most. */
const HALF = 20;
/** Evidence below this in all is too little to say anything: no lean yet. */
const SURE = 2;

export class PlayerModel {
  readonly evidence: Record<Style, number>;
  history: PlayHistory;

  constructor(private readonly def: DirectorDef, saved?: PlayerModelSave) {
    this.evidence = { explorer: 0, fighter: 0, socializer: 0, crafter: 0, mage: 0, ...(saved?.evidence ?? {}) };
    this.history = saved?.history ?? { hints: 0, leads: 0, fights: 0, casts: 0 };
  }

  /** The player did something of a style: `amount` 1 is a whole deed (a fight won, a place found). */
  note(style: Style, amount = 1): void {
    this.evidence[style] += amount;
  }

  /** Something for the history, and the evidence it is of a style (a fight's is the Director's: Challenge met). */
  count(what: keyof PlayHistory): void {
    this.history = { ...this.history, [what]: this.history[what] + 1 };
    const shows = COUNTS[what];
    if (shows) this.note(shows[0], shows[1]);
  }

  /** Time passes (real seconds of play): old evidence fades. */
  decay(dt: number): void {
    const k = Math.pow(0.5, dt / 60 / HALF);
    for (const s of STYLES) this.evidence[s] *= k;
  }

  /** Each style's share of the evidence (all 0 while there is too little to say). */
  get shares(): Record<Style, number> {
    const all = STYLES.reduce((t, s) => t + this.evidence[s], 0), out = {} as Record<Style, number>;
    for (const s of STYLES) out[s] = all >= SURE ? this.evidence[s] / all : 0;
    return out;
  }

  /** The style the player shows most, if the evidence says anything yet. */
  get style(): Style | null {
    const sh = this.shares;
    let best: Style | null = null;
    for (const s of STYLES) if (sh[s] > 0 && (!best || sh[s] > sh[best])) best = s;
    return best;
  }

  /** How much faster need `n` grows for this player: the styles' leans (the setting's), by their shares. 1: no lean. */
  lean(n: Need): number {
    const sh = this.shares;
    let out = 1;
    for (const s of STYLES) out += sh[s] * ((this.def.styles?.[s]?.[n] ?? 1) - 1);
    return out;
  }

  asSaved(): PlayerModelSave {
    return { evidence: { ...this.evidence }, history: this.history };
  }
}
