/**
 * The game's sound, every frame (plan 16): samples the world round the listener a few times a second into a
 * `Hearing` (game/soundscape.ts) and sets the ambience beds, the echo and the music's mood from it; plays the hero's
 * footsteps on the ground under them, jumps, landings and swimming; birds, gulls and owls from places round about;
 * thunder after the lightning, from where it struck; the town's bell on the hour, the smithy's hammer and the mill's
 * wheel from where they stand; doors, the cellar's hatch and ladder; the fights' blows and cries from where they
 * happen; the interface's clicks. Everything seeded (no Math.random): a call's place and time come from the clock.
 */
import type { PerspectiveCamera } from 'three/webgpu';
import { Vector3 } from 'three/webgpu';
import { hash3i, hashToFloat, smoothstep } from '@futuremagic/core';
import { MusicPicker, Stride, strideAt } from '@futuremagic/audio';
import type { AudioEngine } from '@futuremagic/audio/web';
import type { LifeEvent } from '../sim/smallLife';
import { MUSIC, daylight, hoofSound, musicMood, soundscape, stepSound, type Footing, type Hearing, type Place, type Threat } from '../game/soundscape';
import type { Walker } from '../game/walker';
import type { Steed } from '../game/horse';
import type { Terrain } from '../world/terrain';
import { TOWN_RASTER, TownGround, type Town } from '../world/town';
import { canopySampler, type Canopy } from '../world/canopy';
import { emptyWater } from '../world/hydro';
import type { WeatherState } from '../world/weather';
import type { FightCue } from './encounter';
import type { SpellSound } from './spellView';
import type { SpellMotif } from '../setting/contract';

export interface SoundHost {
  readonly engine: AudioEngine;
  readonly seed: number;
  readonly camera: PerspectiveCamera;
  readonly walker: Walker;
  readonly terrain: Terrain;
  /** The town nearest the listener (its bell, smithies and mills, its bustle; null: none). */
  town(): Town | null;
  /** Water surface and depth at a point (the masks), null where unknown. */
  water(x: number, z: number): { level: number; depth: number } | null;
  /** Calm water level under the walker in its own space (null in rooms and the cellar). */
  waterLevel(x: number, z: number): number | null;
  weather(): WeatherState;
  hour(): number;
  /** The lightning's light now (0..1) and its bearing. */
  flash(): { light: number; bearing: number };
  /** Where the hero is: out on the land, in a room (the building's kind), down in the cellar. */
  where(): { place: Place; room: string | null };
  /** Flying the free camera: no footsteps. */
  inFlight(): boolean;
  /** The horses about, and the one the hero rides (null: on foot). */
  horses(): readonly Steed[];
  riding(): Steed | null;
  /** The Director's mood: danger or a fight (music). */
  threat(): Threat;
  /** The title, the hero's making or the loading still holds the screen: the game is silent (and its music not fetched). */
  titleHolds(): boolean;
}

/** The gathering hum, pitched by school: fire and light high, earth and shadow low. */
const GATHER_PITCH: Readonly<Record<SpellMotif, number>> = { flame: 1.1, frost: 1.2, stone: 0.75, bloom: 1, radiance: 1.25, shade: 0.8 };

/** The sounds of each creature (by its setting id) and how they are pitched. */
const CRIES: Record<string, { cry: string; pitch: number; small?: boolean; bones?: boolean }> = {
  rat: { cry: 'cry/rat', pitch: 1.15, small: true },
  'giant rat': { cry: 'cry/rat', pitch: 0.75, small: true },
  goblin: { cry: 'cry/goblin', pitch: 1 },
  bandit: { cry: 'fight/hurt', pitch: 0.9 },
  'giant spider': { cry: 'cry/spider', pitch: 1 },
  skeleton: { cry: 'cry/skeleton', pitch: 1, bones: true },
  ghoul: { cry: 'cry/ghoul', pitch: 1 },
};

/** Heard often: decoded once sound is open. */
const PRELOAD = [
  'step/grass', 'step/litter', 'step/gravel', 'step/stone', 'step/cobbles', 'step/dirt', 'step/boards', 'step/rock', 'step/sand', 'step/water', 'step/snow',
  'body/jump', 'body/land', 'body/land-hard', 'swim/stroke', 'swim/splash', 'swim/out', 'ui/open', 'ui/close', 'title/click', 'door/open', 'door/close',
];

/** How often the world round the listener is sampled (s). */
const LISTEN_EVERY = 0.25;
/** Ring of samples for the sea and inland water: directions and distances (m). */
const RING_DIRS = 8, RING = [0, 12, 30, 60, 120, 240];

