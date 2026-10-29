# Phase L round 16: L7 kinds, third try

Build b9ea533 ("L7: downs and moor nearly treeless, heather moor, karst dolines, rounded badland crests"; the game shows v0.282).
Ref forced, no package-lock change, `npm run build`. GPU (`SHOT_GPU=1`, the set draws WebGL 2 at 1080p), muted.

## `--part=kinds`: pass (exit 0), 0 shader violations, no page errors
| shot | p50 | p95 |
|---|---|---|
| 13-kind-downs | 10.5 | 15.2 |
| 14-kind-downs-aloft | 8.2 | 10.5 |
| 15-kind-moor | 8.9 | 14.0 |
| 16-kind-moor-aloft | 7.2 | 9.8 |
| 17-kind-karst | 6.9 | 9.2 |
| 18-kind-karst-aloft | 7.6 | 10.3 |
| 19-kind-badlands | 8.0 | 14.5 |
| 20-kind-badlands-aloft | 8.8 | 12.2 |

## Judgement per kind (compared with round 15)
- **Downs: better, still too many trees.** On foot: a wide open green turf slope down to the sea, with clumps of round trees along
  the skyline and a group at right, fewer than before and the view is open now. Aloft: clearly thinner than round 15 (about half),
  but still about 100 scattered round trees over the swells, so it reads as parkland, not bare downs. The turf and swells are right.
- **Moor: not yet.** The ground hue moved from green to **olive / yellow-ochre** with pale straw tufts. It's drier, but **not purple-brown heather**.
  On foot there are still 6-8 trees on the skyline. **Aloft the trees look unchanged from round 15** (the same layout, a few hundred round crowns).
  So "nearly treeless" isn't reached here. Tors with boulders on the hilltops show aloft, as before. The far land beyond is a dark
  green and ochre banded texture.
- **Karst: dolines visible on foot.** The on-foot shot stands **inside a big round grassy hollow**: the land rises evenly all round
  to a rim against the sky, which is a clear doline. Aloft: the same tan stepped scarps as round 15, and now a few soft round
  hollows can be made out in the green (shaded bowls lower centre and right), but they're subtle from 120 m, without a rim edge or
  darker floor. The turf is still bright green, not grey-green or drier.
- **Badlands: mostly, but trees remain.** The ground is a little pinker, pale peach-clay, still close to sand. On foot it's the same sharp ridge
  with gully flutes, and **3 green bushes** on it. Aloft: the sharp ridges and gullies to the coast, and **about 25-30 round trees still
  stand on the bare clay**, the same layout as round 15. So "no trees" isn't applied (to trees or bushes) here.

## Badlands crest saw teeth: reduced, not gone
Aloft, the crests are softer than round 15. Most ridge tops are now a rounded line, but small notches and teeth still show along
several crests (centre, about 900-1000,620 and the ridge running right at 1400-1800,640, and further back). On foot the ridge top
right of centre is smooth.

## Other artefacts
- Far land behind moor-aloft and downs-aloft (far left hill): dense dark **wavy contour bands** (zebra texture), unchanged.
- Badlands-aloft: the hard seam to green ground at right (lime strip), unchanged.
- No floating objects, holes or black pixels.

## Suspicion
The trees in moor-aloft and badlands-aloft match round 15 almost tree for tree, while downs did thin. Maybe the tree rule
applies to downs only, or the moor and badlands aloft views are of land that isn't classed as that kind (a border zone).
