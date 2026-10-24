# MasterWorld: plan

Living document. Status: **draft 1, open for discussion, no code yet.**
Sources checked (main, 2026-10-24): `ArndRosemeier/Norgo`, `Dunfinity`, `Scale`, `Actors`, `AssetGenerator`, `Conversations`, `World` (Xenoworld). The `MasterWorld` repo was empty.

---

## 1. The pitch

A classic fantasy roleplaying game in the browser (TypeScript, three.js, 3D), single player. Its new idea is a **virtual game master (VGM)** that does what a good tabletop GM does: it watches the player, keeps the game feeling good, and **builds the world as play needs it**.

An NPC hints at a dungeon, so the VGM builds that dungeon. The player walks toward the edge of the known land, so the VGM extends the land before they get there. The world starts small, around one small town, and grows out of play.

The world should be believable but fantastic: classic countryside, forests and mountains, towns and cities, cellars and classic dungeons, and later seas and oceans.

---

## 2. Decisions so far

| # | Decision | Notes |
|---|---|---|
| D1 | **The VGM is procedural.** No language model is needed to play. | An LLM hook comes later (Norgo's Oracle already had one). Out of the box the game must cost nothing to run. |
| D2 | **Single player.** Multiplayer is a later milestone. | Keep the door open: see section 12. |
| D3 | **TypeScript, three.js, 3D**, like the other projects. | |
| D4 | **The VGM's job is to make the game feel good for the player.** Difficulty and similar options are settings the VGM honours, not separate systems. | |
| D5 | **Classic, bounded dungeons.** Nothing endless. | Dunfinity's endless levels are not the model, but its styles, materials and creatures are reusable. |
| D6 | **Believable but fantastic overworld**: classic countryside, towns and cities on demand. **One small town at the start.** | |
| D7 | **Think big.** Seas and oceans come later and must fit without a rewrite. | The world skeleton has coasts and seas from day one (section 5). |
| D8 | **Skills and magic: start from Norgo's system**, to be discussed. | Section 10. |

---

## 3. What we take from the earlier projects

| Repo | What it has | Use in MasterWorld |
|---|---|---|
| **Norgo** | Fantasy open world; **a VGM** (`src/gm`: Director, PlayerModel, Narrator, QuestForge, QuestBook, Scout, Oracle); use-based skills with 10 magic schools; data-driven ability recipes; server in a Web Worker behind a message protocol. | The VGM's *director* half is largely designed there. Skills, abilities and magic. The server/worker split for the multiplayer door. Outdated as a whole, so we port ideas and code selectively. |
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

This is Norgo's VGM, and most of its design carries over:

* **PlayerModel**: infers a playstyle (explorer, fighter, socializer, crafter, mage, sneak) from decayed evidence, plus a factual history.
* **Director**: a tension curve (calm → build-up → peak → relief) with fairness rules (no spawns while hurt, talking or just respawned; attackers appear in front of the player, never on top of them).
* **Narrator, QuestForge, QuestBook**: narration, GM-authored quests, the journal.

What changes: Norgo's Director could only *find* things in a world that already existed (its Scout searched for unexplored features). MasterWorld's Director can *order* things from the Builder.

The Director also keeps a small set of **needs**, each a score that rises over time and falls when it is met:

| Need | Rises with | Met by |
|---|---|---|
| Discovery | time since the last new place | a new site, a view, a secret |
| Challenge | time since the last real fight, scaled by playstyle | a lair, an ambush, a boss |
| Reward | time since the last notable item | treasure, a merchant, a gift |
| People | time since the last new face | a traveller, a village |
| Purpose | no active goal | a hint, a quest |

Each tick the Director looks at the most overdue need and picks the cheapest action that meets it, within the difficulty settings. That is the whole "feels good" loop. It stays explainable and tunable.

### 4.2 Builder: building what is needed

The Builder turns the Director's orders into world. Its central idea is the **promise**.

> A promise is something the world has said exists but has not built yet.

When the Director wants to give the player a goal, it writes a promise into the **ledger**: *"a mine taken by goblins, two hours' walk north-east, in the hills; the dwarves sealed the lower galleries"*. It then gives that knowledge to an NPC (section 9). Nothing is built yet.

A promise moves through stages, and each stage costs more than the one before:

| Stage | Trigger | What exists |
|---|---|---|
| **Sketch** | the promise is made | kind, purpose, rough place, theme, a secret or two, a difficulty band |
| **Outline** | the player commits: learns the hint, asks the way, takes the quest, or heads that way | exact site on the land, entrance, layout graph, inhabitants, treasure |
| **Built** | the player gets close (about one region away) | geometry, props, creatures, ready to stream |

Because the VGM made the hint, it always knows what the hint means. It never has to understand the player's words.

**The edge of the world is just another promise.** Land that the player can see but has not been detailed is a promise of land. Same stages, same budget.

### 4.3 Signals the VGM watches

* Position, heading and speed: which promises and which frontier lie ahead, and how soon the player will arrive.
* Knowledge: which hints the player has heard (from Conversations), which quests they have taken, what is on their map.
* State: health, level, gear, playstyle, how long since each need was met.
* Settings: difficulty, density, pacing.

### 4.4 Budget and latency

* Generation runs in workers. The VGM has a fixed per-second build budget.
* **Build ahead, hide the wait.** Travel time covers it: outline on commitment, build when about one region away. A walking player gives minutes of warning, so the budget is generous.
* Fast travel (horse, ship, teleport) must not outrun the builder. A journey is a promise too: the VGM knows the destination when it starts.

### 4.5 Consistency

* Every generated fact goes into the **canon** (the ledger plus the facts derived from it). New content must agree with it.
* Promises carry **constraints** ("in the hills", "within two hours", "near water", "dwarven"). The Builder must place the content inside them or report failure. Then the Director makes a different promise, and the NPC never told a lie.
* **Seen is frozen.** Anything the player has seen or been told in detail can no longer change.

---

## 5. The world model

### 5.1 The world is the seed plus the decision log

All generators stay pure functions, as in Dunfinity and Scale: `(seed, parameters) → content`. The VGM adds only small **decisions**:

* "a goblin-held mine of style X, at this site, with these parameters"
* "a hamlet here, size S, race mix M"
* "the blacksmith in Eastmere knows about the mine"

Rebuilding the world means replaying the decision log through the generators. Saves stay small (the log plus per-site diffs for what the player changed), everything is reproducible, and the log is exactly what multiplayer would later have to share.

### 5.2 A fixed coarse skeleton, detail on demand

A believable world needs global structure: rivers run downhill to a coast, mountains form ranges, climate follows latitude and rain shadow. That is hard if land is invented piece by piece. So:

* **Skeleton**: low-frequency fields (continents, seas, mountain ranges, climate, biomes) as global functions of world position. They are cheap, unbounded, and consistent everywhere.
* **Regions** (about 8–16 km square, to be tuned): the unit the VGM opens. Opening a region solves its drainage and rivers on a coarse grid (with inflows from already-opened neighbours as boundary conditions), places roads, and fixes the sites the ledger puts there.
* **Detail**: terrain mesh, vegetation, buildings, only near the player and streamed with LOD.

The skeleton is unbounded and fixed. The VGM decides **what stands on it** and **when it is detailed**. "The world starts small" means few regions are open and few promises are made, not that the land is missing.

### 5.3 Soft and hard land

* **Hard**: anything the player has seen or been told about in detail. It is frozen.
* **Soft**: everything else. Even inside an open region, unseen land stays soft, so the VGM can still put a ruin behind the next hill when a need calls for it.

### 5.4 Scale targets (proposal)

* Walking pace around 5 km/h in-game, so one region takes about two hours to cross on foot.
* View distance several km, with the far horizon drawn from the skeleton alone.
* The skeleton is big enough for several continents and oceans between them.

---

## 6. The start

* One small town, ideally at a river crossing (that is where real towns grow), in a temperate region.
* The town's region is open, its neighbours are sketched.
* Three or four promises are already planted in townsfolk: a cellar with a problem, a nearby ruin, a road with trouble, something farther away.
* The rest of the world exists only as skeleton and horizon.

---

## 7. Settlements

* Sizes: farmstead, hamlet, village, town, city. The VGM makes them on demand (People need, a quest, a road needing a waypoint).
* **Growth**: a settlement can be upgraded by a later decision (a hamlet becomes a village after the player cleared the bandits). Growth adds to the plan and never moves what the player has already seen.
* Scale's planning layers (macro plan → cells → lots → buildings) look reusable. Its look is modern, so MasterWorld needs a **medieval style family**: walls and gates, market square, church or temple, organic streets, timber-framed and stone houses, mills, docks, castles.
* Race shapes architecture: a dwarven hold, an elven village and a human town should differ in plan as well as look.
* Every building with an interior is a possible cellar or dungeon entrance.

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

* Dungeons are **their own spaces**, entered through doors, stairs or cave mouths. This keeps them bounded, lets the overworld stay a cheaper height field (open question O1), and gives clear loading points.
* From Dunfinity: styles, rock and brick materials, lighting, creatures. From AssetGenerator: props and dressing.
* Once outlined, a dungeon is fixed. The player's changes are stored as diffs.

---

## 9. NPCs and knowledge

* People come from **Actors** (races, bodies, clothing, animation).
* What they know comes from **Conversations**: the VGM plants a promise as a fact in one or a few NPCs' knowledge with `world.addFacts`. Rumours can spread between NPCs over time, with attribution and errors.
* When the player learns the fact, Conversations knows it. That is the commitment signal for the promise.
* Conversations' own review says open free-text conversation is still weak. **Topic-based dialogue** (pick a subject, ask about it) fits the hint channel well and avoids the problem. Free text can come later with the LLM hook.

---

## 10. Skills and magic (to discuss)

Norgo's system, as it stands:

* **Use-based skills**, 40 in total and capped at 100, in six groups: combat (blades, axes, archery, shields, armour, acrobatics …), magic, utility (climbing, stealth, lockpicking, mining …), survival, craft, social.
* **Ten magic schools**: pyromancy, cryomancy, geomancy, gravitas, vitae, luminism, umbramancy, kinesis, animism, runecraft.
* Skill thresholds unlock **abilities**. Abilities are data-driven recipes (`ops`: projectile, area, zone, terrain edit, effect …) with mana, stamina or HP cost, cooldown and cast time.
* Race bonuses and an innate magic school per character.

Questions for the discussion:

* **Use-based only, or a mix?** Use-based fits a sandbox, but a classic RPG often has milestones too (a trainer, a guild, a found tome). The VGM could hand those out as rewards.
* **Which schools fit this world?** Gravitas was tied to Norgo's variable gravity. Geomancy's digging and walls need terrain that can be edited (O1).
* **Where does magic come from in the lore?** That shapes which NPCs teach it and what the VGM may hint.
* **Keep the recipe format.** It is the part most worth porting as is.

---

## 11. Seas and oceans (later, prepared now)

* Coasts and seas are part of the skeleton from day one, so the first town can already lie by a lake or estuary.
* Rendering and water from Xenoworld: Gerstner-wave seas, shore foam, rivers, waterfalls.
* Later: boats and ships, harbour towns, sea travel as a journey promise, and **islands across the sea as promises** ("sailors talk of an island beyond the fog"). The ocean is the VGM's largest frontier.

---

## 12. The multiplayer door

* Server logic in a worker behind a message protocol, as Norgo did. The VGM and the ledger live on the server side.
* The decision log is the shared truth. Clients only need the seed and the log to rebuild the world.
* What we defer: a VGM serving several players with different needs at once.

---

## 13. The LLM hook

Out of the box nothing calls a model. The hook is a narrow interface the procedural parts already use:

* `describe(promise) → text` for richer hint and lore wording,
* `answer(question, knowledge) → text` for free-text talk (Norgo's Oracle),
* `propose(need, canon) → promise` for more inventive promises, always validated by the Builder's constraints.

An LLM can only *suggest*. The procedural layer stays the authority, so the game never breaks or contradicts itself because of a model.

---

## 14. Open questions

| # | Question | Notes |
|---|---|---|
| O1 | **Height field or voxel terrain for the overworld?** | Height field: cheaper, longer views, ocean-friendly; caves and dungeons as their own spaces. Voxel (Norgo, Xenoworld): overhangs, digging, geomancy, at a much higher cost. Proposal: height field plus local edit layers. |
| O2 | Region size and travel speed | Drives build-ahead time. |
| O3 | How far may the VGM go in soft land? | Example: may it add a whole village behind a hill the player has not seen yet? |
| O4 | Skills and magic | Section 10. |
| O5 | Death and saving | Classic save/load, or something tougher? |
| O6 | Combat feel | Real-time action like Norgo and Dunfinity? |
| O7 | Lore | A setting, its history and its races shape everything the VGM hints. |
| O8 | Which Norgo code is ported, which only re-read? | The GM modules are the first candidate. |

---

## 15. Milestones (proposal)

1. **Walk the land**: skeleton, one open region, height field terrain, sky, water, the player walking.
2. **The town**: one medieval small town (Scale planner + medieval style), Actors townsfolk.
3. **The first promise**: ledger, Conversations hint, one cellar dungeon built through the three stages.
4. **The Director**: needs, tension curve, the first combat and rewards.
5. **The frontier**: opening regions as the player walks, more dungeon kinds, more settlement sizes.
6. **Skills and magic.**
7. **Seas.**
8. Later: the LLM hook, multiplayer.
