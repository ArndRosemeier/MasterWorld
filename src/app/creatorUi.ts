/**
 * Character creation (plan 11.4, 17): after New game the dive lands on the market square, the camera turns to
 * face the hero and the tailor's glass opens beside them: Actors' character creator (narrowed to what fits
 * the setting, D30) in warded brass (17.1). Its signature: the glass unfolds like a screen of two leaves, the
 * ward traces its rim, the tabs drop in one by one; at rest a spark runs the rim and the turntable's gear
 * ticks. Dragging the view turns the hero, the wheel steps closer or back. Begin hands the hero to the game.
 */
import { CharacterEditor, randomConfig, type Character, type CharacterConfig } from '@actors/generator';
import { Vector3, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
import { Rng, deriveSeed, lerp } from '@futuremagic/core';
import type { BackgroundDef, NamesDef } from '../setting/contract';
import type { People } from './title/lines';
import type { HeroLooks, HeroView } from '../render/hero/HeroView';
import { button, el, svg } from './dom';
import { gearIcon, rimSvg } from './title/art';
import './creator.css';

/** What the creator needs of the game. */
export interface CreatorHost {
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLElement;
  readonly renderer: WebGPURenderer;
  readonly hero: HeroView;
  readonly looks: HeroLooks;
  /** Where the hero stands (feet) and which way they face (the walker's yaw), turned by the turntable. */
  readonly body: { pos: { x: number; y: number; z: number }; yaw: number };
  /** A name for a hero of `race` (from the setting's names). */
  nameFor(race: string, female: boolean, n: number): string;
  /** The pasts to choose from (the setting's backgrounds), the first chosen at first. */
  readonly backgrounds: readonly BackgroundDef[];
  /** A skill's and an item's name. */
  skillName(id: string): string;
  itemName(id: string): string;
  /** Who in town would know a hero with this past ("Borin Ironfoot, the smith"). */
  knownBy(bg: BackgroundDef): string[];
  /** A soft click for the brass (sound). */
  click?(): void;
}

/** The hero as made: a name, Actors' look and a past (a background id). */
export interface MadeHero {
  readonly name: string;
  readonly look: CharacterConfig;
  readonly background: string;
}

/** The title's peoples card, by Actors' race id. */
export const PEOPLE_RACE: Readonly<Record<People['id'], string>> = { humans: 'human', dwarves: 'dwarf', halflings: 'halfling', elves: 'elf' };

/** A given name and a family name from a people's names, drawn from `n`. */
export function heroNameFor(names: NamesDef, female: boolean, n: number): string {
  const r = new Rng(deriveSeed(n, 'hero', 'name'));
  return `${r.pick(female ? names.female : names.male)} ${r.pick(names.family)}`;
}

/** Seconds the camera takes to turn from behind the hero to their front. */
const TURN = 1.4;

/** The creator's tabs: Actors' editor sections, then the hero's past. */
const TABS = [['race', 'People'], ['body', 'Body'], ['look', 'Face & hair'], ['outfit', 'Clothes'], ['past', 'Past']] as const;
/** The tabs that are Actors' editor sections. */
const SECTIONS = TABS.map(([id]) => id).filter((id) => id !== 'past');

export class Creator {
  private readonly root: HTMLElement;
  private readonly name: HTMLInputElement;
  private model: Character | null = null;
  private editor: CharacterEditor | null = null;
  private stop: (() => void) | null = null;
  private done: ((h: MadeHero) => void) | null = null;
  /** Camera: which way it looks from (fixed while open) and how close (1 = whole body). */
  private camYaw = 0;
  private zoom = 1;
  private zoomShown = 1;
  private named = false;
  private past = '';
  private rolls = 0;
  private readonly drag = { on: false, x: 0 };
  /** The camera as the creator found it, and how far it has come round (0..1). */
  private readonly from = { at: new Vector3(), t: 0 };

  constructor(private readonly host: CreatorHost, private readonly seed: number) {
    this.name = el('input', { type: 'text', maxLength: 28, spellcheck: false, ariaLabel: 'Name' });
    this.name.addEventListener('input', () => { this.named = true; });
    this.root = el('div', { className: 'creator', role: 'dialog', ariaLabel: 'Your hero' });
    document.body.append(this.root);
  }

  /** Opens the glass and resolves with the hero once Begin is pressed. `race` comes from the title's peoples card. */
  async open(race: string | null): Promise<MadeHero> {
    const { hero, renderer, looks } = this.host;
    const model = (this.model = await hero.model(renderer, looks));
    if (race && race !== model.config.race && model.catalog.races.some((r) => r.id === race)) {
      await model.set(randomConfig(model.catalog, model.config, { random: this.random(), race: race as never, outfit: false }));
      void hero.dress(model.config);
    }
    this.stop = model.onChange((c) => {
      void hero.dress(c);
      if (!this.named) this.name.value = this.defaultName(c);
    });
    this.name.value = this.defaultName(model.config);
    this.furnish(model);
    this.camYaw = this.host.body.yaw;
    this.from.at.copy(this.host.camera.position);
    this.from.t = 0;
    this.root.classList.add('open');
    this.listen(true);
    return new Promise((resolve) => { this.done = resolve; });
  }

  get showing(): boolean { return this.root.classList.contains('open'); }

  /**
   * Each frame while open: the camera in front of the hero, the hero to the left of the glass. On opening it
   * comes round the hero from behind (where the dive ended), eased.
   */
  orbit(dt: number): void {
    if (!this.showing) return;
    const { camera, body, hero } = this.host;
    const f = this.from;
    f.t = Math.min(1, f.t + dt / TURN);
    const e = f.t * f.t * (3 - 2 * f.t);
    this.zoomShown += (this.zoom - this.zoomShown) * Math.min(1, dt * 6);
    const h = hero.height, z = this.zoomShown;
    // The hero faces −z turned by yaw: the camera stands in front, a little to the hero's left so the glass
    // on the right leaves them in view; closer in, it looks at the face.
    const yaw = this.camYaw + Math.PI * (1 - e);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const startDist = Math.hypot(f.at.x - body.pos.x, f.at.z - body.pos.z), startUp = f.at.y - body.pos.y;
    const dist = lerp(startDist, 0.7 + h * 1.55 * z, e), aim = h * (0.92 - 0.38 * z), side = h * 0.32 * z * e;
    camera.position.set(body.pos.x + fx * dist - rx * side, body.pos.y + lerp(startUp, aim + 0.08 * z, e), body.pos.z + fz * dist - rz * side);
    camera.lookAt(body.pos.x - rx * side, body.pos.y + aim, body.pos.z - rz * side);
  }

  private furnish(model: Character): void {
    const tabs = el('div', { className: 'cr-tabs', role: 'tablist' });
    const pane = el('div', { className: 'cr-pane' });
    const tabTo = (id: string) => {
      pane.dataset.tab = id;
      for (const b of tabs.children) b.classList.toggle('on', (b as HTMLElement).dataset.tab === id);
      this.host.click?.();
    };
    TABS.forEach(([id, label], i) => {
      const b = button(label, () => tabTo(id), { className: 'cr-tab', type: 'button' });
      b.dataset.tab = id;
      b.style.animationDelay = `${0.55 + i * 0.08}s`;
      tabs.append(b);
    });
    this.editor = new CharacterEditor(model, pane, {
      title: 'Your hero', sections: SECTIONS, buttons: [], hide: ['anatomy'], mode: 'simple',
      randomize: () => randomConfig(model.catalog, model.config, { random: this.random(), race: 'any' }),
    });
    pane.append(this.pasts());
    tabTo('race');
    const begin = button('', () => this.begin(), { className: 't-btn primary cr-begin', type: 'button' }, svg(gearIcon), el('span', { textContent: 'Begin' }));
    const roll = button('Roll the dice', () => {
      this.host.click?.();
      void model.set(randomConfig(model.catalog, model.config, { random: this.random(), outfit: true }));
    }, { className: 't-btn quiet', type: 'button' });
    const turn = el('div', { className: 'cr-turn', ariaHidden: 'true' }, svg(gearIcon), el('span', { textContent: 'Drag to turn · wheel to look closer' }));
    this.root.replaceChildren(
      el('div', { className: 'cr-leaf l' }), el('div', { className: 'cr-leaf r' }),
      el('div', { className: 'cr-glass' },
        svg(rimSvg),
        el('div', { className: 'cr-head' }, el('div', { className: 'label', textContent: 'A hero steps forth' }), el('label', { className: 'cr-name' }, el('span', { textContent: 'Name' }), this.name)),
        tabs, pane,
        el('div', { className: 'cr-foot' }, roll, begin)),
      turn);
  }

  private begin(): void {
    if (!this.model || !this.done) return;
    const made: MadeHero = { name: this.name.value.trim() || this.defaultName(this.model.config), look: this.model.config, background: this.past };
    const done = this.done;
    this.done = null;
    this.host.click?.();
    // The look the hero wears is the last one dressed; the model goes.
    void this.host.hero.dress(made.look).then(() => {
      this.stop?.();
      this.editor?.dispose();
      this.model?.dispose();
      this.model = null;
    });
    this.listen(false);
    this.root.classList.remove('open');
    this.root.classList.add('closing');
    window.setTimeout(() => this.root.remove(), 900);
    done(made);
  }

  /** The Past tab: one card per background, what it gives and who knows you; one is chosen. */
  private pasts(): HTMLElement {
    const { backgrounds, skillName, itemName, knownBy } = this.host;
    this.past = backgrounds[0]?.id ?? '';
    const list = el('section', { className: 'cr-past', role: 'radiogroup', ariaLabel: 'Your past' });
    list.dataset.section = 'past';
    for (const bg of backgrounds) {
      const skills = Object.entries(bg.skills).map(([id, n]) => `${skillName(id)} +${n}`).join(' · ');
      const kit = [...Object.values(bg.kit.worn), ...bg.kit.pack].map(itemName);
      const kitLine = [...new Set(kit)].map((n) => (kit.filter((k) => k === n).length > 1 ? `${n} ×${kit.filter((k) => k === n).length}` : n)).join(', ');
      const known = knownBy(bg);
      const card = button('', () => {
        this.past = bg.id;
        for (const c of list.children) c.setAttribute('aria-checked', String(c === card));
        this.host.click?.();
      }, { className: 'cr-bg', type: 'button', role: 'radio' },
      el('strong', { textContent: bg.name }),
      el('span', { className: 'cr-bg-text', textContent: bg.text }),
      el('span', { className: 'cr-bg-skills', textContent: skills }),
      el('span', { className: 'cr-bg-kit', textContent: `${kitLine}; ${bg.kit.coins} copper` }),
      ...(known.length ? [el('span', { className: 'cr-bg-known', textContent: `Knows you: ${known.join('; ')}` })] : []));
      card.setAttribute('aria-checked', String(bg.id === this.past));
      list.append(card);
    }
    return list;
  }

  private defaultName(c: CharacterConfig): string {
    return this.host.nameFor(c.race, c.body.gender < 0.5, this.seed + this.rolls);
  }

  /** A seeded random source, new for every roll. */
  private random(): () => number {
    const r = new Rng(deriveSeed(this.seed, 'hero', 'roll', ++this.rolls));
    return () => r.float();
  }

  // The turntable: dragging the view turns the hero; the wheel steps closer or back.
  private readonly onDown = (e: PointerEvent) => { this.drag.on = true; this.drag.x = e.clientX; };
  private readonly onMove = (e: PointerEvent) => {
    if (!this.drag.on) return;
    this.host.body.yaw += (e.clientX - this.drag.x) * 0.012;
    this.drag.x = e.clientX;
  };
  private readonly onUp = () => { this.drag.on = false; };
  private readonly onWheel = (e: WheelEvent) => { this.zoom = Math.min(1.25, Math.max(0.28, this.zoom * Math.exp(e.deltaY * 0.0015))); };

  private listen(on: boolean): void {
    const c = this.host.canvas;
    const f = on ? 'addEventListener' : 'removeEventListener';
    c[f]('pointerdown', this.onDown as EventListener);
    window[f]('pointermove', this.onMove as EventListener);
    window[f]('pointerup', this.onUp);
    c[f]('wheel', this.onWheel as EventListener, { passive: true } as AddEventListenerOptions);
  }
}
