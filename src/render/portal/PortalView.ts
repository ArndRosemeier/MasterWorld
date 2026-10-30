/**
 * Drawing through portals (game/portal.ts joins the places; this draws the view). Each frame, for an opening in
 * sight: the camera is moved by the portal's step (@futuremagic/stage throughPortal), its near plane laid on the
 * far opening (clipNear), and the place beyond drawn with that camera into a twin of the scene target (same
 * formats: no pipeline is built for it), scissored to the opening's rectangle on the screen. Then, once the
 * scene itself is drawn, the opening's own mesh is drawn into the scene target with that view on it
 * (materials/portal.ts), hidden where something on this side stands in front of it.
 *
 * What is drawn beyond and how it is lit is the caller's (`PortalPass.beyond`): it shows the far realm's
 * objects, sets its light, and gives back what undoes that. Openings in the view beyond are not drawn again
 * (one level deep).
 */
import { BufferGeometry, Float32BufferAttribute, Group, Matrix4, PerspectiveCamera, Quaternion, Vector3, type Light, type Mesh, type Object3D, type RenderTarget } from 'three/webgpu';
import { clipNear, openingPlane, screenRect, throughPortal, type PostHooks } from '@futuremagic/stage';
import { kindMesh } from '../materials';
import { PORTAL, PORTAL_VIEW } from '../materials/portal';
import { ORIGIN } from '../origin';
import type { View } from '../view';

/** A frame on its floor, as the game's portals give it (x, y, z; yaw as a walker's). */
export interface FrameXYZ { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number }

/** One opening drawn this frame. */
export interface PortalPass {
  /** The opening seen (in the camera's realm) and the one it is joined to, world. */
  readonly here: FrameXYZ;
  readonly there: FrameXYZ;
  /** The opening's mesh (`opening`), standing at `here`. */
  readonly mesh: Mesh;
  /** Show the far realm and set its light; returns what puts this side's back. */
  beyond(): () => void;
  /**
   * The view beyond draws the shadow maps due this frame (it is drawn first): when the land is beyond and the camera
   * is below, the sun's map must be drawn of the land, not of the cave.
   */
  readonly shadows?: boolean;
}

const UP = new Vector3(0, 1, 0);

/** A frame as a matrix: at its point, turned by its yaw round the up axis (relative to the floating origin when `rel`). */
export function frameMatrix(f: FrameXYZ, rel = false, out = new Matrix4()): Matrix4 {
  return out.compose(new Vector3(f.x - (rel ? ORIGIN.at.x : 0), f.y, f.z - (rel ? ORIGIN.at.z : 0)), new Quaternion().setFromAxisAngle(UP, f.yaw), new Vector3(1, 1, 1));
}

export class PortalView {
  /** The openings' meshes (each shown only while its view is laid in). */
  readonly group = new Group();
  private readonly twin: RenderTarget | null;
  private readonly drawnCam = new PerspectiveCamera();
  private readonly from = new Matrix4();
  private readonly to = new Matrix4();
  /** This frame's opening and whether its view was drawn. */
  private pass: PortalPass | null = null;
  private drawn = false;
  /** How many views were drawn through openings (for checks). */
  views = 0;

  constructor(private readonly view: View) {
    this.group.name = 'portal openings';
    this.group.visible = false;
    this.twin = view.post?.twin() ?? null;
    if (this.twin) PORTAL_VIEW.value = this.twin.texture;
  }

  /** The opening's mesh for an outline (u across, v up, in its plane), placed at `at` (world). */
  opening(outline: readonly (readonly [number, number])[], at: FrameXYZ): Mesh {
    const pos: number[] = [0, outline.reduce((m, [, v]) => Math.max(m, v), 0) / 2, 0];
    for (const [u, v] of outline) pos.push(u, v, 0);
    const idx: number[] = [];
    for (let i = 1; i < outline.length; i++) idx.push(0, i, i + 1);
    idx.push(0, outline.length, 1);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = kindMesh(g, PORTAL, at.x, at.y, at.z);
    m.rotation.y = at.yaw;
    m.updateMatrix();
    m.name = 'portal opening';
    m.visible = false;
    this.group.add(m);
    return m;
  }

