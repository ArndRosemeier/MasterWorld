/**
 * The guide in town (vgm/guide.ts, plan D27): while the hero has nothing to follow, someone who has heard of
 * a promised place is sent over through the streets, says so in a note, and waits by the hero a while to be
 * talked to; their talk opens with why they came and their news glows. Walked away from, they give up and go
 * back to their day.
 */
import type { TalkDef } from '../setting/contract';
import type { Agent } from '../sim/townLife';
import type { Journal } from '../talk/journal';
import type { Township } from '../game/township';
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
  /** The town the hero is in (null: none: nobody comes over out on the land). */
  readonly town: Township | null;
  say(text: string): void;
}

/** Seconds between turns towards a hero who moved on, and how far they must have moved. */
const FOLLOW = { every: 2, moved: 4 };

export class Hails {
  private readonly guide = new Guide();
  /** Who is on the way over, from which town. */
  private coming: { a: Agent; town: Township } | null = null;
  private clock = 0;
  /** Sent before, by town (a fresh face each time while others know). */
  private readonly sent = new Map<Township, Set<number>>();

  constructor(private readonly words: TalkDef, private readonly journal: Journal, private readonly host: HailHost) {}

  /** `held`: a fight or below ground, nobody comes now either. */
  sendFor(dt: number, held = false): void {
    const leads = this.journal.open.filter((l) => l.id !== ARRIVAL).length;
    const h = this.host.heroAt, c = this.coming;
    if (c) {
      const a = c.a;
      // Talked to (their hail stays until the news is asked), gave up waiting, or a lead heard elsewhere.
      if (this.host.talkingTo === a) { this.coming = null; return; }
      if (!a.seek || leads > 0) { c.town.talk.beckon(a.person.id, false); this.coming = null; return; }
      if ((this.clock += dt) < FOLLOW.every) return;
      this.clock = 0;
      if (Math.hypot(a.seek.face.x - h.x, a.seek.face.z - h.z) > FOLLOW.moved) {
        const at = besideHero(a, h);
        c.town.life.seek(a, at.x, at.z, h, HAIL.wait);
      }
      return;
    }
    const town = this.host.town;
    if (!town || !this.guide.due(dt, { leads, busy: held || this.host.busy })) return;
    this.guide.hailed();
    const life = town.life, talk = town.talk;
    const knows = talk.knowersOf(this.host.open);
    let sent = this.sent.get(town);
    if (!sent) this.sent.set(town, (sent = new Set()));
    const id = hailer(life.agents.map((g) => ({
      id: g.person.id, x: g.x, z: g.z,
      asleep: g.act === 'sleep' || g.act === 'away',
      busy: !!g.held || !!g.seek || g.person.role === 'child',
    })), knows, h, sent);
    const b = id === null ? null : life.agentOf(id) ?? null;
    if (!b) return;
    sent.add(b.person.id);
    const at = besideHero(b, h);
    life.seek(b, at.x, at.z, h, HAIL.wait);
    talk.beckon(b.person.id, true);
    this.coming = { a: b, town };
    this.clock = 0;
    const comes = this.words.comes;
    if (comes.length) this.host.say(fill(comes[b.person.id % comes.length], { name: talk.nameOf(b.person.id) }));
  }
}
