# MasterWorld

A classic fantasy roleplaying game in the browser (TypeScript, three.js) with a virtual game master that watches play and builds the world as it is needed.

Design: [docs/design/masterworld-plan.md](docs/design/masterworld-plan.md)

Rules for contributors (human or AI): [CLAUDE.md](CLAUDE.md).

## Play it

In the browser: https://arndrosemeier.github.io/MasterWorld/ (built from `main` on every push; a WebGPU or WebGL 2 browser on a desktop).

## Run it

```sh
git clone --recurse-submodules https://github.com/ArndRosemeier/MasterWorld
cd MasterWorld
npm install
npm run dev        # http://localhost:5200
```

Already cloned without submodules: `git submodule update --init`.

## Controls

WASD moves the hero; A and D turn (and strafe while the right mouse button is held), Q and E strafe, R autoruns (R again, forward or back stops), Shift walks, Space jumps (rises when swimming), X dives. Hold the right mouse button to look around (the hero turns with the camera), the left one to orbit the camera alone, both to run forward. The wheel zooms, all the way into first person. F flies a free camera (WASD, Space and C up and down, Shift fast, the wheel sets the speed; F again lands the hero under it). Ctrl+Shift+F12 opens the debug menu: go to places worth a look, fly, set the clock, copy a link to the view, and a command line with `game` in scope (also `window.game`). Escape opens the settings (keys, mouse, field of view, resolution, trees and grass, time of day, HUD), kept in the browser.

The version (bottom right) goes up by 0.001 with every merge to main; "What's new" lists each version's change (from the commit subjects on main, `tools/release/release.ts`).

URL parameters: `seed=` (world seed, any text; without it every start opens a fresh world, its seed shown in the corner, the HUD, the debug menu and saves; the shot tools pin `masterworld`, `SHOT_SEED=` another), `gl` (force WebGL 2), `hud` (frame time and shader policy line), `fly` (a free camera instead of the hero), `pos=x,z` (where to start), `look=yaw,pitch` (degrees, yaw 0 north), `hour=` (time of day), `day=` (minutes per game day), `trees=0`, `grass=0`. Given in the URL they win over the settings.
