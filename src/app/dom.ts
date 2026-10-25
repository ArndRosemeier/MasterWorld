/** Small DOM helpers for the plain-DOM interface (menu, title). */

/** An element with properties and children: `el('button', { textContent: 'Done', onclick }, icon)`. */
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};
