/** URL parameters: the one place that reads `location.search`. */
const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

/**
 * A new world for every start: a short seed drawn once from the browser's crypto (everything after it comes
 * from this seed, so a problem world is played again with `?seed=`). The checks pin theirs (`window.__mwSeed`,
 * tools/shot/launch.mjs), so their pictures and numbers stay comparable.
 */
export function startSeed(): string {
  const pinned = (globalThis as { __mwSeed?: unknown }).__mwSeed;
  if (typeof pinned === 'string' && pinned) return pinned;
  const bytes = new Uint8Array(6);
  globalThis.crypto?.getRandomValues(bytes);
  return Array.from(bytes, (b) => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36]).join('');
}

export const params = {
  /** World seed: any text or number (`seed=masterworld` the world the docs and places were found in); without it a fresh one each start. */
  seed: q.get('seed') ?? startSeed(),
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
  /** How many townsfolk are drawn at most (`folk=0`: none); past these, plain figures (40 put the capital's market at 19-27 ms). */
  folk: Number(q.get('folk') ?? 30),
  /** How many of the farms' grazing animals are drawn at most, the nearest (`stock=0`: none). */
  stock: Number(q.get('stock') ?? 6),
  /** How many of the yards' hens are drawn at most, the nearest (`hens=0`: none); a cock to every five. `hens` alone: start beside a flock. */
  hens: q.get('hens') === '' ? 10 : Number(q.get('hens') ?? 10),
  /** Start beside a flock of hens (`hens` given without a number). */
  henShot: q.get('hens') === '',
  /** How many saddled horses wait near the start (`horses=0`: none). */
  horses: Number(q.get('horses') ?? 2),
  /** The wild around the town (`wild=0` leaves it out; `wild=wolves` starts beside the first group of that kind). */
  wild: q.get('wild') !== '0',
  wildAt: ['0', '1', '', null].includes(q.get('wild')) ? null : q.get('wild'),
  /** Birds and squirrels about the land (`small=0` leaves them out; `small=squirrel`, `small=birds` or `small=flock` stands beside the first about; `small=fish` with `fly` swims beside a shoal). */
  small: q.get('small') !== '0',
  smallAt: (['squirrel', 'birds', 'flock', 'fish'] as const).find((k) => k === q.get('small')) ?? null,
  /** Regions open as the hero walks (`regions=0`: only the start's land). */
  regions: q.get('regions') !== '0',
  /** Start beside a place the VGM opens out on the land: `site=waystation`, `hamlet`, `village`, `camp`, `ruin` or `barrows` (the first a walk finds). */
  site: q.get('site'),
  /** With `site`: stand this far (m) outside its edge (default 14; a capital's 60, outside its wall). */
  siteAt: q.has('siteAt') ? Number(q.get('siteAt')) : null,
  /** With `site=harbour`: start aboard the first ship moored there, on its main deck by the gangway (S3). */
  aboard: q.has('aboard'),
  /** Start before a barrow (`barrow`; one is promised at once if there is none yet). */
  barrow: q.has('barrow'),
  /** Start before a cave's mouth (`cave`) or a ruined tower (`tower`), as `barrow`. */
  cave: q.has('cave'),
  tower: q.has('tower'),
  /** Start before a sea cave's mouth (`seacave`; S8), as `barrow`. */
  seacave: q.has('seacave'),
  /** Start before a sunken ruin on the shore (`sunken`; S8), as `barrow`. */
  sunken: q.has('sunken'),
  /** On the strand where the giant crabs live, a fisher whose boat went over out on the water before the hero (S9). */
  castaway: q.has('castaway'),
  /** On the strand where the giant crabs live, facing a boat the sea threw up there (S9). */
  washedUp: q.has('washedup'),
  /** Start in the sea over a wreck off the start town (`wreck`; S8), one put there now if there is none. */
  wreck: q.has('wreck'),
  /** A test portal (app/portals.ts): an opening 6 m ahead of the start, joined to one 30 m to the right and turned. */
  portal: q.has('portal'),
  /** Start out in the nearest stretch of a kind of country (`kind=downs`, moor, karst, badlands, mesa, open; L7). */
  kind: q.get('kind'),
  /** Start by the nearest sea (`coast=beach`, `cliff` on a sea cliff's top, `under` on the bed off that beach; S1), facing out to sea. */
  coast: q.get('coast') as 'beach' | 'cliff' | 'under' | null,
  /**
   * Start in the court of the first people's hold, facing its gate (`hold`); `hold=friend` (or another
   * tier: hated, unwelcome, stranger, honoured) sets the hero's standing with that people to it.
   */
  hold: q.has('hold'),
  // Before the warden's tower (C3), looking at its door.
  warden: q.has('warden'),
  holdTier: (['hated', 'unwelcome', 'stranger', 'friend', 'honoured'] as const).find((k) => k === q.get('hold')) ?? null,
  /** How many terrain workers (`workers=6`; for timing the load): by default one less than the cores, at most 4. */
  workers: q.get('workers') ? Math.max(1, Math.min(16, Number(q.get('workers')) || 4)) : undefined,
  /** The start town holds a feast at its market from the start (`feast`), its people dancing, drinking and playing there. */
  feast: q.has('feast'),
  /** Start in the saddle of the first horse (`ride`). */
  ride: q.has('ride'),
  /** Open character creation at once, without the title (`create`; with the title it follows New game). */
  create: q.has('create'),
  /** Weather everywhere, all the time (a VGM order): clear, fair, overcast, rain, storm, fog, snow. */
  weather: q.get('weather'),
  /** Start in the town's cellar: `cellar` at the ladder, `cellar=3` in room 3. */
  cellar: q.has('cellar'),
  cellarRoom: q.get('cellar') ? Number(q.get('cellar')) : undefined,
  /** Slow motion for watching a blow land (tools/shot/hits.mjs): `slow=8` runs everything eight times slower. */
  slow: Math.max(1, Number(q.get('slow') ?? 1) || 1),
  /** Who lives in the town's cellar (for looking at them): a cellar dweller's id, `dweller=goblins`. */
  dweller: q.get('dweller'),
  /** The first cellar was cleared long ago and others have moved in (`moved`, with `cellar` to look at them). */
  moved: q.has('moved'),
  /** Start inside a building of the town: `room=inn` (the first of that kind), `room=12` (building 12), `room=cellar` (the cellar's house, with its hatch), `room=guild` (the first guild house; `guild-out`: before its door). */
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
