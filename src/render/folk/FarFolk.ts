/**
 * The cheap level of the townsfolk (D41: about 100 beyond the ~30 drawn in full): everyone out of doors
 * who has no Actors character, out to FAR, as one instanced draw of a plain robed figure in the colour
 * of their main garment and the height of their people. They stand or glide where the simulation has
 * them; from beyond the characters' range that reads as a busy town.
 */
import { type BufferGeometry, Color, InstancedMesh, LatheGeometry, Matrix4, Quaternion, Vector2, Vector3 } from 'three/webgpu';
import { FAR_FOLK } from '../materials/folk';
import type { Agent } from '../../sim/townLife';
import type { Race } from '../../sim/people';
import { lookOf } from './looks';

/** People farther than this are not drawn at all (m). */
export const FAR = 320;
/** At most this many cheap figures. */
const MAX = 120;
/** Standing height by people (m), as Actors draws them roughly. */
const TALL: Record<Race, number> = { human: 1.72, elf: 1.8, dwarf: 1.3, halfling: 1.1 };

/** A robed figure 1 m tall: hem, waist, shoulders, neck, head. */
function figure(): BufferGeometry {
  const p = [[0, 0], [0.15, 0], [0.16, 0.05], [0.11, 0.55], [0.13, 0.78], [0.08, 0.84], [0.035, 0.86], [0.06, 0.9], [0.055, 0.97], [0, 1]];
  const g = new LatheGeometry(p.map(([r, y]) => new Vector2(r, y)), 7);
  g.deleteAttribute('uv'); // the kind's attributes: position and normal
  return g;
}

export class FarFolk {
  readonly mesh: InstancedMesh;
  private readonly colors = new Map<number, Color>();
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly at = new Vector3();
  private readonly size = new Vector3();

  constructor() {
    this.mesh = new InstancedMesh(figure(), FAR_FOLK.make(), MAX);
    this.mesh.name = 'far folk';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // spread over the town
    // Colours from the start: instance colour is part of the shader's key.
    this.mesh.setColorAt(0, new Color(0.5, 0.45, 0.4));
    this.mesh.count = 1;
  }

  /** Each frame: `who` (nearest first), placed on the ground at `height`. */
  place(who: readonly Agent[], height: (x: number, z: number) => number): void {
    const n = Math.min(MAX, who.length);
    for (let i = 0; i < n; i++) {
      const a = who[i], p = a.person, s = TALL[p.race] * (0.94 + 0.12 * ((p.id * 0.618) % 1));
      this.q.setFromAxisAngle(this.up, Math.PI / 2 - a.dir);
      this.m.compose(this.at.set(a.x, height(a.x, a.z), a.z), this.q, this.size.set(s * (p.race === 'dwarf' ? 1.25 : 1), s, s));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.colorOf(a));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** The colour of the outermost garment they wear. */
  private colorOf(a: Agent): Color {
    let c = this.colors.get(a.person.id);
    if (!c) {
      const look = lookOf(a.person), worn = (look.outfit ?? []).filter((g) => g !== 'briefs' && g !== 'bra' && look.garmentColors?.[g]);
      // The dress or tunic when there is one, else the first garment over the underwear.
      const main = worn.find((g) => /dress|tunic|robe/.test(g)) ?? worn[0];
      c = new Color(main ? look.garmentColors![main] : '#7a6a4c');
      this.colors.set(a.person.id, c);
    }
    return c;
  }
}
