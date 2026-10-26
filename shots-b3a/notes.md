# B3a screenshots (PR #184, branch claude/project-thread-xt7cbd @ f786912)

Taken on the desktop GPU with WebGPU (`SHOT_GPU=1`, no `?gl`), 1280x800, `SHOT_WAIT=3000`, `SHOT_LOG=1`.
Full page console for each shot is in `console-<name>.txt`. **No page errors and no console errors in any shot**; shader policy ok everywhere (0 violations, worst block 8–20 ms).
Frame time: first value is from the HUD in the picture, second is the HUD read right after the screenshot.

| shot | frame time | what is visible |
|---|---|---|
| village-arrive | 16.7 / 16.3 ms | Hero outdoors in a fenced pasture with a cow, village behind: half-timbered houses, red and thatched roofs, a round stone tower with a dome. HUD: regions 43 (1 place drawn), towns 3 (106 folk). Looks right. |
| village-inn-room | 15.1 / 22.1 ms | Indoors, HUD "in inn #12 of region-37 storey 0". The house is drawn open with its interior: plank floor, plaster walls, stone chimney, ceiling beams, a bench, two windows showing the village outside, and an innkeeper behind the counter. **Problem: a large flat pure-black box fills the left-centre of the picture (about 870x290 px)**, with no texture or shading; it sits where the bar counter should be, so the counter (or something in front of the camera) seems to render black. A few loose green leaf sprites float beside the chimney, inside the room. |
| village-shop | 15.7 / 16.8 ms | Trade panel open: "The smithy", Gerd Anvilmar's wares (knife, dagger, swords, hatchet, axe, mace, spear, buckler, round shield, iron cap, mail shirt) with prices, "Your pack" (healing draught x2, bread, both "not their trade"), purses at the bottom. Village street and folk visible behind the panel. Looks right. |
| hamlet-house | 16.4 / 16.8 ms | Indoors, HUD "in cottage #0 of region-9 storey 0". Cottage drawn open with its interior: table with two benches, plank floor, plaster walls, two windows with trees outside, a raised bed/shelf on the right. HUD: towns 2 (22 folk). Looks right. |
| hamlet-talk | 16.4 / 20.2 ms | Outdoors in a field of tall crops with a saddled horse; the hamlet (a few thatched and half-timbered houses) in the distance. No talk panel opened, as expected since a hamlet has no inn. No error about it. |
| start-inn-room | 16.6 / 20.2 ms | Regression check, HUD "in inn #15 of town-1 storey 0". Start-town inn interior as before: many tables and benches, bar counter at the back (rendered normally, dark wood), stone chimney, beams, windows, one townsperson. Looks right; no black box here. |

## To look at
- **village-inn-room**: the black block. The start-town inn draws its counter fine, so it is probably specific to inns placed by regions (material, lighting or a mesh too close to the camera at the `room=inn` spawn point).
- Leaves inside the village inn room (likely a tree outside poking through the wall, or foliage not culled by the room).
