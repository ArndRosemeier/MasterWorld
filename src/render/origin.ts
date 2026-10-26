/**
 * The floating origin (plan B0, @futuremagic/stage FloatingOrigin): the scene is drawn relative to a point near
 * the camera, so float32 stays exact at the start town 32 km out and anywhere beyond. Game code keeps world
 * coordinates; the view (view.ts) attaches the scene and draws with an origin-relative copy of its camera, and the
 * frame loop moves the origin with the camera.
 *
 * In shaders positionWorld and cameraPosition are relative to it: their differences need no change, but a pattern,
 * noise or mask read at a world point takes WORLD. On the CPU an object's matrixWorld is relative too (add
 * ORIGIN.at). Geometry placed on the GPU is pinned (ORIGIN.pin) and writes positions minus ORIGIN.at.
 */
import { FloatingOrigin, worldCamera, worldPosition } from '@futuremagic/stage';

/**
 * Whole chunks (10 of 128 m), and a whole number of the sun's shadow texels (sky.ts: 320 m / 4096), so the
 * shadow box, snapped in world space, lies on the same texel grid after a step.
 */
export const ORIGIN_GRAIN = 1280;

export const ORIGIN = new FloatingOrigin({ grain: ORIGIN_GRAIN });

/** The fragment's (or vertex's) world position, for patterns, noise and masks. */
export const WORLD = worldPosition(ORIGIN);

/** The camera's world position, for what is placed around it in the world. */
export const EYE = worldCamera(ORIGIN);
