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

URL parameters: `seed=` (world seed, any text), `gl` (force WebGL 2), `hud` (frame time and shader policy line).
