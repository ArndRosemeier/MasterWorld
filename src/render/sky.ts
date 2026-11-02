/**
 * Sky, sun, moon, fog and the environment light, driven by the time of day and the weather
 * (@futuremagic/sky, from Scale; the weather itself comes from WeatherView). The sun casts one shadow map that follows the camera. Everything that changes any shader's key
 * (the environment map, shadows, fog type) is set up in the constructor, before the warm-up.
 */
import { BoxGeometry, Color, Mesh, type Sprite, PMREMGenerator, Scene, Vector3, type DirectionalLight, type HemisphereLight, type OrthographicCamera, type PerspectiveCamera, type RenderTarget, type WebGPURenderer } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { ORIGIN, WORLD } from './origin';
import { CLEAR, moonAt, skyLight, skyPath, starField, type SkyLight, type SkyWeather, type Vec3 } from '@futuremagic/sky';
import { MOON_RADIUS, cloudShadow, makeStarsNode } from '@futuremagic/sky/node';
import { smoothstep } from '@futuremagic/core';
import { GRADE, gradeAt, type GradeKey } from '@futuremagic/stage';
import { SKY, makeEnvSky, skyUniforms, type SkyUniforms } from './materials';
import { HorizonShadow } from './horizonShadow';
import { WINDOWS } from './materials/building';
import { ENV_SATURATION, FOG, fogNode } from './materials/weather';

/** Half the side of the sun's shadow box around the camera, metres. */
const SHADOW_EXTENT = 160;
const SHADOW_MAP = 4096;
/** Metres the shadow box may move between two draws of the map before it is drawn at once (a teleport). */
const SHADOW_JUMP = 4;
/**
 * The layer of what is drawn into the sun's shadow map but not into the view (three draws an object for a camera that
 * shares a layer with it; the shadow camera takes this one and the view's): casters out of view whose shadows may
 * fall into it (FolkView). Not the Stage's warm-up layer (7).
 */
export const SHADOW_ONLY = 6;
/**
 * Scale's rig is tuned for its bright city materials; the land is darker (physical albedos), so the lights
 * are stronger here, while the exposure (and so the sky) stays Scale's.
 */
const EXPOSURE = 1.15;
/** In a building: the sky's light on the people there, and the eye's adaptation to the room (exposure). */
const SHELTER_SKY = 0.45;
const SHELTER_EXPOSURE = 1.7;
/** Indoors the lamp lights the room at night as by day: the eye does not open up to the dark outside
 *  (night exposure is about 3x the day's, which blew the lamp's wall out to white). */
const SHELTER_EXPOSURE_CAP = 0.8;
const LIGHT = 3.4;
/** The environment (sky) light on the land and in the water's reflections. */
export const ENV = 2.4;
/**
 * The env map below the horizon, as a share of the horizon: the ground gives back about a fifth of the sky
 * (the rest of its bounce is the hemisphere light). At 1 everything was lit from below as from the sky, and
 * under clouds a head or a hood showed no shaded side at all.
 */
const ENV_GROUND = 0.25;
/** The world is large: fog thinner than Scale's city. */
const FOG_SCALE = 0.28;
/** How much of the low sun's dimming by the air the eye adapts away (0 none, 1 all). */
const SUN_ADAPT = 0.6;
/** Metres up to the clouds: they pass overhead as you travel, and their shadows fall where they are. */
const CLOUD_HEIGHT = 1500;
/** The star field's seed (the same sky over every world). */
const STAR_SEED = 1771;


/**
 * The sky's light falls with the sun about as fast as the sun's own (Preetham), so a low sun would leave
 * the shade nearly black; real skies keep more (the share of diffuse light rises as the sun sinks). The
 * env map's strength is raised by the square root of how much its irradiance fell from midday, at most
 * 3x. Irradiance of the sky (luminance, up-facing) by sun height, integrated from the sky shader offline.
 */
