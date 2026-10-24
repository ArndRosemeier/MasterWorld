/** URL parameters: the one place that reads `location.search`. */
const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

export const params = {
  /** World seed: any text or number. */
  seed: q.get('seed') ?? 'masterworld',
  /** Draw with WebGL 2 even where WebGPU exists. */
  gl: q.has('gl'),
  /** Show the HUD line (shader policy, frame time). */
  hud: q.has('hud'),
};
