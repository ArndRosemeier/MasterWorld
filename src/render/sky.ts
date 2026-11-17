/**
 * Sky, sun, moon, fog and the environment light, driven by the time of day and the weather (the weather itself comes
 * from WeatherView). The light rig is the one both games share (@futuremagic/sky/rig SkyRig: physical albedos, the sky
 * as fill through the environment map, the brighter sky under a low sun, eye adaptation, cloud shadows, the grade over
 * the day); here is MasterWorld's own on top of it: below ground (cellars, caves), rooms, under water, the windows'
 * glow, the fog and mist, the hills' shadows, and the sun's shadow map that follows the camera (its near movers drawn
 * every frame, moverShadow.ts). Everything that changes any shader's key (the environment map, shadows, fog type) is
 * set up in the constructor, before the warm-up.
 */
import { Color, type DirectionalLight, type HemisphereLight, type OrthographicCamera, type PerspectiveCamera, type Scene, type WebGPURenderer } from 'three/webgpu';
import { ORIGIN, WORLD } from './origin';
import { RIG_EXPOSURE, type SkyLight } from '@futuremagic/sky';
import { SkyRig } from '@futuremagic/sky/rig';
import { smoothstep } from '@futuremagic/core';
import { SKY } from './materials';
import { HorizonShadow } from './horizonShadow';
import { WINDOWS } from './materials/building';
import { FOG, fogNode } from './materials/weather';
import { MoverShadow } from './moverShadow';

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
/** In a building: the sky's light on the people there, and the eye's adaptation to the room (exposure). */
const SHELTER_SKY = 0.45;
const SHELTER_EXPOSURE = 1.7;
/** Indoors the lamp lights the room at night as by day: the eye does not open up to the dark outside
 *  (night exposure is about 3x the day's, which blew the lamp's wall out to white). */
const SHELTER_EXPOSURE_CAP = 0.8;
/** The world is large: fog thinner than Scale's city. */
const FOG_SCALE = 0.28;
/** Metres up to the clouds: they pass overhead as you travel, and their shadows fall where they are. */
const CLOUD_HEIGHT = 1500;
/** The star field's seed (the same sky over every world). */
const STAR_SEED = 1771;

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

export class SkyView extends SkyRig {
  /** The camera is under water: fog turns to the water's own colour. */
  underwater = false;
  /** The sea's murk under water now (the light of the day in it). */
  readonly murk = new Color();
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
  /** The open sky's light of this frame (before a below-ground light replaced it), for a portal's view out. */
  private open: SkyShade | null = null;
  /** Mist in the low ground 0..1, and the height it lies at (the weather sets both). */
  mist = 0;
  mistBase = 0;
  /** How dark it is where the eye is this frame (0 open .. 1 below ground). */
  private dark = 0;
  /**
   * The sun's shadow map is drawn every this many frames (and at once after a jump): drawing it took about 7 ms of
   * a town frame on the reference machine (every caster drawn again). A shadow a frame or two late does not show.
   * Every third frame: about 1.5-2 ms off a town frame at dusk and in rain against every second (gate G); at 90 fps
   * a running hero's shadow is then at most 0.1 m behind. That still showed on the hero (a shadow that twitches
   * as they walk, Arnd 2026-11-04): the movers near the camera are drawn into it every frame (MoverShadow).
   */
  shadowEvery = 3;
  /**
   * The sun's shadow node that draws the movers near the camera (the hero, townsfolk, creatures) every frame over a
   * copy of the whole map. WebGPU only (MoverShadow); on WebGL 2 the movers stay in the map, every third frame.
   */
  readonly movers: MoverShadow | null;
  private shadowFrame = 0;
  private readonly shadowAt = { x: Infinity, z: Infinity };
  private shadowSteps = -1;
  /** The hills' shadows beyond the shadow map: main feeds it the camera and the terrain workers. */
  readonly horizon: HorizonShadow;

