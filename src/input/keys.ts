/** Key presses anywhere in the page (`first`: before every other listener, to take keys from the game). */
export function onKeyDown(f: (e: KeyboardEvent) => void, first = false): void {
  window.addEventListener('keydown', f, first);
}

/** Take a key from everyone else (a window that is open handles it). */
export function swallow(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopImmediatePropagation();
}

/**
 * A click on `el` with the left button that is not a drag (the camera turns with the button held): it moved under
 * 6 px and took under 400 ms. `f` gets where on the screen.
 */
export function onClick(el: HTMLElement, f: (x: number, y: number) => void): void {
  let at: { x: number; y: number; t: number } | null = null;
  el.addEventListener('pointerdown', (e) => { if (e.button === 0) at = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  el.addEventListener('pointerup', (e) => {
    if (!at || e.button !== 0) return;
    const click = Math.hypot(e.clientX - at.x, e.clientY - at.y) < 6 && performance.now() - at.t < 400;
    at = null;
    if (click) f(e.clientX, e.clientY);
  });
}
