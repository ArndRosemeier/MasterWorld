# The VGM: what it can do

Living document. It lists every tool the virtual game master (VGM) has today, what each one makes and when, and the rule for adding new ones. The ideas behind it are in the [plan](masterworld-plan.md), sections 4 (Director and Builder), 5.1 (the decision log), 8.1 (against formula) and 9.3 (the world simulation). This document says what is **built** and where it lives. Keep it true: a PR that adds or changes a VGM tool updates this file (CLAUDE.md rule 10).

## 1. What the VGM is

The VGM has two halves that share one view of the player (plan 4):

* **The Director** decides *what the player needs now*. It reads signals (section 5), keeps five needs (discovery, challenge, reward, people, purpose), a tension curve and a message queue, and it is fair: it warns before danger and never scales the world to the player (D29).
* **The Builder** decides *what the world gets*. Everything it makes is a **decision** in the log (`src/world/decisions.ts`): plain data, saved and replayed, so the world is the seed plus the log (plan 5.1).

It steers the people and creatures of the world simulation only through orders and decisions, never by moving them directly (D27).

**Invisible, and showing rather than telling.** In play the VGM never shows its hand (D53). The game settings show it and its pacing, and the debug menu keeps a log of each move and why (plan step C8). What it makes, the hero should mostly come upon and see: situations that arise naturally, not quests handed out (D52, step C10). A speech bubble is for the rare urgent line, such as a cry for help.