  constructor(
    renderer: WebGPURenderer,
    scene: Scene,
    sun: DirectionalLight,
    hemi: HemisphereLight,
    opts: { hour: number; dayMinutes: number; exposure?: number; envGround?: number; moverShadow?: boolean },
  ) {
    const horizon = new HorizonShadow();
    super(renderer, scene, sun, hemi, {
      dome: SKY.make(), hour: opts.hour, dayMinutes: opts.dayMinutes, exposure: opts.exposure, envGround: opts.envGround,
      starSeed: STAR_SEED, cloudHeight: CLOUD_HEIGHT, world: WORLD, shade: horizon.shade(WORLD),
    });
    this.horizon = horizon;
    // Haze plus height mist in the sky's own colour toward each view (materials/weather.ts), part of every
    // shader's key: set before the warm-up.
    scene.fog = null;
    (scene as unknown as { fogNode: unknown }).fogNode = fogNode(this.envTexture);

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
    this.movers = opts.moverShadow === false ? null : new MoverShadow(sun);
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

  /** Once per frame. `camera` null: only the light (the constructor). */
  override update(dt: number, camera: PerspectiveCamera | null): void {
    // The light is the hero's realm's (a portal's view into the other sets its own: `shade`); the eye's exposure is the camera's.
    this.dark = this.eye ? this.eye.dark : this.indoors ? 1 : 0;
    // Indoors the lamps set the colour: the day key (neutral). In a building's room the same, as far as one is in
    // (its lamp, not the night outside).
    this.inside = this.dark >= 0.5 ? 1 : this.shelter;
    super.update(dt, camera);
    const L = this.light;

    // The shadow box follows the camera, snapped to texels so edges do not shimmer.
    const focus = this.shadowFocus ?? camera?.position ?? { x: 0, y: 0, z: 0 };
    const texel = (SHADOW_EXTENT * 2) / SHADOW_MAP;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    const d = L.lightDir, r = SHADOW_EXTENT * 6;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + d[0] * r, focus.y + d[1] * r, fz + d[2] * r);
    this.sun.target.updateMatrixWorld();
    // The map keeps the box it was drawn with (three moves its matrix only when it draws), so a frame between
    // draws still lines up; a jump of the box draws it at once.
    // A step of the floating origin moves the scene under the map's old box: drawn again at once too.
    const jumped = Math.hypot(fx - this.shadowAt.x, fz - this.shadowAt.z) > SHADOW_JUMP || ORIGIN.steps !== this.shadowSteps;
    this.shadowSteps = ORIGIN.steps;
    const whole = jumped || ++this.shadowFrame >= this.shadowEvery;
    if (whole) {
      this.shadowFrame = 0;
      this.shadowAt.x = fx; this.shadowAt.z = fz;
      this.sun.shadow.needsUpdate = true;
    }
    // The movers near the camera every frame (over the map as last drawn whole), while the sun casts.
    if (this.movers) {
      if (whole) this.movers.stillDue = true;
      if (this.sun.castShadow && this.sun.intensity > 0) this.sun.shadow.needsUpdate = true;
    }
  }

  /** MasterWorld's own light on top of the open sky's: fog and mist, under water, windows, rooms, below ground. */
  protected override local(dt: number, L: SkyLight): void {
    const dark = this.dark, indoors = dark >= 0.5, wx = this.weather, sun = this.sunDir;
    if (this.indoors || this.underwater) (this.stars.material as { opacity: number }).opacity = 0;
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
    // Windows light up from dusk; most rooms in the evening, few after midnight, some before dawn.
    WINDOWS.glow.value = 1 - smoothstep(-0.1, 0.06, sun[1]);
    const hr = this.hour;
    WINDOWS.share.value = hr >= 12 ? 0.7 - 0.25 * smoothstep(21.5, 24, hr) : 0.45 - 0.33 * smoothstep(0, 1.5, hr) + 0.2 * smoothstep(4.5, 6, hr);
    this.shelter += ((this.sheltered ? 1 : 0) - this.shelter) * Math.min(1, dt * 2.5);
    if (this.shelter > 1e-3 && !indoors) {
      const s = this.shelter, dim = 1 - s * (1 - SHELTER_SKY);
      this.scene.environmentIntensity *= dim;
      this.hemi.intensity *= dim;
      const room = Math.min(L.exposure, SHELTER_EXPOSURE_CAP) * this.exposure * SHELTER_EXPOSURE;
      this.renderer.toneMappingExposure += (room - this.renderer.toneMappingExposure) * s;
    }
    this.open = this.held();
    if (this.indoors) this.below(this.cave);
    if (dark > 0) this.renderer.toneMappingExposure += (1.4 * this.exposure / RIG_EXPOSURE - this.renderer.toneMappingExposure) * dark;
  }
}
