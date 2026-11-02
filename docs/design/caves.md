# Caves that form (D63)

Arnd, 2026-11-01: "the current cave system is pretty rectangular. That fits a cave built by people, but not a natural one." "Natural caves do not have rooms." "There is a third kind of cave that should fit in well in the generation, lava tubes." "In built caves I would expect ore veins."

This document is the design for phase K in [implementation-plan.md](implementation-plan.md). It replaces how natural caves are made (D57, P1). Built places such as cellars, barrows, towers and hideouts keep the room grammar they have.

## 1. The idea

Natural caves are not designed. **They form.** A real cave is what a process did to rock over time:
- water dissolving limestone, for **solution caves**;
- a lava flow draining out from under its own crust, for **lava tubes**;
- people following ore, for **mines**.

The generator copies the process rather than placing rooms. The game then reads what formed, decides where things go, and makes one small concession so every part can be reached.

There is one generator with three formers and a **mix of three shares**: built, water and lava (Arnd, 2026-11-01). **Pure caves are the norm.** A mixed cave usually has two shares filled and the third at zero:
- a mine that broke into an old solution cave (built and water);
- a lava tube that a stream later found and partly filled (lava and water);
- miners who dug for ore along an old lava tube (built and lava).

Where two kinds meet, the place tells its own story.

## 2. What a natural cave must be (Arnd's list)

- Right angles are the exception, not the norm.
- Ceiling heights vary widely, even within one space.
- There are no rooms: one network of wider and narrower stretches.
- Water is often part of it: brooks on the floor, drips from the ceiling.
- Stalactites and stalagmites happen (in solution caves; lava tubes have their own drips of lava rock).
- The ground is almost never level, and rocks are everywhere.
- The concession, because this is a game: every part is reachable in some way.

## 3. The pipeline

Every cave goes through the same seven stages. All of them are pure, seeded and run in a worker (layers, CLAUDE.md rule 8).

### 3.1 The rock block (geology)

A block of rock around the cave's site, in the cave's own frame (the portal keeps caves deep below, as now). It holds:
- **Rock**, taken from the land's kind above:
  - karst, downs and other limestone country give solution caves;
  - volcanic country gives lava tubes;
  - any hard rock can hold a mine.
- **Layers** (bedding planes): their thickness, a slight tilt, and how easily each dissolves, how hard it is and its colour. The colour bands show on the walls.
- **Joints**: two sets of near-vertical cracks at an angle to each other, with their spacing. Faults are rare, bigger breaks.
- **Ore bodies**, for mines: veins along faults or joints (thin, steep and long), seams along a layer, and pockets. Each body has an ore (iron, copper, silver, gold, gems), from the setting's data. **Ore is only for show** (Arnd: "No mining yet. Probably never."). It gives the mine its purpose and its look, not loot or a skill.
- **Groundwater**: where the water table stood over time (it drops in stages), where water gets in high up (sinks), and where it comes out low (springs at a cliff foot or valley side). These come from the land's real heights above the cave's site.

### 3.2 The former (the process)

Each former writes a **void skeleton**. It holds:
- **conduits**: centre lines, each point with a cross-section (its kind, width, height and how far the floor is filled);
- **voids**: collapse spaces;
- **marks** for the stages after it: drip points, flow directions, stream lines, ore faces.

**Solution former (water).** Water seeps from the sinks to the springs along a coarse 3D lattice (about 2 m), on the joints and layers. Each step:
- flow is shared by how open each path is;
- dissolution widens paths in proportion to their flow;
- wider paths draw in more flow.

After some rounds a few paths have won. That feedback gives the patterns real caves have:
- a **branchwork** when there are few sinks;
- a **network maze** when the joints are dense;
- **anastomoses** (braided tubes) on a soluble layer.

The cross-section follows the passage's history:
- below the old water table, a **phreatic tube**: round or elliptical, looping up and down, following the layers;
- above it, a **vadose canyon**: tall and narrow, cut down by the stream;
- both together give a **keyhole** shape.

Each drop of the water table leaves an older, dry level above the active one. **Collapse**: where conduits cross or grow wider than the rock can span, the ceiling falls. This leaves a large, uneven void with a rubble heap under it. These are the big spaces, and nobody places them.

**Lava former.** A vent stands upslope on volcanic ground. The flow runs down the old land surface by steepest descent with meanders, a few metres to tens of metres under today's surface. The tube follows that course:
- it is wide (5 to 15 m) under an arched roof;
- its floor is set lava, smoother than a solution cave's but ropy and cracked;
- **flow ledges** run along the walls, rings where the lava stood;
- small **lava drips** hang from the roof;
- sometimes it braids, or a second flow left a smaller tube above or below;
- the end can be a **lava fall** or a choke.