const SKY_E: [number, number][] = [[0, 0.079], [0.03, 0.221], [0.06, 0.428], [0.1, 0.78], [0.15, 1.287], [0.2, 1.797], [0.3, 2.643], [0.4, 3.239], [0.5, 3.757], [0.6, 4.374], [0.7, 5.175]];
export function lowSunSky(sunUp: number): number {
  const up = Math.min(Math.max(sunUp, 0), 0.7);
  let i = 1;
  while (i < SKY_E.length - 1 && SKY_E[i][0] < up) i++;
  const [a, ea] = SKY_E[i - 1], [b, eb] = SKY_E[i];
  const e = ea + ((eb - ea) * (up - a)) / (b - a);
  return Math.min(3, Math.sqrt(SKY_E[SKY_E.length - 1][1] / e));
}

/** How fast the eye adapts to a change of light (per second: about a second from a cave out into the day). */
const ADAPT = 3;

/** The light set for one view (SkyView.shade). */
interface SkyShade {
  readonly sun: number; readonly sunLight: Color; readonly hemi: Color; readonly ground: Color; readonly fill: number; readonly env: number;
  readonly dome: boolean; readonly stars: number; readonly fog: Color; readonly density: number; readonly mist: number; readonly flat: number;
  readonly fogBack: boolean; readonly windows: number;
}

