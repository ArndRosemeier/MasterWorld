// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot:spellfx).
/**
 * Spells as the eye sees them (plan 10, C4), made of the bits in app/spellFx/particles.ts: two shaders for every
 * spell of every school, both built behind the loading screen, so a spell never builds a shader in play.
 *
 * SPELL_SPRITE: camera-facing quads (or quads drawn along their flight, or lying flat on the ground), each drawing
 * one of eleven pictures worked out in the shader from noise: flame (licking tongues, white-hot heart to red edge),
 * puff (smoke, dust and mist, lit from above), spark, glow, ring (a shock ring), ray (a beam of light), circle (a
 * magic circle: rings, runes and a six-pointed star), leaf, flake (a six-armed snow crystal) and wisp (a curling
 * tendril of shadow) and blaze (a billow of fire burning out to smoke). Every quad is one instance of one mesh; its four instance attributes carry where it is, which
 * way it is drawn, its colour and cover, and which picture at what age. Blended as premultiplied light (one, one
 * minus alpha): fire and light add, smoke and leaves cover what is behind them, in one draw.
 *
 * SPELL_SOLID: lit, instanced solids (ice shards, rock spikes, stones, leaves, roots), their stuff picked by an
 * instance attribute: ice is glassy with a cold rim, rock mottled and cracked, wood barked, a leaf veined, light a
 * glowing crystal.
 */
