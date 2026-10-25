/**
 * The title's toys (plan D46, as in StarLord's title): the world can be clicked. Flocks of birds circle
 * over the town and scatter when clicked; the sky answers with lightning (or a shooting star at night);
 * the town's bell rings; the sea splashes, and now and then a whale breaches; the secret code sends a
 * dragon past the camera. Drawn on a 2D canvas over the 3D view from world positions projected each frame,
 * so the toys cost no shaders (docs/SHADERS.md). Every surprise is drawn from the title's seed.
 */
import { Rng, deriveSeed, type Vec3 } from '@futuremagic/core';
import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { Sound } from '../sound';
import { TOASTS } from './lines';

/** What the toys know of the world. */
export interface ToyWorld {
  height(x: number, z: number): number;
  water(x: number, z: number): { level: number; depth: number } | null;
  /** The town: its middle and how far it reaches. */
  readonly town: { readonly x: number; readonly z: number; readonly r: number } | null;
  /** Game hour, 0..24. */
  hour(): number;
}

export interface ToyHooks {
  toast(text: string): void;
  readonly sound: Sound;
}

interface Bird { phase: number; r: number; h: number; speed: number; flap: number; vel: Vector3 | null; pos: Vector3 }
interface Flock { centre: Vector3; birds: Bird[]; scattered: number; home: boolean }
interface Effect { t: number; readonly dur: number; draw(ctx: CanvasRenderingContext2D, t: number): void }

const BIRD_SPAN = 0.9;
const MAX_REACH = 9000;

export class Toys {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly rng: Rng;
  private readonly flocks: Flock[] = [];
  private effects: Effect[] = [];
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private flash = 0;
  private w0 = 0;
  private h0 = 0;
  private focal = 1;
  private lastToast: Record<string, number> = {};

  constructor(private readonly canvas: HTMLCanvasElement, private readonly camera: PerspectiveCamera, private readonly world: ToyWorld, seed: number, private readonly hooks: ToyHooks) {
    this.ctx = canvas.getContext('2d')!;
    this.rng = new Rng(deriveSeed(seed, 'toys'));
    if (world.town) for (let i = 0; i < 3; i++) this.flocks.push(this.flock(this.roost(), 10 + this.rng.int(0, 10), true));
  }

  /** A click on the world at page coordinates. */
  click(px: number, py: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = px - rect.left, y = py - rect.top;
    // Birds first: the closest flock within reach of the pointer scatters.
    for (const f of this.flocks) {
      if (f.scattered > 0) continue;
      if (f.birds.some((b) => { const s = this.screen(b.pos); return s && Math.hypot(s[0] - x, s[1] - y) < 28 + s[2] * 2; })) {
        this.scatter(f, f.centre);
        this.say('birds', 0.5);
        return;
      }
    }
    const hit = this.cast(x, y);
    if (!hit) {
      const h = this.world.hour();
      if (h < 5.3 || h > 20.5) this.star(x, y);
      else this.bolt(x, y);
      return;
    }
    const [hx, hy, hz] = hit.at;
    const t = this.world.town;
    if (hit.water) {
      const deep = hit.water.depth > 4;
      if (deep && this.rng.chance(0.35)) this.whale(hit.at);
      else this.splash(hit.at, deep ? 1 : 0.5);
      return;
    }
    if (t && Math.hypot(hx - t.x, hz - t.z) < t.r) {
      this.bell([t.x, this.world.height(t.x, t.z) + 25, t.z]);
      return;
    }
    // The land: birds start up from the trees there.
    const f = this.flock(new Vector3(hx, hy + 6, hz), 6 + this.rng.int(0, 6), false);
    this.flocks.push(f);
    this.scatter(f, new Vector3(hx, hy - 10, hz));
    this.hooks.sound.play('birds', 0.7);
  }

