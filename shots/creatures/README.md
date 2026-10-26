# Creature check: PR #127 (AssetGenerator dbe07ca, `skinLocally`) vs main

GPU shots (SHOT_GPU=1, WebGPU, SHOT_WAIT=20000) about 32 km from the origin, PR build (Actors 0.17.2 packs).

- `cr-rats.jpg`: `?hud&title=0&day=0&cellar&dweller=rats`, two rats next to the hero, whole.
- `cr-spiders.jpg`: `...&cellar&dweller=spiders`, room 0: no spider in view.
- `cr-spiders2.jpg`: `...&cellar=2&dweller=spiders`, a spider at the hero, legs on the body, eyes on the head.
- `cr-boar.jpg`: `?hud&title=0&day=0&hour=11&wild=boar`, the boar beside the hero.
- `spider-main-fNN.jpg` / `spider-pr-fNN.jpg`: 12 consecutive frames, 600x600 crop, `cellar=2&dweller=spiders` (third-person camera; the spider is mid-fight, so the frames differ mostly by its animation).
- `strip-spider.jpg`: frames 0-5 at 2x, top row main, bottom row the PR. `strip-spider-zoom.jpg`: the same, cropped to the abdomen and a leg.