import { AddEquation, CustomBlending, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, MeshBasicNodeMaterial, MeshStandardNodeMaterial, OneFactor, OneMinusSrcAlphaFactor } from 'three/webgpu';
import {
  Fn, If, abs, atan, attribute, cameraPosition, cameraViewMatrix, clamp, cos, cross, dot, exp, float, floor, fract, instancedDynamicBufferAttribute,
  length, max, min, mix, mx_noise_float, normalize, normalView, positionGeometry, positionView, pow, sin, smoothstep, step, time, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { defineKind } from '../materials';

/** Sprites drawn at once, at most (the mesh always draws this many; spare ones have no size). */
export const SPRITE_CAP = 1024;

/** The sprites' instance data, four floats each (see the file's comment). */
export const SPRITE_DATA = {
  /** x, y, z (relative to the floating origin), size (m). */
  at: dyn(),
  /** A way (stretch or the flat normal), and the mode: 0 faces the eye, a > 0 drawn along the way a times as long as wide, a < 0 flat. */
  way: dyn(),
  /** Light given (linear, premultiplied, may be over 1), and cover (0..1). */
  color: dyn(),
  /** Picture (SPRITES order), seed, age (0..1), turn (rad). */
  look: dyn(),
};

function dyn(): InstancedBufferAttribute {
  const a = new InstancedBufferAttribute(new Float32Array(SPRITE_CAP * 4), 4);
  a.setUsage(DynamicDrawUsage);
  return a;
}

const noise = (p) => mx_noise_float(p).mul(0.5).add(0.5);
const fbm = (p) => noise(p).mul(0.55).add(noise(p.mul(2.03).add(17.1)).mul(0.3)).add(noise(p.mul(4.1).add(41.7)).mul(0.15));
/** 1 at `hi`'s side falling to 0 past `lo` (hi > lo): smoothstep with its edges reversed is undefined in GLSL. */
const fade = (hi, lo, x) => float(1.0).sub(smoothstep(lo, hi, x));
const hash = (v) => fract(sin(dot(v, vec2(12.9898, 78.233))).mul(43758.5453));

/** Fire's colour by heat (0 smoky red edge .. 1 white-hot). */
const fireRamp = (h) => {
  // Kept red: the tone curve turns bright orange to pale yellow on its own.
  const a = mix(vec3(0.7, 0.06, 0.0), vec3(1.0, 0.17, 0.01), smoothstep(0.0, 0.3, h));
  const b = mix(a, vec3(1.0, 0.36, 0.05), smoothstep(0.3, 0.8, h));
  return mix(b, vec3(1.0, 0.6, 0.22), smoothstep(0.88, 1.0, h));
};

export const SPELL_SPRITE = defineKind('spell sprite', ['position', 'uv'], () => {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false });
  Object.assign(m, { blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor });
  const at = instancedDynamicBufferAttribute(SPRITE_DATA.at, 'vec4');
  const way = instancedDynamicBufferAttribute(SPRITE_DATA.way, 'vec4');
  const col = instancedDynamicBufferAttribute(SPRITE_DATA.color, 'vec4');
  const look = instancedDynamicBufferAttribute(SPRITE_DATA.look, 'vec4');

  m.positionNode = Fn(() => {
    const c = at.xyz, s = at.w, mode = way.w, rot = look.w;
    const flat = step(mode, -0.5), along = step(0.5, mode), face = float(1.0).sub(flat).sub(along);
    const asp = max(abs(mode), 1.0);
    // The eye's right and up in the world (rows of the view matrix).
    const right = vec4(1, 0, 0, 0).mul(cameraViewMatrix).xyz, up = vec4(0, 1, 0, 0).mul(cameraViewMatrix).xyz;
    const cr = cos(rot), sr = sin(rot);
    const bR = right.mul(cr).add(up.mul(sr)), bU = up.mul(cr).sub(right.mul(sr));
    const d = normalize(way.xyz.add(vec3(0.0, 1e-5, 0.0)));
    const toEye = normalize(cameraPosition.sub(c));
    const sR = normalize(cross(d, toEye).add(vec3(1e-5, 0.0, 0.0)));
    const fR0 = normalize(cross(d, vec3(0.0, 0.0, 1.0)).add(cross(d, vec3(1.0, 0.0, 0.0)).mul(0.001)));
    const fU0 = cross(fR0, d);
    const fR = fR0.mul(cr).add(fU0.mul(sr)), fU = fU0.mul(cr).sub(fR0.mul(sr));
    const R = bR.mul(face).add(sR.mul(along)).add(fR.mul(flat));
    const U = bU.mul(face).add(d.mul(along)).add(fU.mul(flat));
    const p = positionGeometry.xy;
    return c.add(R.mul(p.x.mul(s))).add(U.mul(p.y.mul(s).mul(asp)));
  })();

  m.colorNode = Fn(() => {
    // Everything the pictures share is worked out up front (toVar): a node first used inside one branch would be
    // declared in that branch only, and read as zero in the others.
    const kind = floor(look.x.add(0.5)).toVar(), seed = look.y.toVar(), age = look.z.toVar();
    const tint = col.toVar('tint');
    const q = uv().mul(2.0).sub(1.0).toVar(), r = length(q).toVar(), ang = atan(q.y, q.x).toVar();
    const t = time.add(seed.mul(31.0)).toVar();
    const light = vec3(0.0).toVar(), cover = float(0.0).toVar();
    If(kind.equal(0), () => {
      // Flame: a round hot foot low in the quad drawn up into a point, eaten from above by rising noise into
      // tongues: white-yellow at heart, orange, then dark red at the ragged edge. It cools as it ages.
      const yy = q.y.mul(0.5).add(0.5);
      const n1 = fbm(vec3(q.x.mul(2.1), q.y.mul(1.5).sub(t.mul(2.8)), seed.mul(9.0)));
      const n2 = noise(vec3(q.x.mul(4.6).add(n1.mul(1.5)), q.y.mul(3.4).sub(t.mul(4.6)), seed.mul(5.0).add(3.0)));
      const lift = q.y.add(0.42);
      const xd = q.x.add(n1.sub(0.5).mul(0.45).mul(yy));
      const d = length(vec2(xd.mul(yy.mul(1.3).add(1.35)), lift.mul(mix(1.9, 0.62, step(0.0, lift))))).mul(1.2);
      const n = n1.mul(0.65).add(n2.mul(0.35));
      const heat = float(1.0).sub(d).mul(1.7).sub(n.sub(0.32).mul(yy.mul(1.3).add(0.35))).mul(float(1.1).sub(age.mul(0.7))).toVar();
      const body = smoothstep(0.0, 0.12, heat);
      const h = clamp(heat, 0.0, 1.0);
      light.assign(fireRamp(h).mul(tint.rgb).mul(body).mul(h.mul(0.6).add(0.35)).mul(n2.mul(0.4).add(0.8)));
      cover.assign(smoothstep(0.06, 0.4, heat).mul(tint.w));
    }).ElseIf(kind.equal(1), () => {
      // Puff: smoke, dust or mist: billows of noise, each lit from above (the noise a little higher up shades
      // what is below it), ragged at the edge.
      const p3 = vec3(q.mul(1.5).add(seed.mul(13.0)), t.mul(0.2).add(age.mul(0.8)));
      const n = fbm(p3);
      const nUp = fbm(p3.add(vec3(0.0, 0.22, 0.0)));
      const dens = smoothstep(0.0, 0.42, float(0.95).sub(r.mul(1.3)).add(n.sub(0.5).mul(1.2)));
      const shade = clamp(float(0.8).add(n.sub(nUp).mul(2.4)).add(q.y.mul(0.22)), 0.3, 1.3);
      light.assign(tint.rgb.mul(shade).mul(dens));
      cover.assign(dens.mul(tint.w));
    }).ElseIf(kind.equal(2), () => {
      // Spark: a hot point (drawn along its flight, a streak), white in the middle.
      const d = length(vec2(q.x, q.y.mul(0.92)));
      const s = pow(clamp(float(1.0).sub(d), 0.0, 1.0), 2.0);
      light.assign(mix(tint.rgb, vec3(max(tint.r, max(tint.g, tint.b))), pow(s, 3.0)).mul(s).mul(1.6));
      cover.assign(s.mul(tint.w));
    }).ElseIf(kind.equal(3), () => {
      // Glow: soft light with a bright heart.
      const f = clamp(float(1.0).sub(r), 0.0, 1.0);
      light.assign(tint.rgb.mul(pow(f, 2.4).add(pow(f, 9.0).mul(0.8))));
      cover.assign(pow(f, 2.0).mul(tint.w));
    }).ElseIf(kind.equal(4), () => {
      // Ring: a shock ring, broken by noise, thinning as it grows.
      const n = noise(vec3(ang.mul(3.0), seed.mul(7.0), age.mul(2.0)));
      const w = mix(0.22, 0.05, age);
      const band = fade(w, 0.0, abs(r.sub(0.82))).mul(n.mul(0.7).add(0.4));
      light.assign(tint.rgb.mul(band));
      cover.assign(band.mul(tint.w));
    }).ElseIf(kind.equal(5), () => {
      // Ray: a beam along its length (q.y), a white core in a coloured sheath, shimmering, its ends soft.
      const n = noise(vec3(q.y.mul(4.0).sub(t.mul(9.0)), q.x.mul(3.0), seed.mul(5.0)));
      const core = exp(q.x.mul(q.x).mul(-40.0)), sheath = exp(q.x.mul(q.x).mul(-5.0)).mul(n.mul(0.6).add(0.4));
      const ends = fade(1.0, 0.7, abs(q.y));
      light.assign(mix(tint.rgb, vec3(max(tint.r, max(tint.g, tint.b))), core.mul(0.7)).mul(core.mul(1.6).add(sheath.mul(0.7))).mul(ends));
      cover.assign(sheath.mul(ends).mul(tint.w));
    }).ElseIf(kind.equal(6), () => {
      // Circle: a magic circle on the ground: two rings, a band of runes, a six-pointed star.
      const ring = (at, w) => fade(w, 0.0, abs(r.sub(at)));
      const rings = ring(0.95, 0.025).add(ring(0.8, 0.018)).add(ring(0.42, 0.015).mul(0.7));
      const seg = ang.div(6.2831853).mul(28.0).add(14.0);
      const cell = vec2(floor(seg), floor(r.sub(0.82).div(0.11).mul(3.0)));
      const inBand = step(0.83, r).mul(step(r, 0.93));
      const glyph = step(0.42, hash(cell.add(floor(seed.mul(50.0))))).mul(fade(0.5, 0.3, abs(fract(seg).sub(0.5)))).mul(inBand);
      const tri = (o) => max(max(dot(q, vec2(cos(o), sin(o))), dot(q, vec2(cos(o.add(2.0944)), sin(o.add(2.0944))))), dot(q, vec2(cos(o.add(4.1888)), sin(o.add(4.1888)))));
      const star = fade(0.02, 0.0, abs(tri(float(1.5708)).sub(0.4))).add(fade(0.02, 0.0, abs(tri(float(-1.5708)).sub(0.4)))).mul(step(r, 0.81));
      const pulse = sin(t.mul(4.0).sub(r.mul(6.0))).mul(0.25).add(0.85);
      const lines = clamp(rings.add(glyph.mul(0.9)).add(star.mul(0.8)), 0.0, 1.0).mul(pulse);
      light.assign(tint.rgb.mul(lines).add(tint.rgb.mul(fade(1.0, 0.0, r).mul(0.08))));
      cover.assign(lines.mul(tint.w));
    }).ElseIf(kind.equal(7), () => {
      // Leaf: a pointed oval with a midrib, lit, a faint glow at its edge.
      const w = float(0.5).mul(pow(clamp(float(1.0).sub(q.y.mul(q.y)), 0.0, 1.0), 0.8)).mul(float(1.0).sub(q.y.mul(0.25)));
      const leaf = fade(w, w.sub(0.06), abs(q.x)).mul(step(abs(q.y), 0.98));
      const vein = fade(0.05, 0.0, abs(q.x)).mul(0.35);
      const lit = float(0.75).add(q.x.mul(0.2)).sub(vein);
      light.assign(tint.rgb.mul(lit).mul(leaf));
      cover.assign(leaf.mul(tint.w));
    }).ElseIf(kind.equal(8), () => {
      // Flake: six arms with side branches, glinting.
      const a6 = fract(ang.div(1.0471976).add(0.5)).sub(0.5).mul(1.0471976);
      const p = vec2(cos(a6), sin(a6)).mul(r);
      const arm = fade(0.07, 0.0, abs(p.y)).mul(step(p.x, 0.9));
      const twig = fade(0.06, 0.0, abs(abs(p.y).sub(fract(p.x.mul(3.0)).mul(0.25)))).mul(step(0.3, p.x)).mul(step(p.x, 0.85));
      const f = clamp(arm.add(twig.mul(0.8)).add(fade(0.18, 0.0, r)), 0.0, 1.0);
      const glint = sin(t.mul(7.0)).mul(0.3).add(1.0);
      light.assign(tint.rgb.mul(f).mul(glint));
      cover.assign(f.mul(tint.w));
    }).ElseIf(kind.equal(9), () => {
      // Wisp: a curling tendril of shadow along its length, dark at heart with a coloured edge.
      const off = sin(q.y.mul(4.5).add(t.mul(5.0)).add(seed.mul(20.0))).mul(0.32).mul(q.y.add(1.0).mul(0.5));
      const n = noise(vec3(q.y.mul(3.0).sub(t.mul(2.0)), q.x.mul(2.0), seed.mul(3.0)));
      const dx = abs(q.x.sub(off));
      const body = fade(0.42, 0.0, dx.add(n.sub(0.5).mul(0.3))).mul(fade(1.0, 0.3, abs(q.y)));
      const rim = body.mul(smoothstep(0.05, 0.3, dx));
      light.assign(tint.rgb.mul(rim.mul(1.4).add(body.mul(0.1))));
      cover.assign(body.mul(tint.w));
    }).Else(() => {
      // Blaze: a billow of burning gas (an explosion, a fireball's heart): fire inside a puff that burns out from
      // its edge in as it ages, leaving dark smoke lit from above.
      const p3 = vec3(q.mul(1.7).add(seed.mul(13.0)), t.mul(0.35).add(age.mul(1.2)));
      const n = fbm(p3);
      const nUp = fbm(p3.add(vec3(0.0, 0.22, 0.0)));
      const dens = smoothstep(0.0, 0.4, float(0.95).sub(r.mul(1.3)).add(n.sub(0.5).mul(1.3)));
      const heat = dens.mul(1.35).sub(0.2).add(n.sub(0.5).mul(0.9)).mul(float(1.3).sub(age.mul(1.6))).toVar();
      const fire = smoothstep(0.0, 0.22, heat);
      const h = clamp(heat, 0.0, 1.0);
      const shade = clamp(float(0.8).add(n.sub(nUp).mul(2.4)).add(q.y.mul(0.22)), 0.3, 1.3);
      light.assign(fireRamp(h).mul(tint.rgb).mul(fire).mul(h.mul(0.6).add(0.35)).mul(n.sub(nUp).mul(1.5).add(1.0)).add(vec3(0.05, 0.043, 0.037).mul(shade).mul(dens).mul(float(1.0).sub(fire))));
      cover.assign(dens.mul(mix(smoothstep(0.05, 0.35, heat), float(1.0), float(1.0).sub(fire))).mul(tint.w));
    });
    // No picture may reach its quad's edge (a hard square); the circle fits inside its own.
    const edge = mix(fade(1.0, 0.8, max(abs(q.x), abs(q.y))), float(1.0), step(5.5, kind).mul(step(kind, 6.5)));
    return vec4(light.mul(edge), clamp(cover.mul(edge), 0.0, 1.0));
  })();
  return m;
}, { cast: false, receive: false }, true);

