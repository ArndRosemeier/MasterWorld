# MasterWorld: implementation plan

What gets built, in which order, and when a step counts as done. The design is [masterworld-plan.md](masterworld-plan.md). This file only decides the order and the bar, and it points to the design for everything else.

Status: **2026-10-26.** Written after the first review of the build (milestones 1–4 as first cuts, see the plan's status line). **Gate A passed on 2026-10-26** (review: `/mnt/project-files/masterworld/shots/2026-10-26-8ca069c-webgpu/gate-a-review.md` and the fixes after it). **Gate B passed on 2026-10-27** (review: `/mnt/project-files/masterworld/shots/gateb/gate-b-review.md`, final retake on 01ac13b in `/mnt/project-files/masterworld/shots/gateb-final/`). **Gate C passed on 2026-10-28** (review: `/mnt/project-files/masterworld/shots/gatec/gate-c-review.md`, retake on da14451 in branch `claude/gatec-shots`, `shots/gatec-retake3/`). **Phase C reopened on 2026-10-28** for C13–C15 (Arnd); **the second gate C passed on 2026-10-28** on 0654bdb (review: `/mnt/project-files/masterworld/shots/gatec/gate-c2-review.md`, shots in branch `claude/gatec-shots`, `shots/gatec2b/`). **Phase L (the land at every scale) comes next** (Arnd, 2026-10-28), then phase D.

---

## 1. How this plan is used

The coordinator enforces these rules. A thread that wants to break one asks Arnd first.

1. **One phase at a time.** New work belongs to the current phase (section 4). Three kinds of work may run alongside it: a bug fix, a quality-floor item (section 3), or something Arnd asks for by name.
2. **Every step has an owner thread and a done-check.** A step is done when its done-check passes, not when its PR is merged.
3. **Every PR description has a `PLAN:` line** that names the step it serves, such as `PLAN: A2 trade` or `PLAN: floor F3`. A bug fix writes `PLAN: fix`. It sits next to the `COPIES:` line.
4. **The plan is kept true.** When a step is built, its thread adds a short "Built" note to the matching section of masterworld-plan.md (as 11.2 and 11.7 do) and ticks the step here.
5. **Phase gate.** A phase ends when all of its steps are done and a review against the design passes: the standard shots (F1) are judged and the loop check (A6 onwards) runs. Only then does the next phase start. The reviewer's findings either become steps in the current phase or go to the open list (section 6) with a reason.
6. **No placeholders at a gate.** At a phase gate, no standard shot may show an untextured box, a flat-coloured wall or a missing animation.
7. **Arnd decides goals, threads decide means.** A step that would change a decision (D-number) goes to Arnd as a decision. Everything else is decided in the thread and written down.

---

## 2. Where we are

| Area | State | Design |
|---|---|---|
| The land, sky, water, weather, trees, grass, light | Built, hero-class on GPU; dusk and night fixed (PR #82), bloom and AO (#94, #96) | 5, D17 |
| The town and its folk | One town, day plans, interiors, farms, horses | 7, 9.2 |
| Promises and dungeons | Leads keep coming (#88), cellars, barrows, caves and ruined towers (B5), set pieces per kind, variety check in CI | 4.2, 8 |
| Fights, items, the Director | Tab combat, rarity cards, needs and tension, music | 11.2, 11.5 |
| Map, talk, journal, saves | Orientation skill, map hand-over, Conversations, saves v3 | 9.1, 11.7 |
| Title, creator, sound, UI | Title fly-over with giant, Actors creator, warded-brass windows and compass (#87) | 16, 17 |
| **Missing for the core loop** | **No trading** (finds can't be sold, gear can't be bought), no repair, no inn room, no roguelike mode | 11.1, 11.3, 11.5 |
| Missing beyond it | Peoples and reputation, a second settlement and roads, story events, magic, seas | 11.6, 19 |

The ten-minute loop works. The evening loop breaks at "come back, sell and upgrade". Phase A closes it.

---

## 3. The quality floor (always on)

These hold in every phase. A PR that breaks one is fixed before new work goes on.

| # | Floor | Check |
|---|---|---|
| F1 | **Standard shots.** One script takes the same set on a GPU: title, the creator, town at noon, dusk, night and in rain, a cellar, a barrow, the wild, a fight, the pack, the map, the trade window, talk. They are saved with the commit hash. | `npm run shot:set` (`tools/shot/set.mjs`, built in A1; two runs since gate C, town and land, with a hurt traveller and a raided farm). Run at every phase gate and after visual PRs. |
| F2 | **Frame time** on the reference GPU (Arnd's RTX 5070, 1080p, the game's default backend, WebGPU): at most 16.7 ms in every standard shot, aiming for 12 ms. No shot may be twice as slow as the town at noon. The WebGL fallback (`?gl`) may be at most 1.5× slower. From gate B on, p95 is at most 25 ms too (vsync on): at gate A dusk and night had 5–9 % of frames at 30–46 ms, GPU or present side. | The `&hud` frame time in F1 shots, written into the set's index. |
| F3 | **Shaders** per [SHADERS.md](../SHADERS.md): 0 violations in every shot. | HUD line "policy ok". |
| F4 | **Load time**: title in under 1 s and playable in under 20 s on the reference machine, cold, on the default backend (WebGPU); the WebGL fallback (`?gl`) playable in under 30 s; music streams and is not part of the start download. | `tools/shot/load.mjs` (title, playable, start download; fails on game music in it), `tools/shot/perf.mjs`. Sound is 42 MB in `public/sound`, 34 MB of it music. |
| F5 | **Tests** per [CHECKS.md](../CHECKS.md): 5 s per test, 60 s for `npm test`; variety check in CI. | CI. |
| F6 | **No duplicates, no `Math.random`, layers kept** (CLAUDE.md). | `npm run dup`, `npm run repeated`, guards. |
| F7 | **The world stays fixed by place** (D29): nothing scales to the hero's power. | Review at each gate. |
| F8 | **Warded brass everywhere** (17.1): every new window or HUD piece uses the shared ward frame, rarity card, compass and brass button, and has its own signature animation. | Review of the F1 shots. |

---

## 4. Phases

Each step lists what it delivers, its done-check and the design section it follows. Steps within a phase may run in parallel unless one names another.

### Phase A: Close the evening loop (finishes milestones 3–4)

Goal: an evening of play works end to end. You get a lead, travel, clear the place, come back, sell, upgrade and get new leads.

| Step | Delivers | Done when | Design |
|---|---|---|---|
| A1 | **The standard shot set** (F1, F2): one script, one folder per commit, an index with frame times | The set runs in one go on the reference GPU and the shots of today's main are judged | 3 |
| A2 ✓ | **Trade**: merchants in the town's shops (smith, general store, the inn's keeper) with limited stock and coin; prices follow what the town has; sell finds, buy gear; copper, silver and gold; a trade window in warded brass with item cards | A seeded test sells a find and buys an upgrade; the trade window is in the F1 set | 11.5 |
| A2b ✓ | **Something to spend on**: each shop keeps a few uncommon pieces and one rare piece at prices that take several evenings to save for; shops restock every few game days (seeded); trainers (the smith, a caravan guard, the hedge witch) sell lessons that cost more as the skill rises. Fixed by town, never by the hero's power (F7) | The A6 bot spends on an upgrade or a lesson at least every second evening and its purse stays sensible at evening six; a test for restock and lesson prices | 11.4, 11.5 |
| A3 ✓ | **Upkeep**: gear wears and the smith repairs it; a room at the inn restores you and sets where you wake | Test: wear, repair cost, waking at the inn | 11.5, 11.2 |
| A4 ✓ | **Death as designed**: in classic mode carried gear stays where you fell, as a mark on the map to go back for; **roguelike mode** (one save the game writes, death ends the hero, the world stays for the next one) | Tests for both modes; the New game screen offers the mode | 11.1, D12 |
| A5 ✓ | **Music streams** (F4): the start loads no music; tracks load when first needed | `npm run load`: no game music before playable (only the title's theme). The load times are A7 | 16 |
| A6 ✓ | **The loop check**: a scripted hero (extending `src/game/bot.ts`) plays an evening headless: hears a lead, walks to it, clears it, comes back, sells, buys an upgrade, hears the next lead. It is a slow check of at most 5 min | The check passes on main and runs before every phase gate | 11.3 |
| A7 ✓ | **Load fast** (F4): the start fetches only what the first view needs. Today a cold load on the reference GPU shows the title at 1.4 s and is playable at 62 s, with 97 MB fetched (Actors human packs 68 MB in 654 files, cow 14, horse 8, dog 4.5). Bundle the packs into a few files, load the people and animals near the start first and the rest behind play, and cache in the browser | `npm run load` on the reference machine: title under 1 s, playable under 20 s, cold | 3 (F4), 17.2 |

Gate A: A1–A7 and A2b done, the F1 set judged, no placeholders. **Passed 2026-10-26** (set 8ca069c, then #144, #146–#149 for the inn talk, barrow portal, sea and animals).

### Phase B: The frontier (milestone 5)

Goal: the world grows as you walk. There is more than one place to go, and the places change.

| Step | Delivers | Done when | Design |
|---|---|---|---|
| B0 ✓ | **A floating origin**: rendering is relative to an origin near the hero that moves in steps (whole chunks), so float32 stays exact wherever the hero walks. The start town already sits 32 km from zero, and skinning shimmered there until Actors 0.17.1 and AG #94 worked round it one system at a time | Shots at 30 km and at 300 km from zero show no shimmer on folk, creatures, water or shadows; the origin step causes no visible jump and no shader rebuild | 5.2, D17 |
| B1 ✓ | **Opening regions as the player walks**: the VGM opens regions ahead of the hero (5.5) and fills them from the setting (a hamlet, a camp, ruins, a barrow field), all logged | Test: walking 5 km in one direction opens regions and the log replays them | 4.2, 5.2, 5.5 |
| B2 ✓ | **Roads** between settlements, which beat vegetation (section 7 footprints) | Shot: a road leaving town to the hamlet | 7 |
| B3 ✓ | **Settlement sizes**: hamlet, village and town from one planner; the capital is prepared but not placed | Shots of each size; leads come from every settlement | 7, D41 |
| B3a ✓ | **Every settlement works like the start town** (Arnd, 2026-10-26): interiors, cellars, shops and fine work, lessons, the inn room, livestock and paddocks, the hailer and talk run per settlement on one shared code path; a settlement differs only by data and small specialties, and nothing is hard-wired to the start town | Tests: each system runs in a generated hamlet and a village through the same functions as in the start town; a guard or test finds no start-town ids or positions in those systems; the loop check spends an evening in a second settlement; shots of a hamlet's shop, inn room and an open house | 7, 9.3, 11.5 |
| B3b ✓ | **Guild houses** (D49): the fighting and craft houses, in town or a short way out and on the map from the start; their trainers open new skills at rank 0 and later ranks once the hero has earned them by use; one trainer's task per guild for a higher rank; standing with each guild; a bard at the inn answers "where can I learn …?" and marks any house on the map, the hidden ones too. The smith's and the carter's lessons move into their houses | Tests: a skill can't rise before a trainer opens it; a rank needs use and, where asked, the task; the loop check opens one new skill; a shot of a guild house | 10, 11.6, D49 |
| B4 ✓ | **Peoples and reputation**: each people has a reputation number; it changes greetings, prices, talk and guards; a people's own area (the first: a dwarf hold gate or an orc town); entering it unwelcome is dangerous | Tests: reputation changes prices and greetings; a shot of the people's area | 11.6, D34 |
| B5 ✓ | **More dungeon kinds**: a natural cave (volumes, 5.6) and a ruined tower, each with its own set pieces and passing the variety check | Variety check per kind; shots | 8, 8.1 |

Gate B (Arnd, 2026-10-27: story events and travel moved to phase C as C6 and C7; guild houses B3b stay in B): the loop check runs in a second settlement, every town system works there through the same code as in the start town (B3a), the F1 set adds a hamlet and a road, frame time p95 stays within F2, and the review passes.

### Phase C: Skills and magic (milestone 6)

Goal: magic returns to the world, and growing means more than bigger numbers.

| Step | Delivers | Done when | Design |
|---|---|---|---|
| C1 ✓ | **The ability recipe format** ported from Norgo (ops: projectile, area, zone, effect, terrain edit), with mana, stamina and health costs, cooldowns and cast times | Tests on the recipe runner | 10 |
| C2 ✓ | **Six schools** (pyromancy, cryomancy, geomancy, vitae, luminism, umbramancy), with a few abilities each at the start | Each school has a shot of its first spell | 10 |
| C3 ✓ | **Unlock sources** (D49): the magic teachers open a school at rank 0 and its abilities by rank, like the guild houses; the hedge witch's cottage and the warden of the half-ruined tower teach, and a hidden house underground that the hero must find (D49); tomes, scrolls, items and deeds are rare extra ways to an ability | Tests per source; a fresh hero with no magic asks the bard, finds a teacher and casts a first spell on the first evening; the loop check with a mage hero | 10, D11, D49 |
| C4 ✓ | **Spell effects** within the shader budget (F3), compiled before first use | F3 passes in a fight with every school | SHADERS.md |
| C5 ✓ | **Rare item-only abilities** on items (D31) | A legendary item with its ability in the F1 pack shot | 11.5 |
| C6 ✓ | **Story events**: a raid on a farm, bandits taking a waystation, a dungeon's dwellers moving out to the land; the town shows what happened | Test: an event's ledger entry changes the world and the leads | 4.2, 11.3 |
| C6b ✓ | **The VGM toolbox** (D51): every Builder tool in `src/vgm/toolbox.ts` with one shape (id, decision kinds, the need it meets, `next`), one VGM step instead of `main.ts`'s `promiseDue`/`eventDue`; **encounters** as one `EncounterDef` in the setting and one generator `encounterFor(need, where, danger, seed)` that dungeon dwellers, wild groups and event bands all come from; wild groups become decisions | Tests: every tool is in the toolbox and in [vgm.md](vgm.md); an encounter sweep fails on repeats and misfits; the loop check unchanged | [vgm.md](vgm.md) 2, 3 |
| C6c ✓ | **Dungeon kinds as data** (D51): a `DungeonKindDef` per kind (lore, space rules, outside shell, where it stands, light, sound), no `template === '…'` in code; one request `dungeonFor({ purpose, near, danger, dwellers? })` that leads, events and encounters ask; places not tied to a town house; a `retake` decision (new dwellers or history, same layout); one new kind (the bandit hideout, for the waystation) added as data to prove it | Tests: the variety sweep runs over every kind in the setting; the waystation's band gets its hideout from `dungeonFor` | [vgm.md](vgm.md) 4, plan 8 |
| C8 ✓ | **The VGM's log** (D53): the VGM stays invisible in play; the debug menu shows a log of every move (the tool, the need behind it, what it read); game settings show the VGM and its pacing (calm, normal, eventful) | Test: every decision a tool writes has a log line with its need; the pacing setting changes the needs' rates | [vgm.md](vgm.md) |
| C9 ✓ | **Answer every need** (plan 4.1): each tool names the need it meets; an overdue need asks those tools for the cheapest fitting move (Challenge: an ambush; Discovery: a sight; People: a town's traveller resting by the way; Reward: a find by the way; built 2026-10-27, MW #233, #234 and part 3) | The loop check: no need overdue more than 5 minutes in a played evening | 4.1, [vgm.md](vgm.md) |
| C10 ✓ | **Situations, not quests** (D52): the VGM makes situations the hero walks into and sees (a farmer chasing a stray cow, smoke over the trees from a raided farm, a wounded traveller, wolves at the paddock at dusk); an NPC with something urgent to say shows a speech bubble, rarely; a few classic quests only where they make sense (built 2026-10-27, MW #238 and part 2: a hurt traveller, wolves at the paddock at dusk, smoke over a raided farm, a beast out of its paddock; the leads stay the classic quests) | Test: each situation kind is seen before it is told; speech bubbles at most for urgent lines; a GPU shot of one situation | 4, 9, D52 |
| C11 ✓ | **A story that remembers** (plan 4.5): events leave traces (ruins, ash, refugees, rumours, a survivor); ignored promises resolve through an event; the hero's deeds cause events; good events (a market day, a festival); talk knows events (Conversations domain) | Test: an event's traces stand in the world and in talk; an old promise resolves | 4.5 |
| C12 ✓ | **The player model** (plan 4.1, 4.3): playstyle from decayed evidence, hints heard, leads taken; C9 and C10 lean towards what the player enjoys | Test: a mage and a fighter bot get measurably different moves | 4.1, 4.3 |
| C7 ✓ | **Travel**: horses on roads, fast travel rules, time passing as designed | Test against 5.4's numbers | 5.4, D37 |
| C13 ✓ | **Skills by trainers** (D54): nothing rises by use any more; every rank is bought from a trainer for coin, and given only at a good enough reputation, one for the whole world (higher for dangerous skills); it comes from good deeds counted once (places cleared, people helped, bands beaten, promises kept, guild tasks); old saves keep their values; the loop bot buys ranks instead of grinding | Tests: no action raises a skill; a rank needs coin and standing; repeating a deed adds no standing; the loop check with a fighter and a mage still passes | 10, 11.4, D49, D54 |
| C14 ✓ | **Bird form as a quest reward**: no trainer sells it; the fitting house (the hidden Undercroft, animism) asks a task worth it, made by the VGM (D52: seen, not handed out as a list), and the change of shape is its reward | Test: bird form can only be gained through its task; a GPU shot of the first change after the task | 10, D49, D52 |
| C15 ✓ | **The capital** (D41): the first city of the world, placed by the VGM where the road network leads (a few km from the start town), on the one town core (B3a) with districts, a wall and gates, a market, the big guild halls and a seat of rule; the budget of D41 holds (30 full, 100 middle) | Test: the capital is a decision in the log and replays; F2 and F4 hold in a GPU shot in its market; the loop check runs an evening there | 7, 9.3, D41 |


C15 built 2026-10-28 (AG #126/#127, MW #270/#271): the classic region fill `capital` founds one walled city 4–7 km out (a decision in the log; `test/capital.test.ts`), about 700 buildings and 2650 people, a gate on every road, a seat of rule with towers and banners in a paved court, guild halls, an armourer and a jeweller; every town's fixtures (stalls, well, benches …) are drawn now. `npm run shot:capital` on the RTX 5070: playable in 15.8 s, market p50 10.2 ms, 0 shader violations; `npm run loop` plays an evening there. Known: the worst frame coming in is about 47 ms (its people are built at once), the gateway is a plain opening (no arch or gates yet).

Built ahead of phase C (Arnd asked by name, 2026-10-27): **bird form**, a taught change of shape (the hero becomes a pheasant and flies; design section 10), and the **action bar** (ten slots, always shown, arranged in the ability book; 17.1) that C1's abilities will sit on. C3 gives bird form a teacher: the hidden Undercroft (C3 part 1, 2026-10-27).

Gate C (passed 2026-10-28; passed again after C13–C15 on 2026-10-28): a fight with magic in the F1 set, the loop check with a mage hero, every VGM tool in the toolbox and in vgm.md (C6b, C6c), no need overdue more than 5 minutes in the loop check (C9), the review.

### Phase L: The land at every scale (Arnd, 2026-10-28; before phase D)

Goal: the land has something to look at every minute of a walk, and not every stretch of country is the same. The start lies in a mesa valley, the plateaus round it are reached by climbing or by passes, and caves are big.

This phase moves the ground that everything else stands on. The start moves, so old saves start a new game (as `startMoved` does since D50), and tests that name positions are checked again.

| Step | Delivers | Done when | Design |
|---|---|---|---|
| L1 ✓ | **Landforms** (D55): the landform shapes as data in the setting, a mix per biome, placed per cell from the seed and blended into `Terrain` (knoll, tor, dell with or without a pond, gully, ravine, ridge, scarp, sinkhole, dry valley, bank and sunken lane); the middle band of relief (200–600 m); towns, roads, rivers and places still sit right on it | Test: a 1 km walk in each lowland biome passes at least five landforms of three shapes, none in a town or a road bed; F4 holds (terrain worker time) | 5.9 |
| L2 ✓ | **Rock on the land** (D55, 5.6 layer 3): outcrops, boulders, erratics, scree and slabs as rock meshes from a shared AssetGenerator package, scattered by the landforms' rules, with collision for the walker | F2 and F3 hold in a GPU shot of a tor and a boulder field; the walker cannot walk through a boulder | 5.6, 5.9 |
| L3 ✓ | **Landscape kinds and mesa country** (D55): a kind per stretch of country in the skeleton, as data; mesa country with plateaus 40–200 m high, cliff walls, talus, valleys and canyons, at least one pass per plateau | Tests: every plateau has a pass a walker can take; kinds change at believable borders; GPU shots of a mesa valley at noon and at dusk | 5.9 |
| L4 ✓ | **Climbing** (D56): the hero climbs where rock has holds, seen climbing (rule 11), with stamina and falls; the walker and the loop bot know climbable stretches and passes | Test: a bot reaches a plateau top once by a pass and once by climbing; a GPU shot of the climb | 5.9, 11.2 |
| L5 | **The start in a mesa valley** (D56): the setting asks for a mesa valley with a river; the start town, the arch, the hold and the first places are sited there; the title fly-over still works | Test: the start town stands on a valley floor by fresh water with plateaus in view; the F1 set and the loop check pass on the new start | 6, D50 |
| L6 | **Real caves** (D57): cave dungeons that are big (caverns tens of metres high, several chambers, ways that climb and drop, water), with mouths in cliff faces and mesa walls as volumes; some caves are sights without dwellers; the B5 cave grows | Test: a cave's main cavern is over 20 m high and its ways over 200 m long; the variety sweep covers it; a GPU shot inside a cavern and of a mouth in a cliff | 5.6, 8, D57 |
| L7 | **More landscape kinds** as data (rolling downs, moor with tors, karst, badlands …), each with its landform mix | Test: each kind is found on a long walk; a GPU shot of each | 5.9 |

Gate L: the F1 set adds the mesa valley, a plateau top, a climb, a tor with boulders and a cavern; a walk trace shows a landform at least every minute of walking; F2 and F4 hold; the loop check passes on the new start; the review.

### Phase D: Seas (milestone 7)

Coasts, boats and islands as section 13 describes. This is planned in detail when phase C closes.

### Later (milestone 8)

The LLM hook (15), multiplayer (14), crafting (D32). These are not planned until Arnd opens them.

---

## 5. Long-term goals across phases

The design's long-term goals (11.3) land in phases like this, so the VGM can tie promises to them as they appear:

| Goal | First appears |
|---|---|
| Standing with each people | B4 |
| Mastering skills | Now; schools in C2 |
| Legendary items | Now (rarity); abilities C5 |
| The mystery of the Fading | Lore hints from B6 (events), teachers in C3 |
| The giants in the far mountains | B1 (a giants' region at the edge) |
| A house of your own | After A2 (money); placed in phase B |

---

## 6. Open list

Things seen and deliberately not in a phase yet. Each has a reason.

| Item | Why not now |
|---|---|
| Other factions (Temple, the watch, a thieves' ring) | After peoples (B4) work; guilds are B3b |
| freeryder / free LLMs (O15) | Parked by Arnd |
| Companions (animals, elementals, summons) | After magic (C), since summons need it |
| A hedge witch who teaches | Her cottage is C3 (D49) |
| Interiors rework (ceiling joists cross the wall tops, dim rooms) | Seen at gate A; looks, not function. Before gate B's shots |
| Rare one-frame hitches: a region opening (7–47 ms), the first time a door opens a building (16–22 ms) | Seen at gate B; p95 holds at 18 ms. Moved to workers before gate C (2026-10-27): the frontier's look for a place (world worker), laying out places and sights, and a house's plan and open mesh (terrain workers); to be confirmed in the gate C walk |
| Talk framing outdoors: the camera looks down at a house wall with the speaker small in the frame | Seen at gate B after #203; the speaker is now in the shot |
| The horse reads coarse (flat body, flat white saddle pad) | Seen at gate B; looks, not function |
| Leaf litter has bright green blotches like texture splats | Seen at gate B |
| Loop check: the hamlet summary says "0 copper earned" though the purse ends at 511 | Seen at gate B; a counting bug in the summary only |
| Hurt traveller: on all fours (no lying or sitting-on-the-ground clip); the cry's bubble floats about two body heights up | Seen at gate C; reads, but a clip and a lower bubble would read better |
| Town in the evening: p50 11–12 ms, at the 12 ms aim (was 13–14 at the first gate C); title 14.6 ms and hold-crag 12.9 ms are over it | Seen at the second gate C; F2 floor met |
| Long-ride hitches of 100 ms and 83 ms at 0.5–0.7 km (walk.mjs, 25 m/s) | Seen at gate C; rare, on horseback only |
| A sight found is described in a note ("A ring of standing stones…") | Seen at gate C; its lore can't be shown, but the note could wait for a closer look (rule 11) |
| Capital gate: a square opening under a lintel, no arch and no doors | Seen at the second gate C; doors should swing shut at night (rule 11) |
| Capital feel: the market looks like the first town's (two-storey houses, four people in sight) | Seen at the second gate C; taller, denser houses near the market and more cheap folk where the hero looks, within D41 |
| Grass tufts grow through the capital seat's paved court | Seen at the second gate C |
| One 40–47 ms frame on first walking into the capital (its 2650 people built at once) | Seen at the second gate C; build them over several frames |
| Talk: the person spoken to may sit behind a barrel or on the ground; "You hold out your map…" narrates the map hand-over | Seen at the second gate C; a standing pose and a shown hand-over (rule 11) |
| Barrow nits: straight slab edges close up, a crease where bank meets mound, a yellowish patch at the foot | Seen at gate A after #149 |
