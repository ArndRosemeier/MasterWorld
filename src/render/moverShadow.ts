/**
 * The sun's shadow with its movers drawn every frame. The map is drawn whole every few frames (Sky.shadowEvery:
 * drawing every caster again is the dearest pass of a town frame); a mover's shadow drawn that seldom trails its body
 * and twitches as it walks (Arnd, 2026-11-04: fine far off, not for the hero). So the whole draw leaves out the
 * movers near the camera and keeps a copy of the map; every frame that copy goes back into the map and the near
 * movers (the hero, townsfolk, creatures, beasts) are drawn over it. One map, one sampler: a second map would be a
 * 17th texture in the busiest shaders, which neither WebGL 2 nor WebGPU's default limits allow (MW #578's first try).
 *
 * Movers beyond MOVER_RANGE, and those not `wanted` now (townsfolk but the detailed few), stay in the whole draw (a
 * late shadow does not show far off, and each mover drawn every frame costs main-thread time: 25 cost 1.7 ms). The map's depth is a float
 * texture, as WebGPU copies no other depth format. WebGPU only (Sky.movers); on WebGL 2 the map stays as it was.
 */
import { DepthTexture, FloatType, ShadowNode, type DirectionalLight, type Object3D, type Scene } from 'three/webgpu';
import { ORIGIN } from './origin';

/**
 * The roots of everything that moves and casts a shadow, as views register them (`mover`). Held weakly: a body its
 * view let go of is not kept for this (the memory hunt of 2026-11-04).
 */
const MOVERS = new Set<WeakRef<Object3D>>();
const registered = new WeakMap<Object3D, () => boolean>();
const always = (): boolean => true;

/**
 * Registers `o` as a mover (see MOVERS); returns it. `wanted` says whether it is worth drawing every frame now
 * (townsfolk: only the detailed few near the camera; the rest keep the map's cadence, which costs much less).
 */
export function mover<T extends Object3D>(o: T, wanted: () => boolean = always): T {
  if (!registered.has(o)) MOVERS.add(new WeakRef(o));
  registered.set(o, wanted);
  return o;
}

/** Every mover still alive (the rest forgotten on the way). */
function eachMover(f: (o: Object3D) => void): void {
  for (const r of MOVERS) {
    const o = r.deref();
    if (o) f(o);
    else MOVERS.delete(r);
  }
}

/** Metres round the shadow box's middle within which movers are drawn every frame. */
export const MOVER_RANGE = 40;

/** Whether a mover root is drawn every frame: near the middle (x, z in render space, like its matrixWorld), shown and wanted. */
const everyFrame = (o: Object3D, x: number, z: number): boolean => {
  const e = o.matrixWorld.elements;
  return o.parent !== null && o.visible && Math.hypot(e[12] - x, e[14] - z) <= MOVER_RANGE && registered.get(o)!();
};

const isLight = (o: Object3D): boolean => (o as { isLight?: boolean }).isLight === true;

/** What a frame hands a shadow node (three's NodeFrame, as far as it is used here). */
export type ShadowFrame = {
  scene: Scene;
  renderer: {
    autoClear: boolean;
    render(scene: Scene, camera: object): void;
    copyTextureToTexture(src: DepthTexture, dst: DepthTexture): void;
    /** The scene's lights as the frame's own draw found them (three's Lighting). */
    lighting: { getNode(scene: Scene): { getLights(): Object3D[] } };
  };
};

/** three's ShadowNode internals used here (its typings leave them out). */
type Inner = {
  renderShadow(frame: ShadowFrame): void;
  setupRenderTarget(shadow: unknown, builder: unknown): { shadowMap: unknown; depthTexture: DepthTexture };
  shadowMap: { depthTexture: DepthTexture } | null;
};

/**
 * The sun's shadow node, its map split as above. Set before the warm-up (it is in every lit shader); Sky sets
 * `stillDue` when the whole map is to be drawn, and asks for the map every frame.
 *
 * Lights are never hidden, in either draw: three keeps one set of lights per scene, and every shader's key holds
 * it, so a draw that found fewer lights (a torch in a hidden hand, a lantern in a hidden street) built every caster
 * again and broke the frame's other draws (night in the start town after a run, MW #578).
 */
