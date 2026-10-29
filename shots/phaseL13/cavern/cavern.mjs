// Into the cave's highest room (as set.mjs does), then pictures looking up and around.
import { launch } from 'file:///C:/Projekte/MasterWorld-shotwt-phaseL/tools/shot/launch.mjs';
const out = process.argv[2];
const { server, base, browser } = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => { if (m.type() === 'error') console.error(`[page] ${m.text()}`); });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.goto(base + '?title=0&day=0&hour=11&weather=fair&cave&hud');
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 180000 });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.waitForTimeout(3000);
const info = await page.evaluate(async () => {
  const g = window.game, d = g.log.find((x) => x.kind === 'dungeon' && x.template === 'cave');
  const v = d && await g.cellars.build(d.id);
  const rooms = v.cellar.graph.rooms, top = rooms.reduce((a, r) => (r.height > a.height ? r : a), rooms[0]);
  await v.enter(true, top.id);
  return { rooms: rooms.length, topHeight: top.height, heights: rooms.map((r) => +r.height.toFixed?.(1) || r.height) };
});
console.log('cave', JSON.stringify(info));
await page.waitForTimeout(4000);
const cam = async () => page.evaluate(() => window.game.player.heroCam);
const shots = [['up-30', 0, 0.55], ['up-60', 0, 1.05], ['around-90', Math.PI / 2, 0.35], ['around-180', Math.PI, 0.35], ['around-270', -Math.PI / 2, 0.35]];
const yaw0 = await page.evaluate(() => window.game.player.heroCam.yaw);
for (const [name, dy, pitch] of shots) {
  await page.evaluate(([y, p]) => { const c = window.game.player.heroCam; c.yaw = y; c.pitch = p; }, [yaw0 + dy, pitch]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/cavern-${name}.jpg`, quality: 85 });
  console.log(name, (await page.textContent('#hud')).split('·').slice(0, 4).join('·'));
}
await browser.close(); await server.close();