/** The solids' per-instance stuff: (stuff, seed, glow, unused). */
export const SOLID_ATTR = 'fx' as const;

export const SPELL_SOLID = defineKind('spell solid', ['position', 'normal', SOLID_ATTR], () => {
  const m = new MeshStandardNodeMaterial({ side: DoubleSide });
  const fx = attribute(SOLID_ATTR, 'vec4');
  const stuff = fx.x, seed = fx.y, glow = fx.z;
  const w = (k: number) => clamp(float(1.0).sub(abs(stuff.sub(k))), 0.0, 1.0);
  const ice = w(0), rock = w(1), wood = w(2), leaf = w(3), lit = w(4);
  const p = positionGeometry;
  const n1 = noise(p.mul(3.5).add(seed.mul(37.0)));
  const n2 = noise(p.mul(11.0).add(seed.mul(11.0)));
  const v = normalize(positionView.negate());
  const rimF = pow(clamp(float(1.0).sub(abs(dot(normalView, v))), 0.0, 1.0), 2.5);

  const iceC = mix(vec3(0.45, 0.68, 0.86), vec3(0.85, 0.95, 1.0), n2.mul(0.6).add(rimF.mul(0.4)));
  const crack = fade(0.04, 0.0, abs(n1.sub(0.5)));
  const rockC = mix(vec3(0.07, 0.055, 0.04), vec3(0.2, 0.16, 0.11), n1.mul(0.7).add(n2.mul(0.3))).mul(float(1.0).sub(crack.mul(0.55)));
  const bark = sin(p.x.mul(40.0).add(n1.mul(6.0))).mul(0.5).add(0.5);
  const woodC = mix(vec3(0.06, 0.04, 0.025), vec3(0.16, 0.11, 0.06), bark.mul(0.6).add(n2.mul(0.4)));
  const leafC = mix(vec3(0.07, 0.22, 0.04), vec3(0.2, 0.42, 0.1), n1);
  const litC = vec3(1.0, 0.9, 0.62);
  m.colorNode = iceC.mul(ice).add(rockC.mul(rock)).add(woodC.mul(wood)).add(leafC.mul(leaf)).add(litC.mul(lit));
  m.roughnessNode = float(0.12).mul(ice).add(float(0.95).mul(rock)).add(float(0.9).mul(wood)).add(float(0.6).mul(leaf)).add(float(0.3).mul(lit));
  m.metalnessNode = float(0.0);
  // Ice: a cold rim and a glint deep in it; rock: embers in its cracks when it glows; light: it is light.
  const iceE = vec3(0.35, 0.65, 1.0).mul(rimF.mul(1.4).add(glow.mul(0.6))).add(vec3(0.8, 0.95, 1.0).mul(step(0.93, n2)).mul(1.5));
  const rockE = vec3(1.0, 0.38, 0.08).mul(crack).mul(glow.mul(3.0));
  const leafE = vec3(0.4, 1.0, 0.35).mul(rimF.mul(glow).mul(1.2));
  const litE = vec3(2.2, 1.9, 1.2).mul(rimF.mul(0.6).add(0.8)).mul(glow.add(0.6));
  m.emissiveNode = iceE.mul(ice).add(rockE.mul(rock)).add(leafE.mul(leaf)).add(litE.mul(lit));
  return m;
}, { cast: false, receive: true }, true);
