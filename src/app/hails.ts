/**
 * The guide in town (vgm/guide.ts, plan D27): while the hero has nothing to follow, someone who has heard of
 * a promised place is sent over through the streets, says so in a note, and waits by the hero a while to be
 * talked to; their talk opens with why they came and their news glows. Walked away from, they give up and go
 * back to their day.
 */
import type { TalkDef } from '../setting/contract';
import type { Agent, TownLife } from '../sim/townLife';
import type { Journal } from '../talk/journal';
import type { TownTalk } from '../talk/townTalk';
import { fill } from '../talk/folk';
import { ARRIVAL, Guide, HAIL, hailer, besideHero } from '../vgm/guide';

export interface HailHost {
  /** Where the hero stands. */
  readonly heroAt: { readonly x: number; readonly z: number };
  /** Nobody comes over now (talking, a dialog, a fight, below ground, flying, the title). */
  readonly busy: boolean;
  /** The promises still open (their ids). */
  readonly open: ReadonlySet<string>;
  /** Who the hero is talking with. */
  readonly talkingTo: Agent | null;
  say(text: string): void;
}

/** Seconds between turns towards a hero who moved on, and how far they must have moved. */
const FOLLOW = { every: 2, moved: 4 };

export class Hails {
  private readonly guide = new Guide();
  private coming: Agent | null = null;
  private clock = 0;
  /** Sent before (a fresh face each time while others know). */
  private readonly sent = new Set<number>();

  constructor(private readonly life: TownLife, private readonly talk: TownTalk, private readonly words: TalkDef, private readonly journal: Journal, private readonly host: HailHost) {}

  /** `held`: a fight or below ground, nobody comes now either. */
  sendFor(dt: number, held = false): void {
    const leads = this.journal.open.filter((l) => l.id !== ARRIVAL).length;
    const h = this.host.heroAt, a = this.coming;
    if (a) {
      // Talked to (their hail stays until the news is asked), gave up waiting, or a lead heard elsewhere.
      if (this.host.talkingTo === a) { this.coming = null; return; }
      if (!a.seek || leads > 0) { this.talk.beckon(a.person.id, false); this.coming = null; return; }
      if ((this.clock += dt) < FOLLOW.every) return;
      this.clock = 0;
      if (Math.hypot(a.seek.face.x - h.x, a.seek.face.z - h.z) > FOLLOW.moved) {
        const at = besideHero(a, h);
        this.life.seek(a, at.x, at.z, h, HAIL.wait);
      }
      return;
    }
    if (!this.guide.due(dt, { leads, busy: held || this.host.busy })) return;
    this.guide.hailed();
    const knows = this.talk.knowersOf(this.host.open);
    const id = hailer(this.life.agents.map((g) => ({
      id: g.person.id, x: g.x, z: g.z,
      asleep: g.act === 'sleep' || g.act === 'away',
      busy: !!g.held || !!g.seek || g.person.role === 'child',
    })), knows, h, this.sent);
    const b = id === null ? null : this.life.agents.find((g) => g.person.id === id) ?? null;
    if (!b) return;
    this.sent.add(b.person.id);
    const at = besideHero(b, h);
    this.life.seek(b, at.x, at.z, h, HAIL.wait);
    this.talk.beckon(b.person.id, true);
    this.coming = b;
    this.clock = 0;
    const comes = this.words.comes;
    if (comes.length) this.host.say(fill(comes[b.person.id % comes.length], { name: this.talk.nameOf(b.person.id) }));
  }
}