**Skylights** are where the roof fell in. They are both ways in from the land and shafts of daylight.

**Mine former (people following ore).** Miners came for the ore bodies of 3.1 and dug as miners do:
- an **adit** (a level tunnel in from the hillside) or a **shaft** with a windlass;
- **drifts** along the vein, and **crosscuts** to reach it;
- **stopes**, the tall narrow slots where the vein was taken out, following its dip;
- **winzes** down to the next level, ore chutes, and dead ends where the ore gave out.

Near the entrance is the built part people lived and worked in, using today's room grammar: a store, a smithy, bunks, an office. Tunnels are roughly straight and square-cut with tool marks, but not perfect. Where a drift met a natural conduit, the miners **broke through**. That's the built and natural mix.

### 3.3 The carver

The void skeleton becomes the signed field that today's cave rock already uses (`caveRock.ts`, sparse bricks, surface nets mesher). The field is sampled only near voids, so a long cave costs little. Each rock gets its own surface:
- **scallops** and solution pockets in limestone;
- smooth arches, ledges and cracked set lava in a lava tube;
- **tool marks** and squared corners in a mine.

It is one rock material (P2), tinted by the layers. Ore shows where veins run on in the walls: a glint, crystals, a coloured streak. It stays within the shader budget and is done by tint and texture, not a new shader kind.

### 3.4 The dresser

**Floors:**
- solution caves: silt and sand in the bottoms of old tubes, breakdown boulders under collapses, scattered rocks;
- lava tubes: set lava with fallen roof slabs;
- mines: rubble, waste heaps, rails.

The floor is almost never level.

**Water** (solution caves):
- the live stream runs on the lowest level along the flow lines of 3.2;
- **pools** and rimstone dams form where the floor dips;
- **drips** fall from ceiling joints (known from 3.1), each with a falling drop and a small splash ring;
- the sound of water carries.

**Speleothems** belong together: a **stalactite** hangs at a drip point, a **stalagmite** grows under it, and in time a column forms. Flowstone covers the walls where water runs, and straws are rare. Older dry levels have dead, dusty formations.

**Mines:** timbering in soft rock, ladders in shafts, rails and an overturned cart, old tools, a collapse.

### 3.5 The reader (where one can go)

Nothing assumes rooms. The reader finds where one can stand and move, from the carved field itself:
- **standable ground**: columns of about 0.5 m where the floor is not too steep and there is head room;
- **links** between them: walk, step up, **climb** (D56: cave rock is climbable), **drop** (one way down), **swim** (water, with breath or a water breathing spell or potion, D60). **No squeezing** (Arnd): every way the hero takes is at least the hero's own size, standing (constants, section 6).
- the **network**: patches of standable ground and the links between them.

The network then reads the cave's **places**:
- **voids**: wide open volume;
- **dead ends** and **alcoves**;
- **junctions**, **ledges** and the stream bank;
- **depth**: how far each place is along the network from the way in.

### 3.6 The concession (every part reachable)

From the way in, the network is walked:
- **Parts reachable with every kind of link** keep them. A climb or a swim is a fair way.
- **Parts cut off** get the smallest change that opens them: a rubble ramp under a lip that's too high, a gap too low or narrow for a standing hero widened to that size, a climbable flowstone, a fallen slab across a gap.
- **A part that is still out of reach** stays as it is, seen but not reached: a sump that goes on, a crack with a breeze. That's mystery, not a bug.

### 3.7 The game reads the places

Content goes into places, not rooms (C6c, `dungeonFor`):
- dwellers' lairs in voids;
- treasure in alcoves and dead ends;
- set pieces where they fit, such as a ledge or the stream;
- danger grows with depth.

The pacing the room graph gave (loops, a safe spot, a shortcut back) comes from the network's own loops, where solution caves have plenty. **Natural locks** take the place of doors:
- a **sump** (dive through: water breathing);
- a **climb**;
- a **chasm** (a ledge round it, or a fallen slab);
- a **choke** (rubble to dig through, shown, rule 11).

Mines can also have built locks: a grate, a door, a raised ladder.

## 4. The three kinds side by side

