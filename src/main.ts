import type { Light, Object3D } from 'three/webgpu';
import { GraphicsUnavailable } from '@futuremagic/stage';
import { deriveSeed, parseSeed } from '@futuremagic/core';
import { LoadingScreen } from './app/loading';
import { params } from './app/params';
import { DebugMenu } from './app/debugMenu';
import { Menu } from './app/menu';
import { placesFor } from './app/places';
import { Player } from './app/player';
import { SettingsStore } from './app/settings';
import type { WalkWorld } from './game/walker';
import { Trunks } from './world/trunks';
import { HeroView } from './render/hero/HeroView';
import { preparePeople } from './render/hero/play';
import { GiantView } from './render/giant/GiantView';
import { routePackImages } from './render/packImages';
import { GIANT_SPEED, giantPose, type Orbit } from './app/title/route';
import { FolkView } from './render/folk/FolkView';
import { HorseView } from './render/horse/HorseView';
import { StockView } from './render/livestock/StockView';
import { Herds } from './sim/livestock';
import { Steed, horseSpots } from './game/horse';
import { buildingOf } from './sim/people';
import { TownLife, type Agent, type TownOrder } from './sim/townLife';
import { createView } from './render/view';
import { TerrainView } from './render/terrain/TerrainView';
import { VolumeView } from './render/terrain/VolumeView';
import { TerrainJobs, WorldJobs, createTerrainPool, createTexturePool, createWorldPool } from './workers/pool';
import { WaterView } from './render/water/WaterView';
import { FloraView } from './render/flora/FloraView';
import { GrassView } from './render/grass/GrassView';
import { useWaterEnvironment } from './render/materials/water';
import { loadGroundTextures, loadTownTextures } from './render/terrain/groundTextures';
import { useFieldGround, useTownGround, useTownTextures } from './render/materials/townGround';
import { WINDOWS } from './render/materials/building';
import { TownView } from './render/town/TownView';
import { useGroundTextures } from './render/materials';
import { settingById } from './setting/index';
import { CROPS, distSqPointSeg } from '@futuremagic/settlement';
import { validateSetting, type BackgroundDef } from './setting/contract';
import { openWorld } from './vgm/builder';
import { ordersOf, townOrder } from './vgm/orders';
import { WEATHER_KINDS, Weather, type WeatherKind } from './world/weather';
import { WeatherView } from './render/weather/WeatherView';
import { onKeyDown } from './input/keys';
import { marketStart } from './app/places';
import { TOWN_RASTER, TownGround } from './world/town';
import { firstDungeon, houseOf, promiseBarrow } from './vgm/dungeons';
import { LEADS, keepPromise, keptOf, moveInto, nextPromise, openPromises } from './vgm/leads';
import { ARRIVAL, arrivalEntry } from './vgm/guide';
import { Hails } from './app/hails';
import { Cellars } from './app/cellars';
import { stepEncounters, type FightHost } from './app/encounter';
import { WildLand } from './app/wildLand';
import type { Decision, DungeonDecision } from './world/decisions';
import { InteriorVisit } from './app/interiorVisit';
import { InteriorView } from './render/town/InteriorView';
import { lookFromDegrees } from './app/look';
import { Sound } from './app/sound';
import { SoundDirector } from './app/soundDirector';
import { Title } from './app/title/title';
import type { People } from './app/title/lines';
import { Creator, PEOPLE_RACE, heroNameFor } from './app/creatorUi';
import { Notes } from './app/notes';
import { TalkUi } from './app/talkUi';
import { standingPlace } from './game/standingPlace';
import { JournalUi } from './app/journalUi';
import { PackUi } from './app/packUi';
import { TradeUi } from './app/tradeUi';
import { LessonsUi } from './app/lessonsUi';
import { MapUi } from './app/mapUi';
import { HandOver } from './app/handOver';
import { Orientation, mastery } from './game/orientation';
import { Compass, type SkyGlyph } from './app/compass';
import { talkCellar, townTalk } from './talk/townTalk';
import { Journal } from './talk/journal';
import { AUTOSAVE, SavesUi, latestSave, loadAtRestart, pendingLoad, saveNow, type SavesHost } from './app/savesUi';
import { ROGUE_SLOT, SAVE_VERSION, heirSave, remainsEntry, saveLabel, type SaveData } from './app/saveGame';
import { release } from './app/release';
import { Character } from './game/character';
import { Market, itemWorth } from './game/trade';
import { teacherOf } from './game/lessons';
import { coinText } from './game/items';
import { epitaph, fallClassic, fallRoguelike, gather, gatheredLine, remainsId, remainsNear, type FallPlace, type GameMode, type Remains } from './game/death';
import { TalesEnd } from './app/talesEnd';
import { RemainsView } from './render/remainsView';
import { writeSlot } from './persist/saves';
import { acquaintances } from './game/background';
import { Director } from './vgm/director';
import { FightHud } from './app/fightHud';
import { UPKEEP_SERVICES, UpkeepUi } from './app/upkeepUi';