export class SoundDirector {
  private readonly picker: MusicPicker;
  private readonly stride = new Stride();
  private readonly strokes = new Stride();
  private readonly canopy: (x: number, z: number, out: Canopy) => Canopy;
  private readonly c: Canopy = { cover: 0, height: 0, spacing: 0, conifer: 0 };
  private readonly w = emptyWater();
  private hearing: Hearing | null = null;
  private listened = -Infinity;
  private clock = 0;
  /** Seconds since the title let go (music waits a little). */
  private playing = 0;
  private was: { place: Place; room: string | null } | null = null;
  private mode: Walker['mode'] = 'ground';
  private air = 0;
  private fallSpeed = 0;
  private nextCall = 4;
  private calls = 0;
  private flashed = -Infinity;
  private thunders = 0;
  private rung = -1;
  private readonly look = new Vector3();
  private readonly beats = new Map<Steed, Stride>();
  private rider: Steed | null = null;
  private nextNeigh = 15;
  private neighs = 0;
  /** What each town sounds like from where (every town alike), worked out when first heard. */
  private readonly heard = new WeakMap<Town, TownSounds>();

  constructor(private readonly host: SoundHost) {
    this.picker = new MusicPicker(MUSIC, host.seed, { hold: 45, urgent: ['fight', 'danger'], rest: 90 });
    this.canopy = canopySampler(host.terrain);
    host.engine.preload(PRELOAD);
    host.engine.onMusicEnded = () => this.picker.ended(this.clock);
    // Every button of the interface clicks like brass (the title's own buttons click themselves).
    document.addEventListener('click', (e) => {
      if (!host.titleHolds() && e.target instanceof Element && e.target.closest('button')) this.click();
    }, true);
  }

  /** A line for the debug HUD. */
  get summary(): string { return `${this.host.engine.summary()} · mood ${this.picker.mood ?? '-'}`; }

  hearTick(dt: number): void {
    const { engine } = this.host;
    this.clock += dt;
    engine.update();
    if (this.host.titleHolds()) { this.playing = 0; return; }
    this.playing += dt;
    const cam = this.host.camera;
    cam.getWorldDirection(this.look);
    engine.listen([cam.position.x, cam.position.y, cam.position.z], [this.look.x, this.look.y, this.look.z]);
    if (this.clock - this.listened >= LISTEN_EVERY) {
      this.listened = this.clock;
      this.listen();
    }
    this.body(dt);
    this.hooves(dt);
    this.places();
    this.sky();
    this.wildlife();
  }

  /** A spell's sound (app/spellView.ts): gathering in the hands, let go, or striking, in its school's voice. */
  spell(what: SpellSound, motif: SpellMotif, at: readonly [number, number, number]): void {
    const id = what === 'gather' ? 'spell/gather' : `spell/${motif}-${what}`;
    this.host.engine.play(id, { at: [at[0], at[1], at[2]], gain: what === 'gather' ? 0.7 : 1, pitch: what === 'gather' ? GATHER_PITCH[motif] : 1 });
  }

  /** Small birds taking wing (sim/smallLife.ts): a flurry from where they rose, fuller the more they are. */
  wings(e: LifeEvent): void {
    this.host.engine.play('title/birds', { at: [e.x, e.y + 0.5, e.z], gain: Math.min(0.9, 0.3 + e.count * 0.04), pitch: e.count > 12 ? 0.9 : 1.15 });
  }