  /** Move an opening's mesh to `at` (world). */
  moveOpening(mesh: Mesh, at: FrameXYZ): void {
    mesh.position.set(at.x, at.y, at.z);
    mesh.rotation.y = at.yaw;
    mesh.updateMatrix();
  }

  /** The hooks for this frame's draw (Post.draw): the opening `pass` (null: none). */
  hooks(pass: PortalPass | null): PostHooks {
    this.pass = this.twin ? pass : null;
    this.drawn = false;
    return { before: () => this.before(), between: () => this.between() };
  }

  /** The view beyond, into the twin target. */
  private before(): void {
    const p = this.pass, twin = this.twin;
    if (!p || !twin) return;
    const r = this.view.renderer, main = this.view.drawn;
    // Where the opening covers the screen (nothing to draw when it is off it).
    const corners = cornersOf(p.mesh, ORIGIN.at);
    const rect = screenRect(corners, main, twin.width, twin.height);
    if (!rect) return;
    // The camera moved through the portal, its near plane on the far opening; relative to the floating origin.
    frameMatrix(p.here, true, this.from);
    frameMatrix(p.there, true, this.to);
    throughPortal(main, this.from, this.to, this.drawnCam);
    if (!clipNear(this.drawnCam, openingPlane(this.to))) return;
    const back = p.beyond();
    // No shadow map is drawn for the view beyond, unless it is the one place that needs it this frame.
    const held = p.shadows ? () => {} : holdShadows(this.view.scene);
    const prev = r.getRenderTarget(), test = r.getScissorTest();
    // three's scissor rectangle counts from the top left on both backends (the WebGL one turns it over itself).
    twin.scissor.set(rect.x, rect.y, rect.w, rect.h);
    r.setScissorTest(true);
    r.setRenderTarget(twin);
    r.render(this.view.scene, this.drawnCam);
    r.setRenderTarget(prev);
    r.setScissorTest(test);
    held();
    back();
    this.drawn = true;
    this.views++;
  }

  /** The opening, with the view on it, into the scene target (still set). */
  private between(): void {
    const p = this.pass;
    if (!p || !this.drawn) return;
    const r = this.view.renderer, scene = this.view.scene;
    // Only the opening is drawn (lights stay: they are part of every shader's key); nothing is cleared.
    const hidden: Object3D[] = [];
    for (const o of scene.children) if (o !== this.group && o.visible && !(o as Light).isLight) { o.visible = false; hidden.push(o); }
    this.group.visible = true;
    p.mesh.visible = true;
    const keep = { auto: r.autoClear, color: r.autoClearColor, depth: r.autoClearDepth, stencil: r.autoClearStencil };
    r.autoClear = r.autoClearColor = r.autoClearDepth = r.autoClearStencil = false;
    r.render(scene, this.view.drawn);
    r.autoClear = keep.auto; r.autoClearColor = keep.color; r.autoClearDepth = keep.depth; r.autoClearStencil = keep.stencil;
    p.mesh.visible = false;
    this.group.visible = false;
    for (const o of hidden) o.visible = true;
  }
}

/** The opening's outline corners (relative to the floating origin), from its mesh. */
function cornersOf(mesh: Mesh, origin: Vector3): Vector3[] {
  mesh.updateMatrix();
  const pos = mesh.geometry.getAttribute('position'), out: Vector3[] = [];
  for (let i = 1; i < pos.count; i++) out.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix).sub(new Vector3(origin.x, 0, origin.z)));
  return out;
}

/** Every light's pending shadow redraw held back for a moment; returns what lets them go again. */
function holdShadows(scene: Object3D): () => void {
  const held: Light[] = [];
  for (const o of scene.children) {
    const l = o as Light & { shadow?: { needsUpdate: boolean } };
    if (l.isLight && l.shadow?.needsUpdate) { l.shadow.needsUpdate = false; held.push(l); }
  }
  return () => { for (const l of held) (l as Light & { shadow: { needsUpdate: boolean } }).shadow.needsUpdate = true; };
}