declare global {
  interface Window {
    /** Set when the first frame after loading is drawn (the screenshot tool waits for it). */
    __mwReady?: boolean;
  }
}

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
  try {
    const setting = settingById(params.setting);
    const errors = validateSetting(setting);
    if (errors.length) throw new Error(errors.join('; '));
    // A load asked for before this start: the world is built again from the save's seed.
    const loaded = await pendingLoad(setting);
    const save = typeof loaded === 'object' ? loaded : null;
    // The title's Continue: straight on with a loaded save, or offered when one is kept.
    if (title && save) title.continuing(saveLabel(save, save.heir ? 'a new hero in the same world' : 'where you left off'));
    else if (title) void latestSave().then((s) => { if (s) title.offerContinue(s.label, () => loadAtRestart(s.slot)); });
    const seedText = save?.seed ?? params.seed;
    const seed = parseSeed(seedText);
    loading.set('Finding the start');
    // The VGM's first decisions: the start town (and the arch outside it) stand on the land.
    const opened = openWorld(seed, setting);
    const { terrain } = opened;
    const town = terrain.towns[0];
    const home = town ? marketStart(town.plan) : opened.home;

    // The world as saved: the seed's own decisions, then what the VGM decided while the game was played.
    const later = save ? save.log.slice(opened.log.length) : [];
    if (save && JSON.stringify(save.log.slice(0, opened.log.length)) !== JSON.stringify(opened.log)) console.warn('save: this world was made by an older version; it is rebuilt from its seed');
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
    const view = await createView(canvas, { forceWebGL: boot.webgl, hour: save?.clock.hour ?? hour, dayMinutes: boot.dayMinutes, tone: params.tone, post: params.post, postSamples: params.postSamples, postFloatDepth: params.postFloatDepth, ao: params.ao, bloom: params.bloom });
    if (save) view.sky.day = save.clock.day;
    view.sky.look = setting.look?.grade ?? [];
    // The hero walks the land; F (or `?fly`) flies the free camera instead.
    let water: WaterView | null = null;
    // Down in the cellar the walker walks the cellar's space instead of the land.
    let cellars: Cellars | null = null;
    const visit = () => cellars?.downIn ?? null;
    // Behind a door the walker walks the room.
    let rooms: InteriorVisit | null = null;
    // The land, and the steps and porches before the doors (where the townsfolk stand).
    // The town's people once they live (set below).
    let folkLife: TownLife | null = null;
    const outdoors = (x: number, z: number) => Math.max(terrain.height(x, z), town?.stand(x, z) ?? -Infinity);
    // Tree trunks one walks round, asked ahead from the world workers (`jobs`, below) around the hero.
    const trunks = new Trunks(terrain, (x0, z0, size, spacing) => jobs.flora(x0, z0, size, spacing));
    const below = () => visit()?.world ?? rooms?.world ?? null;
    const world: WalkWorld = {
      // Out of doors also the steps and porches before the doors (as floors: climbed a step at a time).
      height: (x, z) => below()?.height(x, z) ?? terrain.height(x, z),
      floor: (x, z) => (below() ? null : town?.stand(x, z) ?? null),
      rockSurface: (x, y, z) => { const b = below(); return b ? b.rockSurface(x, y, z) : terrain.rockSurface(x, y, z); },
      // The surface as drawn, waves and all: a swimmer rides the swell.
      waterLevel: (x, z) => (below() ? null : water?.surfaceAt(x, z) ?? null),
      // Out of doors the buildings, the tree trunks and the townsfolk (whom one walks around, not through).
      wall: (x, z, r) => { const b = below(); return b ? !!b.wall?.(x, z, r) : !!town?.solid(x, z, r) || trunks.blocks(x, z, r) || !!cellars?.solid(x, z, r) || !!folkLife?.touches(x, z, r, player.walker.pos.x, player.walker.pos.z); },
    };
    const player = new Player(view.camera, canvas, world, params.fly);
    player.goTo(params.pos ?? [home.x, home.z], params.look);
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
      // The fly-over circles the market, where the game starts.
      const middle = { x: home.x, z: home.z, r: town ? (Math.max(town.nx, town.nz) * TOWN_RASTER) / 2 : 0 };
      orbit = { centre: [middle.x, terrain.height(middle.x, middle.z), middle.z], turn: title.draw.turn, angle: title.draw.angle, ground: (x, z) => terrain.height(x, z) };
      await title.attach({
        camera: view.camera,
        orbit,
        toys: {
          height: (x, z) => terrain.height(x, z),
          water: (x, z) => water?.waterAt(x, z) ?? null,
          town: town ? middle : null,
          hour: () => view.sky.hour,
        },
        heroView: () => player.heroView(),
        begin: (people) => { if (onBegin) onBegin(people); else paused(false); },
        chose: (people) => { chosen = { people }; hurry(); onChose?.(people); },
      });
    }

    loading.set('Painting the ground');
    // The ground's textures are made in workers while the seas, the hero and the town load; the land's
    // shaders need them, so the warm-up waits for them (plan A7: the start's steps overlap).
    const painted = (async () => {
      const texPool = createTexturePool();
      useGroundTextures(await loadGroundTextures(texPool));
      if (town) {
        // The town's walls, roofs and streets, and where its streets run (the terrain shader reads both).
        useTownTextures(await loadTownTextures(texPool));
        useTownGround(town.x0, town.z0, town.nx, town.nz, TOWN_RASTER, (i, j) => town.groundAt(town.x0 + (i + 0.5) * TOWN_RASTER, town.z0 + (j + 0.5) * TOWN_RASTER));
        useFieldGround(town.x0, town.z0, town.nx, town.nz, TOWN_RASTER, (i, j) => {
          const x = town.x0 + (i + 0.5) * TOWN_RASTER, z = town.z0 + (j + 0.5) * TOWN_RASTER;
          const f = town.fieldAt(x, z), path = town.groundAt(x, z) === TownGround.Path;
          return f || path ? { path, crop: f ? CROPS.indexOf(f.crop) : -1, rows: f?.rows ?? 0 } : null;
        });
      }
      texPool.dispose();
    })();

    const wx = new WeatherView(weather, (x, z) => terrain.height(x, z));
    const hours = () => view.sky.day * 24 + view.sky.hour;
    wx.apply(0, view.camera.position, hours(), view.sky);
    view.sky.update(0, view.camera);
    loading.set('Filling the seas');
    useWaterEnvironment(view.sky.envTexture);
    const jobs = new WorldJobs(createWorldPool(), seed, setting.id);
    const sea = new WaterView(jobs);
    water = sea;
    await sea.prime(view.camera.position);
    // In the water from the start (now that the water is known), and the hero's body built.
    player.resettle();
    title?.run(0);
    loading.set('Dressing the hero');
    // In the look the player made (a save's), or a new hero of the setting drawn from the seed.
    const hero = await HeroView.load(view.stage, view.renderer, setting.hero, save?.looks?.look ?? null, seed);
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
    // The hero's sheet (skills, health, gear, purse) and what they hold.
    const character = new Character(setting, save?.character ?? undefined);
    // `wear`: the gear starts worn, the main hand most (for looking at the smith's bench).
    if (params.wear) Object.entries(character.worn).forEach(([slot, it], i) => { if (it) character.worn[slot as keyof typeof character.worn] = { ...it, wear: params.wear * Math.max(0.3, 1 - i * 0.25) }; });
    const armHero = () => hero.arm(character.worn.main?.def ?? null, character.worn.off?.def ?? null);
    armHero();
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
    // The townsfolk: their lives (the world simulation) and the nearest of them drawn.
    const life = town ? new TownLife(town.plan, seed, hours(), setting.routines) : null;
    folkLife = life;
    // The VGM's orders to the town (logged; a save replays them).
    let log: readonly Decision[] = [...opened.log, ...later];
    if (life && town) for (const o of ordersOf(log, town.decision.id)) life.order(o);
    // `moved`: the first cellar was cleared long ago, and new dwellers have moved in since.
    const cleared = params.moved && town ? firstDungeon(log) : null;
    if (cleared && town && !keptOf(log).has(cleared.id)) {
      const k = keepPromise(log, cleared.id, hours() - LEADS.settle - 1);
      if (k) log = [...log, k];
      const m = moveInto({ seed, log, towns: terrain.towns, home: town.decision, hours: hours(), purposeOverdue: false, inside: () => false, dungeons: setting.dungeons, terrain }, deriveSeed(seed, 'moved'));
      if (m) log = [...log, m];
    }
    const orderTown = (o: TownOrder): void => {
      if (!life || !town) return;
      const d = townOrder(log, town.decision.id, o);
      log = [...log, d];
      life.order(o);
    };
    // Saddled horses waiting by the start (Actors' horse): the mount key gets on.
    let horses: HorseView | null = null;
    if (params.horses > 0) {
      loading.set('Saddling the horses');
      const free = (x: number, z: number, r: number) => !world.wall?.(x, z, r) && world.waterLevel(x, z) === null;
      const start = player.walker.pos;
      const spots = horseSpots(start.x, start.z, player.walker.yaw, params.horses, free);
      horses = await HorseView.make(view.renderer, spots.length);
      player.steeds = spots.map((p, i) => {
        const s = new Steed(world, i, seed);
        s.walker.place(p.x, p.z);
        s.walker.yaw = p.yaw;
        return s;
      });
      player.horses = horses;
      if (params.ride && player.steeds[0]) player.mount(player.steeds[0]);
    }
    // The farms' animals in their paddocks (the setting says which).
    const herds = town && town.plan.paddocks.length ? new Herds(town.plan, seed) : null;
    let stock: StockView | null = null;
    if (herds && params.stock > 0) {
      loading.set('Turning out the herds');
      stock = await StockView.forHerds(view.renderer, setting.world.livestock, herds, params.stock, (x, z) => terrain.height(x, z));
    }
    let folk: FolkView | null = null;
    if (life && params.folk > 0) {
      loading.set('Waking the town');
      folk = await FolkView.create(view.stage, view.renderer, life, outdoors, params.folk);
      folk.camera = view.camera;
    }
    loading.set('Growing the woods');
    const flora = new FloraView(view.stage, jobs, view.sun, { leafDepth: params.leafDepth, shadows: params.treeShadows });
    if (boot.trees) await flora.placeStart(view.camera.position);
    const grass = boot.grass ? new GrassView(jobs) : null;
    await grass?.sow(view.camera.position);
    sea.update(0, view.camera.position, view.sky.light, view.sky.gain);
    // The first townsman's clothes come over the network: their own step, so 'Preparing shaders' times only the compiles.
    if (folk) loading.set('Dressing the townsfolk');
    const folkWarm = folk ? await folk.warmObjects() : [];
    await painted;
    // The land, its rock and the town's houses are built in workers meanwhile; their shaders compile with the rest.
    const terrainJobs = new TerrainJobs(createTerrainPool(), seed, setting.id);
    const ground = new TerrainView(view.stage, terrainJobs, (x, z) => terrain.height(x, z));
    const rock = new VolumeView(view.stage, terrainJobs).raise();
    const houses = town && params.town ? new TownView(view.stage, terrainJobs) : null;
    if (houses && town) view.warm.atDoors(town.plan.buildings, (x, z) => terrain.height(x, z));
    const raised = houses?.build(0, view.camera.position);
    const landReady = ground.ready(view.camera);
    loading.set('Preparing shaders');
    await view.stage.warmUp([...(grass ? [grass.group] : []), hero.object, wx.precip, ...(horses ? horses.warmObjects() : []), ...(stock ? stock.toWarm() : []), ...folkWarm]);
    // While the loading screen (or the title's painted still) still covers the view, the land, trees and
    // townsfolk compile at full speed (docs/SHADERS.md rule 5); the cap's share comes back once the world shows.
    const capShare = view.stage.cap.share;
    view.stage.cap.share = 1;
    view.stage.monitor.phase = 'warmup';
    let hurried = false;
    const shown = () => { view.stage.cap.share = hurried && !window.__mwReady ? 1 : capShare; view.stage.monitor.phase = hurried && !window.__mwReady ? 'warmup' : 'run'; };
    hurry = () => { hurried = true; if (!window.__mwReady) { view.stage.cap.share = 1; view.stage.monitor.phase = 'warmup'; } };
    if (chosen) hurry();
    loading.set('Raising the land');
    await landReady;
    await rock;
    await raised;
    await view.stage.add(view.sky.dome);
    await view.stage.add(sea.mesh);
    if (grass) await view.stage.add(grass.group);
    await view.stage.add(hero.object);
    await horses?.show(view.stage);
    await stock?.enter(view.stage);
    await view.stage.add(wx.precip);

    const notes = new Notes();
    // The Director watching over the pacing, the fight's HUD and the journal (the cellars report to them).
    const director = new Director(setting.director, save?.director ?? undefined);
    // One life (roguelike): the Director is stricter with fairness (plan 11.1).
    director.strict = save?.mode === 'roguelike';
    const fightHud = new FightHud(setting, () => settings.current.bindings);
    const journal = new Journal(save?.journal);
    const inn = town ? buildingOf(town.plan, 'inn') : undefined;
    // Every cellar the VGM promised under the town's houses: the first is built now, the others when the hero steps into the house above.
    const firstPromise = firstDungeon(log);
    const house = firstPromise ? houseOf(firstPromise, terrain.towns) : null;
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
        // Where the hero last took a room (plan 11.2), else the temple: inside it; with no town, by the inn's door.
        const at = upkeep?.waking() ?? null;
        const carry = () => {
          if (at?.building && rooms) return rooms.enter(at.building, true);
          if (inn) { const [x, z, yaw] = inn.door; player.teleport(x - Math.sin(yaw) * 1.2, undefined, z - Math.cos(yaw) * 1.2, yaw + Math.PI); }
          return Promise.resolve();
        };
        if (v) void v.leave().then(carry);
        else void carry();
        const place = at?.said ?? setting.upkeep.words.wakeInn;
        return `You wake in ${place}, aching. Someone carried you there${fell.lost ? `, and ${coinText(fell.lost)} went with them` : ''}.`
          + (fell.remains ? ' Your pack stayed where you fell; your map marks the place.' : '');
      },
      still: (on) => paused(on),
      armed: armHero,
      kept: (id) => { const k = keepPromise(log, id, hours()); if (k) log = [...log, k]; },
    };
    // What of the land left the frame while the hero is below.
    const hidden: Object3D[] = [];
    cellars = new Cellars({
      stage: view.stage, renderer: view.renderer, camera: view.camera, canvas, player, lantern: view.lantern, warm: view.warm, sky: view.sky, notes, setting, character, seed, director, journal, hud: fightHud,
      fight: fightHost,
      up: (b) => rooms?.enter(b, true, true) ?? Promise.resolve(),
      swapped: () => autosave(),
      cue: (c) => sounds?.cue(c),
      dweller: params.dweller,
      ground: (x, z) => terrain.height(x, z),
      // Down in a cellar nothing of the land above can be seen: it leaves the frame (it was drawn behind the
      // cellar's walls, half the cellar's frame time). The lights stay, so no shader changes; the land's updates pause below.
      depth: (down, keep) => {
        if (!down) { for (const o of hidden) o.visible = true; hidden.length = 0; return; }
        const kept = new Set<Object3D>([...keep, hero.object, view.camera, remainsView.group]);
        for (const o of view.scene.children) if (o.visible && !kept.has(o) && !(o as Light).isLight) { o.visible = false; hidden.push(o); }
      },
    }, terrain.towns, save?.cellars ?? {});
    cellars.sync(log);
    // The wild on the land around the town: built as the hero comes near (D27, plan 9.3).
    const wild = town && params.wild ? new WildLand({
      stage: view.stage, renderer: view.renderer, camera: view.camera, canvas, player, notes, setting, character, seed, director, journal, hud: fightHud, fight: fightHost,
      cue: (c) => sounds?.cue(c),
      out: () => !visit() && !rooms?.inside && !player.flying,
      // Seen far off by day, near by night.
      light: () => (view.sky.hour > 6 && view.sky.hour < 19.5 ? 40 : 14),
    }, terrain, town, {
      height: (x, z) => terrain.height(x, z),
      waterDepth: (x, z) => terrain.waterDepth(x, z),
      // Trunks only near the hero (farther off they would be placed on the spot, a cell at a time).
      blocked: (x, z, r) => !!town.solid(x, z, r) || (Math.hypot(x - player.walker.pos.x, z - player.walker.pos.z) < 60 && trunks.blocks(x, z, r)),
    }, save?.wild ?? {}) : null;
    // `barrow`: before a barrow's forecourt, looking at it (one is promised now if there is none).
    if (params.barrow && town) {
      let b = log.find((d): d is DungeonDecision => d.kind === 'dungeon' && d.template === 'barrow') ?? null;
      if (!b) {
        b = promiseBarrow(seed, terrain, town, log, home, wild?.territories ?? []);
        if (b) { log = [...log, { ...b, at: hours() }]; cellars.sync(log); }
      }
      if (b?.site) player.teleport(b.site.x + Math.sin(b.site.yaw) * 9, undefined, b.site.z + Math.cos(b.site.yaw) * 9, b.site.yaw);
    }
    // `wild=<kind>`: beside its first group (for looking at them).
    const by = params.wildAt ? wild?.territories.find((t) => t.def.id === params.wildAt) : undefined;
    if (by) player.teleport(by.x + by.r + 20, undefined, by.z, Math.PI / 2);
    // Once that group is built, the hero steps up to one of them (a dozen metres off, facing it).
    let lookWild = by ? by.def.id : null;
    // A save from before kept promises were logged: the cellars its household paid for are kept.
    for (const id of Object.keys(save?.cellars ?? {})) if (save?.cellars[id].paid && !keptOf(log).has(id)) { const k = keepPromise(log, id, hours()); if (k) log = [...log, k]; }
    let dwellers: Promise<void> | null = null;
    if (firstPromise) {
      loading.set('Waking the cellar');
      const v = await cellars.build(firstPromise.id);
      // Its people's shaders (each one's shadow casters too) build in the Stage's frame slots once the loop runs; loading waits for them below.
      dwellers = cellars.warming;
      if (v && params.cellar) {
        await v.enter(true, params.cellarRoom);
        if (params.look) ({ yaw: player.heroCam.yaw, pitch: player.heroCam.pitch } = lookFromDegrees(params.look[0], params.look[1] ?? -10));
        player.walker.yaw = player.heroCam.yaw;
      }
    }

    // Every door of the town opens on its room; a cellar's house has the hatch down.
    if (town) rooms = new InteriorVisit(town.plan.buildings, cellars.down, new InteriorView(view.stage), player, view.lantern, view.sky, notes);
    if (rooms && town && params.room !== null) {
      const b = params.room === 'cellar' ? house : town.plan.buildings.find((x) => x.kind === params.room) ?? town.plan.buildings[Number(params.room)];
      if (b) await rooms.enter(b, true, params.room === 'cellar'); // the cellar: beside its hatch
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
    const planting = Promise.all([survive('trees', trees), survive('townsfolk', folkLooks?.shown.then(took('townsfolk'))), params.cellar ? survive('cellar', dwellers) : null]).then(() => { planted = true; });
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
      sound.volume = s.volume;
      showHud = params.hud || s.hud;
      if (hud) hud.style.display = showHud ? '' : 'none';
    });
    // Dialogs: the debug menu first, so its keys come before the settings' Escape.
    // Talk and the journal (their Escape comes before the settings' too). The townsfolk know of the
    // promised cellar; what the player hears goes into the journal.
    // Declared before the sounds read it: a `?talk=` start opens a dialog right away.
    let creator: Creator | null = null;
    sounds = new SoundDirector({
      engine: sound.engine, seed, camera: view.camera, walker: player.walker, terrain, town: town ?? null,
      water: (x, z) => sea.waterAt(x, z),
      waterLevel: (x, z) => world.waterLevel(x, z),
      weather: () => wx.shown,
      hour: () => view.sky.hour,
      flash: () => ({ light: view.sky.flash, bearing: view.sky.flashBearing }),
      where: () => (visit() ? { place: 'cellar', room: null } : rooms?.inside && town ? { place: 'room', room: town.plan.buildings[rooms.building]?.kind ?? null } : { place: 'land', room: null }),
      inFlight: () => player.flying,
      horses: () => player.steeds,
      riding: () => player.riding,
      threat: () => (director.mood === 'fight' ? 'fight' : director.mood === 'tension' ? 'tension' : null),
      // Silent until the world is playable: no beds, steps or music (it streams, D44/F4) compete with the start's downloads.
      titleHolds: () => !!title?.holding || !!creator?.showing || !window.__mwReady,
    });
    const townWords = town && life ? townTalk(seed, setting, town, life.agents.map((a) => a.person), log, save?.talk ?? undefined).talk : null;
    // Who knows the hero from before (plan 11.4): their greeting names them.
    const friendsOf = (bg: BackgroundDef | undefined) => (bg && life ? acquaintances(bg, life.agents.map((a) => a.person)) : []);
    const meetOldFriends = () => {
      const bg = setting.backgrounds.find((b) => b.id === character.background);
      townWords?.acquaint(friendsOf(bg).map((a) => ({ person: a.person.id, line: a.line })), heroName || 'friend');
    };
    meetOldFriends();
    // What townsfolk do besides talk (trade, repairs, a room): a talk topic each, which opens its window.
    const services = new Map<string, (a: Agent) => void>();
    // The town's merchants (plan 11.5): the smith, the inn's keeper and the market's stalls.
    const market = life ? new Market(setting, life.agents.map((a) => a.person), seed, view.sky.day, save?.market) : null;
    const trade = market ? new TradeUi(character, setting, market, {
      paused,
      get bindings() { return settings.current.bindings; },
      get day() { return view.sky.day; },
      traded: () => sounds?.coins(),
      say: (text) => notes.say(text),
    }) : null;
    if (market && trade && townWords) {
      services.set('trade', (a) => { const m = market.of(a.person.id); if (m) trade.show(m, townWords.nameOf(a.person.id)); });
      townWords.services = (person) => {
        const shop = market.of(person)?.shop;
        return shop ? [{ id: 'trade', label: shop.topic, line: shop.line }] : [];
      };
    }
    const keyName = (k: 'journal' | 'map' | 'talk') => (settings.current.bindings[k][0] || settings.current.bindings[k][1]).replace(/^Key/, '');
    const talk = town && life && townWords ? new TalkUi(townWords, setting.talk, journal, life, town.plan, player, {
      paused,
      get bindings() { return settings.current.bindings; },
      // Flying, below in a cellar, or still at the title (its fly-over is no place to talk).
      get away() { return player.flying || !!visit() || !!title?.holding; },
      heard: (lead) => {
        handOver?.give(lead.id);
        // The hero's own first page ("ask at the inn") has done its work.
        journal.fulfil(ARRIVAL);
        notes.say(`${lead.note} (Journal: ${keyName('journal')}, map: ${keyName('map')})`, 6);
      },
      serve: (id, a) => services.get(id)?.(a),
      get roomPeople() { return rooms?.inside && life ? rooms.people(life) : null; },
    }) : null;
    // A room at the inn and the smith's mending (plan 11.5): two more services.
    const upkeep = town && life && townWords ? new UpkeepUi(character, setting, {
      paused,
      get bindings() { return settings.current.bindings; },
      town: { id: town.decision.id, plan: town.plan },
      hours,
      setClock: (h) => { view.sky.day = Math.floor(h / 24); view.sky.hour = h - view.sky.day * 24; },
      enter: (b) => rooms?.enter(b, true) ?? Promise.resolve(),
      say: (text, secs) => notes.say(text, secs),
      worth: (it) => itemWorth(setting.items, it),
      rang: () => sounds?.rang(),
    }) : null;
    if (upkeep && townWords && life) {
      const others = townWords.services.bind(townWords);
      const person = (id: number) => life.agents.find((a) => a.person.id === id)?.person;
      townWords.services = (id) => { const p = person(id); return [...others(id), ...(p ? upkeep.services(p) : [])]; };
      for (const id of UPKEEP_SERVICES) services.set(id, (a) => upkeep.answer(id, a.person, townWords.nameOf(a.person.id)));
    }
    // Lessons (plan 11.4): the smith, the old caravan guard and the innkeeper teach for coin; one more service.
    const lessons = life && townWords ? new LessonsUi(character, setting, {
      paused,
      get bindings() { return settings.current.bindings; },
      taught: (h) => { const t = hours() + h; view.sky.day = Math.floor(t / 24); view.sky.hour = t - view.sky.day * 24; sounds?.coins(); },
      changed: armHero,
    }) : null;
    if (lessons && townWords && life) {
      const others = townWords.services.bind(townWords);
      const person = (id: number) => life.agents.find((a) => a.person.id === id)?.person;
      townWords.services = (id) => {
        const p = person(id), t = p ? teacherOf(setting, p) : null;
        return [...others(id), ...(t ? [{ id: 'lessons', label: t.topic, line: t.line }] : [])];
      };
      services.set('lessons', (a) => { const t = teacherOf(setting, a.person); if (t) lessons.teach(t, townWords.nameOf(a.person.id)); });
    }
    const journalUi = new JournalUi(journal, { paused: pausedWith('ui/page'), get bindings() { return settings.current.bindings; } });
    const pack = new PackUi(character, setting, {
      paused,
      get bindings() { return settings.current.bindings; },
      changed: armHero,
      drank: (n) => { if (n > 0) fightHud.healed(); },
    });
    // How exactly the hero knows where they are (plan 11.7): the map shows it, travel and reading it train it.
    const orientation = new Orientation(seed, character, home);
    // Where the hero believes they are, facing `yaw` (down in a cellar: at its house; in a barrow: at its forecourt).
    const believed = (yaw: number) => {
      const h = visit()?.houseDoor ?? null, w = player.walker;
      return h ? orientation.bearing(h[0], h[1], h[2]) : orientation.bearing(w.pos.x, w.pos.z, yaw);
    };
    const map = town ? new MapUi(town.plan, journal, {
      paused: pausedWith('ui/map'),
      get bindings() { return settings.current.bindings; },
      height: (x, z) => terrain.height(x, z),
      water: (x, z) => sea.waterAt(x, z)?.depth ?? 0,
      heroBearing: () => believed(player.walker.yaw),
    }) : null;
    // The compass at the top (plan 17.1): turns with the camera, its needle as true as the orientation skill.
    const compass = new Compass(seed);
    const skyGlyph = (): SkyGlyph => {
      const w = wx.shown;
      return w.rain > 0.1 ? (w.snow > 0.5 ? 'snow' : 'rain') : w.cover > 0.6 ? 'cloud' : 'clear';
    };
    // Telling of a place: the hero hands the map over and the teller marks it.
    const handOver = map ? new HandOver((id, c, t) => map.markIn(id, c, t), () => sounds?.noted()) : null;
    /**
     * The hero in front of `a` (for `?talk`, `?trade` and the shot set): in their room when they are
     * indoors (out in the town an indoor person stands inside the building's walls, seen from within),
     * else where they are.
     */
    const standBefore = async (a: Agent): Promise<void> => {
      const s = a.spot >= 0 ? life?.spots[a.spot] : undefined;
      const b = a.hidden && s && s.building >= 0 ? town?.plan.buildings[s.building] : undefined;
      if (b && rooms && life) {
        if (rooms.building !== b.id) await rooms.enter(b, true);
        const p = rooms.people(life)?.find((x) => x.agent === a);
        if (p) { player.teleport(p.x + Math.cos(p.dir) * 1.3, p.y, p.z + Math.sin(p.dir) * 1.3, Math.atan2(Math.cos(p.dir), Math.sin(p.dir))); return; }
      }
      // Clear of walls: a building's corner beside the hero filled the talk's shot.
      const at = standingPlace(a.x, a.z, a.dir, (x, z, r) => !!town?.solid(x, z, r));
      player.teleport(at.x, undefined, at.z, Math.atan2(at.x - a.x, at.z - a.z));
    };
    if (talk && life && town && params.talk) {
      // Straight into a talk: in front of the innkeeper or of the cellar's household.
      const pick = params.talk === 'house'
        ? life.agents.find((a) => a.person.home === firstPromise?.building && a.person.role !== 'child')
        : params.talk === 'smith'
        ? life.agents.find((a) => a.person.trade === 'smith' && a.person.role === 'trade')
        : life.agents.find((a) => town.plan.buildings[a.person.home].kind === 'inn' && a.person.role === 'trade');
      if (pick) {
        await standBefore(pick);
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
          talk: townWords?.save() ?? null,
          journal: journal.entries(),
          character: character.save(),
          ...(market ? { market: market.save() } : {}),
          looks: { name: heroName, look: hero.look },
          director: director.snapshot(),
          mode,
          remains: [...remains],
        };
        const v = visit();
        return { data, where: v ? `in ${v.cellar.house}'s cellar` : 'in the town' };
      },
    };
    const saves = new SavesUi(savesHost);
    // A classic game autosaves every 5 minutes; a roguelike one keeps its one save every minute and as the page goes.
    const autosave = () => { if (!ended) void saveNow(savesHost, mode === 'roguelike' ? ROGUE_SLOT : AUTOSAVE); };
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
    const gatherNear = () => {
      if (!remains.length || !character.alive) return;
      const v = visit(), w = player.walker.pos, below = v ? v.cellar.decision.id : null;
      if (justLeft && (justLeft.at.below !== below || Math.hypot(justLeft.at.x - w.x, justLeft.at.z - w.z) > 8)) justLeft = null;
      const r = remainsNear(remains, below, w.x, w.y, w.z);
      if (!r || r === justLeft) return;
      gather(character, r);
      remains.splice(remains.indexOf(r), 1);
      journal.fulfil(r.id);
      drawRemains();
      notes.say(gatheredLine(r), 6);
      sounds?.cue({ kind: 'found', loot: { items: [...r.items], coins: r.coins } });
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
      const down = h.below ? await cellars.build(h.cellar ?? firstPromise?.id ?? '') : null;
      if (down) await down.enter(true);
      player.teleport(h.x, h.below ? h.y : undefined, h.z, h.yaw);
      if (!save.heir) notes.say(`Loaded: ${save.journal.length ? `${save.journal.filter((l) => !l.done).length} open lead(s) in your journal` : 'your game'}.`);
    } else if (typeof loaded === 'string') notes.say(`Could not load the save: ${loaded}.`, 8);
    // Straight to a merchant's counter (`?trade=smith`, or `game.tradeAt('smith')` in the console and the shot set): in front of them, their wares out.
    const tradeAt = async (keeper: string): Promise<boolean> => {
      const m = market?.merchants.find((x) => x.shop.keeper === keeper);
      const a = m && life?.agents.find((x) => x.person.id === m.person);
      if (!m || !a || !trade || !townWords) return false;
      talk?.close();
      await standBefore(a);
      trade.show(m, townWords.nameOf(a.person.id));
      return true;
    };
    if (params.trade) await tradeAt(params.trade);
    if (params.open) { talk?.close(); if (params.open === 'journal') journalUi.setOpen(true); else if (params.open === 'saves') saves.setOpen(true); else if (params.open === 'pack') pack.setOpen(true); else if (params.open === 'tale') showTale(); else map?.setOpen(true); }
    new DebugMenu({
      paused,
      get freeCamera() { return player.flying; },
      set freeCamera(on) { player.flying = on; },
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
        if (!life || !town) return 'no town';
        const [x, z] = town.plan.centre;
        orderTown(kind === 'gather' ? { kind, x, z, radius: 14, from: hours(), to: hours() + 2 } : { kind, from: hours(), to: hours() + 2 });
        return kind === 'gather' ? 'everyone to the market for 2 game hours' : 'everyone indoors for 2 game hours';
      },
      get viewParams() { return player.viewParams; },
      places: placesFor(params.seed, home),
      game: { player, view, terrain, sea, flora, grass, ground, settings, params, home, weather, wx, get cellar() { return visit(); }, cellars, get wild() { return wild; }, title, sound, get sounds() { return sounds; }, life, get folk() { return folk; }, get rooms() { return rooms; }, character, market, trade, tradeAt, fightHud, compass,
        /** What near the hero is not drawn as itself yet (empty: everything is), for screenshots (tools/shot/set.mjs). */
        get undrawn() {
          const out: string[] = [];
          if (folk && folk.undressed) out.push(`${folk.undressed} townsfolk`);
          if (wild?.warming) out.push(`${wild.warming} wild groups`);
          if (!cellars.dwellersWarm) out.push('cellar dwellers');
          return out;
        } },
    });
    b.menus.menu = new Menu(settings, {
      paused,
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
      skillName: (id) => setting.skills.find((k) => k.id === id)?.name ?? id,
      itemName: (id) => setting.items.items.find((i) => i.id === id)?.name ?? id,
      knownBy: (bg) => (townWords ? friendsOf(bg).map((a) => `${townWords.nameOf(a.person.id)}, the ${a.person.trade}`) : []),
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
      // The past chosen: its skills, kit and the people in town who know the hero.
      const bg = setting.backgrounds.find((b) => b.id === made.background);
      if (bg) { character.beginAs(bg); armHero(); }
      // A roguelike tale has its one save from the first step.
      mode = made.mode;
      director.strict = mode === 'roguelike';
      if (mode === 'roguelike') autosave();
      meetOldFriends();
      // A new hero's own first page: where to ask for work (the inn's door is marked on the map).
      const innB = town ? buildingOf(town.plan, 'inn') : null;
      const keeper = innB && life ? life.agents.find((a) => town.plan.buildings[a.person.home] === innB) : undefined;
      if (innB && keeper && townWords && !journal.leads.length) journal.remember(arrivalEntry(setting.talk, townWords.homeCalled(keeper.person.id), { x: innB.door[0], z: innB.door[1] }));
      // Behind the hero, looking the way they face.
      player.teleport(w.pos.x, undefined, w.pos.z, w.yaw);
      paused(false);
      const friends = townWords ? friendsOf(bg).map((a) => townWords.nameOf(a.person.id)) : [];
      const page = journal.open.some((l) => l.id === ARRIVAL) ? ` Your journal (${keyName('journal')}) says where to ask for work.` : '';
      notes.say(`${made.name} steps out onto the market square.${friends.length ? ` ${friends.join(' and ')} will know you.` : ''}${page}`, 8);
    };
    onBegin = (people) => {
      if (save && !save.heir) paused(false);
      else void create(people ? PEOPLE_RACE[people] : null);
    };
    if (!title && ((params.create && !save) || save?.heir)) { paused(true); void create(null); }
    // F flies, H gets on or off a horse (the keys are in the settings).
    onKeyDown((e) => {
      if (e.repeat || open > 0) return;
      if (settings.current.bindings.fly.includes(e.code)) player.flying = !player.flying;
      else if (settings.current.bindings.mount.includes(e.code)) player.toggleMount();
    });
    // The Director's turn every frame; the Builder's every few seconds: a new promise when one is due
    // (plan 4.1, 4.2: always a few open leads), which the cellars and the townsfolk learn of at once.
    let builderClock = 0;
    // While the hero has nothing to follow, someone who has heard of a promised place comes over (vgm/guide.ts).
    const hails = town && life && townWords ? new Hails(life, townWords, setting.talk, journal, {
      get heroAt() { return player.walker.pos; },
      get busy() { return open > 0 || player.flying || !!rooms?.inside || !!title?.holding || !!creator?.showing || !window.__mwReady; },
      get open() { return new Set(openPromises(log).map((d) => d.id)); },
      get talkingTo() { return talk?.partner ?? null; },
      say: (text) => notes.say(text, 6),
    }) : null;
    const direct = (dt: number): void => {
      const below = !!visit();
      let fighting = 0, pressure = 0;
      for (const e of [...(cellars?.encounters ?? []), ...(wild?.encounters ?? [])]) { const p = e.pressure; fighting += p.fighting; pressure += p.pressure; }
      director.observe(dt, { fighting, pressure, health: character.health / character.maxHealth, talking: open > 0, underground: below, inTown: !!town && !below, leads: journal.open.length });
      const m = director.next();
      if (m) notes.say(m, 6);
      if (!title?.holding && !creator?.showing) gatherNear();
      hails?.sendFor(dt, fighting > 0 || below);
      builderClock += dt;
      if (builderClock < 3 || !town || !life || title?.holding || creator?.showing) return;
      builderClock = 0;
      const d = nextPromise({ seed, log, towns: terrain.towns, home: town.decision, hours: hours(), purposeOverdue: director.overdue === 'purpose', inside: (id) => !!cellars?.isInside(id), dungeons: setting.dungeons, terrain, avoid: wild?.territories ?? [] });
      if (!d) return;
      console.info(`[vgm] ${d.kind} ${d.id}${d.kind === 'move-in' ? ` into ${d.dungeon}` : ''} at ${hours().toFixed(1)} h`);
      log = [...log, d];
      cellars?.sync(log);
      const c = townWords ? talkCellar(d, setting, town, life.agents.map((a) => a.person), log) : null;
      if (c) townWords?.add(c);
    };
    let last = performance.now(), frame = 0;
    view.renderer.setAnimationLoop(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
      title?.run(dt);
      if (giant && orbit && title) {
        if (title.holding) giant.view.frame(dt, giantPose(orbit, title.draw.seed, (giant.t += dt)));
        else { giant.view.dispose(); giant = null; }
      }
      if (title?.holding || creator?.showing) player.standBy(dt);
      else player.update(dt);
      creator?.orbit(dt);
      sounds?.hearTick(dt);
      if (!rooms?.inside) {
        cellars.step(dt);
        if (!visit()) wild?.near(player.walker.pos.x, player.walker.pos.z);
        const seen = lookWild ? wild?.sight(lookWild) : null;
        if (seen) {
          lookWild = null;
          const p = player.walker.pos, d = Math.max(1, Math.hypot(p.x - seen.x, p.z - seen.z));
          const x = seen.x + (p.x - seen.x) / d * 12, z = seen.z + (p.z - seen.z) / d * 12;
          player.teleport(x, undefined, z, Math.atan2(x - seen.x, z - seen.z));
        }
        if (!visit() && !player.flying) cellars.approach(dt, player.walker.pos.x, player.walker.pos.z);
        stepEncounters(dt, [...cellars.encounters, ...(wild?.encounters ?? [])], { hero: character, player, hud: fightHud });
      }
      if (!visit()) rooms?.update(dt);
      if (rooms?.inside) cellars.near(rooms.building);
      talk?.watch();
      const at = player.walker.pos, up = orientation.train(dt, at.x, at.z, !!map?.isOpen, !player.flying && !visit());
      if (up) { notes.say(`Your ${up.name} rises to ${up.level}.`, 4); sounds?.cue({ kind: 'skill', up }); }
      compass.visible = !title?.holding && !creator?.showing && !!window.__mwReady;
      if (compass.visible) {
        const look = player.flying ? player.fly.yaw : player.heroCam.yaw;
        compass.read(dt, { bearing: believed(look), look, mastery: mastery(character.skill('orientation')), hour: view.sky.hour, sky: skyGlyph(), marks: journal.open.map((l) => ({ id: l.id, x: l.mark.x, z: l.mark.z })) });
      }
      direct(dt);
      notes.update(dt);
      view.sky.underwater = sea.submerged(view.camera.position);
      wx.apply(dt, view.camera.position, hours(), view.sky);
      view.sky.update(dt, view.camera);
      // Down in the cellar the land above is out of the frame (visit.onDepth): its updates wait.
      const above = !visit();
      if (above) {
        sea.update(dt, view.camera.position, view.sky.light, view.sky.gain);
        ground.update(view.camera);
        view.sky.horizon.track(view.camera.position, view.sky.lightDirection, params.horizon ? terrainJobs : null);
        houses?.update(view.camera.position);
      }
      // Doorways at night above, torches below, a soft fill on the hero in a room.
      view.warm.shine(view.camera.position, WINDOWS.glow.value, WINDOWS.share.value, dt, rooms?.inside ? player.walker.pos : null);
      if (life) {
        life.focus = { x: view.camera.position.x, z: view.camera.position.z };
        life.step(dt, hours(), { rain: wx.shown.rain });
      }
      herds?.step(dt);
      stock?.herd(dt, view.camera.position);
      if (folk) folk.indoors = life && rooms?.inside ? rooms.people(life) : null;
      if (above) {
        folk?.follow(dt, view.camera);
        if (boot.trees) flora.update(dt, view.camera);
        trunks.around(player.walker.pos.x, player.walker.pos.z);
        grass?.tend(dt, view.camera);
      }
      // Behind an open window the land is only glimpsed: it is drawn every other frame, which leaves the main
      // thread to the window. Drawing the land takes most of a 60 Hz frame, so a window on top tipped it to 30 Hz.
      if (!document.querySelector('.shade.open') || (frame++ & 1) === 0) {
        view.stage.frame();
        view.draw();
      }
      if (hud && showHud) {
        const p = view.camera.position, t = ground.stats;
        hud.textContent = `${view.backend} · ${(now - last).toFixed(1)} ms · ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)} · chunks ${t.shown} (+${t.building})${grass ? ` · ${grass.stats}` : ''}${folk ? ` · ${folk.hudText}` : ''}\n${wx.summary}\n${view.stage.hudLine()}${visit() ? `\n${cellars.hudText}` : ''}${wild ? ` · ${wild.hudText}` : ''}${rooms?.inside ? `\n${rooms.summary}` : ''}${sounds ? `\n${sounds.summary}` : ''}`;
      }
      last = now;
      if (landed && title && !title.live && !title.calm) { title.landReady(); shown(); }
      if (planted && !window.__mwReady) {
        window.__mwReady = true;
        shown();
        if (title) title.worldReady();
        else loading.done();
      }
    });
    await planting;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    loading.fail(err instanceof GraphicsUnavailable ? 'No graphics' : 'Could not start', detail);
    throw err;
  }
}

