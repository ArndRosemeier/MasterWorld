# Phase L round 18: L7 kinds, fifth try

Build 6c16c08 ("L7: bareness blends on a log scale across a kind's border; moor and karst floors"; the game shows v0.284).
Ref forced, no package-lock change, `npm run build`. GPU (`SHOT_GPU=1`, the set draws WebGL 2 at 1080p), muted.

## A hang on the first run
Run 1 (set-kinds-log-run1-hang.txt): **kind-karst never became ready (120 s timeout)**. Its picture is plain black, and then the set
crashed with `TypeError: Cannot read properties of undefined (reading 'player')` in the aloft act (set.mjs:104), exit 1.
Downs and moor were fine in that run. Loading `?kind=karst` on its own afterwards worked twice (WebGPU 15 s, WebGL 2 19 s;
karst-probe*.png), and **run 2 of the whole set passed** (karst ready in 17 s). So it's a one-off hang, not reproduced. The set
could guard the act against `window.game` being undefined so a slow page fails cleanly.

## `--part=kinds` run 2: pass (exit 0), 0 shader violations, no page errors
| shot | p50 | p95 |
|---|---|---|
| 13-kind-downs | 9.6 | 32.6 |
| 14-kind-downs-aloft | 8.5 | 11.5 |
| 15-kind-moor | 8.6 | 33.7 |
| 16-kind-moor-aloft | 8.2 | 10.7 |
| 17-kind-karst | 7.9 | 27.9 |
| 18-kind-karst-aloft | 7.9 | 10.6 |
| 19-kind-badlands | 7.0 | 21.6 |
| 20-kind-badlands-aloft | 9.2 | 10.5 |
(The p95 values on foot (22-34 ms) are higher than round 17 (14-25); aloft they stay at about 11 ms.)

## Trees from above (counted)
- downs-aloft: about **30** (round 17: 70)
- moor-aloft: about **20** (round 17: 250), as expected
- karst-aloft: about **90**, including a dense copse in the middle
- badlands-aloft: **4** (round 17: 22), as expected

## Judgement per kind
- **Downs: yes.** On foot: big smooth bright-green swells, a valley, about 10 trees on the skylines, and a tan scar with a stream at right.
  Open and grassy, it reads as downland. Aloft: open green slopes to the sea, about 30 single trees, a town by the shore. Good.
- **Moor: no, now it reads as red desert.** The floor is **brick-red / rust leaf litter** with pale straw grass. From above the whole plain
  is a flat rust-red sheet with mesa walls all round. It looks like the Australian outback or red-rock desert, not brown or purple heather.
  The hue overshoots far into red. On foot there's one big tree, one conifer and a bush group; aloft about 20 trees (fine).
  **No tors or boulders in view** in either shot (the new spot has none). Also aloft: a round **green patch of fields with a
  village** sits in the middle of the red plain with a soft but obvious ring edge, and a small pond.
- **Karst: much better.** On foot the floor is **grey limestone scree** (rounded grey stones) with sparse yellow-green grass. It clearly reads as
  limestone ground. Aloft: grey-green land with tan-rimmed **round hollows** (lower left, about 200-450 x 680-780, and several smaller
  bowls in the middle distance), which read as dolines, plus the stepped tan scarps behind. But the trees are many: about 90 aloft and
  about 40 on the horizon on foot.
- **Badlands: bare now, but reads as dunes.** Aloft: peach-pink ground with soft rounded ridges and gullies, only 4 trees. On foot:
  smooth pink sand with **wind ripples**, rounded dune-like rises, one tree. With the crests rounded, it looks like a sand-dune desert
  more than clay badlands with knife ridges. The grey-blue patches on the slopes (weathered faces) still read as rock.

## Badland crest teeth
**Gone.** No teeth or notches on the crests in either shot. But the crests are now soft and rounded; there are no knife ridges left.

## Other artefacts
- Moor-aloft: the round green field-and-village disc in the red plain (a ring seam).
- Downs and badlands aloft: the far land's banded texture is much weaker than before. The lime seam is gone from badlands.
- Nothing floating, no holes, no black pixels (apart from the black karst frame in the hung run 1).
