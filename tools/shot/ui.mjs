/**
 * Screenshots of the game's windows and HUD in warded brass (plan 17.1), a slow check run by hand after
 * `npm run build`: `node tools/shot/ui.mjs <out dir> ["<query>"]`, best with SHOT_GPU=1 on a machine with a
 * graphics card. It gives the hero one uncommon, rare and legendary thing (so the cards show every ward),
 * then for each window takes one picture during its entrance and one at rest; then the found cards on the
 * HUD and the compass. Prints the page's console errors.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const [out = 'shots', query = '?title=0&hour=10'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const { server, base, browser } = await launch({ headed: !!process.env.SHOT_HEADED });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (m.type() === 'error') console.error(`[page] ${m.text()}`); });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.goto(base + (query.startsWith('?') ? query : '?' + query));
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 300000 });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.evaluate(() => {
  const c = window.game.character, weapon = c.worn.main?.def ?? c.pack[0]?.def;
  const make = (rarity, name, bonuses, lore) => ({ def: weapon, rarity, name, bonuses, lore });
  window.__finds = [
    make('uncommon', "Hunter's blade", { blades: 2 }),
    make('rare', 'Frostbound edge', { blades: 4, dodging: 2 }, 'Cold to the touch, even in summer.'),
    make('legendary', 'Wardbreaker', { blades: 8, perception: 3 }, 'Forged before the Fading, waiting since.'),
  ];
  c.pack.push(...window.__finds);
});
await page.waitForTimeout(1500);
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
await shot('hud');
for (const [name, key] of [['pack', 'KeyI'], ['journal', 'KeyJ'], ['map', 'KeyM'], ['settings', 'Escape']]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(350);
  await shot(`${name}-enter`);
  await page.waitForTimeout(2600);
  await shot(name);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}
await page.evaluate(() => { const h = window.game.fightHud; h.shown = true; h.showFinds({ items: window.__finds, coins: 27 }); });
await page.waitForTimeout(500);
await shot('finds-enter');
await page.waitForTimeout(2500);
await shot('finds');
console.log(`pictures in ${out}`);
await browser.close();
await server.close();
process.exit(0);
