/**
 * The fight's HUD (plan 17.1, D45): health, stamina and mana vials, the target plate with its threat ward, the
 * cards of what was found and what can be searched near by (the abilities are on the action bar,
 * actionBarUi.ts). Plain DOM in warded brass (hud.css); it reads the fight each frame and is told of the moments
 * (a hit, a heal, a find) to animate them.
 */
import './hud.css';
import type { SettingModule } from '../setting/contract';
import type { Threat } from '../sim/combat';
import type { Creature } from '../sim/creatures';
import type { Character } from '../game/character';
import type { Fight } from '../game/fight';
import type { Loot } from '../game/items';
import { coinText } from '../game/items';
import { keyLabel, type Bindings } from '../input/controls';
import { cap } from '../talk/townTalk';
import { levelOfDanger } from '../game/growth';
import { foeGroup } from '../game/foeGroup';
import { healthCss } from '../sim/aura';
import { el } from './dom';
import { itemCard, plainCard } from './itemCard';
import { replay } from './ward';

const THREAT: Record<Threat, string> = { trivial: '#9c9a94', easy: '#6fdc7a', even: '#f2d65c', hard: '#ff9a3c', deadly: '#ff4a3a' };
const THREAT_WORD: Record<Threat, string> = { trivial: 'no match for you', easy: 'weaker than you', even: 'a fair fight', hard: 'stronger than you', deadly: 'far beyond you' };
const STATE: Partial<Record<Creature['state'], string>> = { alert: 'wary', fight: 'fighting', flee: 'fleeing', beg: 'begging', meek: 'cowed', dead: 'dead' };

/** How long (ms) the gauges stay shown after a level gained out of a fight, its seal engraved. */
const CHEER_SHOWN = 4500;

export class FightHud {
  private readonly root = el('div', { id: 'fight', className: 'hidden' });
  private readonly vials: Record<'health' | 'stamina' | 'mana', { box: HTMLElement; liquid: HTMLElement; text: HTMLElement; was: number }>;
  private readonly target = el('div', { className: 'target plate' });
  private readonly tName = el('div', { className: 'name' });
  private readonly tState = el('div', { className: 'state' });
  /** The foe's level (D58): the level whose even fight it is. */
  private readonly tLevel = el('div', { className: 'lvl' });
  /** The hero's level engraved on a brass seal by the vials (D58; the way to the next is the action bar's experience rule). */
  private readonly seal = el('div', { className: 'seal' });
  private shownLevel = 0;
  private readonly prompt = el('div', { className: 'prompt plate' });
  private readonly finds = el('div', { className: 'finds' });
  private readonly hurtEdge = el('div', { className: 'hurt' });
  private readonly dark = el('div', { className: 'dark' });
  private shownFor: Creature | null = null;
  /** The group panel: a row for each foe of the fight, with its health and its distance; a click on a row targets it. */
  private readonly group = el('div', { className: 'foes plate' });
  private readonly rows = new Map<number, { row: HTMLElement; bar: HTMLElement; dist: HTMLElement; who: Creature }>();
  private readonly more = el('div', { className: 'more' });
  /** The fight the panel's clicks go to (the one followed last). */
  private fight: Fight | null = null;
  private searchShown: string | null = null;

