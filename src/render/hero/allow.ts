/**
 * What Actors' character generator is allowed to make in this setting (Actors 0.34 `allow`): the setting's
 * peoples (no robots, skeletons, goblins or giantkin), only the clothing categories of its themes (medieval,
 * Norse, antique, fantasy: nothing modern or from the future), and nobody taller than a door allows.
 * One place for the hero's creator and for the townsfolk, so both offer and draw the same.
 */
import type { AllowOptions } from '@actors/generator';
import type { HeroLooks } from './HeroView';

export function allowOf(looks: Pick<HeroLooks, 'themes' | 'races' | 'maxHeightM'>): AllowOptions {
  return {
    races: [...looks.races] as AllowOptions['races'] & object,
    clothing: [...looks.themes] as AllowOptions['clothing'] & object,
    ...(looks.maxHeightM === undefined ? {} : { height: { max: looks.maxHeightM } }),
  };
}
