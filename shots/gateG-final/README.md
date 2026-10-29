# Gate G evidence (build 2de5539, origin/main)

RTX 5070, WebGPU (`SHOT_GPU=1 SET_GL=0`), 1920×1080, muted.

- `full/`: the indexes of the full F1 set (`node tools/shot/set.mjs shots/gateG`, all four parts). land and caves passed. town and kinds failed F2: town-dusk, town-night, town-rain and kind-moor-aloft were over 16.7 ms. Frame times were high all through this run, probably from other load on the PC. 0 F3 violations.
- `rerun/`: town and kinds run again right after, on the same build and the same clean worktree. Both exit 0, with 0 F3 violations.
- `31-level-up.jpg`: the G3 level-up (from the full run).
- `hud/`: town-noon, barrow, wild and fight with `&hud` added locally to the town and land pages (not committed), to show the G4 minimap.
- `load.md`: three cold load runs (F4).
