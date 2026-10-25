/**
 * The title's page (plan D46, O18): the painted still at once, the dark opening with its ward line and the
 * dawn, the forged logo, the brass menu, the peoples card, the town crier, the hint and the toasts. It is
 * also the loading screen: `set` shows what is being built. The 3D fly-over and the toys run behind it
 * (TitleCamera, Toys); `live` hands the picture over to them. Plain DOM; styles in title.css.
 */
import './title.css';
import { el, svg } from '../dom';
import { versionLabel } from '../release';
import { shuffled, type TitleDraw } from './draw';
import { HINT, PEOPLES, RUMOURS, type People } from './lines';
import { bellIcon, dawnSvg, emblemSvg, gearIcon, logoSvg, rimSvg, wardLine } from './art';
import type { Sound } from '../sound';

export interface TitleHost {
  /** New game (with the people picked on the card, if any). */
  start(people: People['id'] | null): void;
  settings(): void;
  news(): void;
  readonly sound: Sound;
}

/** Seconds per people on the card. */
const CARD_SECONDS = 8;


export class TitleScreen {
  readonly root: HTMLDivElement;
  /** Where the toys draw and the world's clicks land. */
  readonly toys: HTMLCanvasElement;
  private readonly build: HTMLDivElement;
  private readonly gate: HTMLDivElement;
  private readonly continueButton: HTMLButtonElement;
  private resume: (() => void) | null = null;
  private readonly startButton: HTMLButtonElement;
  private readonly card: HTMLDivElement;
  private people = 0;
  private cardTimer = 0;
  private toastEl: HTMLDivElement | null = null;
  private leavingNow = false;

  constructor(private readonly draw: TitleDraw, private readonly host: TitleHost, readonly calm: boolean) {
    document.body.classList.add('titled');
    document.getElementById('loading')?.remove();
    const base = import.meta.env.BASE_URL;
    const still = el('div', { className: `t-still${draw.mirror ? ' mirror' : ''}` });
    still.style.backgroundImage = `url(${base}title/${draw.still}.webp)`;
    this.toys = el('canvas', { className: 't-toys' });

    const logo = el('div', { className: 't-logo' }, el('div', { className: 'plate l' }), el('div', { className: 'plate r' }), el('div', { className: 'clasp top' }), el('div', { className: 'clasp bottom' }), svg(logoSvg()),
      el('div', { className: 't-tagline', textContent: 'The land wakes as you walk it.' }));

    this.startButton = this.button('New game', () => this.startWith(null), 'primary');
    // Shown only when there is a saved game (offerContinue).
    this.continueButton = this.button('Continue', () => this.resume?.(), 'primary');
    this.continueButton.hidden = true;
    const menu = el('div', { className: 't-menu' },
      this.continueButton,
      this.startButton,
      this.button('Settings', () => host.settings()),
      this.button("What's new", () => host.news()),
      el('div', { className: 't-row' },
        this.button(this.soundLabel(), (b) => { host.sound.volume = host.sound.volume > 0 ? 0 : 0.8; b.lastChild!.textContent = this.soundLabel(); }, 'quiet')),
      el('div', { className: 't-version', textContent: `v${versionLabel}` }),
    );
    menu.querySelectorAll<HTMLElement>(':scope > *').forEach((b, i) => { b.style.animationDelay = `${6.5 + i * 0.12}s`; });
    const panel = el('nav', { className: 't-panel', ariaLabel: 'Main menu' }, svg(rimSvg), menu);

    this.card = el('div', { className: 't-card' });
    const peoples = el('aside', { className: 't-peoples', ariaLabel: 'The peoples' }, this.card);
    this.people = draw.seed % PEOPLES.length;
    this.showPeople(false);

    this.build = el('div', { className: 't-build', textContent: 'Waking the world' });
    // Browsers allow sound only after a press: the opening waits for one, so the theme and the ward line
    // begin together (the world keeps loading meanwhile).
    this.gate = el('div', { className: 't-gate', role: 'button', ariaLabel: 'Press any key to begin' },
      el('div', { className: 'name', textContent: 'MasterWorld' }), el('div', { className: 'press', textContent: 'Press any key' }));
    this.root = el('div', { id: 'title', className: calm ? 'calm gated' : 'gated' },
      still, svg(dawnSvg(wardLine(draw.seed))), this.toys, el('div', { className: 't-vignette' }),
      logo, panel, peoples, this.crier(), el('div', { className: 't-hint', textContent: HINT }), this.build, this.gate);
    document.body.append(this.root);
    // The SVG's own (SMIL) animations hold too until the press.
    this.root.querySelectorAll('svg').forEach((e) => e.pauseAnimations());
  }

  /** True once the first press woke the title. */
  get begun(): boolean { return !this.root.classList.contains('gated'); }

  /** The first press: the opening starts (with its sounds; the caller has allowed sound by now). */
  wake(): void {
    if (this.begun) return;
    this.root.classList.remove('gated');
    this.root.querySelectorAll('svg').forEach((e) => e.unpauseAnimations());
    window.setTimeout(() => this.gate.remove(), 900);
    if (this.calm) return;
    this.host.sound.play('wind');
    // The ward's sound as the fuse runs, the gear's as the logo locks.
    window.setTimeout(() => this.host.sound.play('ward'), 400);
    window.setTimeout(() => this.host.sound.play('gear'), 5100);
  }