| | Solution cave | Lava tube | Mine |
|---|---|---|---|
| Rock | limestone (karst, downs) | basalt (volcanic country) | any hard rock with ore |
| Process | water widens cracks; collapse | lava drains from under its crust | people follow ore |
| Plan | branches, mazes, braids; levels | one long winding conduit, braids, stacked tubes | adit or shaft, drifts, stopes, levels |
| Section | round tubes, canyons, keyholes, collapse voids | wide arches, flat-ish floor, ledges | square-cut, tool marks, tall stopes |
| Floor | silt, breakdown, rocks; never level | set lava, roof slabs | rubble, waste, rails |
| Water | streams, pools, drips | none (ice in cold places) | seeps, flooded lower levels |
| Formations | stalactites, stalagmites, columns, flowstone | lava drips, ledges | none; ore veins in the walls |
| Ways in | sinkholes, a spring mouth at a cliff foot | skylights (collapse pits) | adit mouth, shaft head |
| Light | daylight at shafts and sinkholes | skylights | none past the mouth |

## 5. What changes in the game

- **Walking**: the hero's floor and walls come from the field (the walker already reads `CaveSpace.sdf`). Climbing works as now. There is no new movement: no squeezing or crawling (Arnd).
- **Creatures** path on the network, not on grid cells.
- **The minimap** paints the network's standable ground seen so far (today's `DungeonSeen` is per grid cell).
- **The save** keeps what was seen and what was changed (a dug choke, a taken treasure) by network patch.
- **The loop check's bot** walks the network, including climbs and swims.
- **Ways in** are portals as now (`caveThroat.ts`). Lava tube skylights and solution cave sinkholes are new mouths, some of them open to the sky.
- **Light**: daylight shafts at sinkholes and skylights, the hero's torch everywhere else (as now).
- **Water** uses today's water materials and drip particles. Sounds: drips, the stream, a breeze at a crack.
- **The VGM's `cave` tool** asks for a size, a danger and the three shares (built, water, lava; usually pure, at most two filled), with its row in vgm.md (rule 10).
- **Volcanic country** (K7a, built 2026-11-01): the kind `volcanic` (4 % of the land, cut from mesa country's share and put last, so every other kind's cells stay where they were): old cinder cones with a crater (landform shape `cone`), black lava rock (`tor`, `boulders`), pits where a tube's roof fell in (`sinkhole`), little grass, and its own ground, the texgen layer `basalt`. Data in `src/setting/classic/landforms.ts`; the lava former (K7b) reads this country's skeleton.
- **Active volcanoes** (K7d, Arnd 2026-11-02): in volcanic country one cone to a 2800 m square (about 60 % of the squares that are wholly in it, level, dry and clear of towns): 620-760 m radius at the foot, 230-310 m high, a crater 130-175 m in radius at the rim and 30-40 m deep, a levelled pedestal, gullies down the flank. Three states: `erupting` (a lava lake brimming to the rim's lowest crest, spilling at the saddle into a cut channel, one or two more flows from flank vents), `lake` (the lava well under the rim) and `steaming` (no lava: vents and sulphur crusts). `src/world/volcano.ts` holds the shape, flows and vents (every size in `VOLCANO`); the cone is part of `Terrain.height`; `Terrain.lakeLevel` and `Terrain.lavaAt` say where the lava is. Lava burns the hero (`game/heat.ts`: 30 % of the most health a second, never below the last point, like drowning). Drawing: moving crust plates with glowing cracks, flows with pulses, a plume, sulphur and steam at the vents (render, on the GPU).

## 6. What is hard, and the limits

- **Cost of forming.** The water lattice is coarse (about 2 m; a 200 × 200 × 60 m block has about 300,000 nodes) and runs some tens of rounds. Carving reuses sparse bricks. Aim: a cave forms and carves in under 3 s in a worker, and appears before the hero reaches its mouth (F4 holds).
- **Taste.** A process can form a dull cave: long tubes with nothing in them. That's why phase K starts with a preview tool and Arnd's eye on many seeds before anything is in play.
- **The reader is the big job.** Everything that read the grid moves to the network: walking, creatures, the minimap, the save and the bot. It's the price of "no rooms".
- **Frame time below ground** (F2): one cave mesh per carved brick, as now, and drips as one instanced particle set.
- **Constants** (Arnd: "make those constants that can be easily changed"): every size lives in one place, the setting's cave data, never scattered in code:
  - the biggest cave, about 300 m across and 60 m deep;
  - the least passage the hero takes, standing height and width;
  - the lattice step and the field step;
  - the share of mixed caves and how often each pair mixes;
  - drip and formation density.

## 7. Arnd's answers (2026-11-01)

1. **Ore**: no mining, now and probably never. Ore is only for show.
2. **Squeezing**: none. That's the unrealistic part. Everything stays reachable at normal size.
3. **Size**: up to about 300 m across and 60 m deep, as constants that are easy to change.
4. **Order**: K1 and K2 start now, next to phases D and Q.
5. **Mix**: three shares (built, water, lava). Pure caves are the norm, and a mixed cave usually has two shares filled and one at zero.

## 8. What K1 and K2 built (2026-11-01)

Arnd's answers (section 7) are in the setting's cave data: `sizes`, `way` (2 m wide, 2.8 m high at least), `shares`.

K1 and K2 are in `src/world/cave/` (pure, seeded) with the data in `src/setting/classic/formedCaves.ts`. The former differs from 3.2 in two ways worth knowing: the water flows over an 18-neighbour lattice (3 m for a medium block, 5 m for the big one, so the forming stays quick) and each stage's springs sit on the valley face of the block, taken from the land's lowest side. Braids and mazes come from several water paths per round over rock whose ease is jittered; branchwork from one path per round and strong feedback. Open for Arnd: sea caves as water caves whose lowest level lies under the sea (recommended) or a fourth, wave-cut former.

After Arnd's first look at the gallery ("too tidy", the round collapse blobs look strange, two disjoint systems sometimes form, and his idea: carving resistance should differ a lot): each rock has a `resistance` field (hard and soft patches, `size` and `contrast` in the setting) that sets both the water's route and the width of a way, the springs lie close together and only the biggest system stays, and a collapse hall is a long room under a flattish ceiling.

## 9. What K3 built (2026-11-01)

Arnd, after the outer shape: "now we just need to get the inner shape right ... stalagmites and stalactites, rocks all around, water flowing and dripping." That is the dresser (3.4). It is `src/world/cave/dress.ts` (pure, seeded, in the cave worker) with its numbers in the setting's `dress` data (silt depth and relief, rocks, the stream's width and pools, drips, formation lengths and the most formations).

