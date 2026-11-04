/**
 * The living face of every Actors person MasterWorld draws (Actors 0.23 to 0.31): each face unit as its own GPU
 * morph (`faceRig`), eyes that look at the camera with saccades, blinks and idle movement (`faceAnimation`,
 * `gaze`), and expression wrinkles in the skin shader. Skin detail, tucked layers and swinging cloth are on by
 * Actors' own defaults. Spread into a character's config (render/hero, folk, dungeon foes, giants).
 */
export const LIVING = { faceRig: true, faceAnimation: true, gaze: 'camera', wrinkles: true } as const;

/** Wet skin (Actors `skinWetness`, 0..1): how fast the skin soaks in a swim or the rain, and how slowly it dries (s). */
export const SOAK = 5;
export const DRY = 120;
/** The most wet a hero's skin gets from the rain alone (a swim wets it fully). */
export const RAIN_WET = 0.7;

/** `wet` moves toward `target` (soaking quickly, drying slowly). */
export function wetter(wet: number, target: number, dt: number): number {
  return wet + (target - wet) * (1 - Math.exp(-dt / (target > wet ? SOAK : DRY)));
}

/** The face's shape sliders (Actors `SHAPE_SLIDERS`, group Face). */
const FACE_SLIDERS = ['faceWidth', 'fullness', 'jaw', 'cheekbones', 'brow', 'eyes', 'nose', 'noseWidth', 'lips', 'mouthWidth', 'chin'] as const;

/** A face that differs a little from the average in everything (Actors 0.32 shape sliders), drawn from `r`. */
export function faceShape(r: { range(lo: number, hi: number): number }, spread = 0.5): Record<string, number> {
  const shape: Record<string, number> = {};
  for (const id of FACE_SLIDERS) shape[id] = r.range(-spread, spread);
  return shape;
}
