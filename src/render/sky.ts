/**
 * Sky, sun, moon, fog and the environment light, driven by the time of day and the weather
 * (@futuremagic/sky, from Scale; the weather itself comes from WeatherView). The sun casts one shadow map that follows the camera. Everything that changes any shader's key
 * (the environment map, shadows, fog type) is set up in the constructor, before the warm-up.
 */
import { BoxGeometry, Color, Mesh, PMREMGenerator, Scene, Vector3, type DirectionalLight, type HemisphereLight, type OrthographicCamera, type PerspectiveCamera, type RenderTarget, type WebGPURenderer } from 'three/webgpu';
import { positionWorld, uniform } from 'three/tsl';
import { CLEAR, moonAt, skyLight, skyPath, type SkyLight, type SkyWeather, type Vec3 } from '@futuremagic/sky';
import { cloudShadow } from '@futuremagic/sky/node';
import { SKY, makeEnvSky, skyUniforms, type SkyUniforms } from './materials';
import { ENV_SATURATION, FOG, fogNode } from './materials/weather';

/** Half the side of the sun's shadow box around the camera, metres. */
const SHADOW_EXTENT = 160;
const SHADOW_MAP = 4096;
/**
 * Scale's rig is tuned for its bright city materials; the land is darker (physical albedos), so the lights
 * are stronger here, while the exposure (and so the sky) stays Scale's.
 */
const EXPOSURE = 1.15;
const LIGHT = 3.4;
/** The environment (sky) light on the land and in the water's reflections. */
export const ENV = 1.6;
/** The world is large: fog thinner than Scale's city. */
const FOG_SCALE = 0.35;
/** Metres up to the clouds: they pass overhead as you travel, and their shadows fall where they are. */
const CLOUD_HEIGHT = 1500;


export class SkyView {
  /** Hours 0..24, and whole days since the start. */
  hour: number;
  day = 0;
  /** Real minutes per game day; 0 stops the clock. */
  dayMinutes: number;
  weather: SkyWeather = { ...CLEAR };
  readonly sunDir: Vec3 = [0, 1, 0];
  /** The light of the last update (the water reads it). */
  light!: SkyLight;
  /** Multiplier on Scale's light rig (see LIGHT). */
  readonly gain = LIGHT;
  /** The camera is under water: fog turns to the water's own colour. */
  underwater = false;
  /** Below ground (a cellar, a dungeon): no sun or sky, a faint warm fill, darkness closing in. */
  indoors = false;
  /** Mist in the low ground 0..1, and the height it lies at (the weather sets both). */
  mist = 0;
  mistBase = 0;
  /** Lightning 0..1 and the bearing it lights the clouds from (radians). */
  flash = 0;
  flashBearing = 0;

