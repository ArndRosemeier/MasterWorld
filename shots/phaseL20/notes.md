# Phase L round 20: L7 kinds, seventh try

Build 5b8d2f9 ("L7: moor mauve over turf, badland crests as in round 18; shot set logs a stalled page"; the game shows v0.286).
Ref forced, no package-lock change, `npm run build`. GPU (`SHOT_GPU=1`, the set draws WebGL 2 at 1080p), muted.

## Stall
**No stall this round.** Kinds run 1 and run 2 both passed (exit 0) with all four pages ready in 16.7-25.4 s, and the land part passed
too (7 pages, ready in 16.3-23.7 s). No "NOT READY" block appeared, so there's nothing to copy. Tally so far: 2 stalls in 6 kinds runs
(rounds 18 and 19), 0 in this round's 2 kinds runs and 1 land run. The new logging is in place for the next one.

## Kinds: frame times (p50 / p95 ms), 0 shader violations, no page errors
| shot | run 1 | run 2 |
|---|---|---|
| downs | 9.7 / 30.6 | 9.7 / 34.1 |
| downs-aloft | 8.2 / 10.6 | 7.8 / 10.4 |
| moor | 8.8 / **38.6** | 7.8 / 15.1 |
| moor-aloft | 8.1 / 10.9 | 7.9 / 10.6 |
| karst | 7.6 / 18.0 | 7.7 / 16.7 |
| karst-aloft | 7.8 / 10.2 | 7.5 / 9.9 |
| badlands | 6.5 / 12.0 | 6.9 / 12.9 |
| badlands-aloft | 9.6 / 11.0 | 9.6 / 11.2 |
The pictures from both runs look the same (run1/ and run2/).

## Land: pass (exit 0), 0 violations
cellar 5.6, barrow 9.5, wild 8.4, fight 8.1, fight-magic 8.5, hamlet 9.9, road 7.9, village 11.2, hold 13.4 (p95 33.4),
hold-crag 10.0, hold-warden 10.0, hurt-traveller 12.1, raided-farm 11.6 ms p50. In line with earlier rounds.

## Moor colour
**No mauve shows.** The ground is now **olive-green / khaki** turf with straw blades, and from above it's an even olive-brown plain.
Measured: the average colour of the near ground in 15-kind-moor is **RGB (90, 92, 42)**. Green is the top channel and blue is low,
so it's olive and has no purple in it. It's better than the rust and terracotta of rounds 18-19 and reads as dry grass heath or steppe,
but not heather moor. Either the mauve hue isn't applied, or the grass blades (straw) and the turf texture cover it. From above it's olive,
not mauve. There are still no tors in view at this spot, about 20 trees from above, and the green field disc with its village.

## Badland crest teeth
**Mostly gone.** From above (badlands-crest-crop.png) the crests are rounded again, as in round 18. Only faint small notches remain
on one or two ridges (right of centre); the rows of spikes from round 19 are gone. The ridges are taller than in round 18.
On foot it's the same sand valley with wind ripples and the camp as round 19, so it still reads as desert or dunes on foot.

## Other kinds (unchanged from round 19)
Downs: open green swells, about 30 trees. Karst: limestone scree, dolines, about 45 trees.

## Artefacts
Nothing floating, no holes, no black pixels. The field-disc ring on moor-aloft remains.
