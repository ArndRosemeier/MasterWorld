/**
 * Sky, sun, moon, fog and the environment light, driven by the time of day (@futuremagic/sky, from
 * Scale). The sun casts one shadow map that follows the camera. Everything that changes any shader's key
 * (the environment map, shadows, fog type) is set up in the constructor, before the warm-up.
 */
import { BoxGeometry, FogExp2, Mesh, PMREMGenerator, Scene, type DirectionalLight, type HemisphereLight, type OrthographicCamera, type PerspectiveCamera, type RenderTarget, type WebGPURenderer } from 'three/webgpu';
import { CLEAR, moonAt, skyLight, skyPath, type SkyLight, type SkyWeather, type Vec3 } from '@futuremagic/sky';
import { SKY, makeEnvSky, skyUniforms, type SkyUniforms } from './materials';

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
  private readonly fog: FogExp2;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly scene: Scene,
    private readonly sun: DirectionalLight,
    private readonly hemi: HemisphereLight,
    opts: { hour: number; dayMinutes: number },
  ) {
    this.hour = opts.hour;
    this.dayMinutes = opts.dayMinutes;
    const mat = SKY.make();
    this.dome = new Mesh(new BoxGeometry(1, 1, 1), mat);
    this.dome.name = 'sky';
    this.dome.scale.setScalar(100000);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.U = skyUniforms(mat);
    scene.background = null;
    this.fog = new FogExp2(0xbfd0e0, 0.00004);
    scene.fog = this.fog;

    this.envSky = makeEnvSky();
    this.envSky.name = 'env sky';
    this.envSky.scale.setScalar(1000);
    this.envU = skyUniforms(this.envSky.material as never);
    this.envScene.add(this.envSky);
    this.pmrem = new PMREMGenerator(renderer);
    // An environment map from the start: it is part of every lit shader's key. Later refreshes (the first in
    // `update`, once the sky's uniforms are set) render into the same target, so no shader is built again.
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
    scene.environment = this.envRT.texture;

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

    this.sun.color.setRGB(...L.lightColor);
    this.sun.intensity = L.lightIntensity * LIGHT;
    this.hemi.color.setRGB(...L.skyColor);
    this.hemi.groundColor.setRGB(...L.groundColor);
    this.hemi.intensity = L.hemiIntensity * LIGHT * 0.7;
    this.fog.color.setRGB(...L.fogColor);
    this.fog.density = L.fogDensity * FOG_SCALE;
    this.dome.visible = !this.underwater;
    this.scene.background = this.underwater ? this.fog.color : null;
    if (this.underwater) {
      // Light fades fast with depth of view under water; blue-green, dimmer at night.
      const k = 0.15 + 0.85 * L.day;
      this.fog.color.setRGB(0.03 * k, 0.17 * k, 0.19 * k);
      this.fog.density = 0.022;
    }
    this.scene.environmentIntensity = L.envIntensity * ENV;
    this.renderer.toneMappingExposure = L.exposure * EXPOSURE;

    // The shadow box follows the camera, snapped to texels so edges do not shimmer.
    const focus = camera?.position ?? { x: 0, y: 0, z: 0 };
    const texel = (SHADOW_EXTENT * 2) / SHADOW_MAP;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    const d = L.lightDir, r = SHADOW_EXTENT * 6;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + d[0] * r, focus.y + d[1] * r, fz + d[2] * r);
    this.sun.target.updateMatrixWorld();
    if (camera) this.dome.position.copy(camera.position);

    // The environment map when the sun moved noticeably.
    const l = this.lastEnvSun;
    if (Math.hypot(l[0] - sun[0], l[1] - sun[1], l[2] - sun[2]) > 0.02) {
      l[0] = sun[0]; l[1] = sun[1]; l[2] = sun[2];
      this.pmrem.fromScene(this.envScene, 0, 1, 2000, { renderTarget: this.envRT } as never);
    }
  }
}

