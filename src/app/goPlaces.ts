/**
 * The debug menu's "Go to" for every kind of place the world has (Arnd: "everything special"): the start town's
 * buildings and guild houses, the capital, hamlets and villages, the places out on the land, every kind of
 * dungeon (before it and down in it), the wild, sights, bridges, and what happens (story events, situations,
 * travellers, good days). Each goes to the nearest of its kind in the log; where none stands yet it asks the
 * VGM's own tool for one first (walking the frontier, a promise, a situation now), so a debug go-to never
 * decides anything the game could not. A debug tool: the hero is put there at once.
 */
import type { SettingModule, SituationKind } from '../setting/contract';
import type { DecisionLog, DungeonDecision, EventDecision, RegionDecision } from '../world/decisions';
import { onLand } from '../world/dungeon/site';
import { COURT } from '../world/hold';
import type { Bridge } from '../world/bridges';
import type { Town } from '../world/town';
import { polyCentroid, type TownBuilding } from '@futuremagic/settlement';
import type { Need } from '../vgm/director';
import type { Made } from '../vgm/toolbox';
import { openEvents, refugeOf } from '../vgm/events';
import { smokesAt } from '../vgm/situations';
import { festivitiesOf } from '../vgm/festivities';
import { whereOf, type GuildHouse } from '../game/guilds';
import { buildingOf } from '../sim/people';
import { cap } from '../talk/folk';
import { atDoor, before, beside, clearStand, decisionsOf, nearestTo, outsideGate, regionsOf, type Stand } from './places';

/** What the go-to list reaches in the running game. */
export interface GoHost {
  readonly setting: SettingModule;
  log(): DecisionLog;
  hours(): number;
  heroPos(): { readonly x: number; readonly z: number };
  /** The towns planned so far (the start's, and every settlement founded), with their guild houses. */
  towns(): readonly { readonly town: Town; readonly guilds: readonly GuildHouse[] }[];
  /** Out of any cellar or building, on foot, standing there (the first stand `pick` gives, once outside). */
  stand(s: Stand, pick?: (s: Stand) => Stand): Promise<Stand>;
  /** Nothing in the way of the hero at (x, z) facing `yaw`, nor of the camera behind them (out of doors). */
  clear(x: number, z: number, yaw: number, at?: { readonly x: number; readonly z: number }): boolean;
  /** Into a town's building, just inside its door. */
  enter(town: string, b: TownBuilding): Promise<void>;
  /** Down into a dungeon (false: it would not build). */
  below(id: string): Promise<boolean>;
  /** Walk the frontier out from the start until a region placing `place` opens (null: none within reach); its settlement planned. */
  open(place: string): Promise<RegionDecision | null>;
  /** A place of a land kind promised now, near the start (null: no room). */
  promise(kind: string): DungeonDecision | null;
  situation(kind: SituationKind): Made | null;
  answerFor(need: Need): Made | null;
  /** A story event now (the setting's id): what the town hears, or why none came. */
  event(id: string): string;
  goodDay(): string;
  /** The bridges known round (x, z). */
  bridges(x: number, z: number): readonly Bridge[];
}

/** One go-to button. */
export interface GoSpot {
  readonly group: string;
  readonly label: string;
  go(): Promise<string>;
}

const where = (s: Stand): string => `${s.x.toFixed(0)}, ${s.z.toFixed(0)}`;
/** How far before a region's place one stands (m); a capital's wall stands out past its houses. */
const SITE_OFF = 14, CAPITAL_OFF = 60;
/** How far before a land dungeon's way in, by its shell (as `?barrow` and the rest). */
const SHELL_OFF: Record<string, number> = { hatch: 9, mound: 9, mouth: 16, keep: 32 };

