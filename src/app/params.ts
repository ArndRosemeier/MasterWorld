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
  /** Time of day at the start, hours 0..24. */
  hour: Number(q.get('hour') ?? 16),
  /** Real minutes per game day; 0 stops the clock. */
  dayMinutes: Number(q.get('day') ?? 0),
  /** Grow the trees (`trees=0` leaves them out, for quick screenshots). */
  trees: q.get('trees') !== '0',
  /** Draw the grass (`grass=0` leaves it out, for quick screenshots). */
  grass: q.get('grass') !== '0',
  /** Setting module id. */
  setting: q.get('setting') ?? 'classic',
};
