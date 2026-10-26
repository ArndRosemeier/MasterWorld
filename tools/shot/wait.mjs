/**
 * Waiting on a loaded game page before a picture or a measurement (the shot set, set.mjs, and the origin
 * check, origin.mjs).
 */

/**
 * Waits until everything near the hero is drawn as itself (`game.undrawn` empty: no townsfolk still plain
 * figures, no creatures still warming), at most `most` ms; returns what is still waiting.
 */
export const drawnNear = (page, most) => page.waitForFunction(() => !window.game || window.game.undrawn.length === 0, null, { timeout: most, polling: 200 })
  .then(() => [], () => page.evaluate(() => window.game.undrawn));

/**
 * Waits until no shader was built for 1.5 s (the scene is warm: what is still warming up is not its frame
 * time), at least 1.5 s and at most `most` ms; returns how long that took (s).
 */
export const shadersQuiet = (page, most) => page.evaluate(([most]) => new Promise((done) => {
  const built = () => { const s = window.shaders?.summary(); return s ? s.warmup + s.run : 0; };
  const t0 = performance.now();
  let n = built(), since = t0;
  const id = setInterval(() => {
    const now = performance.now(), m = built();
    if (m !== n) { n = m; since = now; }
    if (now - since >= 1500 || now - t0 >= most) { clearInterval(id); done((now - t0) / 1000); }
  }, 100);
}), [most]);

/** Frame intervals over `ms` (requestAnimationFrame), sorted: median, 95th percentile, mean. */
export const measureFrames = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  const dts = [];
  let last = performance.now();
  const t0 = last;
  const step = (now) => {
    dts.push(now - last); last = now;
    if (now - t0 < ms) return requestAnimationFrame(step);
    dts.sort((a, b) => a - b);
    const n = dts.length;
    done({ frames: n, p50: dts[n >> 1], p95: dts[Math.floor(n * 0.95)], mean: dts.reduce((a, b) => a + b, 0) / n });
  };
  requestAnimationFrame(step);
}), ms);