export class MoverShadow {
  /** Draw the whole map (the still world) this frame; else only the near movers over the kept copy. */
  stillDue = true;
  /** The map as last drawn whole, without the near movers. */
  private kept: DepthTexture | null = null;
  /** The movers left out of the last whole draw: these are drawn every frame until the next. */
  private readonly drawn: Object3D[] = [];
  private readonly hidden: Object3D[] = [];
  private readonly path = new Set<Object3D>();
  private readonly keep = new Set<Object3D>();
  /** The node (exposed for the test). */
  readonly node: Inner;

  constructor(private readonly sun: DirectionalLight) {
    const node = new ShadowNode(sun, sun.shadow) as unknown as Inner;
    const setup = node.setupRenderTarget.bind(node), whole = node.renderShadow.bind(node);
    // A float depth map: WebGPU copies depth32float, not depth24plus (three's default).
    node.setupRenderTarget = (shadow, builder) => {
      const made = setup(shadow, builder);
      made.depthTexture.type = FloatType;
      return made;
    };
    node.renderShadow = (frame) => this.drawMap(frame, whole);
    this.node = node;
    (sun.shadow as unknown as { shadowNode: unknown }).shadowNode = node;
  }

  private drawMap(frame: ShadowFrame, whole: (frame: ShadowFrame) => void): void {
    const map = this.node.shadowMap?.depthTexture;
    if (!map) return whole(frame);
    const r = frame.renderer, scene = frame.scene, lights = r.lighting.getNode(scene).getLights();
    if (this.stillDue || !this.kept) {
      // The box's middle in render space: the sun's target is set in world space (Sky), matrixWorld is relative (origin.ts).
      const at = this.sun.target.position, x = at.x - ORIGIN.at.x, z = at.z - ORIGIN.at.z;
      this.drawn.length = 0;
      eachMover((o) => { if (everyFrame(o, x, z)) this.drawn.push(o); });
      this.mark(this.drawn, lights);
      for (const o of this.drawn) this.hideBut(o);
      try { whole(frame); } finally { this.unhide(); }
      this.kept ??= keptLike(map);
      r.copyTextureToTexture(map, this.kept);
      this.stillDue = false;
    } else r.copyTextureToTexture(this.kept, map);
    // The same movers over it, in the box the map was drawn with (no clear: the copy stays).
    const shown = this.drawn.filter((o) => o.parent !== null && o.visible);
    if (shown.length === 0) return;
    this.mark(shown, lights);
    for (const o of shown) this.keep.add(o);
    this.hideBut(scene);
    const clear = r.autoClear;
    r.autoClear = false;
    try { r.render(scene, this.sun.shadow.camera); } finally { r.autoClear = clear; this.unhide(); }
  }

  /** Marks the way from the scene down to each of `roots` and each light (`path`), so hiding passes them by. */
  private mark(roots: readonly Object3D[], lights: readonly Object3D[]): void {
    const path = this.path;
    path.clear();
    this.keep.clear();
    for (const list of [roots, lights]) for (const o of list) for (let p = o.parent; p && !path.has(p); p = p.parent) path.add(p);
  }

  /** Hides what is under `node` but the lights, what `keep` holds, and the way to them (`mark`). */
  private hideBut(node: Object3D): void {
    if (!this.path.has(node)) {
      if (node.visible && !isLight(node) && !this.keep.has(node)) { node.visible = false; this.hidden.push(node); }
      return;
    }
    for (const c of node.children) if (c.visible && !isLight(c) && !this.keep.has(c)) this.hideBut(c);
  }

  private unhide(): void {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
  }
}

/** A depth texture the map can be copied into and back (same size and format). */
function keptLike(map: DepthTexture): DepthTexture {
  const { width, height } = map.image as { width: number; height: number };
  const t = new DepthTexture(width, height, FloatType);
  t.name = 'ShadowDepthKept';
  return t;
}