export function goSpots(h: GoHost): GoSpot[] {
  const out: GoSpot[] = [];
  const add = (group: string, label: string, go: () => Promise<string>): void => { out.push({ group, label, go }); };
  const at = async (s: Stand | null, what: string): Promise<string> => {
    if (!s) return `no ${what}`;
    const put = await h.stand(s, (x) => clearStand(x, (px, pz, yaw, to) => h.clear(px, pz, yaw, to)));
    return `${what}: ${where(put)}`;
  };
  const fills = h.setting.regions?.fills ?? [];
  /** The town the hero is in or nearest that has `has`. */
  const townWith = <T>(has: (t: Town) => T | null | undefined): { t: Town; it: T } | null => {
    const p = h.heroPos();
    const ts = h.towns().map((x) => x.town).sort((a, b) => Math.hypot(a.decision.x - p.x, a.decision.z - p.z) - Math.hypot(b.decision.x - p.x, b.decision.z - p.z));
    for (const t of ts) { const it = has(t); if (it) return { t, it }; }
    return null;
  };
  /** A region's place: the nearest in the log, else one opened now. */
  const regionPlace = async (place: string): Promise<RegionDecision & { site: NonNullable<RegionDecision['site']> } | null> => {
    const known = nearestTo(regionsOf(h.log(), fills, place).map((d) => ({ ...d, x: d.site.x, z: d.site.z })), h.heroPos());
    if (known) return known;
    const d = await h.open(place);
    return d?.site ? { ...d, site: d.site } : null;
  };
  const townOf = (id: string): Town | null => h.towns().find((x) => x.town.decision.id === id)?.town ?? null;

  // The towns: the one the hero is in, else the nearest that has it.
  const T = 'Go to: in town';
  add(T, 'Market', async () => { const f = townWith((t) => t.plan.centre); return at(f && beside({ x: f.it[0], z: f.it[1] }, h.heroPos(), 10), 'market'); });
  for (const [kind, name] of [['inn', 'Inn'], ['smithy', 'Smithy'], ['bakery', 'Bakery'], ['temple', 'Temple'], ['workshop', 'Workshop'], ['mill', 'Mill'], ['stable', 'Stable']] as const) {
    add(T, name, async () => { const f = townWith((t) => buildingOf(t.plan, kind)); return at(f && atDoor(f.it), name.toLowerCase()); });
  }
  add(T, 'Inside the inn', async () => {
    const f = townWith((t) => buildingOf(t.plan, 'inn'));
    if (!f) return 'no inn';
    await h.enter(f.t.decision.id, f.it);
    return 'inside the inn';
  });
  add(T, 'Farm yard', async () => {
    // In the middle of the yard (open ground between the house, the barn and the stable), facing the house's door.
    const f = townWith((t) => { const farm = t.plan.farms[0]; return farm ? { house: t.plan.buildings[farm.house], yard: polyCentroid(farm.yard) } : null; });
    if (!f) return 'no farm';
    const [yx, yz] = f.it.yard, door = { x: f.it.house.door[0], z: f.it.house.door[1] };
    return at(beside(door, { x: yx, z: yz }, Math.max(6, Math.hypot(yx - door.x, yz - door.z))), 'farm yard');
  });
  add(T, 'Paddock gate', async () => {
    const f = townWith((t) => t.plan.paddocks[0]);
    // Outside the gate, looking in (the gate's yaw faces into the paddock).
    return at(f && before({ x: f.it.gate[0], z: f.it.gate[1], yaw: f.it.gate[2] + Math.PI }, 6), 'paddock gate');
  });
  add(T, 'Field', async () => {
    const f = townWith((t) => t.plan.fields[0]?.poly);
    if (!f) return 'no field';
    const [cx, cz] = polyCentroid(f.it);
    return at(beside({ x: cx, z: cz }, { x: f.t.decision.x, z: f.t.decision.z }, 0.5), 'field');
  });
  // Every guild house (D49), the hidden ones and the teachers out on the land among them.
  const G = 'Go to: guilds and teachers';
  for (const g of h.setting.guilds ?? []) {
    const name = g.name.replace(/^the /, '');
    add(G, cap(name), async () => {
      const p = h.heroPos();
      const houses = h.towns().flatMap((x) => x.guilds.filter((k) => k.guild.keeper === g.keeper)).map((k) => ({ k, ...whereOf(k) }));
      const k = nearestTo(houses, p)?.k;
      if (!k) return `no ${g.name} in a town planned yet${g.sizes.includes('capital') ? ' (try the capital)' : ''}`;
      if (k.out) { const [x, z] = onLand(k.out, 0, 12); return at({ x, z, yaw: k.out.yaw, at: k.out }, g.name); }
      return at(atDoor(k.b), g.name);
    });
  }

  // Settlements (B3, C15): the nearest of each size, else one opened now by walking the frontier.
  const S = 'Go to: settlements';
  for (const [place, name] of [['waystation', 'Waystation'], ['hamlet', 'Hamlet'], ['village', 'Village']] as const) {
    if (!fills.some((f) => f.place === place)) continue;
    add(S, name, async () => { const d = await regionPlace(place); return at(d && before(d.site, d.site.r + SITE_OFF), name.toLowerCase()); });
  }
  if (fills.some((f) => f.place === 'capital')) {
    const capital = async (): Promise<{ d: RegionDecision & { site: NonNullable<RegionDecision['site']> }; t: Town | null } | null> => {
      const d = await regionPlace('capital');
      return d ? { d, t: townOf(d.id) } : null;
    };
    add(S, 'Capital from afar', async () => {
      // Its wall and a gate seen whole, from out on the road (before it is planned: out past its houses).
      const c = await capital(), g = c?.t?.plan.wall?.gates[0];
      return at(g ? outsideGate(g, 90) : c && before(c.d.site, c.d.site.r + CAPITAL_OFF), 'the capital');
    });
    add(S, 'Capital gate', async () => {
      const c = await capital(), g = c?.t?.plan.wall?.gates[0];
      return at(g ? outsideGate(g) : c && before(c.d.site, c.d.site.r + CAPITAL_OFF), 'the capital\'s gate');
    });
    add(S, 'Capital market', async () => {
      const c = await capital(), m = c?.t?.plan.centre;
      return m ? at(beside({ x: m[0], z: m[1] }, h.heroPos(), 10), 'the capital\'s market') : 'the capital is not planned yet: go before its wall first';
    });
    add(S, 'Capital seat', async () => {
      const c = await capital(), b = c?.t?.plan.buildings.find((x) => x.trade === 'ruler');
      return b ? at(atDoor(b, 14), 'the seat of rule') : 'the capital is not planned yet: go before its wall first';
    });
  }

  // Out on the land: region places, the people's hold, sights, bridges, the wild.
  const L = 'Go to: out on the land';
  for (const [place, name] of [['camp', 'Camp'], ['ruin', 'Ruins'], ['barrows', 'Barrow field']] as const) {
    if (!fills.some((f) => f.place === place)) continue;
    add(L, name, async () => { const d = await regionPlace(place); return at(d && before(d.site, d.site.r + SITE_OFF), name.toLowerCase()); });
  }
  add(L, 'Hold gate', async () => {
    const hold = decisionsOf(h.log(), 'hold')[0];
    if (!hold) return 'no hold in this world';
    const [x, z] = onLand(hold, 0, COURT.depth + 4);
    return at({ x, z, yaw: hold.yaw, at: hold }, 'the hold\'s court');
  });
  add(L, 'Stone arch', async () => {
    const v = decisionsOf(h.log(), 'volume')[0];
    if (!v) return 'no arch in this world';
    // It was set across the way from the start town (world/volumes.ts archNear): seen from that side, 70 m off, looking up a little.
    const { a, b } = v.site, mid = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 };
    const home = nearestTo(h.towns().map((x) => x.town.decision), mid) ?? h.heroPos();
    return at({ ...beside(mid, home, 70), pitch: 0.14 }, 'the arch');
  });
  for (const s of h.setting.sights ?? []) {
    add(L, `Sight: ${s.id.replace(/-/g, ' ')}`, async () => {
      let d = nearestTo(decisionsOf(h.log(), 'sight').filter((x) => x.sight === s.id), h.heroPos());
      let made = '';
      if (!d) {
        const m = h.answerFor(s.need === 'reward' ? 'reward' : 'discovery');
        if (m?.decision.kind !== 'sight') return `no ${s.id} yet, and none made here`;
        d = m.decision;
        if (d.sight !== s.id) made = ` (made a ${d.sight}: the VGM picks which)`;
      }
      return `${await at(before(d, 9), d.sight)}${made}`;
    });
  }
  add(L, 'Bridge', async () => {
    const p = h.heroPos(), b = nearestTo([...h.bridges(p.x, p.z)], p);
    return at(b && beside(b, { x: b.x + (b.z1 - b.z0), z: b.z - (b.x1 - b.x0) }, 22), 'bridge (the nearest known: brooks come in as the land does)');
  });
  for (const w of h.setting.wild ?? []) {
    add(L, `Wild: ${w.id}`, async () => {
      const d = nearestTo(decisionsOf(h.log(), 'wild').filter((x) => x.group === w.id), h.heroPos());
      return at(d && beside(d, h.heroPos(), 30), `${w.id}'s ground`);
    });
  }

  // Dungeons of every kind (D51: the setting's dungeon kinds): before the way in, and down in it.
  const D = 'Go to: dungeons';
  const dungeonNear = (kind: string, make: boolean): DungeonDecision | null => {
    const log = h.log(), p = h.heroPos();
    const all = decisionsOf(log, 'dungeon').filter((d) => d.template === kind);
    const placed = all.map((d) => ({ d, ...(d.site ?? houseAt(d) ?? { x: Infinity, z: Infinity }) }));
    const known = nearestTo(placed, p)?.d ?? all.at(-1) ?? null;
    return known ?? (make ? h.promise(kind) : null);
  };
  const houseAt = (d: DungeonDecision): { x: number; z: number } | null => {
    const b = townOf(d.town)?.plan.buildings[d.building];
    return b ? atDoor(b) : null;
  };
  const beforeDungeon = (d: DungeonDecision): Stand | null => {
    const form = h.setting.dungeons[d.template]?.form;
    if (d.site) return before(d.site, SHELL_OFF[form?.shell ?? 'mound'] ?? 12);
    const b = townOf(d.town)?.plan.buildings[d.building];
    return b ? atDoor(b) : null;
  };
  for (const kind of Object.keys(h.setting.dungeons)) {
    const name = cap(kind);
    add(D, name, async () => { const d = dungeonNear(kind, true); return at(d && beforeDungeon(d), `${kind} ${d?.id ?? ''}`); });
    add(D, `Down in: ${kind}`, async () => {
      const d = dungeonNear(kind, true);
      if (!d) return `no ${kind}`;
      return (await h.below(d.id)) ? `down in ${d.id}` : `${d.id} would not build`;
    });
  }
  add(D, 'A master\'s deed (quest place)', async () => {
    const d = decisionsOf(h.log(), 'dungeon').filter((x) => !!x.quest).at(-1);
    return d ? at(beforeDungeon(d), `${d.quest}'s deed, ${d.id}`) : 'no deed asked yet (take a guild master\'s task)';
  });
  add(D, 'A story event\'s lair', async () => {
    const d = decisionsOf(h.log(), 'dungeon').filter((x) => !!x.event).at(-1);
    return d ? at(beforeDungeon(d), `${d.event}'s lair, ${d.id}`) : 'no lair yet (a taken waystation has one)';
  });

  // What happens (C6, C9, C10, C11): the latest going on, else one made now.
  const W = 'Go to: what happens';
  const openOf = (id: string): EventDecision | undefined => openEvents(h.log()).filter((e) => e.event === id).at(-1);
  for (const e of h.setting.events ?? []) {
    add(W, `Event: ${e.id}`, async () => {
      let d = openOf(e.id), said = '';
      if (!d) { said = h.event(e.id); d = openOf(e.id); }
      if (!d) return `no ${e.id}: ${said}`;
      return at(beside(d, h.heroPos(), 25), `${e.id} (${d.id})`);
    });
  }
  add(W, 'Refugees on the road', async () => {
    const towns = h.towns().map((x) => x.town);
    const r = openEvents(h.log()).map((e) => refugeOf(towns, e)).filter((x): x is NonNullable<typeof x> => !!x).at(-1);
    return r ? at(beside(r, h.heroPos(), 18), 'refugees') : 'no refugees (a waystation must be taken first: Event: waystation-taken)';
  });
  add(W, 'Smoke over a raided farm', async () => {
    const s = smokesAt(h.log(), h.towns().map((x) => x.town), h.setting, h.hours()).at(-1);
    return s ? at(beside(s, h.heroPos(), 30), 'the burnt barn') : 'no smoke (a farm raid must come first: Event: farm-raid)';
  });
  const situation = (kind: SituationKind, label: string, find: () => { x: number; z: number } | null | undefined, d: number): void => {
    add(W, label, async () => {
      let s = find(), why = '';
      if (!s) {
        // A town's situations happen in the town the hero is in: the start's, if they are out on the land.
        if (kind !== 'hurt-traveller' && !h.towns().some((x) => Math.hypot(h.heroPos().x - x.town.decision.x, h.heroPos().z - x.town.decision.z) < x.town.decision.radius + 40)) {
          const home = nearestTo(h.towns().map((x) => ({ t: x.town, x: x.town.decision.x, z: x.town.decision.z })), h.heroPos())?.t;
          if (home) await h.stand(beside({ x: home.plan.centre[0], z: home.plan.centre[1] }, h.heroPos(), 10));
        }
        const m = h.situation(kind);
        why = m ? '' : ': none could be made here';
        s = find();
      }
      return s ? at(beside(s, h.heroPos(), d), label.toLowerCase()) : `no ${kind}${why}`;
    });
  };
  const now = (x: { at: number; until: number }) => h.hours() < x.until;
  situation('hurt-traveller', 'Hurt traveller', () => decisionsOf(h.log(), 'traveller').filter((x) => x.situation && now(x)).at(-1), 10);
  situation('paddock-wolves', 'Wolves at a paddock', () => decisionsOf(h.log(), 'wild').filter((x) => x.situation).at(-1), 30);
  situation('stray-beast', 'A beast got out', () => decisionsOf(h.log(), 'stray').filter(now).at(-1), 12);
  add(W, 'Traveller resting by the way', async () => {
    let d = decisionsOf(h.log(), 'traveller').filter((x) => !x.situation && now(x)).at(-1);
    if (!d) { const m = h.answerFor('people'); d = m?.decision.kind === 'traveller' ? m.decision : undefined; }
    return at(d ? beside(d, h.heroPos(), 10) : null, 'traveller');
  });
  add(W, 'Ambush', async () => {
    let d = decisionsOf(h.log(), 'wild').filter((x) => x.group === 'ambush').at(-1);
    if (!d) { const m = h.answerFor('challenge'); d = m?.decision.kind === 'wild' ? m.decision : undefined; }
    return at(d ? beside(d, h.heroPos(), 25) : null, 'ambush');
  });
  add(W, 'Feast or market day', async () => {
    let f = festivitiesOf(h.log()).at(-1), said = '';
    if (!f || h.hours() > f.to) { said = h.goodDay(); f = festivitiesOf(h.log()).at(-1); }
    const t = f && townOf(f.town);
    return t ? at(beside({ x: t.plan.centre[0], z: t.plan.centre[1] }, h.heroPos(), 10), `${f!.festivity} in ${f!.town}`) : `no good day: ${said}`;
  });
  return out;
}
