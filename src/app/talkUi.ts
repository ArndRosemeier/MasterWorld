/**
 * Talking in the game (plan 9.1, 17): walk up to a townsperson and press the talk key (T). They stop and
 * turn to you; the dialogue window opens at the side so they stay in view. Pick a topic with the mouse or
 * its number key; Escape, the talk key or walking off ends it. What they tell of a promised cellar goes
 * into the journal, and the place onto the map. In warded brass (windows.css): a speaking-ring whose
 * topics turn into place like a dial, the ones with a new lead glowing.
 */
import { angleDiff } from '@futuremagic/core';
import type { TownPlan } from '@futuremagic/settlement';
import type { Bindings } from '../input/controls';
import { onKeyDown, swallow } from '../input/keys';
import type { TalkDef } from '../setting/contract';
import type { Agent, TownLife } from '../sim/townLife';
import type { Journal } from '../talk/journal';
import type { Reply, TownTalk, Topic } from '../talk/townTalk';
import { fill } from '../talk/folk';
import './windows.css';
import { button, el, overlay } from './dom';
import { stagger, wardRim } from './ward';
import type { Player } from './player';
import type { Township } from '../game/township';

/** How close (m) and how nearly in front someone must be to talk to them. */
const REACH = 3;
const FRONT = 1.0;
/** Walking this far off ends the talk. */
const LEAVE = 5;
/** Every this many frames a talk's shot is chosen again (the same while nothing changed). */
const REFRAME = 30;

export interface TalkHost {
  paused(open: boolean): void;
  /** Talk is off (down in the cellar, flying). */
  readonly away: boolean;
  /** The keys now. */
  readonly bindings: Bindings;
  /** A lead was opened: say it, and the journal and map show it (the hero hands the map over to be marked). */
  heard(lead: { id: string; title: string; note: string }): void;
  /** The hero asked about story event `id` and was told of it (by `from`): the journal and map take it up. */
  heardOf(event: string, from: string): void;
  /** A service was asked for (trade, a repair, a room): the talk has ended, open its window. */
  serve(service: string, agent: Agent): void;
  /** The hero tells `agent` the place of promise `id` is safe again: the game pays and keeps it; their answer. */
  report(id: string, agent: Agent): Reply;
  /** In a room: who is in it and where they stand there (their own x, z are out in the town); null outside. */
  readonly roomPeople: readonly { agent: Agent; x: number; z: number }[] | null;
}

export class TalkUi {
  private readonly prompt: HTMLElement;
  private readonly box: HTMLDivElement;
  private readonly who: HTMLDivElement;
  private readonly lines: HTMLDivElement;
  private readonly topicList: HTMLDivElement;
  private near: Agent | null = null;
  private with: Agent | null = null;
  private shown: Topic[] = [];
  /** Frames since the talk's shot was chosen. */
  private framed = 0;

  private at: Township;

  constructor(
    place: Township,
    private readonly words: TalkDef,
    private readonly journal: Journal,
    private readonly player: Player,
    private readonly host: TalkHost,
  ) {
    this.at = place;
    this.prompt = overlay('talk-prompt', '');
    this.who = el('div', { className: 'who' });
    this.lines = el('div', { className: 'lines' });
    this.topicList = el('div', { className: 'topics' });
    this.box = el('div', { className: 'talk', role: 'dialog' }, this.who, this.lines, this.topicList, wardRim({ sparks: 1, delay: 0.25 }));
    document.body.append(this.box);
    // Before the menu's Escape (registered first), so Escape ends a talk instead of opening the settings.
    onKeyDown((e) => this.onKey(e), true);
  }

  get open(): boolean { return this.with !== null; }

  /** The town talked in now; a new one (the hero came to another settlement) takes over once no talk is open. */
  get place(): Township { return this.at; }
  set place(p: Township) { if (!this.with) this.at = p; }
  private get talk(): TownTalk { return this.at.talk; }
  private get folk(): TownLife { return this.at.life; }
  private get plan(): TownPlan { return this.at.town.plan; }

  /** Who the hero is talking with now. */
  get partner(): Agent | null { return this.with; }

  /** Each frame: who is near enough to talk to, or whether the talk partner was walked away from. */
  watch(): void {
    if (this.with) {
      const w = this.player.walker.pos, at = this.whereIs(this.with);
      if (!at || Math.hypot(at.x - w.x, at.z - w.z) > LEAVE || this.host.away) { this.close(); return; }
      // Framed again now and then: someone walking up after the talk began may stand in the shot.
      if (++this.framed % REFRAME === 0) this.frame(this.with);
      return;
    }
    this.near = this.host.away ? null : this.inFront();
    const on = this.near !== null;
    this.prompt.classList.toggle('on', on);
    if (on) {
      const key = this.host.bindings.talk[0] || this.host.bindings.talk[1];
      this.prompt.replaceChildren(el('kbd', { textContent: key.replace(/^Key/, '') }), `Talk to ${this.talk.nameOf(this.near!.person.id)}`);
    }
  }

