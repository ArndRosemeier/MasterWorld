/**
 * The classic setting's sights by the way (plan 4.1, C9): old things of the land the hero comes upon when
 * Discovery is overdue (and a stash, a find when Reward is). Nothing of a faith (religion is not designed yet): stones and cairns of the old realm.
 */
import type { SightDef } from '../contract';

export const sights: readonly SightDef[] = [
  { id: 'standing-stones', shape: 'stones', seen: 'A ring of standing stones in the grass, older than any town here. Nobody remembers who raised them.' },
  { id: 'waystone', shape: 'waystone', seen: 'A tall waystone of the old realm, its carving worn almost smooth. A road ran here once, before the Fading.' },
  // Reward's answer: a find by the way.
  { id: 'stash', shape: 'stash', need: 'reward', loot: 'stash', seen: 'Under a flat stone against a boulder someone hid a bundle in oilcloth, and never came back for it.' },
  // Reward's answer at sea (S8): a ship gone down off the coast, her strongbox still in her hold.
  { id: 'wreck', shape: 'wreck', need: 'reward', loot: 'wreck', sea: true, seen: 'A ship lies on her side on the bed, her hold broken open; a sea chest is still lashed in it.' },
  { id: 'cairn', shape: 'cairn', seen: 'A cairn of field stones, piled higher than a man. Something lies under it, or something was marked here long ago.', weight: 1.2 },
];