  /** The dome; it goes in with `stage.add` after the warm-up has compiled its kind (drawing it before would build it on the spot). */
  readonly dome: Mesh;
  private readonly U: SkyUniforms;
  private readonly envScene = new Scene();
  private readonly envSky: Mesh;
  private readonly envU: SkyUniforms;
  private readonly pmrem: PMREMGenerator;
  private readonly envRT: RenderTarget;
  private readonly lastEnvSun: Vec3 = [0, -2, 0];
  private time = 0;
  /** Exposure on top of the sky's own (the tone curve's gain times ours). */
  private readonly exposure: number;
  /** The sun's (or moon's) colour times its strength, and where it comes from: its colorNode reads them. */
  private readonly sunLight = uniform(new Color());
  private readonly lightDir = uniform(new Vector3(0, 1, 0));
  /** The weather the environment map was last rendered with. */
  private lastEnvWx = '';

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly scene: Scene,
    private readonly sun: DirectionalLight,
    private readonly hemi: HemisphereLight,
    opts: { hour: number; dayMinutes: number; exposure?: number },
  ) {
    this.exposure = EXPOSURE * (opts.exposure ?? 1);
    this.hour = opts.hour;
    this.dayMinutes = opts.dayMinutes;
    const mat = SKY.make();
    this.dome = new Mesh(new BoxGeometry(1, 1, 1), mat);
    this.dome.name = 'sky';
    this.dome.scale.setScalar(100000);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.U = skyUniforms(mat);
    this.U.cloudHeight.value = CLOUD_HEIGHT;
    scene.background = null;

    this.envSky = makeEnvSky();
    this.envSky.name = 'env sky';
    this.envSky.scale.setScalar(1000);
    this.envU = skyUniforms(this.envSky.material as never);
    this.envU.envSaturation.value = ENV_SATURATION;
    this.envScene.add(this.envSky);
    this.pmrem = new PMREMGenerator(renderer);
    // An environment map from the start: it is part of every lit shader's key. Later refreshes (the first in
    // `update`, once the sky's uniforms are set) render into the same target, so no shader is built again.
    // It is the only light from the sky: shade facing the bright horizon or the sun's side of the sky is lighter.
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
    scene.environment = this.envRT.texture;
    // Haze plus height mist in the sky's own colour toward each view (materials/weather.ts), part of every
    // shader's key: set before the warm-up.
    scene.fog = null;
    (scene as unknown as { fogNode: unknown }).fogNode = fogNode(this.envRT.texture);
    // The clouds' shadows on everything the sun lights (three takes a light's colorNode in place of its colour).
    (sun as unknown as { colorNode: unknown }).colorNode = this.sunLight.mul(cloudShadow(this.U, positionWorld, this.lightDir));

    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    sun.shadow.bias = -0.0004;
    const sc = sun.shadow.camera as OrthographicCamera;
    sc.left = -SHADOW_EXTENT; sc.right = SHADOW_EXTENT; sc.top = SHADOW_EXTENT; sc.bottom = -SHADOW_EXTENT;
    sc.near = 1; sc.far = SHADOW_EXTENT * 12;
    sc.updateProjectionMatrix();
    sun.shadow.normalBias = 0.02 * SHADOW_EXTENT / 60;
    this.update(0, null);
  }

  /** The sky's environment map (reflections). */
  get envTexture() { return this.envRT.texture; }

  /** Once per frame. `camera` null: only the light (the constructor). */
  update(dt: number, camera: PerspectiveCamera | null): void {
    if (this.dayMinutes > 0) {
      this.hour += (dt / 60 / this.dayMinutes) * 24;
      if (this.hour >= 24) { this.hour -= 24; this.day++; }
    }
    this.time += dt;
    const sun = skyPath(this.hour, this.sunDir);
    const moon = moonAt(this.hour, this.day * 24 + this.hour, sun);
    const L = skyLight(sun, moon, this.weather);
    this.light = L;
    const wx = this.weather;
    for (const U of [this.U, this.envU]) {
      U.sunPosition.value.set(sun[0], sun[1], sun[2]);
      U.cloudCoverage.value = wx.cover; U.cloudDensity.value = wx.density; U.cloudDark.value = wx.dark;
      U.overcast.value = L.overcast; U.skyFog.value = L.skyFog;
      U.fogCol.value.setRGB(...L.fogColor);
    }
    this.U.moonDir.value.set(...moon.dir);
    this.U.moonSun.value.set(...moon.sunSide);
    this.U.moonBright.value = L.moonBright;
    this.U.time.value = this.time;
    this.U.flash.value = this.flash;
    this.U.flashDir.value.set(Math.cos(this.flashBearing) * 0.8, 0.5, Math.sin(this.flashBearing) * 0.8);

    this.sun.color.setRGB(...L.lightColor);
    this.sun.intensity = L.lightIntensity * LIGHT;
    // The hemisphere light is only the light thrown back by the sunlit ground (from below); the sky's own
    // light comes from the environment map. Lightning lights the land from the whole sky for a moment.
    const f = this.flash * 0.84;
    this.hemi.color.setRGB(0.75 * f, 0.8 * f, f);
    this.hemi.groundColor.setRGB(...L.bounce);
    this.hemi.intensity = LIGHT;
    const fog = FOG.color.value;
    fog.setRGB(...L.fogColor);
    // Thick fog closes in to a few hundred metres (the sky's own rig stops at haze).
    FOG.density.value = L.fogDensity * FOG_SCALE + 0.012 * wx.fog ** 3;
    // Mist: up to ~60 m of sight where it lies thickest.
    FOG.mist.value = this.mist * this.mist * 0.05;
    FOG.mistBase.value = this.mistBase;
    FOG.flat.value = 0;
    this.dome.visible = !this.underwater;
    this.scene.background = this.underwater ? fog : null;
    if (this.underwater) {
      // Light fades fast with depth of view under water; blue-green, dimmer at night.
      const k = 0.15 + 0.85 * L.day;
      fog.setRGB(0.03 * k, 0.17 * k, 0.19 * k);
      FOG.density.value = 0.022;
      FOG.mist.value = 0;
      FOG.flat.value = 1;
    }
    this.scene.environmentIntensity = L.envIntensity * ENV;
    this.renderer.toneMappingExposure = L.exposure * this.exposure;
    if (this.indoors) {
      this.sun.intensity = 0;
      this.hemi.color.setRGB(0.55, 0.42, 0.3);
      this.hemi.groundColor.setRGB(0.12, 0.09, 0.07);
      this.hemi.intensity = 0.05;
      this.scene.environmentIntensity = 0.01;
      this.renderer.toneMappingExposure = 1.4 * this.exposure / EXPOSURE;
      this.dome.visible = false;
      fog.setRGB(0.008, 0.006, 0.005);
      FOG.density.value = 0.06;
      FOG.mist.value = 0;
      FOG.flat.value = 1;
      this.scene.background = fog;
    }

    this.sunLight.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
    this.lightDir.value.set(...L.lightDir);

    // The shadow box follows the camera, snapped to texels so edges do not shimmer.
    const focus = camera?.position ?? { x: 0, y: 0, z: 0 };
    const texel = (SHADOW_EXTENT * 2) / SHADOW_MAP;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    const d = L.lightDir, r = SHADOW_EXTENT * 6;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + d[0] * r, focus.y + d[1] * r, fz + d[2] * r);
    this.sun.target.updateMatrixWorld();
    if (camera) this.dome.position.copy(camera.position);

    // The environment map when the sun moved or the weather changed noticeably.
    const l = this.lastEnvSun;
    const wxKey = [wx.cover, wx.dark, wx.fog, wx.sun].map((v) => Math.round(v * 25)).join();
    if (Math.hypot(l[0] - sun[0], l[1] - sun[1], l[2] - sun[2]) > 0.02 || wxKey !== this.lastEnvWx) {
      l[0] = sun[0]; l[1] = sun[1]; l[2] = sun[2];
      this.lastEnvWx = wxKey;
      this.pmrem.fromScene(this.envScene, 0, 1, 2000, { renderTarget: this.envRT } as never);
    }
  }
}

