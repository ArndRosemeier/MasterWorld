/**
 * The setting module contract (docs/design/masterworld-plan.md section 12, D14): everything world-related
 * that the engine must not hard-code. One module per game; a save records its id and version.
 *
 * First cut: identity, the shape of the land and the start. Peoples, places, creatures, items, magic,
 * lore, VGM templates and the Conversations package are added as the milestones need them.
 */

export const CONTRACT_VERSION = 1;

/**
 * The ground surfaces the engine can draw on open land (each is a tileable material layer). Rock on steep
 * ground, snow up high and sand at the shore are added by the terrain itself.
 */
export const SURFACES = ['grass', 'forest', 'sand', 'scree'] as const;
export type Surface = (typeof SURFACES)[number];

export interface BiomeDef {
  readonly id: string;
  readonly name: string;
  /** Mean annual temperature range in °C where this biome grows. */
  readonly temperature: readonly [number, number];
  /** Moisture range, 0 (desert) to 1 (rainforest). */
  readonly moisture: readonly [number, number];
  /** Ground colour (sRGB hex) of open land in this biome; rock, snow and sand come from the terrain material. */
  readonly ground: number;
  /** What open ground in this biome is made of; `ground` tints it. */
  readonly surface: Surface;
  /** Optional elevation range in metres above the sea. */
  readonly elevation?: readonly [number, number];
}

/** The shape of the land: the skeleton's parameters (section 5.2). All lengths in metres. */
export interface WorldShape {
  /** Typical distance between continents' centres. */
  readonly continentSpacing: number;
  /** Share of the surface that is land, 0..1. */
  readonly landFraction: number;
  /** Deepest sea. */
  readonly seaDepth: number;
  /** Highest peaks above the sea. */
  readonly mountainHeight: number;
  /** Typical distance between mountain ranges. */
  readonly rangeSpacing: number;
  /** 0 = gentle and realistic, 1 = dramatic: steeper ranges, terraces, sharper cliffs (D18). */
  readonly drama: number;
  /** Mean temperature at sea level at the latitude of z = 0, °C. */
  readonly baseTemperature: number;
  /** Temperature change per kilometre northwards (negative z), °C. */
  readonly northCooling: number;
  /** Every biome. The skeleton takes the first whose ranges all hold, else the closest fit. */
  readonly biomes: readonly BiomeDef[];
}

export interface StartSpec {
  /** Biome ids the start town may lie in, in order of preference. */
  readonly biomes: readonly string[];
  /** Elevation range of the start, metres above the sea. */
  readonly elevation: readonly [number, number];
  /** Steepest ground under the town, rise per metre. */
  readonly maxSlope: number;
  /** Least height difference within 6 km of the start, metres: something to look at (D18). */
  readonly vista: number;
}

export interface SettingModule {
  readonly contractVersion: typeof CONTRACT_VERSION;
  /** Stable lowercase slug: the save identity. */
  readonly id: string;
  /** Bump when the saved meaning of the module changes. */
  readonly version: number;
  readonly title: string;
  readonly world: WorldShape;
  readonly start: StartSpec;
}

/** Authoring errors, one line each (empty: the module is valid). */
export function validateSetting(m: SettingModule): string[] {
  const out: string[] = [];
  const where = `setting "${m.id}"`;
  if (m.contractVersion !== CONTRACT_VERSION) out.push(`${where}: contract version ${m.contractVersion}, engine speaks ${CONTRACT_VERSION}`);
  if (!/^[a-z][a-z0-9-]*$/.test(m.id)) out.push(`${where}: id must be a lowercase slug`);
  if (!Number.isInteger(m.version) || m.version < 1) out.push(`${where}: version must be a positive integer`);
  const w = m.world;
  const positive: (keyof WorldShape)[] = ['continentSpacing', 'seaDepth', 'mountainHeight', 'rangeSpacing'];
  for (const k of positive) if (!((w[k] as number) > 0)) out.push(`${where}: world.${k} must be > 0`);
  for (const k of ['landFraction', 'drama'] as const) if (!(w[k] >= 0 && w[k] <= 1)) out.push(`${where}: world.${k} must be in 0..1`);
  if (!w.biomes.length) out.push(`${where}: world.biomes is empty`);
  const ids = new Set<string>();
  for (const b of w.biomes) {
    if (ids.has(b.id)) out.push(`${where}: biome "${b.id}" defined twice`);
    ids.add(b.id);
    if (!SURFACES.includes(b.surface)) out.push(`${where}: biome "${b.id}" surface "${b.surface}" is unknown`);
    if (!(b.temperature[0] <= b.temperature[1])) out.push(`${where}: biome "${b.id}" temperature range is reversed`);
    if (!(b.moisture[0] >= 0 && b.moisture[1] <= 1 && b.moisture[0] <= b.moisture[1])) out.push(`${where}: biome "${b.id}" moisture range must lie in 0..1`);
  }
  for (const id of m.start.biomes) if (!ids.has(id)) out.push(`${where}: start biome "${id}" is not defined`);
  if (!(m.start.elevation[0] >= 0 && m.start.elevation[0] < m.start.elevation[1])) out.push(`${where}: start.elevation must be a rising range above the sea`);
  if (!(m.start.maxSlope > 0)) out.push(`${where}: start.maxSlope must be > 0`);
  if (!(m.start.vista >= 0)) out.push(`${where}: start.vista must be >= 0`);
  return out;
}
