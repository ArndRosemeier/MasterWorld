/**
 * Speech bubbles (D52, C10): rare, only for an urgent line (a cry for help). One bubble at a time, over the
 * head of whoever calls it out, following them on screen while they are in view; it fades after a few
 * seconds. The game camera is in world coordinates, so world points project with it directly.
 */
import { Vector3, type Camera } from 'three/webgpu';
import { overlay } from './dom';
import './hud.css';

/** How long a cry stays (s), and how far over the ground it floats (m). */
const SHOWN = 5;
const OVER_HEAD = 2.2;

export class Speech {
  private readonly el = overlay('speech', 'position:fixed;left:0;top:0;pointer-events:none;display:none;z-index:6');
  private who: (() => { x: number; y: number; z: number } | null) | null = null;
  private left = 0;
  private readonly at = new Vector3();

  constructor(private readonly camera: Camera) {
    this.el.className = 'speech';
  }

  /** `text` over the head of whoever `who` says stands where (their feet; null: gone), for a few seconds. */
  say(text: string, who: () => { x: number; y: number; z: number } | null): void {
    this.el.textContent = text;
    this.who = who;
    this.left = SHOWN;
  }

  /** The line now, if one shows (the checks read it). */
  get line(): string | null { return this.left > 0 ? this.el.textContent : null; }

  /** Each frame: follow the speaker; out of view, hidden; fades at the end. */
  hover(dt: number): void {
    this.left = Math.max(0, this.left - dt);
    const p = this.left > 0 ? this.who?.() : null;
    if (!p) { this.el.style.display = 'none'; return; }
    const v = this.at.set(p.x, p.y + OVER_HEAD, p.z).project(this.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { this.el.style.display = 'none'; return; }
    this.el.style.display = 'block';
    this.el.style.opacity = String(Math.min(1, this.left / 0.6));
    this.el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
  }
}
