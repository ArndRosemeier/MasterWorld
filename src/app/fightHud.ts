/**
 * The fight's HUD (plan 17.1, D45): health and stamina vials, the belt of abilities with their cooldown
 * wards, the target plate with its threat ward, the cards of what was found and what can be searched
 * near by. Plain DOM in warded brass (hud.css); it reads the fight each frame and is told of the moments
 * (a hit, a heal, a find) to animate them.
 */
import './hud.css';
import type { AbilityDef, SettingModule } from '../setting/contract';
import type { Threat } from '../sim/combat';
import type { Creature } from '../sim/creatures';
import type { Character } from '../game/character';
import type { Fight } from '../game/fight';
import type { Loot } from '../game/items';
import { coinText } from '../game/items';
import { keyLabel, type Bindings } from '../input/controls';
import { cap } from '../talk/townTalk';
import { el } from './dom';
import { itemCard, plainCard } from './itemCard';
import { replay } from './ward';

const THREAT: Record<Threat, string> = { trivial: '#9c9a94', easy: '#6fdc7a', even: '#f2d65c', hard: '#ff9a3c', deadly: '#ff4a3a' };
const THREAT_WORD: Record<Threat, string> = { trivial: 'no match for you', easy: 'weaker than you', even: 'a fair fight', hard: 'stronger than you', deadly: 'far beyond you' };
const ICON: Record<string, string> = { strike: '⚔', heavy: '⚒', shove: '✋', breath: '❂', potion: '⚱' };
/** Which belt socket each ability sits in, and its key. */
const BELT = ['strike', 'heavy', 'shove', 'breath'] as const;
const STATE: Partial<Record<Creature['state'], string>> = { alert: 'wary', fight: 'fighting', flee: 'fleeing', beg: 'begging', meek: 'cowed', dead: 'dead' };

interface Socket { readonly el: HTMLElement; readonly ring: HTMLElement; readonly count: HTMLElement; was: number; done: string }

export class FightHud {
  private readonly root = el('div', { id: 'fight', className: 'hidden' });
  private readonly vials: Record<'health' | 'stamina', { box: HTMLElement; liquid: HTMLElement; text: HTMLElement; was: number }>;
  private readonly sockets = new Map<string, Socket>();
  private readonly target = el('div', { className: 'target plate' });
  private readonly tName = el('div', { className: 'name' });
  private readonly tState = el('div', { className: 'state' });
  private readonly tBar = el('div');
  private readonly prompt = el('div', { className: 'prompt plate' });
  private readonly finds = el('div', { className: 'finds' });
  private readonly hurtEdge = el('div', { className: 'hurt' });
  private readonly dark = el('div', { className: 'dark' });
  private shownFor: Creature | null = null;
  private searchShown: string | null = null;

  constructor(private readonly setting: SettingModule, private readonly bindings: () => Bindings) {
    const vial = (kind: 'health' | 'stamina') => {
      const liquid = el('div', { className: 'liquid' }), text = el('div', { className: 'text' });
      const box = el('div', { className: `vial ${kind}` }, liquid, text);
      return { box, liquid, text, was: -1 };
    };
    this.vials = { health: vial('health'), stamina: vial('stamina') };
    const belt = el('div', { className: 'belt' });
    for (const id of [...BELT, 'potion']) {
      const a = setting.abilities.find((x) => x.id === id);
      const ring = el('div', { className: 'ring' }), count = el('div', { className: 'count' });
      const s = el('div', { className: 'socket', title: a?.name ?? 'Potion' }, ring, el('span', {}, ICON[id] ?? '•'), el('div', { className: 'key' }), count, el('div', { className: 'tip' }, a?.name ?? 'Drink a potion'));
      belt.append(s);
      this.sockets.set(id, { el: s, ring, count, was: 0, done: '' });
    }
    this.target.append(el('div', { className: 'ward' }), this.tName, this.tState, el('div', { className: 'bar' }, this.tBar));
    this.root.append(this.hurtEdge, el('div', { className: 'gauges plate' }, this.vials.health.box, this.vials.stamina.box), belt, this.target, this.prompt, this.finds, this.dark);
    document.body.append(this.root);
    this.keys();
  }

  /** The keys on the sockets, from the bindings. */
  keys(): void {
    const b = this.bindings();
    const keyOf: Record<string, keyof Bindings> = { strike: 'strike', heavy: 'heavy', shove: 'shove', breath: 'breath', potion: 'potion' };
    for (const [id, s] of this.sockets) (s.el.querySelector('.key') as HTMLElement).textContent = keyLabel(b[keyOf[id]][0]);
  }

  set shown(on: boolean) { this.root.classList.toggle('hidden', !on); }

