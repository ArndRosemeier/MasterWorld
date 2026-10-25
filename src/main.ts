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
import { createView } from './render/view';
import { TerrainView } from './render/terrain/TerrainView';
import { VolumeView } from './render/terrain/VolumeView';
import { TerrainJobs, WorldJobs, createTerrainPool, createTexturePool, createWorldPool } from './workers/pool';
import { WaterView } from './render/water/WaterView';
import { FloraView } from './render/flora/FloraView';
import { GrassView } from './render/grass/GrassView';
import { useWaterEnvironment } from './render/materials/water';
import { loadGroundTextures } from './render/terrain/groundTextures';
import { useGroundTextures } from './render/materials';
import { settingById } from './setting/index';
import { validateSetting } from './setting/contract';
import { Terrain } from './world/terrain';
import { findStart } from './world/start';
import { WEATHER_KINDS, Weather, type WeatherKind } from './world/weather';
import { WeatherView } from './render/weather/WeatherView';
import { onKeyDown } from './input/keys';

declare global {
  interface Window {
    /** Set when the first frame after loading is drawn (the screenshot tool waits for it). */
    __mwReady?: boolean;
  }
}

async function start(): Promise<void> {
  const loading = new LoadingScreen();
  const canvas = document.createElement('canvas');
  document.body.prepend(canvas);
  const settings = new SettingsStore();
  const boot = settings.start;
  try {
    const setting = settingById(params.setting);
    const errors = validateSetting(setting);
    if (errors.length) throw new Error(errors.join('; '));
    const seed = parseSeed(params.seed);
    const terrain = new Terrain(seed, setting);
    loading.set('Finding the start');
    const home = findStart(terrain.skeleton, setting);

    const weather = new Weather(seed, setting.world.weather, (x, z) => terrain.skeleton.sample(x, z));
    if (params.weather) {
      if (!WEATHER_KINDS.includes(params.weather as WeatherKind)) throw new Error(`?weather=${params.weather}: one of ${WEATHER_KINDS.join(', ')}`);
      // The same path the VGM takes: an order, here for all time.
      weather.order({ kind: params.weather as WeatherKind, from: -1e6, to: 1e6 });
    }

    loading.set('Starting the renderer');
    const view = await createView(canvas, { forceWebGL: boot.webgl, hour: params.hour, dayMinutes: boot.dayMinutes });
    // The hero walks the land; F (or `?fly`) flies the free camera instead.
    let water: WaterView | null = null;
    const world: WalkWorld = {
      height: (x, z) => terrain.height(x, z),
      rockSurface: (x, y, z) => terrain.rockSurface(x, y, z),
      waterLevel: (x, z) => { const w = water?.waterAt(x, z); return w && w.depth > 0 ? w.level : null; },
    };
    const player = new Player(view.camera, canvas, world, params.fly);
    player.goTo(params.pos ?? [home.x, home.z], params.look);

    loading.set('Painting the ground');
    const texPool = createTexturePool();
    useGroundTextures(await loadGroundTextures(texPool));
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
    loading.set('Dressing the hero');
    const hero = await HeroView.create(seed);
    player.walker.height = hero.height;
    player.hero = hero;
    loading.set('Growing the woods');
    const flora = new FloraView(view.stage, jobs, view.sun);
    if (boot.trees) await flora.placeStart(view.camera.position);
    const grass = boot.grass ? new GrassView(jobs) : null;
    await grass?.sow(view.camera.position);
    sea.update(0, view.camera.position, view.sky.light, view.sky.gain);
    loading.set('Preparing shaders');
    await view.stage.warmUp([...(grass ? [grass.group] : []), hero.object, wx.precip]);
    loading.set('Raising the land');
    const terrainJobs = new TerrainJobs(createTerrainPool(), seed, setting.id);
    const ground = new TerrainView(view.stage, terrainJobs, (x, z) => terrain.height(x, z));
    const rock = new VolumeView(view.stage, terrainJobs).raise();
    await ground.ready(view.camera);
    await rock;
    await view.stage.add(view.sky.dome);
    await view.stage.add(sea.mesh);
    if (grass) await view.stage.add(grass.group);
    await view.stage.add(hero.object);
    await view.stage.add(wx.precip);

    // The trees' shaders are built in the Stage's frame slots, so the loop must run meanwhile; loading ends
    // once they stand.
    loading.set('Planting the trees');
    let planted = false;
    const planting = (boot.trees ? flora.plant() : Promise.resolve()).then(() => { planted = true; });
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
      if (params.dayMinutes === null) view.sky.dayMinutes = s.dayMinutes;
      showHud = params.hud || s.hud;
      if (hud) hud.style.display = showHud ? '' : 'none';
    });
    // Dialogs: the debug menu first, so its keys come before the settings' Escape.
    let open = 0;
    const paused = (on: boolean) => { open = Math.max(0, open + (on ? 1 : -1)); player.pause(open > 0); };
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
      get viewParams() { return player.viewParams; },
      places: placesFor(params.seed, home),
      game: { player, view, terrain, sea, flora, grass, ground, settings, params, home, weather, wx },
    });
    new Menu(settings, {
      paused,
      get hour() { return view.sky.hour; },
      set hour(h) { view.sky.hour = h; },
    });
    // F flies (the key is in the settings).
    onKeyDown((e) => {
      if (!e.repeat && open === 0 && settings.current.bindings.fly.includes(e.code)) player.flying = !player.flying;
    });
    let last = performance.now();
    view.renderer.setAnimationLoop(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
      player.update(dt);
      view.sky.underwater = sea.submerged(view.camera.position);
      wx.apply(dt, view.camera.position, hours(), view.sky);
      view.sky.update(dt, view.camera);
      sea.update(dt, view.camera.position, view.sky.light, view.sky.gain);
      ground.update(view.camera);
      if (boot.trees) flora.update(dt, view.camera);
      grass?.tend(dt, view.camera);
      view.stage.frame();
      view.renderer.render(view.scene, view.camera);
      if (hud && showHud) {
        const p = view.camera.position, t = ground.stats;
        hud.textContent = `${view.backend} · ${(now - last).toFixed(1)} ms · ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)} · chunks ${t.shown} (+${t.building})${grass ? ` · ${grass.stats}` : ''}\n${wx.summary}\n${view.stage.hudLine()}`;
      }
      last = now;
      if (planted && !window.__mwReady) {
        window.__mwReady = true;
        loading.done();
      }
    });
    await planting;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    loading.fail(err instanceof GraphicsUnavailable ? 'No graphics' : 'Could not start', detail);
    throw err;
  }
}

void start();
