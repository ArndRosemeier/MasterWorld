# Phase L round 17: L7 kinds, fourth try

Build e8fb863 ("L7: fewer bushes on bare land, heather hue, rounder crests; swells back for the loop"; the game shows v0.283).
Ref forced, no package-lock change, `npm run build`. GPU (`SHOT_GPU=1`, the set draws WebGL 2 at 1080p), muted.

## `--part=kinds`: pass (exit 0), 0 shader violations, no page errors
| shot | p50 | p95 |
|---|---|---|
| 13-kind-downs | 10.2 | 25.4 |
| 14-kind-downs-aloft | 8.1 | 10.3 |
| 15-kind-moor | 8.4 | 14.2 |
| 16-kind-moor-aloft | 7.4 | 9.5 |
| 17-kind-karst | 7.0 | 17.0 |
| 18-kind-karst-aloft | 7.8 | 10.4 |
| 19-kind-badlands | 7.4 | 17.4 |
| 20-kind-badlands-aloft | 8.4 | 12.1 |

## Trees or bushes? (moor and badlands from above)
**They are trees.** Zoomed in (moor-aloft-crop.png), every round crown stands on a visible **trunk** and casts a tree-shaped shadow
with a stem; some are slim conifers with a stem. No low bushes. Counts:
- moor-aloft: about **250** trees (I counted about 60 in the near half, densely packed rows along the far rise). The same as rounds 15 and 16.
- badlands-aloft: about **22** trees with trunks (round 16: 25-30), on the bare clay.
- On foot: badlands shows 3 bushes and 1 slim tree; moor shows 6-8 full trees on the skyline.
So cutting bushes didn't change these views: the round things are trees, and the tree rule isn't reaching moor or badlands.

## Judgement per kind
- **Downs: open, but trees remain.** On foot: a fine open green valley of big smooth swells down to the sea with a farmstead. It reads
  like downland. About 20 trees stand on the slopes, though (a clump left, scattered right). Aloft: about 70 trees (round 16 about 100),
  scattered over the swells. Bare 0.99 isn't what this view shows.
  **New:** 5 flat dark green ovals with pale rims on the left (about 300-520, 700-830). They look like karst dolines or small
  ponds lying in the downs.
- **Moor: not yet.** On foot the ground is olive-ochre with brown soil flecks and straw blades: drier, but **not mauve or purple heather**,
  and no darker blades are visible. 6-8 trees on the skyline. Aloft: olive-ochre ground, the tors with boulders on 3 hilltops (right),
  and about 250 trees (above). It reads as dry savanna or parkland, not moor.
- **Karst: the doline on foot is good.** The hero stands in the big round grassy bowl, rising all round to a rim. That's clearly a doline.
  Aloft: the stepped tan limestone scarps read well. Soft round hollows are faint, and **no clear doline bowl from above**.
  The turf is still bright green (not grey-green or drier). About 80 trees.
- **Badlands: mostly.** The clay is now peach-pink and a bit redder than before, but still light. Sharp ridges and gullies to the coast
  read well from above, with about 22 trees. On foot **the camera is pushed right up behind the hero's head**: the head and shoulders
  fill the lower middle of the frame (probably a slope behind or a wall pushing the camera in). Behind: the smooth rounded clay ridge
  with flutes, 3 bushes, one slim tree, and a pale rock peak at right.

## Badland crest saw teeth: mostly gone
From above most crests are now rounded lines. Only a few small notches remain (for example the ridge at about 1040-1200, 590). It's much better than rounds 15-16.

## Other artefacts
- Far land in moor-aloft (and the far-left hill in downs-aloft): the dense dark **wavy contour bands** remain.
- Badlands-aloft: the lime-green seam to the grass at the right remains.
- The ovals in downs-aloft (above).
- Nothing floating, no holes, no black pixels.
