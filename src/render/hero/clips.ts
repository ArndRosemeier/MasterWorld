/**
 * The clips the hero plays (Actors' library), by what the body does. `HERO_CLIPS` is what
 * `npm run packs` (tools/packs/actors.mjs) copies for the hero: keep it a plain quoted list.
 */
export const HERO_CLIPS = [
  'idle', 'walk', 'jog', 'sprint', 'swim', 'tread water', 'jump', 'crouch', 'fight stance', 'sword idle',
  'sword slash A', 'sword slash B', 'sword slash C', 'punch jab', 'punch cross', 'shield bash', 'hit to chest', 'eat or drink', 'death',
  'sit down', 'sit', 'stand up',
];

/** How long sitting down and standing up again take (s): the clips' own lengths (40 and 32 frames at 30 fps). */
export const SIT_DOWN = 40 / 30;
export const STAND_UP = 32 / 30;

/** The clip for each one-shot action (the fight's ids); anyone drawn as an Actors person plays these. */
export const ACTION_CLIPS: Readonly<Record<string, string>> = {
  swing_1h: 'sword slash A', slam: 'sword slash B', punch: 'punch jab', kick: 'shield bash', flinch: 'hit to chest', drink: 'eat or drink', kneel: 'crouch',
};

/** The ground speed (m/s) each moving clip shows at its own pace. */
export const PACE: Readonly<Record<string, number>> = { walk: 1.4, jog: 3.6, sprint: 6.2, swim: 1.6 };
