/**
 * The town's children (Arnd, 2026-10-25): Actors makes adults only, so children are simple clothed
 * figures, a tunic over two legs, a head and a cap of hair, each part one instanced draw in the far
 * figures' material (instance colour, so no shader of their own). Legs swing while they walk; at play
 * they hop about. Drawn to the far figures' range.
 */
import { type BufferGeometry, Color, CylinderGeometry, InstancedMesh, LatheGeometry, type Material, Matrix4, Quaternion, SphereGeometry, Vector2, Vector3 } from 'three/webgpu';
import type { Agent } from '../../sim/townLife';
import { FAR } from './FarFolk';
import { childLook, type ChildLook } from './looks';

/** At most this many children drawn. */
const MAX = 60;
/** Hip height and half the stance of a 1 m figure. */
const HIP = 0.42, STANCE = 0.045;

/** Only position and normal (the far figures' kind). */
const bare = (g: BufferGeometry) => { g.deleteAttribute('uv'); return g; };

/** A 1 m child's tunic: hem, waist, chest, shoulders, collar. */
function tunic(): BufferGeometry {
  const p = [[0, 0.33], [0.13, 0.33], [0.105, 0.52], [0.095, 0.6], [0.115, 0.7], [0.08, 0.77], [0.035, 0.8], [0, 0.8]];
  return bare(new LatheGeometry(p.map(([r, y]) => new Vector2(r, y)), 8));
}
/** A leg hanging from the hip (its top at the origin). */
const leg = () => bare(new CylinderGeometry(0.038, 0.032, HIP, 5).translate(0, -HIP / 2, 0));
/** Children's heads are large for their height. */
const head = () => bare(new SphereGeometry(0.1, 8, 6).translate(0, 0.89, 0));
/** Hair over the top and back of the head. */
const hair = () => bare(new SphereGeometry(0.106, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateX(-0.25).translate(0, 0.9, -0.012));

export class ChildFolk {
  readonly meshes: InstancedMesh[];
  private readonly body: InstancedMesh;
  private readonly legs: InstancedMesh;
  private readonly heads: InstancedMesh;
  private readonly hairs: InstancedMesh;
  private readonly looks = new Map<number, { look: ChildLook; tunic: Color; hose: Color; skin: Color; hair: Color }>();
  private time = 0;
  private readonly base = new Matrix4();
  private readonly part = new Matrix4();
  private readonly q = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly at = new Vector3();
  private readonly size = new Vector3();

  constructor(material: Material) {
    const make = (g: BufferGeometry, n: number, name: string) => {
      const m = new InstancedMesh(g, material, n);
      m.name = name;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      // Colours from the start: instance colour is part of the shader's key.
      m.setColorAt(0, new Color(0.5, 0.45, 0.4));
      m.count = 1;
      return m;
    };
    this.body = make(tunic(), MAX, 'children');
    this.legs = make(leg(), MAX * 2, 'children legs');
    this.heads = make(head(), MAX, 'children heads');
    this.hairs = make(hair(), MAX, 'children hair');
    this.meshes = [this.body, this.legs, this.heads, this.hairs];
  }

  /** Each frame: the children out of doors (`who`, nearest first), on the ground at `height`. */
  place(who: readonly Agent[], height: (x: number, z: number) => number, dt: number, cx: number, cz: number): void {
    this.time += dt;
    let n = 0;
    for (const a of who) {
      if (n >= MAX) break;
      if (a.hidden || Math.hypot(a.x - cx, a.z - cz) > FAR) continue;
      const c = this.colours(a);
      const s = c.look.tall, ph = (a.person.id * 0.618) % 1 * Math.PI * 2;
      const moving = a.act === 'walk' || a.act === 'stroll';
      const playing = a.act === 'play';
      // A stride a second and a half per metre of height; at play, hops.
      const stride = this.time * (moving ? 7 : 9) + ph;
      const hop = playing ? Math.max(0, Math.sin(stride)) * 0.12 * s : moving ? Math.abs(Math.sin(stride)) * 0.025 * s : 0;
      const swing = moving ? Math.sin(stride) * 0.55 : playing ? Math.sin(stride) * 0.3 : 0;
      const turn = playing ? Math.sin(this.time * 0.7 + ph) * 1.2 : 0;
      this.q.setFromAxisAngle(this.up, Math.PI / 2 - a.dir + turn);
      this.base.compose(this.at.set(a.x, height(a.x, a.z) + hop, a.z), this.q, this.size.set(s, s, s));
      this.body.setMatrixAt(n, this.base); this.body.setColorAt(n, c.tunic);
      this.heads.setMatrixAt(n, this.base); this.heads.setColorAt(n, c.skin);
      this.hairs.setMatrixAt(n, this.base); this.hairs.setColorAt(n, c.hair);
      for (const side of [0, 1]) {
        this.part.makeRotationX(side ? swing : -swing).setPosition(side ? STANCE : -STANCE, HIP, 0);
        this.legs.setMatrixAt(n * 2 + side, this.part.premultiply(this.base));
        this.legs.setColorAt(n * 2 + side, c.hose);
      }
      n++;
    }
    this.body.count = this.heads.count = this.hairs.count = n;
    this.legs.count = n * 2;
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private colours(a: Agent) {
    let c = this.looks.get(a.person.id);
    if (!c) {
      const look = childLook(a.person);
      c = { look, tunic: new Color(look.tunic), hose: new Color(look.hose), skin: new Color(look.skin), hair: new Color(look.hair) };
      this.looks.set(a.person.id, c);
    }
    return c;
  }
}
