// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot).
/**
 * Spells as the eye sees them (plan 10, C2, C4): glowing shapes over what is behind them (no shadows). Blended as
 * premultiplied light (one, one minus alpha): the glow adds as before, and each shape also covers some of what is
 * behind it, so a school's colour still reads against a sunlit meadow (pure additive washed out to white there),
 * and shade's hollow middle is dark.
 * One shader for every spell of every school: each instance is a sphere scaled into an orb, a burst, a flat
 * ring or a mote, and its instance attributes say the rest. `tint` is the school's colour; `spell` is
 * (motif, seed, role, fade): the motif (SPELL_MOTIFS order) picks the pattern, the seed puts it out of step
 * with its neighbours, role 0 is a body and 1 a mote, and fade dims it as it goes.
 *
 * The six motifs: flame licks upward in tongues with a hot core; frost glitters on facets with white edges;
 * stone is dull and mottled; bloom pulses in rings and petals; radiance throws rays from a white core;
 * shade glows only at its rim round a dark middle, swirling. All six are worked out and the motif's
 * weight picks one, so there is no branch and no second shader.
 */
import { AddEquation, CustomBlending, DoubleSide, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor } from 'three/webgpu';
import { abs, atan, attribute, clamp, dot, float, floor, fract, mix, normalView, pow, positionGeometry, sin, step, time, vec3, vec4 } from 'three/tsl';
import { defineKind } from '../materials';

export const SPELL_GLOW = defineKind('spell glow', ['position', 'normal', 'uv', 'tint', 'spell'], () => {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, fog: false });
  Object.assign(m, { blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor });
  const s = attribute('spell', 'vec4'), tint = attribute('tint', 'vec3');
  const motif = s.x, seed = s.y, role = s.z, fade = s.w;
  const p = positionGeometry;
  const face = clamp(abs(normalView.z), 0.0, 1.0), rim = float(1.0).sub(face);
  const t = time.add(seed.mul(17.0));
  const ang = atan(p.z, p.x);
  const wave = (x) => sin(x).mul(0.5).add(0.5);
  const weight = (k: number) => clamp(float(1.0).sub(abs(motif.sub(k))), 0.0, 1.0);
  const f2 = face.mul(face), f3 = f2.mul(face), f4 = f2.mul(f2);

  // flame: tongues running up, a flicker, white at the heart.
  const tongue = wave(ang.mul(5.0).add(p.y.mul(4.0)).sub(t.mul(9.0)));
  const flame = f2.mul(1.2).add(tongue.mul(face).mul(float(1.2).sub(p.y.mul(0.5))).mul(0.7)).mul(sin(t.mul(23.0)).mul(0.1).add(0.9));
  // frost: facets that glint in turn, bright edges.
  const cell = fract(sin(dot(floor(p.mul(5.0)), vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const glint = step(0.8, cell).mul(wave(t.mul(6.0).add(cell.mul(30.0))));
  const frost = rim.mul(rim).mul(1.4).add(f3.mul(0.5)).add(glint.mul(1.5));
  // stone: dull, mottled grit.
  const mott = sin(p.x.mul(7.0).add(seed.mul(9.0))).mul(sin(p.y.mul(9.0))).mul(sin(p.z.mul(8.0))).mul(0.5).add(0.5);
  const stone = face.mul(mott.mul(0.7).add(0.5));
  // bloom: rings rising through petals.
  const bloom = pow(face, 1.5).mul(0.8).add(wave(p.y.mul(9.0).sub(t.mul(4.0))).mul(wave(ang.mul(6.0).add(t))).mul(face).mul(0.7));
  // radiance: rays from a white core, turning slowly.
  const rays = pow(abs(sin(ang.mul(8.0).add(t.mul(0.7)).add(p.y.mul(1.5)))), 12.0);
  const radiance = f3.mul(2.0).add(rays.mul(face).mul(1.2)).add(rim.mul(0.2));
  // shade: a hollow, glowing only at the rim, swirling.
  const shade = pow(rim, 1.5).mul(wave(ang.mul(3.0).add(p.y.mul(5.0)).sub(t.mul(3.0))).mul(0.8).add(1.0)).mul(1.1).add(f4.mul(0.08));

  const w = [0, 1, 2, 3, 4, 5].map(weight);
  const body = flame.mul(w[0]).add(frost.mul(w[1])).add(stone.mul(w[2])).add(bloom.mul(w[3])).add(radiance.mul(w[4])).add(shade.mul(w[5]));
  const bodyHeat = f4.mul(w[0]).add(glint.mul(0.8).add(pow(rim, 3.0).mul(0.4)).mul(w[1])).add(f3.mul(f3).mul(0.3).mul(w[3])).add(pow(face, 5.0).mul(0.8).mul(w[4]));
  // A mote is a soft dot whatever its motif.
  const mote = step(0.5, role);
  const bright = mix(body, f2.mul(1.6), mote), heat = clamp(mix(bodyHeat, f4.mul(0.15), mote), 0.0, 1.0);
  // Light given (premultiplied) and how much of what is behind it is covered: some for every glow, shade's
  // hollow more (its middle stays dark), a mote little.
  const cover = clamp(bright.mul(0.45).add(face.mul(0.55).mul(w[5]).mul(float(1.0).sub(mote))).mul(fade), 0.0, 0.85);
  m.colorNode = vec4(mix(tint, vec3(1.0), heat).mul(bright).mul(fade).mul(1.3), cover);
  return m;
}, { cast: false, receive: false });