  /** The people about: in a room, those in it where they stand there; out of doors, everyone not indoors. */
  private about(): readonly { agent: Agent; x: number; z: number }[] {
    return this.host.roomPeople ?? this.folk.agents.filter((a) => !a.hidden).map((a) => ({ agent: a, x: a.x, z: a.z }));
  }

  /**
   * The grown-up in front of the hero within reach whom the hero faces most: near and straight ahead (two at one
   * table half a metre apart: the one the hero turns to, not always the nearer).
   */
  private inFront(): Agent | null {
    const w = this.player.walker;
    let best: Agent | null = null, bs = Infinity;
    for (const { agent: a, x, z } of this.about()) {
      if (a.person.role === 'child') continue;
      const dx = x - w.pos.x, dz = z - w.pos.z, d = Math.hypot(dx, dz);
      if (d >= REACH) continue;
      // The walker's yaw faces −z at 0 (walker.ts); the direction to them as the same kind of angle.
      const off = Math.abs(angleDiff(Math.atan2(-dx, -dz), w.yaw));
      if (off > FRONT) continue;
      const score = d * (1 + 2 * off);
      if (score < bs) { best = a; bs = score; }
    }
    return best;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    const talkKey = this.host.bindings.talk.includes(e.code);
    if (this.with) {
      if (e.code === 'Escape' || talkKey) { swallow(e); this.close(); return; }
      const n = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (n) { swallow(e); const t = this.shown[Number(n[1]) - 1]; if (t) this.pick(t); }
      return;
    }
    if (talkKey && this.near && !document.querySelector('.shade.open')) { e.preventDefault(); this.begin(this.near); }
  }

  /** Where `a` stands now: in the room the hero is in, or out in the town (null: not in this room). */
  private whereIs(a: Agent): { x: number; z: number } | null {
    const room = this.host.roomPeople;
    return room ? room.find((p) => p.agent === a) ?? null : a;
  }

  /** Start talking with someone (the talk key, or `?talk`). */
  begin(a: Agent): void {
    this.with = a;
    const w = this.player.walker.pos;
    this.folk.hold(a, w.x, w.z);
    this.prompt.classList.remove('on');
    this.who.textContent = this.talk.nameOf(a.person.id);
    this.lines.replaceChildren();
    this.box.classList.add('open');
    this.host.paused(true);
    this.frame(a);
    this.speak(this.talk.greet(a.person.id).text);
    this.offer();
  }

  /** The talk's view again (after a scene played in it, the map's hand-over). */
  reframe(): void { if (this.partner) this.frame(this.partner); }

  /** The talk's view of `a`, past the others about. */
  private frame(a: Agent): void {
    const at = this.whereIs(a);
    if (at) this.player.frameTalk(true, at.x, at.z, this.about().filter((o) => o.agent !== a));
  }

  /** Pick a topic by id, if it is offered now. */
  choose(id: string): void {
    const t = this.shown.find((x) => x.id === id);
    if (t) this.pick(t);
  }

  private pick(t: Topic): void {
    const a = this.with;
    if (!a) return;
    this.lines.append(el('p', { className: 'you', textContent: t.label }));
    const r = t.id.startsWith('report:') ? this.host.report(t.id.slice(7), a) : this.talk.ask(a.person.id, t.id);
    this.speak(r.text);
    const from = this.talk.nameOf(a.person.id);
    if (t.id.startsWith('event:')) this.host.heardOf(t.id.slice(6), from);
    for (const id of r.heard) {
      const b = this.plan.buildings[this.talk.houseOf(id)];
      const title = fill(this.words.lead, { cellar: this.talk.cellarCalled(id) });
      const at = this.talk.siteOf(id) ?? { x: b.door[0], z: b.door[1] };
      const lead = this.journal.hear(id, title, { text: r.text, from }, { x: at.x, z: at.z, label: this.talk.houseCalled(id) });
      if (!lead) continue;
      // The map is handed over in the world (app/handOverScene.ts), not told in the talk.
      this.host.heard({ id, title, note: fill(this.words.marked, { name: from, house: this.talk.houseCalled(id) }) });
    }
    if (r.opens) { const id = r.opens; this.topicList.replaceChildren(); setTimeout(() => { this.close(); this.host.serve(id, a); }, 600); return; }
    if (r.done) { setTimeout(() => this.close(), 900); this.topicList.replaceChildren(); return; }
    this.offer();
  }

  private speak(text: string): void {
    this.lines.append(el('p', { textContent: text }));
    this.lines.scrollTop = this.lines.scrollHeight;
  }

  private offer(): void {
    const a = this.with;
    if (!a) return;
    this.shown = this.talk.topics(a.person.id);
    this.topicList.replaceChildren(...this.shown.map((t, i) =>
      button(el('kbd', { textContent: String(i + 1) }), () => this.pick(t), { className: t.lead ? 'lead' : '' }, t.label)));
    stagger(this.topicList.children, 0.05, 0.07);
  }

  close(): void {
    const a = this.with;
    if (!a) return;
    this.with = null;
    this.folk.letGo(a);
    this.box.classList.remove('open');
    this.player.frameTalk(false);
    this.host.paused(false);
  }
}
