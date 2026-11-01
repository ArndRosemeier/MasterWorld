/**
 * A cellar drawn (world/dungeon/cellarMesh.ts): the shell and props in two meshes, each door with a state
 * as its own, each chest's lid on a pivot at its hinge (it lifts as the chest is searched), all with the
 * building shader the town already uses (no new shaders). A door opened is seen opening (render it, don't
 * narrate it): a door, grate or hidden door swings away from whoever opens it, a bar is lifted off first and
 * set down by the wall, stacked stones and a wedged boulder topple through the way. The props are
 * AssetGenerator's (props.ts), so the meshes are built in `add`, once they have loaded. Placed at `origin`,
 * hidden until the player is inside.
 */
import { Group, Vector3, type Mesh } from 'three/webgpu';
import { smoothstep } from '@futuremagic/core';
import type { BuildingMesh } from '@futuremagic/settlement';
import type { Stage } from '@futuremagic/stage';
import { DOOR_W, type Cellar } from '../../world/dungeon/cellar';
import { cellarMeshes, type DoorPiece } from '../../world/dungeon/cellarMesh';
import { buildingMeshAt, caveRockMeshAt } from '../materials/building';
import { loadCellarProps } from './props';
import { flameMesh } from '../materials/flame';
import { caveShaftMesh, caveWaterMesh, floodMesh } from '../materials/caveWater';
import type { CaveFeatures } from '../../world/dungeon/caveFeatures';
import { torchSpots } from '../../world/dungeon/torches';
import { formedMeshes } from '../cave/formedMeshes';
import type { CaveResult } from '../../world/cave/job';

export class CellarView {
  readonly group = new Group();
  private readonly doors = new Map<number, Door>();
  /** Opened before they were built (a saved visit), or as they open: from where (cellar frame; null: at once). */
  private readonly gone = new Map<number, readonly [number, number] | null>();
  /** Each chest's lid on a pivot at its hinge, by chest (hoard id), and how far each is to stand open (0..1). */
  private lids: { readonly pivot: Group; readonly axis: Vector3 }[] = [];
  private readonly lift = new Map<number, number>();
  /** The keys lying where they are picked up, by room; and the rooms whose key is taken. */
  private readonly keys = new Map<number, Mesh>();
  private readonly taken = new Set<number>();
  /** A seal's breach walled up (D62), course by course; and how far it is set (0..1). */
  private seal: Mesh[] = [];
  private sealed = 0;
  /** A cave's carved rock (world/dungeon/caveRock.ts), drawn with the rest; set before `add`. */
  rock: BuildingMesh | null = null;
  /** A formed cave's walls, formations, stones and water (D63, K5), instead of `rock`; set before `add`. */
  formed: Pick<CaveResult, 'mesh' | 'parts'> | null = null;
  /** A cave's water and shafts of daylight (world/dungeon/caveFeatures.ts); set before `add`. */
  cave: CaveFeatures | null = null;
  /** Walked into through a throat from its mouth (a portal): no ladder up stands at its way out; set before `add`. */
  throat = false;

  constructor(readonly cellar: Cellar, readonly origin: { x: number; y: number; z: number }) {
    this.group.name = `cellar ${cellar.decision.id}`;
    this.group.visible = false;
  }

