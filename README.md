# MasterWorld

A classic fantasy roleplaying game in the browser (TypeScript, three.js) with a virtual game master that watches play and builds the world as it is needed.

Design: [docs/design/masterworld-plan.md](docs/design/masterworld-plan.md)

Rules for contributors (human or AI): [CLAUDE.md](CLAUDE.md).

## Run it

```sh
git clone --recurse-submodules https://github.com/ArndRosemeier/MasterWorld
cd MasterWorld
npm install
npm run dev        # http://localhost:5200
```

Already cloned without submodules: `git submodule update --init`.

## Controls

WASD moves the hero; A and D turn (and strafe while the right mouse button is held), Q and E strafe, Shift walks, Space jumps (rises when swimming), X dives. Hold the right mouse button to look around (the hero turns with the camera), the left one to orbit the camera alone, both to run forward. The wheel zooms, all the way into first person.

URL parameters: `seed=` (world seed, any text), `gl` (force WebGL 2), `hud` (frame time and shader policy line), `fly` (a free camera instead of the hero), `pos=x,z` (where to start), `look=yaw,pitch` (degrees, yaw 0 north), `hour=` (time of day), `trees=0`, `grass=0`.
