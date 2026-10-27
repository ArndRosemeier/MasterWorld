# PR #192 water mouth + hamlet, WebGPU RTX 5070 (SHOT_GPU=1), 1280x800

- main = e635e51, pr-cc08993 = first #192 head, pr-1173bc9 = new head (bank view + hamlet only).
- Queries are in each log.json. compare/*-pair.jpg: main left, PR cc08993 right.
- a1-a7: start river's mouth near (-28825, 32855). PR: river runs at 14.3 m to the shore, falls ~13 m to 1.2 m, then a ~120 m tail (1.2 -> 0 m) to (-28711, 32789).
  main: river runs 2.4 km out over the sea at 17 m -> 0 m.
- b-old-mouth-c5: old flat band view; PR shows open sea.
- compare/fall-zoom.jpg: a6/a7 close-ups of the fall (terrain teeth cut into the lip in a7; thin water sheet lies on the cliff top left of the fall).
- compare/bankzoom.jpg: c2 river crop, main / cc08993 / 1173bc9.

## hamlet/
`?title=0&day=0&hour=11&weather=fair&site=hamlet&hud`. Hero (walker pos) = (-28670.38, 45.16, 35409.16); HUD shows the camera (-28666, 47, 35412).
`site=` overrides `pos=`, so the top/oblique views load the site and then run
`p=game.player; p.flying=true; p.goTo([w.x, w.y+30, w.z],[0,-80])` (oblique: `[w.x-25, w.y+18, w.z+25],[135,-30]`).
- `game.player.world.waterLevel` is null on a 40 m grid around the hero (probe-*.json), terrain.waterDepth 0. Nearest water: a brook ~32 m east (level 36.8).
- *-nowater.png: same views with the only water mesh ("sea") hidden: the grey-blue striped strips stay.
  They are flax fields in flower (terrain.fieldAt: fields 48 and 50 crop "flax", 49 "meadow"; colour in src/render/materials/townGround.ts:95), not water.