  /** The secret code: a dragon passes the camera. */
  dragon(): void {
    const c = this.camera, fwd = c.getWorldDirection(new Vector3()).setY(0).normalize();
    const right = new Vector3().crossVectors(fwd, c.up).normalize();
    const side = this.rng.sign();
    const p = (f: number, r: number, u: number) => c.position.clone().addScaledVector(fwd, f).addScaledVector(right, r * side).setY(c.position.y + u);
    const a = p(1400, -900, 160), b = p(140, -30, 25), e = p(500, 1200, 90);
    const dur = 7.5;
    const pos = new Vector3(), prev = new Vector3();
    const along = (u: number, out: Vector3) => out.copy(a).multiplyScalar((1 - u) * (1 - u)).addScaledVector(b, 2 * u * (1 - u)).addScaledVector(e, u * u);
    this.hooks.sound.play('dragon');
    this.toastOf('dragon');
    this.effects.push({
      t: 0, dur,
      draw: (ctx, t) => {
        const u = t / dur;
        along(u, pos);
        along(Math.max(0, u - 0.01), prev);
        const s = this.screen(pos), q = this.screen(prev);
        if (!s || !q) return;
        drawDragon(ctx, s[0], s[1], Math.atan2(s[1] - q[1], s[0] - q[0]), (30 * this.focal) / s[2], t);
      },
    });
  }

