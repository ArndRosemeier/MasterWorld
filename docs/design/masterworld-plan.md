# MasterWorld: plan

Living document. Status: **draft 3.** Draft 2 added Arnd's decisions of 2026-10-24 (D9–D24): the region quadtree, the hybrid terrain and believable NPC life. Draft 3 adds the decisions from the gap analysis of 2026-10-25 (D28–D47): the player's game (sandbox, character, items, factions, the map), the default world's lore, sound, the interface and the title animation.
Milestone 1 (walk the land) is built; milestone 2 (the town) is under way. Sources checked (main, 2026-10-24): `ArndRosemeier/Norgo`, `Dunfinity`, `Scale`, `Actors`, `AssetGenerator`, `Conversations`, `World` (Xenoworld).

---

## 1. The pitch

A classic fantasy roleplaying game in the browser (TypeScript, three.js, 3D), single player. Its new idea is a **virtual game master (VGM)** that does what a good tabletop GM does: it watches the player, keeps the game feeling good, and **builds the world as play needs it**.

An NPC hints at a dungeon, so the VGM builds that dungeon. The player walks toward the edge of the known land, so the VGM extends the land before they get there. The world starts small, around one small town, and grows out of play.

The world should be believable but fantastic: classic countryside, forests and mountains, towns and cities, cellars and classic dungeons, and later seas and oceans.

**It is a sandbox.** There is no final goal and no ending. There are many long-term goals instead, and the player picks which to follow (D28).

MasterWorld is free and open source under the MIT licence, like all of Arnd's projects (D47).

---

## 2. Decisions so far