- **Silt** lies on every floor, deeper where the way is roomy and never taking the head room (it stops at `minHeight`, D63: no squeezing), with its own bumps: under a tenth of the standable ground is level (a test holds it).
- **The stream** runs along the live conduits at the lowest floor, its bed cut into the field, with pools cut where the floor is flat; water only where the cut bed holds it.
- **Rocks** are stamped into the field: along the feet of the walls where the way is wide enough to leave the middle free, and over a collapse's heap.
- **Drips** fall along the joints that cross a way's roof (so formations stand in rows along a crack, as they do in real caves) and from seeps away from cracks. Each drip hangs a stalactite (its tip always above the hero's head), grows a stalagmite under it (not in the stream, not where it would narrow the way), or a column where roof and floor are close; straws are rare; old dry levels have longer, grey, dead formations and no drips.
- Formations, drips, the stream and pools are lists (the game instances them, the walker reads their colliders, K4/K5); only silt, bed, pools and rocks are in the field.
- The floor views of the gallery (`npm run preview:caves`, `view=floor`) put the hero's figure in the stream's bed with a lantern, eye 1.7 m over the floor.

Not yet: flowstone on the walls, rimstone dams round the pools, waterfalls where the stream drops, the walls following the beds and joints (ledges, flat joint faces), and water's sound (K5).

### 9.1 The second pass: stone, layers, rocks, water (Arnd, 2026-11-01, "a first draft only")

Arnd's four points on the first draft: the walls were just brown and too smooth, the water did not look like water, the stalagmites were cones, and there were no rocks. The dresser's lists now become **part meshes** in the worker (`parts.ts` the shared `PartMesh`, `formations.ts`, `loose.ts`, `waterMesh.ts`), drawn with their own material kinds in `src/render/materials/formedCave.ts` and `formedWater.ts` (late kinds, docs/SHADERS.md).

- **Walls** (`FORMED_ROCK`): the mesh's tint is the bed's colour; the shader adds courses with their own tone and hue (grey, ochre, rust) and dark partings, smooth water-polished patches next to rough scalloped and ridged wall (about 7 m patches), a 3D bump from layered noise and pits (lit by the lantern), calcite veins that swell, pinch and break off, pale mineral crusts, rust streaks, dark crevices, and ore (`ORE_MAT`) speckled with glints and metal.
- **Formations** (`formationMesh`): lathe bodies grown in layers: stalagmites and columns stack saucer-shaped layers, stalactites carry ring ripples; each has lean, an oval section, lumpy skin, a cream/amber/brown colour per layer (grey when dead). `FORMED_CALCITE` gives them waxy banded stone.
- **Rocks** (`stonesMesh`, setting `dress.stones`): pebbles to boulders by a power law, big ones against the walls, heaps, many under collapse halls; pebbles may lie in the stream. **Ore lumps and crystals** (`crystalsMesh`, `dress.crystals`) sit where a ray from the passage meets ore, plus quartz, calcite, amber and rare amethyst clusters; prisms with pointed tips, clear and glossy.
- **Water** (`FORMED_WATER`): the outside water's own code. The ripple slope and the streak foam were moved out of `water.ts` into `waterSurface.ts` and both shaders call them, and the cave water reads the same `WATER` uniforms (time, wind, shallow, deep, absorb, ambient), so a change to the outside water shows here. Each vertex carries the water's depth, speed (from how fast the surface falls) and direction. Streams are five-line ribbons running downhill, pools are fans.
- Test: `test/caveDress.test.ts` checks every part mesh is sound, all faces look the way their normals do (culling had hidden the water once), the formations are layered, rocks run from pebbles to boulders, and the build is seeded.
- The cloud preview (`npm run preview:caves`, floor views in `tools/preview/inside.ts`) runs the real node shaders through `WebGPURenderer({ forceWebGL: true })`. It is **WebGL only**: the `water.ts` refactor and the new kinds still need a look on a WebGPU GPU (`npm run shot`).

