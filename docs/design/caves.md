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
- **Volcanic country** (K7a, built 2026-11-01): the kind `volcanic` (6 % of the land, cut from mesa country's share and put last, so every other kind's cells stay where they were): old cinder cones with a crater (landform shape `cone`), black lava rock (`tor`, `boulders`), pits where a tube's roof fell in (`sinkhole`), little grass, and its own ground, the texgen layer `basalt`. Data in `src/setting/classic/landforms.ts`; the lava former (K7b) reads this country's skeleton.

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
