/** Small DOM helpers for the game's windows (plain DOM over the canvas; styles in index.html). */

/** An element with its properties and children. */
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

/** The element with this id, made (on the body) if it is not there yet, with these styles. */
export function overlay(id: string, css: string): HTMLElement {
  const e = document.getElementById(id) ?? document.body.appendChild(Object.assign(document.createElement('div'), { id }));
  e.style.cssText = css;
  return e;
}

/** A button that does `act` when clicked. */
export const button = (label: Node | string, act: () => void, props: Partial<HTMLButtonElement> = {}, ...more: (Node | string)[]): HTMLButtonElement => {
  const b = el('button', props, label, ...more);
  b.addEventListener('click', act);
  return b;
};

/** Hours as a clock: 16.5 → "16:30". */
export function clock(h: number): string {
  const m = Math.round(h * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Markup (an SVG) as nodes to append. */
export const svg = (markup: string): DocumentFragment => document.createRange().createContextualFragment(markup);
