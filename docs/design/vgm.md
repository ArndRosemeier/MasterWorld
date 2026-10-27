# The VGM: what it can do

Living document. It lists every tool the virtual game master (VGM) has today, what each one makes and when, and the rule for adding new ones. The ideas behind it are in the [plan](masterworld-plan.md), sections 4 (Director and Builder), 5.1 (the decision log), 8.1 (against formula) and 9.3 (the world simulation). This document says what is **built** and where it lives. Keep it true: a PR that adds or changes a VGM tool updates this file (CLAUDE.md rule 10).

## 1. What the VGM is

The VGM has two halves that share one view of the player (plan 4):

* **The Director** decides *what the player needs now*. It reads signals (section 5), keeps five needs (discovery, challenge, reward, people, purpose), a tension curve and a message queue, and it is fair: it warns before danger and never scales the world to the player (D29).
* **The Builder** decides *what the world gets*. Everything it makes is a **decision** in the log (`src/world/decisions.ts`): plain data, saved and replayed, so the world is the seed plus the log (plan 5.1).

It steers the people and creatures of the world simulation only through orders and decisions, never by moving them directly (D27).

**Invisible, and showing rather than telling.** In play the VGM never shows its hand (D53). The game settings show it and its pacing, and the debug menu keeps a log of each move and why (plan step C8). What it makes, the hero should mostly come upon and see: situations that arise naturally, not quests handed out (D52, step C10). A speech bubble is for the rare urgent line, such as a cry for help.

**Built (C8, 2026-10-27): the VGM's log and its pacing.** `vgm/vgmLog.ts` `vgmLines` gives every decision in the log one line: the tool that wrote it (`toolFor`: the toolbox's `writes`; an event's lair is the event's, roads laid before the first region are the world's first), the tool's need, and why (the reason the tool gave as a `Made`, which says what it read; otherwise what the decision says of itself, `decisionSays`). It reads the decision log, so a loaded game shows its whole history. The debug menu's VGM section prints the last 30 moves or all of them. The game settings (Game tab, "The game master") show the VGM in one sentence and its pacing: calm, normal or eventful (`PACING`: the Director's needs grow at 0.6, 1 or 1.6 times the setting's rates). Checks: `test/vgmLog.test.ts`.

**Built (C9 part 1, 2026-10-27): answering a need.** A tool may be asked by an overdue need (`asked: 'need'`, its `answer`): `answerNeed(need, c)` asks the tools that meet that need in the toolbox's order, cheapest first, for a move that fits now. The game asks every Builder turn while a need is overdue, the hero is out on the land on foot and the world may press them, at most once each 90 s (`main.ts` `answerOverdue`); the debug menu's VGM section answers Discovery at once. Play meets Discovery where the hero first comes upon something: a town first entered, a place first gone down into (`app/cellars.ts`), a region's place first stood by (half), a sight. Discovery's answer is **a sight by the way**, Reward's **a find by the way** and Challenge's **an ambush** (part 2), People's **a traveller by the way** (part 3): every need has an answer. The loop check (`game/evening.ts`) has a Director watch the evening, answers Discovery on the way out (the VGM knows where the hero is going, plan 4.4), and fails if any need stands overdue more than 5 minutes. Checks: `test/answers.test.ts`, `npm run loop`; on the GPU `npm run shot:sights`.

