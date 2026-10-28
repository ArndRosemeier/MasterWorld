/**
 * The townsfolk's days in the classic setting (plan 9.2): up with the light, work, meals at home, the
 * inn for the sociable in the evening, indoors after dark, and every seventh day the rest day of the
 * five Wardens with its gathering at the temple (plan 12). The sun rises at 6 and sets at 18.
 */
import type { DayPart, RoutinesDef } from '../contract';

/** An evening: supper at home, then home or (for the sociable, some days) the inn, then bed. */
const evening = (supper: number, inn: number, bed: number): DayPart[] => [
  { at: supper, do: 'meal' },
  { at: supper + 1, do: 'home', or: { do: 'inn', chance: inn, trait: 'social' } },
  { at: bed, do: 'sleep' },
];

export const routines: RoutinesDef = {
  week: 7,
  restDay: 6,
  shift: 0.75,
  jitter: 0.25,
  dark: [18.75, 5.5],
  // The Wardens' day: no work, the gathering in the temple in the morning, the market and the benches after.
  restday: [
    { at: 0, do: 'sleep' },
    { at: 6.5, do: 'rise' },
    { at: 7.5, do: 'meal' },
    { at: 8.25, do: 'chores' },
    { at: 9.25, do: 'temple' },
    { at: 11, do: 'leisure' },
    { at: 12.5, do: 'meal' },
    { at: 13.5, do: 'leisure', or: { do: 'inn', chance: 0.2, trait: 'social' } },
    { at: 16.5, do: 'chores' },
    ...evening(18, 0.35, 22),
  ],
  roles: {
    // The master of a trade at their own tools; at home for the last hour before supper.
    trade: { workday: [
      { at: 0, do: 'sleep' }, { at: 5.5, do: 'rise' }, { at: 6.5, do: 'meal' }, { at: 7, do: 'work' },
      { at: 12, do: 'meal' }, { at: 13, do: 'work' }, { at: 17, do: 'chores' }, ...evening(18, 0.3, 22),
    ] },
    // A hand fetches and carries for a trade, and runs its errands.
    hand: { workday: [
      { at: 0, do: 'sleep' }, { at: 5.5, do: 'rise' }, { at: 6.25, do: 'meal' }, { at: 6.75, do: 'work' },
      { at: 10, do: 'errands' }, { at: 10.75, do: 'work' }, { at: 12, do: 'meal' }, { at: 13, do: 'work' },
      { at: 14.75, do: 'errands', or: { do: 'work', chance: 0.4 } }, { at: 15.5, do: 'work' }, { at: 17, do: 'chores' }, ...evening(18, 0.4, 22.25),
    ] },
    // Market folk set up early and pack up before the evening.
    trader: { workday: [
      { at: 0, do: 'sleep' }, { at: 5, do: 'rise' }, { at: 5.75, do: 'meal' }, { at: 6.5, do: 'work' },
      { at: 12, do: 'meal' }, { at: 12.75, do: 'work' }, { at: 16.5, do: 'chores' }, ...evening(18, 0.3, 21.75),
    ] },
    // The temple keeper opens at dawn and keeps the evening prayers; on the rest day they lead the gathering.
    keeper: {
      workday: [
        { at: 0, do: 'sleep' }, { at: 5, do: 'rise' }, { at: 5.5, do: 'work' }, { at: 12, do: 'meal' },
        { at: 13, do: 'work' }, { at: 17.5, do: 'meal' }, { at: 18.25, do: 'work' }, { at: 19.5, do: 'home' }, { at: 21.5, do: 'sleep' },
      ],
      restday: [
        { at: 0, do: 'sleep' }, { at: 5, do: 'rise' }, { at: 5.5, do: 'work' }, { at: 9, do: 'temple' }, { at: 11.5, do: 'work' },
        { at: 12.5, do: 'meal' }, { at: 13.5, do: 'work' }, { at: 17.5, do: 'meal' }, { at: 18.25, do: 'work' }, { at: 19.5, do: 'home' }, { at: 21.5, do: 'sleep' },
      ],
    },
    // Keeping house: water in the morning, the garden and the washing, the market, the cooking.
    homemaker: { workday: [
      { at: 0, do: 'sleep' }, { at: 5.5, do: 'rise' }, { at: 6.5, do: 'meal' }, { at: 7, do: 'chores' },
      { at: 9, do: 'chores', or: { do: 'errands', chance: 0.5 } }, { at: 10.25, do: 'chores' }, { at: 12, do: 'meal' }, { at: 13, do: 'chores', or: { do: 'errands', chance: 0.4 } },
      { at: 14.25, do: 'chores' }, { at: 15, do: 'chores', or: { do: 'leisure', chance: 0.25, trait: 'social' } }, { at: 16, do: 'chores', or: { do: 'errands', chance: 0.35 } },
      ...evening(18, 0.15, 21.5),
    ] },
    // Children help at home in the morning, play by day and are in bed soon after dark.
    child: {
      workday: [
        { at: 0, do: 'sleep' }, { at: 6.5, do: 'rise' }, { at: 7, do: 'meal' }, { at: 7.5, do: 'chores' }, { at: 9, do: 'play' },
        { at: 12, do: 'meal' }, { at: 12.75, do: 'play' }, { at: 15, do: 'chores' }, { at: 15.75, do: 'play' },
        { at: 17.75, do: 'meal' }, { at: 18.5, do: 'home' }, { at: 19.25, do: 'sleep' },
      ],
      restday: [
        { at: 0, do: 'sleep' }, { at: 6.75, do: 'rise' }, { at: 7.5, do: 'meal' }, { at: 8.25, do: 'play' }, { at: 9.25, do: 'temple' },
        { at: 11, do: 'play' }, { at: 12.5, do: 'meal' }, { at: 13.25, do: 'play' }, { at: 17.75, do: 'meal' }, { at: 18.5, do: 'home' }, { at: 19.25, do: 'sleep' },
      ],
    },
    // A guest at the inn: a look round the town by day, meals and the evening at the inn.
    traveller: {
      workday: [
        { at: 0, do: 'sleep' }, { at: 7, do: 'lodge' }, { at: 8, do: 'leisure' }, { at: 12, do: 'lodge' }, { at: 13, do: 'leisure' },
        { at: 17.5, do: 'inn' }, { at: 22.5, do: 'sleep' },
      ],
      restday: [
        { at: 0, do: 'sleep' }, { at: 7, do: 'lodge' }, { at: 8, do: 'leisure' }, { at: 9.25, do: 'temple' }, { at: 11, do: 'leisure' },
        { at: 12, do: 'lodge' }, { at: 13, do: 'leisure' }, { at: 17.5, do: 'inn' }, { at: 22.5, do: 'sleep' },
      ],
    },
  },
  trades: {
    // Bread before breakfast: the baker is at the oven long before dawn and in bed early.
    baker: { workday: [
      { at: 0, do: 'sleep' }, { at: 3.5, do: 'work' }, { at: 8.5, do: 'meal' }, { at: 9, do: 'work' },
      { at: 12, do: 'meal' }, { at: 13, do: 'chores' }, { at: 14.5, do: 'work' }, { at: 17, do: 'meal' }, { at: 18, do: 'home' }, { at: 20, do: 'sleep' },
    ] },
    // The inn keeps the town's evenings: late up, serving into the night, every day of the week.
    innkeeper: {
      workday: [
        { at: 0, do: 'sleep' }, { at: 7, do: 'rise' }, { at: 7.5, do: 'work' }, { at: 14, do: 'meal' }, { at: 14.5, do: 'chores' },
        { at: 16, do: 'work' }, { at: 23.5, do: 'sleep' },
      ],
      restday: [
        { at: 0, do: 'sleep' }, { at: 7, do: 'rise' }, { at: 8, do: 'meal' }, { at: 9.25, do: 'temple' }, { at: 11, do: 'work' },
        { at: 14, do: 'meal' }, { at: 14.5, do: 'chores' }, { at: 16, do: 'work' }, { at: 23.5, do: 'sleep' },
      ],
    },
    // Farm folk work the fields while it is light, eat in the field at noon, and go to bed early.
    farmer: { workday: [
      { at: 0, do: 'sleep' }, { at: 4.75, do: 'rise' }, { at: 5.5, do: 'work' }, { at: 12, do: 'meal' }, { at: 12.75, do: 'work' },
      { at: 17.75, do: 'meal' }, { at: 18.5, do: 'home' }, { at: 21, do: 'sleep' },
    ] },
    // The carter sees to the horses at first light and last thing.
    carter: { workday: [
      { at: 0, do: 'sleep' }, { at: 5, do: 'work' }, { at: 7, do: 'meal' }, { at: 7.5, do: 'work' }, { at: 12, do: 'meal' },
      { at: 13, do: 'work' }, ...evening(18.25, 0.35, 22.25),
    ] },
  },
};
