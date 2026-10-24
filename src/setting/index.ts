/** Every setting module the engine can load, by id. */
import type { SettingModule } from './contract';
import { classic } from './classic/index';

export const SETTINGS: Readonly<Record<string, SettingModule>> = { classic };

export function settingById(id: string): SettingModule {
  const s = SETTINGS[id];
  if (!s) throw new Error(`unknown setting module "${id}"`);
  return s;
}
