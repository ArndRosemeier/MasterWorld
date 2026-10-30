/**
 * The yards' hens and cocks as drawn (sim/poultry.ts moves them): WildMesh3D's chicken and rooster from
 * Arnd's private library (render/libraryAnimals.ts). A fixed pool of bodies goes to the birds nearest the
 * camera, none farther than REACH. A build without the library draws none.
 */
import { Group, type Object3D, type Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { LibraryAnimal } from '@actors/three';
import { hash2f } from '@futuremagic/core';
import type { Hen, HenAct, Poultry } from '../../sim/poultry';
import { LIBRARY_KINDS, type AnimalDoing, type LibraryKind } from '../libraryAnimals';
import { poseLibrary, shelvedAnimal } from '../dungeon/animals';

/** Farther than this (m) a bird is not drawn. */
const REACH = 60;

/** What a bird's act shows as. */
const DOING: Record<HenAct, AnimalDoing> = { peck: 'feed', idle: 'idle', walk: 'walk', run: 'run', crow: 'call', roost: 'rest' };

interface Body {
  readonly place: Group;
  readonly lib: LibraryAnimal;
  readonly kind: LibraryKind;
  doing: AnimalDoing | '';
  /** The bird it shows (null: none). */
  bird: Hen | null;
}

export class PoultryView {
  private sortIn = 0;

  private constructor(private readonly hens: Body[], private readonly cocks: Body[], private readonly height: (x: number, z: number) => number) {}

  /** `hens` hen bodies and `cocks` cock bodies (null: the build has not got the birds, or none are wanted). */
  static async pool(hens: number, cocks: number, height: (x: number, z: number) => number): Promise<PoultryView | null> {
    if (hens <= 0) return null;
    const make = async (kind: LibraryKind, n: number, salt: number): Promise<Body[] | null> => {
      const out: Body[] = [];
      for (let i = 0; i < n; i++) {
        const lib = await shelvedAnimal(kind.ids[0]);
        if (!lib) return null;
        lib.object.scale.setScalar((kind.scale ?? 1) * (0.9 + hash2f(i, salt, 3) * 0.15));
        const place = new Group();
        place.name = kind.ids[0];
        place.add(lib.object);
        place.visible = false;
        out.push({ place, lib, kind, doing: '', bird: null });
      }
      return out;
    };
    const h = await make(LIBRARY_KINDS.hen, hens, 0x4e9), c = await make(LIBRARY_KINDS.cock, cocks, 0xc0c);
    return h ? new PoultryView(h, c ?? [], height) : null;
  }

  toWarm(): Object3D[] { return [...this.hens, ...this.cocks].map((b) => b.place); }
  async enter(stage: Stage): Promise<void> { for (const b of [...this.hens, ...this.cocks]) await stage.add(b.place); }

  /** Each frame, after the flocks have stepped: the birds nearest the camera get the bodies. */
  showFlocks(dt: number, cam: Vector3, flocks: readonly Poultry[]): void {
    if ((this.sortIn -= dt) <= 0) {
      this.sortIn = 0.5;
      const away = (a: Hen): number => Math.hypot(a.x - cam.x, a.z - cam.z);
      const near = flocks.flatMap((f) => f.hens).filter((a) => away(a) < REACH).sort((a, b) => away(a) - away(b));
      this.assign(this.hens, near.filter((a) => !a.cock));
      this.assign(this.cocks, near.filter((a) => a.cock));
    }
    for (const b of this.hens) this.poseBird(b, dt);
    for (const b of this.cocks) this.poseBird(b, dt);
  }

  /** The nearest birds get the bodies; one that keeps its place keeps its body. */
  private assign(bodies: Body[], near: Hen[]): void {
    const want = new Set(near.slice(0, bodies.length));
    for (const b of bodies) if (b.bird && !want.has(b.bird)) b.bird = null;
    for (const a of want) {
      if (bodies.some((b) => b.bird === a)) continue;
      const free = bodies.find((b) => !b.bird);
      if (!free) break;
      free.bird = a;
      // A new bird: its clip starts afresh.
      free.doing = '';
    }
  }

  private poseBird(b: Body, dt: number): void {
    const a = b.bird;
    b.place.visible = !!a;
    if (!a) return;
    b.place.position.set(a.x, this.height(a.x, a.z), a.z);
    // The model faces +z; the bird faces (cos dir, sin dir).
    b.place.rotation.set(0, Math.atan2(Math.cos(a.dir), Math.sin(a.dir)), 0);
    poseLibrary(b, b.lib, b.kind, DOING[a.act], a.speed, dt);
  }
}
