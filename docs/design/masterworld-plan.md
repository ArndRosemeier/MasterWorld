# MasterWorld: plan

Living document. Status: **draft 3.** Draft 2 added Arnd's decisions of 2026-10-24 (D9–D24): the region quadtree, the hybrid terrain and believable NPC life. Draft 3 adds the decisions from the gap analysis of 2026-10-25 (D28–D47): the player's game (sandbox, character, items, factions, the map), the default world's lore, sound, the interface and the title animation.
Status (2026-10-25, evening): milestones 1–4 are built as first cuts (the land, the town and its folk, the first promise with its cellar, the Director with combat, items and music), plus horses, character creation, sound, the title animation and the warded-brass UI. The core loop runs once so far; the frontier (milestone 5) is what makes it repeat. Sources checked (main, 2026-10-24): `ArndRosemeier/Norgo`, `Dunfinity`, `Scale`, `Actors`, `AssetGenerator`, `Conversations`, `World` (Xenoworld).

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
| D38 | ~~**Interiors are their own small scenes behind a door,** with a short fade.~~ Replaced by D48. | 2026-10-25. Section 7. |
| D39 | **Dungeons must not feel formulaic.** This is the main risk of any generator and gets real design effort of its own. | Arnd, 2026-10-25. Section 8.1, O16. |
| D40 | **Animations come from Actors' large library,** with no fixed list up front: we take what the town needs as we find it. Horses are being made in Actors. | Arnd, 2026-10-25. |
| D41 | **Settlements from farmstead to capital.** The start town is small (about 80–120 people), but bigger towns and a capital must be possible; the detail-by-distance budget makes them affordable. | Arnd, 2026-10-25. Sections 7, 9.3. |
| D42 | **Tone: warm and full of wonder, with real danger.** Humour comes from people. A comic-relief character with some slapstick is allowed, as the exception. | Arnd, 2026-10-25. Section 12.1. |
| D43 | **The default world: the Fading.** Magic drained out of the world 300 years ago and is now seeping back. Five Wardens are its gods. Creatures include truly giant versions of animals and monsters, and human giants. | 2026-10-25 (Arnd: giants). Section 12.1. |
| D44 | **Sound is generated through OpenRouter** (the `openrouter` skill), with CC0 libraries as backup. Procedural sound only where a model cannot give a good result. | Arnd, 2026-10-25. Section 16. |
| D45 | **The interface speaks "warded brass":** engraved brass instruments in dark leather with dwarven wards set into the metal, which light up as magic returns. Every window shares the language and has its own signature. Things are animated whenever they are shown and never sit quite still: playful and varied. | Arnd, 2026-10-25. Section 17.1. Mockups: [canvas](https://claude.ai/artifact/77cZmr4B2d3Y6yyieQCfU8). |
| D46 | **The title animation is a hero feature.** Captivating and playful, like Starlord's, and the world is built behind it while it plays. | Arnd, 2026-10-25. Section 17, O18. |
| D47 | **Free and open source, MIT licence.** | Arnd, 2026-10-25. |
| D48 | **Buildings open in place:** as one comes to a door, that one building is swapped for a hollow version where it stands (every storey, stairs, windows one looks out of, the hearth under the chimney), read from the same house shape as its outside; no fade; it shuts again once one walks away. | Arnd, 2026-10-26 (windows and a second storey seen outside but not inside). Section 7. |

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

**Built so far (2026-10-26): leads keep coming.** `src/vgm/leads.ts`: the world always has two open promises; when the Director's Purpose need is overdue the Builder makes a third (`LEADS`: min 2, max 3, half a game hour apart). Every few seconds the game asks `nextPromise`; a new cellar (`promiseCellar`) or a move-in goes into the decision log, the cellars (`src/app/cellars.ts`) give its house a hatch, and the townsfolk learn of it at once (`TownTalk.add`, which migrates the Conversations session to a domain with one more cellar). A cellar made safe logs a `kept` decision when the hero comes up; a save replays it all.

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

**Built (2026-10-26, B0): a floating origin** (MW #152, AG #100). The land is unbounded, and float32 is not: the start town already sits 32 km from zero. So the GPU sees the world relative to an origin near the camera (`FloatingOrigin` in `@futuremagic/stage`, `ORIGIN` in `src/render/origin.ts`). The origin moves in steps of 1280 m (ten chunks, a whole number of sun-shadow texels) once the camera is that far from it. Game code, the simulation and the game camera keep world coordinates. The scene root stands at minus the origin, and the renderer draws an origin-relative copy of the camera. Shaders read patterns at `WORLD`, and GPU-placed geometry is pinned (docs/SHADERS.md). A step changes one uniform and builds no shader. `npm run shot:origin` shows a shore 300 km out without shimmer, where `?origin=0` crumples the grass and roughens the hero.

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

**Built so far (B1, 2026-10-26): the land opens as you walk.** `src/vgm/frontier.ts`: the start's 1 km region opens first; after that, whenever a point under the hero, round them (350 m, 900 m) or ahead of them (0.5 to 2 km along their way, and a little to either side) lies in no open region, the VGM opens one there, one at a time, as a `region` decision in the log. Its fill comes from the setting (`regions` in the contract; classic: open country, a hamlet, a camp, ruins of the old realm, a barrow field), picked by weight among those whose biomes, ring round the start and spacing fit; a place takes its own square size if that is free and finds dry, gentle, open ground in it. `src/world/sites.ts` lays each place out from its decision (a hamlet's houses are the settlement package's buildings), drawn with the town's one building shader when the hero is within 1.6 km (`src/app/regionSites.ts`); the walker cannot go through them and trees keep out of their footprints. Flags: `?site=hamlet|camp|ruin|barrows` starts before the first one a walk finds, `regions=0` opens nothing. Each hamlet gets a cart track to the network as it is founded (B2's linkRoad, routed in the world worker so walking never stalls on it). Not yet: people in the places (hamlets move onto the one planner in B3).

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

**Built (2026-10-26): the standard shot set** (implementation plan A1, F1, F2). `npm run shot:set` (`tools/shot/set.mjs`, after `npm run build`, with `SHOT_GPU=1` on the reference machine) takes the same sixteen pictures every time at 1920×1080 on WebGL 2 (`SET_GL=0`: WebGPU): the title, the creator, the town at noon, dusk, night and in rain, the cows in a paddock, the smith's trade window, a cellar, a barrow, the wild, a fight, the pack, the map, the inn's room and talk. The clock stands still and the weather is set, so two runs show the same scene; dusk, night and rain are the noon town turned to that hour and weather, the creator is New game pressed on the title, the wild and the fight are the barrow's load with the hero moved to the deer and the wolves. Every shot first waits until the townsfolk close in view are dressed and the creatures warm (`game.undrawn`), then until no shader has been built for 1.5 s, so the picture and its frame time are the warm scene. Each run goes into its own folder, `shots/set/<date>-<commit>/`, with `index.md` and `index.json`: per shot the frame time (median and 95th percentile, no frame cap), the shader summary and the page's errors. The index marks a shot over 16.7 ms or more than twice as slow as the town at noon (F2), and any shader violation (F3).

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
* **Interiors (D48, in place of D38)** open where the building stands: coming to a door swaps that one building for a hollow version built from the same shape as its outside (@futuremagic/settlement houseShape: storeys, windows, door, chimney), with every storey furnished, stairs up, the sky's light coming in through its openings and a lamp inside. No fade; one building at a time, discarded once one has walked away. Open fronts (market stalls, a smithy's yard) stay outside.
* **Roads**: when a region opens, roads link its settlements to the network along the cheapest path over the land (slope, water, fords and bridges). The kind follows what they link: a path, a cart track, a paved road near towns. Roads are decisions in the log; the routing is shared code in an AssetGenerator package.
* **Built (2026-10-26, B2):** `vgm/roads.ts linkRoad` routes a new place's road to the nearest town road end or road already laid (AG `@futuremagic/settlement` `routeRoad`, `roadProfile`) and logs it as a `road` decision with its centre line and profile, so it never moves. `world/roads.ts RoadNet` levels the ground to the road (flat across, shoulders easing back over 7 m, fords still cut by the river), keeps trees 3 m and bushes 0.8 m off its edge, opens the far canopy, and leaves grass only between a cart track's ruts. The terrain shader draws it from a distance mask round the camera (`render/materials/roads.ts`, 2 km, baked in the world worker): trodden earth with a frayed edge, two ruts and a grass strip on a track. A road laid while playing (`app/roads.ts RoadWork.lay`) reaches every worker, and the land, plants, trunks and masks near it are built again. Every hamlet the regions (B1) found gets its cart track as it is logged (`?site=hamlet` starts by one); `game.layRoad(x, z)` lays one from any point. Roads laid while playing are routed in the world worker (`WorldJobs.linkRoad`): a route takes 0.3-0.45 s, too long for a frame (F2).
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

  Built (2026-10-26): a cellar kept 36 game hours ago can get a `move-in` decision (src/vgm/leads.ts: about two in five new promises, when one is due): new dwellers that fit the cellar's danger and history, the rooms, doors and dressing as they were, a hoard of their own, new hints in town (`sketchCellar(…, moved)`, `moveIn`). Chests opened before stay open.
* **Breaking expectations, rarely.** Monsters mostly fight, but now and then one surprises: a goblin who speaks broken Common and begs for mercy, a kobold who wants to trade.

**Checked, not hoped for**: a variety test generates many dungeons per kind and fails when layouts, set pieces, room shapes or dressing repeat too often, or a dungeon lacks a signature set piece, a safe spot, a shortcut out, or traces of its history. A small sample runs in `npm test`; the full sweep is a slow script.

**Order of work**: milestone 3's cellar uses layers 1, 2, 7 and 8 and one set piece; the other layers grow with each new dungeon kind.

**The second kind: barrows (2026-10-26).** Burial mounds out on the land, 550–1300 m from the market on a rise (`promiseBarrow`, src/vgm/dungeons.ts), built the way cellars are but from their own lore (`dungeons.barrow` in the setting: hill-chiefs, horse-lords, the wardens' fallen, a valley family's cairn; older flint pits and walled springs; robbers, slumps, worn seals, stolen ward-stones; the restless dead, grave-robbers, rats, spiders, a woken barrow-lord). Set pieces say which kinds they fit (`kinds`): the cellar's timber floors, ledgers and casks stay in cellars, and barrows have two of their own (the empty bier before the tomb, the robbers' hole with its tally). The mound and its stone passage stand on the land (`src/world/dungeon/barrowMesh.ts`, the town's building shader); walking into the passage goes down, and the way out is the forecourt. A household on the town's side towards it knows of it and tells it as the cellars' households do; the map marks the mound itself. The Builder makes about two in five new places barrows, one open at a time. `?barrow` starts before one.

**Caves and ruined towers (2026-10-26, implementation plan B5).** Two more kinds out on the land, each with its own lore in the setting (`dungeons.cave`: a stream's cut, a fault, old miners, a hermit, herders; painted walls, a spring, old workings, a bone pit; wolves, goblins, smugglers, highwaymen, rats, spiders, a ghoul. `dungeons.tower`: a watch tower, a lord's keep, a mage's tower, a beacon, a toll tower; undercroft, founders' vault, cistern, cells; a skeleton garrison and the rest) and its own space rules (`src/world/dungeon/kinds.ts`: how big, which way it goes, its way out, whether its rock is carved, torches or none). A cave always reaches a storey down; its rooms and ways are carved out of rock (`caveRock.ts`: the layout's space thickened into a distance field, corners rounded, walls and roofs bulging with noise, more in the caverns than in the ways, least at the foot of a wall and by doorways, meshed with surface nets into the building format), the walker reads the same field (`CaveSpace`), and there are no torches, only the lantern. Its mouth is a crag of carved rock on a hillside (`caveMouth.ts`), its floor the land's own ground, going into the hill. A tower climbs: its rooms are lifted storey by storey along the way in (`climb` in cellar.ts: the tenser and farther, the higher, the goal near the top, one storey per link at most), with at most a vault under its foot; inside ashlar and limewash with boards on the upper floors, and its way out is a door with daylight; on the land a square keep broken off at the top with fallen masonry round its foot (`towerMesh.ts`), sized to its rooms. Set pieces of their own: the sump, the light shaft, the miners' mark, the narrow crack, the pulled-up ladder (caves); the burned floor, the watch-log, the wall stair, the inner bar (towers). The VGM places caves 700–1600 m out at the foot of a slope with rise enough above to go into, towers 700–1500 m out on level ground on a rise, both out of the woods (`promisePlace`, src/vgm/dungeons.ts); about half of the new places lie on the land, one open of each kind. The crag and the cave's rock are built in the terrain workers. `?cave` and `?tower` start before one; `npm run variety` sweeps 1000 of each kind.

**Built so far (2026-10-25)**: `@futuremagic/dungeon` (AssetGenerator) holds the shape: 18 cycle patterns, `cyclicGraph`, the tension curve (`pace`) and a multi-level layout with stairs, ledges and tall halls. MasterWorld holds the meaning: the cellar lore in the setting module (`dungeons.cellar`: room uses, builders, older layers, troubles, dwellers with their hint lines), `src/world/dungeon/cellar.ts` (sketch and outline), twelve set pieces (`src/world/dungeon/setPieces.ts`: the broken floor, the bricked wall and its ledger, the false cask, the barred view of the lair, the last stand, the flooded way, the steward's key, the dug-round fall, the ward niche, the bolt-hole, the guarded hoard, the false trail; each with its own dressing, clue and room), and the VGM's `promiseCellar` (src/vgm/dungeons.ts), which puts cellars under houses of the start town, each with the set piece used least so far (`nextSetPiece`). The cycle library has 18 patterns. `npm run variety` (also in CI) sweeps 1000 cellars, barrows, caves and towers each and fails when one main pattern makes more than 20 % of them, one set piece more than 12 %, or fewer than 14 main patterns, 16 patterns in all or 10 set pieces turn up.

---

## 9. NPCs

### 9.1 Knowledge and talk

* People come from **Actors** (races, bodies, clothing, animation).
* What they know comes from **Conversations**: the VGM plants a promise as a fact in one or a few NPCs' knowledge with `world.addFacts`. Rumours can spread between NPCs over time, with attribution and errors.
* When the player learns the fact, Conversations knows it. That is the commitment signal for the promise.
* **The map is where a hint lands (D35).** When an NPC gives a task, the player hands over their map (an animation, both looking at it), and the NPC marks the place. The journal lists the open leads, each linked to its mark.
* **A new player is pointed in, in the world (Arnd, 2026-10-26).** No quest arrows: a new hero's journal opens with their own page ("ask at the inn", the inn's door marked on the map), and while the hero has nothing to follow, the Director's Purpose need sends a townsperson who has heard of a promised place over through the streets (`src/vgm/guide.ts`, `src/app/hails.ts`, `TownLife.seek`). They say so in a note, wait by the hero a while, open the talk with why they came, and their news glows. Ignored, the next one comes later each time (12 s, then 4, 8, 15 min), so a player who wants to wander is left alone; the loop check's first lead comes this way.
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

Built so far (`src/sim`): `nav.ts` walks along the streets (a graph on their centre lines, the market as a hub, around a house to its back yard); `spots.ts` turns the plan's fixtures and doors into smart objects (what is done there, by whom, for how long, how many at once); `people.ts` fills the houses (trades, stall traders, the temple keeper, hands, homemakers, children; traits shift each one's day); `townLife.ts` runs them: every agent is always on the way or doing something, turns last real seconds while the game clock only picks the part of the day (so a stopped clock still gives a busy town), rain sends people in, far agents skip their walks, and the VGM's town orders are `gather` and `stayIn`. `test/townLife.test.ts` holds the town to it: through a whole day under 5 % of the time idle. Day plans (`routines.ts`, data in the setting: `SettingModule.routines`): each role (and trades with their own hours: the baker before dawn, the innkeeper into the night, the farmer while it is light) has a working day and a rest day of parts (`sleep`, `rise`, `meal`, `work`, `chores`, `errands`, `leisure`, `home`, `inn`, `temple`, `play`, `lodge`); a person's day is shifted by how early they rise and a little each day, and its open choices (the inn tonight?) are made once a day from their seed and traits. After dark only the inn and the way home are out of doors; every seventh day the town gathers in the temple. A town without an inn or temple sends people home instead, so every town of a setting lives by the same data. `test/routines.test.ts` checks the night, the work and the rest day.

* **Budget (D41)**: at most about 30 agents in full detail near the player, about 100 at a cheap middle level, the rest off screen; the simulation gets about 2 ms of main-thread CPU per frame, and a check measures it. That is what makes bigger towns and a capital possible.
* **Saving**: the simulation is not saved in detail. It is rebuilt from the clock and the schedules; only lasting changes are saved (who died, moved items, relationships, merchants' stock).
* **Creatures** use the same core: idle, alert, fight, flee; they notice by sight and sound, stay tied to their territory, and fight in groups with roles (leader, melee, ranged). Their power comes from where they live (D29), not from the player.

  Built so far (milestone 4, rules only): `src/sim/creatures.ts` runs a dungeon's dwellers (a `Den`): they roam and busy themselves in their home room, notice the hero by sight (farther by the hero's lantern) and sound (running, fighting; less through walls and with stealth), call those of their pack who can see them, fight with a wind-up before every blow, run when hurt past their morale or when their leader falls, and go home when they lose the trail. The begging goblin (plan 8.1) kneels and pleads, and is spared when left alone. `src/sim/dungeonNav.ts` walks the dungeon's cells (doors as they stand, drops one way), `src/sim/combat.ts` decides blows for everyone. Each cellar dweller has a crowd size and a danger; a cellar's danger is fixed when it is promised (`dangerAt`, D29: about 18 near the start), and who moves in fits it. A headless fight bot (`src/game/bot.ts`) holds the balance in `npm test`: a fresh hero (power about 15) clears rat and goblin cellars most times and does not walk through spiders.

  **The wild (2026-10-26).** `src/sim/wild.ts`: the setting's groups on the land around the town (`SettingModule.wild`, classic: three herds of deer in the open, two boar under the trees, a wolf pack deeper in the woods, highwaymen by a road out), each a territory chosen from the land (woods, open ground, roads, kept apart) at a distance band that fixes its danger (D29). Each group is a `Den` on `OpenGround` (the generic `DenGround` of `src/sim/dungeonNav.ts`): the group drifts about its territory together, the land's rises hide the hero, wolves call the pack, deer graze and bolt. Groups wake within about 260 m of the hero and rest beyond 320 m. In the game (`src/app/wildLand.ts`) a group is built once the hero is within about 400 m: beasts are procedural animals (`@futuremagic/creatures`: a lean hunter, a long-legged grazer, a hide-skinned brute), highwaymen Actors people; the fight is the cellar's (`src/app/encounter.ts`, one `Encounter` per arena; the most stirred one leads the HUD). The dead, spared and searched are saved by territory. `?wild=wolves` starts beside a group; `wild=0` leaves them out.

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

* **Built (2026-10-26, A4)**: `src/game/death.ts` holds both rules. The creator's foot has the tale's lever (Classic or Roguelike, with what each means), and the save keeps the mode (save version 4). **Classic**: the hero wakes at the inn with half the purse gone; what is worn stays on, the pack stays where they fell as remains, with a lead in the journal and a mark on the map and compass (at the dungeon's door when it was below). Walking back to the spot takes it all up and closes the lead. **Roguelike**: the game writes one slot (`roguelike`) every minute, at every door and as the page closes, and nothing is saved, loaded or exported by hand. Falling ends the tale: the save is rewritten at once as the heir's (`heirSave`: the same seed, ledger, places, townsfolk and clock; no hero), everything the fallen hero had lies there as a grave, the end plaque shows (`src/app/talesEnd.ts`), and "A new hero" opens the creator in the same world, where the town's talk marks the grave on the new hero's map. `?open=tale` shows the plaque. The remains are drawn where they lie (`src/world/dungeon/remainsMesh.ts`, `src/render/remainsView.ts`): a slumped pack with a coil of rope, or a low cairn with the pack at its foot, in the town's building shader (no new shaders); `?remains=pack|grave` lays one in front of the start. With one life the Director is stricter (`FAIRNESS.strict` in `src/vgm/director.ts`): the world presses the hero only when nearly unhurt and a minute after a fight, even fights are signposted at the door, fitting places stretch to 1.2 times the hero's power instead of 1.5, and a badly hurt hero is told once per fight to get out.

### 11.2 Combat and controls (D13)

* **Real-time combat with tab targeting.** Tab cycles through hostile targets in front of the player, nearest and most threatening first. Abilities fire at the current target.
* **The cursor is visible by default.** Clicking a creature or NPC targets it; clicking an object or person interacts (talk, open, loot, pick up).
* **Right mouse button held: mouse look.** The cursor hides, the mouse turns the camera and the character; releasing brings the cursor back where it was.
* Movement with WASD, third-person camera with zoom to first person.
* This also suits the cast-time and cooldown abilities from Norgo's recipe format (section 10).
* **Built so far (rules)**: `src/game/fight.ts` is the hero's side (Tab picks hostile creatures in front, nearest and most threatening first; Strike swings until stopped; Heavy blow, Shove, Second wind and a potion on the belt, with stamina and cooldowns; facing and reach matter), `src/game/character.ts` the hero's numbers (skills by use, slower when high and hardly against the trivial; health and stamina from the skills; worn items with their bonuses; one `power` number), `src/game/items.ts` finds with rarity and bonuses rolled at a place's danger, and `src/vgm/director.ts` the Director (needs, the tension curve and its music mood, a message queue, fairness, warnings). Setting data: `skills`, `creatures`, `items`, `abilities` and `director` in the classic module. **In game (2026-10-25)**: `src/game/delve.ts` plays one cellar (its den, the fight, the bodies and chests to search, what is saved); `src/app/cellarFight.ts` runs it while the hero is below (Tab or a click picks, 1 to 5 the belt, G searches; better finds are taken up at once; falling wakes you at the inn with half your purse gone; coming up from a quiet cellar marks the lead done and the household pays). `src/app/fightHud.ts` is the HUD in warded brass (health and stamina vials, the belt with cooldown wards, the target plate with its threat ward, item cards by rarity). `src/render/dungeon/CreatureView.ts` draws the dwellers: rats and spiders are procedural animals from `@futuremagic/creatures` (AssetGenerator, from Dunfinity), the others Actors people (`src/render/dungeon/foes.ts`: race, rags, clips) holding the setting's weapons (`src/render/hero/arms.ts`), the skeleton Actors' bones. Saves are version 2 (hero sheet, Director, who fell, what was taken).
* **Death in classic mode**: you wake at the nearest temple or inn and lose some coin; carried gear stays where you fell, so going back for it is a small quest. Loading a save is always allowed.

### 11.3 The core loop (D28)

* **Ten minutes**: walk, notice something (a view, a camp, a person), deal with it (talk, fight, sneak, loot), move on.
* **An evening**: get a lead in town (a mark on the map), travel, clear the place, come back, sell and upgrade, get new leads.
* **Why come back tomorrow**: open marks on the map, a town that changed because of you, the frontier you haven't seen, and the long-term goals.
* **Long-term goals, many and none final**: the mystery of the Fading and what wakes with the magic, standing with each people, mastering skills, legendary items, the giants in the far mountains, a house of your own. The VGM ties some promises to them; the player follows whichever they like, and none of them ends the game.
* **Built (2026-10-26, A6, the loop check)**: `npm run loop` (`tools/loop/evening.ts`, a slow check in CI beside `npm test`) plays whole evenings headless with the game's own pieces (`src/game/evening.ts`): the land, the town and its folk, the VGM's leads, the town's talk, the market, upkeep and the classic fall. The hero asks the innkeeper for news (and "tell me more"), hears an open promise, walks there on the walker (A* over 1 m cells, round walls and fences, not up slopes too steep to climb), goes down and lets the fight bot (`src/game/bot.ts`) clear it, search every body and chest and climb back to the ladder, keeps the promise, walks back, sells to the smith, the market and the inn, has the smith mend, buys the best upgrade it can afford, takes a room and hears the next lead in the morning. Six evenings each in three worlds (`masterworld`, `alpha`, `x4`: cellars, barrows up to 1.2 km out, new dwellers), and one reckless evening where the hero goes down badly hurt without potions, falls, wakes in the temple, goes back and takes up the pack it left. About 20 s in all; every step is printed with the game clock, so a failure says where the evening broke. The first runs found and fixed: a cellar whose entrance had a door in every cell got no ladder up (the variety sweep now checks for it), the bot struck from a hair outside its blade's reach and stood there being hit, and a goblin begging from across the room was never heard out, so the cellar never counted as beaten (the bot now walks over to hear it). Two findings went to the implementation plan's open list: coin piles up, and a paddock fence across a street in one seed.

### 11.4 Character and growth (D29, D30)

* **Creation**: the shared Actors character creator with a filter parameter for this setting (races, looks, clothing; generous, but leaving out what clearly does not fit), and a background (farmhand, smith's apprentice, acolyte, poacher, scribe …) that sets starting skills and kit and gives one or two people in town who already know you.
  **Built (2026-10-25)**: Actors 0.13 tags its garments, hairstyles and races with themes (`modern`, `vintage`, `future`, `antique`, `medieval`, `nordic`, `eastern`, `fantasy`, and the flag `real-faith` for real-world religious symbols), and a game passes the themes it allows (`Character.load({ themes })`). The setting says what a hero may look like (`hero` in the module: the classic world allows medieval, Norse, antique and fantasy pieces, leaves out real-world faith symbols, and offers its four peoples). After New game the dive lands on the market square, the camera comes round to the hero's front and the creator opens beside them (`src/app/creatorUi.ts`: Actors' editor in a brass glass, tabs People, Body, Face & hair, Clothes, a name, Roll the dice, Begin; drag turns the hero, the wheel looks closer; the title's peoples card picks the people). The hero is drawn as that Actors character (`src/render/hero/HeroView.ts`: Actors' clips per gait and blow, its riding pose in the saddle, held weapons on the hands), and saves keep the name and look (version 3). `?create` opens the creator without the title. The background is the creator's Past tab (`backgrounds` in the setting module; classic: caravan guard, farmhand, smith's apprentice, poacher, temple acolyte, scribe): skill points over the starts, the kit of that life and one or two townsfolk, found by trade, who greet the hero by name (`game/background.ts`, `TownTalk.acquaint`). Actors 0.14 cross-fades clips, so the hero blends between gaits (0.25 s) and into blows (0.1 s).
* **Growth**: skills rise by use up to 100, more slowly the higher they are; trainers speed them up. Health, stamina and mana grow with the skills that use them. The VGM reads a "power" number (weighted skills plus gear) wherever it needs a level.
* **Reasons to grow**: the world has places you cannot take on yet, and the game tells you so. Coming back later and winning is the reward.

### 11.5 Items and money (D31)

* **Rarity**: common, uncommon, rare, legendary, with WoW-style item cards (name in rarity colour, stats, bonuses, a line of lore). Legendary items are named and have a history in the canon.
* **Bonuses**: items can raise one or more skills; a few rare abilities exist only on items.
* **Slots**: head, body, hands, feet, cloak, main hand, off hand, two rings, amulet, plus four quick slots on the belt. The inventory is a sorted list limited by weight. Durability is light: gear wears, the smith repairs.
* **Money**: copper, silver, gold. It buys gear, training, food and a room at the inn, repairs, later a house. Merchants have limited stock and coin; prices follow what the town has.
* **Crafting**: not in 1.0 (D32).

**Built (2026-10-26, upkeep, plan step A3)**: `src/game/upkeep.ts` holds the rules. Gear wears as it is used: the main hand with each blow (a miss a third as much), each piece of armour with each blow taken, the shield with each blow it stops; rarer things wear more slowly (a common blade lasts about 240 landed blows, a few cellars). A worn item keeps less of its strength, down to half when broken (damage, armour, block, and so the hero's power), and its card says how sound it is. The game says when a piece turns worn, battered or broken. The smith mends (talk topic "Can you mend my gear?", `src/app/repairUi.ts`: the smith's bench in warded brass, a temper bar per piece, mended pieces flare white-hot with sparks) for `upkeep.repair` (0.35) of the worth as new times the wear, most worn first, as far as the purse goes. The innkeeper lets a room for the night with supper (`upkeep.room`, 16 copper since A2b): the night passes (`src/app/sleep.ts`), the hero wakes at 7 rested in the inn, and that inn is where they wake after a fall (`Character.lodging`, saved with the hero); without a room a fallen hero wakes in the temple. Setting data: `upkeep` in the module (prices, the rising hour, the lines). Both topics are TownTalk services (shared with trade). Look flags: `talk=smith&topics=repair` opens the bench, `wear=0.7` starts with worn gear.

**Built (2026-10-26, trade, plan step A2)**: `src/game/trade.ts` holds the rules: a `Market` of the town's merchants, one per keeper of a shop in the setting (`shops`: the smith, the inn's keeper and the first two market stalls as the general store), each with seeded, limited stock and a purse. A thing's worth as new (`itemWorth`) is its kind's value by rarity (uncommon 2.5×, rare 6×, legendary 20×) plus what it adds; across the counter it counts less its wear. Prices follow what the town has: a thing some shop here makes costs 0.9× (brought in 1.13×), and every one of it already on the town's shelves takes 5 % off, down to 0.8× (so the fifth wolf pelt fetches less than the first). A merchant asks `asks` (1.2–1.3×) and pays `pays` (0.38–0.45×) of that, only for the kinds they deal in and only as far as their purse goes; the hero's speech narrows the gap by up to a fifth and is trained by each bargain. What the hero sells stays on the shelf to be bought back; each day a merchant's purse comes back halfway to full, missing goods are made again with an even chance, and old second-hand things are sold on. The smith's work rolls rarity as finds at danger 7, so the rack can hold a keen blade. Talk topic per shop ("Show me your iron.", a TownTalk service) opens the trade window (`src/app/tradeUi.ts`, warded brass): it swings in like a shop sign; their wares and your pack as rarity cards with swinging brass price tags in gold, silver and copper pips; between them a brass balance whose beam dips towards the pan that was paid into while a coin drops in, and shudders at a refusal; the best upgrade the hero can afford is marked "for you". The market is saved with the game (`SaveData.market`; older saves get fresh shelves). Look flag: `trade=smith|innkeeper|trader`. The done-check is `test/trade.test.ts` (a seeded hero sells a lair's finds and buys an upgrade that raises their power).

**Built (2026-10-26, something to spend on, plan step A2b)**: a price ladder above the plain goods. Each forge and stall keeps fine work (`ShopDef.fine`, made with `itemAs` in `src/game/items.ts`): the smith three uncommon pieces and one rare piece of the dearest thing it makes (a rare mail shirt, about 25 silver), the market stalls two uncommon and one rare (a rare leather jerkin, about 6 silver); the rarity is the shop's, never the hero's (D29). Shops restock on their own day every few days (`ShopDef.restock`: 3, the inn 2), seeded per shop and day: the plain goods filled up, sold fine work made anew; the purse comes back halfway each day. Lessons (`src/game/lessons.ts`, setting `trainers`, plan 11.4): the smith teaches blades, axes, maces, shields and armour; the carter, a caravan guard before the roads closed, spears, dodging, fists and orientation; the innkeeper speech and perception. A lesson is one point and an hour or two, and costs `price × (1 + skill/10)²` (the smith: 1 silver at 12, 3 silver at 25), up to what the teacher knows (`upTo` 30–35); talk topic per teacher opens `src/app/lessonsUi.ts` (warded brass: set down like a slate, a brass rule per skill with a ward line to the hero's level and a notch at the teacher's limit; a lesson's number turns over and its line runs up). The room comes with supper. The loop check (`npm run loop`) now spends what is left above a night's room on lessons and fails if two evenings pass with nothing bought or learned, or if more than 4 silver piles up by the end.

### 11.6 Peoples and reputation (D34)

* Each people (race) is a faction with a reputation number the simulation reads: greetings, prices, who will talk to you, whether the guards let you in.
* Peoples have their own areas. Walking into the orc town as a human is dangerous until you have earned the orcs' trust (a deed, a gift, a quest for them).
* Other factions (the Temple, guilds, the watch, a thieves' ring) come later.
* Companions, if any, are animals, elementals or summoned things (D33).

### 11.7 The map and orientation (D35)

* The player carries a map that fills in with what they have seen, drawn like a hand-made map.
* NPCs mark places on it when they give a task (9.1).
* The **orientation skill** sets how exactly the map shows where you are: a vague area at first, a sharp arrow at mastery. It rises by travelling and reading the map.

**Built so far (2026-10-25)**: `src/game/orientation.ts` turns the skill into where the map shows the hero: a novice (10) sees a wash of blue ink about 90 m across with "you?" and no arrow; the area shrinks, an arrow for the facing appears from about 31 and steadies, and from 80 the arrow is exact. The guess drifts with seeded noise over the land (the hero is always inside it, and it holds still where they stand). Every 150 m travelled practises the skill (harder farther from town), and so does reading the map for 4 s, once per 90 s. When someone tells of a place, the talk says "You hold out your map" and a card of the real map rises to them, the mark is drawn in with a quill, and the card goes back (`src/app/handOver.ts`); the map then shows the mark as already inked.

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

**Built (2026-10-26): music streams (F4, plan step A5).** Music is 34 of the 42 MB in `public/sound`, and none of it is in the start download: `@futuremagic/audio` plays a piece through a media element (fetched and buffered as it plays, never decoded whole), and only when it first plays. The title's theme starts with the first press at the gate; the game is silent, and asks for no music, beds or steps, until the world is playable (`titleHolds` in `src/main.ts` waits for `__mwReady`), and its music begins 8 s after the title lets go. `node tools/shot/load.mjs` (a slow check, after `npm run build`) presses the gate like a player, reports the title time, the playable time and the start download by folder, and fails when game music is part of it or the F4 marks (1 s, 20 s) are missed.

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
| Character creation | The tailor's glass: two leaves of a folding screen swing open, the ward traces the glass's rim and the tabs drop in one by one; the camera comes round to the hero's front. At rest a spark runs the rim and the turntable's gear ticks. |
| Notifications | A small brass capsule that pops out of the frame edge, rings once and slides back. |
| Settings and menus | A cartographer's tool roll that unrolls; switches are brass toggles that click. |
| Death and waking | The wards go dark one by one; on waking they relight from the centre. |
| Title screen | Part of the title animation (O18): the logo's plates swing shut, brass pours into the letters, the ward traces them and a gear locks; the menu panel slides in with its rim ward; the peoples card flips; the town crier's bell swings. |


### 17.2 The title animation (D46)

StarLord's title is the bar: the game's own world, alive, playful, new every start, with toys and a jump into the game. MasterWorld's version ([full write-up](https://claude.ai/artifact/59Spcz1y7gNNX99LLriQwr)):

1. **Opening** (about 8 s to the menu): dark and wind; one ward line runs over the land like a fuse, and dawn breaks along it.
2. **Fly-over**: the camera rises over the real start region (river, town, sea, mountains). Weather, season, hour and route are drawn from a seed each start.
3. **The logo** forges itself in warded brass (17.1): plates swing in, wards trace the letters, a gear clicks, a glint runs across. Music swells (generated through OpenRouter, D44).
4. **The menu** is a brass instrument panel; around it a town-crier ticker of silly tavern rumours and a card per playable people (a live Actors model doing something in character).
5. **Toys**: the world can be clicked. Birds scatter, the sky gives lightning or a shooting star, a cloud rains, the town bell rings, rarely a sea serpent breaches; a secret code brings a dragon or a giant.
6. **The dive**: New game or Continue drops the camera through the clouds to the hero on the market square; the game starts where it lands.

**First version** (`src/app/title/`): the opening, the seeded fly-over around the market, the forged logo, the brass menu, the crier and the peoples card (an engraved emblem for now; the live Actors model comes later), the toys (birds, lightning or a shooting star, the bell, splashes and a rare whale, the dragon on the code, drawn as 2D silhouettes over the 3D view until there are models) and the dive. Continue waits for saving.

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
| O18 | ~~The title animation~~ | **Decided** (D46, 17.2). First version in `src/app/title/`. |

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

The order of the work, its steps and their done-checks are in [implementation-plan.md](implementation-plan.md). Milestones 3–4 are finished there as phase A (trading, upkeep, death and roguelike mode, the loop check), 5 is phase B, 6 is phase C and 7 is phase D.

Alongside, from now on: the interface's design language (O17) and the title animation (O18), because both shape how the game feels from the first second.
