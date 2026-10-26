/**
 * The shared pieces of warded brass (plan 17.1, D45) that every window and card is built from: the ward
 * rim that traces itself in and then rests with a slow pulse while sparks run along it, the gear that
 * spins in and ticks, the twinkling stars of a legendary thing, and lines that arrive one after another.
 * Styles in brass.css. Only cheap motion: the sparks and the gear move by transform, the rim's pulse is
 * its opacity, so a resting window costs the compositor almost nothing.
 */
import { el, svg } from './dom';
import { GEAR } from './title/art';

export interface RimOptions {
  /** Sparks running along the ward (0, 1 or 2). */
  sparks?: number;
  /** A gear on the top right corner that spins in and ticks. */
  gear?: boolean;
  /** Seconds before the ward starts to trace itself in. */
  delay?: number;
}

/**
 * A ward rim for a box (position: relative or absolute): the ward line around it, its sparks and gear.
 * Its colour is the box's `--ward-colour` (cyan by default; a card's rarity sets it).
 */
export function wardRim({ sparks = 1, gear = false, delay = 0.2 }: RimOptions = {}): HTMLElement {
  const rim = el('div', { className: 'rim', ariaHidden: 'true' },
    svg('<svg class="rim-line" viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="98" rx="1.5" pathLength="100" vector-effect="non-scaling-stroke"/></svg>'));
  rim.style.setProperty('--rim-delay', `${delay}s`);
  for (let k = 0; k < sparks; k++) rim.append(el('i', { className: `spark s${k}` }));
  if (gear) rim.append(el('span', { className: 'gear' }, svg(gearSvg)));
  return rim;
}

/** The gear: brass with a ward-lit hub. */
export const gearSvg = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="${GEAR}" fill="#c99a3e" stroke="#6e4f17" stroke-width="1.5"/><circle cx="24" cy="24" r="7" fill="#1d1510" stroke="#8fe3ff" stroke-width="1.5"/></svg>`;

/** Three small stars that twinkle in turn (a legendary thing). */
export function twinkles(): HTMLElement {
  const star = (cx: number, r: number, fill: string, k: number) =>
    `<path class="tw tw${k}" d="M${cx} ${8 - r}L${cx + r * 0.3} ${8 - r * 0.3}L${cx + r} 8L${cx + r * 0.3} ${8 + r * 0.3}L${cx} ${8 + r}L${cx - r * 0.3} ${8 + r * 0.3}L${cx - r} 8L${cx - r * 0.3} ${8 - r * 0.3}Z" fill="${fill}"/>`;
  return el('span', { className: 'twinkles', ariaHidden: 'true' }, svg(`<svg viewBox="0 0 44 16">${star(7, 6, '#ffc46b', 0)}${star(22, 4, '#8fe3ff', 1)}${star(37, 6, '#ffc46b', 2)}</svg>`));
}

/** Let `items` arrive one after another: each one's entrance starts `step` seconds after the one before. */
export function stagger(items: Iterable<Element>, start: number, step: number): void {
  let k = 0;
  for (const e of items) (e as HTMLElement).style.animationDelay = `${(start + step * k++).toFixed(2)}s`;
}

/** Play an element's entrance again (after it was shown once already). */
export function replay(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}
