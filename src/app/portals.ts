/**
 * The portals in play (game/portal.ts joins two places, render/portal/PortalView.ts draws the view through an
 * opening). Every frame: the hero walking through an opening goes on out of the other one (place, heading,
 * speed and the camera's turn carried through: nothing jumps); the camera, trailing behind, may still be on the
 * near side, so it is placed in whichever realm it stands in; the nearest opening in sight shows its far side;
 * and the hero is drawn on both sides while passing through (each view cuts the body at its opening).
 *
 * A realm is the land or a place below with its own frame (a cave, by its dungeon id). What each realm shows and
 * how it is lit is the host's (`show`).
 */
import type { Object3D } from 'three/webgpu';
import { Vector3 } from 'three/webgpu';
import type { PostHooks } from '@futuremagic/stage';
import { dist3 } from '@futuremagic/core';
import { openingOutline, sidesFrom, stepDir, stepPoint, stepYaw, through, toFrame, type P3, type Portal, type PortalFrame } from '../game/portal';
import type { WalkWorld } from '../game/walker';
import type { PortalPass, PortalView } from '../render/portal/PortalView';
import type { Player } from './player';

export interface PortalsHost {
  readonly player: Player;
  readonly view: PortalView;
  /** The hero's body, drawn on the far side of an opening it is passing through. */
  readonly hero: Object3D;
  /** The hero's lantern, carried through with the body (it lights the throat on whichever side is drawn). */
  readonly lamp?: Object3D;
  /** The realm the hero is in now. */
  realm(): string;
  /** The hero walked through into `to` (from `from`): the walk world, the sky and the music follow. */
  crossed(to: string, from: string): void;
  /** Show `realm` (its objects and its light) for a view; returns what puts the shown realm back. */
  showRealm(realm: string): () => void;
  /** The walker's world in a realm (the camera keeps out of its rock through an opening). */
  world(realm: string): WalkWorld | null;
}

/** How far apart two points are (`lift`: the second one raised by that much). */
const apart = (a: P3, b: P3, lift = 0): number => dist3([a.x, a.y, a.z], [b.x, b.y + lift, b.z]);

/** An opening further than this from the camera is not looked through (m). */
const SEEN = 90;
/** The hero's middle above its feet (m): it has gone through when this has. */
const MIDDLE = 0.9;

interface Held { readonly portal: Portal; readonly meshes: { a: import('three/webgpu').Mesh; b: import('three/webgpu').Mesh } }

export class Portals {
  private readonly held = new Map<string, Held>();
  /** The realm the camera stands in this frame (it trails the hero, and may still be on the near side). */
  cameraRealm = 'land';
  /** The hero's middle last frame, and its realm then. */
  private last: { p: P3; realm: string } | null = null;
  /** How the camera reached its realm this frame (null: the hero's own). */
  private viaCamera: { here: PortalFrame; there: PortalFrame } | null = null;
  /** Times the hero went through (for checks). */
  passed = 0;

  constructor(private readonly host: PortalsHost) {
    host.player.heroCam.lens = (head, p) => this.lens(head, p);
  }

  /** `o` samples the view through the openings (a rift's haze): kept out of the view while it is drawn. */
  readsView(o: Object3D): void { this.host.view.readers.add(o); }

  /** Open a portal (again: moved). */
  add(portal: Portal): void {
    const was = this.held.get(portal.id);
    if (was) {
      this.host.view.moveOpening(was.meshes.a, portal.a.frame);
      this.host.view.moveOpening(was.meshes.b, portal.b.frame);
      this.held.set(portal.id, { portal, meshes: was.meshes });
      return;
    }
    const v = this.host.view, outline = openingOutline(portal.shape, 40);
    const meshes = portal.rift
      ? { a: v.riftOpening(portal.shape, portal.a.frame, 0), b: v.riftOpening(portal.shape, portal.b.frame, 1) }
      : { a: v.opening(outline, portal.a.frame), b: v.opening(outline, portal.b.frame) };
    this.held.set(portal.id, { portal, meshes });
  }

  /** Close a portal. */
  remove(id: string): void {
    const h = this.held.get(id);
    if (!h) return;
    for (const m of [h.meshes.a, h.meshes.b]) { m.removeFromParent(); m.geometry.dispose(); }
    this.held.delete(id);
  }

  get portals(): Portal[] { return [...this.held.values()].map((h) => h.portal); }

  /**
   * After the hero moved this frame: through an opening, on out of the other. The camera's turn goes with it,
   * so the view does not swing.
   */
  walkThrough(): void {
    const w = this.host.player.walker, realm = this.host.realm();
    const now = { x: w.pos.x, y: w.pos.y + MIDDLE, z: w.pos.z };
    const last = this.last;
    this.last = { p: now, realm };
    if (!last || last.realm !== realm || this.host.player.offFoot) return;
    const t = through(this.portals, realm, last.p, now);
    if (!t) return;
    const from = t.here.frame, to = t.there.frame;
    const p = stepPoint(from, to, w.pos), v = stepDir(from, to, w.vel);
    w.pos.x = p.x; w.pos.y = p.y; w.pos.z = p.z;
    w.vel.x = v.x; w.vel.y = v.y; w.vel.z = v.z;
    w.yaw = stepYaw(from, to, w.yaw);
    const cam = this.host.player.heroCam;
    cam.yaw = stepYaw(from, to, cam.yaw);
    this.host.crossed(t.there.realm, realm);
    this.last = { p: { x: p.x, y: p.y + MIDDLE, z: p.z }, realm: t.there.realm };
    this.passed++;
  }

