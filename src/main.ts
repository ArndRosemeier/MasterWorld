import { GraphicsUnavailable } from '@futuremagic/stage';
import { parseSeed } from '@futuremagic/core';
import { LoadingScreen } from './app/loading';
import { params } from './app/params';
import { DebugMenu } from './app/debugMenu';
import { Menu } from './app/menu';
import { placesFor } from './app/places';
import { Player } from './app/player';
import { SettingsStore } from './app/settings';
import type { WalkWorld } from './game/walker';
import { HeroView } from './render/hero/HeroView';
import { FolkView } from './render/folk/FolkView';
import { TownLife, type TownOrder } from './sim/townLife';
import { createView } from './render/view';
import { TerrainView } from './render/terrain/TerrainView';
import { VolumeView } from './render/terrain/VolumeView';
import { TerrainJobs, WorldJobs, createTerrainPool, createTexturePool, createWorldPool } from './workers/pool';
import { WaterView } from './render/water/WaterView';
import { FloraView } from './render/flora/FloraView';
import { GrassView } from './render/grass/GrassView';
import { useWaterEnvironment } from './render/materials/water';
import { loadGroundTextures, loadTownTextures } from './render/terrain/groundTextures';
import { useTownGround, useTownTextures } from './render/materials/townGround';
import { TownView } from './render/town/TownView';
import { useGroundTextures } from './render/materials';
import { settingById } from './setting/index';
import { validateSetting } from './setting/contract';
import { openWorld } from './vgm/builder';
import { ordersOf, townOrder } from './vgm/orders';
import { WEATHER_KINDS, Weather, type WeatherKind } from './world/weather';
import { WeatherView } from './render/weather/WeatherView';
import { onKeyDown } from './input/keys';
import { marketStart } from './app/places';
import { TOWN_RASTER } from './world/town';
import { outlineCellar } from './world/dungeon/cellar';
import { firstDungeon, houseOf } from './vgm/dungeons';
import { CellarView } from './render/dungeon/CellarView';
import { CellarVisit } from './app/cellarVisit';
import { InteriorVisit } from './app/interiorVisit';
import { InteriorView } from './render/town/InteriorView';
import { lookFromDegrees } from './app/look';
import { Sound } from './app/sound';
import { Title } from './app/title/title';
import { Notes } from './app/notes';
import { TalkUi } from './app/talkUi';
import { JournalUi } from './app/journalUi';
import { MapUi } from './app/mapUi';
import { townTalk } from './talk/townTalk';
import { Journal } from './talk/journal';
import { AUTOSAVE, SavesUi, latestSave, loadAtRestart, pendingLoad, saveNow, type SavesHost } from './app/savesUi';
import { SAVE_VERSION, saveLabel, type SaveData } from './app/saveGame';
import { release } from './app/release';

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
    if (title && save) title.continuing(saveLabel(save, 'where you left off'));
    else if (title) void latestSave().then((s) => { if (s) title.offerContinue(s.label, () => loadAtRestart(s.slot)); });
    const seedText = save?.seed ?? params.seed;
    const seed = parseSeed(seedText);
    loading.set('Finding the start');
    // The VGM's first decisions: the start town (and the arch outside it) stand on the land.
    const opened = openWorld(seed, setting);
    const { terrain } = opened;
    const town = terrain.towns[0];
    const home = town ? marketStart(town.plan) : opened.home;

    if (save && JSON.stringify(save.log) !== JSON.stringify(opened.log)) console.warn('save: this world was made by an older version; it is rebuilt from its seed');
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
    const view = await createView(canvas, { forceWebGL: boot.webgl, hour: save?.clock.hour ?? hour, dayMinutes: boot.dayMinutes });
    if (save) view.sky.day = save.clock.day;
    // The hero walks the land; F (or `?fly`) flies the free camera instead.
    let water: WaterView | null = null;
    // Down in the cellar the walker walks the cellar's space instead of the land.
    let visit: CellarVisit | null = null;
    // Behind a door the walker walks the room.
    let rooms: InteriorVisit | null = null;
    // The land, and the steps and porches before the doors.
    const outdoors = (x: number, z: number) => Math.max(terrain.height(x, z), town?.stand(x, z) ?? -Infinity);
    const below = () => (visit?.inside ? visit.world : rooms?.world ?? null);
    const world: WalkWorld = {
      // Out of doors also the steps and porches before the doors.
      height: (x, z) => below()?.height(x, z) ?? outdoors(x, z),
      rockSurface: (x, y, z) => { const b = below(); return b ? b.rockSurface(x, y, z) : terrain.rockSurface(x, y, z); },
      waterLevel: (x, z) => { if (below()) return null; const w = water?.waterAt(x, z); return w && w.depth > 0 ? w.level : null; },
      wall: (x, z, r) => { const b = below(); return b ? !!b.wall?.(x, z, r) : !!town?.solid(x, z, r); },
    };
    const player = new Player(view.camera, canvas, world, params.fly);
    player.goTo(params.pos ?? [home.x, home.z], params.look);
    // Dialogs (and the title) hold the game's keys and mouse while open.
    let open = 0;
    const paused = (on: boolean) => { open = Math.max(0, open + (on ? 1 : -1)); player.pause(open > 0); };
    if (title) {
      paused(true);
      // The fly-over circles the market, where the game starts.
      const middle = { x: home.x, z: home.z, r: town ? (Math.max(town.nx, town.nz) * TOWN_RASTER) / 2 : 0 };
      await title.attach({
        camera: view.camera,
        orbit: { centre: [middle.x, terrain.height(middle.x, middle.z), middle.z], turn: title.draw.turn, angle: title.draw.angle, ground: (x, z) => terrain.height(x, z) },
        toys: {
          height: (x, z) => terrain.height(x, z),
          water: (x, z) => water?.waterAt(x, z) ?? null,
          town: town ? middle : null,
          hour: () => view.sky.hour,
        },
        heroView: () => player.heroView(),
        begin: (people) => {
          if (people) console.info(`[title] starting with the ${people} (character creation will take this)`);
          paused(false);
        },
      });
    }

    loading.set('Painting the ground');
    const texPool = createTexturePool();
    useGroundTextures(await loadGroundTextures(texPool));
    if (town) {
      // The town's walls, roofs and streets, and where its streets run (the terrain shader reads both).
      useTownTextures(await loadTownTextures(texPool));
      useTownGround(town.x0, town.z0, town.nx, town.nz, TOWN_RASTER, (i, j) => town.groundAt(town.x0 + (i + 0.5) * TOWN_RASTER, town.z0 + (j + 0.5) * TOWN_RASTER));
    }
    texPool.dispose();

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
    const hero = await HeroView.create(seed);
    player.walker.height = hero.height;
    player.hero = hero;
    // The townsfolk: their lives (the world simulation) and the nearest of them drawn.
    const life = town ? new TownLife(town.plan, seed, hours()) : null;
    // The VGM's orders to the town (logged; a save replays them).
    let log = opened.log;
    if (life && town) for (const o of ordersOf(log, town.decision.id)) life.order(o);
    const orderTown = (o: TownOrder): void => {
      if (!life || !town) return;
      const d = townOrder(log, town.decision.id, o);
      log = [...log, d];
      life.order(o);
    };
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
    loading.set('Preparing shaders');
    await view.stage.warmUp([...(grass ? [grass.group] : []), hero.object, wx.precip, ...(folk ? await folk.warmObjects() : [])]);
    // While the loading screen (or the title's painted still) still covers the view, the land, trees and
    // townsfolk compile at full speed (docs/SHADERS.md rule 5); the cap's share comes back once the world shows.
    const capShare = view.stage.cap.share;
    view.stage.cap.share = 1;
    view.stage.monitor.phase = 'warmup';
    const shown = () => { view.stage.cap.share = capShare; view.stage.monitor.phase = 'run'; };
    loading.set('Raising the land');
    const terrainJobs = new TerrainJobs(createTerrainPool(), seed, setting.id);
    const ground = new TerrainView(view.stage, terrainJobs, (x, z) => terrain.height(x, z));
    const rock = new VolumeView(view.stage, terrainJobs).raise();
    const houses = town && params.town ? new TownView(view.stage, terrainJobs) : null;
    const raised = houses?.build(0, view.camera.position);
    await ground.ready(view.camera);
    await rock;
    await raised;
    await view.stage.add(view.sky.dome);
    await view.stage.add(sea.mesh);
    if (grass) await view.stage.add(grass.group);
    await view.stage.add(hero.object);
    await view.stage.add(wx.precip);

    const notes = new Notes();
    // The first promise: the cellar under a house of the town (outlined now; it is small).
    const promise = firstDungeon(opened.log);
    const house = promise ? houseOf(promise, terrain.towns) : null;
    if (promise && house) {
      const cellar = outlineCellar(promise, house, setting.dungeons.cellar);
      // Its own space, deep under the house.
      const cellarView = new CellarView(cellar, { x: house.cx, y: -400, z: house.cz });
      await cellarView.add(view.stage);
      visit = new CellarVisit(cellar, house, cellarView, player, view.lantern, view.sky, notes);
      if (params.cellar) {
        await visit.enter(true, params.cellarRoom);
        if (params.look) ({ yaw: player.heroCam.yaw, pitch: player.heroCam.pitch } = lookFromDegrees(params.look[0], params.look[1] ?? -10));
        player.walker.yaw = player.heroCam.yaw;
      }
    }

    // Every door of the town opens on its room; the cellar's house has the hatch down.
    const down = new Map<number, (before: () => void) => Promise<void>>();
    if (visit && house) {
      const v = visit;
      down.set(house.id, (before) => v.enter(false, undefined, before));
    }
    if (town) rooms = new InteriorVisit(town.plan.buildings, down, new InteriorView(view.stage), player, view.lantern, view.sky, notes);
    if (visit && rooms && house) {
      const r = rooms;
      visit.up = () => r.enter(house, true, true);
    }
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
    const planting = Promise.all([trees, folk?.warmLods().then(took('townsfolk'))]).then(() => { planted = true; });
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
    const journal = new Journal(save?.journal);
    const keys = { paused, get bindings() { return settings.current.bindings; } };
    const townWords = town && life ? townTalk(seed, setting, town, life.agents.map((a) => a.person), opened.log, save?.talk ?? undefined).talk : null;
    const talk = town && life && townWords ? new TalkUi(townWords, setting.talk, journal, life, town.plan, player, {
      paused,
      get bindings() { return settings.current.bindings; },
      get away() { return player.flying || !!visit?.inside; },
      heard: (lead) => notes.say(`${lead.note} (Journal: ${settings.current.bindings.journal[0].replace(/^Key/, '')})`, 6),
    }) : null;
    const journalUi = new JournalUi(journal, keys);
    const map = town ? new MapUi(town.plan, journal, {
      paused,
      get bindings() { return settings.current.bindings; },
      height: (x, z) => terrain.height(x, z),
      water: (x, z) => sea.waterAt(x, z)?.depth ?? 0,
      get hero() {
        // Down in the cellar: at its house.
        const h = visit?.inside ? visit.houseDoor : null, w = player.walker;
        return h ? { x: h[0], z: h[1], yaw: h[2] } : { x: w.pos.x, z: w.pos.z, yaw: w.yaw };
      },
    }) : null;
    if (talk && life && town && params.talk) {
      // Straight into a talk: in front of the innkeeper or of the cellar's household.
      const pick = params.talk === 'house'
        ? life.agents.find((a) => a.person.home === firstDungeon(opened.log)?.building && a.person.role !== 'child')
        : life.agents.find((a) => town.plan.buildings[a.person.home].kind === 'inn' && a.person.role === 'trade');
      if (pick) {
        const yaw = pick.dir;
        player.teleport(pick.x + Math.cos(yaw) * 1.6, undefined, pick.z + Math.sin(yaw) * 1.6, Math.atan2(Math.cos(yaw), Math.sin(yaw)));
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
      capture: () => {
        // In a room: saved as standing at its door outside (rooms are built when entered).
        const w = rooms?.outside ?? player.walker.pos;
        const data: SaveData = {
          version: SAVE_VERSION, game: release.version, setting: { id: setting.id, version: setting.version }, seed: seedText, log: opened.log,
          clock: { day: view.sky.day, hour: view.sky.hour },
          hero: { x: w.x, y: w.y, z: w.z, yaw: rooms?.outside?.yaw ?? player.walker.yaw, below: !!visit?.inside },
          cellars: visit && promise ? { [promise.id]: visit.diff } : {},
          talk: townWords?.save() ?? null,
          journal: journal.entries(),
        };
        return { data, where: visit?.inside ? `in ${visit.cellar.house}'s cellar` : 'in the town' };
      },
    };
    const saves = new SavesUi(savesHost);
    const autosave = () => void saveNow(savesHost, AUTOSAVE);
    if (visit) visit.onSwap = autosave;
    setInterval(autosave, 5 * 60 * 1000);
    if (save) {
      // Lay the save over the fresh world: the cellar's changes, then the hero where they were.
      const d = promise ? save.cellars[promise.id] : undefined;
      if (visit && d) visit.restore(d);
      const h = save.hero;
      if (h.below && visit) await visit.enter(true);
      player.teleport(h.x, h.below ? h.y : undefined, h.z, h.yaw);
      notes.say(`Loaded: ${save.journal.length ? `${save.journal.filter((l) => !l.done).length} open lead(s) in your journal` : 'your game'}.`);
    } else if (typeof loaded === 'string') notes.say(`Could not load the save: ${loaded}.`, 8);
    if (params.open) { talk?.close(); if (params.open === 'journal') journalUi.setOpen(true); else if (params.open === 'saves') saves.setOpen(true); else map?.setOpen(true); }
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
      game: { player, view, terrain, sea, flora, grass, ground, settings, params, home, weather, wx, get cellar() { return visit; }, title, sound, life },
    });
    b.menus.menu = new Menu(settings, {
      paused,
      get hour() { return view.sky.hour; },
      set hour(h) { view.sky.hour = h; },
    });
    saves.dock();
    // F flies (the key is in the settings).
    onKeyDown((e) => {
      if (!e.repeat && open === 0 && settings.current.bindings.fly.includes(e.code)) player.flying = !player.flying;
    });
    let last = performance.now();
    view.renderer.setAnimationLoop(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
      title?.run(dt);
      if (title?.holding) player.standBy(dt);
      else player.update(dt);
      if (!rooms?.inside) visit?.update(dt);
      if (!visit?.inside) rooms?.update(dt);
      talk?.watch();
      notes.update(dt);
      view.sky.underwater = sea.submerged(view.camera.position);
      wx.apply(dt, view.camera.position, hours(), view.sky);
      view.sky.update(dt, view.camera);
      sea.update(dt, view.camera.position, view.sky.light, view.sky.gain);
      ground.update(view.camera);
      houses?.update(view.camera.position);
      if (life) {
        life.focus = { x: view.camera.position.x, z: view.camera.position.z };
        life.step(dt, hours(), { rain: wx.shown.rain });
      }
      if (folk) folk.indoors = life && rooms?.inside ? rooms.people(life) : null;
      folk?.follow(dt, view.camera);
      if (boot.trees) flora.update(dt, view.camera);
      grass?.tend(dt, view.camera);
      view.stage.frame();
      view.renderer.render(view.scene, view.camera);
      if (hud && showHud) {
        const p = view.camera.position, t = ground.stats;
        hud.textContent = `${view.backend} · ${(now - last).toFixed(1)} ms · ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)} · chunks ${t.shown} (+${t.building})${grass ? ` · ${grass.stats}` : ''}${folk ? ` · ${folk.hudText}` : ''}\n${wx.summary}\n${view.stage.hudLine()}${visit?.inside ? `\n${visit.summary}` : ''}${rooms?.inside ? `\n${rooms.summary}` : ''}`;
      }
      last = now;
      if (landed && title && !title.live && !title.calm) { title.landReady(); shown(); }
      if (planted && !window.__mwReady) {
        window.__mwReady = true;
        shown();
        if (title) title.ready();
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