## 10. What K4 built (2026-11-01)

The reader and the concession (3.5, 3.6): `src/world/cave/reader.ts` and `concede.ts` (pure, in the cave worker after the dresser, before the mesh), with the hero's numbers in the setting's `way` data (`stand` 2.1 m, `radius` 0.4, `step` 0.8 (K5: 0.55 then 0.45 before), `climb` 6, `drop` 14; all easy to change).

- **Cells**: one for each span of air in each column of the field (about 0.6 m) that has the standing hero's head room and body width at the waist. A medium cave has 10 to 30 thousand.
- **Links**: walk (a step of at most 0.8 m: K5 measured the real walker over 0.45 to 0.8 m rises, 61 of 64 and 80 of 80), climb (a face up to 6 m, both ways; the lower cell's air must reach over the ledge), drop (down a face of 6 to 14 m, one way). Every link has the hero's head room over both cells: nothing squeezes. Swimming comes with the sumps of K6 (formed caves have no deep water yet).
- **Network**: Dijkstra from the ways in (a spring's mouth where it reaches the valley side, and each skylight's rubble heap) gives each cell its depth in metres of way, and a reverse search tells what can walk back out (a pit dropped into is a trap).
- **Places**: ways in, skylights, voids (a ball of 3.5 m fits at head height, one for each lump), dead ends and alcoves (the far ends of the way; a branch under 10 m is an alcove), junctions (three conduits meet), ledges (beside a face of 3 m or more), the stream's bank. Each carries its cell, depth and, for a void, its radius. K6 puts lairs, treasure and set pieces in them.
- **Concession**: parts of 60 cells or more that no way in reaches, and pits of 4 cells or more that cannot be left, are joined to the ground that can walk out by a hero-sized way (2.6 m wide, 3.2 m high, a level floor across, running straight from one floor point to the other; over open air its floor is a slab of rock 2.5 m thick, a fallen slab or a ramp of rubble) from the closest pair of cells within `maxCut` (14 m; steep pairs cost more). The ways are chosen as a spanning forest, shortest first, and the cave is read again after each round (at most 5). Parts still out of reach stay, seen and not reached: mystery, not a bug. The loose things a new way cuts through are taken from the dressing.
- On the gallery (36 medium caves, 12 seeds of each rock) the concession leaves nothing of 60 cells or more cut off in 34 caves; in two (`jointed` 6 with 291 cells, `thin-bedded` 6 with 65) a part lies further than `maxCut` from any ground that walks out and stays as mystery. Reached ground is 84 to 99 % of all cells (the rest are pockets and those two parts). Reading and concession take 0.1 to 0.3 s in the cloud container (`CaveResult.read.ms`), the whole form, carve, dress and read stays under 3.5 s. The preview sheet shows the places on the plan (green ways in, blue voids, red dead ends, yellow junctions, white ledges, cyan banks) and the cut ways in magenta.
- Test: `test/caveRead.test.ts`.

## 11. K5, first slice: the walker in a formed cave (2026-11-01)

The formed cave as the walker's world and a page to walk in it; the rest of K5 (the game's visit, creatures, minimap, save, bot, portals, shafts, sounds, replacing the old caves) is still to build.

