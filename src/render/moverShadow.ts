/**
 * The sun's shadow in two maps: the still world's, drawn every few frames (Sky.shadowEvery: drawing every caster
 * again is the dearest pass of a town frame), and the movers' (the hero, townsfolk, creatures, beasts) near the
 * camera, drawn every frame. A mover's shadow drawn every third frame trails its body and twitches as it walks
 * (Arnd, 2026-11-04: fine far off, not for the hero). The lit shaders take the product of the two (three's custom
 * `shadow.shadowNode`); the second map's light lights nothing, it only lends its shadow.
 *
 * Which map draws a mover goes by where it is: within MOVER_RANGE of the box's middle the movers' map, beyond it
 * the still map (far off a late shadow does not show), so nobody is drawn into both. WebGPU only (Sky.movers: on
 * WebGL 2 the second sampler is one more than the busiest shader has).
 */
import { DirectionalLight, type Node, type Object3D, type OrthographicCamera, type Scene } from 'three/webgpu';
import { shadow } from 'three/tsl';

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

/** Metres round the box's middle in which movers go into the movers' map. */
export const MOVER_RANGE = 40;
/**
 * Half the side of the movers' shadow box (m): their range and a body. The box stands across the light, so a
 * shadow however long falls where its caster is in the map; ground beyond the box takes no shadow from it.
 */
const MOVER_EXTENT = 44;
/** The movers' map's side in texels (4.3 cm each: sharper than the still map's 7.8 cm). */
const MOVER_MAP = 2048;

/** Whether a mover root is near the middle (x, z in render space) and drawn at all. */
const near = (o: Object3D, x: number, z: number): boolean => {
  const e = o.matrixWorld.elements;
  return o.parent !== null && Math.hypot(e[12] - x, e[14] - z) <= MOVER_RANGE;
};

/** A shadow node as far as drawing its map goes (three's ShadowNode.renderShadow). */
export type Shadowing = { renderShadow(frame: { scene: Scene }): void };

/**
 * Splits `sun`'s shadow (see above). Call `follow` every frame after the sun's box moved (its position and target).
 * Set before the warm-up: the product is part of every lit shader.
 */
export class MoverShadow {
  /** The light the movers' map is drawn from (never in the scene: it lights nothing). */
  readonly light = new DirectionalLight();
  private readonly at = { x: 0, z: 0 };
  private readonly hidden: Object3D[] = [];
  private readonly path = new Set<Object3D>();
  private readonly keep = new Set<Object3D>();
  /** The two shadow nodes (the still map's, the movers'), their drawing wrapped as above. */
  readonly passes: { readonly still: Shadowing; readonly moving: Shadowing };

  constructor(private readonly sun: DirectionalLight) {
    const m = this.light, s = sun.shadow;
    m.castShadow = true;
    m.shadow.autoUpdate = false;
    m.shadow.camera.layers.mask = s.camera.layers.mask;
    m.shadow.mapSize.setScalar(MOVER_MAP);
    m.shadow.bias = s.bias;
    m.shadow.normalBias = s.normalBias * (MOVER_EXTENT / ((s.camera as OrthographicCamera).right || MOVER_EXTENT));
    const c = m.shadow.camera as OrthographicCamera, sc = s.camera as OrthographicCamera;
    c.left = -MOVER_EXTENT; c.right = MOVER_EXTENT; c.top = MOVER_EXTENT; c.bottom = -MOVER_EXTENT;
    c.near = sc.near; c.far = sc.far;
    c.updateProjectionMatrix();
    // (Typed as float nodes: three's types give the ShadowNode none of a node's maths, which it has at run time.)
    const still = shadow(sun) as unknown as Node<'float'>, moving = shadow(m) as unknown as Node<'float'>;
    // The still map without the near movers; the movers' map with nothing but them.
    const stillNode = still as unknown as Shadowing, movingNode = moving as unknown as Shadowing;
    const drawStill = stillNode.renderShadow.bind(still), drawMoving = movingNode.renderShadow.bind(moving);
    stillNode.renderShadow = (frame) => {
      eachMover((o) => { if (o.visible && near(o, this.at.x, this.at.z)) { o.visible = false; this.hidden.push(o); } });
      try { drawStill(frame); } finally { this.unhide(); }
    };
    movingNode.renderShadow = (frame) => {
      this.onlyMovers(frame.scene);
      try { drawMoving(frame); } finally { this.unhide(); }
    };
    this.passes = { still: stillNode, moving: movingNode };
    (s as unknown as { shadowNode: unknown }).shadowNode = still.mul(moving);
  }

  /** Follows the sun's box (its middle and direction) and asks for this frame's movers' map. */
  follow(): void {
    const sun = this.sun, m = this.light;
    m.position.copy(sun.position);
    m.target.position.copy(sun.target.position);
    m.updateMatrixWorld();
    m.target.updateMatrixWorld();
    this.at.x = sun.target.position.x;
    this.at.z = sun.target.position.z;
    m.shadow.needsUpdate = sun.castShadow && sun.intensity > 0;
  }

  /** Hides everything in `scene` but the near movers and the lights (the lights stay: they are part of every draw's key). */
  private onlyMovers(scene: Scene): void {
    const path = this.path;
    path.clear();
    const keep = this.keep;
    keep.clear();
    eachMover((o) => {
      if (!o.visible || !near(o, this.at.x, this.at.z)) return;
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