  // The loading screen's part (main.ts calls these while the world is built).
  set(step: string): void {
    if (!this.root.classList.contains('awake')) this.build.textContent = step;
    console.info(`[load] ${(performance.now() / 1000).toFixed(1)} s: ${step}`);
  }

  done(): void {
    this.build.textContent = 'The world is awake';
    this.root.classList.add('awake');
    this.startButton.classList.remove('waiting');
  }

  fail(title: string, detail: string): void {
    this.build.textContent = `${title}: ${detail}`;
    this.build.classList.add('t-fail');
  }

  /** The live world takes over from the painted still (not with calm motion: the still stays). */
  live(): void {
    if (!this.calm) this.root.classList.add('live');
  }

  /**
   * There is a saved game: Continue leads the menu (New game steps back), with where the save was made.
   * `go` is called once, when it is pressed.
   */
  offerContinue(label: string, go: () => void): void {
    this.resume = () => {
      if (this.leavingNow) return;
      this.resume = null;
      this.host.sound.play('click');
      this.continueButton.classList.add('waiting');
      go();
    };
    this.continueButton.hidden = false;
    this.continueButton.title = label;
    this.continueButton.append(el('small', { textContent: label }));
    this.startButton.classList.remove('primary');
  }

  /** A save was loaded for this start: the title goes straight on to it once the world is built. */
  continuing(label: string): void {
    this.startButton.lastChild!.textContent = 'Continue';
    this.startButton.title = label;
    this.waiting();
  }

  /** New game was pressed but the world is still being built: the button's gear turns meanwhile. */
  waiting(): void {
    this.startButton.classList.add('waiting');
  }

  get leaving(): boolean { return this.leavingNow; }

  /** Everything makes way for the dive. */
  leave(): void {
    this.leavingNow = true;
    this.root.classList.add('leaving');
    window.clearInterval(this.cardTimer);
  }

  /** The title is gone: fades out, then leaves the page. */
  close(): void {
    this.root.classList.add('gone');
    document.body.classList.remove('titled');
    window.setTimeout(() => this.root.remove(), 1300);
  }

  toast(text: string): void {
    this.toastEl?.remove();
    this.toastEl = el('div', { className: 't-toast', textContent: text, role: 'status' });
    this.root.append(this.toastEl);
  }

  private startWith(people: People['id'] | null): void {
    if (this.leavingNow) return;
    this.host.sound.play('click');
    this.host.start(people);
  }

  private soundLabel(): string {
    return this.host.sound.volume > 0 ? 'Sound on' : 'Sound off';
  }

  private button(label: string, onclick: (b: HTMLButtonElement) => void, kind = '', icon = true): HTMLButtonElement {
    const b = el('button', { className: `t-btn ${kind}`.trim(), type: 'button' }, ...(icon ? [svg(gearIcon)] : []), el('span', { textContent: label }));
    b.onclick = () => onclick(b);
    return b;
  }

  private showPeople(flip: boolean): void {
    const p = PEOPLES[this.people];
    const step = (by: number) => {
      this.people = (this.people + by + PEOPLES.length) % PEOPLES.length;
      this.showPeople(true);
      this.restartCard();
    };
    // The people's figure turns on top of the card (baked pictures: tools/assets/peoples.mjs).
    const figure = el('div', { className: 'figure', ariaHidden: 'true' });
    figure.style.backgroundImage = `url(${import.meta.env.BASE_URL}title/peoples/${p.id}.webp)`;
    const fill = () => this.card.replaceChildren(
      figure,
      el('div', { className: 'head' }, svg(emblemSvg(p.id)), el('div', {}, el('div', { className: 'label', textContent: 'The peoples' }), el('h3', { textContent: p.name }))),
      el('p', { textContent: p.scene }),
      el('div', { className: 'nav' },
        Object.assign(this.button('‹', () => step(-1), 'quiet arrow', false), { ariaLabel: 'The people before' }),
        this.button(p.walk, () => this.startWith(p.id)),
        Object.assign(this.button('›', () => step(1), 'quiet arrow', false), { ariaLabel: 'The next people' })),
    );
    if (!flip || this.calm) { fill(); this.restartCard(); return; }
    this.card.classList.remove('flip');
    void this.card.offsetWidth;
    this.card.classList.add('flip');
    window.setTimeout(fill, 350);
  }

  private restartCard(): void {
    window.clearInterval(this.cardTimer);
    this.cardTimer = window.setInterval(() => {
      this.people = (this.people + 1) % PEOPLES.length;
      this.showPeople(true);
    }, CARD_SECONDS * 1000);
  }

  private crier(): HTMLDivElement {
    const lines = shuffled(RUMOURS, this.draw.seed);
    const window_ = el('div', { className: 'window' });
    if (this.calm) {
      // Without motion one rumour at a time.
      let i = 0;
      const show = () => window_.replaceChildren(el('div', { className: 'one', textContent: lines[i++ % lines.length] }));
      show();
      globalThis.setInterval(show, 9000);
    } else {
      const items = () => lines.map((l) => el('span', { className: 'item', textContent: l }));
      const track = el('div', { className: 'track' }, ...items(), ...items());
      track.style.animationDuration = `${lines.length * 11}s`;
      window_.append(track);
    }
    return el('div', { className: 't-crier', ariaLabel: 'The town crier' }, el('div', { className: 'plaque' }, svg(bellIcon), 'Town crier'), window_);
  }
}