  constructor(private readonly setting: SettingModule, private readonly bindings: () => Bindings) {
    const vial = (kind: 'health' | 'stamina' | 'mana') => {
      const liquid = el('div', { className: 'liquid' }), text = el('div', { className: 'text' });
      const box = el('div', { className: `vial ${kind}` }, liquid, text);
      return { box, liquid, text, was: -1 };
    };
    this.vials = { health: vial('health'), stamina: vial('stamina'), mana: vial('mana') };
    this.target.append(el('div', { className: 'ward' }), this.tLevel, this.tName, this.tState);
    const level = el('div', { className: 'level' }, this.seal);
    this.root.append(this.hurtEdge, el('div', { className: 'gauges plate' }, level, this.vials.health.box, this.vials.stamina.box, this.vials.mana.box), this.target, this.group, this.prompt, this.finds, this.dark);
    this.group.append(this.more);
    this.group.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('.foe');
      for (const r of this.rows.values()) if (r.row === row) { this.fight?.pick(r.who); return; }
    });
    document.body.append(this.root);
  }

  /** Shown (a fight, a wound; and for a while after a level gained, so its seal is seen engraved: G3). */
  set shown(on: boolean) { this.root.classList.toggle('hidden', !on && performance.now() >= this.cheerUntil); }
  /** Until when (ms) a level gained keeps the gauges shown. */
  private cheerUntil = 0;

  /** Every frame without a fight: only the gauges (no target, nothing to search). */
  calm(hero: Character): void {
    this.levelOf(hero);
    this.vial('health', hero.health, hero.maxHealth);
    this.vial('stamina', hero.stamina, hero.maxStamina);
    this.vial('mana', hero.mana, hero.maxMana);
    if (this.shownFor) { this.shownFor = null; this.target.classList.remove('shown'); }
    this.group.classList.remove('shown');
    this.prompt.classList.remove('shown');
  }

  /** Every frame: the gauges, the target. */
  follow(fight: Fight, hero: Character, search: string | null, at: { readonly x: number; readonly y: number; readonly z: number }): void {
    this.fight = fight;
    this.levelOf(hero);
    this.vial('health', hero.health, hero.maxHealth);
    this.vial('stamina', hero.stamina, hero.maxStamina);
    this.vial('mana', hero.mana, hero.maxMana);
    const t = fight.target;
    if (t !== this.shownFor) {
      this.shownFor = t;
      this.target.classList.remove('shown');
      if (t) {
        replay(this.target, 'shown');
        this.tName.textContent = cap(t.def.name);
        this.tLevel.textContent = String(levelOfDanger(this.setting.growth, t.def.danger));
      }
    }
    if (t) {
      const { threat, together } = fight.threat(t);
      if (this.target.style.getPropertyValue('--threat') !== THREAT[threat]) this.target.style.setProperty('--threat', THREAT[threat]);
      // Several at once: the ward and the words are for all of them ("the pack" when it hunts as one).
      const who = together ? (t.def.pack ? 'the pack: ' : 'together: ') : '';
      const state = [STATE[t.state], who + THREAT_WORD[threat]].filter(Boolean).join(' · ');
      if (this.tState.textContent !== state) this.tState.textContent = state;
    }
    this.foes(fight, at);
    this.prompt.classList.toggle('shown', !!search);
    if (search && search !== this.searchShown) this.prompt.replaceChildren(el('b', {}, keyLabel(this.bindings().search[0])), ` ${search}`);
    this.searchShown = search;
  }

  /** The group panel: shown while two or more foes are in the fight (one is the target plate's), a row for each. */
  private foes(fight: Fight, at: { readonly x: number; readonly y: number; readonly z: number }): void {
    const g = foeGroup(fight.den.fighting, fight.target, at);
    this.group.classList.toggle('shown', g.rows.length > 1);
    const live = new Set<number>();
    for (const r of g.rows) {
      const id = r.creature.id;
      live.add(id);
      let row = this.rows.get(id);
      if (!row) {
        const bar = el('div', { className: 'fill' }), dist = el('div', { className: 'dist' });
        const box = el('div', { className: 'foe' }, el('div', { className: 'name' }, cap(r.creature.def.name)), dist, el('div', { className: 'bar' }, bar));
        row = { row: box, bar, dist, who: r.creature };
        this.rows.set(id, row);
        this.group.insertBefore(box, this.more);
      }
      row.row.classList.toggle('aimed', r.target);
      const w = `${(r.frac * 100).toFixed(0)}%`;
      if (row.bar.style.width !== w) { row.bar.style.width = w; row.bar.style.background = healthCss(r.frac); }
      const d = `${Math.round(r.dist)} m`;
      if (row.dist.textContent !== d) row.dist.textContent = d;
    }
    for (const [id, row] of this.rows) if (!live.has(id)) { row.row.remove(); this.rows.delete(id); }
    const more = g.more ? `+${g.more} more` : '';
    if (this.more.textContent !== more) this.more.textContent = more;
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

  /** The hero's level on its seal (only when it changed). */
  private levelOf(hero: Character): void {
    const l = hero.level;
    if (l !== this.shownLevel) {
      // A level gained (not the first showing): the new number is engraved into the seal as the ring rises (G3).
      if (this.shownLevel > 0 && l > this.shownLevel) { this.seal.classList.remove('engrave'); void this.seal.offsetWidth; this.seal.classList.add('engrave'); this.cheerUntil = performance.now() + CHEER_SHOWN; this.shown = true; }
      this.seal.textContent = String(l);
      this.shownLevel = l;
    }
  }

  /** A gauge; mana only once the hero has any (a school of magic opened). */
  private vial(k: 'health' | 'stamina' | 'mana', v: number, max: number): void {
    const g = this.vials[k];
    g.box.classList.toggle('hidden', max <= 0);
    const f = Math.max(0, v / Math.max(1, max));
    // Only what changed: the HUD is read every frame, and every write costs a style pass.
    const text = `${Math.ceil(v)} / ${max}`;
    if (Math.abs(f - g.was) > 0.002) { g.liquid.style.width = `${(f * 100).toFixed(1)}%`; g.was = f; }
    if (g.text.textContent !== text) g.text.textContent = text;
    g.box.classList.toggle('low', f < 0.3);
  }
}