  /** A fight's cue (Encounter.onCue): blows, cries and falls from where they happen. */
  cue(c: FightCue): void {
    const e = this.host.engine, spotOf = (w: { x: number; y: number; z: number }): [number, number, number] => [w.x, w.y + 1, w.z];
    switch (c.kind) {
      case 'struck': {
        const k = CRIES[c.who.def.id], o = c.strike.outcome;
        // A spell's strike is heard as the spell's own hit (spell()); the creature still cries out.
        if (c.spell) { if (o !== 'miss' && k && !k.bones) e.play(k.cry, { at: spotOf(c.who), pitch: k.pitch * 1.1, gain: 0.6, delay: 0.12 }); break; }
        if (o === 'miss') e.play('fight/swing', { at: spotOf(c.who) });
        else if (o === 'block') e.play('fight/block', { at: spotOf(c.who) });
        else e.play(k?.bones ? 'fight/bone' : 'fight/hit', { at: spotOf(c.who), gain: o === 'crit' ? 1.2 : 1 });
        if (o !== 'miss' && k && !k.bones) e.play(k.cry, { at: spotOf(c.who), pitch: k.pitch * 1.1, gain: 0.6, delay: 0.08 });
        break;
      }
      case 'hurt': {
        const o = c.strike.outcome;
        if (o === 'miss') e.play('fight/swing', { gain: 0.8 });
        else if (o === 'block') e.play('fight/block');
        else { e.play('fight/hit', { gain: o === 'crit' ? 1.2 : 1 }); e.play('fight/hurt', { delay: 0.06 }); }
        break;
      }
      case 'swing': e.play('fight/swing', { at: spotOf(c.who), gain: 0.7, pitch: 0.9 }); break;
      case 'notice': case 'flee': {
        const k = CRIES[c.who.def.id];
        if (k) e.play(k.cry, { at: spotOf(c.who), pitch: k.pitch * (c.kind === 'flee' ? 1.2 : 1) });
        break;
      }
      case 'killed': {
        const k = CRIES[c.who.def.id];
        if (k && !k.bones) e.play(k.cry, { at: spotOf(c.who), pitch: k.pitch * 0.8 });
        e.play(k?.bones ? 'fight/bone' : 'fight/fall', { at: spotOf(c.who), gain: k?.small ? 0.4 : 0.9, delay: 0.15 });
        break;
      }
      case 'fallen': e.play('fight/fall'); break;
      case 'found': case 'paid': e.play('fight/coins', { bus: 'ui' }); break;
      case 'skill': e.play('title/ward', { bus: 'ui', gain: 0.5 }); break;
      default: break;
    }
  }

  /** The interface: a button pressed. */
  click(): void { this.host.engine.play('title/click', { bus: 'ui', gain: 0.8 }); }

  /** A dialog opened or closed: its sound (`opening` names a dialog's own), and the music steps back while it is open. */
  dialogSound(open: boolean, opening = 'ui/open'): void {
    if (this.host.titleHolds()) return;
    this.host.engine.play(open ? opening : 'ui/close', { bus: 'ui', gain: 0.7 });
    this.host.engine.duck(open ? 0.45 : 1, 0.8);
  }

  /** The smith's hammer on a mended piece, and the coins for it. */
  rang(): void {
    const e = this.host.engine;
    e.play('fight/block', { bus: 'ui', gain: 0.8, pitch: 1.25 });
    e.play('fight/block', { bus: 'ui', gain: 0.5, pitch: 1.4, delay: 0.32 });
    e.play('fight/coins', { bus: 'ui', gain: 0.7, delay: 0.7 });
  }

  /** Coins changed hands (a trade). */
  coins(): void { this.host.engine.play('fight/coins', { bus: 'ui', gain: 0.8 }); }

  /** Something written into the journal. */
  noted(): void { this.host.engine.play('ui/quill', { bus: 'ui', gain: 0.7 }); }

  /** The world round the listener into a hearing; the beds, the echo and the music from it. */
  private listen(): void {
    const h = this.hear(), s = soundscape(h), e = this.host.engine;
    this.hearing = h;
    for (const [id, v] of Object.entries(s.beds)) e.bed(id, v);
    // Smithies and mills at work, from where they stand (outside; inside, the room's bed is theirs).
    if (h.place === 'land') {
      const cam = this.host.camera.position, day = daylight(h.hour);
      const t = this.host.town(), works = t ? this.soundsOf(t).works : [];
      for (const w of works) {
        const d = Math.hypot(w.at[0] - cam.x, w.at[2] - cam.z);
        const on = w.kind === 'mill' ? 0.9 : day * (1 - smoothstep(0.3, 0.8, h.rain)) * 0.9;
        if (d < 160 && on > 0.01) e.bed(`loop/${w.kind}`, on, { at: w.at, ref: w.kind === 'mill' ? 8 : 6 }, `work:${t!.decision.id}:${w.id}`);
      }
    }
    e.settle();
    e.muffle(s.muffle);
    e.echo(s.echo.t60, s.echo.wet);
    // Music: a while after the title has let go.
    if (this.playing < 8) return;
    const mood = musicMood(h, this.host.threat());
    const next = this.picker.want(mood, this.clock);
    if (next !== undefined) e.music(next, mood === 'fight' || mood === 'danger' ? 2 : 6);
  }

  private soundsOf(t: Town): TownSounds {
    let s = this.heard.get(t);
    if (!s) this.heard.set(t, (s = townSounds(t)));
    return s;
  }

