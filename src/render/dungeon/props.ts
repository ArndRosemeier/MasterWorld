/**
 * AssetGenerator's cellar props (public/props/cellar.fmpk, `npm run props`): fetched and decoded once,
 * the first time a cellar is built.
 */
import { decodePack } from '@futuremagic/props';
import type { PropModels } from '../../world/dungeon/propModels';

let loading: Promise<PropModels> | null = null;

export function loadCellarProps(): Promise<PropModels> {
  return (loading ??= fetch(`${import.meta.env.BASE_URL}props/cellar.fmpk`).then(async (res) => {
    if (!res.ok) throw new Error(`cellar props: ${res.status} ${res.statusText}`);
    return decodePack(new Uint8Array(await res.arrayBuffer()));
  }));
}
