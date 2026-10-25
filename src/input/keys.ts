/** Key presses anywhere in the page (`first`: before every other listener, to take keys from the game). */
export function onKeyDown(f: (e: KeyboardEvent) => void, first = false): void {
  window.addEventListener('keydown', f, first);
}
