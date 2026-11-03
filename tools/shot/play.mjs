/**
 * Play the build without vsync (`npm run play -- "<query>"` after `npm run build`): a real window on this
 * machine's GPU with the frame cap off, so the HUD's ms shows what a frame costs, not the screen's refresh.
 * A web page cannot turn vsync off itself; only the browser's switches can. `npm run play -- "?gl&hud"` plays
 * the WebGL 2 path. Sound is on (SHOT_SOUND=0 mutes it); the world is the checks' `masterworld` seed
 * (SHOT_SEED=fresh for a new one). Ends when the window is closed.
 */
process.env.SHOT_GPU ??= '1';
if (process.env.SHOT_SOUND === '0') delete process.env.SHOT_SOUND;
else process.env.SHOT_SOUND ??= '1';
const { launch, NO_VSYNC } = await import('./launch.mjs');

const query = process.argv[2] ?? '?hud';
const { server, base, browser } = await launch({ headed: true, args: [...NO_VSYNC, '--start-maximized'] });
const page = await browser.newPage({ viewport: null });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.goto(base + (query.startsWith('?') ? query : '?' + query));
console.log(`playing ${base}${query} without vsync; close the window to end`);
await new Promise((done) => browser.on('disconnected', done));
await server.close();