  /** One frame: sizes the canvas, moves the birds, draws everything. */
  frame(dt: number): void {
    const cv = this.canvas, dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (Math.round(w * dpr) !== cv.width || Math.round(h * dpr) !== cv.height) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    this.w0 = w;
    this.h0 = h;
    this.focal = h / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.camera.updateMatrixWorld();
    for (const f of this.flocks) this.circle(f, dt);
    for (let i = this.flocks.length - 1; i >= 0; i--) if (!this.flocks[i].home && this.flocks[i].scattered > 6) this.flocks.splice(i, 1);
    for (const f of this.flocks) this.drawFlock(ctx, f);
    for (const e of this.effects) { e.t += dt; if (e.t < e.dur) e.draw(ctx, e.t); }
    this.effects = this.effects.filter((e) => e.t < e.dur);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(230,240,255,${(this.flash * 0.45).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      this.flash = Math.max(0, this.flash - dt * 4);
    }
  }

  // --- birds -------------------------------------------------------------------------------------------

  /** A place over the land near the town for a flock to circle. */
  private roost(): Vector3 {
    const t = this.world.town!;
    const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(80, 320);
    const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
    return new Vector3(x, this.world.height(x, z) + this.rng.range(90, 160), z);
  }

  private flock(centre: Vector3, n: number, home: boolean): Flock {
    const birds: Bird[] = [];
    for (let i = 0; i < n; i++) {
      birds.push({ phase: this.rng.range(0, Math.PI * 2), r: this.rng.range(8, 26), h: this.rng.range(-5, 5), speed: this.rng.range(0.35, 0.6) * this.rng.sign(), flap: this.rng.range(0, 10), vel: null, pos: new Vector3() });
    }
    const f = { centre, birds, scattered: 0, home };
    this.circle(f, 0);
    return f;
  }

  private scatter(f: Flock, from: Vector3): void {
    f.scattered = 0.001;
    for (const b of f.birds) {
      const away = b.pos.clone().sub(from).setY(0).normalize();
      b.vel = away.multiplyScalar(this.rng.range(9, 16)).setY(this.rng.range(6, 14));
    }
  }

  private circle(f: Flock, dt: number): void {
    if (f.scattered > 0) {
      f.scattered += dt;
      for (const b of f.birds) {
        b.pos.addScaledVector(b.vel!, dt);
        b.vel!.y += dt * 1.5;
        b.flap += dt * 22;
      }
      // A home flock settles somewhere else after a while.
      if (f.home && f.scattered > 7) {
        f.centre.copy(this.roost());
        f.scattered = 0;
        for (const b of f.birds) b.vel = null;
      }
      if (f.scattered > 0) return;
    }
    f.centre.x += Math.sin(f.birds[0].phase * 0.1) * dt * 2;
    for (const b of f.birds) {
      b.phase += b.speed * dt;
      b.flap += dt * (9 + Math.sin(b.phase * 3) * 4);
      b.pos.set(f.centre.x + Math.cos(b.phase) * b.r, f.centre.y + b.h + Math.sin(b.phase * 2) * 2.5, f.centre.z + Math.sin(b.phase) * b.r);
    }
  }

  private drawFlock(ctx: CanvasRenderingContext2D, f: Flock): void {
    const fade = f.home ? 1 : Math.max(0, 1 - Math.max(0, f.scattered - 4) / 2);
    ctx.lineCap = 'round';
    for (const b of f.birds) {
      const s = this.screen(b.pos);
      if (!s) continue;
      const span = Math.max(2.6, (BIRD_SPAN * this.focal) / s[2]) * 2.2;
      const lift = Math.sin(b.flap) * span * 0.45;
      const width = Math.max(1.1, span * 0.16);
      ctx.beginPath();
      ctx.moveTo(s[0] - span, s[1] - lift);
      ctx.quadraticCurveTo(s[0] - span * 0.4, s[1] - span * 0.15, s[0], s[1]);
      ctx.quadraticCurveTo(s[0] + span * 0.4, s[1] - span * 0.15, s[0] + span, s[1] - lift);
      // A pale rim, so a bird shows over dark land as well as against the sky.
      ctx.strokeStyle = `rgba(255,240,215,${(0.4 * fade).toFixed(3)})`;
      ctx.lineWidth = width + 1.6;
      ctx.stroke();
      ctx.strokeStyle = `rgba(22,18,16,${(0.9 * fade).toFixed(3)})`;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  // --- the sky -----------------------------------------------------------------------------------------

  private bolt(x: number, y: number): void {
    const pts = jagged(this.rng, x + this.rng.range(-90, 90), -10, x, y, 7);
    const branches = [0, 1].map(() => {
      const from = pts[this.rng.int(2, pts.length - 3)];
      return jagged(this.rng, from[0], from[1], from[0] + this.rng.range(-120, 120), from[1] + this.rng.range(40, 140), 4);
    });
    this.flash = 1;
    window.setTimeout(() => this.hooks.sound.play('thunder'), 250);
    this.toastOf('bolt', 0.6);
    this.effects.push({
      t: 0, dur: 0.75,
      draw: (ctx, t) => {
        // Flickers twice, then fades.
        const a = t < 0.08 ? 1 : t < 0.16 ? 0.15 : t < 0.3 ? 1 : 1 - (t - 0.3) / 0.45;
        ctx.save();
        ctx.shadowColor = '#bfe8ff';
        ctx.shadowBlur = 24;
        ctx.strokeStyle = `rgba(235,248,255,${a.toFixed(3)})`;
        for (const [line, width] of [[pts, 3.2], ...branches.map((b) => [b, 1.6] as const)] as const) {
          ctx.lineWidth = width;
          ctx.beginPath();
          line.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  }

  private star(x: number, y: number): void {
    const dx = this.rng.range(-1, -0.5) * this.rng.sign(), dy = this.rng.range(0.3, 0.6);
    this.hooks.sound.play('ward', 0.6);
    this.toastOf('star', 0.5);
    this.effects.push({
      t: 0, dur: 1.1,
      draw: (ctx, t) => {
        const u = t / 1.1, len = 260 * u, hx = x + dx * 420 * u, hy = y + dy * 420 * u;
        const g = ctx.createLinearGradient(hx - dx * len, hy - dy * len, hx, hy);
        g.addColorStop(0, 'rgba(232,251,255,0)');
        g.addColorStop(1, `rgba(232,251,255,${(1 - u).toFixed(3)})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(hx - dx * len, hy - dy * len);
        ctx.lineTo(hx, hy);
        ctx.stroke();
      },
    });
  }

  // --- town and sea ------------------------------------------------------------------------------------

  private bell(at: Vec3): void {
    this.hooks.sound.play('bell');
    this.toastOf('bell');
    const p = new Vector3(...at);
    this.effects.push({
      t: 0, dur: 3,
      draw: (ctx, t) => {
        const s = this.screen(p);
        if (!s) return;
        for (let i = 0; i < 3; i++) {
          const u = (t - i * 0.45) / 1.8;
          if (u <= 0 || u >= 1) continue;
          ctx.strokeStyle = `rgba(240,201,106,${(0.9 * (1 - u)).toFixed(3)})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(s[0], s[1], 12 + u * 110, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
      },
    });
  }

  private splash(at: Vec3, size: number): void {
    this.hooks.sound.play('splash', 0.5 + size * 0.4);
    if (size >= 1) this.toastOf('splash', 0.5);
    this.ripples(new Vector3(...at), 6 * size, 2.2);
  }

  private whale(at: Vec3): void {
    const p = new Vector3(...at), heading = this.rng.range(0, Math.PI * 2);
    this.toastOf('whale');
    window.setTimeout(() => this.hooks.sound.play('splash'), 1500);
    const body = new Vector3();
    this.effects.push({
      t: 0, dur: 3.2,
      draw: (ctx, t) => {
        // Out of the water, up in an arc, and back in with a crash.
        const u = Math.min(1, t / 2.4), rise = Math.sin(u * Math.PI) * 14;
        body.set(p.x + Math.cos(heading) * (u - 0.5) * 30, p.y + rise - 4, p.z + Math.sin(heading) * (u - 0.5) * 30);
        const s = this.screen(body), w = this.screen(p);
        if (!s || !w || t > 2.4) return;
        const len = (20 * this.focal) / s[2];
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, this.w0, w[1] + len * 0.05);
        ctx.clip();
        ctx.translate(s[0], s[1]);
        ctx.rotate(-0.9 + u * 1.8);
        ctx.fillStyle = '#1c2630';
        ctx.beginPath();
        ctx.ellipse(0, 0, len / 2, len / 7, 0, 0, Math.PI * 2);
        ctx.moveTo(-len / 2, 0);
        ctx.lineTo(-len * 0.72, -len * 0.13);
        ctx.lineTo(-len * 0.66, 0);
        ctx.lineTo(-len * 0.72, len * 0.13);
        ctx.fill();
        ctx.restore();
      },
    });
    this.ripples(p, 14, 3.2, 2.2);
  }

  /** Rings spreading on the water from `p` (metres across at the end), after `delay` seconds. */
  private ripples(p: Vector3, size: number, dur: number, delay = 0): void {
    this.effects.push({
      t: -delay, dur,
      draw: (ctx, t) => {
        if (t < 0) return;
        const s = this.screen(p);
        if (!s) return;
        const px = (size * this.focal) / s[2];
        for (let i = 0; i < 3; i++) {
          const u = (t - i * 0.3) / (dur * 0.8);
          if (u <= 0 || u >= 1) continue;
          ctx.strokeStyle = `rgba(235,248,255,${(0.8 * (1 - u)).toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(s[0], s[1], px * (0.3 + u), px * (0.3 + u) * 0.35, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Spray in the first moment.
        if (t < 0.6) {
          ctx.fillStyle = `rgba(235,248,255,${(0.8 * (1 - t / 0.6)).toFixed(3)})`;
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI, r = px * 0.6 * (t / 0.6);
            ctx.fillRect(s[0] + Math.cos(a) * r * (i % 2 ? 1 : -1), s[1] - Math.sin(a) * r * 0.9 - px * 0.3 * Math.sin((t / 0.6) * Math.PI), 2.4, 2.4);
          }
        }
      },
    });
  }

  // --- helpers -----------------------------------------------------------------------------------------

  /** A toast of a kind, not too often for the same kind (`chance` of showing at all). */
  private toastOf(kind: keyof typeof TOASTS, chance = 1): void {
    const now = performance.now();
    if ((this.lastToast[kind] ?? -1e9) > now - 6000 || !this.rng.chance(chance)) return;
    this.lastToast[kind] = now;
    this.hooks.toast(this.rng.pick(TOASTS[kind]));
  }

  private say(kind: keyof typeof TOASTS, chance: number): void {
    this.hooks.sound.play('birds');
    this.toastOf(kind, chance);
  }

  /** Page position (x, y) and distance of a world point, or null behind the camera or off the page. */
  private screen(p: Vector3): [number, number, number] | null {
    const c = this.camera;
    this.w.copy(p).sub(c.position);
    const dist = this.w.length();
    this.v.copy(p).project(c);
    if (this.v.z > 1 || this.v.z < -1) return null;
    const x = ((this.v.x + 1) / 2) * this.w0, y = ((1 - this.v.y) / 2) * this.h0;
    if (x < -200 || y < -200 || x > this.w0 + 200 || y > this.h0 + 200) return null;
    return [x, y, Math.max(1, dist)];
  }

  /** What the pointer at page (x, y) points at: land or water, or nothing (the sky). */
  private cast(x: number, y: number): { at: Vec3; water: { level: number; depth: number } | null } | null {
    const c = this.camera;
    const dir = this.v.set((x / this.w0) * 2 - 1, 1 - (y / this.h0) * 2, 0.5).unproject(c).sub(c.position).normalize();
    const o = c.position;
    let t = 2;
    while (t < MAX_REACH) {
      const px = o.x + dir.x * t, py = o.y + dir.y * t, pz = o.z + dir.z * t;
      const water = this.world.water(px, pz);
      if (water && water.depth > 0 && py < water.level) return { at: [px, water.level, pz], water };
      if (py < this.world.height(px, pz)) return { at: [px, py, pz], water: null };
      t += Math.max(1.5, t * 0.015);
    }
    return null;
  }
}

/** A jagged line from (x0, y0) to (x1, y1): midpoints pushed sideways, `depth` times halved. */
function jagged(rng: Rng, x0: number, y0: number, x1: number, y1: number, depth: number): [number, number][] {
  let pts: [number, number][] = [[x0, y0], [x1, y1]];
  let spread = Math.hypot(x1 - x0, y1 - y0) * 0.22;
  for (let d = 0; d < depth; d++) {
    const next: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      next.push([(ax + bx) / 2 + rng.range(-spread, spread), (ay + by) / 2 + rng.range(-spread, spread) * 0.3], pts[i]);
    }
    pts = next;
    spread *= 0.55;
  }
  return pts;
}

/** The dragon's silhouette at (x, y), heading `angle` on the page, `len` pixels long. */
function drawDragon(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number, t: number): void {
  if (len < 2) return;
  const flap = Math.sin(t * 5);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (Math.cos(angle) < 0) ctx.scale(1, -1);
  ctx.fillStyle = '#1a1210';
  ctx.strokeStyle = '#1a1210';
  // Body and neck, head forward.
  ctx.beginPath();
  ctx.ellipse(0, 0, len * 0.28, len * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.lineWidth = len * 0.05;
  ctx.beginPath();
  ctx.moveTo(len * 0.2, 0);
  ctx.quadraticCurveTo(len * 0.38, -len * 0.08, len * 0.48, -len * 0.04);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(len * 0.47, -len * 0.07);
  ctx.lineTo(len * 0.6, -len * 0.03);
  ctx.lineTo(len * 0.47, 0);
  ctx.fill();
  // The tail, swinging.
  ctx.lineWidth = len * 0.03;
  ctx.beginPath();
  ctx.moveTo(-len * 0.25, 0);
  ctx.quadraticCurveTo(-len * 0.45, len * 0.06 * Math.sin(t * 2), -len * 0.62, -len * 0.03);
  ctx.stroke();
  // Wings seen from the side: the far one a little behind and paler, both beating together.
  for (const [k, back, alpha] of [[0.8, len * 0.06, 0.7], [1, 0, 1]] as const) {
    const tip = -len * (0.12 + 0.5 * flap) * k;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(len * 0.12 - back, 0);
    ctx.lineTo(-len * 0.02 - back, tip);
    ctx.lineTo(-len * 0.1 - back, tip * 0.72);
    ctx.lineTo(-len * 0.18 - back, tip * 0.8);
    ctx.lineTo(-len * 0.24 - back, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