  private hear(): Hearing {
    const { terrain, camera } = this.host, wx = this.host.weather(), where = this.host.where();
    const p = this.host.inFlight() ? camera.position : this.host.walker.pos, x = p.x, z = p.z;
    const ground = terrain.height(x, z);
    let sea = Infinity, water = Infinity;
    if (where.place === 'land') {
      for (const r of RING) {
        if (r > sea && r > water) break;
        for (let k = 0; k < (r ? RING_DIRS : 1); k++) {
          const a = (k / RING_DIRS) * Math.PI * 2, sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
          if (r < sea && terrain.height(sx, sz) < 0) sea = r;
          const w = this.host.water(sx, sz);
          if (r < water && w && w.depth > 0.2 && w.level > 0.3) water = r;
        }
      }
    }
    terrain.hydro.query(x, z, this.w);
    const w = this.w;
    const river = w.river && w.dist < w.valley ? { bank: Math.max(0, w.dist - w.half), half: w.half } : null;
    const fall = Number.isFinite(w.fallAt) && w.fallDrop > 0 ? { dist: Math.hypot(w.fallAt, w.dist), drop: w.fallDrop } : null;
    const near = this.host.town(), t = near ? this.soundsOf(near).at : null, town = t ? 1 - smoothstep(t.r * 0.45, t.r * 1.15, Math.hypot(x - t.x, z - t.z)) : 0;
    this.canopy(x, z, this.c);
    return {
      hour: this.host.hour(), place: where.place, room: where.room, under: this.host.camera.position.y < (this.host.water(camera.position.x, camera.position.z)?.level ?? -1e9) - 0.05 && where.place === 'land',
      rain: wx.rain, snow: wx.snow, wind: wx.wind, storm: wx.storm, height: Math.max(0, ground), sea, water, river: where.place === 'land' ? river : null,
      fall: where.place === 'land' ? fall : null, town, woods: this.c.cover, conifer: this.c.conifer,
    };
  }

  /** The hero's body: steps, jumps, landings, swimming. */
  private body(dt: number): void {
    const wk = this.host.walker, e = this.host.engine;
    if (this.host.inFlight() || this.host.riding()) { this.mode = wk.mode; this.stride.reset(); return; }
    const was = this.mode, now = wk.mode, hs = Math.hypot(wk.vel.x, wk.vel.z);
    this.mode = now;
    if (now === 'air') { this.air += dt; this.fallSpeed = Math.min(this.fallSpeed, wk.vel.y); }
    if (was === 'ground' && now === 'air' && wk.vel.y > 1) e.play('body/jump', { gain: 0.6 });
    if (was === 'air' && now === 'ground') {
      if (this.air > 0.3) {
        e.play(this.fallSpeed < -8 ? 'body/land-hard' : 'body/land', { gain: Math.min(1, 0.5 + -this.fallSpeed / 14) });
        e.play(stepSound(this.footing(wk)), { gain: 0.5 });
      }
      this.stride.reset();
    }
    if (now === 'swim' && was !== 'swim') e.play(this.fallSpeed < -3 ? 'swim/splash' : 'step/water', { gain: this.fallSpeed < -3 ? Math.min(1, -this.fallSpeed / 10) : 0.7 });
    if (was === 'swim' && now === 'ground') e.play('swim/out', { gain: 0.6 });
    if (now !== 'air') { this.air = 0; this.fallSpeed = 0; }
    if (now === 'ground' && this.stride.step(hs, dt, strideAt(hs))) e.play(stepSound(this.footing(wk)), { gain: 0.35 + 0.3 * Math.min(1, hs / 5) });
    if (now === 'swim' && this.strokes.step(hs, dt, 1.5)) e.play('swim/stroke', { gain: 0.5 });
  }

