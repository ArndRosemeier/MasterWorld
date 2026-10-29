# Gate L shots (round 21)

Build 005e397 ("Keep gate L on main's history"; note: **the game footer shows v0.282**, lower than round 20's v0.286).
Ref forced, no package-lock change, packs current, `npm run build`. GPU (`SHOT_GPU=1`, the set draws WebGL 2 at 1080p), muted,
quiet PC (GPU 0 % before the runs). F2: median ≤ 16.7 ms, p95 ≤ 25 ms.

## Caves part (with the new mesa session)
**Run 1 failed** (log-caves-run1-no-tor.txt): mesa-valley and mesa-plateau were taken, then the tor act threw
`Error: no tor round the start` (set.mjs:148) and the run crashed (exit 1). I checked in the game: from the start (-23896, 36102)
the **nearest tor is 8885 m away** (then 9065, 9139, ...), and the act only searches `landforms.within(s.x, s.z, 6000)`. There are
4241 tors within 30 km, none within 6 km of the new mesa-valley start. So the shot's radius is too small for this start (or tors
should be nearer the start).
**Run 2** with a temporary local copy of set.mjs searching 10 km (deleted afterwards; nothing committed): pass, exit 0.

| shot | p50 | p95 | F2 | judgement |
|---|---|---|---|---|
| 21-mesa-valley | 10.5 | 14.7 | ok | **Partly.** On the valley floor by a farm, plateau walls left and right. But the camera stands **behind a paddock fence** whose rails fill a third of the frame. The left wall's top edge shows **saw teeth** (a row of pale triangular spikes along the crest). The right wall reads as rock, wooded on top. |
| 22-mesa-plateau | 9.9 | 14.1 | ok | **No.** The hero stands **in an oak wood** on leaf litter, with a slope rising at right. No rim, no view out, nothing says "plateau top". |
| 23-tor | 8.7 | 20.5 | ok | **No tor in view.** At left a reddish-brown wall with **regular vertical grey grooves** (stripes, like organ pipes); at right a pale grey bare slope close to the camera, which may be the tor itself seen far too close. No boulders. The camera sits right behind the hero's back. |
| 24-climb | 10.5 | 12.8 | ok | **Yes, mostly.** The hero is on the face with both arms up, hands over the head; "NOT 8 m UP" didn't print. But it's seen **from above and behind, looking down the face**, not from the side, and no holds are visible. The cracked rock reads well. |
| 25-cave-mouth | 10.4 | 17.9 | ok | **Yes.** A dark round mouth in a tan crag at a cliff foot, with the hero walking up. A **tree trunk in the foreground** covers the left third. |
| 26-cave-cavern | 4.4 | 10.0 | ok | **Yes.** Dark rock walls with a passage opening, a slab floor and the hero in lantern light. Dim but readable. |
0 shader violations, no page errors. No floating rocks, holes or black pixels in these six.

## Full gate set (one run each)
**No stall anywhere** (no NOT READY block; all pages ready in 16.7-31.3 s).

**Town: FAIL (exit 1)**: title p50 **19.5** / p95 40.5. The rest: creator 12.3/15.1, noon 12.2/16.3, pack 5.6/16.2, map 7.8/17.8,
dusk 13.9/19.0, night 15.3/**37.9**, rain 14.4/19.9, paddock 10.8/17.6, trade 10.2/14.0, wet-sun 13.6/16.5, inn 10.6/**27.0**, talk 15.2/**48.8**.

**Land: FAIL (exit 1)**: village p50 **17.3** / p95 37.8. **A rerun of the village alone gave 13.8 / 19.0** (it was 11.2-11.6 in rounds 14-20),
so it's borderline or noisy, not a clear break. The rest: cellar 5.4/15.3, barrow 9.9/15.0, wild 7.7/10.6, fight 9.5/15.8, fight-magic 10.9/12.8,
hamlet 10.3/14.9, road 8.1/10.7, hold 12.8/**35.9**, hold-crag 9.8/12.6, hold-warden 10.6/12.6, hurt-traveller 12.4/16.8, raided-farm 11.2/14.7.

**Kinds: pass (exit 0)**: downs 10.4/**32.7**, downs-aloft 8.1/10.5, moor 8.6/16.9, moor-aloft 8.2/11.1, karst 10.2/**49.8**,
karst-aloft 8.5/10.6, badlands 8.5/**36.4**, badlands-aloft 9.9/11.6. The pictures look as in round 20 (moor olive-khaki, not mauve).

### Over F2
- Median over 16.7: **title 19.5** (town; known since round 11, also on main), **village 17.3** (rerun 13.8).
- p95 over 25 (set.mjs doesn't mark these): title 40.5, town-night 37.9, inn 27.0, talk 48.8, village 37.8, hold 35.9,
  kind-downs 32.7, kind-karst 49.8, kind-badlands 36.4. All the on-foot kinds shots have had p95 of 30-50 ms since round 18.

## To fix for the gate
1. The tor shot: search further than 6 km (the nearest tor is 8.9 km away) or seed tors near the start, and frame the tor from a distance.
2. mesa-plateau: pick a spot on the rim in the open (not in woods), facing out over the valley.
3. mesa-valley: keep fences out of the camera; saw teeth on the left wall's crest.
4. tor shot's wall: vertical grey grooves (stripes) on the cliff.
5. climb: side view, as the shot intends.
6. title p50 19.5 ms.
