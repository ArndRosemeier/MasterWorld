/**
 * The classic setting's sights by the way (plan 4.1, C9): old things of the land the hero comes upon when
 * Discovery is overdue. Nothing of a faith (religion is not designed yet): stones and cairns of the old realm.
 */
import type { SightDef } from '../contract';

export const sights: readonly SightDef[] = [
  { id: 'standing-stones', shape: 'stones', seen: 'A ring of standing stones in the grass, older than any town here. Nobody remembers who raised them.' },
  { id: 'waystone', shape: 'waystone', seen: 'A tall waystone of the old realm, its carving worn almost smooth. A road ran here once, before the Fading.' },
  { id: 'cairn', shape: 'cairn', seen: 'A cairn of field stones, piled higher than a man. Something lies under it, or something was marked here long ago.', weight: 1.2 },
];