  /** Built (once the props have loaded) and into the scene (shaders are the town's, already built). */
  async add(stage: Stage): Promise<void> {
    const m = cellarMeshes(this.cellar, await loadCellarProps(), this.throat);
    this.group.add(this.piece(m.shell, 'shell'), this.piece(m.props, 'props'));
    if (this.formed) this.group.add(formedMeshes(this.formed, this.origin).group);
    else if (this.rock) this.group.add(caveRockMeshAt(this.rock, this.origin.x, this.origin.y, this.origin.z));
    const O = this.origin;
    for (const m of this.cave ? [caveWaterMesh(this.cave, O.x, O.y, O.z), caveShaftMesh(this.cave, O.x, O.y, O.z)] : [floodMesh(this.cellar.layout, O.x, O.y, O.z)]) if (m) this.group.add(m);
    const torches = torchSpots(this.cellar);
    if (torches.length) this.group.add(flameMesh(torches, this.origin.x, this.origin.y, this.origin.z));
    m.lids.forEach((l, i) => {
      this.lids.push({ pivot: this.onPivot(l.mesh, `chest lid ${i}`, l.hinge), axis: new Vector3(l.axis[0], 0, l.axis[1]) });
      this.lidUp(i, this.lift.get(i) ?? 0);
    });
    this.seal = m.seal.map((c, i) => this.piece(c, `seal course ${i}`));
    for (const c of this.seal) this.group.add(c);
    this.sealUp(this.sealed);
    for (const k of m.keys) {
      const mesh = this.piece(k.mesh, `key ${k.room}`);
      mesh.visible = !this.taken.has(k.room);
      this.keys.set(k.room, mesh);
      this.group.add(mesh);
    }
    for (const d of m.doors) {
      const at = d.opens === 'push' ? farFoot(d) : d.hinge ?? d.at;
      const door: Door = { piece: d, pivot: this.onPivot(d.mesh, `door ${d.kind}`, at), bar: d.bar ? this.onPivot(d.bar, `bar ${d.link}`, d.at) : null, t: -1, away: [d.through[0], d.through[1]] };
      this.doors.set(d.link, door);
      if (this.gone.has(d.link)) this.start(door, this.gone.get(d.link) ?? null);
    }
    await stage.add(this.group);
  }

  /** A mesh drawn in the cellar's frame, on a pivot at `at` (cellar frame) to turn and move it about. */
  private onPivot(m: BuildingMesh, name: string, at: readonly [number, number, number]): Group {
    const pivot = new Group();
    pivot.name = name;
    pivot.add(this.piece(m, name));
    this.pivotAt(pivot, at);
    this.group.add(pivot);
    return pivot;
  }

  /** The pivot moved to `at` (cellar frame), its mesh staying where it was drawn. */
  private pivotAt(pivot: Group, at: readonly [number, number, number]): void {
    const mesh = pivot.children[0];
    pivot.position.set(this.origin.x + at[0], this.origin.y + at[1], this.origin.z + at[2]);
    mesh.position.set(-at[0], -at[1], -at[2]);
    mesh.updateMatrix();
  }

  /**
   * A door opened (unlocked, unbarred, found): seen opening, away from `from` (where its opener stands, cellar
   * frame); with no `from` (a saved visit), it stands open at once.
   */
  opened(link: number, from: readonly [number, number] | null = null): void {
    this.gone.set(link, from);
    const d = this.doors.get(link);
    if (d && d.t < 0) this.start(d, from);
  }

  private start(d: Door, from: readonly [number, number] | null): void {
    const p = d.piece;
    // Away from the opener: through the way to its far side.
    if (from) { const s = Math.sign((p.at[0] - from[0]) * p.through[0] + (p.at[2] - from[1]) * p.through[1]) || 1; d.away = [p.through[0] * s, p.through[1] * s]; }
    if (p.opens === 'push') this.pivotAt(d.pivot, farFoot(p, d.away));
    d.t = from ? 0 : Infinity;
    this.pose(d);
  }

  /** The doors opening this frame (called while the cellar is drawn). */
  step(dt: number): void {
    for (const d of this.doors.values()) if (d.t >= 0 && d.t < doneAt(d)) { d.t += dt; this.pose(d); }
  }

