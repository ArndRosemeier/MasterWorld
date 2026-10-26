# Talk camera, round 3: 82e2984 (may rise up to 1.2 m; v0.146)
RTX 5070, SHOT_GPU=1, 1920×1080. `talk-house.jpg`: `?title=0&day=0&hour=11&weather=fair&talk=house&topics=news`
(WebGL default). `2026-10-26-82e2984/01-talk.jpg`: the set's inn talk (SET_GL=0).

## Values (read ~6 s after the talk frames; partner = the x/z passed to `player.frameTalk`, hooked in the page)
| talk | talkShot | camera y − hero feet y | hero → partner | camera → partner (flat) |
|---|---|---|---|---|
| town, talk=house (Grundi Coalbeard) | { back 1.3, side 0.45, hits 0 } | 2.60 m | 1.60 m | 2.93 m |
| inn (Bell Goodbarrel) | { back 1.3, side 0.45, hits 0 } | 2.00 m | 1.30 m | 2.64 m |

In the town the camera rose 0.4 m more than in round 2 (2.2 m). The inn is unchanged at 2.0 m, so the ceiling stops it there.

## Hood
- Inn: only a sliver is left, the yellow hood tip at the bottom edge (about x 740–820, lowest ~50 px), the same as round 2.
- Town: NOT gone. The green hood is still at the bottom middle (about x 810–890, from y ~950 to the edge). It is a little smaller than in round 2.

## How the partner is framed
- Inn: Bell Goodbarrel is centred behind the counter and nothing cuts her. The view looks down a little, so the counter fills the lower half.
  The beams only touch the top edge, and no wrong sky or wall top shows. A guest's patterned shoulder and arm fill the left edge.
- Town: the camera now looks down steeply from 2.6 m. The nearest person is a fair-haired figure in a pale tunic, raising an arm,
  left of centre and about 2 m in front of the hero. That fits the 1.6 m distance, so it is probably Grundi. A second figure stands
  ~8 m off on the road, in the top centre. A house wall and thatch take the left third. Sky and sea show only at the
  top, behind the trees, which is correct for outdoors.
- Oddity (unverified): projecting the partner point (1 m above the ground) with the heroCam camera lands at the exact
  centre (960, 568), where only empty ground is drawn. The hero's head point (feet + 1.7 m) lands at (802, 659), but the hood is drawn
  at about (850, 1000). Either my read of the camera matrices is off (floating origin, or not yet updated for the drawn frame), or
  the drawn people stand somewhere other than their talk positions. Worth checking in the code.

Frame time of the set's talk shot in this run: p50 12.7 ms, p95 29.0 ms. This was not a quiet re-measure (none was asked for), so do not compare it.
