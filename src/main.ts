import { Vector3 } from 'three/webgpu';
import { GraphicsUnavailable } from '@futuremagic/stage';
import { parseSeed } from '@futuremagic/core';
import { LoadingScreen } from './app/loading';
import { params } from './app/params';
import { FlyCamera } from './app/flyCamera';
import { HeroCamera } from './app/heroCamera';
import { lookFromDegrees } from './app/look';
import { Menu } from './app/menu';
import { SettingsStore } from './app/settings';
import { Walker, type WalkWorld } from './game/walker';
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

    loading.set('Starting the renderer');
    const view = await createView(canvas, { forceWebGL: boot.webgl, hour: params.hour, dayMinutes: boot.dayMinutes });
    // The hero walks the land; `?fly` gives the free camera instead.
    let water: WaterView | null = null;
    const world: WalkWorld = {
      height: (x, z) => terrain.height(x, z),
      rockSurface: (x, y, z) => terrain.rockSurface(x, y, z),
      waterLevel: (x, z) => { const w = water?.waterAt(x, z); return w && w.depth > 0 ? w.level : null; },
    };
    const fly = params.fly ? new FlyCamera(view.camera, canvas, world.height) : null;
    const walker = fly ? null : new Walker(world);
    const heroCam = fly ? null : new HeroCamera(view.camera, canvas, world);
    const [px, py, pz] = params.pos ?? [home.x, home.z];
    const head = new Vector3();
    const toHead = (w: Walker) => head.set(w.pos.x, w.pos.y + w.height * 0.92, w.pos.z);
    if (fly) {
      if (!params.pos || params.pos.length === 2) fly.place(px, py, terrain.height(px, py) + 1.7);
      else fly.place(px, pz, py, true);
      if (params.look) fly.setLook(params.look[0], params.look[1] ?? 0);
    } else if (walker && heroCam) {
      if (params.pos?.length === 3) walker.place(px, pz, py);
      else walker.place(px, py);
      if (params.look) ({ yaw: heroCam.yaw, pitch: heroCam.pitch } = lookFromDegrees(params.look[0], params.look[1] ?? -10));
      else heroCam.yaw = walker.yaw;
      walker.yaw = heroCam.yaw;
      heroCam.trail(toHead(walker), 0);
    }

    loading.set('Painting the ground');
    const texPool = createTexturePool();
    useGroundTextures(await loadGroundTextures(texPool));
    texPool.dispose();

    view.sky.update(0, view.camera);
    loading.set('Filling the seas');
    useWaterEnvironment(view.sky.envTexture);
    const jobs = new WorldJobs(createWorldPool(), seed, setting.id);
    const sea = new WaterView(jobs);
    water = sea;
    await sea.prime(view.camera.position);
    // In the water from the start (now that the water is known), and the hero's body built.
    if (walker && heroCam) { walker.place(walker.pos.x, walker.pos.z, walker.pos.y); heroCam.trail(toHead(walker), 0); }
    loading.set('Dressing the hero');
    const hero = walker ? await HeroView.create(seed) : null;
    if (hero && walker) walker.height = hero.height;
    loading.set('Growing the woods');
    const flora = new FloraView(view.stage, jobs);
    if (boot.trees) await flora.placeStart(view.camera.position);
    const grass = boot.grass ? new GrassView(jobs) : null;
    await grass?.sow(view.camera.position);
    sea.update(0, view.camera.position, view.sky.light, view.sky.gain);
    loading.set('Preparing shaders');
    await view.stage.warmUp([...(grass ? [grass.group] : []), ...(hero ? [hero.object] : [])]);
    loading.set('Raising the land');
    const terrainJobs = new TerrainJobs(createTerrainPool(), seed, setting.id);
    const ground = new TerrainView(view.stage, terrainJobs, (x, z) => terrain.height(x, z));
    const rock = new VolumeView(view.stage, terrainJobs).raise();
    await ground.ready(view.camera);
    await rock;
    await view.stage.add(view.sky.dome);
    await view.stage.add(sea.mesh);
    if (grass) await view.stage.add(grass.group);
    if (hero) await view.stage.add(hero.object);
    const heroGround = (x: number, y: number, z: number) => walker?.support(x, z, y) ?? terrain.height(x, z);

    // The trees' shaders are built in the Stage's frame slots, so the loop must run meanwhile; loading ends
    // once they stand.
    loading.set('Planting the trees');
    let planted = false;
    const planting = (boot.trees ? flora.show() : Promise.resolve()).then(() => { planted = true; });
    const hud = document.getElementById('hud');
    // The settings that apply while playing (the URL's day= holds the clock's speed for this session).
    let showHud = params.hud;
    const pixels = view.renderer.getPixelRatio();
    let scale = 1;
    settings.watch((s) => {
      if (heroCam) {
        heroCam.controls.bindings = s.bindings;
        heroCam.mouseSpeed = s.mouseSpeed;
        heroCam.invertMouse = s.invertMouse;
      }
      if (view.camera.fov !== s.fov) { view.camera.fov = s.fov; view.camera.updateProjectionMatrix(); }
      if (scale !== s.renderScale) { scale = s.renderScale; view.renderer.setPixelRatio(pixels * scale); }
      if (params.dayMinutes === null) view.sky.dayMinutes = s.dayMinutes;
      showHud = params.hud || s.hud;
      if (hud) hud.style.display = showHud ? '' : 'none';
    });
    new Menu(settings, {
      paused: (open) => { if (heroCam) heroCam.enabled = !open; },
      get hour() { return view.sky.hour; },
      set hour(h) { view.sky.hour = h; },
    });
    let last = performance.now();
    view.renderer.setAnimationLoop(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
      if (fly) fly.update(dt);
      else if (walker && heroCam && hero) {
        const { intent, facing } = heroCam.intent(dt, walker.yaw);
        walker.yaw = facing;
        walker.step(intent, dt);
        hero.update({ pos: walker.pos, vel: walker.vel, yaw: walker.yaw, gait: walker.gait }, dt, heroGround);
        hero.visible = !heroCam.firstPerson;
        heroCam.trail(toHead(walker), dt);
      }
      view.sky.underwater = sea.submerged(view.camera.position);
      view.sky.update(dt, view.camera);
      sea.update(dt, view.camera.position, view.sky.light, view.sky.gain);
      ground.update(view.camera);
      if (boot.trees) flora.update(dt, view.camera.position);
      grass?.tend(dt, view.camera, 0.5);
      view.stage.frame();
      view.renderer.render(view.scene, view.camera);
      if (hud && showHud) {
        const p = view.camera.position, t = ground.stats;
        hud.textContent = `${view.backend} · ${(now - last).toFixed(1)} ms · ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)} · chunks ${t.shown} (+${t.building})${grass ? ` · ${grass.stats}` : ''}\n${view.stage.hudLine()}`;
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