  /**
   * The horses: a hoof beat each part of a stride (the walk's four beats, the trot's two, the gallop's drumming), on
   * the ground under them, from where they are; a snort as the hero gets on, and now and then from one standing near.
   */
  private hooves(dt: number): void {
    const e = this.host.engine, cam = this.host.camera.position, riding = this.host.riding();
    if (riding !== this.rider) {
      if (riding) e.play('horse/snort', { at: [riding.pos.x, riding.pos.y + 1.5, riding.pos.z], ref: 4, gain: 0.7 });
      this.rider = riding;
    }
    if (this.host.where().place !== 'land') return;
    for (const s of this.host.horses()) {
      let beats = this.beats.get(s);
      if (!beats) this.beats.set(s, (beats = new Stride()));
      const d = Math.hypot(s.pos.x - cam.x, s.pos.z - cam.z);
      if (d > 70 || s.walker.mode !== 'ground') { beats.reset(); continue; }
      const gait = s.gait, beat = gait === 'gallop' ? 1.6 : gait === 'trot' ? 1.2 : 0.7;
      if (beats.step(s.speed, dt, beat)) {
        const loud = gait === 'gallop' ? 0.9 : gait === 'trot' ? 0.7 : 0.5;
        e.play(hoofSound(this.footing(s.walker), gait), { at: [s.pos.x, s.pos.y + 0.2, s.pos.z], ref: 5, gain: loud, late: 0.2 });
      }
    }
    // Now and then one standing near snorts or neighs.
    if (this.clock < this.nextNeigh) return;
    const n = this.neighs++, draw = (k: number): number => hashToFloat(hash3i(this.host.seed, n, k, 0x4053));
    this.nextNeigh = this.clock + 20 + draw(0) * 40;
    for (const s of this.host.horses()) {
      if (s.ridden || s.speed > 0.3 || Math.hypot(s.pos.x - cam.x, s.pos.z - cam.z) > 35) continue;
      e.play(draw(1) < 0.75 ? 'horse/snort' : 'horse/whinny', { at: [s.pos.x, s.pos.y + 1.5, s.pos.z], ref: 6, gain: 0.6 });
      break;
    }
  }

  /** What is under a body's feet (the hero's, a horse's). */
  private footing(wk: Walker): Footing {
    const { terrain } = this.host, p = wk.pos, where = this.host.where();
    const level = this.host.waterLevel(p.x, p.z);
    const g = terrain.townGround(p.x, p.z);
    const town = g === TownGround.Street || g === TownGround.Building ? 'street' : g === TownGround.Market ? 'market' : g === TownGround.Yard || g === TownGround.Path ? 'yard' : null;
    const bi = terrain.biomeAt(p.x, p.z);
    const h = terrain.height(p.x, p.z), d = 1.5;
    const slope = Math.hypot(terrain.height(p.x + d, p.z) - terrain.height(p.x - d, p.z), terrain.height(p.x, p.z + d) - terrain.height(p.x, p.z - d)) / (2 * d);
    const rock = slope > 0.9 || p.y > h + 0.3 || terrain.rockSurface(p.x, p.y + 0.5, p.z) !== null;
    const wx = this.host.weather();
    return {
      place: where.place, room: where.room, wading: level !== null && level > p.y + 0.05, town,
      surface: bi >= 0 ? terrain.biomes[bi].surface : null, rock, snow: Math.max(wx.lying, smoothstep(1800, 2000, h)),
      beach: h < 4 && (this.hearing?.sea ?? Infinity) < 120,
    };
  }

  /** Doors, the cellar's hatch and its ladder, as the hero goes in, down, up and out. */
  private places(): void {
    const now = this.host.where(), was = this.was, e = this.host.engine;
    this.was = now;
    if (!was || (was.place === now.place && was.room === now.room)) return;
    const heavy = (room: string | null) => room === 'temple' || room === 'hall';
    if (now.place === 'cellar') {
      e.play('hatch/open', { gain: 0.8 });
      for (let i = 0; i < 3; i++) e.play('ladder/rung', { delay: 0.6 + i * 0.4, gain: 0.7 });
    } else if (was.place === 'cellar') {
      for (let i = 0; i < 3; i++) e.play('ladder/rung', { delay: i * 0.4, gain: 0.7 });
      e.play(now.place === 'room' ? 'hatch/close' : 'door/close', { delay: 1.3, gain: 0.8 });
    } else if (now.place === 'room') e.play(heavy(now.room) ? 'door/heavy' : 'door/open', { gain: 0.8 });
    else if (was.place === 'room') e.play('door/close', { gain: 0.8 });
  }

  /** Thunder after each flash, from where it struck (sound takes about 3 s a kilometre). */
  private sky(): void {
    const f = this.host.flash();
    if (f.light < 0.2 || this.clock - this.flashed < 2) return;
    this.flashed = this.clock;
    const n = this.thunders++, delay = 0.3 + hashToFloat(hash3i(this.host.seed, n, 0, 0x7d)) * 4;
    const d = Math.min(1400, delay * 340), cam = this.host.camera.position;
    const at: [number, number, number] = [cam.x + Math.cos(f.bearing) * d, cam.y + 300, cam.z + Math.sin(f.bearing) * d];
    const inside = this.host.where().place !== 'land';
    this.host.engine.play(delay < 1.6 ? 'thunder/near' : 'thunder/far', { at, ref: 500, delay, gain: inside ? 0.5 : 1, late: 2 });
  }

