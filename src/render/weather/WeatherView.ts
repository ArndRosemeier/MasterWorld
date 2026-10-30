/**
 * The weather made visible: reads the weather (world/weather.ts) where the camera is and hands it to the
 * sky (clouds, light, fog, mist, lightning), the wind (grass, trees, the sea's waves), the ground (wet,
 * puddles) and the rain and snow falling around the camera.
 */
import { Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, Sphere, Vector3 } from 'three/webgpu';
import { Rng, damp, deriveSeed, lerp, lerpAngle } from '@futuremagic/core';
import { vegetationUniforms } from '@futuremagic/vegetation';
import { calm, lightning, type Flash, type Weather, type WeatherState } from '../../world/weather';
import { WEATHER, createPrecipMaterial, precipShift } from '../materials/weather';
import { ORIGIN } from '../origin';
import { WATER } from '../materials/waterInputs';
import { GRASS } from '../materials/grass';
import type { SkyView } from '../sky';

/** Drops in the box around the camera in the hardest rain. */
const DROPS = 24000;
/** Seconds between weather reads, and how fast what is drawn follows them (time constant, s). */
const READ_EVERY = 0.25, FOLLOW = 2.5;
/** Ground for the mist's base: rings of samples this far out (m), refreshed after this much movement. */
const MIST_RINGS = [0, 250, 700, 1500], MIST_MOVE = 60;
/** The real time wraps (s) so the drops' motion keeps its float precision. */
const WRAP = 3600;

export class WeatherView {
  readonly precip: Mesh<InstancedBufferGeometry>;
  /** What is drawn now (eases towards what the weather says). */
  readonly shown: WeatherState = calm();
  private readonly target: WeatherState = calm();
  private readonly flash: Flash = { light: 0, bearing: 0 };
  private sinceRead = Infinity;
  private seconds = 0;
  private first = true;
  private readonly mistAt = new Vector3(Infinity, 0, 0);
  private mistBase = 0;

  constructor(private readonly weather: Weather, private readonly height: (x: number, z: number) => number) {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const rng = new Rng(deriveSeed(weather.seed, 'weather', 'drops'));
    const drops = new Float32Array(DROPS * 4);
    for (let i = 0; i < drops.length; i++) drops[i] = rng.float();
    g.setAttribute('pDrop', new InstancedBufferAttribute(drops, 4));
    g.instanceCount = 1;
    // Drops are placed on the GPU around the camera.
    g.boundingSphere = new Sphere(new Vector3(), Infinity);
    this.precip = new Mesh(g, createPrecipMaterial());
    this.precip.name = 'rain';
    this.precip.frustumCulled = false;
    this.precip.renderOrder = 5;
    // Placed on the GPU relative to the floating origin: drawn at the identity.
    ORIGIN.pin(this.precip);
  }

  /** Each frame: `hours` is the game clock (day * 24 + hour). */
  apply(dt: number, cam: Vector3, hours: number, sky: SkyView): void {
    this.seconds += dt;
    this.sinceRead += dt;
    if (this.sinceRead >= READ_EVERY) {
      this.sinceRead = 0;
      this.weather.state(cam.x, cam.z, hours, this.target);
    }
    const s = this.shown, t = this.target;
    // The first frame shows the weather as it is; after that it eases (a teleport does not flip the sky).
    const k = this.first ? 1 : damp(1 / FOLLOW, dt);
    this.first = false;
    for (const key of ['cover', 'density', 'dark', 'sun', 'fog', 'mist', 'rain', 'snow', 'wind', 'storm', 'wet', 'lying', 'snowCover', 'snowLine'] as const) s[key] = lerp(s[key], t[key], k);
    s.windDir = lerpAngle(s.windDir, t.windDir, k);

    // Sky, light and fog.
    sky.weather = { cover: s.cover, density: s.density, dark: s.dark, sun: s.sun, fog: s.fog, rain: s.rain };
    sky.mist = s.mist;
    if (Math.hypot(cam.x - this.mistAt.x, cam.z - this.mistAt.z) > MIST_MOVE) this.mistBase = this.lowGround(cam);
    // Mist lies in the low ground nearby, never above the camera's own ground.
    sky.mistBase = Math.min(this.mistBase, this.height(cam.x, cam.z)) + 2;
    lightning(this.weather.seed, this.seconds, s.storm, this.flash);
    sky.flash = this.flash.light;
    sky.flashBearing = this.flash.bearing;

    // Wind: grass and trees bend, the sea's waves grow (they keep the swell's direction).
    const W = WEATHER;
    const wx = Math.cos(s.windDir), wz = Math.sin(s.windDir);
    W.windDir.value.set(wx, wz);
    W.wind.value = s.wind;
    const speed = 2 + s.wind * 14;
    W.drift.value.x += wx * speed * dt;
    W.drift.value.y += wz * speed * dt;
    GRASS.wind.value = 0.12 + s.wind * 1.1;
    vegetationUniforms.uWind.value = 0.15 + s.wind * 1.7;
    WATER.amp.value = 0.35 + s.wind * 1.6;

    // Rain and snow, the wet ground.
    W.time.value = this.seconds % WRAP;
    precipShift(ORIGIN.at.x, ORIGIN.at.z, W.precipShift.value);
    W.rain.value = s.rain;
    W.snow.value = s.snow;
    W.wet.value = s.wet;
    W.snowCover.value = s.snowCover;
    W.snowLine.value = s.snowLine;
    const L = sky.light, g = sky.gain;
    const amb = L.hemiIntensity * g * 0.7, sun = L.lightIntensity * g * 0.12 + this.flash.light * 2;
    W.light.value.setRGB(L.skyColor[0] * amb + L.lightColor[0] * sun, L.skyColor[1] * amb + L.lightColor[1] * sun, L.skyColor[2] * amb + L.lightColor[2] * sun);
    const n = Math.round(Math.min(1, s.rain * 1.15) * DROPS);
    this.precip.visible = n > 0 && !sky.underwater && !sky.indoors && !sky.sheltered;
    this.precip.geometry.instanceCount = Math.max(1, n);
  }

  /** The lowest ground around the camera (mist pools there), not below the sea. */
  private lowGround(cam: Vector3): number {
    this.mistAt.copy(cam);
    let low = Infinity;
    for (const r of MIST_RINGS) {
      const n = r === 0 ? 1 : 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        low = Math.min(low, this.height(cam.x + Math.cos(a) * r, cam.z + Math.sin(a) * r));
      }
    }
    return Math.max(0, low);
  }

  /** One line for the HUD. */
  get summary(): string {
    const s = this.shown, f = (v: number) => v.toFixed(2);
    return `weather cover ${f(s.cover)} rain ${f(s.rain)}${s.snow > 0.5 ? ' (snow)' : ''} storm ${f(s.storm)} mist ${f(s.mist)} wind ${f(s.wind)} wet ${f(s.wet)}${s.lying > 0.01 ? ` snow ${f(s.lying)}` : ''}`;
  }
}