- `src/game/formedWorld.ts`: a carved field as a `WalkWorld` (its signed distance is the `rockSurface`, rock is climbable by its faces, no height field, no water yet), as `dungeonWorld.ts` does for built dungeons. `src/world/rockHolds.ts` holds the one hold test the walker and the reader share.
- **The reader agrees with the real walker.** A cell now needs the walker's own body width at the knee, waist and head (0.75, 1.3 and 1.4 m over the floor, radius 0.4 against the walker's 0.32). Every walk link sampled in three caves (1130 links) was walked by `Walker` in under 10 s (`test/caveRead.test.ts`). `pathTo(reading, cell)` gives the cells from a way in to a place.
- **What the walker cannot do yet:** of the climb links, about 11 % fail, and nearly all of those rise 2 m or more: the walker lets go of a face where its head meets the roof or the holds end, and these faces (canyon walls under tubes) are not always steady. Climbs of 1 m and drops are fine (over 98 %). The reader's `climb` of 6 m is therefore too generous; two ways to fix it, to be chosen with the K5 walker and the bot: make the carver leave rubble ramps where a canyon meets a tube, or give the walker a firmer climb. A try with `climb` 2 m left caves in many unreachable parts (the concession needs far more ramps and goes past 3 s), so it stays 6 for now.
- **Walk a cave** (`tools/preview/walk.html?rock=massive&seed=6&size=medium`, also `&gl` for WebGL): the real walker, the game's shaders, a lantern; W A S D, shift, space (jump, climb), 1 to 9 stand at the places, R back to the way in. In the cloud `WALKS=0,4,9 node tools/preview/formed.mjs out 1 medium massive` takes one picture at each place.

## 12. K5, second slice: creatures walk the cave (2026-11-01)

- **A walk step is 0.8 m, not 0.45.** The real walker crosses rises of 0.45 to 0.6 m in 80 of 80 tries, 0.6 to 0.8 m in 61 of 64, 0.8 to 1 m in 17 of 20, 1 to 1.5 m in 12 of 18 and 1.5 to 2.5 m in 2 of 12. With the old 0.45 the cave fell into 150 walk islands of about 25 to 60 m2; at 0.8 it is 84 (setting `way.step`).
- **The cave is in levels.** Even so, most of a cave is joined only by faces of 1 m or more (canyon, tube, shelf), which the hero climbs. A creature cannot: `src/sim/formedGround.ts` (`DenGround`, pure) lets it walk, scramble up 1.2 m and drop 3 m, so a den lives and hunts in a walk island plus its short steps, and a hero on a ledge above is safe from it. Homes are cells of the reading (places), `spot` picks a cell near the home, `way` is A* over the reading's links pulled straight where the floor allows, `slide` goes along the rock by the field, `floorAt` finds the floor by the field's sign change, `sees` marches the field. Test: `test/formedGround.test.ts` (a goblin 8 to 14 m off hears the hero and walks to them).

## 13. K5, third slice: the formed cave in the game (2026-11-01)

A spring's mouth on the land leads, through a portal, into a formed cave; the cellar's story is told in it. Nothing replaces the old natural caves yet: the setting turns `formed: true` on the cave space (`SpaceDef.formed`), and the old path stays for the headless variety and loop checks.

- **Job**: `world/cave/job.ts` (`runCaveJob`, pure) forms, carves, dresses, reads and meshes a cave; `workers/cave.worker.ts` runs it in the cave pool of `main.ts`, or `Cellars` runs it in place when there is no pool. The job's seed must equal the decision's seed, so the throat's noise matches the mouth on the land.
- **Throat**: `world/cave/throat.ts`. The mouth passage's end is cut as the same arch the land draws (`world/dungeon/caveThroat.ts`), the portal plane stands 6 m along it and behind the plane the rock is closed for 1.6 m. A site carries a placeholder throat until the cave is made; `Cellars.join` opens the portal when both the mouth and the cave are ready.
- **Re-homing** (`vgm/inhabit.ts`, a VGM tool of the cellar): the cellar's history, dwellers, props, hoards and clues are kept; each room is given a place of the reading as its home (the way in at the throat, the lair at the deepest big hall or dead end, the great cavern in the biggest void, the rest spread by their depth in the story, at least 12 m apart where the cave allows). Props are set on the floor round a home, clear of one another and turned to the wall; the hatch stands at the throat; daylight glows hang over skylights.
- **Game**: `sim/formedSpace.ts` (the dungeon space over a formed cave, so `Delve`, hoards and reads work), `game/formedMap.ts` (`FormedSeen`: 3 m squares seen by the lantern, kept in the save as before), `app/dungeonSheet.ts` `paintFormed` (the minimap below ground), `render/cave/formedMeshes.ts` (the one meshing used by the game and the preview pages).
- **Still to do in K5**: the loop-check bot on formed ground (`den.nav` is still the built dungeon's), sinkholes and daylight shafts as ways in, drip and stream sounds, the climb mismatch, replacing the old caves (sea caves are water caves whose lowest level lies under the sea), GPU shots from the floor.

- **Mines, first slice** (K8, 2026-11-02): `world/cave/mine.ts` (setting rock `hard-rock`, its `mine` numbers in `formedCaves.ts`; moor and badlands now hold mines and the old room cave there is gone). The block's first ore body is a long tall vein (`makeOre`'s `mine` flag). The adit is a straight square-cut tunnel from the vein out to where the land comes down to its roof (the way in, a mouth; it falls 1.2 % toward it, to drain). Drifts run along the strike on 1-3 levels 10 m apart, offset one half width so the vein is the drift's wall (the ore shows along it); crosscuts run off them across the vein; stopes are tall chambers over a drift with a waste heap; inclines (0.3 rise a metre) lead from a level up to the next, beside the drift. Drifts are `sq` 0.85 (a box with rounded corners, the carver's superellipse) and the walls keep 30 % of the water's scallops. No dripstone, no stream. Every mine of 12 gallery seeds and the tests' seeds is one network from the adit. Not yet: timbering, rails, carts, the built rooms by the adit, winzes, break-throughs into natural caves (the mixed shares).
- **Mine fittings** (K8, 2026-11-02): `world/cave/fittings.ts` (`fitMine`, `boxesMesh`; setting `mine.fittings`). The dresser places oriented boxes in a mine: timber sets (two posts at the walls and a cap beam under the roof) every 4.5 m (seven in ten stand), rails (gauge 0.9 m) on sleepers along the adit and the level drifts, and up to two carts on the rails with ore heaped in them. They are drawn (`parts.fittings`, the calcite kind with wood and iron tints) and not solid. A wood and a rusted-iron look of their own is for the GPU polish; ladders, winzes, tools and the built rooms by the adit are still to do.

