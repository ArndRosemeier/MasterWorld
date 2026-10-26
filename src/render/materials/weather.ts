// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * What the weather gives the shaders: uniforms the WeatherView and SkyView write each frame, the scene's
 * fog (haze everywhere plus mist lying in the low ground), rings where raindrops hit still water, and the
 * falling rain and snow around the camera.
 */
import { Color, DoubleSide, MeshBasicNodeMaterial, Vector2, Vector3, type Texture } from 'three/webgpu';
import { skyToward } from '@futuremagic/sky/node';
import {
  Fn, attribute, cameraPosition, clamp, cross, dot, exp, float, fog, fract, length, max, mix, mod, normalize, positionGeometry,
  log, positionWorld, select, sin, smoothstep, uniform, vec2, vec3, vec4,
} from 'three/tsl';

export const WEATHER = {
  /** Seconds since start (real time: rain falls even when the clock stands still). */
  time: uniform(0),
  /** Precipitation 0..1, and the share of it that is snow. */
  rain: uniform(0),
  snow: uniform(0),
  /** Wet ground 0..1, and snow lying on it 0..1. */
  wet: uniform(0),
  lying: uniform(0),
  /** Wind strength 0..1 and the unit direction it blows to (xz). */
  wind: uniform(0),
  windDir: uniform(new Vector2(1, 0)),
  /** How far the air has moved (m, xz): gust patterns ride on it, so a turning wind never makes them jump. */
  drift: uniform(new Vector2()),
  /** Light on the falling drops and flakes. */
  light: uniform(new Color(0.5, 0.5, 0.5)),
  /** The floating origin (render/origin.ts) modulo the box of drops (`precipShift`): the drops stay put in the world when it steps. */
  precipShift: uniform(new Vector3()),
};

/**
 * The scene's fog: exponential-squared haze (as three's FogExp2) plus exponential height mist below
 * `mistBase`, integrated along the view ray so it pools in valleys and over still water.
 */
export const FOG = {
  color: uniform(new Color(0xbfd0e0)),
  density: uniform(0.00004),
  /** Mist density at its base (per metre), the base height and how fast it thins above (per metre). */
  mist: uniform(0),
  mistBase: uniform(0),
  mistFalloff: uniform(1 / 14),
  /** 1: one colour everywhere (`color`: under water, below ground); 0: the sky's colour toward each view. */
  flat: uniform(0),
};

/**
 * The sky's light in the shade is its environment map; Preetham's clear sky is too saturated a blue for
 * that, so the env copy is drawn with this much of its colour (sky.ts), and the fog puts it back.
 */
export const ENV_SATURATION = 0.6;

/** A colour read from the sky's environment map with its full colour back (see ENV_SATURATION). */
export const fullSky = (c) => mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 1 / ENV_SATURATION).max(0);

/**
 * The fog node for `scene.fogNode` (set before the warm-up: it is part of every shader's key). `env` is the
 * sky's environment map: distant land fades into the sky behind it (aerial perspective), warm toward the
 * sun, blue away from it, grey in overcast (the sky turns grey itself).
 */
export function fogNode(env: Texture) {
  const factor = Fn(() => {
    const ray = positionWorld.sub(cameraPosition);
    const dist = length(ray);
    const haze = FOG.density.mul(dist);
    // Mist: ∫ a·e^(-b(y - base)) along the ray, y rising by k per metre.
    const k = ray.y.div(max(dist, 1e-3));
    const x = clamp(FOG.mistFalloff.mul(k).mul(dist), -30, 60);
    const f = select(x.abs().lessThan(1e-3), float(1), float(1).sub(exp(x.negate())).div(x));
    const start = FOG.mist.mul(exp(FOG.mistFalloff.mul(cameraPosition.y.sub(FOG.mistBase)).negate().min(2)));
    const mist = start.mul(dist).mul(f);
    return exp(haze.mul(haze).add(mist).negate()).oneMinus();
  });
  // The sky's colour toward the view, a shade darker than the sky itself so far hills stay hills.
  const raw = fullSky(skyToward(env, positionWorld.sub(cameraPosition))).mul(0.75);
  // The glow toward the sun runs far above 1 in the env map: the same soft knee the sky dome has on screen.
  const peak = max(raw.x, max(raw.y, raw.z));
  const toward = select(peak.greaterThan(1), raw.mul(log(peak).add(1).div(peak)), raw);
  return fog(mix(toward, FOG.color, FOG.flat), factor());
}

const hash2 = (c) => fract(sin(vec2(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)))).mul(43758.5453));

/**
 * Rain on still water: each cell of a small grid takes a drop now and then, and a ring spreads from it.
 * Returns the tilt (xz) to add to a surface normal; zero when dry. Two offset grids, so rings overlap.
 */
