/**
 * Every three.js matrix keeps its sixteen numbers in a Float64Array instead of a plain array.
 *
 * Why: V8 keeps a plain array of numbers unboxed only while every function that reads or writes it has seen
 * nothing but such arrays. Once one matrix anywhere held its numbers boxed, the optimised code of three's
 * shared readers and writers (`multiplyMatrices`, `compose`, the uniform upload) turned every matrix it met
 * into a boxed one, for good: every number written into any matrix was then a new heap object. In a fight at
 * the hold that was over a gigabyte of garbage in 40 s (the 145 MB collections of Arnd's hitch log). A typed
 * array can never be boxed, whatever the code round it has seen. Measured in Node: multiplying typed matrices
 * takes a third of the time of boxed ones and makes no garbage.
 *
 * Installed by importing this module first (src/main.ts): every Matrix4 made after it gets typed elements.
 * three's own scratch matrices, made when three loaded, are turned typed the first time a method runs on them,
 * for `SWEEP_MS` after install; then the methods are three's own again.
 */
import { Matrix4 } from 'three/webgpu';

/** A Float64Array whose `map` gives a plain array, as three's shader constants expect (`elements.map(...).join()`). */
class Elements extends Float64Array {}
Object.defineProperty(Elements.prototype, 'map', {
  value(this: Float64Array, f: (v: number, i: number) => unknown): unknown[] { return Array.from(this, f); },
});

/** How long methods turn the matrices made before the install typed (ms): the load and the first moments of play. */
const SWEEP_MS = 30_000;

type Any = Record<string, unknown> & { elements: ArrayLike<number> };

function install(): void {
  const P = Matrix4.prototype as unknown as Record<string, unknown>;
  if (Object.getOwnPropertyDescriptor(P, 'elements')) return;
  // The constructor's `this.elements = [...]` meets this setter (the instance has no own `elements` yet).
  Object.defineProperty(P, 'elements', {
    configurable: true,
    set(this: Any, v: ArrayLike<number>) {
      Object.defineProperty(this, 'elements', { value: Elements.from(v), writable: true, enumerable: true, configurable: true });
    },
  });
  const own: [string, (...a: unknown[]) => unknown][] = [];
  for (const k of Object.getOwnPropertyNames(P)) {
    const f = Object.getOwnPropertyDescriptor(P, k)?.value as unknown;
    if (typeof f !== 'function' || k === 'constructor') continue;
    own.push([k, f as (...a: unknown[]) => unknown]);
    P[k] = function (this: Any, ...a: unknown[]) {
      if (!(this.elements instanceof Float64Array)) this.elements = Elements.from(this.elements);
      return (f as (...a: unknown[]) => unknown).apply(this, a);
    };
  }
  const done = setTimeout(() => { for (const [k, f] of own) P[k] = f; }, SWEEP_MS) as unknown as { unref?: () => void };
  done.unref?.(); // (in Node, the tests, it keeps nothing waiting)
}

install();
