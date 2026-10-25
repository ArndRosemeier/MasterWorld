/** URL parameters: the one place that reads `location.search`. */
const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

export const params = {
  /** World seed: any text or number. */
  seed: q.get('seed') ?? 'masterworld',
  /** Draw with WebGL 2 even where WebGPU exists. */
  gl: q.has('gl'),
  /** Show the HUD line (shader policy, frame time), whatever the settings say. */
  hud: q.has('hud'),
  /** The free camera instead of the hero (for looking at the land). */
  fly: q.has('fly'),
  /** Hero (or with `fly`, camera) position `x,y,z` (given as `x,z`: on the ground; the camera 1.7 m above it). */
  pos: q.get('pos')?.split(',').map(Number) ?? null,
  /** View direction `yaw,pitch` in degrees (yaw 0 looks north, 90 east). */
  look: q.get('look')?.split(',').map(Number) ?? null,
  /** Time of day at the start, hours 0..24. */
  hour: Number(q.get('hour') ?? 16),
  /** Real minutes per game day; 0 stops the clock (null: from the settings). */
  dayMinutes: q.has('day') ? Number(q.get('day')) : null,
  /** Grow the trees (`trees=0` leaves them out, for quick screenshots). */
  trees: q.get('trees') !== '0',
  /** Tree checks (for measuring): `treeShadows=0` trees cast no shadows, `leafDepth=0` leaves without their depth pass. */
  treeShadows: q.get('treeShadows') !== '0',
  leafDepth: q.get('leafDepth') !== '0',
  /** Draw the grass (`grass=0` leaves it out, for quick screenshots). */
  grass: q.get('grass') !== '0',
  /** Draw the town's buildings (`town=0` leaves them out, for comparisons). */
  town: q.get('town') !== '0',
  /** How many townsfolk are drawn at most (`folk=0`: none). */
  folk: Number(q.get('folk') ?? 30),
  /** Weather everywhere, all the time (a VGM order): clear, fair, overcast, rain, storm, fog, snow. */
  weather: q.get('weather'),
  /** Setting module id. */
  setting: q.get('setting') ?? 'classic',
};