  /** Birds, gulls, owls, a dog and the rooster, each from a place round about; the town's bell on the hour; drips in the cellar. */
  private wildlife(): void {
    const h = this.hearing;
    if (!h || h.place === 'room' || h.under) return;
    const e = this.host.engine, cam = this.host.camera.position, seed = this.host.seed;
    if (h.place === 'cellar') {
      // Water dripping somewhere in the dark.
      if (this.clock < this.nextCall) return;
      const n = this.calls++, draw = (k: number): number => hashToFloat(hash3i(seed, n, k, 0xd217));
      this.nextCall = this.clock + 3 + draw(0) * 9;
      const a = draw(1) * Math.PI * 2, d = 3 + draw(2) * 9;
      e.play('call/drip', { at: [cam.x + Math.cos(a) * d, cam.y + 1, cam.z + Math.sin(a) * d], ref: 3, gain: 0.6 });
      return;
    }
    // The bell: on the hour from 8 to 20, heard across the town and a little beyond.
    const hour = Math.floor(h.hour);
    const near = this.host.town(), belfry = near ? this.soundsOf(near).belfry : null;
    if (belfry && h.hour - hour < 0.1 && hour !== this.rung && hour >= 8 && hour <= 20) {
      this.rung = hour;
      if (Math.hypot(belfry[0] - cam.x, belfry[2] - cam.z) < 900) e.play('call/bell', { at: belfry, ref: 60, gain: 0.8, late: 1 });
    }
    if (this.clock < this.nextCall) return;
    const n = this.calls++, draw = (k: number): number => hashToFloat(hash3i(seed, n, k, 0xb12d));
    const day = daylight(h.hour), dry = 1 - smoothstep(0.1, 0.5, h.rain);
    this.nextCall = this.clock + (3 + draw(0) * 7) / Math.max(0.25, dry);
    // Who calls here and now.
    const who: string[] = [];
    if (day > 0.5) {
      if (h.woods > 0.3) who.push('call/blackbird', 'call/robin', 'call/thrush', 'call/wren', 'call/woodpecker', 'call/pigeon');
      else if (h.town < 0.2) who.push('call/lark', 'call/robin', 'call/pigeon');
      if (h.sea < 150) who.push('call/gull', 'call/gull');
      if (h.town > 0.3) who.push('call/dog', 'call/pigeon');
      if (h.town > 0.2 && h.hour < 8.5) who.push('call/rooster');
    } else {
      if (h.woods > 0.2) who.push('call/owl');
      if (h.town > 0.3) who.push('call/dog');
    }
    if (!who.length || dry < 0.3 || h.snow > 0.5) return;
    const id = who[Math.floor(draw(1) * who.length) % who.length];
    const a = draw(2) * Math.PI * 2, d = 12 + draw(3) * 40, up = id === 'call/gull' ? 15 : id === 'call/dog' || id === 'call/rooster' ? 0.5 : 4 + draw(4) * 8;
    e.play(id, { at: [cam.x + Math.cos(a) * d, cam.y + up, cam.z + Math.sin(a) * d], ref: 10, gain: 0.7, late: 1 });
  }
}

/** Where a town is heard from: its middle and reach, its smithies and mills at work, its bell tower. */
interface TownSounds {
  readonly at: { x: number; z: number; r: number };
  readonly works: readonly { id: number; kind: 'smithy' | 'mill'; at: [number, number, number] }[];
  readonly belfry: [number, number, number] | null;
}

function townSounds(t: Town): TownSounds {
  const [cx, cz] = t.plan.centre;
  const works: { id: number; kind: 'smithy' | 'mill'; at: [number, number, number] }[] = [];
  for (const b of t.plan.buildings) if (b.kind === 'smithy' || b.kind === 'mill') works.push({ id: b.id, kind: b.kind, at: [b.cx, b.floorY + 1.5, b.cz] });
  let tower = null;
  for (const b of t.plan.buildings) if (b.kind === 'temple' || (b.kind === 'hall' && !tower)) tower = b;
  return {
    at: { x: cx, z: cz, r: Math.max(t.plan.radius, (Math.max(t.nx, t.nz) * TOWN_RASTER) / 2) },
    works,
    belfry: tower ? [tower.cx, tower.floorY + tower.floors * tower.floorH + 4, tower.cz] : null,
  };
}
