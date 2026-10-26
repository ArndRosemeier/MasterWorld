/**
 * The map hand-over (plan 9.1, D35): when someone tells of a place, the hero holds out their map, the
 * teller takes it and draws the mark in with a quill, and hands it back. A card of the real map (around
 * the mark) rises from the hero's side to the middle of the view, where the person stands, is marked
 * there and goes back down. Several marks at once are handed over one after another.
 */
import { lerp } from '@futuremagic/core';
import { el } from './dom';

/** What the hand-over draws on: the map around a lead's mark, the mark drawn in to `t` (0..1). */
export type MarkPainter = (id: string, canvas: HTMLCanvasElement, t: number) => void;

/** The phases, in seconds: up to the teller, a moment, the mark drawn, a look at it, back. */
const UP = 0.7, WAIT = 0.25, MARK = 1.4, LOOK = 0.7, BACK = 0.6;
const SIDE = 320;

/** Where the card is and how it turns, `t` seconds into a hand-over (pure, for the check). */
export function cardAt(t: number): { x: number; y: number; turn: number; scale: number; alpha: number; mark: number } {
  const ease = (k: number) => k * k * (3 - 2 * k);
  const marking = UP + WAIT, back = marking + MARK + LOOK;
  // From the hero's hand (low left), to the middle of the view (where the teller stands), and back.
  const held = { x: 0.42, y: 0.46, turn: 0.04, scale: 1 }, hand = { x: 0.22, y: 1.05, turn: -0.35, scale: 0.55 };
  const k = t < UP ? ease(t / UP) : t < back ? 1 : 1 - ease(Math.min(1, (t - back) / BACK));
  // While it is marked it tips a little, as if held and written on.
  const tip = t > marking && t < back ? Math.sin((t - marking) * 5) * 0.015 : 0;
  return {
    x: lerp(hand.x, held.x, k), y: lerp(hand.y, held.y, k), turn: lerp(hand.turn, held.turn, k) + tip, scale: lerp(hand.scale, held.scale, k),
    alpha: Math.min(1, k * 2.5), mark: Math.max(0, Math.min(1, (t - marking) / MARK)),
  };
}

export const HAND_OVER_SECONDS = UP + WAIT + MARK + LOOK + BACK;

export class HandOver {
  private readonly canvas = el('canvas', { width: SIDE, height: SIDE });
  private readonly card = el('div', { className: 'handover' }, this.canvas);
  private readonly queue: string[] = [];
  private playing = false;

  constructor(private readonly paint: MarkPainter, private readonly quill: () => void) {
    this.card.style.opacity = '0';
    document.body.append(this.card);
  }

  /** Hand the map over for this lead's mark. */
  give(id: string): void {
    this.queue.push(id);
    if (!this.playing) this.next();
  }

  private next(): void {
    const id = this.queue.shift();
    if (id === undefined) { this.playing = false; return; }
    this.playing = true;
    const t0 = performance.now();
    let scratched = false;
    const animate = () => {
      const t = (performance.now() - t0) / 1000;
      const c = cardAt(Math.min(t, HAND_OVER_SECONDS));
      if (c.mark > 0 && !scratched) { scratched = true; this.quill(); }
      this.paint(id, this.canvas, c.mark);
      if (c.mark > 0 && c.mark < 1) this.drawQuill(c.mark);
      const w = this.card.offsetWidth, h = this.card.offsetHeight;
      this.card.style.transform = `translate(${c.x * innerWidth - w / 2}px, ${c.y * innerHeight - h / 2}px) rotate(${c.turn}rad) scale(${c.scale})`;
      this.card.style.opacity = String(c.alpha);
      if (t < HAND_OVER_SECONDS) requestAnimationFrame(animate);
      else { this.card.style.opacity = '0'; this.next(); }
    };
    animate();
  }

  /** The quill's tip on the ring as it is drawn (the mark sits in the card's middle). */
  private drawQuill(t: number): void {
    const g = this.canvas.getContext('2d')!;
    const a = -Math.PI / 2 + Math.PI * 2 * t, m = SIDE / 2;
    const x = m + Math.cos(a) * 12, y = m + Math.sin(a) * 12;
    g.lineCap = 'round';
    g.strokeStyle = '#2a1e12'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 34, y - 44); g.stroke();
    g.strokeStyle = '#efe6d2cc'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(x + 24, y - 31); g.quadraticCurveTo(x + 48, y - 56, x + 62, y - 88); g.stroke();
  }
}
