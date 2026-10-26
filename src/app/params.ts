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
  /** Time of day at the start, hours 0..24 (without it the title draws one). */
  hour: Number(q.get('hour') ?? 16),
  hourSet: q.has('hour'),
  /** The title animation: `title` shows it, `title=0` skips it; by default it shows unless `pos` or `fly` is given. */
  title: q.get('title') === '0' ? false : q.has('title') ? true : !(q.has('pos') || q.has('fly')),
  /** Real minutes per game day; 0 stops the clock (null: from the settings). */
  dayMinutes: q.has('day') ? Number(q.get('day')) : null,
  /** The tone curve (for comparing): `tone=aces` the old filmic one, `tone=agx` plain AgX; by default AgX with our look. */
  tone: (['aces', 'agx'].includes(q.get('tone') ?? '') ? q.get('tone') : 'graded') as 'aces' | 'agx' | 'graded',
  /** Grow the trees (`trees=0` leaves them out, for quick screenshots). */
  trees: q.get('trees') !== '0',
  /** Tree checks (for measuring): `treeShadows=0` trees cast no shadows, `leafDepth=0` leaves without their depth pass. */
  treeShadows: q.get('treeShadows') !== '0',
  leafDepth: q.get('leafDepth') !== '0',
  /** Draw the grass (`grass=0` leaves it out, for quick screenshots). */
  grass: q.get('grass') !== '0',
  /** `horizon=0`: no hill shadows beyond the sun's shadow map (for comparing). */
  horizon: q.get('horizon') !== '0',
  /** `origin=0`: no floating origin, everything drawn relative to zero as before plan B0 (for comparing). */
  origin: q.get('origin') !== '0',
  /** `post=0`: no post chain (bloom), straight to the screen (for comparing). */
  post: q.get('post') !== '0',
  /** Post chain checks: `postSamples=4` multisampling in its scene target (default none; black on WebGL2), `postDepth=int` a fixed-point depth buffer. */
  postSamples: q.has('postSamples') ? Number(q.get('postSamples')) : undefined,
  postFloatDepth: q.get('postDepth') !== 'int',
  /** Bloom tuning: `bloom=4,0.16,0.3` its threshold (screen light after exposure), strength and radius. */
  bloom: q.get('bloom')?.split(',').map(Number),
  /** Ambient occlusion in the post chain: `ao=0` off; `ao=1.5,0.8` its radius (m) and strength, for tuning. */
  ao: q.get('ao') === '0' ? null : { radius: Number(q.get('ao')?.split(',')[0] || 1), strength: Number(q.get('ao')?.split(',')[1] || 0.6) },
  /** The sky light from below the horizon, as a share of the horizon's (`envGround=1` the old even light; for comparing). */
  envGround: q.has('envGround') ? Number(q.get('envGround')) : undefined,
  /** Draw the town's buildings (`town=0` leaves them out, for comparisons). */
  town: q.get('town') !== '0',
  /** How many townsfolk are drawn at most (`folk=0`: none). */
  folk: Number(q.get('folk') ?? 30),
  /** How many of the farms' grazing animals are drawn at most, the nearest (`stock=0`: none). */
  stock: Number(q.get('stock') ?? 6),
  /** How many saddled horses wait near the start (`horses=0`: none). */
  horses: Number(q.get('horses') ?? 2),
  /** The wild around the town (`wild=0` leaves it out; `wild=wolves` starts beside the first group of that kind). */
  wild: q.get('wild') !== '0',
  wildAt: ['0', '1', '', null].includes(q.get('wild')) ? null : q.get('wild'),
  /** Birds and squirrels about the land (`small=0` leaves them out; `small=squirrel`, `small=birds` or `small=flock` stands beside the first about). */
  small: q.get('small') !== '0',
  smallAt: (['squirrel', 'birds', 'flock'] as const).find((k) => k === q.get('small')) ?? null,
  /** Start before a barrow (`barrow`; one is promised at once if there is none yet). */
  barrow: q.has('barrow'),
  /**
   * Start in the court of the first people's hold, facing its gate (`hold`); `hold=friend` (or another
   * tier: hated, unwelcome, stranger, honoured) sets the hero's standing with that people to it.
   */
  hold: q.has('hold'),
  holdTier: (['hated', 'unwelcome', 'stranger', 'friend', 'honoured'] as const).find((k) => k === q.get('hold')) ?? null,
  /** Start in the saddle of the first horse (`ride`). */
  ride: q.has('ride'),
  /** Open character creation at once, without the title (`create`; with the title it follows New game). */
  create: q.has('create'),
  /** Weather everywhere, all the time (a VGM order): clear, fair, overcast, rain, storm, fog, snow. */
  weather: q.get('weather'),
  /** Start in the town's cellar: `cellar` at the ladder, `cellar=3` in room 3. */
  cellar: q.has('cellar'),
  cellarRoom: q.get('cellar') ? Number(q.get('cellar')) : undefined,
  /** Who lives in the town's cellar (for looking at them): a cellar dweller's id, `dweller=goblins`. */
  dweller: q.get('dweller'),
  /** The first cellar was cleared long ago and others have moved in (`moved`, with `cellar` to look at them). */
  moved: q.has('moved'),
  /** Start inside a building of the town: `room=inn` (the first of that kind), `room=12` (building 12) or `room=cellar` (the cellar's house, with its hatch). */
  room: q.get('room'),
  /** Start in a talk (for screenshots): `talk=inn` with the innkeeper, `talk=smith` with the smith, `talk=house` with the cellar's household; `topics=news,source` asked first (`topics=repair` opens the smith's bench). */
  talk: q.get('talk'),
  topics: q.get('topics')?.split(',') ?? [],
  /** The hero's gear starts this worn (for looking at the smith's bench): `wear=0.6`, the main hand most, the rest less. */
  wear: Math.min(1, Math.max(0, Number(q.get('wear') ?? 0))),
  /** Start at a merchant's counter (for screenshots): `trade=smith`, `trade=innkeeper` or `trade=trader` (a market stall). */
  trade: q.get('trade'),
  /** Lay remains in front of the start (for screenshots): `remains=pack` or `remains=grave`. */
  remains: q.get('remains'),
  /** Open the map (or `journal`, `saves`, `pack`, `tale`: a roguelike end) at the start, after any `talk`. */
  open: q.get('open'),
  /** The title's giant in this fly-over, whatever the draw says (for looking at it). */
  giant: q.has('giant'),
  /** A tool page instead of the game: `bake=peoples` draws the title card's turning figures (tools/assets/peoples.mjs). */
  bake: q.get('bake'),
  /** Setting module id. */
  setting: q.get('setting') ?? 'classic',
};
