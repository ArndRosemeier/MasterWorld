/**
 * A capital's gates as drawn: each gate's two oak leaves (@futuremagic/settlement gateLeaves), each on a
 * pivot at its hinge, drawn with the building shader the town already uses (no new shaders). They stand
 * open by day and swing shut at dusk; at night a gate swings open as someone comes up to it, and shut again
 * once they have gone (CLAUDE.md rule 11: doors swing).
 */
import { Group, type Mesh } from 'three/webgpu';
import { gateLeaves, type TownWall } from '@futuremagic/settlement';
import { smoothstep } from '@futuremagic/core';
import type { Stage } from '@futuremagic/stage';
import { buildingMeshAt } from '../materials/building';
import { freeMesh } from '../materials';

/** A gate opens for whoever comes within this of it (m), and shuts once they are this much farther off. */
const COME = 22, GONE = 8;
/** Seconds a gate takes to swing all the way. */
const SWING = 2.6;

interface Leaf { readonly pivot: Group; readonly mesh: Mesh; readonly open: number }
interface Gate { readonly x: number; readonly z: number; readonly leaves: Leaf[]; at: number; near: boolean }

export class GateView {
  private readonly gates: Gate[];

  /** `open`: whether the gates stand open now (by day) at first. */
  constructor(private readonly stage: Stage, wall: TownWall, name: string, open: boolean) {
    this.gates = wall.gates.map((g, gi) => ({
      x: g.x, z: g.z, at: open ? 1 : 0, near: false,
      leaves: gateLeaves(wall, g, [g.x, 0, g.z]).map((l, k) => {
        // The leaf hangs on a pivot at its hinge: the mesh placed relative to the pivot.
        const pivot = new Group(), mesh = buildingMeshAt(l.mesh, -l.hinge[0], -l.hinge[1], -l.hinge[2], `${name} gate ${gi}.${k}`);
        pivot.name = 'gate leaf';
        pivot.position.set(g.x + l.hinge[0], l.hinge[1], g.z + l.hinge[2]);
        pivot.add(mesh);
        return { pivot, mesh, open: l.open };
      }),
    }));
    for (const g of this.gates) this.turn(g);
  }

  /** Puts the leaves in. */
  async place(): Promise<void> {
    for (const g of this.gates) for (const l of g.leaves) await this.stage.add(l.pivot);
  }

  /**
   * Each frame: `day`, the gates stand open; at night each opens for anyone within COME of it (`near(x, z, r)`:
   * the hero, a walker), and swings shut once they have gone.
   */
  swing(dt: number, day: boolean, near: (x: number, z: number, r: number) => boolean): void {
    for (const g of this.gates) {
      g.near = near(g.x, g.z, g.near ? COME + GONE : COME);
      const to = day || g.near ? 1 : 0;
      if (g.at === to) continue;
      g.at = to > g.at ? Math.min(1, g.at + dt / SWING) : Math.max(0, g.at - dt / SWING);
      this.turn(g);
    }
  }

  /** How far each gate stands open (0 shut, 1 wide), in the wall's order. */
  get open(): number[] { return this.gates.map((g) => g.at); }

  private turn(g: Gate): void {
    const t = smoothstep(0, 1, g.at);
    for (const l of g.leaves) { l.pivot.rotation.y = l.open * t; l.pivot.updateMatrix(); }
  }

  clear(): void {
    for (const g of this.gates) for (const l of g.leaves) { this.stage.remove(l.pivot); freeMesh(l.mesh); }
  }
}