What the VGM should become, and where it falls short today: [The VGM we want](https://claude.ai/artifact/Y9YgAzHphg24tFXZQ3m9Hx).

**One toolbox (D51).** Everything the VGM can make lives in `src/vgm` (pure: no three.js, so it runs in workers, tests and the loop bot). Each kind of thing is a **tool** with the same shape (section 6). The game (`src/app`, `src/main.ts`) only *applies* what a tool decided: it builds, draws and tells it. It never decides on its own what the world gets.

## 2. The tools today

| Tool | What it makes | When | Writes | How the player hears of it | How it ends | Code |
|---|---|---|---|---|---|---|
| **Open the world** | The start town, the arch, the peoples' holds, the teachers' towers, the first roads | A new game | `town`, `volume`, `hold`, `retreat`, `road` | The start; holds and towers are on the map | Never | `vgm/builder.ts` `openWorld`, `firstDecisions` |
| **Open a region** | An aligned square ahead of the hero, filled from the setting: plain country, a hamlet, a village, a camp, ruins, a barrow field | A point ahead of or around the hero lies in no open region (`FRONTIER`) | `region` (a hamlet or village is a town of its size) | A line in the log, the map | Never | `vgm/frontier.ts` `nextRegion` |
| **Lay a road** | A path, track or road to a new place, routed once and kept | A place opens (a region's settlement, a promised site) | `road` | Seen on the land and the map | Never | `vgm/roads.ts` `linkRoad` |
| **Promise a place** | A dungeon: a cellar under a house, or a barrow, cave or ruined tower out on the land; its danger fixed by distance (`dangerAt`) | Fewer than `LEADS.min` promises open, or Purpose overdue (up to `LEADS.max`), at least `LEADS.gap` hours apart | `dungeon` | The household knows (`hints.ts` `cellarHint`, `TownTalk.add`); asked, they mark the map (D35); the guide sends someone over | `kept` when it is cleared and the household told | `vgm/leads.ts` `nextPromise`; `vgm/dungeons.ts` `promiseCellar`, `promisePlace` |
| **Move in** | New dwellers in a cleared dungeon (repopulation, plan 8.1) | A kept dungeon stood empty `LEADS.settle` hours | `move-in` | As a promise | `kept` | `vgm/leads.ts` `moveInto` |
| **Story event: spill** | The dwellers of a place left alone come out and roam the land near it | A promise open longer than the event's `after`, one per town per `cooldown`, never while the hero is inside | `event` (+ a town `order`) | News line, journal lead with a map mark, the town gathers at the market | `kept` when the band is dead | `vgm/events.ts` `nextEvent`, `eventTold`, `gatherFor` |
| **Steer a town** | Everyone awake gathers somewhere, or stays indoors | Asked by another tool (an event's gathering) | `order` | Seen in town | Its time runs out | `vgm/orders.ts` `townOrder` |
| **Guide** | Someone who has heard of a promise walks over and hails the hero | The hero has nothing to follow for a while | nothing (not logged) | The hail | When talked to | `vgm/guide.ts` `Guide`, `hailer` |
| **Director** | Needs, tension phase, music mood, paced messages, danger warnings, which known place fits the hero's power | Every frame | nothing (saved in the game's save) | Messages, warnings, music | Never | `vgm/director.ts` `Director`, `warning`, `fittingPlace` |

**Not yet a VGM tool, but it should be (section 7):**

| What | Today | Code |
|---|---|---|
| Wild groups round a town (deer, boar, wolves, highwaymen) | Placed from the seed when a town loads; not in the log, so the VGM can't add, move or remove one | `sim/wild.ts` `placeWild`, setting `wild` |
| Who lives in a dungeon | Chosen from the setting's dwellers when the dungeon is sketched (section 4) | `world/dungeon/cellar.ts`, setting `dungeons.*.dwellers` |
| Guild tasks | Handed out by guild masters, kept from the log | `game/guilds.ts` `GuildBook` |

## 3. Encounters

An **encounter** is who the hero meets, where and why: a group of creatures or people (from the setting's `creatures`), with a danger, a place on the land or in a dungeon, a temper, and a reason (a den, a band out of a place, highwaymen on a road). Today encounters come from three separate places, and each has its own rules:

1. **Dwellers in a dungeon**: the setting's `DwellerDef`s, chosen to fit the place's danger.
2. **Wild groups**: the setting's `WildDef`s, with a habitat, a ring round the town and a group size.
3. **Event bands**: an `EventDecision`'s `members`.

**The target (plan step C6b): one encounter tool in `src/vgm/encounters.ts`.**

* **One definition.** An encounter is data in the setting (an `EncounterDef`: who, how many, habitat or room, temper, danger range, the words used to tell of it). Dwellers, wild groups and event bands are all encounters.
* **One generator.** `encounterFor(need, where, danger, seed)` picks and fills an encounter from the setting. It fits the danger the place already has (D29), keeps away from what the hero has just met (against formula, plan 8.1), and returns plain data that goes into the log.
* **Every use goes through it:** a dungeon's dwellers, a wild group, an event's band, a road ambush, a guild task's quarry, and later the LLM hook's `propose` (plan 15). The hook proposes; the generator checks and fills.
* **A design tool.** A headless check (`npm run variety` style) samples encounters per need, place and danger band, and fails on repeats or misfits. So someone designing new encounters writes data and sees what the VGM would make from it.

## 4. Dungeons

**What is built.** The VGM already builds every dungeon on the fly. It writes one small `dungeon` decision: kind, seed, signature set piece, the town and household, and a site out on the land. From that, the game builds the whole place on the spot, the same way every time:

1. **Purpose and history.** The decision is drawn into a history from the kind's lore in the setting (`dungeons.<kind>`: builders, older layers, troubles, dwellers, room uses). `world/dungeon/cellar.ts` `sketchCellar`.
2. **Graph.** The history becomes a graph of rooms and links from 18 cycle patterns (AG `@futuremagic/dungeon` `cyclicGraph`, `pace`).
3. **Space.** The graph is laid out in 3D under the kind's space rules (`world/dungeon/kinds.ts` `KindShape`: size, rooms, depth, rise, way out, carved or built, torches). `outlineCellar`.
4. **Set piece and dressing.** `world/dungeon/setPieces.ts`, with 23 pieces, each listing the kinds it fits.
5. **Meshes.** Built walls (`cellarMesh.ts`) or carved rock (`caveRock.ts`), and the outside shell on the land (`barrowMesh.ts`, `caveMouth.ts`, `towerMesh.ts`).
6. **Dwellers and hoard.** `treasure.ts`. The hints in town come from the same history (`vgm/hints.ts`).

`npm run variety` sweeps 1000 places of each kind. So the machinery is general; only its names (`Cellar…`) still say "cellar".

**What is not abstract yet:**

* **The kinds are a closed list.** `DungeonTemplate` is `'cellar' | 'barrow' | 'cave' | 'tower'`. A new kind touches about eight places: the type, the setting's `dungeons` record, `KIND_SHAPES`, `LAND_KINDS`, its own outside mesh, and `if (template === 'cave')` branches in `app/cellars.ts`, the soundscape and the sound director. The plan's other kinds (plan 8: mine, crypt, keep or temple, bandit hideout, sewer) are not there.
* **The VGM can't ask for a purpose.** It picks a kind, and the lore rolls the rest. It can't say "a hideout for the band that took the waystation" or "the den these wolves came from". So a story event or an encounter can't make the place it needs.
* **Every dungeon hangs on a town house.** `DungeonDecision` needs a `town` and a `building`. A place far out in an opened region, or one that belongs to no household, can't be made.
* **Change is only move-in.** Plan 8 says a story event changes a dungeon (goblins drive out kobolds: same layout, new dwellers, dressing and traps). Today only `move-in` after a clear does that.
* **Plan 8.1's layers 5 and 6 are missing.** Inhabitants don't live inside yet (no kitchens or guard shifts), and wards are not tied to schools.

**The target (plan step C6c): dungeon kinds as data, and one request.**

* **A kind is one definition** (`DungeonKindDef`): its lore (in the setting), its space rules, its outside shell (a builder chosen by name: hatch, mound, mouth, keep, or a new one), where it may stand (under a house, on a slope, on a rise, in a region's ruins), its light and its sound. The code reads the definition, never `template === '…'`. A new kind is data plus, at most, one new shell or space rule.
* **One request:** `dungeonFor({ purpose, near, danger, dwellers?, history? }, seed)` in `src/vgm/dungeons.ts`. It picks the fitting kind and site and returns the decision. Leads, story events (the waystation's hideout), encounters (a den), guild tasks and later the LLM hook all ask it. A caller may fix the dwellers (from an encounter, section 3) or the top history layer; the rest comes from the lore.
* **Not tied to a town.** The household who knows of a place is optional, and a region can own one.
* **A `retake` decision.** It is the story change of plan 8: new dwellers or new history on a place that is still open or cleared, with the layout kept. Move-in becomes one case of it.
* **The variety check** sweeps every kind in the setting, so a new kind is checked the day it is added.

## 5. Signals the VGM reads

These come from the `Signals` of `vgm/director.ts`, filled by `main.ts` `direct()`:

* fighting
* pressure (danger against power)
* health
* talking
* underground
* in town
* open leads

Every few seconds, the Builder also reads:

* the log
* the towns
* where the hero is and where they're heading
* game hours
* whether they are inside a place
* the Purpose need

**Not read yet** (plan 4.3):

* a player model (playstyle from decayed evidence)
* which hints the hero has actually heard
* the hero's gear and power, used only for warnings so far

## 6. Adding a tool

A new kind of thing the VGM makes (an encounter kind, an event, a place, a steer) is added like this:

1. **Data first.** Its definitions go in the setting module (`src/setting/contract.ts` and `src/setting/classic`), validated there.
2. **One decision kind** in `world/decisions.ts`, if it changes the world. Plain data, with an `at` (game hours) and the ids it refers to.
3. **One pure function in `src/vgm`.** It takes a context (log, towns, terrain, hours, setting, hero) and returns the decision or null. It is seeded (no `Math.random`) and tested.
4. **Registered in the toolbox** (`src/vgm/toolbox.ts`) with its id, the decision kinds it writes, the need it meets, and its `next`. The game's VGM step asks the toolbox; `main.ts` gets no new `…Due` function of its own.
5. **Applied in one place** in the game (built, drawn, told), keyed by decision kind.
6. **Told and ended.** Say how the hero hears of it (talk, journal, map, news) and how it ends (`kept`, time, never).
7. **This document**: one row in section 2.
8. **The loop check** (`npm run loop`) sees it happen in a played evening.

## 7. Gaps

* **No central toolbox yet.** The Builder's turn is `promiseDue` and `eventDue` in `main.ts`, and the region opener runs from `app/regionSites.ts`. Step C6b moves them behind `src/vgm/toolbox.ts`.
* **Wild groups are not decisions.** The VGM can't add a wolf pack where Challenge is overdue or remove the highwaymen after the hero drove them off. They become encounters in the log (C6b).
* **The Director orders only one thing.** Only Purpose makes the Builder act. Challenge, Reward, Discovery and People are counted but nothing answers them. The toolbox's `need` field is how it will ask: when a need is overdue, the Director asks the tools that meet it for their cheapest fitting move (plan 4.1).
* **Story events are not in talk.** Conversations doesn't know of events yet, so townsfolk can't speak of the band.
* **No traces yet.** Events leave no ruins, refugees or survivors (plan 4.5).
* **No player model, and no LLM hook** (plan 4.1, 15).