  /** Every frame without a fight: only the gauges (no target, nothing to search). */
  calm(hero: Character): void {
    this.vial('health', hero.health, hero.maxHealth);
    this.vial('stamina', hero.stamina, hero.maxStamina);
    if (this.shownFor) { this.shownFor = null; this.target.classList.remove('shown'); }
    this.prompt.classList.remove('shown');
  }

  /** Every frame: the gauges, the belt, the target. */
  show(fight: Fight, hero: Character, search: string | null): void {
    this.vial('health', hero.health, hero.maxHealth);
    this.vial('stamina', hero.stamina, hero.maxStamina);
    for (const id of BELT) {
      const a = this.setting.abilities.find((x) => x.id === id) as AbilityDef | undefined;
      const s = this.sockets.get(id)!;
      const left = fight.cooling(id), frac = a && a.cooldown > 0 ? 1 - left / a.cooldown : 1;
      const done = `${Math.round(frac * 360)}deg`;
      if (s.done !== done) { s.ring.style.setProperty('--done', done); s.done = done; }
      s.el.classList.toggle('cooling', left > 0 || (!!a && hero.stamina < a.stamina));
      s.el.classList.toggle('on', id === 'strike' && fight.attacking);
      if (s.was > 0 && left === 0) replay(s.el, 'ready');
      s.was = left;
    }
    const pots = hero.pack.filter((i) => this.setting.items.items.find((d) => d.id === i.def)?.kind === 'potion').length;
    const p = this.sockets.get('potion')!;
    if (p.count.textContent !== (pots ? String(pots) : '')) p.count.textContent = pots ? String(pots) : '';
    p.el.classList.toggle('cooling', pots === 0);
    const t = fight.target;
    if (t !== this.shownFor) {
      this.shownFor = t;
      this.target.classList.remove('shown');
      if (t) {
        replay(this.target, 'shown');
        this.tName.textContent = cap(t.def.name);
      }
    }
    if (t) {
      const { threat, together } = fight.threat(t);
      if (this.target.style.getPropertyValue('--threat') !== THREAT[threat]) this.target.style.setProperty('--threat', THREAT[threat]);
      // Several at once: the ward and the words are for all of them ("the pack" when it hunts as one).
      const who = together ? (t.def.pack ? 'the pack: ' : 'together: ') : '';
      const state = [STATE[t.state], who + THREAT_WORD[threat]].filter(Boolean).join(' · '), bar = `${Math.max(0, (t.health / t.def.health) * 100).toFixed(1)}%`;
      if (this.tState.textContent !== state) this.tState.textContent = state;
      if (this.tBar.style.width !== bar) this.tBar.style.width = bar;
    }
    this.prompt.classList.toggle('shown', !!search);
    if (search && search !== this.searchShown) this.prompt.replaceChildren(el('b', {}, keyLabel(this.bindings().search[0])), ` ${search}`);
    this.searchShown = search;
  }

  /** A blow of the hero's landed on the target (or missed). */
  struck(damage: number, outcome: string): void {
    const n = el('div', { className: `hit ${outcome}` }, outcome === 'miss' ? 'miss' : outcome === 'block' ? `${damage} blocked` : String(damage));
    this.target.append(n);
    setTimeout(() => n.remove(), 950);
  }

  /** The hero was hit: the vial sloshes, the edge flushes. */
  hurt(): void {
    replay(this.vials.health.box, 'slosh');
    this.hurtEdge.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.hurtEdge.classList.remove('on')));
  }

  healed(): void { replay(this.vials.health.box, 'bubble'); }

  /** What a search turned up, a card for each item and one for the coin. */
  showFinds(loot: Loot): void {
    const cards: HTMLElement[] = loot.items.map((i, k) => itemCard(i, this.setting, k * 0.15));
    if (loot.coins) cards.push(plainCard(coinText(loot.coins), cards.length * 0.15));
    if (!cards.length) cards.push(plainCard('Nothing worth taking.', 0));
    cards.forEach((c, k) => {
      this.finds.append(c);
      setTimeout(() => { c.classList.add('out'); setTimeout(() => c.remove(), 520); }, 5500 + k * 400);
    });
  }

  /** Fallen: the wards go dark; waking, they relight. */
  fallen(on: boolean, text = ''): void {
    this.root.classList.toggle('fallen', on);
    this.dark.textContent = text;
  }

  private vial(k: 'health' | 'stamina', v: number, max: number): void {
    const g = this.vials[k], f = Math.max(0, v / Math.max(1, max));
    // Only what changed: the HUD is read every frame, and every write costs a style pass.
    const text = `${Math.ceil(v)} / ${max}`;
    if (Math.abs(f - g.was) > 0.002) { g.liquid.style.width = `${(f * 100).toFixed(1)}%`; g.was = f; }
    if (g.text.textContent !== text) g.text.textContent = text;
    g.box.classList.toggle('low', f < 0.3);
  }
}
