# Phase L round 13: cave mouth and cavern light fixes

Build b98f798 ("Cave mouths clear of the wall's face, daylight in the caverns"). Ref forced, no package-lock change. GPU, muted.

## 1. Shot set `--part=caves`: pass (exit 0)
- 13-cave-mouth: p50 10.4 / p95 19.8 ms, shaders 74 + 23, worst 12 ms, 0 violations
- 14-cave-cavern: p50 4.3 / p95 9.6 ms, shaders 74 + 33, worst 12 ms, 0 violations

**Mouth: fixed.** The tunnel is dark inside: a black-to-grey rock throat, with no tan terrain wall in it.
**The crag sits well:** tan cracked rock that matches the mesa wall in colour, standing out from the wall like a buttress; the wall's
banded face shows at the right. Small green leaf cards dot the crag. It doesn't look pasted on any more.

**Cavern: now readable, not black and not washed out.** In 14 the far wall shows as cracked dark rock with a darker opening
(a passage) at the right, and the floor shows slabs and reddish earth beyond the lantern. It's dim and moody.
Extra shots (cavern/, same way in and room as round 12):
- cavern-up-30: cracked rock overhead and around, with some form (bulges) visible.
- cavern-up-60: **a dome**, lit cool grey-blue from above, brightest near the top centre (the daylight). There's a curved roof with
  folds, and a dark spike or flake at the top right that may be a stalactite or a bat. I don't see a visible crack or light shaft,
  and no clear rows of stalactites.
- around-90/180/270: the rock walls are lit enough to read everywhere. The camera still ends up close to the hero in these, as if
  a wall is close behind, so the room's size doesn't come across from there. A bone pile shows on the floor at 90.
- Height: from the up-60 picture the dome reads as high, but no scale cue (column, hero against the wall) says "over 20 m".
- HUD in the cavern: **"2 built again alike (shaders.repeats())"**, the same as in round 12. The set's index shows 0 violations.

## 2. `npm run shot:mouths`: ok
cave: walked in on their own, went in, came out, walked 1.56 m out. Barrow and tower too. Shaders 83 + 8, worst 10 ms.
Inside the arch (cave-in-27) you now see a dark rock throat with the hero going in. Clean.

## 3. Shot sets land and town
- `--part=land`: pass. cellar 5.5, barrow 10.1, wild 7.6, fight 8.7, fight-magic 8.6, hamlet 10.9, road 7.5, village 11.6,
  hold 12.3, hold-crag 9.5, hold-warden 10.3, hurt-traveller 13.3, raided-farm 13.0 ms p50. 0 violations.
  The cellar picture (torch-warm) looks the same as round 12.
- `--part=town`: **FAIL (exit 1)**, as in round 11 and on main: title p50 18.1 ms and town-wet-sun 17.3 ms over 16.7.
  noon 12.5, dusk 14.0, night 15.4, rain 16.3, creator 14.4, trade 14.1, talk 13.4, inn 8.0. 0 violations.
  Night: the windows glow warm and look as before. The warm lights aren't changed by this.