What the VGM should become, and where it falls short today: [The VGM we want](https://claude.ai/artifact/Y9YgAzHphg24tFXZQ3m9Hx).

**One toolbox (D51).** Everything the VGM can make lives in `src/vgm` (pure: no three.js, so it runs in workers, tests and the loop bot). Each kind of thing is a **tool** with the same shape (section 6). The game (`src/app`, `src/main.ts`) only *applies* what a tool decided: it builds, draws and tells it. It never decides on its own what the world gets.

## 2. The tools today

| Tool | What it makes | When | Writes | How the player hears of it | How it ends | Code |
|---|---|---|---|---|---|---|
| **Open the world** | The start town, the arch, the peoples' holds, the teachers' towers, the first roads | A new game | `town`, `volume`, `hold`, `retreat`, `road` | The start; holds and towers are on the map | Never | `vgm/builder.ts` `openWorld`, `firstDecisions`; tool `open-world` |
| **Open a region** | An aligned square ahead of the hero, filled from the setting: plain country, a hamlet, a village, a camp, ruins, a barrow field | A point ahead of or around the hero lies in no open region (`FRONTIER`) | `region` (a hamlet or village is a town of its size) | A line in the log, the map | Never | `vgm/frontier.ts` `nextRegion`, asked by `app/regionSites.ts` as the hero walks; tool `region` |
| **Lay a road** | A path, track or road to a new place, routed once and kept | A place opens (a region's settlement, a promised site) | `road` | Seen on the land and the map | Never | `vgm/roads.ts` `linkRoad`; tool `road` |
| **Place the wild** | The groups living round a town (classic: deer, boar, a wolf pack, the bandits by a road), each an encounter on its territory | A town's wild is first needed (today: the start town at load; an older save gets the very groups it had) | `wild` | Met on the land | Not yet (the VGM may later drive a group off or add one) | `vgm/wild.ts` `wildFor`, `wildOf`, `territoryOf`; tool `wild` |
| **Promise a place** | A dungeon: a cellar under a house, or a barrow, cave or ruined tower out on the land; its danger fixed by distance (`dangerAt`) | The Builder's turn: fewer than `LEADS.min` promises open, or Purpose overdue (up to `LEADS.max`), at least `LEADS.gap` hours apart | `dungeon`, `move-in` | The household knows (`hints.ts` `cellarHint`, `TownTalk.add`); asked, they mark the map (D35); the guide sends someone over | `kept` when it is cleared and the household told | `vgm/leads.ts` `nextPromise`; `vgm/dungeons.ts` `promiseCellar`, `promisePlace`; tool `promise` |
| **Ask for a place** (not a tool of its own; what tools call) | A place for a purpose (a lead, a hideout, a den), of a kind whose form has that purpose and, if asked, whose lore has the dwellers asked for (an encounter's id), near a point or on the kind's ring round a town | Asked by a tool (C6 part 3: the waystation's band asks for a hideout) | `dungeon` (through the caller) | As the caller says | As a promise | `vgm/dungeons.ts` `dungeonFor` |
| **Move in** (part of Promise a place) | New dwellers in a cleared dungeon (repopulation, plan 8.1) | A kept dungeon stood empty `LEADS.settle` hours | `move-in` | As a promise | `kept` | `vgm/leads.ts` `moveInto` |
| **Keep a promise** | A promise or an event marked done | Asked by the game: the household is told a place is quiet, an event's band is beaten | `kept` | The household's thanks, the town's word | Never (a kept place can be moved into) | `vgm/leads.ts` `keepPromise`; tool `keep` |
| **Story event** | `spill`: the dwellers of a place left alone come out and roam the land near it. `raid`: the wild's raiders (classic: the bandits by a road) come down on the farm nearest their camp and drive off some of its paddock's animals; a band of them holds the beasts towards the camp. `take`: the raiders take the waystation nearest their ground; its folk flee and a band holds it, and the tool asks `dungeonFor` for a hideout near it where the rest lie up (`lairFor`, logged a turn later) | The Builder's turn. Spill: a promise open longer than the event's `after`. Raid and take: `after` hours into the world, while any of the raiders' camp lives, one band out per camp (a take: a waystation within `reach`, one held at a time). One event per town per `cooldown`, never while the hero is inside | `event` (+ a town `order`), a take's `dungeon` (its lair) | News line, journal lead with a map mark, the town gathers at the market; a raided paddock stands short (`Herds.driven`), its farm's barn smokes over the trees for a while, seen from afar before anyone tells of it, and close by someone cries out (situation `raid-smoke`, C10: `vgm/situations.ts` `smokesAt`, drawn by `render/smoke/SmokeView.ts`); the town's people know of it and tell it when asked (a topic each for the latest three, C11: `talk/townTalk.ts` `talkEvent`; a raided farm's household saw it themselves, everyone else has it from the talk of the town), and once it is over they tell how it ended; a held waystation stands empty of its folk (`heldBy`, `TownLife.gone`) | `kept` when the band is dead (a raid's animals are home again, a waystation's folk come back; the lair stays a lead until cleared) | `vgm/events.ts` `nextEvent`, `lairFor`, `heldBy`, `eventTold`, `gatherFor`, `takenFrom`; tool `event` |
| **Others take a place** | New dwellers in a place, open or cleared, of the encounter asked for; the layout and history stay (plan 8's story change) | Asked by a tool (a story event: a band moves into a place) | `retake` | The household's hint names the new dwellers; the place's facts say who took it | `kept` with the place's promise | `vgm/dungeons.ts` `retakeOf`, `vgm/leads.ts` `dwellersOf`; tool `retake` |
| **A sight by the way** | Discovery's cheapest answer: something old the hero comes upon (classic: a ring of standing stones, a waystone of the old realm, a cairn), a little off the way they are going | Discovery is overdue, the hero is out on the land on foot and the world may press them (`answerNeed`, at most one answer each 90 s) | `sight` | Seen on the way; coming upon it says what it is | When come upon (Discovery met) | `vgm/answers.ts` `sightFor`, `world/sites.ts` `layOutSight`, drawn by `app/regionSites.ts`; tool `sight` |
| **A find by the way** | Reward's cheapest answer: something hidden by the way (classic: a bundle under a flat stone against a boulder), its loot rolled from the setting's treasure table at the land's danger (D29) | Reward is overdue, as for a sight | `sight` (`need: 'reward'`) | Seen on the way; coming upon it, its finds go into the pack and purse | When come upon (Reward met) | `vgm/answers.ts` `sightFor(c, 'reward')`, `findIn`; tool `cache` |
| **An ambush** | Challenge's cheapest answer: a group of the wild that meets Challenge (of the woods or the open as the spot is, near the land's danger) lying in wait ahead on the hero's way | Challenge is overdue, as for a sight | `wild` (`group: 'ambush'`) | Met on the way, a fight | When beaten (Challenge met by the fight) | `vgm/answers.ts` `ambushFor`; tool `ambush` |
| **A traveller by the way** | People's cheapest answer: the traveller of the nearest town with an inn (the one who comes and goes, lodging there) resting by the hero's way for two game hours, facing the way the hero comes; there the hero is with that town's people and can talk with them | People is overdue, as for a sight; not while that town's traveller rests by the way already | `traveller` | Seen on the way; talked with like anyone of their town | When the hero comes up to them (People met as in a town); after the rest they are on the road again | `vgm/answers.ts` `travellerFor`, `restingAt`; stationed by `game/township.ts` (`posts`), drawn as the town's people (`app/towns.ts`); tool `traveller` |
| **A hurt traveller** | A situation (D52, C10): People's answer now and then (the setting's `chance`) is the traveller hurt, crouched by the hero's way; once the hero is within the situation's `seen` they cry out for help in a speech bubble | People is overdue, as for a traveller, and the seeded share says hurt | `traveller` (`situation`) | Seen first, then the cry; talked with like anyone of their town | As a traveller resting | `vgm/situations.ts` `hurtTravellerFor`, `criesDue`; `app/speech.ts`; tool `hurt-traveller` |
| **Wolves at the paddock** | A situation (D52, C10): at dusk the setting's encounter (wolves) prowls outside a paddock of the town the hero is in, on the side away from the houses; whoever of the town stands nearest calls out once the hero can see them | The Builder's turn: the hero is in a town with paddocks, in the setting's hours, once a town every `every` days | `wild` (`group: 'paddock'`, `situation`) | Seen at the fence, then the cry; a fight | When beaten (they stay until then) | `vgm/situations.ts` `paddockWolvesFor`, `criesDue`; tool `paddock-wolves` |
| **A beast got out** | A situation (D52, C10): by day one of the beasts of a paddock of the town the hero is in gets out through the gate and trots off away from the houses; someone of its farm goes after it, catches it where it got to and leads it back in. No cry: it is no emergency, the hero just sees it | The Builder's turn: the hero is in a town with a worked paddock, in the setting's hours, once a town every `every` days | `stray` | Seen: the beast out in the fields, its farmer after it | Caught, or after `lasts` hours | `vgm/situations.ts` `strayBeastFor`, `strayAt`; `sim/livestock.ts` `Herds.loose`; `game/township.ts` (the chase); tool `stray-beast` |
| **A journey** | The hero's seat on the cart from one inn to another town's inn: the VGM knows where the hero will be before they get there (plan 4.4); never to a place a band holds | Asked by the game (the innkeeper's topic, C7) | `journey` | The innkeeper offers the ways; the cart sets the hero down | On arriving | `vgm/journeys.ts` `cartWays`, `journeyOf`; tool `journey` |
| **Steer a town** | Everyone awake gathers somewhere, or stays indoors | Asked by another tool (an event's gathering) | `order` | Seen in town | Its time runs out | `vgm/orders.ts` `townOrder`; tool `order` |
| **Guide** | Someone who has heard of a promise walks over and hails the hero | The hero has nothing to follow for a while | nothing (not logged) | The hail | When talked to | `vgm/guide.ts` `Guide`, `hailer`; tool `guide` |
| **Director** | Needs, tension phase, music mood, paced messages, danger warnings, which known place fits the hero's power | Every frame | nothing (saved in the game's save) | Messages, warnings, music | Never | `vgm/director.ts` `Director`, `warning`, `fittingPlace` |

**The toolbox** (`src/vgm/toolbox.ts`, C6b): every tool above but the Director (the other half of the VGM) is listed in `TOOLS` with its id, the decision kinds it writes, the need it meets and who asks it: `start` (a new game), `walk` (the frontier, as the hero walks), `turn` (the Builder's turn every few seconds: `vgmTurn` asks each turn tool in order, each seeing what the ones before decided) or `call` (another tool or the game asks it by name). The game has one VGM step (`main.ts` `vgmStep`) and applies each decision in one place by its kind (`applied`). `test/toolbox.test.ts` checks that every decision kind is some tool's and every tool has its row here.

**Not yet a VGM tool, but it should be (section 7):**

| What | Today | Code |
|---|---|---|
| Who lives in a dungeon | Chosen from the setting's dwellers when the dungeon is sketched (section 4), unless `dungeonFor` was asked for an encounter or a `retake` set it; the lore still picks among its dwellers, not `encounterFor` | `world/dungeon/cellar.ts`, setting `dungeons.*.dwellers` |
| Guild tasks | Handed out by guild masters, kept from the log | `game/guilds.ts` `GuildBook` |

## 3. Encounters

An **encounter** is who the hero meets, where and why: a group of creatures or people (from the setting's `creatures`), with a danger, a place on the land or in a dungeon, a temper, and a reason (a den, a band out of a place, highwaymen on a road). Today encounters come from three separate places, and each has its own rules:

1. **Dwellers in a dungeon**: the setting's `DwellerDef`s, chosen to fit the place's danger.
2. **Wild groups**: the setting's `WildDef`s, with a habitat, a ring round the town and a group size.
3. **Event bands**: an `EventDecision`'s `members`.

**Built (C6b, 2026-10-27).** The setting's `encounters` (`EncounterDef`: `creatures` with the leader first, `count`, `where` it may be met: below, wood, open or road, and the `need` it meets: challenge or discovery) is the one list; classic's is `setting/classic/encounters.ts`. A dweller below names its encounter (`...who('rats')` in the lore), a wild group names its own (`WildDef.encounter`), and `encounterFor` (`vgm/encounters.ts`) fills the wild's groups (`vgm/wild.ts`) and the story events' bands (`EventDecision.encounter`). It keeps to `of` when the caller knows who it wants, to `where` and `need`, comes near the `danger` asked (an encounter whose middling group is off by more than 60 % only when nothing closer fits), and keeps away from the last three met (`recent`). `test/encounters.test.ts` sweeps every place and danger band for misfits and repeats, and checks that every encounter is met somewhere. To design a new encounter, add a line to the setting's list and use it in a dweller, a wild group or an event; the sweep shows where the VGM would pick it. Every tool's move is logged with its need and reason (`Made`, `vgmTurn`; the game keeps the latest 200 as `game.vgmLog`) for the VGM log of D53 (C8).

**The target (plan step C6b): one encounter tool in `src/vgm/encounters.ts`.** Still open from it: temper and the words that tell of an encounter, and road ambushes and guild quarries asking for one.

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

* ~~**The kinds are a closed list.**~~ Built (C6c part 1, 2026-10-27): a kind is one entry of the setting's `dungeons`, its lore plus its `form` (`DungeonForm`: where it `stands`, house, rise, slope or level ground; its `ring` from the town; what it is `called`; its `word`; its `shell` on the land, an engine builder by name: hatch, mound, mouth or keep; its tree `clearing`; set `pieces` it borrows from other kinds; and its `space`, `DungeonSpace`: size, rooms, depths, rise, way out, inset, entrance, carved or built, torches, where the hero arrives, walls). `DungeonTemplate` is any key of `dungeons`; the code reads the form (`sketch.form`, `landKinds`, `placeOf`, the shells in `app/cellars.ts`, the clearings in `world/terrain.ts`), never a kind's name. The setting's validation checks each form. A new kind is data, plus at most a new shell or ground rule. The bandit hideout is the first kind added as data only (C6c part 2: `classic/hideout.ts`, a timbered dig in a slope, purpose `hideout`, no lead of its own). Plan 8's other kinds (mine, crypt, keep or temple, sewer) are not there yet.
* ~~**The VGM can't ask for a purpose.**~~ Built (C6c part 2): `dungeonFor({ purpose, town, near?, dwellers?, kinds? }, context)` picks a kind whose form's `purposes` hold the purpose (and whose lore has the dwellers asked for), then ground for it near a point or on its ring. Leads still pick through `nextPromise` (land kinds with purpose `lead`), so old seeds give the same places. Not yet: asking for a top history layer, or a danger other than the distance's.
* **Every dungeon hangs on a town house.** `DungeonDecision` needs a `town` and a `building`: the household nearest the place knows of it, even when `dungeonFor` puts it near a point far from that town. A place that belongs to no household (a region's own) can't be made yet.
* ~~**Change is only move-in.**~~ Built (C6c part 2): a `retake` decision (`retakeOf`) puts the lore's dwellers of an encounter into a place, open or cleared, with the same layout and history; the sketch, hints and facts follow it (`dwellersOf`). `move-in` stays the Builder's repopulation after a clear (it opens a new promise; a retake doesn't). Not yet: a retake that changes history or traps.
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

* **Wild groups are decisions, but nothing moves them yet.** The VGM can't add a wolf pack where Challenge is overdue or remove the highwaymen after the hero drove them off (C9).
* **The Director orders only one thing.** Only Purpose makes the Builder act. Challenge, Reward, Discovery and People are counted but nothing answers them. The toolbox's `need` field is how it will ask: when a need is overdue, the Director asks the tools that meet it for their cheapest fitting move (plan 4.1).
* **Story events are not in talk.** Conversations doesn't know of events yet, so townsfolk can't speak of the band.
* **No traces yet.** Events leave no ruins, refugees or survivors (plan 4.5).
* **No player model, and no LLM hook** (plan 4.1, 15).
