/** URL parameters: the one place that reads `location.search`. */
const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

export const params = {
  /** World seed: any text or number. */
  seed: q.get('seed') ?? 'masterworld',
  /** Draw with WebGL 2 even where WebGPU exists. */
  gl: q.has('gl'),
  /** Show the HUD line (shader policy, frame time). */
  hud: q.has('hud'),
  /** Camera position `x,y,z` (y is metres above the ground if given as `x,z`). */
  pos: q.get('pos')?.split(',').map(Number) ?? null,
  /** View direction `yaw,pitch` in degrees (yaw 0 looks north, 90 east). */
  look: q.get('look')?.split(',').map(Number) ?? null,
  /** Setting module id. */
  setting: q.get('setting') ?? 'classic',
};
