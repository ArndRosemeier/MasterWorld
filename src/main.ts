import { Vector3, type Light, type Object3D } from 'three/webgpu';
import { GraphicsUnavailable } from '@futuremagic/stage';
import { deriveSeed, parseSeed } from '@futuremagic/core';
import { LoadingScreen } from './app/loading';
import { params } from './app/params';
import { DebugMenu } from './app/debugMenu';
import { HITCHES, watchHitches } from './app/hitchLog';
import { Menu } from './app/menu';
import { atDoor, placesFor } from './app/places';
import { goSpots } from './app/goPlaces';
import { Player } from './app/player';
import { Portals } from './app/portals';
import { CAVE_LANTERN } from './app/cellarVisit';
import type { Portal } from './game/portal';
import { PortalView } from './render/portal/PortalView';
import { PortalStoneUse } from './app/portalStoneUse';
import { cleanStoneSave } from './game/portalStone';
import { SettingsStore } from './app/settings';
import type { WalkWorld } from './game/walker';
import { Trunks } from './world/trunks';
import { Rocks } from './world/rocks';
import { RockView } from './render/rocks/RockView';
import { woodsOf } from './world/flora';
import { daylight } from './game/soundscape';
import { HeroView } from './render/hero/HeroView';
import { preparePeople } from './render/hero/play';
import { GiantView } from './render/giant/GiantView';
import { routePackImages } from './render/packImages';
import { GIANT_SPEED, giantPose, type Orbit } from './app/title/route';
import { FolkView } from './render/folk/FolkView';
import { HorseView } from './render/horse/HorseView';
import { StockView } from './render/livestock/StockView';
import { Steed, groundPace, horseSpots } from './game/horse';
import { buildingOf } from './sim/people';
import type { Agent, TownOrder } from './sim/townLife';
import { createView } from './render/view';
import { ORIGIN } from './render/origin';
import { TerrainView } from './render/terrain/TerrainView';
import { ROOT_LEVEL, chunkSize } from './render/terrain/lod';
import { VolumeView } from './render/terrain/VolumeView';
import { TerrainJobs, WorldJobs, createTerrainPool, createTexturePool, createWorldPool } from './workers/pool';
import { WaterView } from './render/water/WaterView';
import { FloraView } from './render/flora/FloraView';
import { GrassView } from './render/grass/GrassView';
import { useWaterEnvironment } from './render/materials/water';
import { loadGroundTextures, loadTownTextures } from './render/terrain/groundTextures';
import { useTownMasks, useTownTextures } from './render/materials/townGround';
import { WINDOWS } from './render/materials/building';
import { GROUND_DIP, useGroundTextures } from './render/materials';
import { settingById } from './setting/index';
import { distSqPointSeg } from '@futuremagic/settlement';
import { abilityOf, validateSetting, type BackgroundDef, type GrowthSource, type SituationKind } from './setting/contract';
import { openWorld } from './vgm/builder';
import { RoadWork } from './app/roads';
import { townOrder } from './vgm/orders';
import { WEATHER_KINDS, Weather, type WeatherKind } from './world/weather';
import { WeatherView } from './render/weather/WeatherView';
import { onKeyDown } from './input/keys';
import { TOWN_RASTER, TownGround, marketStart } from './world/town';
import { firstDungeon, houseOf, placeOf, promisePlace, type LandKind } from './vgm/dungeons';
import { questFor, questGuild } from './vgm/quests';
import { LEADS, keepPromise, keptOf, moveInto, openPromises } from './vgm/leads';
import { bandOf, eventTold, gatherFor, openBands, openEvents } from './vgm/events';
import { answerNeed, madeBy, vgmTurn, type Made } from './vgm/toolbox';
import { cleanWhys, PACING, vgmLines, whyOf, WHY_KEPT, type VgmWhy } from './vgm/vgmLog';
import { findIn, travellerFor } from './vgm/answers';
import { territoryOf, wildFor, wildOf } from './vgm/wild';
import { ARRIVAL, arrivalEntry } from './vgm/guide';
import { Hails } from './app/hails';
import { Speech } from './app/speech';
import { OwnerComes } from './app/ownerComes';
import { FAR } from './render/folk/FarFolk';
/**
 * One of a place's household goes out to wait before its way in once the hero is this near (m: within the 400 m round
 * which a town's people out on the land live), never while it can be seen (nearer than anyone out of doors is drawn,
 * FAR); they go home once the hero is this far off.
 */
const WAIT_FROM = 395, WAIT_UNSEEN = FAR + 10, WAIT_GONE = 600;
import { burntBarns, criesDue, situationOf, smokesAt } from './vgm/situations';
import { festivitiesOf, festivityOrder } from './vgm/festivities';
import { SmokeView } from './render/smoke/SmokeView';
import { Cellars } from './app/cellars';
import { HatchClimb } from './app/hatchClimb';
import { UsePrompt } from './app/usePrompt';
import { Fade } from './app/fade';
import { stepEncounters, type FightHost } from './app/encounter';
import { WildLand } from './app/wildLand';
import { RegionSites } from './app/regionSites';
import { Towns } from './app/towns';
import type { Township } from './game/township';
import { cap, type TownTalk } from './talk/townTalk';
import { settlementsOf, walkFrontier } from './vgm/frontier';
import { SmallLife } from './sim/smallLife';
import { SmallLifeView } from './render/wildlife/SmallLifeView';
import { dungeonOf, type Decision, type DungeonDecision, type EventDecision, type RegionDecision, type RoadDecision, type RoadWay } from './world/decisions';
import { InteriorVisit } from './app/interiorVisit';
import { HouseView } from './render/town/HouseView';
import { lookFromDegrees } from './app/look';
import { Sound } from './app/sound';
import { SoundDirector } from './app/soundDirector';
import { Title } from './app/title/title';
import type { People } from './app/title/lines';
import { Creator, PEOPLE_RACE, heroNameFor } from './app/creatorUi';
import { Notes } from './app/notes';
import { VgmPanel } from './app/vgmPanel';
import { BrookPrefetch } from './app/brooks';
import { BridgeView } from './render/bridgeView';
import { TalkUi } from './app/talkUi';
import { standingPlace } from './game/standingPlace';
import { JournalUi } from './app/journalUi';
import { PackUi } from './app/packUi';
import { TradeUi } from './app/tradeUi';
import { LessonsUi } from './app/lessonsUi';
import { MapUi } from './app/mapUi';
import { HandOver } from './app/handOver';
import { HandOverScene } from './app/handOverScene';
import { MapSheet } from './render/hero/MapSheet';
import { HOME_SIGHT, KnownLand } from './game/knownLand';
import { Minimap, type SkyGlyph } from './app/minimap';
import { belowRange, paintBelow } from './app/dungeonSheet';
import { fill } from './talk/folk';
import { Journal } from './talk/journal';
import { AUTOSAVE, SavesUi, latestSave, loadAtRestart, pendingLoad, saveNow, type SavesHost } from './app/savesUi';
import { ROGUE_SLOT, SAVE_VERSION, heirSave, remainsEntry, saveLabel, startMoved, townSaves, type SaveData } from './app/saveGame';
import { release } from './app/release';
import { CLIMB_COST, Character, fallHurt } from './game/character';
import { itemWorth } from './game/trade';
import { bardTells, GuildBook, questGift, teacherOf, whereOf } from './game/guilds';
import { CHEER, LevelWatch } from './app/levelUp';
import { carryRenown } from './game/growth';
import { coinText, uniqueItem } from './game/items';
import { epitaph, fallClassic, fallRoguelike, gather, remainsId, remainsNear, type FallPlace, type GameMode, type Remains } from './game/death';
import { TalesEnd } from './app/talesEnd';
import { RemainsView } from './render/remainsView';
import { SearchKneel } from './app/searchKneel';
import { writeSlot } from './persist/saves';
import { acquaintances } from './game/background';
import { Director, type Need } from './vgm/director';
import { FightHud } from './app/fightHud';
import { ActionBarUi } from './app/actionBarUi';
import { AbilityBook } from './app/abilityBook';
import { POTION, REST } from './game/actionBar';
import { Rest, type RestWatch } from './game/rest';
import { BirdForm } from './app/birdForm';
import { Alone, blowOf, Recipes, shapeOf, type RecipeEvent } from './game/recipe';
import { SpellView } from './app/spellView';
import { UPKEEP_SERVICES, UpkeepUi } from './app/upkeepUi';
import { HoldGate } from './app/holdGate';
import { Retreats } from './app/retreats';
import { PEOPLE_SERVICES, PeoplesTalk } from './app/peoples';
import { Standing, changeLine, householdOf, peopleOf, tierFloor } from './game/standing';
import type { HoldDecision } from './world/decisions';
import { COURT } from './world/hold';
import { bridgesNear } from './world/bridges';
import { emptyWater, inChannel, tracedTiles } from './world/hydro';
import { onLand } from './world/dungeon/site';

declare global {
  interface Window {
    /** Set when the first frame after loading is drawn (the screenshot tool waits for it). */
    __mwReady?: boolean;
  }
}

/** Metres past the start's land (3 × 3 root chunks) whose river and brook tiles are traced for every worker at once. */
const TILE_PAD = 1000;
/** The longest the start waits for the people round the hero to be dressed (ms). */
const DRESS_WAIT = 15000;
/** Seconds after the VGM answered an overdue need before it answers again (C9): time to come upon the first. */
const ANSWER_GAP = 90;
/** The ground sunk under a hatch while one climbs through it: this far round it, this deep (m; render/materials GROUND_DIP). */
const SINK_REACH = 2.4, SINK_DEPTH = 4;
/** Seeing to a hurt traveller: the hero kneels this far from them (m), hands busy this long (s). */
const TEND_AT = 1.0, TEND_FOR = 4.5;

/** What the first, small script (boot.ts) made before the game's code arrived. */
export interface Boot {
  readonly settings: SettingsStore;
  readonly sound: Sound;
  readonly title: Title | null;
  readonly loading: LoadingScreen | Title['screen'];
  /** Filled in here once the menu exists (the title's Settings and What's new open it). */
  readonly menus: { menu: Menu | null };
}

