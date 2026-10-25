/**
 * The page's first script, kept small: it shows the title (or the loading screen) at once, then fetches
 * the game's code (three.js and the rest, a few megabytes) and starts it (plan D46: the title covers the
 * whole start, from the first second). Nothing here may import three.js or the game.
 */
import { LoadingScreen } from './app/loading';
import { params } from './app/params';
import { SettingsStore } from './app/settings';
import { Sound } from './app/sound';
import { Title } from './app/title/title';
import type { Menu } from './app/menu';

const settings = new SettingsStore();
const sound = new Sound();
sound.volume = settings.current.volume;
const menus: { menu: Menu | null } = { menu: null };
const calm = settings.current.calm || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const title = params.title ? new Title(Title.drawToday(), sound, { openSettings: () => menus.menu?.show('settings'), whatsNew: () => menus.menu?.show('news') }, calm) : null;
const loading = title?.screen ?? new LoadingScreen();
loading.set('Fetching the world');
// The game's code; if it cannot be fetched, the screen says so (start reports its own failures).
const game = await import('./main').catch((err: unknown) => {
  loading.fail('Could not load the game', err instanceof Error ? err.message : String(err));
  throw err;
});
await game.start({ settings, sound, title, loading, menus });