/** In a natural cave: the faint fill of the day's light through its cracks, and the darkness's density (a cellar's 0.06). */
const CAVE_FILL = 0.16;
const CAVE_FOG = 0.022;
/** Under a place's water (no day in it): its murk and fog, and how thick the fog is per metre. */
const UNDER_DARK: readonly [number, number, number] = [0.008, 0.035, 0.04], UNDER_DARK_FOG = 0.12;

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
  /** The sea's murk under water now (the light of the day in it). */
  readonly murk = new Color();
  /** The star field (its opacity follows the night and the cloud cover). */
  private readonly stars: Sprite;
  /** Below ground (a cellar, a dungeon): no sun or sky, a faint warm fill, darkness closing in. */
  indoors = false;
  /**
   * Below ground in a natural cave (with `indoors`): its caverns are tens of metres high, so the darkness
   * closes in further off, and a faint cool light from cracks to the day above lies on the rock.
   */
  cave = false;
  /**
   * In a building above ground (drawn open in its place): the sun and sky go on, through its windows and
   * door; the eye adapts to the room over a moment and less of the sky's light falls on the people in it.
   */
  sheltered = false;
  private shelter = 0;
  /**
   * Where the camera is, when not where the hero is (a cave's portal: the camera trails behind, still on the
   * land while the hero is in the throat below, or the other way round): the eye adapts to its light.
   */
  eye: { readonly dark: number } | null = null;
  /** Where the sun's shadow box is centred instead of the camera (from a cave, the land beyond its portal). */
  shadowFocus: { readonly x: number; readonly y: number; readonly z: number } | null = null;
  /** The eye's exposure, eased (from a dark cave out into the day, and back in, the eye adapts over a moment). */
  private seen = -1;
  /** The open sky's light of this frame (before a below-ground light replaced it), for a portal's view out. */
  private open: SkyShade | null = null;
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
  /**
   * The sun's shadow map is drawn every this many frames (and at once after a jump): drawing it took about 7 ms of
   * a town frame on the reference machine (every caster drawn again). A shadow a frame or two late does not show.
   * Every third frame: about 1.5-2 ms off a town frame at dusk and in rain against every second (gate G); at 90 fps
   * a running hero's shadow is then at most 0.1 m behind.
   */
  shadowEvery = 3;
  private shadowFrame = 0;
  private readonly shadowAt = { x: Infinity, z: Infinity };
  private shadowSteps = -1;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly scene: Scene,
    private readonly sun: DirectionalLight,
    private readonly hemi: HemisphereLight,
    opts: { hour: number; dayMinutes: number; exposure?: number; envGround?: number },
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
    // The stars: a seeded field on a dome inside the sky box, faded in at night (and hidden behind the moon).
    const field = starField(STAR_SEED);
    this.stars = makeStarsNode(field.position, field.color, 2, this.U.moonDir, Math.cos(MOON_RADIUS * 1.15));
    this.stars.name = 'stars';
    this.stars.renderOrder = -999;
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.envSky = makeEnvSky();
    this.envSky.name = 'env sky';
    this.envSky.scale.setScalar(1000);
    this.envU = skyUniforms(this.envSky.material as never);
    this.envU.envSaturation.value = ENV_SATURATION;
    // The hemisphere light throws the ground's bounce up: the env map below the horizon is only a little of it.
    this.envU.envGround.value = opts.envGround ?? ENV_GROUND;
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
    (sun as unknown as { colorNode: unknown }).colorNode = this.sunLight.mul(cloudShadow(this.U, WORLD, this.lightDir)).mul(this.horizon.shade(WORLD));

    sun.castShadow = true;
    sun.shadow.autoUpdate = false; // drawn when `update` says (shadowEvery)
    sun.shadow.camera.layers.enable(SHADOW_ONLY);
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    sun.shadow.bias = -0.0004;
    const sc = sun.shadow.camera as OrthographicCamera;
    sc.left = -SHADOW_EXTENT; sc.right = SHADOW_EXTENT; sc.top = SHADOW_EXTENT; sc.bottom = -SHADOW_EXTENT;
    sc.near = 1; sc.far = SHADOW_EXTENT * 12;
    sc.updateProjectionMatrix();
    sun.shadow.normalBias = 0.02 * SHADOW_EXTENT / 60;
    this.update(0, null);
  }

  /** Below ground's light (no sun or sky, a faint fill, darkness closing in): a cellar's, or a natural cave's. */
  private below(cave: boolean): void {
    this.sun.intensity = 0;
    this.sunLight.value.setRGB(0, 0, 0);
    WINDOWS.glow.value = 0;
    if (cave) {
      // As much from below as from above, warm: a fill from above lit the floors four times the walls' light, and the
      // eye, opened to the dark, saw them pale grey-lilac (a dark brown floor came out beige; gate P shots). The cave's
      // light comes off its own rock, all round.
      this.hemi.color.setRGB(0.27, 0.25, 0.22);
      this.hemi.groundColor.setRGB(0.24, 0.21, 0.17);
      this.hemi.intensity = CAVE_FILL;
    } else {
      this.hemi.color.setRGB(0.55, 0.42, 0.3);
      this.hemi.groundColor.setRGB(0.12, 0.09, 0.07);
      this.hemi.intensity = 0.05;
    }
    this.scene.environmentIntensity = 0.01;
    this.dome.visible = false;
    (this.stars.material as { opacity: number }).opacity = 0;
    const fog = FOG.color.value;
    fog.setRGB(0.008, 0.006, 0.005);
    FOG.density.value = cave ? CAVE_FOG : 0.06;
    if (this.underwater) {
      // Under a place's water (a sea cave's drowned storey): no day's light in it, only the lantern's. Its murk is
      // dark, so what the lantern lights is seen a few metres off and the rest goes into the dark water.
      this.murk.setRGB(...UNDER_DARK);
      fog.setRGB(...UNDER_DARK);
      FOG.density.value = UNDER_DARK_FOG;
    }
    FOG.mist.value = 0;
    FOG.flat.value = 1;
    this.scene.background = fog;
  }

  /** The light as it is set now (all but the exposure, which the whole frame shares). */
  private held(): SkyShade {
    const stars = this.stars.material as { opacity: number };
    return {
      sun: this.sun.intensity, sunLight: this.sunLight.value.clone(), hemi: this.hemi.color.clone(), ground: this.hemi.groundColor.clone(), fill: this.hemi.intensity,
      env: this.scene.environmentIntensity, dome: this.dome.visible, stars: stars.opacity, fog: FOG.color.value.clone(), density: FOG.density.value, mist: FOG.mist.value,
      flat: FOG.flat.value, fogBack: this.scene.background === FOG.color.value, windows: WINDOWS.glow.value,
    };
  }

  private put(h: SkyShade): void {
    this.sun.intensity = h.sun; this.sunLight.value.copy(h.sunLight); this.hemi.color.copy(h.hemi); this.hemi.groundColor.copy(h.ground); this.hemi.intensity = h.fill;
    this.scene.environmentIntensity = h.env; this.dome.visible = h.dome; (this.stars.material as { opacity: number }).opacity = h.stars;
    FOG.color.value.copy(h.fog); FOG.density.value = h.density; FOG.mist.value = h.mist; FOG.flat.value = h.flat;
    this.scene.background = h.fogBack ? FOG.color.value : null; WINDOWS.glow.value = h.windows;
  }

  /**
   * For one view (a portal's, into another realm): the open sky's light, or below ground's (a cave's when `cave`),
   * at once; returns what puts this frame's light back. The exposure stays the frame's (the eye's).
   */
  shade(where: 'open' | 'below' | 'cave'): () => void {
    const was = this.held();
    if (where === 'open') { if (this.open) this.put(this.open); } else this.below(where === 'cave');
    return () => this.put(was);
  }

  /** The sky's environment map (reflections). */
  get envTexture() { return this.envRT.texture; }

  /** Toward the sun (or the moon at night), as lit last frame. */
  get lightDirection(): Vector3 { return this.lightDir.value; }
  /** The sun's light as it falls outside: its colour times its strength (the moon's at night: check `sunDir` for that). */
  get sunColor(): Color { return this.sunLight.value; }

  /** The hills' shadows beyond the shadow map: main feeds it the camera and the terrain workers. */
  readonly horizon = new HorizonShadow();

  /** How many times faster than its day length the clock runs now (aboard at sea: world/fleet.ts seaPace). */
  pace = 1;

  /** The setting's colour key over the day (empty: the grade stays as the view set it). */
  look: readonly GradeKey[] = [];

  /** Once per frame. `camera` null: only the light (the constructor). */
  update(dt: number, camera: PerspectiveCamera | null): void {
    if (this.dayMinutes > 0) {
      this.hour += (dt / 60 / this.dayMinutes) * 24 * this.pace;
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
    this.envU.moonDir.value.set(...moon.dir);
    // The light is the hero's realm's (a portal's view into the other sets its own: `shade`); the eye's exposure is the camera's.
    const dark = this.eye ? this.eye.dark : this.indoors ? 1 : 0, indoors = dark >= 0.5;
    (this.stars.material as { opacity: number }).opacity = this.indoors || this.underwater ? 0 : L.stars;
    this.U.time.value = this.time;
    this.U.flash.value = this.flash;
    this.U.flashDir.value.set(Math.cos(this.flashBearing) * 0.8, 0.5, Math.sin(this.flashBearing) * 0.8);

    this.sun.color.setRGB(...L.lightColor);
    // The air dims the low sun a lot; the eye adapts, so only part of that dimming shows (the colour stays).
    const c = L.lightColor, lum = Math.max(0.05, 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
    this.sun.intensity = L.lightIntensity * LIGHT * Math.min(lum ** -SUN_ADAPT, 2.5);
    // The hemisphere light is only the light thrown back by the sunlit ground (from below); the sky's own
    // light comes from the environment map. Lightning lights the land from the whole sky for a moment.
    const f = this.flash * 0.84;
    // From dusk on, the dim sky is most of the light: without this, the shade under the moon is black.
    const dusk = (1 - L.day) * (1 - 0.5 * L.overcast);
    this.hemi.color.setRGB(0.75 * f + 0.05 * dusk, 0.8 * f + 0.06 * dusk, f + 0.09 * dusk);
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
    // The sea's murk: blue-green, dimmer at night (the underwater fog, and the veil's colour: render/underwater.ts).
    const k = 0.15 + 0.85 * L.day;
    this.murk.setRGB(0.03 * k, 0.17 * k, 0.19 * k);
    if (this.underwater) {
      // Light fades fast with depth of view under water.
      fog.copy(this.murk);
      FOG.density.value = 0.04;
      FOG.mist.value = 0;
      FOG.flat.value = 1;
    }
    this.scene.environmentIntensity = L.envIntensity * ENV * lowSunSky(sun[1]);
    // Windows light up from dusk; most rooms in the evening, few after midnight, some before dawn.
    WINDOWS.glow.value = 1 - smoothstep(-0.1, 0.06, sun[1]);
    const hr = this.hour;
    WINDOWS.share.value = hr >= 12 ? 0.7 - 0.25 * smoothstep(21.5, 24, hr) : 0.45 - 0.33 * smoothstep(0, 1.5, hr) + 0.2 * smoothstep(4.5, 6, hr);
    this.renderer.toneMappingExposure = L.exposure * this.exposure;
    if (this.look.length) {
      // Indoors the lamps set the colour: the day key (neutral).
      // In a building's room the same, as far as one is in (its lamp, not the night outside).
      const g = gradeAt(this.look, indoors ? 1 : sun[1] + (1 - sun[1]) * this.shelter);
      GRADE.slope.value.set(...g.slope);
      GRADE.saturation.value = g.saturation;
    }
    this.shelter += ((this.sheltered ? 1 : 0) - this.shelter) * Math.min(1, dt * 2.5);
    if (this.shelter > 1e-3 && !indoors) {
      const k = this.shelter, dim = 1 - k * (1 - SHELTER_SKY);
      this.scene.environmentIntensity *= dim;
      this.hemi.intensity *= dim;
      const room = Math.min(L.exposure, SHELTER_EXPOSURE_CAP) * this.exposure * SHELTER_EXPOSURE;
      this.renderer.toneMappingExposure += (room - this.renderer.toneMappingExposure) * k;
    }
    this.sunLight.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
    this.open = this.held();
    if (this.indoors) this.below(this.cave);
    if (dark > 0) this.renderer.toneMappingExposure += (1.4 * this.exposure / EXPOSURE - this.renderer.toneMappingExposure) * dark;
    // The eye adapts over a moment when the light changes much (out of a cave into the day); at once on the first frame.
    const want = this.renderer.toneMappingExposure;
    this.seen = this.seen < 0 || dt === 0 ? want : this.seen + (want - this.seen) * Math.min(1, dt * ADAPT);
    this.renderer.toneMappingExposure = this.seen;
    this.lightDir.value.set(...L.lightDir);

    // The shadow box follows the camera, snapped to texels so edges do not shimmer.
    const focus = this.shadowFocus ?? camera?.position ?? { x: 0, y: 0, z: 0 };
    const texel = (SHADOW_EXTENT * 2) / SHADOW_MAP;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    const d = L.lightDir, r = SHADOW_EXTENT * 6;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + d[0] * r, focus.y + d[1] * r, fz + d[2] * r);
    this.sun.target.updateMatrixWorld();
    if (camera) { this.dome.position.copy(camera.position); this.stars.position.copy(camera.position); }
    // The map keeps the box it was drawn with (three moves its matrix only when it draws), so a frame between
    // draws still lines up; a jump of the box draws it at once.
    // A step of the floating origin moves the scene under the map's old box: drawn again at once too.
    const jumped = Math.hypot(fx - this.shadowAt.x, fz - this.shadowAt.z) > SHADOW_JUMP || ORIGIN.steps !== this.shadowSteps;
    this.shadowSteps = ORIGIN.steps;
    if (jumped || ++this.shadowFrame >= this.shadowEvery) {
      this.shadowFrame = 0;
      this.shadowAt.x = fx; this.shadowAt.z = fz;
      this.sun.shadow.needsUpdate = true;
    }

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

