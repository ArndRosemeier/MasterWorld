# Phase L round 15: L7 kinds, second try

Build a207778 ("L7: each kind of country wears its own ground; fewer trees; shots from above"; the game shows v0.281). Ref forced,
no package-lock change, `npm run build`. GPU (`SHOT_GPU=1`, the set draws WebGL 2 at 1080p), muted.

## `--part=kinds`: pass (exit 0), 0 shader violations, no page errors
| shot | p50 | p95 |
|---|---|---|
| 13-kind-downs | 11.3 | 17.7 |
| 14-kind-downs-aloft | 8.1 | 10.4 |
| 15-kind-moor | 9.5 | 13.6 |
| 16-kind-moor-aloft | 7.5 | 10.0 |
| 17-kind-karst | 7.2 | 11.4 |
| 18-kind-karst-aloft | 7.7 | 10.1 |
| 19-kind-badlands | 8.0 | 14.3 |
| 20-kind-badlands-aloft | 9.1 | 12.1 |
(The round 14 p95 spikes of 47.6 and 30.3 ms are gone.)

## Judgement per kind
- **Downs: half.** The ground is now right: bright short green turf, smooth swells, no leaf litter. But there are **too many trees**.
  On foot, round crowns stand along a slope and an oak and birch at right, half wood. From aloft the swells are covered with
  hundreds of scattered round trees (a park or savanna), so it isn't open. A green band at far left shows dense contour-like
  dark stripes (see artefacts).
- **Moor: no.** The ground is the same bright green turf as downs, with pale straw grass tufts. No brown heather.
  On foot there are trees on the skyline; aloft the near land is green swells with **as many trees as downs**. Tors do show aloft:
  2-3 pale tan rock knobs on the hilltops (centre and right) with small grey boulders around, which is new and right. The distant land
  beyond is darker olive and brown, more moor-like, but it's far away.
- **Karst: partly.** On foot it's green rolling turf with trees and tan rock scars in the middle distance. Aloft it's the best
  of the four: green land broken by **tan stepped limestone scarps and terraces** (pavement-like), with small white rock patches.
  It reads as limestone country. But **no round sinkholes are visible**. The few hollows read as shadows, not pits. And it's grey-green?
  No, it's the same bright green turf.
- **Badlands: yes, mostly.** Bare tan and clay ground everywhere, almost no green. On foot: a sharp ridge rising steeply to the right
  with fine vertical flutes (gully runnels) down its face, a smooth dune-like slope in front, and grey weathered patches.
  Aloft: a sea of **sharp tan ridges and gullies** to the coast, a strong badlands read. However: about **25-30 round green trees** stand
  on the bare clay aloft (and 2 bushes on foot), which contradicts "no trees". And the ground is very pale sand-coloured, closer to
  dunes than clay; the smooth slopes on foot look like sand dunes.

## Artefacts
- **Badlands ridge crests show small saw-teeth** (aloft, along many ridge tops, a jagged comb on the crest line), the same
  W-teeth look as the mesa walls in rounds 2-4.
- **Downs-aloft, far left hill:** dense dark green **contour stripes** (wavy parallel bands) on the slope, like a stretched ground pattern.
  The far land in moor-aloft and the background in downs-aloft show the same banded or zebra texture at distance.
- **Seam:** badlands-aloft has a hard edge where tan badlands ground meets green grass at the right (a bright lime green strip, then
  dark green). It's abrupt but plausible as a border. Downs-aloft has a sharp straight shadow-like edge between darker and lighter green
  areas lower left (a ground-colour change along a straight line).
- No floating things, no holes, no black pixels.

## Summary
The ground per kind changed visibly (turf, clay), and the aloft shots finally show form. Badlands reads; karst reads as limestone but
without sinkholes; downs has the right turf but far too many trees; moor isn't there yet (green turf, too many trees; only the tors are right).
