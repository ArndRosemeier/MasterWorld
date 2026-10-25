/**
 * The title's giant (plan D46, the rumour of a giant on the far hills): an Actors giantkin, grown to
 * TALL metres, walking slowly over the land beyond the town in some fly-overs. Built behind the title's
 * still and compiled before it shows (preparePeople), so it costs no shader on the render path.
 */
import { Group, type WebGPURenderer } from 'three/webgpu';
import { Character, type CharacterPatch } from '@actors/generator';
import { nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '@actors/human/worker?worker';
import { PACE } from '../hero/clips';
import { castShadows } from '../hero/play';

const PACK = `${import.meta.env.BASE_URL}packs/human/manifest.json`;
/** How tall the giant stands (m). */
export const TALL = 14;

/** A shaggy hill giant in undyed wool and a mossy mantle, barefoot. */
const LOOK: CharacterPatch = {
  race: 'giantkin', race2: null, raceMix: 0, raceSize: 1,
  body: { gender: 1, ageYears: 48, muscle: 0.85, weight: 0.7 },
  hair: 'hair-shaggy', hairColor: '#3b2417', beard: 'full', stubble: 0.8,
  outfit: ['briefs', 'med-tunic', 'wool-pants', 'med-belt', 'med-mantle'],
  garmentColors: { 'med-tunic': '#6a5c44', 'wool-pants': '#4e4434', 'med-belt': '#3a2416', 'med-mantle': '#55604f' },
  anatomy: false, animation: null, seed: 0.37,
};

export class GiantView {
  /** In the world (feet on its position, facing its yaw). */
  readonly object = new Group();

  private constructor(private readonly ch: Character) {
    this.object.name = 'giant';
    this.object.add(ch.object);
    this.object.scale.setScalar(TALL / (ch.height || 1.75));
    castShadows(ch.object);
  }

  /** Loads and dresses the giant, walking at `speed` m/s (its clip paced to match). */
  static async grow(renderer: WebGPURenderer, speed: number): Promise<GiantView> {
    const ch = await Character.load({ pack: PACK, renderer, materials: nodeMaterials, clipLibraries: false, worker: new HumanWorker() });
    await ch.set(LOOK);
    ch.setLod(0); // one level only: no other level's shaders to build
    const g = new GiantView(ch);
    // A walk's stride grows with the body: slowed to the giant's speed (heavy, unhurried steps).
    await ch.play('walk');
    const a = ch.actor.currentAction;
    if (a) a.timeScale = speed / ((PACE.walk * TALL) / 1.75);
    return g;
  }

  /** Where it is now: feet at (x, y, z), facing `yaw` (0 faces −z). */
  frame(dt: number, p: { x: number; y: number; z: number; yaw: number }): void {
    const { x, y, z, yaw } = p;
    this.object.position.set(x, y, z);
    // Actors' people face +z.
    this.object.rotation.y = yaw + Math.PI;
    this.ch.update(dt);
  }

  dispose(): void {
    this.object.removeFromParent();
    this.ch.dispose();
  }
}
