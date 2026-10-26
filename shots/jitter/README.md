# Jitter check: PR #121 (Actors 0.17.1) vs main (Actors 0.17.0)

GPU shots (SHOT_GPU=1, WebGPU, desktop) about 32 km from the origin.

- `jit-inn.jpg`, `jit-town.jpg`, `jit-wolves.jpg`: PR build, the three requested views (inn and town after 25 s, so the townsfolk are dressed).
- `frames-main-fNN.jpg` / `frames-pr-fNN.jpg`: 12 consecutive frames of the same seller (person 23, act `sell`, at -31886.3, 87.4, 31906.3), camera 1.8 m in front, `?hud&title=0&day=0&hour=11&weather=clear`, 600x600 crop.
- `strip-torso.jpg`: frames 0-5 of the torso at 2x; top row main, bottom row the PR.
