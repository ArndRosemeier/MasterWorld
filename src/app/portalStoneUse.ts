/**
 * The portal stone in the hero's hands (game/portalStone.ts reckons it; this shows it). Taken out of the pack it
 * fills in out of nothing and floats before the hero, over the shoulder, turned to the eye, glowing with light
 * that is not of this world (materials/portalStone.ts, spellFx/portalStoneFx.ts). A click on a glyph:
 *
 * - the first sends a beam down to the floor, which glows there and fades: home is marked (an open pair closes);
 * - the second tears a portal open just beyond the stone, joined to one at home (app/portals.ts: walked through
 *   and seen through either way); where there is no room, or no home, it fizzles.
 *
 * Either way the stone then dissolves back into the pack. Walking off from it puts it away too. The open portals'
 * rifts (after Dunfinity's thin places) open from their middles, their ragged rims rippling and glowing.
 */
import { Vector3, type Mesh, type PerspectiveCamera, type Vector4 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { smoothstep } from '@futuremagic/core';
import { beyondFrame, homeFrame, PortalStone, STONE_PORTAL, STONE_SHAPE, STONE_UP, stoneSpot, type PortalStoneSave, type RoomProbe } from '../game/portalStone';
import type { Portal, PortalFrame } from '../game/portal';
import { kindMesh } from '../render/materials';
import { GLYPH_REACH, GLYPHS, PORTAL_STONE, STONE_LOOK, STONE_SIZE, stoneGeometry } from '../render/materials/portalStone';
import { PORTAL_RIFT, RIFT_STATE, riftGeometry } from '../render/materials/portal';
import { standAt } from '../render/portal/PortalView';
import type { SpellBits, Vec3 } from './spellFx/particles';
import { PortalStoneFx, type Rim } from './spellFx/portalStoneFx';
import type { Player } from './player';
import type { Portals } from './portals';
import { onClick } from '../input/keys';

export type StoneSound = 'raise' | 'beam' | 'open' | 'fizzle' | 'close';

export interface StoneHost {
  readonly stage: Stage;
  /** The game's camera (world coordinates). */
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLElement;
  readonly player: Player;
  readonly portals: Portals;
  /** What a portal's spot is checked against (where the hero is: the land, or the place below they are in). */
  readonly probe: RoomProbe;
  /** The realm the hero is in: 'land', or a place below by its id. */
  realm(): string;
  /** A realm made ready to be joined (a place below built); false if it cannot be. */
  ready(realm: string): Promise<boolean>;
  /** The game takes clicks now (no window open). */
  playing(): boolean;
  sound(what: StoneSound, at: Vec3): void;
  /** The hero's hands: raised to hold the stone up, thrown out at a glyph. */
  gesture(what: 'raise' | 'press'): void;
  /** Home or the pair changed (the game saves). */
  changed(): void;
}

/** How long the stone takes to come and to go (s). */
const COME = 0.9, GO = 0.8;
/** How long the pressed glyph flashes before the stone starts to go (s). */
const PRESS = 0.25;
/** How long a portal takes to open fully from its middle (s). */
const OPENING = 1.8;
/** The rifts' rims (as their shader's): home's green, the far side's blue, a little brighter for the sprites. */
const RIM_HOME: Vec3 = [0.5, 1.4, 0.85];
const RIM_FAR: Vec3 = [0.45, 0.9, 1.6];
/** Drawn this much bigger than it is (it floats near the hero, seen from the camera behind). */
const SHOWN = 1.3;
/** Walking this far from where it was raised puts it away (m). */
const WANDER = 2.5;

type State = 'away' | 'coming' | 'up' | 'pressed' | 'going';

export class PortalStoneUse {
  readonly stone: PortalStone;
  readonly mesh: Mesh;
  private readonly fx = new PortalStoneFx();
  private state: State = 'away';
  /** How much of the stone is there (0..1), and the time in its state. */
  private there = 0;
  private age = 0;
  private t = 0;
  private readonly at = new Vector3();
  private yaw = 0;
  private readonly raisedAt = new Vector3();
  private hover = 0;
  private pressedGlyph = 0;
  /** How far each side of the open pair is open (0..1): the home one stays open when a new far one opens. */
  private openA = 0;
  private openB = 0;
  /** Each side's rift as seen when its view is not drawn (another opening is looked through): its rim and haze. */
  private readonly haze: Mesh[];
  /** Things to do at the next fx frame (they need the bits). */
  private readonly due: ((b: SpellBits) => void)[] = [];
  /** For checks: home marks, portals opened, fizzles. */
  readonly counts = { home: 0, opened: 0, fizzled: 0 };

  constructor(private readonly host: StoneHost, saved?: PortalStoneSave) {
    this.stone = new PortalStone(saved);
    this.mesh = kindMesh(stoneGeometry(), PORTAL_STONE);
    this.mesh.name = 'portal stone';
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = true;
    this.mesh.scale.setScalar(SHOWN);
    const p = this.stone.portal;
    if (p) { this.letIn(p); this.openA = this.openB = 1; }
    this.haze = [0, 1].map((slot) => {
      const h = kindMesh(riftGeometry(STONE_SHAPE, slot, 0), PORTAL_RIFT);
      h.name = slot ? 'portal stone rift (far)' : 'portal stone rift (home)';
      h.matrixAutoUpdate = true;
      h.visible = false;
      return h;
    });
    const c = host.canvas;
    onClick(c, (x, y) => this.click(x, y));
    c.addEventListener('pointermove', (e) => {
      const g = this.state === 'up' ? this.glyphAt(e.clientX, e.clientY) : 0;
      if (g !== this.hover) { this.hover = g; c.style.cursor = g ? 'pointer' : ''; }
    });
  }

  /** Built behind the loading screen (its shader is warmed there with the other kinds). */
  async addToStage(): Promise<void> {
    await this.host.stage.add(this.mesh);
    this.mesh.visible = false;
    for (const h of this.haze) { await this.host.stage.add(h); h.visible = false; }
  }

  /** Held up now (or coming, or going). */
  get raised(): boolean { return this.state !== 'away'; }

  /** Take it out of the pack: it fills in before the hero, who turns to the way the camera looks. */
  holdUp(): void {
    if (this.state === 'up' || this.state === 'coming') return;
    const pl = this.host.player, w = pl.walker;
    w.yaw = pl.heroCam.yaw;
    this.yaw = w.yaw;
    const s = stoneSpot(w.pos, this.yaw);
    this.at.set(s.x, s.y, s.z);
    this.raisedAt.set(w.pos.x, w.pos.y, w.pos.z);
    this.state = 'coming';
    this.age = 0;
    this.pressedGlyph = 0;
    this.host.gesture('raise');
    this.host.sound('raise', [s.x, s.y, s.z]);
  }

  /** Put it away (it dissolves back into the pack). */
  putAway(): void {
    if (this.state === 'away' || this.state === 'going') return;
    this.state = 'going';
    this.age = 0;
  }

  /** Press a glyph (1: home, 2: open), as a click on it does. */
  pressGlyph(glyph: 1 | 2): void {
    if (this.state !== 'up') return;
    this.state = 'pressed';
    this.age = 0;
    this.pressedGlyph = glyph;
    this.host.gesture('press');
    if (glyph === 1) this.markHome(); else this.openHere();
  }

  private click(x: number, y: number): void {
    if (this.state !== 'up' || !this.host.playing()) return;
    const g = this.glyphAt(x, y);
    if (g) this.pressGlyph(g);
  }

  /** A glyph's middle on the screen (page pixels), and how far round it a click takes it. */
  glyphOnScreen(glyph: 1 | 2): { x: number; y: number; reach: number } {
    const cam = this.host.camera, r = this.host.canvas.getBoundingClientRect(), g = GLYPHS[glyph - 1]!;
    this.mesh.updateMatrix();
    const px = (v: Vector3): [number, number] => {
      const n = v.applyMatrix4(this.mesh.matrix).project(cam);
      return [r.left + (n.x + 1) / 2 * r.width, r.top + (1 - n.y) / 2 * r.height];
    };
    const [x, y] = px(new Vector3(g.x, g.y, STONE_SIZE.face)), [ex, ey] = px(new Vector3(g.x + GLYPH_REACH, g.y, STONE_SIZE.face));
    return { x, y, reach: Math.max(14, Math.hypot(ex - x, ey - y) * 1.15) };
  }

  /** The glyph under a point on the screen (0: none). */
  private glyphAt(x: number, y: number): 0 | 1 | 2 {
    let best: 0 | 1 | 2 = 0, near = Infinity;
    for (const g of [1, 2] as const) {
      const o = this.glyphOnScreen(g), d = Math.hypot(x - o.x, y - o.y);
      if (d < o.reach && d < near) { near = d; best = g; }
    }
    return best;
  }

  /** How big a portal would open for a hero at `feet` facing `yaw` (of STONE_SHAPE; null: it fizzles). Checks and shots look for a spot with room. */
  wouldOpen(feet: { x: number; y: number; z: number }, yaw: number): number | null {
    const f = beyondFrame(stoneSpot(feet, yaw), yaw, (x, z, near) => this.host.probe.standFloor(x, z, near));
    return this.stone.canOpen(f, this.host.probe, this.host.realm());
  }

  /** The first glyph: a beam down to the floor under the stone, which becomes home. */
  private markHome(): void {
    const foot: Vec3 = [this.at.x, this.at.y - STONE_SIZE.y * SHOWN, this.at.z];
    const floor = this.host.probe.standFloor(this.at.x, this.at.z, this.at.y - STONE_UP), to: Vec3 = [this.at.x, floor, this.at.z];
    this.host.sound('beam', to);
    this.due.push((b) => this.fx.beamDown(b, foot, to));
    const was = this.stone.portal;
    this.stone.markHome(homeFrame(this.at, this.yaw, (x, z, near) => this.host.probe.standFloor(x, z, near)), this.host.realm());
    if (was) {
      this.host.portals.remove(STONE_PORTAL);
      this.due.push((b) => { this.fx.shutDown(b, was.a.frame, was.shape); this.fx.shutDown(b, was.b.frame, was.shape); });
      this.host.sound('close', [was.b.frame.x, was.b.frame.y + 1.2, was.b.frame.z]);
      this.openA = this.openB = 0;
    }
    this.counts.home++;
    this.host.changed();
  }

  /** The second glyph: a portal just beyond the stone, joined to home; a fizzle where it cannot open. */
  private openHere(): void {
    const f = beyondFrame(this.at, this.yaw, (x, z, near) => this.host.probe.standFloor(x, z, near));
    const where: Vec3 = [f.x, f.y + 1.3, f.z];
    const realm = this.host.realm(), size = this.stone.canOpen(f, this.host.probe, realm);
    if (size === null) {
      this.due.push((b) => this.fx.fizzle(b, f));
      this.host.sound('fizzle', where);
      this.counts.fizzled++;
      return;
    }
    const wasShape = this.stone.portal?.shape ?? STONE_SHAPE;
    const made = this.stone.open(f, realm, size);
    if (!made) return;
    if (made.closed) {
      const old: PortalFrame = made.closed.frame;
      this.due.push((b) => this.fx.shutDown(b, old, wasShape));
      this.host.sound('close', [old.x, old.y + 1.2, old.z]);
    }
    this.letIn(made.portal);
    // The far one tears open; the home one (already open) stays, now leading here.
    this.openB = 0;
    if (!made.closed) this.openA = 0;
    this.due.push((b) => { this.fx.tearOpen(b, made.portal.b.frame, made.portal.shape); if (!made.closed) this.fx.tearOpen(b, made.portal.a.frame, made.portal.shape); });
    this.host.sound('open', where);
    this.counts.opened++;
    this.host.changed();
  }

  /**
   * Open the pair (again: moved), once both realms are ready (a place below is built first, so its side can be
   * looked into and walked into); a pair replaced in the meantime is not opened.
   */
  private letIn(p: Portal): void {
    // Made afresh: its size may have changed.
    const reopen = (): void => { this.host.portals.remove(p.id); this.host.portals.add(p); };
    const below = [p.a.realm, p.b.realm].filter((r) => r !== 'land');
    if (!below.length) { reopen(); return; }
    void Promise.all(below.map((r) => this.host.ready(r))).then((ok) => {
      if (ok.every(Boolean) && this.stone.home === p.a && this.stone.far === p.b) reopen();
    });
  }

  /** Every frame: the stone comes, floats, goes; the portals open and waver. */
  stoneFrame(dt: number): void {
    this.t += dt;
    this.age += dt;
    const w = this.host.player.walker;
    switch (this.state) {
      case 'coming':
        this.there = Math.min(1, this.age / COME);
        if (this.there >= 1) { this.state = 'up'; this.age = 0; }
        break;
      case 'up':
        if (Math.hypot(w.pos.x - this.raisedAt.x, w.pos.z - this.raisedAt.z) > WANDER) this.putAway();
        break;
      case 'pressed':
        if (this.age > PRESS) { this.state = 'going'; this.age = 0; }
        break;
      case 'going':
        this.there = Math.max(0, 1 - this.age / GO);
        if (this.there <= 0) { this.state = 'away'; this.pressedGlyph = 0; }
        break;
      default:
        break;
    }
    const shown = this.state !== 'away';
    this.mesh.visible = shown;
    if (shown) {
      // It floats, bobbing, turned to the eye, and rocks a little.
      const cam = this.host.camera.position;
      this.mesh.position.set(this.at.x, this.at.y + Math.sin(this.t * 1.6) * 0.035, this.at.z);
      this.mesh.rotation.set(Math.sin(this.t * 0.9) * 0.06, Math.atan2(cam.x - this.at.x, cam.z - this.at.z) + Math.sin(this.t * 0.7) * 0.08, Math.sin(this.t * 1.1) * 0.04, 'YXZ');
      const flash = this.state === 'pressed' ? 1 - this.age / PRESS : this.state === 'going' && this.pressedGlyph ? Math.max(0, 0.5 - this.age) : 0;
      STONE_LOOK.value.set(smoothstep(0, 1, this.there), this.state === 'up' ? this.hover : this.pressedGlyph, flash, 0);
    }
    // The pair's rifts: opening from their middles, rippling (their shader's clock), the haze standing in for a view not drawn.
    const p = this.stone.portal;
    if (p) {
      this.openA = Math.min(1, this.openA + dt / OPENING);
      this.openB = Math.min(1, this.openB + dt / OPENING);
    }
    // Each side's haze stands in its own realm: shown only while the hero is there too (the land's goes when they go below).
    const here = this.host.realm(), sides = p ? [p.a, p.b].map((sd) => (sd.realm === here ? sd.frame : null)) : [];
    const opens = [this.openA, this.openB];
    this.haze.forEach((h, i) => {
      const f = sides[i];
      h.visible = !!f;
      if (f) { standAt(h, f); h.scale.setScalar(this.stone.size); h.updateMatrix(); }
      (RIFT_STATE.array[i] as Vector4).set(p ? smoothstep(0, 1, opens[i]!) : 0, this.t + i * 7.3, 0, 0);
    });
  }

  /** Its light (with the spells' bits, every frame). */
  stoneLight(b: SpellBits, dt: number): void {
    for (const fn of this.due.splice(0)) fn(b);
    const rims: Rim[] = [];
    const p = this.stone.portal;
    if (p) {
      rims.push({ frame: p.a.frame, shape: p.shape, open: smoothstep(0, 1, this.openA), color: RIM_HOME });
      rims.push({ frame: p.b.frame, shape: p.shape, open: smoothstep(0, 1, this.openB), color: RIM_FAR });
    }
    this.fx.glowFrame(b, dt, this.state === 'away' ? null : { at: [this.at.x, this.at.y, this.at.z], there: this.there }, rims);
  }

  stoneSave(): PortalStoneSave { return this.stone.kept(); }
}
