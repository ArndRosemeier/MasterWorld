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
- **Volcanic country**: there is no volcanic landscape kind today. Lava tubes need one (old cinder cones, lava fields, black basalt), added as a kind of country (D55) where the skeleton allows it.

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
