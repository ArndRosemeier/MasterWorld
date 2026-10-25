/**
 * The title animation as a whole (plan D46, O18): the page (TitleScreen), the camera's fly-over
 * (TitleCamera), the toys (Toys), the music, and the jump into the game. The title is the loading screen in
 * disguise: it shows at once over the painted still while main.ts builds the world, flies over the real
 * start region once that is built, and dives down to the hero when New game is pressed (waiting for the
 * world if it is not ready yet). Calm motion keeps the still picture and fades into the game instead.
 */
import { loadLocal, saveLocal } from '../../persist/local';
import { onKeyDown } from '../../input/keys';
import type { Sound } from '../sound';
import type { PerspectiveCamera } from 'three/webgpu';
import { dayOf, drawTitle, titleSeed, type TitleDraw } from './draw';
import { CodeWatch, SECRET, type People } from './lines';
import type { Orbit, Pose } from './route';
import { TitleCamera } from './TitleCamera';
import { TitleScreen } from './TitleScreen';
import { Toys, type ToyWorld } from './Toys';

/** What the title needs of the game once the view exists. */
export interface TitleWorld {
  readonly camera: PerspectiveCamera;
  readonly orbit: Orbit;
  readonly toys: ToyWorld;
  /** Where the game's camera will be, behind the hero. */
  heroView(): Pose;
  /** The title is over: the game takes the camera and the keys. */
  begin(people: People['id'] | null): void;
}

export interface TitleMenus {
  openSettings(): void;
  whatsNew(): void;
}

const COUNTER = 'titleCount';

export class Title {
  readonly draw: TitleDraw;
  readonly screen: TitleScreen;
  private cam: TitleCamera | null = null;
  private toys: Toys | null = null;
  private world: TitleWorld | null = null;
  private built = false;
  private wanted: { people: People['id'] | null } | null = null;
  private over = false;

  /** This start's draw: today's date and how many titles were shown before (kept in the browser). */
  static drawToday(): TitleDraw {
    const n = Number(loadLocal(COUNTER) ?? 0) || 0;
    saveLocal(COUNTER, n + 1);
    return drawTitle(titleSeed(dayOf(new Date()), n));
  }

  constructor(draw: TitleDraw, private readonly sound: Sound, menus: TitleMenus, readonly calm: boolean) {
    this.draw = draw;
    console.info(`[title] ${draw.still}, ${draw.weather}, ${draw.hour.toFixed(1)} h`);
    this.screen = new TitleScreen(draw, { start: (p) => this.start(p), settings: () => menus.openSettings(), news: () => menus.whatsNew(), sound }, calm);
    sound.playMusic('title/theme.mp3');
    // Sound is allowed after the first press; the pointer leans the view.
    const unlock = () => sound.unlock();
    this.screen.root.ownerDocument.addEventListener('pointerdown', unlock, { once: true });
    const code = new CodeWatch(SECRET);
    onKeyDown((e) => {
      unlock();
      if (!this.over && code.heard(e.code)) this.toys?.dragon();
    });
    this.screen.toys.addEventListener('pointermove', (e) => this.cam?.point((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));
    this.screen.toys.addEventListener('click', (e) => { if (this.built && !this.calm) this.toys?.click(e.clientX, e.clientY); });
  }

  /** True while the title holds the camera. */
  get holding(): boolean { return !this.over; }

  /** The view exists: the fly-over takes the camera (placed at once, so the world loads around it). */
  attach(world: TitleWorld): void {
    this.world = world;
    this.cam = new TitleCamera(world.camera, world.orbit);
    this.cam.fly(0);
    if (!this.calm) this.toys = new Toys(this.screen.toys, world.camera, world.toys, this.draw.seed, { toast: (t) => this.screen.toast(t), sound: this.sound });
  }

  /** The world is built: the live fly-over replaces the still, and comes closer to the town over time. */
  ready(): void {
    this.built = true;
    this.screen.done();
    this.screen.live();
    this.cam?.closer();
    if (this.wanted) this.go(this.wanted.people);
  }

  /** Each frame while active (before the game's own update). */
  run(dt: number): void {
    this.sound.tick(dt);
    if (this.over) return;
    this.cam?.fly(dt);
    // The toys belong to the live world, not the painted still.
    if (this.built) this.toys?.frame(dt);
  }

  private start(people: People['id'] | null): void {
    if (this.screen.leaving || this.wanted) return;
    this.wanted = { people };
    if (this.built) this.go(people);
    else this.screen.waiting();
  }

  /** Into the game: the dive (or with calm motion a fade), then the game begins. */
  private go(people: People['id'] | null): void {
    const world = this.world;
    if (!world || !this.cam || this.screen.leaving) return;
    this.screen.leave();
    this.sound.fadeMusic(0, 6, true);
    const land = () => {
      this.over = true;
      this.screen.close();
      world.begin(people);
    };
    if (this.calm) { land(); return; }
    this.sound.play('dive');
    const to = world.heroView();
    console.info(`[title] dive from ${this.cam.pose.at.map(Math.round)} to ${to.at.map(Math.round)}`);
    this.cam.diveTo(to, land);
  }
}