| # | Decision | Notes |
|---|---|---|
| D1 | **The VGM is procedural.** No language model is needed to play. | An LLM hook comes later (Norgo's Oracle already had one). Out of the box the game must cost nothing to run. |
| D2 | **Single player.** Multiplayer is a later milestone. | Keep the door open: see section 14. |
| D3 | **TypeScript, three.js, 3D**, like the other projects. | |
| D4 | **The VGM's job is to make the game feel good for the player.** Difficulty and similar options are settings the VGM honours, not separate systems. | |
| D5 | **Classic, bounded dungeons.** Nothing endless. | Dunfinity's endless levels are not the model, but its styles, materials and creatures are reusable. |
| D6 | **Believable but fantastic overworld**: classic countryside, towns and cities on demand. **One small town at the start.** | |
| D7 | **Think big.** Seas and oceans come later and must fit without a rewrite. | The world skeleton has coasts and seas from day one (section 5). |
| D8 | **Skills and magic: start from Norgo's system**, to be discussed. | Section 10. |
| D9 | **Hybrid terrain:** a height field for the big shapes, local voxel/SDF volumes where the drama is (overhangs, arches, cave mouths), hero rock meshes for dressing. | Revised after D18: a pure height field cannot do overhangs or natural caves. Section 5.6. Dungeons are their own full 3D spaces (section 8). |
| D10 | **The VGM may add land or things wherever it makes sense, and may change things when the story calls for it.** | The village got burned or raided; goblins took the dungeon and drove the kobolds out. Section 4.5. |
| D11 | **Ability unlocks from skills and from other sources** (trainers, tomes, quests, items, deeds). | Section 10. |
| D12 | **Game modes like Dunfinity:** roguelike (permadeath) or classic save. | Section 11. |
| D13 | **Real-time combat with tab targeting.** Right mouse button held for mouse look; otherwise the cursor is visible to interact and to target by clicking. | Section 11. |
| D14 | **The setting is a module.** Everything world-related sits behind one big, exchangeable contract. The default module is a classic small-town start. | Section 12. |
| D15 | **Norgo's GM is inspiration only.** It served a different purpose; MasterWorld's VGM is designed fresh. | Section 4. |
| D16 | **Regions are aligned squares in powers of two, from 250 m up.** A bigger region that would leave holes next to existing ones has the holes filled with smaller regions. | Arnd's proposal: no chess board, still predictable sizes. Section 5.5. |
| D17 | **Hero-class graphics and assets from the start.** | Section 5.7. |
| D18 | **The landscape is dramatic, not realistic.** | Believable in structure (rivers run downhill), exaggerated in form. Section 5.6. |
| D19 | **Believable NPC behaviour is first class.** NPCs never just stand around. | The weak spot of most earlier projects. Section 9.2. |
| D20 | **Art style: stylised PBR with dramatic lighting.** | Was O10. |
| D21 | **Stack like Dunfinity:** three.js on WebGPU with WebGL 2 fallback, Vite, strict TypeScript, Rapier, generation in workers. | Was O11. |
| D22 | **Target: 60 fps on a mid-range desktop GPU.** Tablets are a later quality tier. | Was O12. |
| D23 | **Sister repos:** release packages where they exist (Actors); other code is extracted into shared packages as needed, not copied. | Was O13. |
| D24 | **Textures and assets: generated (AssetGenerator) and CC0 libraries.** Only CC0 or own work ships, with sources recorded. | Was O14. |
| D25 | **Water is a hero feature, not a prop.** Seas, lakes, rivers and waterfalls look and behave well (waves, foam, depth colour, refraction, flow), the camera can go under the surface with a proper underwater view, and the player can swim. The door stays open for underwater content (sunken places, underwater dungeons and creatures). | Arnd, 2026-10-24. Base: Xenoworld's water. |
| D26 | **Weather from the start.** Seeded, deterministic weather that drifts over the land: clouds, rain and snow, thunderstorms, mist in the low ground, wind on grass, trees and sea, wet ground and puddles. The VGM drives it with orders. | Arnd, 2026-10-25. Section 5.8. |
| D27 | **Two systems: the VGM and the world simulation.** One simulation moves everything that acts on its own (townsfolk first; later bandits on the road, animals, skeletons in a crypt). It works without the VGM: people always have something to do. The VGM nudges it only through plain-data orders that go into the decision log. | Arnd, 2026-10-25. Section 9.3. |
| D28 | **A sandbox with no final goal.** There are several long-term goals at once, none of them the end of the game. | Arnd, 2026-10-25. Section 11.3. |
| D29 | **Danger lives in places, not in the player's level.** The world is not scaled to the player's power. The land gets more dangerous with distance from the start and with depth underground, and the danger is fixed when a place is built. The game warns clearly ("don't take on that dragon when you're fresh"), and weak foes don't know the player has become a champion. The VGM makes sure there is always something at the player's level to find. | Arnd, 2026-10-25. Growing must feel like growing. Sections 4.1, 11.4. |
| D30 | **Classless, use-based growth.** No classes, no XP, no levels. Skills rise by use (Norgo), and unlocks come from many sources (D11). Character creation is the shared Actors creator with a **filter parameter**: generous, but leaving out what clearly does not fit the setting. | Arnd, 2026-10-25. Section 11.4. |
| D31 | **Items like players know them: common, uncommon, rare, legendary,** shown on WoW-style item cards. Items can raise one or more skills, and a few rare abilities can only be gained from items. | Arnd, 2026-10-25. Section 11.5. |
| D32 | **No crafting in 1.0.** It can come later. | Arnd, 2026-10-25. |
| D33 | **No intelligent companions.** If there are companions, they are animals, elementals or summoned things, never a talking person who follows you around. | Arnd, 2026-10-25. Hard to make feel good. |
| D34 | **Race factions with reputation.** Each people is a faction, and they have their own areas: a human walking into the orc town is in trouble unless they have earned the orcs' trust. Other factions (guilds, the Temple, the watch) come later. | Arnd, 2026-10-25. Section 11.6. |
| D35 | **The player's map is the hint channel.** When an NPC gives a task, the player shows them the map (animated), and the NPC marks the place on it. An **orientation skill** makes the player's own position on the map more and more exact. | Arnd, 2026-10-25. Sections 9.1, 11.7. |
| D36 | **Talk uses Arnd's Conversations package.** Free LLM access through Arnd's `freeryder` project (no cost, but less reliable) is a separate discussion (O15). | Arnd, 2026-10-25. Sections 9.1, 15. |
| D37 | **Game time: one game day takes 60 real minutes.** The player moves at real speed. | 2026-10-25. Section 5.4. |
| D38 | **Interiors are their own small scenes behind a door,** with a short fade. | 2026-10-25. Section 7. |
| D39 | **Dungeons must not feel formulaic.** This is the main risk of any generator and gets real design effort of its own. | Arnd, 2026-10-25. Section 8.1, O16. |
| D40 | **Animations come from Actors' large library,** with no fixed list up front: we take what the town needs as we find it. Horses are being made in Actors. | Arnd, 2026-10-25. |
| D41 | **Settlements from farmstead to capital.** The start town is small (about 80–120 people), but bigger towns and a capital must be possible; the detail-by-distance budget makes them affordable. | Arnd, 2026-10-25. Sections 7, 9.3. |
| D42 | **Tone: warm and full of wonder, with real danger.** Humour comes from people. A comic-relief character with some slapstick is allowed, as the exception. | Arnd, 2026-10-25. Section 12.1. |
| D43 | **The default world: the Fading.** Magic drained out of the world 300 years ago and is now seeping back. Five Wardens are its gods. Creatures include truly giant versions of animals and monsters, and human giants. | 2026-10-25 (Arnd: giants). Section 12.1. |
| D44 | **Sound is generated through OpenRouter** (the `openrouter` skill), with CC0 libraries as backup. Procedural sound only where a model cannot give a good result. | Arnd, 2026-10-25. Section 16. |
| D45 | **The interface speaks "warded brass":** engraved brass instruments in dark leather with dwarven wards set into the metal, which light up as magic returns. Every window shares the language and has its own signature. Things are animated whenever they are shown and never sit quite still: playful and varied. | Arnd, 2026-10-25. Section 17.1. Mockups: [canvas](https://claude.ai/artifact/77cZmr4B2d3Y6yyieQCfU8). |
| D46 | **The title animation is a hero feature.** Captivating and playful, like Starlord's, and the world is built behind it while it plays. | Arnd, 2026-10-25. Section 17, O18. |
| D47 | **Free and open source, MIT licence.** | Arnd, 2026-10-25. |

---

## 3. What we take from the earlier projects

| Repo | What it has | Use in MasterWorld |
|---|---|---|
| **Norgo** | Fantasy open world; a GM (`src/gm`: Director, PlayerModel, Narrator, QuestForge, QuestBook, Scout, Oracle); use-based skills with 10 magic schools; data-driven ability recipes; server in a Web Worker behind a message protocol. | Skills, abilities and magic. The server/worker split for the multiplayer door. Its GM is **inspiration only** (D15): it ran pacing in a world that already existed. Outdated as a whole, so we port ideas and code selectively. |
| **Dunfinity** | Procedural 3D dungeon, many styles, procedural creatures, item and lore design. | Dungeon styles, materials, lighting and creatures. The layout generator itself is new (D5). |
| **Scale** | Seed-driven settlements from hamlet to metropolis: macro plan → cells → lots → buildings → elements; interiors; "a Settlement placed into a World". | The planning layers for towns and cities, and interiors for houses and cellars. Needs a medieval style family (section 7). |
| **Actors** | Morphable rigged humans, ten fantasy races, animals, clips; `@actors/generator`. | All people and many animals. |
| **AssetGenerator** | Spec → headless Blender → `.glb`; props, procedural creatures; shared TS packages. | Props, furniture, creatures, dungeon dressing. |
| **Conversations** | Procedural NPC knowledge and talk: per-NPC evidence, testimony, a runtime world catalog (`world.addFacts`), save/restore. | The channel through which the VGM plants hints (section 9). |
| **World (Xenoworld)** | Continents and seas, water simulation, waterfalls, Gerstner-wave seas with shore foam. | Sea and river rendering, the later ocean. |

---

## 4. The VGM

The VGM has two halves that share one view of the player.

### 4.1 Director: making it feel good

Designed fresh (D15). Ideas worth taking from Norgo's GM:

* a **player model** that infers playstyle (explorer, fighter, socializer, crafter, mage, sneak) from decayed evidence, plus a factual history;
* a **tension curve** (calm → build-up → peak → relief) with fairness rules: no spawns while hurt, talking or just respawned; attackers appear in front of the player, never on top of them;
* a **pacing queue** for messages, so the GM never floods the screen.

The big difference: Norgo's GM could only *find* things in a world that already existed (its Scout searched for unexplored features). MasterWorld's Director *orders* things from the Builder.

The Director also keeps a small set of **needs**, each a score that rises over time and falls when it is met:

| Need | Rises with | Met by |
|---|---|---|
| Discovery | time since the last new place | a new site, a view, a secret |
| Challenge | time since the last real fight, scaled by playstyle | a lair, an ambush, a boss |
| Reward | time since the last notable item | treasure, a merchant, a gift |
| People | time since the last new face | a traveller, a village |
| Purpose | no active goal | a hint, a quest |

Each tick the Director looks at the most overdue need and picks the cheapest action that meets it, within the difficulty settings. That is the whole "feels good" loop. It stays explainable and tunable.

**The Director does not scale the world to the player (D29).** Each place gets its danger when it is built, from its distance to the start, its depth and its purpose, and keeps it. What the Director chooses is *where* to put things: when the Challenge need is overdue, it places or hints at something that fits the player's power, but the dragon in the mountains stays a dragon. Dangerous places are signposted: NPCs warn, there are bones at the cave mouth, and a creature's name shows a threat colour against the player's power.

**Measured, not hoped for.** A headless bot plays by script (follows leads, walks, fights) and a check logs the real time between notable things and how overdue each need gets. It fails when a gap is over 5 minutes. Starting density, tuned in the setting module: within 2 km of town something worth a look every 200–300 m off the road; farther out every 400–600 m, but bigger.

### 4.2 Builder: building what is needed

The Builder turns the Director's orders into world. Its central idea is the **promise**.

> A promise is something the world has said exists but has not built yet.

When the Director wants to give the player a goal, it writes a promise into the **ledger**: *"a mine taken by goblins, two hours' walk north-east, in the hills; the dwarves sealed the lower galleries"*. It then gives that knowledge to an NPC (section 9). Nothing is built yet.

A promise moves through stages, and each stage costs more than the one before:

| Stage | Trigger | What exists |
|---|---|---|
| **Sketch** | the promise is made | kind, purpose, rough place, theme, a secret or two, a difficulty band |
| **Outline** | the player commits: learns the hint, asks the way, takes the quest, or heads that way | exact site on the land, entrance, layout graph, inhabitants, treasure |
| **Built** | the player gets close (a few km away, tuned to travel speed) | geometry, props, creatures, ready to stream |

Because the VGM made the hint, it always knows what the hint means. It never has to understand the player's words.

**The edge of the world is just another promise.** Land that the player can see but has not been detailed is a promise of land. Same stages, same budget.

**A promise is plain data:** id, template, constraints (place, distance, theme), stage, state (open, kept, failed, withdrawn), danger, the facts it planted, and the long-term goal it belongs to, if any. Canon facts are triples (subject, predicate, object), the same shape as Conversations' predicates, so one fact feeds both. A promise the player ignores for a long time can be resolved by the world through an event ("the watch cleared the cellar"), so no NPC ever told a lie.

**Promise templates** are data in the setting module: purpose, constraint slots, hint lines, inhabitants, goal state, reward. A first set: rats in a cellar, a smugglers' cellar, an heirloom lost in a ruin, a wolf pack, bandits on the road, a restless crypt, a missing person, a goblin-held mine. A promise is kept when its goal state is reached (the boss is dead, the item is found), which the simulation or the dungeon reports; the NPC who gave it pays the reward.

**Events** (raid, takeover, plague, festival) are templates with preconditions (a raid needs a bandit camp within 3 km of a village and bandits left alone for two game days), a cooldown, and at most one big event per region per game week. They run as simulation orders.

### 4.3 Signals the VGM watches

* Position, heading and speed: which promises and which frontier lie ahead, and how soon the player will arrive.
* Knowledge: which hints the player has heard (from Conversations), which quests they have taken, what is on their map.
* State: health, level, gear, playstyle, how long since each need was met.
* Settings: difficulty, density, pacing.

### 4.4 Budget and latency

* Generation runs in workers. The VGM has a fixed per-second build budget.
* **Build ahead, hide the wait.** Travel time covers it: outline on commitment, build when a few km away. A walking player gives minutes of warning, so the budget is generous.
* Fast travel (horse, ship, teleport) must not outrun the builder. A journey is a promise too: the VGM knows the destination when it starts.

### 4.5 Consistency

* Every generated fact goes into the **canon** (the ledger plus the facts derived from it). New content must agree with it.
* Promises carry **constraints** ("in the hills", "within two hours", "near water", "dwarven"). The Builder must place the content inside them or report failure. Then the Director makes a different promise, and the NPC never told a lie.
* **The VGM may place things wherever it makes sense** (D10), seen or not, as long as it fits the canon: a new farm by the road, a camp in the woods. What it may not do is quietly rewrite something the player knows.
* **Known things change only through story.** A change to something the player has seen or been told about is an **event** in the ledger with a cause: bandits burned the village, goblins took the mine and drove out the kobolds. An event leaves **traces** the player can find: ruins and ash, kobold refugees on the road, rumours in the tavern, a survivor with a story. So a change never feels like the world contradicting itself; it feels like the world moving on.
* Events are also the VGM's strongest tool for "feels good": a place the player liked being threatened is a hook, and the player's own deeds (clearing the bandits) can cause events too (the hamlet grows).

---

## 5. The world model

### 5.1 The world is the seed plus the decision log

All generators stay pure functions, as in Dunfinity and Scale: `(seed, parameters) → content`. The VGM adds only small **decisions**:

* "a goblin-held mine of style X, at this site, with these parameters"
* "a hamlet here, size S, race mix M"
* "the blacksmith in Eastmere knows about the mine"

Rebuilding the world means replaying the decision log through the generators. Saves stay small (the log plus per-site diffs for what the player changed), everything is reproducible, and the log is exactly what multiplayer would later have to share.

### 5.2 A fixed coarse skeleton, detail on demand

> Region sizes are decided in 5.5 (D16): aligned powers of two from 250 m.

A believable world needs global structure: rivers run downhill to a coast, mountains form ranges, climate follows latitude and rain shadow. That is hard if land is invented piece by piece. So:

* **Skeleton**: low-frequency fields (continents, seas, mountain ranges, climate, biomes) as global functions of world position. They are cheap, unbounded, and consistent everywhere.
* **Regions** (250 m to many km, see 5.5): the unit the VGM opens. Opening a region places roads and fixes the sites the ledger puts there. Rivers and drainage come from the skeleton (solved lazily on its coarse grid and cached), so they are continuous across region borders.
* **Detail**: terrain mesh, vegetation, buildings, only near the player and streamed with LOD.

The skeleton is unbounded and fixed. The VGM decides **what stands on it** and **when it is detailed**. "The world starts small" means few regions are open and few promises are made, not that the land is missing.

### 5.3 Soft and hard land

* **Hard**: anything the player has seen or been told about in detail. It changes only through story events (4.5).
* **Soft**: everything else. Even inside an open region, unseen land stays soft, so the VGM can still put a ruin behind the next hill when a need calls for it.

### 5.4 Time and travel (D37)

* **One game day takes 60 real minutes** (the clock runs 24 times faster); night is about 12 minutes of it. The player moves at real speed: running is 5.2 m/s, so 1 km takes about 3 real minutes and a 4 km region about 13.
* **Travel**: on foot first; horses (from Actors) in milestone 5 at about 12 m/s; fast travel as a paid cart between known towns, which is a journey promise (4.4). Magic waystones may come later.
* **Seasons** (milestone 5): four seasons of 7 game days each. They change snow, fields, festivals and the date.
* View distance several km, with the far horizon drawn from the skeleton alone.
* The skeleton is big enough for several continents and oceans between them.

### 5.5 Region sizes: aligned powers of two (D16)

Arnd's proposal, decided: regions are squares whose side is **250 m × 2ⁿ** (250 m, 500 m, 1 km, 2 km, 4 km, 8 km, 16 km …), **aligned to their own grid** (a 2 km region starts at a multiple of 2 km). Together they form a quadtree.

* **The VGM picks the size that fits the content**: a farmstead gets 250 m, a village 1 km, a city 4 or 8 km, a great forest 16 km.
* **Holes are filled with smaller regions.** When a big region opens next to existing smaller ones, the parts of its square that are already taken stay as they are, and the rest is filled with the largest aligned squares that fit. That decomposition always exists and is unique, because every aligned square splits exactly into four aligned squares of half the size. So the world is covered without gaps or overlaps.
* **Why it does not look like a chess board:** sizes vary with content, and region borders are invisible. Terrain, rivers, roads and vegetation come from continuous fields in world coordinates; a region only decides *what* is placed and *when* it is built, never the shape of the land.

Refinements (proposals):

* **Content is not square.** A city's footprint, a forest's edge or a lake is a free shape inside its region; the region is the container and the budget unit, not the outline. A footprint may reach into neighbouring regions that are still soft; opening those later must respect it.
* **Fill regions are cheap.** Holes are filled at sketch stage (plain countryside with its biome) and get detail only when the player comes near, so opening a big region does not cause a build spike.
* **The streaming tile is separate.** Rendering, LOD and saves use a fixed technical grid (250 m tiles and their coarser levels), so the build and memory cost per tile stays predictable whatever the region size.
* **The frontier** is the outer edge of all opened regions. When the player gets close, the VGM opens a region beyond it, sized for whatever the Director wants there.
* **Addresses**: a region is `(level, x, z)` with `size = 250 m × 2^level`. Parent and children follow by halving and doubling, which makes lookup, saves and later multiplayer sharding simple.

### 5.6 Hybrid terrain for a dramatic landscape (D9, D18)

A pure height field stores one height per point, so overhangs, arches and natural cave mouths are impossible in it. A dramatic landscape needs them, so the terrain has three layers:

1. **Height field: the big shapes.** Steep, exaggerated ranges, mesas, terraces, deep gorges, sea cliffs seen from afar. Cheap to draw to the horizon, simple LOD, good for seas and rivers. Drama here comes from shaping: ridged and terraced noise, vertical exaggeration, sharp erosion, and a setting module that may ask for more (D14).
2. **Local volumes: where the drama is.** Small voxel or SDF pieces on top of the height field, meshed with surface nets (Norgo and Xenoworld already do this). They give overhangs, natural arches, karst towers, floating rocks if the setting wants them, and cave mouths that flow from the ground into a dungeon. A volume blends into the height field around its edge, so there is no visible seam. The VGM places them like any other feature ("a stone arch over the pass", "a cave mouth under the waterfall").
3. **Hero rock meshes: dressing.** Boulders, cliff faces, spires and rubble from AssetGenerator, scattered by rules.

The voxel cost is paid only where it is worth it. Geomancy (section 10) can edit volumes and spawn rock pieces; it does not dig through the height field.

### 5.7 Hero-class graphics (D17)

* Every asset and material aims for hero quality from the first milestone. Placeholders are allowed only behind a flag, never as the shipped default.
* The shader policy ([docs/SHADERS.md](../SHADERS.md)) already assumes a **closed set of high-quality materials**: a few excellent material kinds (terrain blend, rock with triplanar mapping for volumes, foliage, water, skin from Actors, cloth, metal, stone, wood) beat many mediocre ones.
* Lighting, sky, atmosphere and fog carry much of the drama: a strong time-of-day cycle, aerial perspective over long views, volumetric light where the budget allows.
* Art style, rendering backend and target hardware are decided (D20–D22).

### 5.8 Weather (D26)

Weather is part of the world model (`src/world/weather.ts`), pure and deterministic like the land: the weather at a place and a moment follows from the seed, the setting's climate and the VGM's orders. NPCs (shelter in the rain, 9.2), the VGM and the renderer all read the same weather.

* **Natural weather** is a slowly changing field of "wet air" that drifts with the world's prevailing wind (the sea's swell runs the same way), so fronts come in from one side, pass over and clear. Local moisture and temperature (the skeleton) shift it: wet coasts rain more, dry inland less, and cold places get snow. Unstable air turns rain into thunderstorms. Calm, damp mornings bring mist that pools in the low ground. Wet ground remembers the rain for hours.
* **The setting tunes the climate** (`world.weather`: front size and speed, rainfall, storms, mist, wind, drying). Fantastic weather (ash fall, a blood-red storm) can be added as new kinds later.
* **The VGM orders weather** like it orders land: `{ kind, from, to, at?, strength? }`, blended in and out over a ramp, so a summoned storm rolls in. Orders are plain data and go into the decision log. Uses: a storm for a dramatic arrival, fog that hides the bandits' camp, clear skies for a festival, rain that keeps people indoors (and the player in the tavern, hearing rumours).
* **Drawn** by `render/weather/WeatherView.ts`: the sky's clouds, light and haze; height mist; rain streaks and snow flakes around the camera; lightning; wind strength on grass, trees and waves; wet, glossy ground with puddles and rain rings on water. `?weather=<kind>` forces a kind (it places an order for all time).
* Later: thunder and rain sound, snow lying on the ground, distant rain curtains, cloud shadows, rainbows, seasons.

---

## 6. The start

* One small town, ideally at a river crossing (that is where real towns grow), in a temperate region.
* The town's region is open (about 1 km), the land around it is sketched.
* This start is the default **setting module** (D14, section 12). Another module can start somewhere else entirely.
* Three or four promises are already planted in townsfolk: a cellar with a problem, a nearby ruin, a road with trouble, something farther away.
* The rest of the world exists only as skeleton and horizon.

---

## 7. Settlements

* Sizes: farmstead, hamlet, village, town, city, and a capital (D41). The VGM makes them on demand (People need, a quest, a road needing a waypoint).
* **Growth**: a settlement can be upgraded by a later decision (a hamlet becomes a village after the player cleared the bandits). Growth adds to the plan and never moves what the player has already seen.
* Scale's planning layers (macro plan → cells → lots → buildings) look reusable. Its look is modern, so MasterWorld needs a **medieval style family**: walls and gates, market square, temple, organic streets, timber-framed and stone houses, mills, docks, castles.
* Race shapes architecture: a dwarven hold, an elven village and a human town should differ in plan as well as look.
* Every building with an interior is a possible cellar or dungeon entrance.
* **Interiors (D38)** are small scenes of their own behind a door, entered with a short fade (half a second or less), each with its own lighting and budget. Open fronts (market stalls, a smithy's yard) stay outside. First interiors: the tavern, the smithy, the temple and the player's room.
* **Roads**: when a region opens, roads link its settlements to the network along the cheapest path over the land (slope, water, fords and bridges). The kind follows what they link: a path, a cart track, a paved road near towns. Roads are decisions in the log; the routing is shared code in an AssetGenerator package.
* **Footprints (was O9)**: hard land always wins; between soft things the older decision wins; settlements and roads beat vegetation, so a growing town clears the forest edge. A new footprint reserves its area in neighbouring soft regions.
* **Peoples have their own areas (D34)**: a dwarven hold, an orc town. Who may walk in safely follows the player's standing with that people (11.6).

---

## 8. Dungeons and cellars

Classic and bounded: a beginning, a middle, an end, with a boss or a treasure or a secret there.

**Purpose first.** The generator starts from *why the place exists*, then derives the layout:

| Kind | Layout follows |
|---|---|
| Cellar | the house above it; small, one problem (rats, smugglers, a hidden door) |
| Mine | the ore vein; galleries, shafts, a flooded or sealed lower part |
| Tomb or crypt | symmetry around the burial chamber; traps; guardians |
| Natural cave | water and rock; a lair at the end |
| Ruined keep or temple | a building plan, collapsed and reoccupied |
| Bandit hideout | a cave or cellar with practical use: sleeping, loot, lookout |
| Wizard's tower | vertical; puzzle rooms |
| Sewer | the town's streets above it |

The purpose also tells the Director what to hint ("the dwarves sealed the lower galleries"), what lives there, and what the treasure is.

* Dungeons are **their own spaces**, entered through doors, stairs or cave mouths. This keeps them bounded and gives clear loading points. A cave mouth is a terrain volume (5.6), so the outside flows naturally into the inside.
* **Inside, a dungeon is full 3D**: overhangs, chasms, multi-level halls, bridges, flooded galleries, voxel or SDF caves where natural rock is wanted, built pieces where people made it. Built entrances (a cellar hatch, a crypt door in a hillside) are props.
* Dungeons change through story events too (D10): when goblins drive out the kobolds, the layout stays, the inhabitants, dressing and traps change.
* From Dunfinity: styles, rock and brick materials, lighting, creatures. From AssetGenerator: props and dressing.
* Once outlined, a dungeon is fixed. The player's changes are stored as diffs.
* **Graph first**: purpose → a graph of rooms and links (main path, loops, side branches, locks and keys, the goal) → laid out in 3D from built kit pieces, or carved as an SDF cave → dressed. Milestone 3 builds the cellar kit only.

### 8.1 Against formula (D39)

Dungeon generators turn formulaic easily: after the third crypt the player has seen them all. Eight layers work against it ([full write-up](https://claude.ai/artifact/AekqvbH369xW1pu8QrfgKN)):

1. **History first.** The generator writes the place's past as layers of occupation (who built it and why, what went wrong, who moved in after, who is there now). Each layer leaves rooms and traces: original halls, collapse, rooms re-used (a chapel turned goblin kitchen), a barricade from a last stand. The same history feeds the VGM's hints in town.
2. **Cycles, not trees.** Layouts are built from loops (as in *Unexplored*): a key on a loop around its door, the goal seen across a chasm long before you reach it, a hidden way back, a shortcut that opens once you've gone around. A library of 15–20 cycle patterns, two or three combined per dungeon.
3. **Set pieces.** A growing library of hand-designed moments with their requirements (a flooded hall, a collapsing bridge, a sleeping giant, a ward wall that the right item breaks). At least one signature set piece per dungeon; none repeats until the library has been used through.
4. **Space, not boxes.** Full 3D: galleries over halls, chasms, collapsed floors, rising water, SDF caves blended into built rooms. Each kind has its own space rules.
5. **Living inhabitants.** The world simulation runs inside (D27): kitchens, sleeping quarters, guard shifts; they raise the alarm, flee for help, barricade doors.
6. **Mechanics with tells.** Traps you can spot, levers and water, light and darkness, wards that only the right school or item opens (D31), secrets that reward looking.
7. **Pacing.** A tension curve in every dungeon: a quiet entrance with foreshadowing, rising danger, one safe spot, a reveal, the climax, a shortcut back out.
8. **Small and dense.** Most dungeons take 15–40 minutes; bigger ones are several connected parts with their own stories.

Arnd's rules (2026-10-25):

* **A world, not a game.** No gamey puzzles. A puzzle exists only with a very good in-world reason, and then it is a detective puzzle, never an infantile one: reading the clues the place's history left (whose grave is missing, why the water channel was blocked, which ledger entry is a lie).
* **Repopulation.** A cleared or half-cleared dungeon can be moved into again, as a story event (D10): the goblins' cousins come back, something worse finds the empty halls.
* **Breaking expectations, rarely.** Monsters mostly fight, but now and then one surprises: a goblin who speaks broken Common and begs for mercy, a kobold who wants to trade.

**Checked, not hoped for**: a variety test generates many dungeons per kind and fails when layouts, set pieces, room shapes or dressing repeat too often, or a dungeon lacks a signature set piece, a safe spot, a shortcut out, or traces of its history. A small sample runs in `npm test`; the full sweep is a slow script.

**Order of work**: milestone 3's cellar uses layers 1, 2, 7 and 8 and one set piece; the other layers grow with each new dungeon kind.

**Built so far (2026-10-25)**: `@futuremagic/dungeon` (AssetGenerator) holds the shape: 12 cycle patterns, `cyclicGraph`, the tension curve (`pace`) and a multi-level layout with stairs, ledges and tall halls. MasterWorld holds the meaning: the cellar lore in the setting module (`dungeons.cellar`: room uses, builders, older layers, troubles, dwellers with their hint lines), `src/world/dungeon/cellar.ts` (sketch and outline), two set pieces (`broken-floor`, `bricked-wall` with its ledger clue), and the VGM's `promiseCellar` (src/vgm/dungeons.ts), which puts the first cellar under a house of the start town. `npm run variety` sweeps 1000 cellars.

---

## 9. NPCs

### 9.1 Knowledge and talk

* People come from **Actors** (races, bodies, clothing, animation).
* What they know comes from **Conversations**: the VGM plants a promise as a fact in one or a few NPCs' knowledge with `world.addFacts`. Rumours can spread between NPCs over time, with attribution and errors.
* When the player learns the fact, Conversations knows it. That is the commitment signal for the promise.
* **The map is where a hint lands (D35).** When an NPC gives a task, the player hands over their map (an animation, both looking at it), and the NPC marks the place. The journal lists the open leads, each linked to its mark.
* Talk uses Arnd's **Conversations** package (D36). The default world ships its own Conversations setting package, written as data (drafted with an LLM offline and checked in, so play costs nothing, D1).
* Conversations' own review says open free-text conversation is still weak. **Topic-based dialogue** (pick a subject, ask about it) fits the hint channel well and avoids the problem. Free text can come later with the LLM hook.

**Built so far (2026-10-25)**: Conversations 0.1.0 (its GitHub release) runs the talk (`src/talk`): every townsperson is a character with a name from the setting (`names`, households share a family name) and their own evidence. The VGM's cellar hint (`src/vgm/hints.ts`) goes in as what the household above has seen themselves, and as hearsay the household told the innkeeper and two neighbours ("I heard it from Grundi Coalbeard"). Topics: who are you, anything strange lately, each lead, tell me more, how do you know, farewell (wording in the setting's `talk`). T talks to the person in front (they stop and face you, `TownLife.hold`), J opens the journal (one lead per promise, with what each person said), M the map (hill shading, contours, the town, the hero, red-ink marks drawn in when new). Hearing of a promise is the commitment signal.

### 9.2 Believable life (D19)

NPCs standing around is what broke the illusion in most earlier projects. Norgo already had needs, schedules, memories and goal planning, and its people still often stood still, because the visible layer was thin: few places that tell a person what to do there, and few animations to do it with. So in MasterWorld the visible layer comes first.

**The rule: every NPC on screen is visibly doing something.** Standing still is allowed only as an activity of its own (waiting at a stall, keeping watch, listening to someone), with motion: weight shifts, looking around, gestures.

How:

* **Smart objects.** The world tells people what to do. Every anvil, well, bench, stall, field, woodpile, hearth, bar counter and doorway carries **affordances**: which activity it offers, for which jobs, where to stand, which animation and prop, how long, how many at once. Settlement and interior generators place them as a matter of course: a smithy is not finished until it has its forge, anvil, quench tub and woodpile with their affordances. Norgo's `SmartSpot` (13 kinds) is the seed of this; MasterWorld needs many more, and several per building.
* **Activities, not poses.** An activity is a short sequence: walk there, put down the basket, draw water, lift the bucket, carry it home. Props move with the hands (IK onto the prop). Carrying things between places (sacks, buckets, firewood, tools) is the cheapest and most convincing life there is.
* **Daily schedules by job, personality and weather.** Work, meals, the tavern in the evening, the temple on a holy day, shelter in the rain, sleep. Personality (from Scale's personality plan: Big Five traits) varies the timing and the choices: the lazy apprentice takes long breaks, the pious widow goes to the shrine.
* **Social life.** People meet and talk in pairs and small groups with gestures and turn-taking, children play and chase each other, someone shouts across the market, a couple argues. Groups use Conversations underneath, so what they say can be real gossip (the VGM's rumours spreading, 9.1).
* **Reactions.** To the player (glance, greet by name if they know them, step aside, stare at a drawn weapon), to events (fire: run with buckets; a raid: flee, bar the doors), to weather and time of day.
* **Animals and traffic.** Dogs, chickens, cattle, a cart on the road: Actors' animals, with the same smart-object rules (a trough, a pasture, a kennel).
* **Detail by distance.** Near the player: full locomotion, animation, IK and look-at. Further away: cheaper updates. Off screen: an abstract schedule in coarse time steps, caught up when the place is seen again (as Norgo did). What the player sees must always agree with the schedule (the baker is at the bakery at dawn).

**Animation** comes from Actors, which has a large library (D40). There is no fixed list up front: we take what the town needs as we find it (hammering, sweeping, chopping, carrying, drawing water, sitting and eating, talking gestures …) and ask Actors for what is missing. Procedural IK puts hands on props.

**It is checked, not hoped for.** A headless test runs a town for an in-game day and measures how much of the time each visible NPC spends without an activity. The target is under 5 %, and the test fails above it. A second check counts distinct activities per town and per hour, so variety cannot quietly shrink.

### 9.3 The world simulation (D27)

Everything that moves by itself lives in **one simulation** (`src/sim`, pure, runs in a worker and in tests), and the VGM is a separate system that steers it.

* **The shared core**: agents (position, kind, home or territory, the activity they are in), navigation (streets and roads, open land, later dungeon graphs), smart objects (an anvil, a well, a bandit camp, a waterhole, a crypt door all offer activities), detail by distance with an abstract off-screen schedule that catches up, and one entry point for orders.
* **Behaviours per kind** sit on top: citizens follow day schedules by job, personality and weather (9.2); bandits watch a road and ambush; deer graze and flee; skeletons guard and patrol. Milestone 2 builds the core and the citizens.
* **Without the VGM** the simulation still runs: the town lives by its own schedules.
* **The VGM steers through orders**, like weather orders: `{ kind, who or where, from, to, ... }`, such as a festival in the square, a curfew, rain keeping people in, or "Mara goes to the well and tells whoever is there about the cellar". Orders are data and go into the decision log, so a replay gives the same world.
* **The simulation reports** what happens (who met whom, who saw the player), which the VGM reads and Conversations uses to spread rumours.

Built so far (`src/sim`): `nav.ts` walks along the streets (a graph on their centre lines, the market as a hub, around a house to its back yard); `spots.ts` turns the plan's fixtures and doors into smart objects (what is done there, by whom, for how long, how many at once); `people.ts` fills the houses (trades, stall traders, the temple keeper, hands, homemakers, children; traits shift each one's day); `townLife.ts` runs them: every agent is always on the way or doing something, turns last real seconds while the game clock only picks the part of the day (so a stopped clock still gives a busy town), rain sends people in, far agents skip their walks, and the VGM's town orders are `gather` and `stayIn`. `test/townLife.test.ts` holds the town to it: through a whole day under 5 % of the time idle.

* **Budget (D41)**: at most about 30 agents in full detail near the player, about 100 at a cheap middle level, the rest off screen; the simulation gets about 2 ms of main-thread CPU per frame, and a check measures it. That is what makes bigger towns and a capital possible.
* **Saving**: the simulation is not saved in detail. It is rebuilt from the clock and the schedules; only lasting changes are saved (who died, moved items, relationships, merchants' stock).
* **Creatures** use the same core: idle, alert, fight, flee; they notice by sight and sound, stay tied to their territory, and fight in groups with roles (leader, melee, ranged). Their power comes from where they live (D29), not from the player.

Drawn (`src/render/folk`): the nearest people out of doors within 70 m (30 by default, `?folk=N`) get an Actors character from a pool, dressed from their seed and role in Actors' medieval wardrobe (`looks.ts`: tunics, hose, chemises, skirts, a long tunic for traders, robe and mantle for the temple keeper) and playing a clip per activity. Far ones draw Actors' "Crowd" level. Everyone else out of doors within 320 m (up to 120) is a plain robed figure in the colour of their clothes, all in one instanced draw (`FarFolk.ts`): the cheap level of D41. A test holds the simulation of the start town under its 2 ms a frame (it takes a few hundredths of a millisecond). `npm run packs` copies the part of the Actors pack the town uses (about 90 of 530 MB) into `public/packs`; the Pages build runs it. Actors makes adults only, so children live in the simulation but are not drawn yet.

The VGM's own part in milestone 2 is small: the **decision log** (`src/world/decisions.ts`) and the **Builder** (`src/vgm/builder.ts`) founding the start town as its first decision. The town's plan comes from `@futuremagic/settlement` (`planTown`).

---

## 10. Skills and magic (to discuss)

Norgo's system, as it stands:

* **Use-based skills**, 40 in total and capped at 100, in six groups: combat (blades, axes, archery, shields, armour, acrobatics …), magic, utility (climbing, stealth, lockpicking, mining …), survival, craft, social.
* **Ten magic schools**: pyromancy, cryomancy, geomancy, gravitas, vitae, luminism, umbramancy, kinesis, animism, runecraft.
* Skill thresholds unlock **abilities**. Abilities are data-driven recipes (`ops`: projectile, area, zone, terrain edit, effect …) with mana, stamina or HP cost, cooldown and cast time.
* Race bonuses and an innate magic school per character.

Decided: **a mix** (D11). Skill levels still unlock abilities, and other sources do too: a trainer, a guild rank, a found tome or scroll, a quest reward, an item, a deed ("slew a dragon"). That gives the VGM another lever: it can hand out an unlock as a reward that fits the player's playstyle.

Decided for the default world (2026-10-25): magic is what returns after the Fading (12.1), so mages are rare and respected. **Six schools at the start**: pyromancy, cryomancy, geomancy, vitae, luminism, umbramancy. Kinesis, animism and runecraft can come back later as long-term goals. Gravitas is dropped. A hedge witch and a half-ruined tower near the town are the first teachers. Items can also grant rare abilities (D31).

Notes:

* **Which schools fit this world?** Gravitas was tied to Norgo's variable gravity. With hybrid terrain (D9), geomancy can shape the local volumes and spawn rock pieces (walls, pillars, bridges); digging through the height field itself is out, and inside dungeons it works where the geometry is a volume.
* **Where does magic come from in the lore?** That shapes which NPCs teach it and what the VGM may hint.
* **Keep the recipe format.** It is the part most worth porting as is.

---

## 11. Playing

### 11.1 Game modes (D12)

Like Dunfinity:

* **Roguelike**: permadeath, one save that the game writes itself. Death ends the character; the world (the ledger) can stay for the next one, so a new character can find the old one's grave, gear or legend.
* **Classic**: save and load freely.

The mode is a setting the VGM honours (D4): in roguelike mode it is stricter with fairness, since a death costs more.

### 11.2 Combat and controls (D13)

* **Real-time combat with tab targeting.** Tab cycles through hostile targets in front of the player, nearest and most threatening first. Abilities fire at the current target.
* **The cursor is visible by default.** Clicking a creature or NPC targets it; clicking an object or person interacts (talk, open, loot, pick up).
* **Right mouse button held: mouse look.** The cursor hides, the mouse turns the camera and the character; releasing brings the cursor back where it was.
* Movement with WASD, third-person camera with zoom to first person.
* This also suits the cast-time and cooldown abilities from Norgo's recipe format (section 10).
* **Death in classic mode**: you wake at the nearest temple or inn and lose some coin; carried gear stays where you fell, so going back for it is a small quest. Loading a save is always allowed.

### 11.3 The core loop (D28)

* **Ten minutes**: walk, notice something (a view, a camp, a person), deal with it (talk, fight, sneak, loot), move on.
* **An evening**: get a lead in town (a mark on the map), travel, clear the place, come back, sell and upgrade, get new leads.
* **Why come back tomorrow**: open marks on the map, a town that changed because of you, the frontier you haven't seen, and the long-term goals.
* **Long-term goals, many and none final**: the mystery of the Fading and what wakes with the magic, standing with each people, mastering skills, legendary items, the giants in the far mountains, a house of your own. The VGM ties some promises to them; the player follows whichever they like, and none of them ends the game.

### 11.4 Character and growth (D29, D30)

* **Creation**: the shared Actors character creator with a filter parameter for this setting (races, looks, clothing; generous, but leaving out what clearly does not fit), and a background (farmhand, smith's apprentice, acolyte, poacher, scribe …) that sets starting skills and kit and gives one or two people in town who already know you.
* **Growth**: skills rise by use up to 100, more slowly the higher they are; trainers speed them up. Health, stamina and mana grow with the skills that use them. The VGM reads a "power" number (weighted skills plus gear) wherever it needs a level.
* **Reasons to grow**: the world has places you cannot take on yet, and the game tells you so. Coming back later and winning is the reward.

### 11.5 Items and money (D31)

* **Rarity**: common, uncommon, rare, legendary, with WoW-style item cards (name in rarity colour, stats, bonuses, a line of lore). Legendary items are named and have a history in the canon.
* **Bonuses**: items can raise one or more skills; a few rare abilities exist only on items.
* **Slots**: head, body, hands, feet, cloak, main hand, off hand, two rings, amulet, plus four quick slots on the belt. The inventory is a sorted list limited by weight. Durability is light: gear wears, the smith repairs.
* **Money**: copper, silver, gold. It buys gear, training, food and a room at the inn, repairs, later a house. Merchants have limited stock and coin; prices follow what the town has.
* **Crafting**: not in 1.0 (D32).

### 11.6 Peoples and reputation (D34)

* Each people (race) is a faction with a reputation number the simulation reads: greetings, prices, who will talk to you, whether the guards let you in.
* Peoples have their own areas. Walking into the orc town as a human is dangerous until you have earned the orcs' trust (a deed, a gift, a quest for them).
* Other factions (the Temple, guilds, the watch, a thieves' ring) come later.
* Companions, if any, are animals, elementals or summoned things (D33).

### 11.7 The map and orientation (D35)

* The player carries a map that fills in with what they have seen, drawn like a hand-made map.
* NPCs mark places on it when they give a task (9.1).
* The **orientation skill** sets how exactly the map shows where you are: a vague area at first, a sharp arrow at mastery. It rises by travelling and reading the map.

---

## 12. The setting module (D14)

Everything world-related lives behind **one big, exchangeable contract**: the *setting module*. The engine (rendering, streaming, the VGM's machinery, combat, the generators) knows nothing about any particular world. The default module is a **classic fantasy small-town start**.

A setting module supplies, as data plus a few pure functions:

| Part | Contents |
|---|---|
| Identity | id, version, title, save namespace |
| World shape | skeleton parameters: continents, climate bands, biomes, sea level, how fantastic the land may get |
| Peoples | races (Actors body presets), cultures, naming, languages, how they get along |
| Places | settlement kinds and sizes, architecture style families per culture, dungeon kinds with their purposes (section 8) |
| Creatures | rosters per biome and depth, factions (goblins, kobolds, bandits), who displaces whom |
| Items | catalogues, treasure tables, unique items |
| Skills and magic | skills, schools, abilities in the recipe format, unlock sources (D11) |
| Lore | history, gods, the source of magic, the facts NPCs can know |
| VGM content | promise templates, event templates (raid, plague, takeover, festival), hint wording, needs tuning |
| Conversations | a Conversations setting package (its own `setting-package-contract`: domain, predicates, characters, language resources) |
| Start | where and how a game starts: the start area, the first promises, the player's starting kit |

Rules for the contract:

* **Versioned.** A save records the module id and version; a module bumps its version when its saved meaning changes.
* **Validated on load.** Like Conversations' `validateSetting`: authoring errors are reported before play starts.
* **Pure data where possible**, pure seeded functions where not. No `Math.random`, no access to the engine's internals.
* **One module per game.** Mixing modules is out of scope.

### 12.1 The default world (D42, D43)

* **Tone**: warm and full of wonder, with real danger. Townsfolk are human and sometimes funny; dark places are truly dark. Low to middle magic. A comic-relief character is allowed, as the exception.
* **History: the Fading.** The start region is a river valley on the edge of an old realm where men and dwarves once ruled together. About 300 years ago magic drained out of the world: the realm's great works failed, the dwarves sealed their deep halls, cities shrank to towns. Now magic is seeping back, and old things wake with it: wards fail, crypts stir, children are born with the gift. This explains the ruins, the sealed mines and the rare mages.
* **Faith: the five Wardens**: the Sun, the Harvest, the Hearth, the Road and the Threshold (death and passage). Symbols are simple shapes (a disc, a sheaf, a flame, a wheel, an open door); no real-world symbols. A town's temple serves all five; wayside shrines stand on the roads; the Threshold keeps the burial ground. Every seventh day is a rest day with a gathering at the temple.
* **Peoples**: the start town is mostly human, with dwarves (a smith, a miner family), a halfling family running the inn and the odd elf passing through. Men and dwarves are old allies; elves remember the realm differently. Goblins, kobolds and orcs are peoples with their own reasons, mostly hostile at first.
* **Creatures** for the start area: rat, giant rat, bat, wolf, boar, bear, giant spider, bandits (three roles), goblin, kobold, skeleton, ghoul, wraith, cave troll, will-o'-wisp (a sign of the returning magic), deer. Plus **truly giant versions** of animals and monsters, and human giants: cheap to make and fun.
* **Items**: a first catalogue of about 60 (eight weapon kinds, shields, three armour weights, potions, food, torches, lockpicks, rope, valuables), with treasure tables by danger.
* **Names**: humans Old English and Germanic in flavour (Eastmere, Aldric, Mara), dwarves Norse, elves invented and soft, halflings homely English (Tobold Underbank). A seeded generator per people.

---

## 13. Seas and oceans (later, prepared now)

* Coasts and seas are part of the skeleton from day one, so the first town can already lie by a lake or estuary.
* Water is a hero feature (D25). Rendering and water from Xenoworld: Gerstner-wave seas, shore foam, depth colour, underwater view, rivers, waterfalls; swimming from the first water milestone.
* Underwater content later: sunken ruins, underwater caves and dungeons, sea creatures. The VGM can promise them like anything else.
* Later: boats and ships, harbour towns, sea travel as a journey promise, and **islands across the sea as promises** ("sailors talk of an island beyond the fog"). The ocean is the VGM's largest frontier.

---

## 14. The multiplayer door

* Server logic in a worker behind a message protocol, as Norgo did. The VGM and the ledger live on the server side.
* The decision log is the shared truth. Clients only need the seed and the log to rebuild the world.
* What we defer: a VGM serving several players with different needs at once.

---

## 15. The LLM hook

Out of the box nothing calls a model. The hook is a narrow interface the procedural parts already use:

* `describe(promise) → text` for richer hint and lore wording,
* `answer(question, knowledge) → text` for free-text talk (Norgo's Oracle),
* `propose(need, canon) → promise` for more inventive promises, always validated by the Builder's constraints.

Arnd's `freeryder` project offers real LLMs at no cost, but less reliably. Whether and how to use it is a discussion of its own (O15).

An LLM can only *suggest*. The procedural layer stays the authority, so the game never breaks or contradicts itself because of a model.

---

## 16. Sound (D44)

* Sound comes from models through OpenRouter (the `openrouter` skill), with CC0 libraries as backup and sources recorded (D24). Procedural sound only where a model cannot give a good result.
* A shared package in AssetGenerator for playback: Web Audio, positional sounds, mixing, ducking.
* **Milestone 2: ambience**: wind, birds by time of day, rain and thunder, sea and rivers, town bustle, footsteps by surface.
* **Milestone 4: music and combat**: music in layers (explore, tension, fight, town) that fade with the Director's tension curve; weapon and creature sounds.
* No voices for now.

---

## 17. Interface and first start (D45, D46)

* **Warded brass** is the design language (D45, 17.1).
* **Windows**: the map (11.7), the journal and the dialogue window (topics, the 3D speaker stays in view) in milestone 3; inventory with character sheet and trading in milestone 4. The HUD stays small but is as animated and polished as the windows (17.1).
* **The title animation** (17.2) is a hero feature: captivating and playful, like Starlord's, and while it plays the world is built behind it. Then character creation and a short intro.
* **First start targets**: the title animation shows within a few seconds; the game is playable when it ends.
* **Saving**: IndexedDB in the browser, several slots, export and import as a file; autosave on entering or leaving a region or interior and every 5 minutes. A save holds the game version, the module id and version, the seed, the decision log, per-site diffs and the player. Each version bump brings a small migration.
* **Language**: English first; all text goes through a string table from the start, so German can follow.
* **Controls**: keys are rebindable already; gamepad after milestone 5.


### 17.1 Warded brass (D45)

**The shared language.** Every window follows it:

* **Materials**: engraved brass (rims, rivets, gears, hinges) on dark leather and wood; slate inlays where wards sit. Text in a carved capital face for names (Marcellus SC in the mockups) and a book face for reading (EB Garamond).
* **Wards**: thin lines of light set into the brass. They trace themselves in when a window opens and then rest with a slow pulse and a spark that runs along them. Their colour carries meaning: cyan is magic and the UI itself; rarity colours on items (grey, green, blue, orange).
* **The story shows**: early in the game the wards are dim and few. As the long-term goals bring magic back, they grow brighter and more lines wake. The interface ages with the world.
* **Always-on elements are polished too**: the HUD is animated like the windows (D45), but calm enough to sit on screen for hours: slow idle motion, quick reactions to what happens.
* **Motion**: every window has an entrance (shutters, an iris, a flip, a drop, a slide, unrolling), lines arrive one after another with a small bounce, and at rest something always moves (a spark, a ticking gear, a glint, a settling needle). Motion is short (under about 1.5 s to readable), never blocks input, and a setting turns it down for those who want calm.
* **Rarity is the strength of the ward**: common is plain brass, uncommon a breathing ward, rare a ward with a running spark, legendary two sparks, a gear and twinkling stars.

**Each window has its own signature** (proposals, to be shown as mockups):

| Window | Signature |
|---|---|
| Item card | Shutters part, the ward traces the rim, stats rise one by one; the rarity sets the entrance (drop, slide, flip, iris). |
| Map | A brass map case: the lid swings up and the parchment unrolls. A compass whose needle wanders or points true by the orientation skill; marks drawn in with a quill when an NPC adds one. |
| Journal | A brass-bound book. Pages turn, new leads write themselves in, a ward-lit bookmark sits at the newest lead. |
| Dialogue | A brass speaking-ring around the topic list. Topics turn into place like a dial; topics with a new lead glow. |
| Inventory and character | A field chest: the lid opens, compartments slide out. Character skills on brass gauges whose needles rise when a skill grows. |
| Trade | A merchant's balance: coins and goods on two pans that tip as the deal changes. |
| Compass (always on) | A brass ring at the top that turns with the camera. Its needle breathes and settles after each turn and wanders by the orientation skill; map marks slide in on the rim as small glowing studs. |
| Health, stamina, mana (always on) | Three brass gauges with liquid behind glass: it sloshes when you are hit, bubbles when you heal, and the ward around each glows harder as it runs low. |
| Quick slots and abilities (always on) | Brass sockets on a belt strap. Cooldowns run as a ward line around the socket; a ready ability gives a short glint. |
| Target frame | A small brass plate that drops in on a hinge; the creature's threat colour shows in its ward. |
| Clock and weather | A tiny orrery by the compass: sun and moon turn with the day, and a cloud, raindrop or snowflake rides along with the weather. |
| Notifications | A small brass capsule that pops out of the frame edge, rings once and slides back. |
| Settings and menus | A cartographer's tool roll that unrolls; switches are brass toggles that click. |
| Death and waking | The wards go dark one by one; on waking they relight from the centre. |
| Title screen | Part of the title animation (O18). |


### 17.2 The title animation (D46)

StarLord's title is the bar: the game's own world, alive, playful, new every start, with toys and a jump into the game. MasterWorld's version ([full write-up](https://claude.ai/artifact/59Spcz1y7gNNX99LLriQwr)):

1. **Opening** (about 8 s to the menu): dark and wind; one ward line runs over the land like a fuse, and dawn breaks along it.
2. **Fly-over**: the camera rises over the real start region (river, town, sea, mountains). Weather, season, hour and route are drawn from a seed each start.
3. **The logo** forges itself in warded brass (17.1): plates swing in, wards trace the letters, a gear clicks, a glint runs across. Music swells (generated through OpenRouter, D44).
4. **The menu** is a brass instrument panel; around it a town-crier ticker of silly tavern rumours and a card per playable people (a live Actors model doing something in character).
5. **Toys**: the world can be clicked. Birds scatter, the sky gives lightning or a shooting star, a cloud rains, the town bell rings, rarely a sea serpent breaches; a secret code brings a dragon or a giant.
6. **The dive**: New game or Continue drops the camera through the clouds to the hero on the market square; the game starts where it lands.

**It hides the build.** A still of the valley shows at once; the coarse land, sky and far terrain come first; the start town streams in while the menu sits, and shaders compile within [docs/SHADERS.md](../SHADERS.md). The route only comes close where the world is ready, and the dive waits for the last pieces. Weak GPUs fly higher; reduced motion gets the still and a fade.

---

## 18. Open questions

| # | Question | Notes |
|---|---|---|
| O1 | ~~Height field or voxel terrain?~~ | **Decided: hybrid** (D9, 5.6). |
| O2 | ~~Travel speed~~ | **Decided** (D37, 5.4). |
| O3 | ~~How far may the VGM go in soft land?~~ | **Decided** (D10): wherever it makes sense; known things change through story events. |
| O4 | ~~Skills and magic~~ | **Decided** (D11, section 10): six schools at the start, magic returns after the Fading. |
| O5 | ~~Death and saving~~ | **Decided** (D12): roguelike or classic. |
| O6 | ~~Combat feel~~ | **Decided** (D13): real-time, tab targeting. |
| O7 | ~~Lore of the default module~~ | **Decided as a first sketch** (D43, 12.1): the Fading, the five Wardens. Details grow with play. |
| O8 | ~~Which Norgo code is ported?~~ | **Decided** (D15): the GM is inspiration only. Skills, abilities and the worker split are candidates to port. |
| O9 | ~~Footprint rules~~ | **Decided** (section 7): hard land wins, then the older decision; settlements and roads beat vegetation. |
| O15 | Free LLMs through `freeryder` | **Parked** (Arnd, 2026-10-25): not sure it belongs in MasterWorld at all. |
| O16 | ~~Dungeons that don't feel formulaic~~ | **Decided** (D39, 8.1): eight layers, detective puzzles only, repopulation, rare surprises. |
| O17 | ~~The interface's design language~~ | **Decided** (D45, 17.1): warded brass. Each window's signature still to be mocked up. |
| O18 | ~~The title animation~~ | **Decided** (D46, 17.2). |

---

## 19. Milestones

1. **Walk the land**: the setting module contract (a first cut), skeleton, one open region, hybrid terrain (height field plus a first volume: an arch or a cave mouth), sky, water, hero-quality materials and lighting, the player walking.
2. **The town**: one medieval small town (Scale planner + medieval style) with **living townsfolk** in the world simulation (9.3): smart objects, activities with props, schedules, social groups, and the "nobody stands around" test (9.2). Interiors (tavern, smithy, temple, the player's room), town ambience sound.
3. **The first promise**: ledger, a Conversations hint marked on the player's map, the journal, one cellar dungeon built through the three stages, saving.
4. **The Director**: needs, tension curve, the first combat, items and rewards, music.
5. **The frontier**: opening regions as the player walks, story events (raids, takeovers), more dungeon kinds, more settlement sizes.
6. **Skills and magic.**
7. **Seas.**
8. Later: the LLM hook, multiplayer, crafting.

Alongside, from now on: the interface's design language (O17) and the title animation (O18), because both shape how the game feels from the first second.
