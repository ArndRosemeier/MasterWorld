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
  /** Draw the town's buildings (`town=0` leaves them out, for comparisons). */
  town: q.get('town') !== '0',
  /** How many townsfolk are drawn at most (`folk=0`: none). */
  folk: Number(q.get('folk') ?? 30),
  /** How many of the farms' grazing animals are drawn at most, the nearest (`stock=0`: none). */
  stock: Number(q.get('stock') ?? 6),
  /** How many saddled horses wait near the start (`horses=0`: none). */
  horses: Number(q.get('horses') ?? 2),
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
  /** Start inside a building of the town: `room=inn` (the first of that kind), `room=12` (building 12) or `room=cellar` (the cellar's house, with its hatch). */
  room: q.get('room'),
  /** Start in a talk (for screenshots): `talk=inn` with the innkeeper, `talk=house` with the cellar's household; `topics=news,source` asked first. */
  talk: q.get('talk'),
  topics: q.get('topics')?.split(',') ?? [],
  /** Open the map (or `journal`, `saves`, `pack`) at the start, after any `talk`. */
  open: q.get('open'),
  /** A tool page instead of the game: `bake=peoples` draws the title card's turning figures (tools/assets/peoples.mjs). */
  bake: q.get('bake'),
  /** Setting module id. */
  setting: q.get('setting') ?? 'classic',
};
