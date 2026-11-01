# Caves that form (D63)

Arnd, 2026-11-01: "the current cave system is pretty rectangular. That fits a cave built by people, but not a natural one." "Natural caves do not have rooms." "There is a third kind of cave that should fit in well in the generation, lava tubes." "In built caves I would expect ore veins."

This document is the design for phase K in [implementation-plan.md](implementation-plan.md). It replaces how natural caves are made (D57, P1). Built places such as cellars, barrows, towers and hideouts keep the room grammar they have.

## 1. The idea

Natural caves are not designed. **They form.** A real cave is what a process did to rock over time:
- water dissolving limestone, for **solution caves**;
- a lava flow draining out from under its own crust, for **lava tubes**;
- people following ore, for **mines**.

The generator copies the process rather than placing rooms. The game then reads what formed, decides where things go, and makes one small concession so every part can be reached.

There is one generator with three formers and a mix. A cave has a **built share**, which is how much of its volume people dug. A mine that broke into an old solution cave is both kinds at once, and the place where they meet tells its own story.

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
- **Ore bodies**, for mines: veins along faults or joints (thin, steep and long), seams along a layer, and pockets. Each body has an ore (iron, copper, silver, gold, gems), from the setting's data.
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
- **links** between them: walk, step up, **climb** (D56: cave rock is climbable), **squeeze** (low head room, crouched), **drop** (one way down), **swim** (water, with breath or a water breathing spell or potion, D60);
- the **network**: patches of standable ground and the links between them.

The network then reads the cave's **places**:
- **voids**: wide open volume;
- **dead ends** and **alcoves**;
- **junctions**, **ledges** and the stream bank;
- **depth**: how far each place is along the network from the way in.

### 3.6 The concession (every part reachable)

From the way in, the network is walked:
- **Parts reachable with every kind of link** keep them. A climb or a swim is a fair way.
- **Parts cut off** get the smallest change that opens them: a rubble ramp under a lip that's too high, a squeeze widened a little, a climbable flowstone, a fallen slab across a gap.
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
- a **squeeze**;
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

- **Walking**: the hero's floor and walls come from the field (the walker already reads `CaveSpace.sdf`). Climbing works as now. **Squeeze** is new: a crouched crawl with its own movement and animation (rule 11).
- **Creatures** path on the network, not on grid cells.
- **The minimap** paints the network's standable ground seen so far (today's `DungeonSeen` is per grid cell).
- **The save** keeps what was seen and what was changed (a dug choke, a taken treasure) by network patch.
- **The loop check's bot** walks the network, including climbs and swims.
- **Ways in** are portals as now (`caveThroat.ts`). Lava tube skylights and solution cave sinkholes are new mouths, some of them open to the sky.
- **Light**: daylight shafts at sinkholes and skylights, the hero's torch everywhere else (as now).
- **Water** uses today's water materials and drip particles. Sounds: drips, the stream, a breeze at a crack.
- **The VGM's `cave` tool** asks for a kind, a size, a danger and a built share, with its row in vgm.md (rule 10).
- **Volcanic country**: there is no volcanic landscape kind today. Lava tubes need one (old cinder cones, lava fields, black basalt), added as a kind of country (D55) where the skeleton allows it.

## 6. What is hard, and the limits

- **Cost of forming.** The water lattice is coarse (about 2 m; a 200 × 200 × 60 m block has about 300,000 nodes) and runs some tens of rounds. Carving reuses sparse bricks. Aim: a cave forms and carves in under 3 s in a worker, and appears before the hero reaches its mouth (F4 holds).
- **Taste.** A process can form a dull cave: long tubes with nothing in them. That's why phase K starts with a preview tool and Arnd's eye on many seeds before anything is in play.
- **The reader is the big job.** Everything that read the grid moves to the network: walking, creatures, the minimap, the save and the bot. It's the price of "no rooms".
- **Frame time below ground** (F2): one cave mesh per carved brick, as now, and drips as one instanced particle set.
- **Squeeze** needs a new movement and animation for the hero and for creatures that can follow.

## 7. Open questions for Arnd

1. **Ore**: should the hero be able to mine ore (a pick, ore to sell or craft with), or is ore only seen in the walls and sometimes found as loot? Crafting (D32) is still later.
2. **Squeeze**: should it be in phase K, or should narrow places be climbs and swims only at first?
3. **Size**: how big should a large cave be? The suggestion is up to about 300 m across and 60 m deep, with a cave of every kind possible near the start (a lava tube only on volcanic ground).
4. **Order**: phase K could start now with the design work in K1 and K2 (preview only, no risk to play), next to phases D and Q.

## 8. Answers and what K1 and K2 built (2026-11-01)

Arnd's answers to section 7: **ore** is for show, no mining, probably never; **squeeze**: none, every way is at least the hero's standing size (2 m wide, 2.8 m high, `way` in the setting's cave data), narrow places are not part of the design; **size**: yes, the big cave about 300 m across and 60 m deep, as constants (`sizes`); **order**: K1 and K2 start now. He also gave the cave three shares (built, water, lava): usually pure, a mixed cave with two shares and one at zero (`shares`).

K1 and K2 are in `src/world/cave/` (pure, seeded) with the data in `src/setting/classic/formedCaves.ts`. The former differs from 3.2 in two ways worth knowing: the water flows over an 18-neighbour lattice (3 m for a medium block, 5 m for the big one, so the forming stays quick) and each stage's springs sit on the valley face of the block, taken from the land's lowest side. Braids and mazes come from several water paths per round over rock whose ease is jittered; branchwork from one path per round and strong feedback. Open for Arnd: sea caves as water caves whose lowest level lies under the sea (recommended) or a fourth, wave-cut former.