export async function start(b: Boot): Promise<void> {
  const { settings, sound, title, loading } = b;
  const boot = settings.start;
  // The people's textures come from the pack bundles and the browser's cache too, not from an <img> of their own.
  routePackImages();
  const canvas = document.createElement('canvas');
  document.body.prepend(canvas);
  // The world's seed, named in a failure (set once known).
  let failSeed = '';
  try {
    const setting = settingById(params.setting);
    const errors = validateSetting(setting);
    if (errors.length) throw new Error(errors.join('; '));
    // A load asked for before this start: the world is built again from the save's seed.
    const loaded = await pendingLoad(setting);
    const asked = typeof loaded === 'object' ? loaded : null;
    const seedText = asked?.seed ?? params.seed;
    const seed = parseSeed(seedText);
    // Every start opens a fresh world (params.seed): this line names it, so a problem world can be played again.
    console.info(`[seed] ${seedText} (again: ?seed=${encodeURIComponent(seedText)})`);
    failSeed = seedText;
    loading.set('Finding the start');
    // The world worker opens the same world (a second or more of work) while this thread does, so the seas' first
    // masks (asked at 'Filling the seas') do not wait for it: any job opens it, this one a single sample.
    const worldPool = createWorldPool();
    void worldPool.run({ kind: 'mask', seed, setting: setting.id, x0: 0, z0: 0, size: 1, res: 1 }).catch(() => {});
    // The VGM's first decisions: the start town (and the arch outside it) stand on the land.
    const opened = openWorld(seed, setting);
    // A save whose start town stood elsewhere (before D50 moved it to its river) belongs to a world that is
    // gone: a new game begins in this one.
    const lost = asked !== null && startMoved(asked.log, opened.log);
    const save = lost ? null : asked;
    // The title's Continue: straight on with a loaded save, or offered when one is kept.
    if (title && save) title.continuing(saveLabel(save, save.heir ? 'a new hero in the same world' : 'where you left off'));
    else if (title) {
      // Restarted for a save that would not load (the notes say why): the menu comes back.
      title.notContinuing();
      // Only a save that can go on in this world (not one from before the town moved).
      // (A save of another seed opens its own world: whether that one moved is checked when it loads.)
      void latestSave(setting, (s) => s.seed !== seedText || !startMoved(s.log, opened.log)).then((s) => { if (s) title.offerContinue(s.label, () => loadAtRestart(s.slot)); });
    }
    const { terrain } = opened;
    // Where the game began: a new hero steps out on its market, the title circles it, the map is drawn round it.
    // Everything else in a town works alike in every town (app/towns.ts, game/township.ts).
    const start = terrain.towns[0];
    const home = start ? marketStart(start.plan) : opened.home;
    // A loaded game goes on where it was saved: the land, the trees and the people are readied round that spot
    // (the title circles it), so play does not open on the start's market and jump there afterwards.
    const resume = save && !save.heir ? save.hero : null;

    // The world as saved: the seed's own decisions, then what the VGM decided while the game was played.
    // (By id: a newer version may open the world with more decisions, such as a people's hold, plan 11.6.)
    const openedIds = new Map(opened.log.map((d) => [d.id, JSON.stringify(d)]));
    const later: Decision[] = save ? save.log.filter((d) => !openedIds.has(d.id)) : [];
    if (save && save.log.some((d) => openedIds.has(d.id) && openedIds.get(d.id) !== JSON.stringify(d))) console.warn('save: this world was made by an older version; it is rebuilt from its seed');
    // Roads decided while the last game was played level the land from the start.
    terrain.settleMore(later);
    const weather = new Weather(seed, setting.world.weather, (x, z) => terrain.skeleton.sample(x, z));
    const hour = title && !params.hourSet ? title.draw.hour : params.hour;
    if (params.weather) {
      if (!WEATHER_KINDS.includes(params.weather as WeatherKind)) throw new Error(`?weather=${params.weather}: one of ${WEATHER_KINDS.join(', ')}`);
      // The same path the VGM takes: an order, here for all time.
      weather.order({ kind: params.weather as WeatherKind, from: -1e6, to: 1e6 });
    } else if (title) {
      // The title's weather, into the first hour of play (it stays while the clock stands still).
      weather.order({ kind: title.draw.weather, from: -1e6, to: hour + 1 });
    }

    loading.set('Starting the renderer');
    const view = await createView(canvas, { forceWebGL: boot.webgl, hour: save?.clock.hour ?? hour, dayMinutes: boot.dayMinutes, tone: params.tone, post: params.post, postSamples: params.postSamples, postFloatDepth: params.postFloatDepth, ao: params.ao, bloom: params.bloom, envGround: params.envGround });
    if (save) view.sky.day = save.clock.day;
    view.sky.look = setting.look?.grade ?? [];
    // The hero walks the land; F (or `?fly`) flies the free camera instead.
    let water: WaterView | null = null;
    // Down in the cellar the walker walks the cellar's space instead of the land.
    let cellars: Cellars | null = null;
    // A people's hold on the land (plan 11.6): its gate and the court's walls stand in the way.
    let hold: HoldGate | null = null;
    // The teachers' towers out on the land (C3): their walls too.
    let retreats: Retreats | null = null;
    const visit = () => cellars?.downIn ?? null;
    // Behind a door the walker walks the room.
    let rooms: InteriorVisit | null = null;
    // The regions the VGM opens as the hero walks, and the places in them (set once the log stands).
    let regionSites: RegionSites | null = null;
    // Every town (the start's and each settlement's): their cores and their buildings (set once the workers run).
    let towns: Towns | null = null;
    // The land, and the steps and porches before the doors (where the townsfolk stand).
    const outdoors = (x: number, z: number) => Math.max(terrain.height(x, z), towns?.stand(x, z) ?? -Infinity);
    // Tree trunks one walks round, asked ahead from the world workers (`jobs`, below) around the hero.
    const trunks = new Trunks(terrain, (x0, z0, size, spacing) => jobs.flora(x0, z0, size, spacing));
    // Rocks one walks round (D55), asked ahead the same way.
    const rocks = new Rocks(terrain, (x0, z0, size) => jobs.rocks(x0, z0, size));
    const below = () => visit()?.world ?? null;
    // The building drawn open (its storeys, stairs and furniture where it stands).
    const openHouse = () => (visit() ? null : rooms?.walk ?? null);
    // Rock, and the open building's floors, walls and stairs (`shut`: its doorway too), on the land.
    const surfaceAt = (x: number, y: number, z: number, shut: boolean): number | null => {
      const t = terrain.rockSurface(x, y, z), h = openHouse()?.rockSurface(x, y, z, shut) ?? null;
      return t === null ? h : h === null ? t : Math.min(t, h);
    };
    // Bridges where roads cross brooks, round the hero: their decks are floors.
    const bridgeView = new BridgeView(view.stage, terrain);
    // The land as walked (also from below, through a cave's portal: the camera trailing out into the day).
    const landWorld: WalkWorld = {
      // In a cave mouth's throat its own floor (it runs under the land's ground, which the crag carves).
      height: (x, z) => cellars?.floor(x, z) ?? terrain.height(x, z),
      // Also the steps and porches before the doors (as floors: climbed a step at a time), and a cave's throat.
      floor: (x, z) => towns?.stand(x, z) ?? bridgeView.deck(x, z) ?? cellars?.floor(x, z) ?? null,
      // A cave mouth's throat is open where the land's own rock is not carved (the crag carves it).
      rockSurface: (x, y, z) => (cellars?.throatAir(x, y, z) ? null : surfaceAt(x, y, z, false)),
      // In a building the camera stays in the room (its doorway shut to it).
      sightSurface: (x, y, z) => (cellars?.throatAir(x, y, z) ? null : surfaceAt(x, y, z, !!rooms?.inside)),
      // The surface as drawn, waves and all: a swimmer rides the swell.
      waterLevel: (x, z) => water?.surfaceAt(x, z) ?? null,
      // Rock faces with holds (D56).
      climbable: (x, z) => terrain.climbable(x, z),
      // The buildings, the tree trunks and the townsfolk (whom one walks around, not through).
      wall: (x, z, r, y) => {
        // Within the open building its walls and the furniture of the storey one is on; elsewhere the town.
        const h = openHouse(), inHouse = h?.wallAt(x, z, r, y) ?? null;
        if (inHouse !== null) return inHouse;
        return !!towns?.solid(x, z, r, h ? rooms?.opened : null) || !!towns?.fixtureAt(x, z, r) || bridgeView.side(x, z, r, y) || trunks.blocks(x, z, r) || rocks.blocks(x, z, r, y) || !!cellars?.solid(x, z, r) || !!regionSites?.standsIn(x, z, r) || !!hold?.solid(x, z, r) || !!retreats?.inKeep(x, z, r) || !!towns?.touches(x, z, r, player.walker.pos.x, player.walker.pos.z);
      },
    };
    // Down in a cellar the walker walks its space, else the land.
    const world: WalkWorld = {
      height: (x, z) => below()?.height(x, z) ?? landWorld.height(x, z),
      floor: (x, z) => (below() ? null : landWorld.floor!(x, z)),
      rockSurface: (x, y, z) => { const b = below(); return b ? b.rockSurface(x, y, z) : landWorld.rockSurface(x, y, z); },
      sightSurface: (x, y, z) => { const b = below(); return b ? (b.sightSurface ?? b.rockSurface)(x, y, z) : landWorld.sightSurface!(x, y, z); },
      waterLevel: (x, z) => (below() ? null : landWorld.waterLevel(x, z)),
      climbable: (x, z) => (below() ? null : landWorld.climbable!(x, z)),
      // Down in a cave its rock walls (D56, P1): a drop is climbed back up, not jumped.
      rockHolds: () => !!below()?.rockHolds?.(),
      wall: (x, z, r, y) => { const b = below(); return b ? !!b.wall?.(x, z, r) : landWorld.wall!(x, z, r, y); },
    };
    const player = new Player(view.camera, canvas, world, params.fly);
    player.goTo(params.pos ?? (resume ? [resume.x, resume.z] : [home.x, home.z]), params.look);
    // The floating origin starts where the camera does (everything drawn is relative to it: render/origin.ts).
    if (params.origin) ORIGIN.moveTo(view.camera.position.x, view.camera.position.z);
    // Off (`origin=0`, or from the debug console: game.followOrigin) the origin stays where it is.
    let followOrigin = params.origin;
    // Dialogs (and the title) hold the game's keys and mouse while open.
    let open = 0;
    // The game's sound (set once the world stands): a dialog's sound, and the music steps back while it is open.
    let sounds: SoundDirector | null = null;
    let opening = 'ui/open';
    const paused = (on: boolean) => {
      const was = open;
      open = Math.max(0, open + (on ? 1 : -1));
      player.pause(open > 0);
      // Calm motion (the setting) stills the windows' shows; read again as any window opens or closes.
      document.documentElement.classList.toggle('calm', settings.current.calm);
      if ((was > 0) !== (open > 0)) sounds?.dialogSound(open > 0, opening);
    };
    // A dialog with a sound of its own as it opens (the journal's page, the map unrolled).
    const pausedWith = (sound: string) => (on: boolean) => { opening = sound; paused(on); opening = 'ui/open'; };
    // What New game leads to once the dive lands (set once the hero exists: character creation).
    let onBegin: ((people: People['id'] | null) => void) | null = null;
    // New game pressed before the world was ready: the rest of the build may take the whole frame (the
    // player waits for it), and the creator gets its people ready meanwhile (set once the hero exists).
    let chosen = null as { people: People['id'] | null } | null;
    let onChose: ((people: People['id'] | null) => void) | null = null;
    let hurry = (): void => {};
    let orbit: Orbit | null = null;
    if (title) {
      paused(true);
      // The fly-over circles the market, where the game starts (or where a loaded game goes on).
      const middle = { x: resume?.x ?? home.x, z: resume?.z ?? home.z, r: start ? (Math.max(start.nx, start.nz) * TOWN_RASTER) / 2 : 0 };
      orbit = { centre: [middle.x, terrain.height(middle.x, middle.z), middle.z], turn: title.draw.turn, angle: title.draw.angle, ground: (x, z) => terrain.height(x, z) };
      await title.attach({
        camera: view.camera,
        orbit,
        toys: {
          height: (x, z) => terrain.height(x, z),
          water: (x, z) => water?.waterAt(x, z) ?? null,
          town: start ? middle : null,
          hour: () => view.sky.hour,
        },
        heroView: () => player.heroView(),
        begin: (people) => { if (onBegin) onBegin(people); else { playing = true; paused(false); } },
        chose: (people) => { chosen = { people }; hurry(); onChose?.(people); },
      });
    }

    loading.set('Painting the ground');
    // The ground's textures are made in workers while the seas, the hero and the town load; the land's
    // shaders need them, so the warm-up waits for them (plan A7: the start's steps overlap).
    const painted = (async () => {
      const texPool = createTexturePool();
      useGroundTextures(await loadGroundTextures(texPool));
      if (start) {
        // The towns' walls, roofs and streets, and where their streets run (the terrain shader reads both; the
        // masks' texture is made the start town's size and moves to whichever town the hero is nearest).
        useTownTextures(await loadTownTextures(texPool));
        useTownMasks(start);
      }
      texPool.dispose();
      console.info(`[load] ${(performance.now() / 1000).toFixed(1)} s: ground textures made`);
    })();

    const wx = new WeatherView(weather, (x, z) => terrain.height(x, z));
    const hours = () => view.sky.day * 24 + view.sky.hour;
    wx.apply(0, view.camera.position, hours(), view.sky);
    view.sky.update(0, view.camera);
    // The shaders build from the moment their parts exist (plan A7): the GPU compiles them while the seas, the
    // hero, the town and the woods load on the main thread, which left it waiting for seconds at 'Preparing
    // shaders'. The material kinds go first, once the ground's textures (which the land's shader reads) are made.
    const capShare = view.stage.cap.share;
    // Behind the loading screen or the title's painted still nothing shows yet: every compile goes at full speed from
    // the start (docs/SHADERS.md rule 5), not only once the kinds are warm. The share comes back once the world shows.
    view.stage.cap.share = 1;
    view.stage.monitor.phase = 'warmup';
    const kindsWarm = painted.then(() => view.stage.warmUp()).then(() => {
      // While the loading screen (or the title's painted still) still covers the view, the land, trees and
      // townsfolk compile at full speed (docs/SHADERS.md rule 5); the cap's share comes back once the world shows.
      view.stage.cap.share = 1;
      view.stage.monitor.phase = 'warmup';
    });
    // Each part compiles as soon as it is made (its shadow shaders once the kinds are warm: 'Preparing shaders').
    const compiling: Promise<unknown>[] = [kindsWarm.then(() => console.info(`[load] ${(performance.now() / 1000).toFixed(1)} s: compiled the kinds (warm-up)`))];
    const compileEarly = (objs: readonly Object3D[]) => {
      // Each says when it is done and how long it took (load.mjs prints it: what 'Preparing shaders' waits for).
      for (const o of objs) {
        const t0 = performance.now();
        compiling.push(view.stage.prepare(o).then(
          () => console.info(`[load] ${(performance.now() / 1000).toFixed(1)} s: compiled ${o.name || o.type} (${((performance.now() - t0) / 1000).toFixed(1)} s)`),
          (e: unknown) => console.error('[load] an early compile failed', e)));
      }
    };
    // Smoke over a raided farm (C10): one shader, built once the game is playable (warmLater).
    const smoke = new SmokeView(deriveSeed(seed, 'smoke'));
    compileEarly([wx.precip]);
    loading.set('Filling the seas');
    useWaterEnvironment(view.sky.envTexture);
    const jobs = new WorldJobs(worldPool, seed, setting.id);
    // Brook tiles ahead of the hero come from the world worker (D50).
    const brooks = new BrookPrefetch(terrain.hydro, jobs);
    // The terrain workers (the land, its rock, the houses); they and the world worker hear of the roads first.
    const terrainPool = createTerrainPool(params.workers);
    // First of all they hear of the rivers' and brooks' tiles this thread traced opening the world: each opens it on
    // them instead of tracing them again (since phase W's lakes and valleys, seconds each, while 'Raising the land' waited).
    void terrainPool.broadcast({ kind: 'tiles', tiles: tracedTiles(terrain.skeleton), seed, setting: setting.id }).catch(() => {});
    const terrainJobs = new TerrainJobs(terrainPool, seed, setting.id);
    const roadWork = new RoadWork(terrain, jobs, terrainJobs);
    void roadWork.start(later);
    // The land round the camera is asked for early (after the roads, which the workers hear of first), so its
    // chunks build while the hero and the town load; it is shown once its shader is warm.
    const ground = new TerrainView(view.stage, terrainJobs, (x, z) => terrain.height(x, z));
    // (Once the ground's textures are made: their workers come first, as the warm-up waits for them.)
    // (And once every river and brook tile under the land drawn at the start is traced, each once, side by side.)
    const rootSide = chunkSize(ROOT_LEVEL), cam = view.camera.position;
    const rx = Math.floor(cam.x / rootSide), rz = Math.floor(cam.z / rootSide);
    const tilesShared = terrainJobs.shareTiles(terrain.hydro, (rx - 1) * rootSide - TILE_PAD, (rz - 1) * rootSide - TILE_PAD, (rx + 2) * rootSide + TILE_PAD, (rz + 2) * rootSide + TILE_PAD)
      .then(() => console.info(`[load] ${(performance.now() / 1000).toFixed(1)} s: rivers and brooks traced`), (e: unknown) => console.error('[load] tracing the tiles failed', e));
    void Promise.all([painted, tilesShared]).then(() => ground.prefetch(view.camera));
    // Every town: the start's, and the hamlets and villages founded out on the land (plan B3), all alike (B3a).
    // A town's words are tied into the game (how its people take the hero, what they offer) once the game's
    // windows exist (`tieTalk`, set below); the doors light at night once its buildings stand.
    let tieTalk: ((t: Township, words: TownTalk) => void) | null = null;
    const lit: Township[] = [];
    towns = new Towns({
      stage: view.stage, terrain, land: terrainJobs, roads: roadWork, masks: !!start && params.town, drawn: params.town,
      setting, seed, hours, log: () => log, get standing() { return standing; }, towns: () => terrain.towns,
      saved: townSaves(save, start?.decision.id ?? null),
      made: (t) => { t.onTalk = (words) => tieTalk?.(t, words); },
      raised: (t) => { lit.push(t); view.warm.atDoors(lit.flatMap((x) => x.town.plan.buildings), (x, z) => terrain.height(x, z), lit.flatMap((x) => x.town.plan.wall ?? [])); },
    });
    const startTown = towns.start;
    // Its masks come from the terrain workers, four of them (the world worker alone made them one after another,
    // between its grass, rocks and plants: 'Raising the land' waited on them).
    const sea = new WaterView(seed, (x0, z0, side, res) => terrainJobs.water(x0, z0, side, res));
    water = sea;
    // Its shader first of all: its pipeline is the slowest to build (over 5 s on the reference PC), and built in the
    // kinds' warm-up it started late and held 'Preparing shaders' for seconds after everything else was done.
    compileEarly([sea.mesh]);
    // The near one first, while the hero is made here (the hero's water; the horses keep out of it).
    const seas = sea.prime(view.camera.position, 1).then(() => console.info(`[load] ${(performance.now() / 1000).toFixed(1)} s: near water mask made`));
    loading.set('Dressing the hero');
    // In the look the player made (a save's), or a new hero of the setting drawn from the seed.
    const hero = await HeroView.load(view.stage, view.renderer, setting.hero, save?.looks?.look ?? null, seed);
    console.info(`[load] ${(performance.now() / 1000).toFixed(1)} s: hero's body made`);
    await seas;
    // The one building shader (bridges, the VGM's sites, the town) samples the town's textures: nothing is built with it
    // before they are made (the near mask can come first now, and a shader built without them stays grey).
    await painted;
    // The wide masks right after (in the terrain workers, beside the land's first chunks): ready by 'Raising the land',
    // which waited seconds for them when they were asked for only once the woods and rocks were placed.
    const wideSeas = sea.prime(view.camera.position);
    // In the water from the start (now that the water is known), and the hero's body built.
    player.resettle();
    title?.run(0);
    player.walker.height = hero.height;
    hero.onLook(() => { player.walker.height = hero.height; });
    player.hero = hero;
    // Now and then a giant walks past the town while the title flies (compiled before it shows).
    let giant: { view: GiantView; t: number } | null = null;
    let giantReady: Promise<void> | null = null;
    if ((title?.draw.giant || params.giant) && title && !title.calm && orbit) {
      const g = { view: await GiantView.grow(view.renderer, GIANT_SPEED), t: 0 };
      g.view.frame(0, giantPose(orbit, title.draw.seed, 0));
      giantReady = preparePeople(view.stage, g.view.object).then(() => view.stage.add(g.view.object)).then(() => { giant = g; });
    }
    let heroName = save?.looks?.name ?? '';
    // The hero's sheet (level, abilities, health, gear, purse) and what they hold.
    const character = new Character(setting, save?.character ?? undefined);
    player.walker.tire = (dt, effort) => {
      character.stamina = Math.max(0, character.stamina - dt * (CLIMB_COST.hang + (CLIMB_COST.move - CLIMB_COST.hang) * effort));
      return character.stamina > 0;
    };
    // `wear`: the gear starts worn, the main hand most (for looking at the smith's bench).
    if (params.wear) Object.entries(character.worn).forEach(([slot, it], i) => { if (it) character.worn[slot as keyof typeof character.worn] = { ...it, wear: params.wear * Math.max(0.3, 1 - i * 0.25) }; });
    // How each people stands with the hero (plan 11.6): their own kin start higher.
    const standing = new Standing(setting, save?.looks?.look.race ?? hero.look.race ?? 'human', save?.standing);
    // A save from before levels (D58): the old reputation becomes experience.
    carryRenown(character, save?.character, save?.standing);
    // The hero's dealings with the guild houses (D49): which gave their task, and when.
    const guildBook = new GuildBook(save?.guilds);
    const armHero = () => hero.arm(character.worn.main?.def ?? null, character.worn.off?.def ?? null);
    armHero();
    compileEarly([hero.object]);
    // Classic or roguelike (plan 11.1): chosen in the creator, kept in the save. What fallen heroes left lies where they fell.
    let mode: GameMode = save?.mode ?? 'classic';
    const remains: Remains[] = [...(save?.remains ?? [])];
    // Drawn where they lie (a pack, a cairn), in the land or down in a cellar.
    const remainsView = new RemainsView(view.stage);
    const drawRemains = () => void remainsView.lay(remains.map((r) => ({ id: r.id, x: r.at.x, y: r.at.y, z: r.at.z, grave: !!r.grave, seed: r.id })));
    if (params.remains && !save) {
      // In front of where the hero stands and a little to the right (out of reach, not hidden behind them), on the ground.
      const w = player.walker, x = w.pos.x - Math.sin(w.yaw) * 2.6 + Math.cos(w.yaw) * 1.3, z = w.pos.z - Math.cos(w.yaw) * 2.6 - Math.sin(w.yaw) * 1.3;
      const at: FallPlace = { x, y: terrain.height(x, z), z, below: null, mark: { x, z }, label: 'out on the land' };
      remains.push({ id: 'remains-shown', grave: params.remains === 'grave' ? 'Wenna Stonehelm' : null, at, items: [], coins: 0, day: 0 });
    }
    drawRemains();
    // A roguelike hero fell: the heir's save is written and nothing saves over it.
    let ended = false;
    // The hero is in play (the title and the creator are behind them): before that nothing is autosaved, or a
    // page left on the title would save a fresh start over the game Continue should bring back.
    let playing = !title && !((params.create && !save) || save?.heir);
    // The VGM's decisions so far (the towns' orders among them: each town's people follow theirs, game/township.ts).
    let log: readonly Decision[] = [...opened.log, ...later];
    // `moved`: the first cellar was cleared long ago, and new dwellers have moved in since.
    const cleared = params.moved && start ? firstDungeon(log) : null;
    if (cleared && start && !keptOf(log).has(cleared.id)) {
      const k = keepPromise(log, cleared.id, hours() - LEADS.settle - 1);
      if (k) log = [...log, k];
      const m = moveInto({ seed, log, towns: terrain.towns, home: start.decision, hours: hours(), purposeOverdue: false, inside: () => false, dungeons: setting.dungeons, terrain }, deriveSeed(seed, 'moved'));
      if (m) log = [...log, m];
    }
    // A road from a place at (x, z) to the network, laid while playing: how the VGM links a place it founds (game.layRoad).
    const layRoad = async (x: number, z: number, way: RoadWay = 'track'): Promise<RoadDecision | null> => {
      const d = await jobs.linkRoad(log.filter((x): x is RoadDecision => x.kind === 'road'), { id: `place-${log.length}`, x, z, r: 0 }, way, hours());
      if (d) { log = [...log, d]; await roadWork.lay(d); }
      return d;
    };
    // A region the VGM opened goes into the log; a hamlet or village founded in it is planned in a worker
    // (plan B3), then gets its cart track to the network (plan 7). The track is routed in the world worker
    // (it takes a few hundred ms), one road at a time so each sees the last.
    let roading: Promise<void> = Promise.resolve();
    const regionOpened = (d: RegionDecision): void => {
      log = [...log, d];
      regionSites?.sync(log);
      if (d.site) void roadWork.clear(d);
      const place = setting.regions ? settlementsOf([d], setting.regions)[0] : undefined;
      if (!place) return;
      roading = roading.then(async () => {
        await towns?.found(d, view.camera.position);
        const road = await jobs.linkRoad(log.filter((x): x is RoadDecision => x.kind === 'road'), place, 'track', d.at);
        if (road && !log.some((x) => x.id === road.id)) { log = [...log, road]; await roadWork.lay(road); }
      }).catch((e: unknown) => console.warn('founding a settlement:', e));
    };
    // The land the VGM opened as the hero walked (plan 5.5): replayed from the log; trees keep out of its places.
    if (setting.regions && params.regions) {
      regionSites = new RegionSites({ stage: view.stage, terrain, regions: setting.regions, seed, home: start?.decision ?? opened.home, sights: setting.sights, jobs: { frontier: (a) => jobs.frontier(a), site: (j) => terrainJobs.site(j) } }, log);
      for (const d of log) if ((d.kind === 'region' && d.site) || d.kind === 'sight') void roadWork.clear(d);
      // `site=<place>`: walk out from the start until one opens, then stand before it.
      const kind = params.site, ids = new Set(setting.regions.fills.filter((f) => f.place === kind).map((f) => f.id));
      for (let dir = 0; kind && dir < 8; dir++) {
        const walked = walkFrontier({ seed, log, terrain, regions: setting.regions, home: start?.decision ?? opened.home }, (dir * Math.PI) / 4, 8, (d) => ids.has(d.fill) && !!d.site);
        const found = walked.at(-1);
        if (!found?.site || !ids.has(found.fill)) continue;
        for (const d of walked) regionOpened(d);
        const s = found.site, d = s.r + (params.siteAt ?? (kind === 'capital' ? 60 : 14)); // a capital's wall stands out past its houses
        player.teleport(s.x + Math.sin(s.yaw) * d, undefined, s.z + Math.cos(s.yaw) * d, s.yaw);
        break;
      }
    }
    // A VGM order for the town the hero is in (the debug menu's): into the log, and its people follow it.
    const orderTown = (t: Township, o: TownOrder): void => {
      log = [...log, townOrder(log, t.id, o)];
      t.obey(o);
    };
    // Saddled horses waiting by the start (Actors' horse): the mount key gets on.
    let horses: HorseView | null = null;
    if (params.horses > 0) {
      loading.set('Saddling the horses');
      const free = (x: number, z: number, r: number) => !world.wall?.(x, z, r) && world.waterLevel(x, z) === null;
      const by = player.walker.pos;
      const spots = horseSpots(by.x, by.z, player.walker.yaw, params.horses, free);
      horses = await HorseView.make(view.renderer, spots.length);
      const pace = groundPace(terrain);
      player.steeds = spots.map((p, i) => {
        const s = new Steed(world, i, seed);
        s.ground = pace;
        s.walker.place(p.x, p.z);
        s.walker.yaw = p.yaw;
        return s;
      });
      player.horses = horses;
      compileEarly(horses.warmObjects());
      if (params.ride && player.steeds[0]) player.mount(player.steeds[0]);
    }
    // The farms' animals in every town's paddocks (the setting says which): bodies for the nearest.
    let stock: StockView | null = null;
    if (params.stock > 0) {
      loading.set('Turning out the herds');
      stock = await StockView.pool(view.renderer, setting.world.livestock, params.stock, (x, z) => terrain.height(x, z));
    }
    // Birds and squirrels about the land (plan 9.3): their squares are the trunks' cells.
    const woods = woodsOf(terrain);
    const small = setting.smallLife && params.small ? new SmallLife(seed, {
      height: (x, z) => bridgeView.ground(x, z, terrain.height(x, z)),
      waterDepth: (x, z) => (bridgeView.deck(x, z) !== null ? 0 : terrain.waterDepth(x, z)),
      // The town's farmland and fields are open land whatever the woods round them.
      woods: (x, z) => (terrain.townGround(x, z) >= TownGround.Street ? 0 : woods(x, z)),
      trees: (i, j) => trunks.peek(i, j),
      blocked: (x, z, r) => !!towns?.solid(x, z, r) || bridgeView.side(x, z, r),
    }, setting.smallLife) : null;
    const smallView = small ? new SmallLifeView(small, view.stage, view.renderer) : null;
    if (stock) compileEarly(stock.toWarm());
    if (smallView) compileEarly(smallView.toWarm());
    let folk: FolkView | null = null;
    if (startTown && params.folk > 0) {
      loading.set('Waking the town');
      // One pool of characters for every town's people, warmed in the start town's clothes (the one wardrobe).
      folk = await FolkView.create(view.stage, view.renderer, startTown.residents, outdoors, params.folk);
      folk.camera = view.camera;
    }
    loading.set('Growing the woods');
    const flora = new FloraView(view.stage, jobs, view.sun, { leafDepth: params.leafDepth, shadows: params.treeShadows });
    if (boot.trees) await flora.placeStart(view.camera.position);
    const rockView = new RockView(view.stage, jobs, view.sun);
    await rockView.placeStart(view.camera.position);
    const grass = boot.grass ? new GrassView(jobs) : null;
    await grass?.sow(view.camera.position);
    sea.update(0, view.camera.position, view.sky.light, view.sky.gain);
    // The first townsman's clothes come over the network: their own step, so 'Preparing shaders' times only the compiles.
    if (folk) loading.set('Dressing the townsfolk');
    const folkWarm = folk ? await folk.warmObjects() : [];
    await painted;
    // The land, its rock and the town's houses are built in workers meanwhile; their shaders compile with the rest.
    roadWork.rebuilds({ ground, flora, grass, trunks, rocks, rockView });
    await roadWork.mask.start(view.camera.position);
    const rock = Promise.all([new VolumeView(view.stage, terrainJobs).raise(), rockView.raise()]);
    // Every town that stands (the start's; a loaded game's settlements too), drawn alike.
    const raised = towns.standing(view.camera.position);
    const landReady = ground.ready(view.camera);
    loading.set('Preparing shaders');
    compileEarly([...(grass ? [grass.group] : []), ...folkWarm]);
    // What is still compiling; then, the kinds warm, every part again: a cache hit for its shaders (or the build of
    // what changed since, such as the hero's arms), and its shadow casters drawn once (Stage.prepare).
    await Promise.all(compiling);
    console.info(`[load] ${(performance.now() / 1000).toFixed(1)} s: every early compile done; their shadows next`);
    await Promise.all([...(grass ? [grass.group] : []), hero.object, wx.precip, ...(horses ? horses.warmObjects() : []), ...(stock ? stock.toWarm() : []), ...(smallView ? smallView.toWarm() : []), ...folkWarm].map((o) => view.stage.prepare(o)));
    let hurried = false;
    const shown = () => { view.stage.cap.share = hurried && !window.__mwReady ? 1 : capShare; view.stage.monitor.phase = hurried && !window.__mwReady ? 'warmup' : 'run'; };
    hurry = () => { hurried = true; if (!window.__mwReady) { view.stage.cap.share = 1; view.stage.monitor.phase = 'warmup'; } };
    if (chosen) hurry();
    loading.set('Raising the land');
    // Each says when it is done (load.mjs prints it: what 'Raising the land' waits for).
    const stamp = (what: string) => () => console.info(`[load] ${(performance.now() / 1000).toFixed(1)} s: ${what}`);
    void wideSeas.then(stamp('wide water masks made'));
    void landReady.then(stamp('land round the camera made'));
    void rock.then(stamp('rock raised'));
    void raised.then(stamp('town standing'));
    await Promise.all([wideSeas, landReady, rock, raised]);
    await view.stage.add(view.sky.dome);
    await view.stage.add(sea.mesh);
    if (grass) await view.stage.add(grass.group);
    await view.stage.add(hero.object);
    await horses?.show(view.stage);
    await stock?.enter(view.stage);
    await smallView?.addBirds();
    await view.stage.add(wx.precip);
    stamp('sky, sea, hero and animals shown')();
    // Spells (plan 10) and the smoke over a raided farm (C10): built once the game is playable, within the
    // shader budget (F3), so they do not lengthen the load (F4, gate C). Neither is needed in the first seconds:
    // until then a spell is reckoned but not drawn, and no smoke rises.
    const spellView = new SpellView(setting);
    let smokeIn = false;
    const warmLater = async (): Promise<void> => {
      await view.stage.add(smoke.mesh);
      smokeIn = true;
      await spellView.enter(view.stage);
    };

    const notes = new Notes();
    if (lost) notes.say('That save was made before the town moved to its river: its world is gone, so a new game begins.', 10);
    // The Director watching over the pacing, the fight's HUD and the journal (the cellars report to them).
    const director = new Director(setting.director, save?.director ?? undefined);
    // One life (roguelike): the Director is stricter with fairness (plan 11.1).
    director.strict = save?.mode === 'roguelike';
    const fightHud = new FightHud(setting, () => settings.current.bindings);
    const journal = new Journal(save?.journal);
    // The land the hero knows (plan 11.7): a new hero knows the town where the game begins; the rest is seen on the way or told of.
    const known = new KnownLand(save?.map);
    if (!save?.map) known.see(home.x, home.z, HOME_SIGHT);
    let seenAt: [number, number] | null = null;
    // Every cellar the VGM promised under the town's houses: the first is built now, the others when the hero steps into the house above.
    const firstPromise = firstDungeon(log);
    const house = firstPromise ? houseOf(firstPromise, terrain.towns) : null;
    /** A place gone quiet with the hero away from it: its household waits to be told (set once the town talks). */
    let quietPlace: ((id: string) => boolean) | null = null;
    /** A cellar gone quiet with the hero down in it: its household comes down to them (set once the town talks). */
    let comeDown: ((id: string) => boolean) | null = null;
    /** Who of a cellar's household came down to the hero (app/ownerComes.ts), while they are there. */
    let owner: OwnerComes | null = null;
    // What the fights (down in a cellar, out on the land) ask of the game.
    const fightHost: FightHost = {
      get bindings() { return settings.current.bindings; },
      get blocked() { return open > 0; },
      wake: () => {
        const v = visit(), w = player.walker.pos;
        const fellAt: FallPlace = {
          x: w.x, y: w.y, z: w.z, below: v ? v.cellar.decision.id : null,
          mark: v ? { x: v.houseDoor[0], z: v.houseDoor[1] } : { x: w.x, z: w.z },
          label: v ? `in ${v.cellar.house}'s cellar` : 'out on the land',
        };
        const id = remainsId(hours());
        if (mode === 'roguelike') { endTale(fellAt, id); return null; }
        // Classic: carried off to wake somewhere safe, the pack left where the hero fell.
        const fell = fallClassic(character, fellAt, id, view.sky.day);
        if (fell.remains) leaveRemains(fell.remains);
        // Where the hero last took a room (plan 11.2), else the nearest town's temple or inn: inside it.
        const at = upkeep?.waking() ?? null;
        const carry = () => (at?.door && rooms ? rooms.enter(at.door, true) : Promise.resolve());
        if (v) void v.leave().then(carry);
        else void carry();
        const place = at?.said ?? setting.upkeep.words.wakeInn;
        return `You wake in ${place}, aching. Someone carried you there${fell.lost ? `, and ${coinText(fell.lost)} went with them` : ''}.`
          + (fell.remains ? ' Your pack stayed where you fell; your map marks the place.' : '');
      },
      still: (on) => paused(on),
      armed: armHero,
      quiet: (id) => quietPlace?.(id) ?? false,
      stilled: (id) => comeDown?.(id) ?? false,
    };
    // What of the land left the frame while the hero is below.
    const hidden: Object3D[] = [];
    // The portals (app/portals.ts: a cave's mouth joined to its throat below), and those opened before they were set up.
    let portals: Portals | null = null;
    /** The lantern lit in a cave mouth's throat on the land (app/cellars.ts throatDepth). */
    let throatLamp = false;
    /** The place below whose lights are lit from out on the land, near its portal. */
    let caveLit: string | null = null;
    /** A cave's own lights are lit once the hero on the land is this near its portal (m). */
    const CAVE_LIGHTS_NEAR = 60;
    /** The realm the warm lights are lit in: the place below the hero is in, or whose portal they are near, else the land. */
    const lampsAt = new Vector3();
    const warmRealm = (): string => { const r = cellars?.realm ?? 'land'; return r !== 'land' ? r : caveLit ?? 'land'; };
    /** The portals' HUD line (empty away from them). */
    let portalHud = '';
    const portalsDue: Portal[] = [];
    /** The portal stone as held up (set once the portals are): it goes below ground with the hero. */
    let stoneMesh: Object3D | null = null;
    cellars = new Cellars({
      stage: view.stage, renderer: view.renderer, camera: view.camera, canvas, player, lantern: view.lantern, warm: view.warm, sky: view.sky, notes, setting, character, seed, director, journal, hud: fightHud,
      fight: fightHost,
      swapped: () => autosave(),
      cue: (c) => sounds?.cue(c),
      dweller: params.dweller,
      ground: (x, z) => terrain.height(x, z),
      jobs: terrainJobs,
      portal: (p) => (portals ? portals.add(p) : void portalsDue.push(p)),
      cleared: (d) => void roadWork.clear(d),
      // Down in a cellar nothing of the land above can be seen: it leaves the frame (it was drawn behind the
      // cellar's walls, half the cellar's frame time). The lights stay, so no shader changes; the land's updates pause below.
      // The hero, what they leave lying and their spells go down with them.
      depth: (down, keep) => {
        if (!down) { for (const o of hidden) o.visible = true; hidden.length = 0; return; }
        const kept = new Set<Object3D>([...keep, hero.object, view.camera, remainsView.group, spellView.group, ...(stoneMesh ? [stoneMesh] : [])]);
        for (const o of view.scene.children) if (o.visible && !kept.has(o) && !(o as Light).isLight) { o.visible = false; hidden.push(o); }
      },
    }, terrain.towns, save?.cellars ?? {});
    cellars.sync(log);
    // What the VGM made and why (D53: never shown in play; its window, alerts and the debug menu read it).
    // Kept in the save (the newest WHY_KEPT), so the log reads the same after a reload.
    const vgmLog: VgmWhy[] = cleanWhys(save?.vgm);
    const noteMade = (m: Made): void => {
      vgmLog.push(whyOf(m));
      if (vgmLog.length > WHY_KEPT) vgmLog.shift();
    };
    // The wild on the land around the town: the VGM places its groups into the log (an older save's too, the
    // same groups it had), built as the hero comes near (D27, plan 9.3, C6b).
    if (start && params.wild) {
      for (const d of wildFor({ seed, log, towns: terrain.towns, terrain, hours: hours(), setting }, start)) {
        log = [...log, d];
        noteMade(madeBy('wild', d, `${d.encounter} round ${d.town} (${d.members.length})`, hours()));
      }
    }
    const wild = start && params.wild ? new WildLand({
      stage: view.stage, renderer: view.renderer, camera: view.camera, canvas, player, notes, setting, character, seed, director, journal, hud: fightHud, fight: fightHost,
      cue: (c) => sounds?.cue(c),
      out: () => !visit() && !rooms?.inside && !player.offFoot,
      // Seen far off by day, near by night.
      light: () => (view.sky.hour > 6 && view.sky.hour < 19.5 ? 40 : 14),
    }, start, {
      height: (x, z) => bridgeView.ground(x, z, terrain.height(x, z)),
      waterDepth: (x, z) => (bridgeView.deck(x, z) !== null ? 0 : terrain.waterDepth(x, z)),
      // Trunks only near the hero (farther off they would be placed on the spot, a cell at a time).
      blocked: (x, z, r) => !!towns?.solid(x, z, r) || bridgeView.side(x, z, r) || (Math.hypot(x - player.walker.pos.x, z - player.walker.pos.z) < 60 && trunks.blocks(x, z, r)),
    }, save?.wild ?? {}, wildOf(log, start.decision.id).map(territoryOf), openBands(log)) : null;
    // The first people's hold (plan 11.6): its gate and court, its wardens built as the hero comes near.
    const holdSite = log.find((d): d is HoldDecision => d.kind === 'hold') ?? null;
    const holdPeople = holdSite ? setting.peoples.find((p) => p.id === holdSite.people && p.hold) : undefined;
    if (holdSite && holdPeople) {
      hold = new HoldGate({
        stage: view.stage, renderer: view.renderer, camera: view.camera, canvas, player, notes, setting, character, seed, director, journal, hud: fightHud, fight: fightHost, standing,
        cue: (c) => sounds?.cue(c),
        out: () => !visit() && !rooms?.inside && !player.offFoot,
        changed: (c) => notes.say(changeLine(c), 6),
        jobs: terrainJobs,
      }, holdSite, holdPeople, {
        height: (x, z) => bridgeView.ground(x, z, terrain.height(x, z)),
        waterDepth: (x, z) => (bridgeView.deck(x, z) !== null ? 0 : terrain.waterDepth(x, z)),
        blocked: (x, z, r) => !!hold?.solid(x, z, r) || bridgeView.side(x, z, r),
      }, save?.hold);
      // `hold`: in the court, facing the gate; `hold=<tier>`: standing with its people at that tier.
      if (params.holdTier) standing.change(holdSite.people, tierFloor(params.holdTier) + 1 - standing.value(holdSite.people));
      if (params.hold) { const [x, z] = onLand(holdSite, 0, COURT.depth + 4); player.teleport(x, undefined, z, holdSite.yaw); }
    }
    retreats = new Retreats(view.stage, log, (x, z) => terrain.height(x, z), seed);
    // `warden`: before the warden's tower, looking at its door and the warden at it.
    const wardenAt = params.warden ? retreats.sites[0] : undefined;
    if (wardenAt) { const [x, z] = onLand(wardenAt, 0, 12); player.teleport(x, undefined, z, wardenAt.yaw); }
    // `kind=<id>`: out in the nearest stretch of that kind of country (L7), looking across it.
    const inKind = params.kind ? terrain.skeleton.nearestKind(params.kind, player.walker.pos.x, player.walker.pos.z) : null;
    if (inKind) player.teleport(inKind.x, undefined, inKind.z, 0);
    // Portals (app/portals.ts): openings joining two places, walked through and looked through.
    const portalView = new PortalView(view);
    await view.stage.add(portalView.group);
    portals = new Portals({
      player, view: portalView, hero: hero.object, lamp: view.lantern,
      realm: () => cellars?.realm ?? 'land',
      // Walked through a cave's portal: down in it now (or out again), with no fade; the game saves as after a fade.
      crossed: (to, from) => {
        const v = cellars?.visitOf(to === 'land' ? from : to);
        if (!v) return;
        if (to === 'land') v.depart(); else v.arrive();
        caveLit = null;
        v.onSwap?.();
      },
      // One realm shown for a view: the land (what left the frame below comes back, the places below go) or a place
      // below (the land leaves the frame; the hero, what lies about and the spells stay), and its light.
      showRealm: (realm) => {
        // Each realm's own shadow maps only: the land's the sun's, the torches' those of the place below whose lights
        // are lit (a cave's torch over the land's plants would build shaders in play; the sun's map of a cave is of
        // nothing it lights).
        const held: { needsUpdate: boolean }[] = [], warmIn = warmRealm();
        for (const o of view.scene.children) {
          const l = o as Light & { shadow?: { needsUpdate: boolean } };
          if (l.isLight && l.shadow?.needsUpdate && (l === view.sun ? realm !== 'land' : warmIn !== realm)) { l.shadow.needsUpdate = false; held.push(l.shadow); }
        }
        const unhold = (): void => { for (const s of held) s.needsUpdate = true; };
        if (realm === (cellars?.realm ?? 'land')) return unhold;
        const changed: [Object3D, boolean][] = [];
        const set = (o: Object3D, on: boolean): void => { if (o.visible !== on) { changed.push([o, o.visible]); o.visible = on; } };
        if (realm === 'land') {
          for (const o of hidden) set(o, true);
          for (const o of cellars?.drawnBelow() ?? []) set(o, false);
        } else {
          const mine = cellars?.drawnOf(realm) ?? [];
          const kept = new Set<Object3D>([...mine, hero.object, view.camera, remainsView.group, spellView.group, portalView.group, ...(stoneMesh ? [stoneMesh] : [])]);
          for (const o of view.scene.children) if (!kept.has(o) && !(o as Light).isLight) set(o, false);
          for (const o of mine) set(o, true);
        }
        const back = view.sky.shade(realm === 'land' ? 'open' : cellars?.visitOf(realm)?.cellar.form.space.carved ? 'cave' : 'below');
        return () => { for (let i = changed.length - 1; i >= 0; i--) changed[i][0].visible = changed[i][1]; unhold(); back(); };
      },
      world: (realm) => (realm === 'land' ? landWorld : cellars?.visitOf(realm)?.world ?? null),
    });
    for (const p of portalsDue.splice(0)) portals.add(p);
    const through = portals;
    view.slot = () => through.hooks(view.camera.position);
    // The hero's hands raised (a spell gathering, the portal stone held up), thrown out (let go) or lowered, for `dur` s.
    const castHands = (what: 'charge' | 'release' | 'stop', dur: number): void => {
      const h = player.hero;
      if (h) player.stance = { ...player.stance, action: what === 'stop' ? undefined : { id: what === 'charge' ? 'spell_charge' : 'spell_release', t0: h.clock, dur } };
    };
    // The portal stone (game/portalStone.ts): held up from the pack, its glyphs mark home and open a portal back to it.
    const stoneUse = new PortalStoneUse({
      stage: view.stage, camera: view.camera, canvas, player, portals,
      probe: {
        standFloor: (x, z) => landWorld.floor!(x, z) ?? landWorld.height(x, z),
        blocksAt: (x, z, r, y) => landWorld.wall!(x, z, r, y),
        rockGapAt: (x, y, z) => landWorld.rockSurface(x, y, z),
        wetAt: (x, z) => landWorld.waterLevel(x, z),
      },
      onLand: () => !visit(),
      playing: () => open === 0 && playing,
      sound: (what, at) => {
        if (what === 'raise') sounds?.spell('gather', 'shade', at);
        else if (what === 'beam') sounds?.spell('loose', 'radiance', at);
        else if (what === 'open') sounds?.spell('hit', 'shade', at);
        else if (what === 'close') sounds?.spell('loose', 'shade', at);
        else sounds?.spell('hit', 'flame', at);
      },
      gesture: (what) => castHands(what === 'raise' ? 'charge' : 'release', what === 'raise' ? 0.9 : 0.8),
      changed: () => autosave(),
    }, cleanStoneSave(save?.portalStone));
    await stoneUse.addToStage();
    stoneMesh = stoneUse.mesh;
    spellView.also = (b, dt) => stoneUse.stoneLight(b, dt);
    if (params.portal) {
      // `portal`: an opening 6 m ahead, joined to one 30 m to the right, turned a quarter.
      const w = player.walker.pos, yaw = player.walker.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const ax = w.x + fx * 6, az = w.z + fz * 6, bx = w.x - fz * 30, bz = w.z + fx * 30;
      portals.add({ id: 'test', shape: { halfWidth: 1.3, height: 2.8 }, a: { realm: 'land', frame: { x: ax, y: terrain.height(ax, az), z: az, yaw } }, b: { realm: 'land', frame: { x: bx, y: terrain.height(bx, bz), z: bz, yaw: yaw + Math.PI / 2 } } });
    }
    // `barrow`, `cave`, `tower`: before one, looking at it (one is promised now if there is none).
    const lookAt: LandKind | null = params.barrow ? 'barrow' : params.cave ? 'cave' : params.tower ? 'tower' : null;
    const lookForm = lookAt ? setting.dungeons[lookAt]?.form : undefined;
    if (lookAt && lookForm && start) {
      let b = log.find((d): d is DungeonDecision => d.kind === 'dungeon' && d.template === lookAt) ?? null;
      if (!b) {
        b = promisePlace(lookAt, lookForm, seed, terrain, start, log, home, wild?.territories ?? []);
        if (b) { log = [...log, { ...b, at: hours() }]; cellars.sync(log); }
      }
      // Far enough off to see it whole.
      const off = { hatch: 9, mound: 9, mouth: 16, keep: 32 }[lookForm.shell];
      if (b?.site) player.teleport(b.site.x + Math.sin(b.site.yaw) * off, undefined, b.site.z + Math.cos(b.site.yaw) * off, b.site.yaw);
    }
    // `wild=<kind>`: beside its first group (for looking at them).
    const by = params.wildAt ? wild?.territories.find((t) => t.kind === params.wildAt) : undefined;
    if (by) player.teleport(by.x + by.r + 20, undefined, by.z, Math.PI / 2);
    // Once that group is built, the hero steps up to one of them (a dozen metres off, facing it).
    let lookWild = by ? by.kind : null;
    // `small=squirrel` / `birds` / `flock`: beside the first that is about (for looking at them).
    let lookSmall = params.smallAt;
    /** With `fly`: the one the free camera follows, and how far off. */
    let watchSmall: { it: { x: number; y: number; z: number }; d: number } | null = null;
    /** The hero `d` metres from `seen`, on the side they are on, facing it. */
    const standBeside = (seen: { x: number; z: number }, d: number) => {
      const p = player.walker.pos, k = Math.max(1, Math.hypot(p.x - seen.x, p.z - seen.z));
      const x = seen.x + (p.x - seen.x) / k * d, z = seen.z + (p.z - seen.z) / k * d;
      player.teleport(x, undefined, z, Math.atan2(x - seen.x, z - seen.z));
    };
    // A save from before kept promises were logged: the cellars its household paid for are kept.
    for (const id of Object.keys(save?.cellars ?? {})) if (save?.cellars[id].paid && !keptOf(log).has(id)) { const k = keepPromise(log, id, hours()); if (k) log = [...log, k]; }
    let dwellers: Promise<void> | null = null;
    // A game saved below goes on in its cellar: built and entered (its people warmed) before the world is ready.
    if (resume?.below) loading.set('Opening the cellar where you left off');
    const savedBelow = resume?.below ? await cellars.build(resume.cellar ?? firstPromise?.id ?? '') : null;
    const belowWarm = cellars.warming;
    if (savedBelow) await savedBelow.enter(true);
    if (firstPromise) {
      loading.set('Waking the cellar');
      const v = await cellars.build(firstPromise.id);
      // Its people's shaders (each one's shadow casters too) build in the Stage's frame slots once the loop runs; loading waits for them below.
      dwellers = cellars.warming;
      if (v && params.cellar && !savedBelow) {
        await v.enter(true, params.cellarRoom);
        if (params.look) ({ yaw: player.heroCam.yaw, pitch: player.heroCam.pitch } = lookFromDegrees(params.look[0], params.look[1] ?? -10));
        player.walker.yaw = player.heroCam.yaw;
      }
    }

    // Every door of every town opens on its room; a cellar's house has the hatch down.
    rooms = new InteriorVisit(towns, cellars.down, new HouseView(view.stage), player, view.lantern, view.sky, (b, hatch, hall, sign) => terrainJobs.house(b, hatch, hall, sign));
    // `room=<kind|number|cellar>`: in that building of the town the hero is in (the cellar: the first promise's house).
    const roomTown = params.room === 'cellar' && firstPromise ? towns.get(firstPromise.town) : towns.townAt(player.walker.pos.x, player.walker.pos.z) ?? startTown;
    if (roomTown && params.room !== null) {
      const plan = roomTown.town.plan;
      const guild = params.room === 'guild' || params.room === 'guild-out';
      const b = params.room === 'cellar' ? house : guild ? roomTown.guilds[0]?.b : plan.buildings.find((x) => x.kind === params.room) ?? plan.buildings[Number(params.room)];
      // `room=guild-out`: in the street before the guild house, facing its door (the sign over it).
      if (b && params.room === 'guild-out') { const s = atDoor(b); player.teleport(s.x, undefined, s.z, s.yaw); }
      else if (b) await rooms.enter({ town: roomTown, b }, true, params.room === 'cellar'); // the cellar: beside its hatch
      if (b && params.look) ({ yaw: player.heroCam.yaw, pitch: player.heroCam.pitch } = lookFromDegrees(params.look[0], params.look[1] ?? -10));
    }

    // The trees' shaders (and the townsfolk's other detail levels) are built in the Stage's frame slots, so
    // the loop must run meanwhile; loading ends once they stand.
    loading.set('Planting the trees');
    let planted = false;
    // The trees first: once they stand, the title's fly-over shows the live land while the townsfolk's
    // many garments still warm up behind it (they are drawn only once warm).
    const took = (what: string) => () => console.info(`[load] ${(performance.now() / 1000).toFixed(1)} s: ${what} ready (${view.stage.hudLine().split('\n')[0]})`);
    const trees = (boot.trees ? flora.plant() : Promise.resolve()).then(took('trees'));
    let landed = false;
    void trees.then(() => { landed = true; if (folk) loading.set('Waking the townsfolk'); });
    // One part failing (a file that would not load) must not hold the start: it is logged and play begins.
    const survive = (what: string, p: Promise<unknown> | null | undefined) => p?.catch((e: unknown) => console.error(`[load] ${what} failed`, e));
    // The townsfolk show once one look stands in every detail level; their other looks, the cellar's people (unless
    // the start is down there) and the title's giant finish behind play (plan A7).
    const folkLooks = folk?.warmLods();
    void survive('townsfolk', folkLooks?.done.then(took('townsfolk, every look')));
    void survive('cellar', dwellers?.then(took('cellar')));
    void survive('giant', giantReady);
    let plantedAt = 0, dressedAt = 0;
    const planting = Promise.all([survive('trees', trees), survive('townsfolk', folkLooks?.shown.then(took('townsfolk'))), params.cellar || savedBelow ? survive('cellar', savedBelow ? belowWarm : dwellers) : null]).then(() => { planted = true; plantedAt = performance.now(); });
    const hud = document.getElementById('hud');
    // The settings that apply while playing (the URL's day= holds the clock's speed for this session).
    let showHud = params.hud;
    const pixels = view.renderer.getPixelRatio();
    let scale = 1;
    settings.watch((s) => {
      const cam = player.heroCam;
      cam.controls.bindings = s.bindings;
      cam.mouseSpeed = s.mouseSpeed;
      cam.invertMouse = s.invertMouse;
      if (view.camera.fov !== s.fov) { view.camera.fov = s.fov; view.camera.updateProjectionMatrix(); }
      if (scale !== s.renderScale) { scale = s.renderScale; view.renderer.setPixelRatio(pixels * scale); }
      if (params.dayMinutes === null) view.sky.dayMinutes = s.dayLength;
      director.pace = PACING[s.pacing];
      showHud = params.hud || s.hud;
      if (hud) hud.style.display = showHud ? '' : 'none';
    });
    // Dialogs: the debug menu first, so its keys come before the settings' Escape.
    // Talk and the journal (their Escape comes before the settings' too). The townsfolk know of the
    // promised cellar; what the player hears goes into the journal.
    // Declared before the sounds read it: a `?talk=` start opens a dialog right away.
    let creator: Creator | null = null;
    sounds = new SoundDirector({
      engine: sound.engine, seed, camera: view.camera, walker: player.walker, terrain, town: () => towns?.nearest(view.camera.position.x, view.camera.position.z)?.town ?? null,
      water: (x, z) => sea.waterAt(x, z),
      waterLevel: (x, z) => world.waterLevel(x, z),
      weather: () => wx.shown,
      hour: () => view.sky.hour,
      flash: () => ({ light: view.sky.flash, bearing: view.sky.flashBearing }),
      where: () => (visit() ? { place: 'cellar', room: null } : rooms?.door ? { place: 'room', room: rooms.door.b.kind } : { place: 'land', room: null }),
      inFlight: () => player.offFoot,
      horses: () => player.steeds,
      riding: () => player.riding,
      threat: () => (director.mood === 'fight' ? 'fight' : director.mood === 'tension' ? 'tension' : null),
      // Silent until the world is playable: no beds, steps or music (it streams, D44/F4) compete with the start's downloads.
      titleHolds: () => !!title?.holding || !!creator?.showing || !window.__mwReady,
    });
    // A town's people and their words, in every town alike (plan B3a). The town the hero is in: within reach of
    // its edge (out on the land: none).
    const here = (): Township | null => towns?.townAt(player.walker.pos.x, player.walker.pos.z) ?? null;
    /** The town whose people know of promise `id` (its household lives there). */
    const townOfPromise = (id: string): Township | null => {
      const d = dungeonOf(log, log.find((x) => x.id === id));
      return d ? towns?.get(d.town) ?? null : null;
    };
    /** A story event is over: the people of its town, and of a place it held, tell how it ended (C11). */
    const eventEnded = (ev: EventDecision): void => {
      for (const id of [ev.town, ev.held]) if (id) towns?.get(id)?.ended(ev.id);
    };
    /** A good deed for a town's people (D54, once by `key`): how they take it is said, as for a promise kept; it gives experience (D58). */
    const deedFor = (key: string, t: Township | null | undefined, by: number, source: GrowthSource, told = false): void => {
      character.earn(key, source);
      const people = t ? peopleOf(t.residents) : null;
      const own = people ? standing.deed(key, people, by, told).find((c) => c.people.id === people) : undefined;
      if (own) notes.say(changeLine(own), 5);
    };
    // A place gone quiet: the journal says whom of its household to tell, and the map marks their door.
    quietPlace = (id) => {
      // A story event's band beaten (C6): the lead is done, and its town will hear of it.
      const ev = log.find((x) => x.id === id);
      if (ev?.kind === 'event') {
        const k = keepPromise(log, id, hours());
        if (k) log = [...log, k];
        journal.fulfil(id);
        eventEnded(ev);
        // A good deed (D54): the town freed of the band (a held place's own folk most) thinks better of the hero.
        deedFor(`band:${id}`, towns?.get(ev.held ?? ev.town), setting.standing.kept, 'band', true);
        director.met('purpose');
        const told = eventTold(setting, log, terrain.towns, ev);
        if (told) director.queue(told.done, 2);
        return true;
      }
      // Wolves beaten off a paddock (C10): its farm's people think better of the hero, once.
      if (ev?.kind === 'wild' && ev.situation) {
        const k = keepPromise(log, id, hours());
        if (k) log = [...log, k];
        deedFor(`wolves:${id}`, towns?.get(ev.town), setting.standing.help, 'help');
        return true;
      }
      // A place cleared is experience (D58), once; telling its household is more.
      character.earn(`cleared:${id}`, 'cleared');
      const t = townOfPromise(id);
      if (!t || !t.talk.clear(id)) return true;
      const words = t.talk, to = words.reportTo(id)[0], p = t.residents.find((x) => x.id === to);
      if (p === undefined) return true;
      const name = words.nameOf(p.id), house = words.homeCalled(p.id), door = t.town.plan.buildings[p.home].door;
      journal.quiet(id, { text: fill(setting.talk.cleared.note, { name, house }), from: 'you' }, { x: door[0], z: door[1], label: name });
      return true;
    };
    /**
     * Promise `id` kept, its household in town `t` told: into the log and the journal, a good deed with the
     * household's people (and the hero's name), a master's gift if it was their deed (C14), and the VGM's next lead.
     */
    const keptNow = (id: string, t: Township): void => {
      const k = keepPromise(log, id, hours());
      if (k) log = [...log, k];
      journal.fulfil(id);
      director.met('purpose');
      const who = householdOf(log, id, t.residents);
      character.earn(`kept:${id}`, 'kept');
      const own = who ? standing.keptFor(who.race, id).find((c) => c.people.id === who.race) : undefined;
      if (own) notes.say(changeLine(own), 5);
      vgmStep({ tools: ['promise'] });
      if (questGift(setting, log, id, character)) learnedAbility();
    };
    /**
     * The household of promise `id` (in town `t`) knows its place is safe again, told in talk or come down to see: they
     * pay (a master's deed, C14, pays in their gift, not coin), the promise is kept, and the VGM's next lead may come up in
     * the same breath. What they say in thanks.
     */
    const paidFor = (id: string, t: Township, came = false): string => {
      const due = cellars.keep(id, came);
      const deed = questGuild(setting, log, id);
      const coins = deed ? 0 : due?.coins ?? 0;
      character.coins += coins;
      if (coins) sounds?.cue({ kind: 'paid', coins });
      character.earn(`cleared:${id}`, 'cleared');
      keptNow(id, t);
      return deed?.quest ? deed.quest.done : due ? due.thanks(coinText(coins)) : '';
    };
    // A cellar gone quiet with the hero down in it (show, don't tell): the one of its household the hero would report to
    // climbs down the ladder, comes to the hero and thanks and pays them there.
    comeDown = (id) => {
      const v = visit(), t = townOfPromise(id);
      if (!v || owner || !t?.living || t.talk.isSettled(id)) return false;
      // Under a house, the one they would tell; out on the land, whoever of the household waits outside.
      const to = t.talk.reportTo(id)[0], a = v.above ? t.life.agentOf(to) : t.waiterOf(id);
      if (!a) return false;
      owner = new OwnerComes(v, a, {
        body: () => folk?.bodyOf(a) ?? null,
        say: (text, at) => speech.say(text, at),
        told: () => {
          t.talk.thanked(a.person.id, id);
          return paidFor(id, t, true);
        },
      });
      return true;
    };
    /**
     * Out on the land, one of a place's household waits outside its way in while it is to be cleared (they come in to the
     * hero once it is quiet: `comeDown`). They go out there unseen (the hero still beyond where anyone out of doors is
     * drawn, or inside the place), and home again unseen once it is kept or the hero has gone off.
     */
    const waitOutside = (): void => {
      const w = player.walker.pos, v = visit();
      for (const p of cellars.landPlaces()) {
        const t = towns?.get(p.town);
        if (!t) continue;
        const inside = !!v && v === p.visit, d = Math.hypot(w.x - p.x, w.z - p.z), waiter = t.waiterOf(p.id);
        const unseen = inside || d > WAIT_UNSEEN;
        if (t.talk.isSettled(p.id) || (!inside && d > WAIT_GONE)) {
          if (waiter && unseen && owner?.agent !== waiter) t.waitOver(p.id);
          continue;
        }
        if (waiter || (!inside && (d > WAIT_FROM || player.offFoot))) continue;
        if (!unseen) continue;
        const to = t.talk.reportTo(p.id)[0];
        if (to !== undefined) t.waitAt(p.id, to, p.x, p.z, p.dir);
      }
    };
    // Who knows the hero from before (plan 11.4): people of the town the game began in; their greeting names them.
    const friendsOf = (bg: BackgroundDef | undefined) => (bg && startTown ? acquaintances(bg, startTown.residents) : []);
    const meetOldFriends = () => {
      const bg = setting.backgrounds.find((b) => b.id === character.background);
      startTown?.talk.acquaint(friendsOf(bg).map((a) => ({ person: a.person.id, line: a.line })), heroName || 'friend');
    };
    // What townsfolk do besides talk (trade, repairs, a room): a talk topic each, which opens its window for
    // the person asked, in their town (`talk.place`).
    const services = new Map<string, (a: Agent) => void>();
    const keyName = (k: 'journal' | 'map' | 'talk') => (settings.current.bindings[k][0] || settings.current.bindings[k][1]).replace(/^Key/, '');
    // Every town's merchants (plan 11.5): the smith, the inn's keeper and the market's stalls; their prices
    // follow how the hero stands with their people (plan 11.6).
    const trade = new TradeUi(character, setting, {
      paused,
      get bindings() { return settings.current.bindings; },
      get day() { return view.sky.day; },
      traded: () => sounds?.coins(),
      say: (text) => notes.say(text),
    });
    /** Talk here: the town of whoever the hero talks with (or would, at the talk key). */
    const talkTown = (): Township | null => talk?.place ?? null;
    const nameHere = (id: number): string => talkTown()?.talk.nameOf(id) ?? '';
    // A hurt traveller seen to (C10, D54): the hero kneels by them and binds the wound, and they get up again.
    services.set('tend', (a) => {
      const t = talkTown(), d = t?.hurtNow();
      if (!t || !d || player.puppet) return;
      const w = player.walker.pos, dx = w.x - a.x, dz = w.z - a.z, k = TEND_AT / (Math.hypot(dx, dz) || 1);
      const kneel: SearchKneel = new SearchKneel(w, player.walker.yaw, { x: a.x, z: a.z }, null, () => {
        const kept = keepPromise(log, d.id, hours());
        if (kept) log = [...log, kept];
        director.met('people');
        character.earn(`tend:${d.id}`, 'help');
        const own = standing.deed(`tend:${d.id}`, a.person.race, setting.standing.help).find((c) => c.people.id === a.person.race);
        if (own) notes.say(changeLine(own), 5);
      }, { x: a.x + dx * k, z: a.z + dz * k }, { busy: TEND_FOR, ground: (x, z) => terrain.height(x, z), up: () => { if (player.puppet === kneel) player.puppet = null; } });
      player.puppet = kneel;
    });
    services.set('trade', (a) => { const t = talkTown(), m = t?.market.of(a.person.id); if (t && m) { director.model.note('crafter', 0.5); trade.show(t.market, m, t.talk.nameOf(a.person.id)); } });
    // Talk: in the town the hero is in (it follows them from town to town, below).
    const talk: TalkUi | null = startTown ? new TalkUi(startTown, setting.talk, journal, player, {
      paused,
      get bindings() { return settings.current.bindings; },
      // Flying, below in a cellar, or still at the title (its fly-over is no place to talk).
      get away() { return player.offFoot || !!visit() || !!title?.holding; },
      heard: (lead) => {
        handOver?.give(lead.id);
        director.model.count('hints');
        // The hero's own first page ("ask at the inn") has done its work.
        journal.fulfil(ARRIVAL);
      },
      heardOf: (id, from) => learnEvent(id, from),
      serve: (id, a) => services.get(id)?.(a),
      report: (id, a) => {
        const t = talk!.place;
        return t.talk.toldSafe(a.person.id, id, paidFor(id, t));
      },
      get roomPeople() { return rooms?.inside ? rooms.people() : null; },
    }) : null;
    // A room at the inn and the smith's mending (plan 11.5): two more services, in whichever town.
    const upkeep = new UpkeepUi(character, setting, {
      paused,
      get bindings() { return settings.current.bindings; },
      get town() { return talkTown(); },
      townOf: (id) => towns?.get(id) ?? null,
      // Carried off with no room taken: to the nearest town with a temple or an inn.
      get refuge() {
        const w = player.walker.pos;
        let best: Township | null = null, low = Infinity;
        for (const t of towns?.every ?? []) {
          if (!buildingOf(t.town.plan, 'temple') && !buildingOf(t.town.plan, 'inn')) continue;
          const d = Math.hypot(t.town.decision.x - w.x, t.town.decision.z - w.z);
          if (d < low) { low = d; best = t; }
        }
        return best;
      },
      get towns() { return towns?.every ?? []; },
      log: () => log,
      journey: (d) => { log = [...log, d]; },
      hours,
      setClock: (h) => { view.sky.day = Math.floor(h / 24); view.sky.hour = h - view.sky.day * 24; },
      enter: (door) => rooms?.enter(door, true) ?? Promise.resolve(),
      say: (text, secs) => notes.say(text, secs),
      worth: (it) => itemWorth(setting.items, it),
      rang: () => sounds?.rang(),
    });
    for (const id of UPKEEP_SERVICES) services.set(id, (a) => { const t = talkTown(); if (t) upkeep.answer(id, a.person, t.talk.nameOf(a.person.id)); });
    /** An ability was learned (a teacher, a writing): the hero redressed, and bird form's body made ready once it is known. */
    // What the hero can do changed (a spell learned, an item that gives an ability put on or off): the bar and book show it.
    const learnedAbility = () => { armHero(); actionBar.draw(); book.redraw(); if (birdAbility && character.knows(birdAbility.id)) void birdForm?.warm(); };
    /** One of the canon's legendary items (C5) into the pack and on, to try the ability it gives (debug menu, shots). */
    const wearLegend = (id: string): string => {
      const u = setting.items.uniques.find((x) => x.id === id);
      if (!u) return `no legendary item "${id}"`;
      const it = uniqueItem(u);
      character.pack.push(it);
      character.equip(it);
      learnedAbility();
      return `${u.name} worn${it.grants ? `: ${abilityOf(setting, it.grants)?.name ?? it.grants} on the action bar` : ''}`;
    };
    // Lessons (plan 11.4, D49, D59): the guild houses' trainers teach abilities for coin at a level; one more service.
    const lessons = new LessonsUi(character, setting, {
      paused,
      get bindings() { return settings.current.bindings; },
      taught: (h) => { const t = hours() + h; view.sky.day = Math.floor(t / 24); view.sky.hour = t - view.sky.day * 24; sounds?.coins(); },
      changed: learnedAbility,
      book: guildBook,
      log: () => log,
      hours,
      standing,
      // A master's one deed (C14): the VGM makes its place, the master's household will be told; it goes in the journal and on the map.
      quest: (g) => {
        const t = talkTown(), house = t?.guilds.find((h) => h.guild.keeper === g.keeper);
        if (!t || !house || !start || !g.quest) return null;
        const d = questFor({ guild: g, town: t.town, building: house.b.id, hours: hours() }, { seed, terrain, log, home: start.decision, dungeons: setting.dungeons, avoid: wild?.territories ?? [] });
        const place = d && placeOf(d, terrain.towns, setting.dungeons)?.name;
        if (!d?.site || !place) return null;
        applied(madeBy('quest', d, `${g.keeper}'s deed, for ${g.quest.reward}: the hero is a student and known well enough`, hours()));
        const from = t.talk.nameOf(t.residents.find((p) => p.trade === g.keeper)?.id ?? -1) || g.name;
        journal.hear(d.id, fill(setting.talk.lead, { cellar: place }), { text: fill(g.quest.ask, { place }), from }, { x: d.site.x, z: d.site.z, label: place });
        return place;
      },
    });
    services.set('lessons', (a) => { const t = teacherOf(setting, a.person), town = talkTown(); if (t && town) lessons.teach(t, town.talk.nameOf(a.person.id), a.person.race); });
    // The bard at the inn (D49): "where can I learn something?" names every guild house of the town and puts
    // it on the map, a hidden one with its way in.
    services.set('bard', (a) => {
      const t = talkTown();
      if (!t || !setting.bard) return;
      const told = bardTells(setting, t.town.decision, t.guilds, guildBook, (k) => { const m = t.residents.find((p) => p.trade === k); return m ? t.talk.nameOf(m.id) : null; });
      notes.say(told.length ? `${told.join(' ')} (Map: ${keyName('map')})` : `${t.talk.nameOf(a.person.id)} knows of no guild house here.`, 12);
      sounds?.noted();
    });
    // The peoples in talk (plan 11.6): greetings, refusals and kept news by standing; where a people's hold is, and gifts.
    const peoples = new PeoplesTalk({
      setting, character, standing, journal, holds: terrain.holds,
      nameOf: nameHere,
      say: (text, secs) => notes.say(text, secs),
      marked: (id) => { handOver?.give(id); notes.say(`${holdPeople?.hold?.name ?? 'The hold'} is marked on your map. (Map: ${keyName('map')})`, 6); },
      paid: () => sounds?.coins(),
    });
    for (const id of PEOPLE_SERVICES) services.set(id, (a) => peoples.serve(id, a.person));
    // Every town's words, tied in as they are made: how its people take the hero, and what each offers
    // besides talk (their shop, a room, mending, lessons, the peoples' services). The same for every town.
    const tend = situationOf(setting, 'hurt-traveller')?.tend;
    tieTalk = (t, words) => {
      words.manner = (p) => standing.manner(p.race, p.seed);
      words.services = (id) => {
        const p = t.residents.find((x) => x.id === id);
        if (!p) return [];
        const shop = t.market.of(id)?.shop, teacher = teacherOf(setting, p);
        return [
          ...(shop ? [{ id: 'trade', label: shop.topic, line: shop.line }] : []),
          ...upkeep.services(p),
          // A hidden guild house's trainer is a locksmith like any other until the bard told the way in (D49).
          ...(teacher && guildBook.onMap(t.id, teacher) ? [{ id: 'lessons', label: teacher.topic, line: teacher.line }] : []),
          ...(setting.bard && t.bard?.id === id && t.guilds.length ? [{ id: 'bard', label: setting.bard.topic, line: setting.bard.line }] : []),
          ...peoples.services(p),
          // The hurt traveller by the way (C10): the hero may see to them.
          ...(tend && p.role === 'traveller' && t.hurtNow() ? [{ id: 'tend', label: tend.topic, line: tend.line }] : []),
        ];
      };
    };
    // Words made before the game's windows existed (none should be: the first talk is asked for below).
    for (const t of towns.every) if (t.talked) tieTalk(t, t.talk);
    meetOldFriends();
    const journalUi = new JournalUi(journal, { paused: pausedWith('ui/page'), get bindings() { return settings.current.bindings; } });
    const pack = new PackUi(character, setting, {
      paused,
      get bindings() { return settings.current.bindings; },
      changed: learnedAbility,
      drank: (n) => { if (n > 0) fightHud.healed(); },
      raised: () => stoneUse.holdUp(),
      readOut: (why, id) => {
        const a = abilityOf(setting, id);
        notes.say(why ?? `You read it through, and ${a?.name ?? id} is yours. The page crumbles to dust.`, 7);
        if (!why) learnedAbility();
      },
    });
    // The action bar (plan 17.1): always there in play, its keys 1 to 0; the ability book (K) arranges it.
    const encounters = () => [...cellars.encounters, ...(wild?.encounters ?? []), ...(hold?.encounters ?? [])];
    const leading = () => encounters().find((e) => e.leading) ?? null;
    const potions = () => character.pack.filter((i) => setting.items.items.find((d) => d.id === i.def)?.kind === 'potion').length;
    // Out of a fight the hero's own spells still work (healing, wards): the recipe runner with nobody else about.
    const alone = new Recipes(character, new Alone(character, () => player.walker.pos), setting.effects ?? [], deriveSeed(seed, 'alone'));
    const aloneCues: RecipeEvent[] = [];
    // A spell is cast with the hands (the hero raises them while it gathers and throws them on release) and heard.
    // Spells gather in the hand the cast clip holds up (the left).
    spellView.handOf = (out) => player.hero?.handAt('l', out) ?? null;
    spellView.listener = {
      hands: castHands,
      sound: (what, motif, at) => sounds?.spell(what, motif, at),
    };
    // Bird form (plan 10): the hero becomes a pheasant and flies; the change takes its time and never in a fight.
    const birdAbility = setting.abilities.find((a) => shapeOf(a)?.into === 'bird') ?? null;
    const birdForm = birdAbility ? new BirdForm(birdAbility, player, world, {
      stage: view.stage, notes,
      around: () => ({ fighting: encounters().some((e) => e.pressure.fighting > 0), riding: !!player.riding, swimming: player.walker.mode === 'swim', roofed: !!visit() || !!rooms?.inside }),
      changed: () => autosave(),
    }) : null;
    if (birdForm && birdAbility && character.knows(birdAbility.id)) void birdForm.warm();
    // Sitting down to rest (the rest key or the bar): faster healing, ended by moving, a fight or a wound.
    const rest = new Rest(character);
    const restWatch = (): RestWatch => ({
      moving: player.walker.gait !== 'idle',
      fighting: encounters().some((e) => e.pressure.fighting > 0),
      afoot: !player.riding && !player.offFoot && !player.hideHero && !birdForm?.flying && player.walker.mode === 'ground',
    });
    /** An ability from the action bar (or a shot): resting, bird form, the fight's, the hero's own out of a fight, the potion. A line why not, or null. */
    const useAbility = (id: string): string | null => {
      if (id === REST) return rest.toggle(restWatch());
      if (id !== POTION) rest.stand();
      const e = leading();
      if (birdForm && id === birdAbility?.id) return birdForm.invoke();
      if (birdForm?.flying) return 'A pheasant cannot do that.';
      const a = abilityOf(setting, id), spell = !!a && !blowOf(a);
      // A spell cast is a mage's evidence (C12: the player model).
      if (e) { const no = e.use(id); if (!no && spell) director.model.count('casts'); return no; }
      if (a && spell) { const no = alone.begin(a, null, player.walker.pos); if (!no) director.model.count('casts'); return no; }
      if (id !== POTION) return 'There is nothing here to fight.';
      const r = character.remedy;
      if (r && character.consume(r) > 0) fightHud.healed();
      return r ? null : 'You have nothing to drink.';
    };
    const actionBar = new ActionBarUi(character, setting, {
      get bindings() { return settings.current.bindings; },
      get blocked() { return open > 0; },
      trigger: (id) => { const said = useAbility(id); if (said) notes.say(said, 2.5); },
      state: (id) => {
        const f = leading()?.fighting ?? null;
        if (id === POTION) { const n = potions(); return { left: 0, total: 0, dim: n === 0, on: false, count: n }; }
        if (id === REST) return { left: 0, total: 0, dim: false, on: rest.sitting };
        if (birdForm && id === birdAbility?.id) { const b = birdForm.state; return { left: b.left, total: birdAbility.cooldown, dim: false, on: b.on }; }
        const a = abilityOf(setting, id);
        if (!a) return { left: 0, total: 0, dim: true, on: false };
        if (!f) return { left: alone.cooling(id), total: a.cooldown, dim: !!blowOf(a) || character.mana < (a.cost?.mana ?? 0), on: alone.casting?.def === a };
        return { left: f.recipes.cooling(id), total: a.cooldown, dim: character.stamina < (a.cost?.stamina ?? 0) || character.mana < (a.cost?.mana ?? 0), on: (!!blowOf(a)?.again && f.attacking) || f.recipes.casting?.def === a };
      },
      arranged: () => { book.redraw(); },
    });
    // The level watched each frame for its celebration (G3).
    const levelWatch = new LevelWatch(character.level);
    const book = new AbilityBook(character, setting, actionBar, { paused, get bindings() { return settings.current.bindings; } });
    // Where the map shows the hero, facing `yaw` (down in a cellar: at its house; in a barrow: at its forecourt). D59: exactly.
    const heroAt = (yaw: number) => {
      const h = visit()?.houseDoor ?? null, w = player.walker;
      return h ? { x: h[0], z: h[1], yaw: h[2] } : { x: w.pos.x, z: w.pos.z, yaw };
    };
    // The map: the sheet round where the game began, every town on it.
    const map = start ? new MapUi([home.x, home.z], () => terrain.towns.map((t) => t.plan), journal, {
      paused: pausedWith('ui/map'),
      get bindings() { return settings.current.bindings; },
      height: (x, z) => terrain.height(x, z),
      // The land's own water (rivers, lakes, the sea), everywhere: the sea's masks hold only what is round the camera.
      water: (x, z) => terrain.waterDepth(x, z),
      woods,
      heroAt: () => heroAt(player.walker.yaw),
      known,
      roadLines: () => terrain.roads.roads,
      signs: () => (towns?.every ?? []).flatMap((t) => t.guilds.filter((h) => guildBook.onMap(t.id, h.guild)).map((h) => ({ ...whereOf(h), label: cap(h.guild.name) }))),
    }) : null;
    // The minimap at the top (plan 17.1, G4): the known land round the hero on the map's own parchment, turning
    // with the camera and always true; the townsfolk near as dots. Below ground: the dungeon's own plan, as far
    // as the hero has seen it (app/dungeonSheet.ts).
    const minimap = new Minimap(map ? (canvas, x, z, across) => {
      const v = visit();
      if (v) {
        const O = v.origin;
        return paintBelow(canvas, { space: v.space, seen: v.seen, carved: !!v.cellar.form.space.carved, exit: v.cellar.hatch }, x - O.x, z - O.z, v.space.levelAt(player.walker.pos.y - O.y), across);
      }
      const t = here(), r = across / 2;
      const dots = (t?.life.agents ?? []).filter((a) => !a.hidden && Math.abs(a.x - x) < r && Math.abs(a.z - z) < r);
      return map.paintAround(canvas, x, z, across, dots);
    } : null);
    const skyGlyph = (): SkyGlyph => {
      const w = wx.shown;
      return w.rain > 0.1 ? (w.snow > 0.5 ? 'snow' : 'rain') : w.cover > 0.6 ? 'cloud' : 'clear';
    };
    // Telling of a place: the hero hands the map over and the teller marks it.
    const handOver = map ? new HandOver((id, c, t) => map.markIn(id, c, t), () => sounds?.noted()) : null;
    // Played in the world as well (rule 11): the hero holds the map out, the teller marks it and hands it back.
    if (handOver) {
      const scene: HandOverScene = new HandOverScene({
        hero: () => ({ ...player.walker.pos, yaw: player.walker.yaw }),
        teller: () => talk?.partner ?? null,
        heroHand: (out) => player.hero?.handAt('r', out) ?? null,
        tellerHand: (a, side, out) => folk?.agentHand(a, side, out) ?? null,
        puppet: (p) => { if (p) { if (!player.puppet) player.puppet = p; } else if (player.puppet === scene) { player.puppet = null; talk?.reframe(); } },
      }, new MapSheet(view.stage));
      handOver.world = scene;
    }
    /**
     * The hero in front of `a` (for `?talk`, `?trade` and the shot set): in their room when they are
     * indoors (out in the town an indoor person stands inside the building's walls, seen from within),
     * else where they are.
     */
    const standBefore = async (a: Agent): Promise<void> => {
      const t = towns?.townOf(a);
      const s = a.spot >= 0 ? t?.life.spots[a.spot] : undefined;
      const b = a.hidden && s && s.building >= 0 ? t?.town.plan.buildings[s.building] : undefined;
      if (t && b && rooms) {
        if (rooms.door?.town !== t || rooms.door.b.id !== b.id) await rooms.enter({ town: t, b }, true);
        const p = rooms.people()?.find((x) => x.agent === a);
        if (p) { player.teleport(p.x + Math.cos(p.dir) * 1.3, p.y, p.z + Math.sin(p.dir) * 1.3, Math.atan2(Math.cos(p.dir), Math.sin(p.dir))); return; }
      }
      // Clear of walls: a building's corner beside the hero filled the talk's shot.
      const at = standingPlace(a.x, a.z, a.dir, (x, z, r) => !!towns?.solid(x, z, r));
      player.teleport(at.x, undefined, at.z, Math.atan2(at.x - a.x, at.z - a.z));
    };
    // `talk=house|smith|inn`: straight into a talk in the town the hero is in (`house`: the first cellar's household).
    const talkIn = params.talk === 'house' && firstPromise ? towns.get(firstPromise.town) : here() ?? startTown;
    if (talk && talkIn && params.talk) {
      const agents = talkIn.life.agents, plan = talkIn.town.plan;
      const pick = params.talk === 'house'
        ? agents.find((a) => a.person.home === firstPromise?.building && a.person.role !== 'child')
        : params.talk === 'smith'
        ? agents.find((a) => a.person.trade === 'smith' && a.person.role === 'trade')
        : params.talk === 'guild' // the first guild house's trainer (D49)
        ? agents.find((a) => a.person.trade === talkIn.guilds[0]?.guild.keeper)
        : params.talk === 'bard'
        ? agents.find((a) => a.person === talkIn.bard)
        : agents.find((a) => plan.buildings[a.person.home].kind === 'inn' && a.person.role === 'trade');
      if (pick) {
        await standBefore(pick);
        talk.place = talkIn;
        talk.begin(pick);
        for (const t of params.topics) talk.choose(t);
      }
    }
    // Saving (plan 17): what the game is now, into a slot; autosave every 5 minutes and at the cellar's door.
    const savesHost: SavesHost = {
      paused,
      get bindings() { return settings.current.bindings; },
      setting: { id: setting.id, version: setting.version },
      say: (text) => notes.say(text),
      get mode() { return mode; },
      capture: () => {
        // In a room: saved as standing at its door outside (rooms are built when entered).
        const w = rooms?.outside ?? player.walker.pos;
        const data: SaveData = {
          version: SAVE_VERSION, game: release.version, setting: { id: setting.id, version: setting.version }, seed: seedText, log,
          clock: { day: view.sky.day, hour: view.sky.hour },
          hero: { x: w.x, y: w.y, z: w.z, yaw: rooms?.outside?.yaw ?? player.walker.yaw, below: !!visit(), ...(visit() ? { cellar: visit()!.cellar.decision.id } : {}) },
          cellars: cellars?.diffs() ?? {},
          wild: wild?.diffs() ?? save?.wild ?? {},
          talk: null,
          towns: towns?.toSave() ?? {},
          journal: journal.entries(),
          map: known.landSave(),
          character: character.save(),
          standing: standing.save(),
          guilds: guildBook.bookSave(),
          portalStone: stoneUse.stoneSave(),
          ...(hold?.diff() ? { hold: hold.diff() } : {}),
          looks: { name: heroName, look: hero.look },
          director: director.snapshot(),
          mode,
          remains: [...remains],
          vgm: [...vgmLog],
          ...(vgmCleared ? { vgmCleared } : {}),
        };
        const v = visit();
        // Where the hero is, for the save's label (the title's Continue shows it).
        const t = towns?.townAt(w.x, w.z), size = t?.town.decision.size ?? 'town';
        const out = !t ? 'out on the land' : t === startTown ? 'in the town' : size === 'waystation' ? 'at a waystation' : `in a ${size}`;
        return { data, where: v ? `in ${v.cellar.house}'s cellar` : out };
      },
    };
    const saves = new SavesUi(savesHost);
    // A classic game autosaves every 5 minutes; a roguelike one keeps its one save every minute and as the page goes.
    const autosave = () => { if (playing && !ended) void saveNow(savesHost, mode === 'roguelike' ? ROGUE_SLOT : AUTOSAVE); };
    let minutes = 0;
    setInterval(() => { if (mode === 'roguelike' || ++minutes % 5 === 0) autosave(); }, 60 * 1000);
    addEventListener('pagehide', () => { if (mode === 'roguelike' && heroName) autosave(); });
    // Remains left where a hero fell: on the map until taken up again. The ones just left wait until the hero has been away.
    let justLeft: Remains | null = null;
    const leaveRemains = (r: Remains) => {
      remains.push(r);
      journal.remember(remainsEntry(r));
      justLeft = r;
      drawRemains();
    };
    // Taken up in sight (render it, don't narrate it): the hero steps up to the remains and kneels; once the
    // hands are in, they are gone from the ground and what they held shows as finds do.
    let gathering: SearchKneel | null = null;
    const gatherNear = () => {
      if (gathering) {
        if (gathering.done || player.puppet !== gathering) { if (player.puppet === gathering) player.puppet = null; gathering = null; }
        return;
      }
      if (!remains.length || !character.alive || player.puppet) return;
      const v = visit(), w = player.walker.pos, below = v ? v.cellar.decision.id : null;
      if (justLeft && (justLeft.at.below !== below || Math.hypot(justLeft.at.x - w.x, justLeft.at.z - w.z) > 8)) justLeft = null;
      const r = remainsNear(remains, below, w.x, w.y, w.z);
      if (!r || r === justLeft) return;
      gathering = new SearchKneel(w, player.walker.yaw, { x: r.at.x, z: r.at.z }, null, () => {
        if (!remains.includes(r)) return;
        gather(character, r);
        remains.splice(remains.indexOf(r), 1);
        journal.fulfil(r.id);
        drawRemains();
        fightHud.showFinds({ items: [...r.items], coins: r.coins });
        sounds?.cue({ kind: 'found', loot: { items: [...r.items], coins: r.coins } });
      });
      player.puppet = gathering;
    };
    // `?open=tale`: the end of a roguelike tale as it shows (for the standard shots), without ending anything.
    const showTale = () => { paused(true); new TalesEnd().show(heroName || 'Wenna Stonehelm', epitaph(heroName || 'Wenna Stonehelm', view.sky.day, { x: 0, y: 0, z: 0, below: null, mark: { x: 0, z: 0 }, label: 'out on the land' }), () => location.reload()); };
    // Roguelike (plan 11.1): the hero's tale ends where they fell. The world goes on; the next start makes a new hero in it.
    const endTale = (at: FallPlace, id: string) => {
      ended = true;
      const name = heroName || 'a nameless wanderer', day = view.sky.day;
      const grave = fallRoguelike(character, name, at, id, day);
      const heir = heirSave(savesHost.capture().data, grave, { x: home.x, y: 0, z: home.z, yaw: 0, below: false });
      const written = writeSlot(ROGUE_SLOT, saveLabel(heir, `after ${name} fell`), heir).catch(() => notes.say('The browser would not keep the tale.', 8));
      new TalesEnd().show(name, epitaph(name, day, at), () => void written.then(() => loadAtRestart(ROGUE_SLOT)));
    };
    if (save) {
      // Lay the save over the fresh world (each cellar takes its changes as it is built), then the hero where they were.
      const h = save.hero;
      // (A hero saved below is in their cellar already.)
      const down = h.below && !savedBelow ? await cellars.build(h.cellar ?? firstPromise?.id ?? '') : null;
      if (down) await down.enter(true);
      player.teleport(h.x, h.below ? h.y : undefined, h.z, h.yaw);
      if (!save.heir) notes.say(`Loaded: ${save.journal.length ? `${save.journal.filter((l) => !l.done).length} open lead(s) in your journal` : 'your game'}.`);
    } else if (typeof loaded === 'string') notes.say(`Could not load the save: ${loaded}.`, 8);
    // Straight to a merchant's counter (`?trade=smith`, or `game.tradeAt('smith')` in the console and the shot set):
    // in the town the hero is in, in front of them, their wares out.
    const tradeAt = async (keeper: string): Promise<boolean> => {
      const t = here() ?? startTown;
      const m = t?.market.merchants.find((x) => x.shop.keeper === keeper);
      const a = m && t?.life.agentOf(m.person);
      if (!t || !m || !a) return false;
      talk?.close();
      await standBefore(a);
      trade.show(t.market, m, t.talk.nameOf(a.person.id));
      return true;
    };
    if (params.trade) await tradeAt(params.trade);
    if (params.open) { talk?.close(); if (params.open === 'journal') journalUi.setOpen(true); else if (params.open === 'saves') saves.setOpen(true); else if (params.open === 'pack') pack.setOpen(true); else if (params.open === 'tale') showTale(); else map?.setOpen(true); }
    // The debug menu's go-to for every kind of place (out of any cellar or room first; a place made if none stands).
    const outside = async (): Promise<void> => {
      const v = visit();
      if (v) await v.leave();
      rooms?.shut();
      player.flying = false;
      player.puppet = null;
    };
    // The camera kept facing the way the hero was put down for a few frames (a shot played before, such as a
    // walk out of a dungeon's door, can leave its own look behind; in a small room that is outside its walls).
    const keepFacing = (): void => {
      const yaw = player.walker.yaw;
      let n = 10;
      const again = () => { player.heroCam.yaw = player.walker.yaw = yaw; player.heroCam.release(); if (--n > 0) requestAnimationFrame(again); };
      requestAnimationFrame(again);
    };
    const brookHere = emptyWater();
    const spots = goSpots({
      setting,
      log: () => log,
      hours,
      heroPos: () => player.walker.pos,
      towns: () => towns?.every ?? [],
      stand: async (s, pick) => { await outside(); const p = pick ? pick(s) : s; player.teleport(p.x, undefined, p.z, p.yaw); if (p.pitch !== undefined) player.heroCam.pitch = p.pitch; keepFacing(); return p; },
      // The hero's spot and the camera's behind them (about where it trails): no wall, no trunk, no water; and no
      // trunk across the view to what they look at (up to 60 m, short of it, which may stand among trees itself).
      clear: (x, z, yaw, at) => {
        const wet = (px: number, pz: number) => (world.waterLevel(px, pz) ?? -Infinity) >= terrain.height(px, pz) + 0.05 || inChannel(terrain.hydro.brookAt(px, pz, brookHere), 1.5);
        // A crop field's grain stands as high as the camera.
        const inCrop = (px: number, pz: number) => { const f = towns?.nearest(px, pz)?.town.fieldAt(px, pz); return !!f && f.paddock < 0; };
        const standsFree = (px: number, pz: number, r: number) => !world.wall?.(px, pz, r) && !trunks.blocks(px, pz, r) && !wet(px, pz) && !inCrop(px, pz);
        if (!standsFree(x, z, 1.2) || ![3.5, 6].every((d) => standsFree(x + Math.sin(yaw) * d, z + Math.cos(yaw) * d, 2.5))) return false;
        // Across the view a tree's crown, not only its trunk, is in the way (but near what it looks at, trees may stand).
        // Only for a place a stone's throw off (a cave's mouth): someone met close is seen anyway, and far off a stand
        // turned round its target lands somewhere else entirely.
        const off = at ? Math.hypot(at.x - x, at.z - z) : 0, d = off >= 12 && off <= 40 ? off - 4 : 0;
        for (let t = 3; t < d; t += 2) if (trunks.blocks(x - Math.sin(yaw) * t, z - Math.cos(yaw) * t, t < 8 ? 1.2 : 2.2)) return false;
        return true;
      },
      enter: async (id, b) => { const t = towns?.get(id); if (!t || !rooms) return; await outside(); await rooms.enter({ town: t, b }, true); },
      below: async (id) => {
        const v = await cellars.build(id);
        if (!v) return false;
        await outside();
        await v.enter(true);
        // Put down mid-room (a tower's gate hall is 6 m across): facing the way in, the camera trails into the room, not into its door.
        if (v.cellar.form.space.arriveMid) player.walker.yaw = player.heroCam.yaw = player.walker.yaw + Math.PI;
        keepFacing();
        return true;
      },
      open: async (place) => {
        if (!setting.regions || !regionSites) return null;
        const ids = new Set(setting.regions.fills.filter((f) => f.place === place).map((f) => f.id));
        for (let dir = 0; dir < 8; dir++) {
          const walked = walkFrontier({ seed, log, terrain, regions: setting.regions, home: start?.decision ?? opened.home }, (dir * Math.PI) / 4, 8, (d) => ids.has(d.fill) && !!d.site);
          const found = walked.at(-1);
          if (!found?.site || !ids.has(found.fill)) continue;
          for (const d of walked) regionOpened(d);
          await roading;
          return found;
        }
        return null;
      },
      promise: (kind) => {
        const form = setting.dungeons[kind]?.form;
        const d = form && start ? promisePlace(kind as LandKind, form, seed, terrain, start, log, home, wild?.territories ?? []) : null;
        if (d) { log = [...log, { ...d, at: hours() }]; cellars.sync(log); for (const t of towns?.every ?? []) t.promised(d); }
        return d;
      },
      situation: (kind) => situationNow(kind),
      answerFor: (need) => answerNow(need),
      event: (id) => storyEventNow(id),
      goodDay: () => goodDayNow(),
      bridges: (x, z) => bridgesNear(terrain.roads, terrain.hydro, x, z, 4000, (px, pz) => terrain.hydro.hasBrooks(px, pz)),
    });
    // The VGM seen at work (a developer's aid; D53 keeps it out of play): its panel (F9), docked at the right while
    // the hero plays, with its moves live, filtered by kind, each placed one shown on the minimap when clicked.
    let vgmCleared = typeof save?.vgmCleared === 'number' ? save.vgmCleared : 0;
    const vgmPanel = new VgmPanel(vgmLines(log, vgmLog), {
      get bindings() { return settings.current.bindings; },
      get panelOn() { return settings.current.vgmPanel; },
      set panelOn(on) { settings.set({ vgmPanel: on }); },
      get kinds() { return settings.current.vgmKinds; },
      set kinds(k) { settings.set({ vgmKinds: [...k] }); },
      get cleared() { return vgmCleared; },
      set cleared(n) { vgmCleared = n; },
      needs: director.needs,
      answerNeed: (need) => { const m = answerNow(need); return m ? `${m.tool}: ${m.reason}` : `no answer to ${need} here`; },
      situations: ['hurt-traveller', 'paddock-wolves', 'stray-beast'],
      situation: (kind) => { const m = situationNow(kind as SituationKind); return m ? `${m.tool}: ${m.reason}` : `no ${kind} here`; },
      events: setting.events ?? [],
      storyEvent: (id?: string) => storyEventNow(id),
      goodDay: () => goodDayNow(),
      // A few steps south of it, so what stands there is in front of the hero, not under their feet.
      goNear: (x, z) => player.goTo([x, z + 8]),
      hero: () => [player.walker.pos.x, player.walker.pos.z],
    });
    new DebugMenu({
      paused,
      get freeCamera() { return player.flying; },
      set freeCamera(on) { flyKey = true; player.flying = on; },
      goTo: (pos, look) => player.goTo(pos, look),
      get hour() { return view.sky.hour; },
      set hour(h) { view.sky.hour = h; },
      get dayMinutes() { return view.sky.dayMinutes; },
      set dayMinutes(m) { view.sky.dayMinutes = m; },
      get hud() { return showHud; },
      set hud(on) { settings.set({ hud: on }); showHud = on; if (hud) hud.style.display = on ? '' : 'none'; },
      weatherKinds: WEATHER_KINDS,
      weather: (kind) => {
        weather.cancel(hours());
        if (kind) weather.order({ kind: kind as WeatherKind, from: hours(), to: hours() + 6, ramp: 0.05 });
        return kind ? `${kind} for 6 game hours` : 'natural weather';
      },
      town: (kind) => {
        const t = here() ?? startTown;
        if (!t) return 'no town';
        const [x, z] = t.town.plan.centre;
        orderTown(t, kind === 'gather' ? { kind, x, z, radius: 14, from: hours(), to: hours() + 2 } : { kind, from: hours(), to: hours() + 2 });
        return kind === 'gather' ? 'everyone to the market for 2 game hours' : 'everyone indoors for 2 game hours';
      },
      get viewParams() { return player.viewParams; },
      // Abilities a teacher opens (D49), learned or forgotten here so they can be tried.
      taught: setting.abilities.filter((a) => a.taught).map((a) => ({ id: a.id, name: a.name })),
      known: (id) => character.knows(id),
      legends: setting.items.uniques.map((u) => ({ id: u.id, name: u.name })),
      events: setting.events ?? [],
      storyEvent: (id?: string) => storyEventNow(id),
      get vgmPanel() { return settings.current.vgmPanel; },
      set vgmPanel(on) { settings.set({ vgmPanel: on }); },
      gainLevel: () => { const next = setting.growth.xp[character.level]; if (next === undefined) return 'at the top level'; character.gain(next - character.xp); return `level ${character.level}`; },
      vgmLog: () => vgmLines(log, vgmLog),
      wearLegend: (id) => wearLegend(id),
      learn: (id, on) => {
        const did = on ? character.learnToUse(id) : character.forget(id);
        actionBar.draw();
        book.redraw();
        if (on && id === birdAbility?.id) void birdForm?.warm();
        return did ? (on ? 'learned: on the action bar' : 'forgotten') : (on ? 'known already' : 'not known');
      },
      places: placesFor(seedText, home),
      spots,
      seed: seedText,
      game: { player, view, hitches: HITCHES, /** A debug go-to by its label (`game.go('Capital gate')`). */ go: (label: string) => spots.find((x) => x.label === label)?.go() ?? `no go-to called ${label}`, goes: spots.map((x) => x.label), origin: ORIGIN, notes, journal, known, roads: roadWork, layRoad, bridges: bridgeView, get followOrigin() { return followOrigin; }, set followOrigin(on) { followOrigin = on; }, terrain, sea, flora, grass, ground, settings, params, home, weather, wx, get cellar() { return visit(); }, cellars, get climbs() { return climbs; }, get wild() { return wild; }, get regionSites() { return regionSites; }, towns, title, sound, get sounds() { return sounds; }, get life() { return startTown?.life ?? null; }, get folk() { return folk; }, get talk() { return talk; }, get rooms() { return rooms; }, get herds() { return startTown?.herds ?? null; }, character, get remains() { return remains; }, get market() { return startTown?.market ?? null; }, trade, tradeAt, fightHud, actionBar, birdForm, alone, spellView, stone: stoneUse, portals, useAbility, wearLegend, storyEvent: (id?: string) => storyEventNow(id), answerNow: (need: Need) => answerNow(need), situationNow: (kind: SituationKind) => situationNow(kind), goodDay: () => goodDayNow(), trunks, rocks, rockView, smoke, get speech() { return speech; }, get owner() { return owner; }, director, get log() { return log; }, vgmLog, setting, minimap, standing, get hold() { return hold; }, lessons, services,
        /** A master's deed (C14) as if done and told (shots): the gift is the hero's. */
        questDone: () => { const d = log.filter((x) => x.kind === 'dungeon' && !!x.quest).at(-1), t = d?.kind === 'dungeon' ? towns?.get(d.town) : null; if (!d || !t) return 'no deed asked'; keptNow(d.id, t); return d.id; },
        /** What near the hero is not drawn as itself yet (empty: everything is), for screenshots (tools/shot/set.mjs). */
        get undrawn() {
          const out: string[] = [];
          if (folk && folk.undressed) out.push(`${folk.undressed} townsfolk`);
          if (wild?.warming) out.push(`${wild.warming} wild groups`);
          if (hold?.warming) out.push('hold wardens');
          if (!cellars.dwellersWarm) out.push('cellar dwellers');
          return out;
        } },
    });
    b.menus.menu = new Menu(settings, {
      paused,
      seed: seedText,
      get hour() { return view.sky.hour; },
      set hour(h) { view.sky.hour = h; },
    });
    saves.dock();
    // Character creation (plan 11.4): after New game's dive (or at once with `?create`), unless a save is loaded.
    const w = player.walker;
    const makeCreator = (): Creator => new Creator({
      camera: view.camera, canvas, renderer: view.renderer, hero, looks: setting.hero, body: w,
      nameFor: (r, female, n) => heroNameFor(setting.names[r] ?? setting.names.human, female, n),
      backgrounds: setting.backgrounds,
      abilityName: (id) => abilityOf(setting, id)?.name ?? id,
      itemName: (id) => setting.items.items.find((i) => i.id === id)?.name ?? id,
      knownBy: (bg) => (startTown ? friendsOf(bg).map((a) => `${startTown.talk.nameOf(a.person.id)}, the ${a.person.trade}`) : []),
      click: () => sound.play('click'),
      mode: save?.heir ? 'roguelike' : null,
    }, seed);
    // Made (and its people loaded) as soon as the title's choice is made, so the glass opens right after the dive.
    let readied: Creator | null = null;
    onChose = (people) => { if (!save || save.heir) (readied ??= makeCreator()).ready(people ? PEOPLE_RACE[people] : null).catch((e: unknown) => console.error('[creator] getting ready failed', e)); };
    if (chosen) onChose(chosen.people);
    const create = async (race: string | null): Promise<void> => {
      creator = readied ?? makeCreator();
      readied = null;
      // Nobody walks between the camera and the hero while the glass is open.
      const cam = view.camera.position;
      if (folk) folk.clear = (x, z) => distSqPointSeg(x, z, cam.x, cam.z, w.pos.x, w.pos.z) < 1.5 * 1.5;
      const made = await creator.open(race);
      if (folk) folk.clear = null;
      heroName = made.name;
      creator = null;
      // The past chosen: its first ability, kit and the people in town who know the hero.
      const bg = setting.backgrounds.find((b) => b.id === made.background);
      if (bg) { character.beginAs(bg); armHero(); }
      // A new hero: every people thinks of them as of any stranger, their own kin a little better.
      standing.begin(made.look.race ?? 'human');
      // A roguelike tale has its one save from the first step.
      mode = made.mode;
      director.strict = mode === 'roguelike';
      playing = true;
      if (mode === 'roguelike') autosave();
      meetOldFriends();
      // A new hero's own first page: where to ask for work (the inn's door is marked on the map).
      const innB = startTown ? buildingOf(startTown.town.plan, 'inn') : null;
      const keeper = innB && startTown ? startTown.residents.find((p) => p.home === innB.id) : undefined;
      if (innB && keeper && startTown && !journal.leads.length) journal.remember(arrivalEntry(setting.talk, startTown.talk.homeCalled(keeper.id), { x: innB.door[0], z: innB.door[1] }));
      // Behind the hero, looking the way they face.
      player.teleport(w.pos.x, undefined, w.pos.z, w.yaw);
      paused(false);
      const friends = startTown ? friendsOf(bg).map((a) => startTown.talk.nameOf(a.person.id)) : [];
      const page = journal.open.some((l) => l.id === ARRIVAL) ? ` Your journal (${keyName('journal')}) says where to ask for work.` : '';
      notes.say(`${made.name} steps out onto the market square.${friends.length ? ` ${friends.join(' and ')} will know you.` : ''}${page}`, 8);
    };
    onBegin = (people) => {
      if (save && !save.heir) { playing = true; paused(false); }
      else void create(people ? PEOPLE_RACE[people] : null);
    };
    if (!title && ((params.create && !save) || save?.heir)) { paused(true); void create(null); }
    // A cellar's hatch and ladder, climbed in sight (E; app/hatchClimb.ts), its key shown by them.
    const usePrompt = new UsePrompt();
    const climbs = new HatchClimb({
      player, fade: new Fade(),
      hatchNear: () => (visit() ? null : rooms?.hatchNear() ?? null),
      below: () => visit(),
      shutHouse: () => rooms?.shut(),
      openAbove: async (v) => {
        const t = v.above ? towns?.get(v.above.town) : null;
        return t && v.above && rooms ? rooms.arriveAbove({ town: t, b: v.above.house }) : null;
      },
      swapped: () => autosave(),
      // The ground's vertices lie a couple of metres apart: sunk well round the hatch, all of them under it go.
      sink: (at) => { if (at) GROUND_DIP.value.set(at.x, at.z, SINK_REACH, SINK_DEPTH); else GROUND_DIP.value.w = 0; },
    });
    // The free camera is a debug tool: its key (F) works only with `?fly` or once the debug menu has flown, and
    // always lands again while flying (a stray F in a cellar flew the camera through its walls).
    let flyKey = params.fly;
    // F flies, H gets on or off a horse, X sits down to rest on the ground (dives in the water), E climbs a hatch's
    // ladder (the keys are in the settings).
    onKeyDown((e) => {
      if (e.repeat || open > 0) return;
      const b = settings.current.bindings;
      if (b.use.includes(e.code) && playing && climbs.use()) return;
      if (b.fly.includes(e.code) && (flyKey || player.flying)) player.flying = !player.flying;
      else if (b.mount.includes(e.code)) player.toggleMount();
      else if (b.dive.includes(e.code) && playing && player.walker.mode === 'ground' && !player.flying) {
        const said = useAbility(REST);
        if (said) notes.say(said, 2.5);
      }
    });
    // The Director's turn every frame; the Builder's every few seconds: a new promise when one is due
    // (plan 4.1, 4.2: always a few open leads), which the cellars and the townsfolk learn of at once.
    let builderClock = 0;
    // While the hero has nothing to follow, someone who has heard of a promised place comes over (vgm/guide.ts).
    const hails = new Hails(setting.talk, journal, {
      get town() { return here(); },
      get heroAt() { return player.walker.pos; },
      get busy() { return open > 0 || player.offFoot || !!rooms?.inside || !!title?.holding || !!creator?.showing || !window.__mwReady; },
      get open() { return new Set(openPromises(log).map((d) => d.id)); },
      get talkingTo() { return talk?.partner ?? null; },
      say: (text) => notes.say(text, 6),
    });
    /** Each VGM tool's time into the hitch log (a slow frame names the tool). */
    const vgmTimed = { timeNow: () => performance.now(), spent: (tool: string, ms: number) => { if (ms >= 2) HITCHES.note(`vgm ${tool}`, ms); } };
    const direct = (dt: number): void => {
      const below = !!visit();
      let fighting = 0, pressure = 0;
      for (const e of encounters()) { const p = e.pressure; fighting += p.fighting; pressure += p.pressure; }
      HITCHES.part('vgm director');
      director.observe(dt, { fighting, pressure, health: character.health / character.maxHealth, talking: open > 0, underground: below, inTown: !!here() && !below, leads: journal.open.length });
      const m = director.next();
      if (m) notes.say(m, 6);
      HITCHES.part('vgm gather+hails');
      if (!title?.holding && !creator?.showing) gatherNear();
      hails?.sendFor(dt, fighting > 0 || below);
      builderClock += dt;
      if (builderClock < 3 || title?.holding || creator?.showing) return;
      builderClock = 0;
      HITCHES.part('vgm turn');
      vgmStep();
      HITCHES.part('vgm answer');
      answerOverdue(below);
    };
    /**
     * An overdue need asks the tools that meet it for their cheapest fitting move (C9, vgm/toolbox.ts
     * `answerNeed`): out on the land, on foot, when the world may press the hero; on the way they are going.
     */
    let answered = -Infinity;
    /** Situations whose cry was called (C10), and the time to the next look for one due. */
    const cried = new Set<string>();
    let cryClock = 0, smokeClock = 0, waitClock = 0;
    /** The good days whose towns already tell them as past. */
    const feasted = new Set<string>();
    /** Barns drawn burnt now (`town/building`). */
    let scorched = new Set<string>();
    const speech = new Speech(view.camera);
    const answerOverdue = (below: boolean): void => {
      const need = director.overdue, now = performance.now() / 1000;
      // One answer at a time: the hero gets a while to come upon it before another is put out.
      if (!need || below || here() || player.offFoot || !director.fair || now - answered < ANSWER_GAP) return;
      if (answerNow(need)) answered = now;
    };
    /** The VGM's answer to `need` here and now, whatever the Director says (the debug menu, shots): what it made, or null. */
    const answerNow = (need: Need): Made | null => {
      const at = player.walker.pos;
      const m = answerNeed(need, { seed, log, terrain, towns: terrain.towns, hours: hours(), setting, home: start?.decision, hero: { x: at.x, z: at.z }, toward: regionSites?.ahead(400) ?? null, lean: (n) => director.model.lean(n), ...vgmTimed });
      if (m) applied(m);
      return m;
    };
    /**
     * The Builder's turn (D51, vgm/toolbox.ts): its tools decide, the game applies each decision (`applied`).
     * `tools`: only these (the debug menu's story events); `early`: whatever their waits say; `which`: that event.
     */
    const vgmStep = (o: { tools?: readonly string[]; early?: boolean; which?: string } = {}): Made[] => {
      if (!start) return [];
      const made = vgmTurn({
        seed, log, towns: terrain.towns, home: start.decision, hours: hours(), purposeOverdue: director.overdue === 'purpose', inside: (id) => !!cellars?.isInside(id),
        setting, terrain, avoid: wild?.territories ?? [], near: here()?.town ?? null, wild: wild?.groupsLeft(), hero: { x: player.walker.pos.x, z: player.walker.pos.z }, lean: (n) => director.model.lean(n),
        // A story event's band needs the wild to roam in.
        tools: o.tools ?? (wild ? undefined : ['promise']), early: o.early, which: o.which, ...vgmTimed,
      });
      for (const m of made) applied(m);
      return made;
    };
    /** A decision a VGM tool made: into the log (and the VGM's own log, with its reason), and the game builds, draws and tells it. */
    const applied = (m: Made): void => {
      const d = m.decision;
      log = [...log, d];
      noteMade(m);
      if (d.kind === 'dungeon' || d.kind === 'move-in') {
        console.info(`[vgm] ${d.kind} ${d.id}${d.kind === 'move-in' ? ` into ${d.dungeon}` : ''} at ${hours().toFixed(1)} h`);
        cellars?.sync(log);
        // Its household's town hears of it (every town checks whether it is theirs).
        for (const t of towns?.every ?? []) t.promised(d);
      } else if (d.kind === 'wild') {
        // An ambush (Challenge's answer): a group of the wild lying in wait ahead.
        console.info(`[vgm] ${d.id}: ${d.encounter} (${d.members.length}) at ${d.x.toFixed(0)}, ${d.z.toFixed(0)}`);
        wild?.add(territoryOf(d));
      } else if (d.kind === 'sight') {
        console.info(`[vgm] sight ${d.id} (${d.sight}) at ${d.x.toFixed(0)}, ${d.z.toFixed(0)}: ${m.reason}`);
        regionSites?.sync(log);
        void roadWork.clear(d);
      } else if (d.kind === 'festivity') {
        // A good day (C11): the town gathers at its market; a feast for the hero's deed is told to them.
        console.info(`[vgm] ${d.id} (${d.festivity}) in ${d.town}, ${d.from.toFixed(1)} to ${d.to.toFixed(1)} h`);
        const t = towns?.get(d.town), order = festivityOrder(terrain.towns, d);
        if (t && order) orderTown(t, order);
        t?.promised(d);
        // Seen, not told (rule 11): the town gathers at its market; asked, its folk tell of the feast.
      } else if (d.kind === 'kept' && d.faded) {
        // An event left alone ran its course (C11): its band goes, unseen; the town tells how it ended.
        const ev = log.find((x) => x.id === d.promise);
        if (ev?.kind !== 'event') return;
        console.info(`[vgm] ${ev.id} (${ev.event}) ran its course at ${hours().toFixed(1)} h`);
        wild?.moveOn(ev.id);
        eventEnded(ev);
        const told = eventTold(setting, log, terrain.towns, ev);
        if (told) journal.lapse(ev.id, { text: told.faded, from: 'word in town' });
      } else if (d.kind === 'event') {
        // The world moves on its own (C6): the band onto the land, the town gathers, word reaches the hero.
        console.info(`[vgm] event ${d.id} (${d.event}) from ${d.from} at ${hours().toFixed(1)} h`);
        wild?.add(bandOf(d));
        const t = towns?.get(d.town), order = gatherFor(setting, terrain.towns, d);
        if (t && order) orderTown(t, order);
        // Its people know of it (C11: talk knows events).
        t?.promised(d);
        // No narrator (D52, rule 11): word reaches the hero as it reaches anyone, shouted in the town, talked of,
        // seen (the smoke, the refugees, the band itself); the journal and map take it up then (learnEvent).
      }
    };
    /** The hero has heard of or seen story event `id` (from whom, or how): its journal page and map mark, once. */
    const learnEvent = (id: string, from: string): void => {
      const d = log.find((x) => x.id === id);
      if (d?.kind !== 'event' || journal.knows(id) || keptOf(log).has(id)) return;
      const told = eventTold(setting, log, terrain.towns, d);
      if (told) journal.hear(d.id, told.title, { text: told.note, from }, { x: d.x, z: d.z, label: told.label });
    };
    /** Events the hero has had shouted at them in their town (once each). */
    const shouted = new Set<string>();
    /** Within this of a band (m), the hero has seen it. */
    const SEEN_BAND = 80;
    /** A townsman this near the hero (m) shouts the town's news. */
    const SHOUT_R = 30;
    /** Story events reach the hero (each 0.25 s): a shout in the town, or the band seen out on the land. */
    const wordOfEvents = (): void => {
      const p = player.walker.pos, t = here();
      for (const e of openEvents(log)) {
        if (journal.knows(e.id)) continue;
        if (Math.hypot(p.x - e.x, p.z - e.z) < SEEN_BAND) { learnEvent(e.id, 'what you saw'); continue; }
        if (!t || t.id !== e.town || shouted.has(e.id) || !t.living) continue;
        const who = t.life.agents.filter((a) => !a.hidden && !a.held && Math.hypot(a.x - p.x, a.z - p.z) < SHOUT_R)
          .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
        const told = who && eventTold(setting, log, terrain.towns, e);
        if (!who || !told) continue;
        shouted.add(e.id);
        speech.say(told.cry, () => (who.hidden ? null : { x: who.x, y: terrain.height(who.x, who.z), z: who.z }));
        learnEvent(e.id, 'a shout in town');
      }
    };
    /** A situation now, whatever the hour or the odds (the debug menu, shots): what was made, or null. */
    const situationNow = (kind: SituationKind): Made | null => {
      if (kind === 'paddock-wolves' || kind === 'stray-beast') return vgmStep({ tools: [kind], early: true })[0] ?? null;
      const at = player.walker.pos, def = situationOf(setting, kind);
      const d = def && travellerFor({ seed, log, terrain, towns: terrain.towns, hours: hours(), setting, hero: { x: at.x, z: at.z }, toward: regionSites?.ahead(400) ?? null });
      if (!d || !def) return null;
      const m = madeBy('hurt-traveller', { ...d, situation: def.id }, 'asked for now', hours());
      applied(m);
      return m;
    };
    /** A good day now (the debug menu, shots): what was made, or why none came. */
    const goodDayNow = (): string => { const m = vgmStep({ tools: ['festivity'], early: true })[0]; return m ? `${m.tool}: ${m.reason}` : 'no good day here'; };
    /** A story event now (the debug menu): what the town hears, or why none came. */
    const storyEventNow = (which?: string): string => {
      if (!start || !wild) return 'no wild here';
      const e = vgmStep({ tools: ['event'], early: true, which }).map((m) => m.decision).find((d) => d.kind === 'event');
      return !e ? 'nothing is due' : (e.kind === 'event' && eventTold(setting, log, terrain.towns, e)?.cry) || e.id;
    };
    let last = performance.now(), frame = 0;
    watchHitches(view.stage.monitor);
    const part = (label: string) => HITCHES.part(label);
    view.renderer.setAnimationLoop(() => {
      HITCHES.startFrame();
      part('title');
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000) / params.slow;
      title?.run(dt);
      if (giant && orbit && title) {
        if (title.holding) giant.view.frame(dt, giantPose(orbit, title.draw.seed, (giant.t += dt)));
        else { giant.view.dispose(); giant = null; }
      }
      part('player');
      if (title?.holding || creator?.showing) player.standBy(dt);
      else player.update(dt);
      // Through an opening: on out of the other; the camera stands on whichever side it trails on.
      if (!title?.holding && !creator?.showing) {
        const was = through.passed;
        through.walkThrough();
        if (through.passed !== was && !player.puppet) player.heroCam.trail(player.headPoint, 0);
        through.placeCamera(view.camera, player.headPoint);
        // The eye adapts to where the camera is; from below, the sun's shadows are cast round the land beyond the portal.
        const seen = through.cameraRealm, heroIn = cellars?.realm ?? 'land';
        // Walking into a cave's mouth the hero's lantern is lit (it is already burning at its portal), and deep in the
        // throat the eye adapts to its dark before the cave.
        const w = player.walker.pos, deep = heroIn === 'land' ? cellars?.throatDepth(w.x, w.z) ?? 0 : 0;
        if (heroIn === 'land' && (deep > 0 || throatLamp)) {
          const L = view.lantern;
          // As deep in as the hero is (the walk sets the pace), easing out again when they turn back.
          L.intensity = deep > 0 ? CAVE_LANTERN * deep : L.intensity * Math.max(0, 1 - dt * 2);
          L.position.set(w.x - Math.sin(player.walker.yaw) * 0.4, w.y + 1.9, w.z - Math.cos(player.walker.yaw) * 0.4);
          throatLamp = deep > 0 || L.intensity > 0.05;
          if (!throatLamp) L.intensity = 0;
        } else throatLamp = false;
        // Near a cave's portal on the land its own lights are lit already (out in the wild no doorway's light is near),
        // so the view in through it is lit as it will be inside; the doorways' again once away.
        const lit = heroIn === 'land' ? through.nearBeyond('land', w, CAVE_LIGHTS_NEAR) : null;
        if (lit !== caveLit) {
          caveLit = lit;
          if (lit) cellars?.visitOf(lit)?.light(); else if (heroIn === 'land') view.warm.lightTorches(null);
        }
        // The eye adapts to the dark as the camera goes into the throat, all the way by its portal.
        // (The hero's way in sets it: the camera trails a few metres behind, still out in the day.)
        const camDeep = seen === 'land' ? Math.max(deep, heroIn === 'land' ? 0 : 1, cellars?.throatDepth(view.camera.position.x, view.camera.position.z) ?? 0) : 1;
        view.sky.eye = seen === heroIn && (seen !== 'land' || camDeep === 0) ? null : { dark: camDeep };
        view.sky.shadowFocus = seen === 'land' ? null : through.landSide(view.camera.position);
        // For the HUD (checks): near a portal, the realms of the hero and the camera and the throat's light.
        portalHud = through.portals.length ? `\nportals ${through.portals.length} · hero ${heroIn} · camera ${seen} · in ${deep.toFixed(2)}/${camDeep.toFixed(2)} · lamp ${view.lantern.intensity.toFixed(1)} · exposure ${view.renderer.toneMappingExposure.toFixed(2)} · through ${through.passed}` : '';
      }
      creator?.orbit(dt);
      part('cellars+wild');
      sounds?.hearTick(dt);
      if (!rooms?.inside) {
        cellars.step(dt);
        if (!visit()) wild?.near(player.walker.pos.x, player.walker.pos.z);
        const seen = lookWild ? wild?.sight(lookWild) : null;
        if (seen) {
          lookWild = null;
          standBeside(seen, 12);
        }
        if (!visit() && !player.offFoot) cellars.approach(dt, player.walker.pos.x, player.walker.pos.z);
        part('brooks+bridges');
        brooks.near(player.walker.pos.x, player.walker.pos.z);
        bridgeView.lookAround(player.walker.pos.x, player.walker.pos.z);
        // The VGM opens the land ahead (plan 5.5): a region at a time into the log, its place drawn as the hero nears.
        part('regionSites');
        if (regionSites && !visit()) {
          const asking = !title?.holding && !creator?.showing && !!window.__mwReady;
          const opened = regionSites.heroAt(dt, player.flying ? view.camera.position : player.walker.pos, asking ? () => ({ log, hours: hours(), avoid: wild?.territories ?? [] }) : null);
          if (opened) regionOpened(opened);
          // A place come upon for the first time meets Discovery (C9): a sight in full, with its words; a region's place half.
          const came = player.offFoot ? null : regionSites.cameUpon(player.walker.pos.x, player.walker.pos.z);
          if (came?.sight && came.decision) {
            notes.say(came.sight.seen, 8);
            // A find by the way (Reward's answer): into the pack and purse, shown as finds below are.
            const loot = findIn(setting, came.sight, came.decision, start?.decision ?? home);
            if (loot) {
              character.pack.push(...loot.items);
              character.coins += loot.coins;
              fightHud.showFinds(loot);
              sounds?.coins();
              director.met('reward');
            } else director.met('discovery');
            character.earn(`sight:${came.id}`, 'sight');
          } else if (came) {
            director.met('discovery', 0.5);
            character.earn(`place:${came.id}`, 'place');
          }
        }
        // A situation's cry (C10): once the hero is near enough to see what it is about, someone there calls out.
        // One of a place's household waiting outside its way in (the task is done when they come in).
        if ((waitClock -= dt) <= 0) { waitClock = 1; waitOutside(); }
        part('cries');
        if (!visit() && !player.offFoot && (cryClock -= dt) <= 0) {
          cryClock = 0.25;
          const p = player.walker.pos, left = wild?.groupsLeft() ?? [];
          for (const c of criesDue({ log, setting, towns: terrain.towns, hero: p, hours: hours(), cried, living: (id) => (left.find((g) => g.territory.id === id)?.left ?? 1) > 0 })) {
            cried.add(c.id);
            const t = towns?.get(c.town), folk = t?.living ? t.life.agents.filter((a) => !a.hidden && !a.held) : [];
            // The traveller themselves; at a paddock or a burning barn whoever of the town stands nearest it (nobody near: no cry).
            const who = c.kind === 'hurt-traveller' ? folk.find((a) => a.person.role === 'traveller')
              : folk.filter((a) => Math.hypot(a.x - c.x, a.z - c.z) < 90).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
            if (who) speech.say(c.text, () => (who.hidden ? null : { x: who.x, y: terrain.height(who.x, who.z), z: who.z }));
            // The smoke over a raided farm and the refugees on the road are a story event seen: the hero knows of it now.
            if (c.kind === 'raid-smoke' || c.kind === 'refugees') learnEvent(c.id.replace(/\/fled$/, ''), 'what you saw');
          }
          wordOfEvents();
        }
        part('encounters+spells');
        speech.hover(dt);
        // A climb spends strength, and a fall hurts (a lethal one leaves the hero at the last of their health).
        character.climbing = player.walker.mode === 'climb';
        if (player.walker.fell > 0) {
          const hurt = fallHurt(player.walker.fell);
          player.walker.fell = 0;
          if (hurt > 0 && character.alive) { character.health = Math.max(1, character.health - hurt); fightHud.hurt(); }
        }
        stepEncounters(dt, encounters(), { hero: character, player, hud: fightHud, alone, notes, cues: aloneCues });
        const lead = leading();
        // A level gained (G3): the ring of light, the chime and the seal engraved; the hands raised only out of a fight.
        const h = player.hero, act = player.stance.action, acting = !!act && !!h && h.clock - act.t0 < act.dur;
        const cheer = levelWatch.see(character.level, !encounters().some((e) => e.pressure.fighting > 0) && !player.riding && player.walker.mode === 'ground' && !acting);
        if (cheer) {
          spellView.levelUp();
          sounds?.chime();
          if (cheer.gesture && h) player.stance = { ...player.stance, action: { ...CHEER, t0: h.clock } };
        }
        stoneUse.stoneFrame(dt);
        spellView.show(dt, lead ? lead.spellFrame() : { recipes: alone, offset: { x: 0, y: 0, z: 0 }, me: player.walker.pos, yaw: player.walker.yaw, cues: aloneCues.splice(0) });
        if (!visit()) hold?.tend(dt, player.walker.pos.x, player.walker.pos.z);
      }
      part('rooms+talk');
      if (!visit()) rooms?.update(dt);
      if (rooms?.door) cellars.nearHouse(rooms.door.town.id, rooms.door.b.id);
      // Talk follows the hero from town to town (a talk going on stays where it is).
      { const t = here(); if (t) { if (!t.been) director.met('discovery'); character.earn(`town:${t.town.decision.id}`, 'town'); t.been = true; if (talk) talk.place = t; } }
      talk?.watch();
      // The key for what the hero stands by (a hatch, the ladder up): only the key and the deed, the climb is seen.
      { const o = playing && open === 0 && !ended ? climbs.climbOffered : null; usePrompt.keyFor(settings.current.bindings.use[0], o === 'down' ? 'Climb down' : o === 'up' ? 'Climb up' : null); }
      part('map+minimap');
      const at = player.walker.pos;
      // The map fills in: the land round the hero as they go (not below ground), and a sketch of the way to each new mark.
      if (!visit() && (!seenAt || Math.hypot(at.x - seenAt[0], at.z - seenAt[1]) > 16)) { seenAt = [at.x, at.z]; known.see(at.x, at.z); }
      for (const l of journal.open) if (!known.told(l.id)) known.tell(l.id, rooms?.outside ? [rooms.outside.x, rooms.outside.z] : [at.x, at.z], [l.mark.x, l.mark.z]);
      if (minimap.showWhile(!title?.holding && !creator?.showing && !!window.__mwReady)) {
        const look = player.flying ? player.fly.yaw : player.heroCam.yaw, me = heroAt(player.walker.yaw), v = visit(), w = player.walker;
        const marks = journal.open.map((l) => ({ id: l.id, x: l.mark.x, z: l.mark.z })), sky = skyGlyph();
        if (v) {
          // Below ground the round is the dungeon round the hero; the land's marks ride the rim from its door.
          const lv = v.space.levelAt(w.pos.y - v.origin.y), range = belowRange(v.space, !!v.cellar.form.space.carved);
          minimap.read({ x: w.pos.x, z: w.pos.z, look, yaw: w.yaw, hour: view.sky.hour, sky, marks, below: { sheet: `${v.origin.x},${v.origin.z}:${lv}:${v.seen.version}`, range, from: me } });
          minimap.vgmMarks(vgmPanel.marks, me.x, me.z, vgmPanel.pickedMark, 0);
        } else {
          minimap.read({ x: me.x, z: me.z, look, yaw: me.yaw, hour: view.sky.hour, sky, marks });
          minimap.vgmMarks(vgmPanel.marks, me.x, me.z, vgmPanel.pickedMark);
        }
      }
      part('vgm direct');
      direct(dt);
      part('notes+rest+bar');
      notes.update(dt);
      vgmPanel.seeLog(log, vgmLog, !title?.holding && !creator?.showing && !!window.__mwReady);
      rest.watch(restWatch());
      player.resting = rest.sitting;
      actionBar.inPlay = playing && !ended && !title?.holding && !creator?.showing;
      actionBar.dark = !character.alive;
      actionBar.readSlots();
      // The floating origin steps once the camera strays from it, before anything writes origin-relative data.
      part('origin+weather');
      if (followOrigin) ORIGIN.follow(view.camera.position.x, view.camera.position.z);
      view.sky.underwater = sea.submerged(view.camera.position);
      wx.apply(dt, view.camera.position, hours(), view.sky);
      // Raided farms' barns smoulder (C10): looked up now and then, the puffs rise every frame.
      part('smoke+barns');
      if ((smokeClock -= dt) <= 0) {
        smokeClock = 1;
        // Good days over: their towns tell them as past (C11).
        for (const f of festivitiesOf(log)) if (f.to <= hours() && !feasted.has(f.id)) { feasted.add(f.id); towns?.get(f.town)?.ended(f.id); }
        smoke.burn(smokesAt(log, terrain.towns, setting, hours()).map((s) => ({ x: s.x, y: terrain.height(s.x, s.z) + 2, z: s.z, thick: s.thick })));
        // The barns they fired stand burnt while the raid is open (its folk have other worries than a new roof).
        const burnt = new Set<string>();
        for (const b of burntBarns(log, terrain.towns)) {
          const key = `${b.town}/${b.barn}`;
          if (towns?.viewOf(b.town)?.scorch(b.barn, true)) burnt.add(key);
          else if (scorched.has(key)) burnt.add(key);
        }
        for (const key of scorched) if (!burnt.has(key)) { const [t, b] = key.split('/'); towns?.viewOf(t)?.scorch(Number(b), false); }
        scorched = burnt;
      }
      if (smokeIn) smoke.billow(dt);
      part('sky');
      view.sky.update(dt, view.camera);
      // Down in the cellar the land above is out of the frame (visit.onDepth): its updates wait.
      const above = !visit();
      if (above) {
        part('sea');
        sea.update(dt, view.camera.position, view.sky.light, view.sky.gain);
        part('ground');
        ground.update(view.camera);
        part('roads+horizon');
        roadWork.follow(view.camera.position);
        view.sky.horizon.track(view.camera.position, view.sky.lightDirection, params.horizon ? terrainJobs : null);
        part('towns.tick');
        towns.tick(dt, view.camera.position);
      }
      // Doorways at night above, torches below, a soft fill on the hero in a room.
      part('warm lights');
      // The lights are picked near the camera as it stands in their realm (from the land, through a cave's portal).
      const warmIn = warmRealm(), lampsSeen = warmIn !== through.cameraRealm ? through.carry(view.camera.position, through.cameraRealm, warmIn) : null;
      view.warm.shine(lampsSeen ? lampsAt.set(lampsSeen.x, lampsSeen.y, lampsSeen.z) : view.camera.position, WINDOWS.glow.value, WINDOWS.share.value, dt, rooms?.inside ? player.walker.pos : null);
      // Every town's people near the hero live (and are drawn), and its animals graze.
      const cam = view.camera.position;
      part('towns.live');
      const lives = towns.live(dt, { x: cam.x, z: cam.z }, { rain: wx.shown.rain }, journal.open.map((l) => ({ id: l.id, x: l.mark.x, z: l.mark.z })));
      if (folk) folk.lives = lives;
      part('herds');
      stock?.herd(dt, cam, towns.graze(dt, cam.x, cam.z));
      part('small life');
      if (small && smallView) {
        // Out of doors only: below or inside, the land's small life waits.
        const out = above && !rooms?.inside, w = player.walker;
        const near = lookSmall ? small.firstSeen(lookSmall) : null;
        if (near && lookSmall) {
          // With `fly`: the free camera follows it close by (a free camera alarms no one).
          if (player.flying) watchSmall = { it: near, d: lookSmall === 'flock' ? 25 : 2.5 };
          else standBeside(near, lookSmall === 'squirrel' ? 13 : lookSmall === 'flock' ? 45 : 15);
          lookSmall = null;
        }
        if (watchSmall && player.flying) {
          const { it, d } = watchSmall, c = view.camera.position, k = Math.max(0.01, Math.hypot(c.x - it.x, c.z - it.z));
          if (k > d * 1.5 || k < d * 0.5) {
            const cx = it.x + (c.x - it.x) / k * d, cz = it.z + (c.z - it.z) / k * d;
            player.fly.place(cx, cz, d > 5 ? it.y - 4 : terrain.height(cx, cz) + 0.9, true);
          }
          const dx = it.x - c.x, dy = it.y + 0.1 - c.y, dz = it.z - c.z;
          player.fly.setLook(Math.atan2(dx, -dz) * 180 / Math.PI, Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI);
        }
        // A free camera disturbs no one; they live round it.
        const hero = player.flying ? null : { x: w.pos.x, y: w.pos.y, z: w.pos.z, speed: w.groundSpeed };
        if (out) for (const e of small.step(dt, hero, daylight(view.sky.hour), wx.shown.rain, hero ?? view.camera.position)) sounds?.wings(e);
        smallView.show(dt, view.camera.position, out);
      }
      // The people in the building drawn open (seen through its door and windows too).
      part('folk');
      // Below, only whoever of the household came down to the hero (nobody else is in the frame).
      if (owner && (owner.done || visit() !== owner.visit)) owner = null;
      if (owner) owner.step(dt, player.walker.pos);
      const ownerAt = owner?.placed() ?? null;
      if (folk) {
        folk.only = !!visit();
        folk.indoors = visit() ? (ownerAt ? [ownerAt] : null) : rooms ? rooms.people() : null;
        if (!above && ownerAt) folk.follow(dt, view.camera);
      }
      if (above) {
        // Until the game begins, the people round the hero's place are dressed (the title's fly-over is far up).
        if (folk) folk.focus = title?.holding || !window.__mwReady ? player.walker.pos : null;
        folk?.follow(dt, view.camera);
        part('flora');
        if (boot.trees) flora.update(dt, view.camera);
        part('trunks+grass');
        trunks.around(player.walker.pos.x, player.walker.pos.z);
        rocks.around(player.walker.pos.x, player.walker.pos.z);
        rockView.tend(view.camera);
        grass?.tend(dt, view.camera);
      }
      // Behind an open window the land is only glimpsed: it is drawn every other frame, which leaves the main
      // thread to the window. Drawing the land takes most of a 60 Hz frame, so a window on top tipped it to 30 Hz.
      part('render');
      if (!document.querySelector('.shade.open') || (frame++ & 1) === 0) {
        view.stage.frame();
        view.draw();
      }
      part('hud+ready');
      if (hud && showHud) {
        const p = view.camera.position, t = ground.stats;
        hud.textContent = `${view.backend} · seed ${seedText} · ${(now - last).toFixed(1)} ms · ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)} · chunks ${t.shown} (+${t.building})${grass ? ` · ${grass.stats}` : ''}${folk ? ` · ${folk.hudText}` : ''}\n${wx.summary}\n${view.stage.hudLine()}${portalHud}${visit() ? `\n${cellars.hudText}` : ''}${wild ? ` · ${wild.hudText}` : ''}${regionSites ? ` · ${regionSites.status} · ${towns.tally}` : ''}${smallView ? ` · ${smallView.hudText}` : ''}${rooms?.inside ? `\n${rooms.roomText}` : ''}${sounds ? `\n${sounds.summary}` : ''}`;
      }
      last = now;
      if (landed && title && !title.live && !title.calm) { title.landReady(); shown(); }
      // Playable once the people round the hero are dressed too (no plain stand-ins on the square), unless one
      // will not dress (a file that would not load): then after DRESS_WAIT, as one failed part must not hold the start.
      if (planted && !dressedAt && (!folk || visit() || !folk.undressed || now - plantedAt > DRESS_WAIT)) {
        dressedAt = now;
        if (folk && !visit()) console.info(`[load] ${(now / 1000).toFixed(1)} s: townsfolk round the hero ${folk.undressed ? `not all dressed (${folk.undressed} left)` : 'dressed'}`);
      }
      if (planted && dressedAt && !window.__mwReady) {
        window.__mwReady = true;
        shown();
        void warmLater().catch((e: unknown) => console.error('[load] warming the spells and smoke failed', e));
        if (title) title.worldReady();
        else loading.done();
      }
      HITCHES.endFrame();
    });
    await planting;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    loading.fail(err instanceof GraphicsUnavailable ? 'No graphics' : 'Could not start', failSeed ? `${detail} (seed ${failSeed})` : detail);
    throw err;
  }
}

