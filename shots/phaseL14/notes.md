# Phase L round 14: L7 landscape kinds

Build fcb4975 ("Keep L7 on main's history"; the game shows v0.280). Ref forced, submodule updated, no package-lock change,
`npm run packs`, `npm run build`. GPU (`SHOT_GPU=1`, the set draws WebGL 2 at 1080p), muted.

## `--part=kinds`: pass (exit 0), 0 shader violations, no page errors
| shot | p50 | p95 |
|---|---|---|
| 13-kind-downs | 11.6 ms | **47.6 ms** |
| 14-kind-moor | 8.9 ms | 13.3 ms |
| 15-kind-karst | 10.0 ms | 30.3 ms |
| 16-kind-badlands | 8.8 ms | 14.7 ms |

## Judgement: do they read as their kind?
All four are taken from the hero's eye height at the ground, behind the hero. From there the landform barely shows, and three of
the four look like ordinary wooded or leafy rolling land.

- **downs: no.** The hero stands in a wood: dense broad-leaf trees all round, leaf litter, bushes, a slope rising at the back.
  No big rounded grassy swells and no open view. It reads as woodland, which is the opposite of "few trees".
- **moor: weak.** Broad, gentle swells are visible (a long rise to the back, a smooth fold in front), which fits. But the ground is
  brown leaf litter with grass tufts, and there are many trees (round crowns along the skyline, an oak at right).
  **No tors and no boulders in view.** It reads as open wood-pasture more than moor.
- **karst: partly.** The most distinct of the four: bright green rolling small hills with clumps of round trees, and pale tan
  bare patches and scars on the slopes in the middle distance (eroded edges?) with a low white rubble heap at centre left.
  Some dark hollows by the trees might be sinkholes, but **no clear sinkhole (a round pit in the grass) is in view.**
  The bright, even green is much more saturated than in the other shots.
- **badlands: no.** One big smooth rounded hill covered in brown litter and grass with round trees on it, and a pale grey bare
  patch on its flank (top left). **No sharp ridges, no gullies, no bare banded rock.** It reads as a grassy hill.

Suggestion: an elevated or far camera (like the overview shots: 100-300 m up, looking across) would show each kind's shape. Also the
kinds' ground and trees look the same as everywhere else; only karst's colour differs.

## Artefacts
None seen: nothing floats, no stripes, no saw teeth, no holes, no black pixels. The downs p95 of 47.6 ms and karst 30.3 ms are spikes
in otherwise smooth runs (p50 ~10 ms).

## `--part=land`: pass (exit 0), 0 violations
| shot | p50 now | round 13 | round 12 |
|---|---|---|---|
| cellar | 5.4 | 5.5 | 5.1 |
| barrow | 10.3 (p95 28.9) | 10.1 | 10.5 |
| wild | 7.7 | 7.6 | 7.4 |
| fight | 8.4 | 8.7 | 8.6 |
| fight-magic | 8.5 | 8.6 | 9.1 |
| hamlet | 10.2 | 10.9 | 11.1 |
| road | 8.5 (p95 24.5) | 7.5 | 7.4 |
| village | 11.4 | 11.6 | 11.5 |
| hold | 13.1 (p95 35.7) | 12.3 | 11.6 |
| hold-crag | 9.1 | 9.5 | 9.1 |
| hold-warden | 10.1 | 10.3 | 10.4 |
| hurt-traveller | 12.0 | 13.3 | 9.8 |
| raided-farm | 11.4 | 13.0 | 12.6 |
In line with earlier rounds (within about 1 ms); no regression.
