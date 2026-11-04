/**
 * The sun's shadow with its movers drawn every frame. The map is drawn whole every few frames (Sky.shadowEvery:
 * drawing every caster again is the dearest pass of a town frame); a mover's shadow drawn that seldom trails its body
 * and twitches as it walks (Arnd, 2026-11-04: fine far off, not for the hero). So the whole draw leaves out the
 * movers near the camera and keeps a copy of the map; every frame that copy goes back into the map and the near
 * movers (the hero, townsfolk, creatures, beasts) are drawn over it. One map, one sampler: a second map would be a
 * 17th texture in the busiest shaders, which neither WebGL 2 nor WebGPU's default limits allow (MW #578's first try).
 *
 * Movers beyond MOVER_RANGE stay in the whole draw (far off a late shadow does not show). The map's depth is a float
 * texture, as WebGPU copies no other depth format. WebGPU only (Sky.movers); on WebGL 2 the map stays as it was.
 */
import { DepthTexture, FloatType, ShadowNode, type DirectionalLight, type Object3D, type Scene } from 'three/webgpu';
import { ORIGIN } from './origin';

/**
 * The roots of everything that moves and casts a shadow, as views register them (`mover`). Held weakly: a body its
 * view let go of is not kept for this (the memory hunt of 2026-11-04).
 */
const MOVERS = new Set<WeakRef<Object3D>>();
const registered = new WeakSet<Object3D>();

/** Registers `o` as a mover (see MOVERS); returns it. */
export function mover<T extends Object3D>(o: T): T {
  if (!registered.has(o)) { registered.add(o); MOVERS.add(new WeakRef(o)); }
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

/** Whether a mover root is near the middle (x, z in render space, like its matrixWorld) and drawn at all. */
const near = (o: Object3D, x: number, z: number): boolean => {
  const e = o.matrixWorld.elements;
  return o.parent !== null && Math.hypot(e[12] - x, e[14] - z) <= MOVER_RANGE;
};

/** What a frame hands a shadow node (three's NodeFrame, as far as it is used here). */
export type ShadowFrame = {
  scene: Scene;
  renderer: {
    autoClear: boolean;
    render(scene: Scene, camera: object): void;
    copyTextureToTexture(src: DepthTexture, dst: DepthTexture): void;
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
 */
export class MoverShadow {
  /** Draw the whole map (the still world) this frame; else only the near movers over the kept copy. */
  stillDue = true;
  /** The map as last drawn whole, without the near movers. */
  private kept: DepthTexture | null = null;
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
    // The box's middle in render space: the sun's target is set in world space (Sky), matrixWorld is relative (origin.ts).
    const r = frame.renderer, at = this.sun.target.position, x = at.x - ORIGIN.at.x, z = at.z - ORIGIN.at.z;
    if (!map) return whole(frame);
    if (this.stillDue || !this.kept) {
      eachMover((o) => { if (o.visible && near(o, x, z)) { o.visible = false; this.hidden.push(o); } });
      try { whole(frame); } finally { this.unhide(); }
      this.kept ??= keptLike(map);
      r.copyTextureToTexture(map, this.kept);
      this.stillDue = false;
    } else r.copyTextureToTexture(this.kept, map);
    // The near movers over it, in the box the map was drawn with (no clear: the copy stays).
    this.onlyMovers(frame.scene, x, z);
    const clear = r.autoClear;
    r.autoClear = false;
    try { r.render(frame.scene, this.sun.shadow.camera); } finally { r.autoClear = clear; this.unhide(); }
  }

  /** Hides everything in `scene` but the near movers and the lights (the lights stay: they are part of every draw's key). */
  private onlyMovers(scene: Scene, x: number, z: number): void {
    const path = this.path, keep = this.keep;
    path.clear();
    keep.clear();
    eachMover((o) => {
      if (!o.visible || !near(o, x, z)) return;
      keep.add(o);
      for (let p = o.parent; p && !path.has(p); p = p.parent) path.add(p);
    });
    const walk = (node: Object3D): void => {
      for (const c of node.children) {
        if (!c.visible || (c as { isLight?: boolean }).isLight) continue;
        if (path.has(c)) walk(c);
        else if (!keep.has(c)) { c.visible = false; this.hidden.push(c); }
      }
    };
    if (path.has(scene)) walk(scene);
    else for (const c of scene.children) if (c.visible && !(c as { isLight?: boolean }).isLight) { c.visible = false; this.hidden.push(c); }
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