- **The loop check delves the caves, and what it found** (K5, 2026-11-02): `npm run loop:caves [-- seeds]` (`tools/loop/caves.ts`; `VERBOSE=1` lists every cave, `STRICT=1` exits 1 when fewer than 80 % of a kind pass) forms small caves of all five kinds and sends the game's own `Walker` from the way in to the reader's deepest place and back, along the cells the reader read. It is **not in `npm run loop` yet**: the reader allows climbs up to 6 m (`way.climb`), but the walker, pushed towards the next cell, walks a rise of 1.2 m or less 90 % of the time, up to 2 m 63 %, up to 3 m 30 % and over 4 m 10 %. It fails by hanging on a rough face whose holds end under a roof's lip, or whose ledge lies along the face and not on it. So solution caves fail, mines and lava tubes mostly pass (some stopes and inclines of 2.7 to 5.9 m fail). Tried and dropped: checking `caveHolds` on the reader's climb links, a firmer cling in `walker.ts`, aiming along the face normal, strafing. Cutting `way.climb` alone costs too much (70 % of the cave reached, concession over 1.4 s). Left as the K5 "tall climbs" item: rubble ramps or steps where the carver meets a tall climb, or a walker that climbs along a face. This check is its measure; it joins the loop when it holds.
- **Rubble ramps** (K5, 2026-11-02): the concession's second job (`world/cave/concede.ts` `ramps`, `carve.ts` `stampRamp`; setting `way.ramp` { above 1.2 m, slope 0.7, steep 1.1, half 1.6 m }). The ground a hero can walk in and out of without a face over `above` (`reachFree` in the reader) is found; each lump of ground left over, joined to it only by faces higher than that, gets a slope of fallen rock at its cheapest face: from the ledge's edge, running away from the face, falling 0.7 per metre (up to 1.1 where the gentle one does not fit), 3.2 m wide, filled only as the air straight under the line down to the old floor (no lower passage is filled). Head room all along and a foot on the old floor are checked first (the heading is tried round the compass, nearest the face's first). Read again after each round (up to 16: a ledge above a ledge). A ramp may never cost ground: if the cave reads smaller after the ramps, the field is put back. Result on small caves of seeds 1 to 10: the share of a cave walked without a tall face rose from 33 / 43 / 53 % (massive / jointed / thin-bedded) to 66 / 65 / 73 %, and a cave takes about 0.4 s longer in the worker (one more reading per round). Left: ledges and pockets whose face has no room for a ramp (a chimney, a narrow slot), which stay climbs; the hero still climbs them, the bot and creatures do not. `npm run loop:caves` still fails solution caves because its scripted follower (it steers straight at the next cell) stops on rough ground along long ways; it stays a manual measure.
- **Places get noticed** (K9, D66, 2026-11-02): the cave tool (`vgm/caves.ts` `caveFor`) sites a cave ahead of the hero on their way (`setting.noticing`: 70 to 260 m, within 0.7 rad of the way `toward`; `ringSpot`'s `ahead`), in view over the ground (`world/sight.ts` `seesOver`) and with its mouth turned to them; up to eight seeded looks are made, the first that fits is taken, and with no way known no cave is opened. Cave asks that find one fall from about 27 of 100 hero spots to about 11 of 100 on the masterworld seed (a cliff ahead, in view, facing: the cone leaves a ninth of the ring, the view the rest). `game/noticed.ts`: twice a second `Noticed.watch` marks every fixed place of the log (dungeon sites, sights that are not finds, not on the sea bed) in line of sight within 150 m by day (30 m in the dark), saved as `noticed` in the save (not kept for an heir). The minimap shows them as pulsing ward-light studs (`Minimap.noticedMarks`, the same way as the VGM's show studs) and the map as a teal diamond with the place's short name. Nothing else announces them. Not yet: places in other tools' placing (promised places, sea caves, wrecks, mines) are noticed the same way but still sited by their own rules, and a place's own light is not read.
- **Cave sounds** (K5, 2026-11-02): a formed cave drips where its roof does and runs where its stream does. `FormedSpace.sounds` carries the dressing's drip landings and points along the streams (`app/cellars.ts`); `SoundDirector` plays `call/drip` at one of the drips within 16 m of the listener (none where the cave is dry: a mine, a lava tube; the other cellars keep their random drips) and the hearing's `stream` distance brings the `bed/river-riffle` bed up under 24 m (`game/soundscape.ts`). Still to do: a lava tube's own sounds (the tick of cooling rock), the wind in a shaft.

- **Natural locks, after the GPU look** (K6, 2026-11-02): a lock stays solid while its piece opens (`FormedSpace` `unlatching`: 0.9 s for a boulder and stones, 1.2 s for a grate, the times `CellarView` plays them), so the hero waits for it and is never inside the falling stones; locks are touched from 1.6 m; a boulder sinks out of sight as it tumbles (`DoorPiece.sink`) and does not lie across the open way; the grate is cool grey iron. `npm run loop:locks` (`tools/loop/locks.ts`) sends the walker to every lock of 3 rocks x seeds x 16 stories: held, opened, passed, and a boulder holds from its far side (34 to 65 locks, 0 faults). **Where the plan's four natural locks stand**: a *choke* is the stacked stones (rubble, toppled on screen when the hero lingers: `secret`), a *climb* and a *chasm* are the reader's `climb` and `drop` links with the concession's rubble ramps (a face to climb, a fall to take, no lock needed), and a *sump* (a drowned stretch to dive through, water breathing) is **not built**: it needs a flooded section carved into the passage, swim links in the reader and the formed ground, and the formed cave's walker diving (the breath, the gills spell and the swimming walker exist from the sea caves, S5 and S8; the missing part is the carve, the reader's swim links and the formed ground). Ore lumps in a mine are pressed back onto the wall they show in (a quarter hung in the air, seen on the GPU).
- **Natural locks** (K6, 2026-11-02): a formed cave told a story that shuts ways (a wedged boulder `oneway`, an iron grate `locked`, stacked stones `secret`; the plain doors, drops and never-passed grates and falls are left open) used to draw none of them, and drew the story layout's doors and keys at layout coordinates, which in the cave's frame are nowhere. Now `world/cave/locks.ts` `lockSites` sets each shut way where the cave narrows: on the shortest way between the two rooms' homes, a place that no other way goes round (shut it, and the far room cannot be reached: a breadth-first search with the place's cells left out), at most `way.lock.widest` across (3.6 m), `tall` high (2.4 m), `fromEntry` (10 m of way) from a way in and `apart` (10 m) from another lock. A link with no such place stays open: a cave with loops has fewer locks than its story (in the small test caves 19 of 48 shut ways find a place). The lock carries the reading's cells it shuts and the box in its way (`lockBox`). `FormedSpace` takes the locks: the box is solid in `sdf` while shut, a boulder is levered out from its near side (`a`) on touching it, a grate opens once its key is picked up (the key lies at its room's home, `keyAt`), stacked stones are found by lingering at them for 1.5 s; each opening is the link's id in `open`, so the visit's save and restore keep it as before. `FormedGround` keeps its creatures out of a shut lock (the cells are not gone to, the box is solid to their strides) and lets them through when it opens. `world/cave/lockMesh.ts` draws each kind as a piece of its own, as wide as the cave there; `CellarView` opens it on screen as it does the old caves' doors (the boulder tumbles away, the grate swings, the stones topple). Not yet: a sump (swim through with water breathing), a climb, a chasm, a choke dug through by hand; foes with hands do not lift a boulder's bar; GPU shots of the pieces.
