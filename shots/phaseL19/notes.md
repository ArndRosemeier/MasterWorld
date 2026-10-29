# Phase L round 19: L7 kinds, sixth try

Build 800ce42 ("L7: moor heath brown not rust, karst fewer trees, badland knife ridges back"; the game shows v0.285).
Ref forced, no package-lock change, `npm run build`. GPU (`SHOT_GPU=1`, the set draws WebGL 2 at 1080p), muted.

## The hang came back
Run 1 (set-kinds-log-run1-hang.txt): downs, moor and karst were fine, then **kind-badlands didn't get ready for 120 s**. Its picture
is taken anyway (17/19-…, p50 32 ms), and the new wait in the aloft act timed out (`page.waitForFunction: Timeout 120000ms exceeded`,
set.mjs:105), crash, exit 1. So the guard works (a clean timeout instead of a TypeError), but the page still hangs.
`?kind=badlands` on its own loaded fine twice (WebGL 2, about 19 s; badlands-probe-1/2.png), and run 2 of the whole set passed.
**It's now 2 hangs in 4 set runs (rounds 18 and 19), both times the 3rd or 4th page of the set run (karst, then badlands),
never a page on its own.** That points to a page later in a set run (a new context after earlier ones) sometimes stalling while
loading. The browser console in the passing run 2 showed nothing unusual. I couldn't catch the console of a hanging page; next time,
`SHOT_LOG`-style console capture in set.mjs would show where it stops.

## `--part=kinds` run 2: pass (exit 0), 0 shader violations, no page errors
| shot | p50 | p95 |
|---|---|---|
| 13-kind-downs | 9.1 | 31.6 |
| 14-kind-downs-aloft | 7.9 | 10.4 |
| 15-kind-moor | 8.7 | 32.6 |
| 16-kind-moor-aloft | 8.2 | 10.4 |
| 17-kind-karst | 7.8 | 21.0 |
| 18-kind-karst-aloft | 8.1 | 10.5 |
| 19-kind-badlands | 6.6 | 12.6 |
| 20-kind-badlands-aloft | 9.7 | 11.2 |

## Trees from above (counted)
downs about **30**, moor about **20**, karst about **45** (round 18: 90), badlands **1** (a single small tree in the middle).

## Judgement per kind
- **Downs: yes (unchanged).** Open bright-green swells to the sea, about 30 single trees, a stream and a pale scar, a coastal town.
- **Moor: better, but still reads as dry desert, not moor.** The hue moved from rust-red to **orange-brown / terracotta**, closer to
  brown, but there's still no purple or mauve to be seen. On foot it's orange-brown leaf litter with straw grass and a big tree; from above it's a flat
  orange-brown plain ringed by mesa walls, with about 20 trees. It reads like a dry red-earth plain or savanna. Heath and moor read
  would need a darker, duller brown and some purple, plus rolling swells (this spot is a flat basin). No tors in view.
  The round green **field disc with the village** still sits in the plain with a soft ring edge.
- **Karst: yes, mostly.** On foot it's grey limestone scree with sparse grass (good) and about 25 trees on the skyline. From above it's grey-green
  land with tan-rimmed round **dolines** (lower left and centre), the stepped scarps behind, and about 45 trees, half of round 18.
- **Badlands: taller, but still dune-like on foot; teeth back from above.**
  On foot: a new spot, a **sand-floored valley with wind ripples** between tall smooth slopes, the right slope rising 40+ m and
  weathered grey-tan. Two tents and a cart (a camp) at right. It reads as desert dunes or a sand valley, not clay badlands.
  From above: much taller ridges and gullies, a strong eroded-land read, and only 1 tree.

## Badland crest teeth: back
From above (badlands-teeth-crop.png) the sharper crests carry **regular saw teeth again**: small triangular spikes in rows along
several ridge tops (right half, about 1300-1900, 520-640, and the ridge at about 1500-1700, 600). Smaller than rounds 15-16, but clearly there.
The crests on foot are smooth.

## Other artefacts
- Moor-aloft: the green field disc (ring seam) as in round 18.
- Downs-aloft: a thin dark line in the stream bed (a narrow water ribbon), fine.
- Nothing floating, no holes, no black pixels.
