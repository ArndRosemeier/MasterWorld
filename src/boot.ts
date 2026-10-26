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
import { installPackFetch } from './workers/packFetch';

// The people's and animals' packs: the start's files come as one bundle and stay in the browser's cache; the rest
// come one by one, queued and retried (a static host answers a burst with 503s). See workers/packStore.ts.
const packs = installPackFetch(globalThis, import.meta.env.BASE_URL, { tidy: true });

// A tool page (`?bake=…`), not the game.
if (params.bake) await import('./app/bake').then((b) => b.bake(params.bake ?? ''));

const settings = new SettingsStore();
const sound = new Sound();
sound.volume = settings.current.volume;
const menus: { menu: Menu | null } = { menu: null };
const calm = settings.current.calm || !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const title = params.title ? new Title(Title.drawToday(), sound, { openSettings: () => menus.menu?.showDialog('settings'), whatsNew: () => menus.menu?.showDialog('news') }, calm) : null;
const loading = title?.screen ?? new LoadingScreen();
loading.set('Fetching the world');
// The start's people and animals download beside the game's code (the title already shows).
if (!params.bake) void packs.warm();
// The game's code; if it cannot be fetched, the screen says so (start reports its own failures).
const game = await import('./main').catch((err: unknown) => {
  loading.fail('Could not load the game', err instanceof Error ? err.message : String(err));
  throw err;
});
await game.start({ settings, sound, title, loading, menus });