  /** A point behind the head that is beyond an opening, where it joins (for the camera's trail). */
  private lens(head: Vector3, p: P3): { world: WalkWorld; p: P3 } | null {
    const t = through(this.portals, this.host.realm(), head, p);
    if (!t) return null;
    const world = this.host.world(t.there.realm);
    return world ? { world, p: stepPoint(t.here.frame, t.there.frame, p) } : null;
  }

  /**
   * Once the camera is placed behind the hero's head: if the way back from the head passes an opening, the
   * camera stands on the far side of it (in that realm), moved and turned there.
   */
  placeCamera(camera: import('three/webgpu').PerspectiveCamera, head: Vector3): void {
    const realm = this.host.realm();
    this.cameraRealm = realm;
    this.viaCamera = null;
    const t = through(this.portals, realm, head, camera.position);
    if (!t) return;
    const from = t.here.frame, to = t.there.frame, p = stepPoint(from, to, camera.position);
    camera.position.set(p.x, p.y, p.z);
    camera.rotation.set(camera.rotation.x, stepYaw(from, to, camera.rotation.y), 0, 'YXZ');
    camera.updateMatrixWorld();
    this.cameraRealm = t.there.realm;
    this.viaCamera = { here: from, there: to };
  }

  /** A point in `from` as seen in `to`, through the nearest opening joining them; null when none does. */
  carry(p: P3, from: string, to: string): P3 | null {
    let best: P3 | null = null, d = Infinity;
    for (const h of this.held.values()) for (const s of sidesFrom(h.portal, from)) {
      if (s.there.realm !== to) continue;
      const dd = apart(p, s.here.frame);
      if (dd < d) { d = dd; best = stepPoint(s.here.frame, s.there.frame, p); }
    }
    return best;
  }

  /** The realm beyond the nearest opening within `within` metres of `p` in `realm`, else null. */
  nearBeyond(realm: string, p: P3, within: number): string | null {
    let best: string | null = null, d = within;
    for (const h of this.held.values()) for (const s of sidesFrom(h.portal, realm)) {
      const dd = apart(p, s.here.frame);
      if (dd < d) { d = dd; best = s.there.realm; }
    }
    return best;
  }

  /** Below (the camera's realm not the land): the land side of the nearest opening out to it, else null. */
  landSide(camera: P3): PortalFrame | null {
    let best: PortalFrame | null = null, d = Infinity;
    for (const h of this.held.values()) for (const s of sidesFrom(h.portal, this.cameraRealm)) {
      if (s.there.realm !== 'land') continue;
      const f = s.here.frame, dd = apart(camera, f);
      if (dd < d) { d = dd; best = s.there.frame; }
    }
    return best;
  }

  /** This frame's draw: the camera's realm shown, and the nearest opening in sight looked through. */
  hooks(camera: Vector3): PostHooks {
    const realm = this.cameraRealm, heroRealm = this.host.realm();
    let best: { pass: PortalPass; d: number } | null = null;
    for (const h of this.held.values()) for (const s of sidesFrom(h.portal, realm)) {
      const f = s.here.frame, d = apart(camera, f, 1);
      if (d > SEEN || (best && best.d <= d)) continue;
      const mesh = s.here === h.portal.a ? h.meshes.a : h.meshes.b, there = s.there;
      best = {
        d,
        pass: {
          here: f, there: there.frame, mesh,
          // Another realm's view draws its own shadow maps due this frame (the host's `showRealm` says whose).
          shadows: there.realm !== realm,
          beyond: () => {
            const back = this.host.showRealm(there.realm);
            const hero = this.heroIn(there.realm, heroRealm);
            return () => { hero(); back(); };
          },
        },
      };
    }
    const inner = this.host.view.hooks(best?.pass ?? null);
    let back: (() => void) | null = null;
    return {
      before: () => {
        inner.before?.();
        back = this.host.showRealm(realm);
        const hero = this.heroIn(realm, heroRealm);
        const shown = back;
        back = () => { hero(); shown(); };
      },
      between: () => { inner.between?.(); back?.(); back = null; },
    };
  }

  /**
   * The hero's body placed as seen in `realm` (it is in `heroRealm`): carried through the opening joining them
   * (the one the camera came through, else the nearest). Returns what puts it back.
   */
  private heroIn(realm: string, heroRealm: string): () => void {
    if (realm === heroRealm) return () => {};
    const o = this.host.hero;
    let pair = this.viaCamera && realm === this.cameraRealm ? this.viaCamera : null;
    if (!pair) {
      // From the hero's realm to `realm`: the nearest side in the hero's realm joined to it.
      let d = Infinity;
      for (const h of this.held.values()) for (const s of sidesFrom(h.portal, heroRealm)) {
        if (s.there.realm !== realm) continue;
        const q = toFrame(s.here.frame, o.position), dd = apart(q, { x: 0, y: 0, z: 0 });
        if (dd < d) { d = dd; pair = { here: s.here.frame, there: s.there.frame }; }
      }
    }
    if (!pair) return () => {};
    const pos = o.position.clone(), yaw = o.rotation.y;
    const from = pair.here, to = pair.there;
    const p = stepPoint(from, to, pos);
    o.position.set(p.x, p.y, p.z);
    o.rotation.y = stepYaw(from, to, yaw);
    o.updateMatrixWorld(true);
    const lamp = this.host.lamp, lit = lamp?.position.clone();
    if (lamp && lit) { const q = stepPoint(from, to, lit); lamp.position.set(q.x, q.y, q.z); lamp.updateMatrixWorld(); }
    return () => {
      o.position.copy(pos); o.rotation.y = yaw; o.updateMatrixWorld(true);
      if (lamp && lit) { lamp.position.copy(lit); lamp.updateMatrixWorld(); }
    };
  }
}