export function rainRings(p) {
  let tilt = vec2(0);
  for (const [cell, rate, off] of [[0.42, 1.1, 0.0], [0.31, 1.45, 0.37]]) {
    const q = p.div(cell).add(off);
    const id = q.floor();
    const h = hash2(id);
    const phase = fract(WEATHER.time.mul(rate).add(h.x));
    // Not every cell every time: more drops the harder it rains.
    const falls = select(fract(h.y.add(WEATHER.time.mul(rate).add(h.x).floor().mul(0.618))).lessThan(WEATHER.rain.mul(1.1)), float(1), float(0));
    const centre = id.add(h.mul(0.5).add(0.25));
    const d = q.sub(centre);
    const r = length(d);
    const front = r.sub(phase.mul(0.45)).div(0.07);
    const wave = sin(front.mul(3.85)).mul(exp(front.mul(front).negate()));
    tilt = tilt.add(d.div(max(r, 1e-3)).mul(wave).mul(phase.oneMinus()).mul(falls));
  }
  return tilt.mul(0.3).mul(smoothstep(0.0, 0.08, WEATHER.rain)).mul(WEATHER.snow.oneMinus());
}

/** Box of falling drops around the camera: half width and height (m). */
export const PRECIP_HALF = 18, PRECIP_HEIGHT = 22;

/** `WEATHER.precipShift` for an origin at (x, z): its remainder in the box (the box's y is not shifted: the origin's y is 0). */
export function precipShift(x: number, z: number, out: Vector3): Vector3 {
  const w = PRECIP_HALF * 2, r = (v: number) => ((v % w) + w) % w;
  return out.set(r(x), 0, r(z));
}

/**
 * Rain and snow: one shader. Each instance is a drop at a seeded spot in a box that wraps around the
 * camera; it falls with the wind, drawn as a thin streak along its motion (rain) or a soft flake (snow).
 */
export function createPrecipMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: true, side: DoubleSide });
  const drop = attribute('pDrop', 'vec4'); // spot in the box 0..1 (xyz), a random number
  const across = positionGeometry.x, along = positionGeometry.y; // -1..1 across, 0..1 along
  const W = WEATHER, snow = W.snow, r = drop.w;
  // Rain falls ~9 m/s (big drops faster), snow ~1.2 m/s and wanders.
  const fall = mix(mix(8.0, 10.5, r), mix(0.9, 1.6, r), snow);
  const push = W.wind.mul(mix(float(7), float(4), snow));
  const vel = vec3(W.windDir.x.mul(push), fall.negate(), W.windDir.y.mul(push));
  const wander = vec3(sin(W.time.mul(mix(0.7, 1.3, r)).add(r.mul(40.0))), 0, sin(W.time.mul(mix(0.5, 1.1, r)).add(r.mul(17.0)).add(1.3))).mul(snow.mul(0.6));
  const size = vec3(PRECIP_HALF * 2, PRECIP_HEIGHT, PRECIP_HALF * 2);
  // Relative to the floating origin (the mesh is pinned): the box wraps around the camera as it would in world
  // coordinates, the origin's share of the wrap given by `precipShift`, so nothing large enters the math.
  const lo = cameraPosition.sub(vec3(PRECIP_HALF, PRECIP_HEIGHT * 0.4, PRECIP_HALF));
  const p0 = drop.xyz.mul(size).add(vel.mul(W.time)).add(wander);
  const centre = mod(p0.sub(W.precipShift).sub(lo), size).add(lo);
  // Streak along the motion (motion blur), turned to face the camera.
  const toCam = cameraPosition.sub(centre);
  const dist = length(toCam);
  const axis = normalize(mix(vel, vec3(0, -1, 0), snow));
  const side = normalize(cross(axis, toCam));
  // Flakes: the falling axis turned square to the view (it points down, like the streaks).
  const down = normalize(cross(toCam, side));
  // Thin far away would alias: wider and fainter instead.
  const minW = dist.mul(0.0012);
  const rainW = max(float(0.006), minW), rainL = length(vel).mul(0.045);
  const flake = mix(0.035, 0.06, r);
  const halfW = mix(rainW, max(flake, minW), snow), len = mix(rainL, flake.mul(2), snow);
  const dir = mix(axis, down, snow);
  m.positionNode = centre.add(side.mul(across.mul(halfW))).add(dir.mul(along.sub(0.5).mul(len)));
  // Fragment: faint streaks; flakes soft round dots. Nothing right at the lens or underground of the box.
  const thin = float(0.006).div(rainW);
  const streak = across.abs().oneMinus().mul(sin(along.mul(Math.PI))).mul(thin).mul(0.16);
  const v = along.sub(0.5).mul(2);
  const dot2 = across.mul(across).add(v.mul(v));
  const flakeA = smoothstep(0.2, 1.0, dot2).oneMinus().mul(0.9).mul(flake.div(halfW).pow(2));
  const a = mix(streak, flakeA, snow).mul(smoothstep(0.4, 1.6, dist)).mul(smoothstep(PRECIP_HALF * 0.75, PRECIP_HALF, dist).oneMinus());
  // Flakes in the air read grey against a bright sky and snow (as they do), drops a touch lighter.
  m.colorNode = vec4(W.light.mul(mix(float(1.0), float(0.7), snow)), 1);
  m.opacityNode = a.min(1);
  return m;
}