  private pose(d: Door): void {
    const p = d.piece, [ax, az] = d.away, t = d.t;
    // A bar first: lifted out of its brackets towards the opener, then laid on the floor beside the doorway,
    // pointing into the opener's room (along the wall it would stick through into the next cell).
    const swingFrom = d.bar ? BAR_FOR : 0;
    if (d.bar) {
      const k = Math.min(1, t / BAR_FOR), up = smoothstep(0, 0.35, k), down = smoothstep(0.35, 1, k);
      const [ux, uz] = along(p), side = DOOR_W / 2 + 0.35, back = 0.25 * up + 0.95 * down;
      d.bar.position.set(
        this.origin.x + p.at[0] - ax * back + ux * side * down,
        this.origin.y + p.at[1] + 0.15 * up - BAR_DOWN * down,
        this.origin.z + p.at[2] - az * back + uz * side * down,
      );
      d.bar.rotation.set(0, (Math.PI / 2) * down, 0);
    }
    const k = Math.min(1, Math.max(0, (t - swingFrom) / OPEN_FOR[p.opens]));
    if (p.opens === 'gone') { d.pivot.visible = k < 1; return; }
    if (p.opens === 'swing') {
      // Turned about +y, the leaf (from its hinge along the wall) first moves along (uz, -ux): that way is away, or the other.
      const [ux, uz] = along(p), sign = Math.sign(uz * ax - ux * az) || 1;
      d.pivot.rotation.set(0, sign * SWING * smoothstep(0, 1, k), 0);
    } else {
      // Toppling over its far foot: slow, then falling (about up × away, the top goes away).
      d.pivot.quaternion.setFromAxisAngle(this.axis.set(az, 0, -ax), TOPPLE * k * k);
    }
  }
  private readonly axis = new Vector3();

  /** Room `room`'s key is picked up: it is gone from the floor. */
  keyTaken(room: number): void {
    this.taken.add(room);
    const k = this.keys.get(room);
    if (k) k.visible = false;
  }

  /** Chest `i`'s lid lifted by k (0 shut, 1 open), now or once it is built. */
  lidUp(i: number, k: number): void {
    this.lift.set(i, k);
    const l = this.lids[i];
    if (l) l.pivot.quaternion.setFromAxisAngle(l.axis, LID_OPEN * k);
  }

  /** The breach walled up as far as `k` (0 open .. 1 closed): a course more shows for each part set. */
  sealUp(k: number): void {
    this.sealed = k;
    const n = Math.ceil(k * this.seal.length - 1e-6);
    this.seal.forEach((c, i) => (c.visible = i < n));
  }

  private piece(m: BuildingMesh, name: string): Mesh {
    return buildingMeshAt(m, this.origin.x, this.origin.y, this.origin.z, name);
  }
}

/** A door piece drawn, its pivot, its bar's (null: none), how long it has been opening (s; -1 shut), and away from its opener. */
interface Door { readonly piece: DoorPiece; readonly pivot: Group; readonly bar: Group | null; t: number; away: [number, number] }

/** How long each way takes (s): a door swinging wide, stones toppling, a ladder let down; the bar first. */
const OPEN_FOR = { swing: 1.2, push: 0.9, gone: 0.4 } as const, BAR_FOR = 0.9;
/** How far the bar comes down to lie on the floor (m): from its brackets (1.1 m up) and the lift, less its half thickness. */
const BAR_DOWN = 1.1 + 0.15 - 0.07;
/** How far a door swings (rad: to just short of the wall), and stones topple. */
const SWING = 1.5, TOPPLE = 1.2;
/** The wall's line at a door (unit; from its hinge towards its middle). */
const along = (p: DoorPiece): [number, number] => {
  const h = p.hinge ?? p.at, dx = p.at[0] - h[0], dz = p.at[2] - h[2], l = Math.hypot(dx, dz);
  return l > 1e-6 ? [dx / l, dz / l] : [-p.through[1], p.through[0]];
};
/** Where stacked stones topple over: their foot on the far side (`away`: from the opener). */
const farFoot = (p: DoorPiece, away: readonly [number, number] = p.through): [number, number, number] => [p.at[0] + away[0] * 0.35, p.at[1], p.at[2] + away[1] * 0.35];
const doneAt = (d: Door): number => (d.bar ? BAR_FOR : 0) + OPEN_FOR[d.piece.opens];

/** How far a chest's lid opens (rad): about upright, so it stays up and clear of the wall behind. */
const LID_OPEN = 1.6;
