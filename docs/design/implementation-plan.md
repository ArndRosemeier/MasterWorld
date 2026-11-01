# MasterWorld: implementation plan

What gets built, in which order, and when a step counts as done. The design is [masterworld-plan.md](masterworld-plan.md). This file only decides the order and the bar, and it points to the design for everything else.

Status: **2026-10-26.** Written after the first review of the build (milestones 1–4 as first cuts, see the plan's status line). **Gate A passed on 2026-10-26** (review: `/mnt/project-files/masterworld/shots/2026-10-26-8ca069c-webgpu/gate-a-review.md` and the fixes after it). **Gate B passed on 2026-10-27** (review: `/mnt/project-files/masterworld/shots/gateb/gate-b-review.md`, final retake on 01ac13b in `/mnt/project-files/masterworld/shots/gateb-final/`). **Gate C passed on 2026-10-28** (review: `/mnt/project-files/masterworld/shots/gatec/gate-c-review.md`, retake on da14451 in branch `claude/gatec-shots`, `shots/gatec-retake3/`). **Phase C reopened on 2026-10-28** for C13–C15 (Arnd); **the second gate C passed on 2026-10-28** on 0654bdb (review: `/mnt/project-files/masterworld/shots/gatec/gate-c2-review.md`, shots in branch `claude/gatec-shots`, `shots/gatec2b/`). **Gate L passed on 2026-10-29** after one retake (review: `/mnt/project-files/masterworld/shots/gateL/gate-l-review.md`, shots in branch `claude/phaseL-gate-final2`, `shots/gateL-final2/`). **Gate W passed on 2026-10-29** after polish (Arnd: "fix lake and brook cut first"; review: Claude Doc "Gate W review: water after the land", shots in branch `claude/water-w-shots`, `shots/water/gatew4`-`gatew7`). **Phase W (water after the land, Arnd 2026-10-29) came before phase D**, and **phase G (levels and no skills, D58, D59) ran in parallel with it** (Arnd 2026-10-29: before more content is built the old way). **Gate G passed on 2026-10-30** (review: `/mnt/project-files/masterworld/shots/gateG/gate-g-review.md`). **Phase P (polish what is seen) followed** (Arnd, 2026-10-30); **gate P passed on 2026-10-30** on 94d6dc9 (Arnd: "good enough for now, we can always polish more later"; review: `/mnt/project-files/masterworld/shots/gateP/gate-p-review.md`, final run). **Phase D (seas) is next**, planned with D60 (ships, no rowing; aquatic form; water breathing).

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
| L5 ✓ | **The start in a mesa valley** (D56): the setting asks for a mesa valley with a river; the start town, the arch, the hold and the first places are sited there; the title fly-over still works | Test: the start town stands on a valley floor by fresh water with plateaus in view; the F1 set and the loop check pass on the new start | 6, D50 |
| L6 ✓ | **Real caves** (D57): cave dungeons that are big (caverns tens of metres high, several chambers, ways that climb and drop, water), with mouths in cliff faces and mesa walls as volumes; some caves are sights without dwellers; the B5 cave grows | Test: a cave's main cavern is over 20 m high and its ways over 200 m long; the variety sweep covers it; a GPU shot inside a cavern and of a mouth in a cliff | 5.6, 8, D57 |
| L7 ✓ | **More landscape kinds** as data (rolling downs, moor with tors, karst, badlands …), each with its landform mix | Test: each kind is found on a long walk; a GPU shot of each | 5.9 |

Gate L (passed 2026-10-29): the F1 set adds the mesa valley, a plateau top, a climb, a tor with boulders and a cavern; a walk trace shows a landform at least every minute of walking; F2 and F4 hold; the loop check passes on the new start; the review.

### Phase W: Water after the land (Arnd, 2026-10-29; before phase D)

Goal: all water (lakes, rivers, brooks) comes after the land is finished and folds into it: a lake only where the finished land holds one, its level at its rim, rivers in and out of it at that level, brooks and rivers on their valley floors. Seen at seed vj4985: a river ran through a lake raised far above the land, because lakes were decided as 2 km squares on a coarse grid before the landforms were added.

| Step | Delivers | Done when |
|---|---|---|
| W1 ✓ | **Measure the fit** (`npm run water:fit`): how deep brooks and rivers cut below the dry land, how many are raised above it, how many lakes leak | The numbers for four seeds, round the start and the nearest lake |
| W2 ✓ | **The land drains**: hollows of the finished big land are filled or breached as water would (breaching is cheaper), and drainage reads the land with those floors; brooks run on the ground they cross, not on a 250 m cell's blend | Raised brooks fewer at every place measured (16 → 10 %, 25 → 9 %, 11 → 4 % …); tests green |
| W3 ✓ | **Lakes from the finished land**: a lake only where a fine flood of the finished land finds a basin, its level its spill point, the outflow leaving at that level, rivers through it capped at its level | `water:fit`: no lake leaks, no lake above its rim; the vj4985 lake fixed in a GPU shot |
| W4 ✓ | **Fixes on the way** (MW #315-#317): a brook's level reads its own sediment floors; a lake's raised rim slopes away instead of a flat terrace; shore foam only near the shore | Gate W shots: no raised water, no visible trench, no foam band. The cut target was not met: brooks run on 250 m cells that cross the land's small ridges (median cut 10-20 m on three of four seeds) |
| W4b ✓ | **Valleys in the land** (Arnd, 2026-10-29: "carve valleys into the land first"): before any water, the land drains at the brooks' scale. A drainage on a fine grid (125 m or finer) of the finished big land; every hollow it cannot keep as a lake is breached along its way out, and along every way that drains a catchment a valley is carved, its floor and sides sized by the area drained (no steeper than about one in three). The valleys are part of the land itself, so towns, roads and landforms see them. | Tests: every way's floor falls downstream; valley sides no steeper than the limit; a brook tile is built in at most 0.8 s |
| W4c ✓ | **Brooks in their valleys**: brook courses are those ways, smoothed into curves, their level the valley floor | `water:fit` against the finished land: brook median cut under 2 m, raised under 3 %; the brook tests hold (curves, fords, ends in water) |
| W4d ✓ | **Rivers in their valleys**: the same at the rivers' scale, where a river crosses a ridge its cells did not see | `water:fit`: river median cut under 5 m |
| W5 ✓ | **The world after**: start towns, places and tests checked on the moved water; the loop check passes | Tests and `npm run loop` green |

Gate W: GPU shots of the vj4985 lake, a river into and out of a lake, and brooks in the start valley, seen as valleys; `water:fit` holds W3 and W4b-W4d; the loop check passes; the review.

**Gate W passed (2026-10-29)** on 56679f7. The polish Arnd asked for (MW #323-#330): no hollow is breached through a lake's wall (lake leaks 0 in all 8 squares); brook valleys come down to a lake's water, not below it (the squared notch is gone), with the brooks' floors and valleys leaving a lake's bed alone cell by cell; landforms and detail no longer raise the land over a brook (brook median cut 0.5-1.1 m in all 8 squares, was 1.3-3.1); surf rolls in only from the sea (the white line round the lake was surf bands standing still on its flat shelf). River median cut 2.4-4.9 m. Open, not water: the vj4985 lake's south cliffs are the mesa's own sheer walls, flat faces meeting at sharp corners (phase L's mesa wall), and one river bank by the vj4985 start is fairly steep.

### Phase G: Levels (Arnd, 2026-10-29; now, in parallel with phase W, before phase D)

Arnd, 2026-10-29: so much relies on this that it starts at once, before more content is built on skills and reputation.

Goal: the hero grows by levels, every kind of play counts towards them, and the level is the skill for every ability (D58, D59).

| Step | Delivers | Done when | Design |
|---|---|---|---|
| G1 ✓ | **Experience and levels** (D58): experience from fights (weighed by the foe's danger against the hero's level), places cleared, promises kept, people helped, bands beaten, guild tasks, discoveries, reading and learning; deeds and discoveries once each; levels 1–20 on a curve in the setting; health, stamina and mana per level; trainers ask a level instead of reputation (renown goes, the peoples' standing stays); saves carry experience over (old renown becomes experience); the target card reads levels; the loop bot levels | Tests: every source gives experience, a deed or discovery only once; a foe far below the hero's level gives next to nothing, so a bot killing rats for an hour gains less than one level past 5; a rank needs its level; the loop check with a fighter and a mage reaches level 3–5 in an evening | 11.4, D54, D58 |
| G1b ✓ | **No skills** (D59): skills retired from the setting, the character, saves (old skill values dropped, abilities kept), fights (weapon damage from weapon and level), magic (mana with the first spell, grows with level), the creator's backgrounds (kit, a first ability or two, acquaintances) and the loop bot; trainers and magic teachers teach abilities for coin at a level; the lessons window, ability book and target card read levels; no skill left in talk or UI | Tests: no skill in the setting contract or the character; every trainer's ability has a price and a level; an old save loads with its abilities; the fight balance tests still hold; the loop check with a fighter and a mage passes | 10, 11.4, D59 |
| G2 ✓ | **Abilities scale with level** (D58, D59): each ability's strength (damage, healing, duration, range where it fits) comes from the hero's level and gear, as data in the recipe format | Tests: the same ability at level 1 and level 10 differs as the setting says; the fight balance tests still hold (rats and goblins winnable at the start, spiders and the ghoul not) | 10, D58 |
| G3 ✓ | **The level celebration** (D58, rule 11): the warded-brass lines flare up from the ground round the hero in a rising ring of light, with a chime; the new number is engraved into the HUD; a short gesture when not fighting; never stops play; within the shader budget (F3) | A GPU shot of the ring at its height in the F1 set; F3 holds; test: a level gained mid-fight plays the ring without the gesture | 17.1, D58 |
| G4 ✓ | **Minimap, no orientation** (D59): the orientation skill and its blurred position go; the map shows the hero exactly; a round warded-brass minimap in the HUD (known land round the hero, roads, places, the NPCs' marks, the hero's arrow, the compass letters on its rim) takes the compass's place; within F2 | A GPU shot of the minimap in town and out on the land in the F1 set; test: the minimap draws only known land; F2 holds | 11.7, 17.1, D59 |
| G5 ✓ | **A task done is seen** (Arnd, 2026-10-29; rule 11, D52): a direct task (a promised place, a master's deed, a guild's task to clear one) ends in a moment the hero sees, not a line or a quest bar: once the last dweller falls, the one of the household the hero would report to comes to them. Under a house they climb down the cellar's ladder; out on the land one of them waited outside the way in (gone out there unseen) and comes in. They walk to the hero, thank and pay them in a speech bubble that wraps, and go back. Nobody comes: not done yet. Leaving first keeps the walk to their door. On-the-fly encounters stay as they are | `npm run shot:owner` (cellar and barrow) on the GPU: they come, thank, pay, the promise is kept, no 'quiet' line, the bubble wraps; tests: the visitor reaches the hero in the farthest room of a cellar and goes back, never through a wall; the household's one waits outside and goes home | 8.1, 11.2, D52 |
| G6 | **Ability points** (D61; Arnd, 2026-10-31, alongside phase D): one point per level, saved on the character; learning an ability at a trainer costs a point besides coin and level, and reading a writing needs a free point (the writing stays in the pack until then); deed gifts, worn items and background abilities cost none; the **potion of learning** (uncommon: in treasure, more likely deep and dangerous, not at traders) gives a point when drunk, shown with a fitting glow on the hero (rule 11); the lessons window and the ability book show free points and say why a lesson is refused; old saves get their points as D61 says; the loop check's fighter and mage spend points and still level as G1 says | Tests: points per level, refusal without a point, the potion, old-save points, the treasure tables carry the potion at the right rarity; the loop check passes; a GPU shot of the lessons window with points and of drinking the potion | 10, 11.4, D61 |

Gate G (passed 2026-10-30 on 6beb735, after the load and town-frame fixes #351/#352): no skill left anywhere (G1b); the loop check with a fighter and a mage levels as G1 says; the level ring and the minimap in the F1 set; F2, F3 and F4 hold; the review.

### Phase P: Polish what is seen (Arnd, 2026-10-30; before phase D)

Goal: what phases C to G built fast looks as good as it plays. These are the open-list items a player meets in every session, taken in before the seas.

| Step | Delivers | Done when | Design |
|---|---|---|---|
| P1 ✓ | **Caves that feel natural** (D57): caverns with uneven floors (rubble, fallen blocks, steps of rock, pools), wall feet that curve into the floor, stalagmites and stalactites where it is wet, water (a pool, a trickle, a stream through a way), a light shaft from the surface in some caverns, a lantern pool that reads; no straight wall feet or streaks | GPU shots of a cavern from the floor and from above, of water in a cave and of a light shaft; the cave tests and the variety sweep still pass; F2 holds below ground | 5.6, 8, D57 |
| P2 ✓ | **A rock material**: one rock look for tors, outcrops, boulders, cliff and mesa walls, climb faces and cave mouths (strata and joints where it fits, lichen and weathering, no cracked-mud pattern, no comb stripes), within the shader budget | GPU shots of a tor, a mesa wall, a climb face and a cave mouth; F3 holds (no new shader kind past budget) | 5.6, 5.9, SHADERS.md |
| P3 ✓ | **Landscape kinds on foot** (D55): each kind's ground and plants read as that kind at hero height: heather and peat and tors on the moor, banded clay and gullies in badlands (not dunes), clints and grikes in karst, short turf and chalk on the downs; the start valley floor grass and gravel, not desert ripples | A GPU shot of each kind at hero height; Arnd's eye on the moor and badlands | 5.9 |
| P4 ✓ | **The capital looks like a city** (D41, C15): gates with doors that swing (open by day, shut at night; rule 11), a taller and denser core round the market, more people in sight at the market by day within D41, no grass through paving; the first walk in builds its people over several frames (no 40–47 ms frame) | GPU shots of a gate open and shut and of the market by day; F2 holds there, worst frame coming in under 25 ms | 7, D41 |
| P5 ✓ | **Small things seen every day**: shadows of moving people and the hero don't judder now the sun's shadow map is drawn every third frame (fix if they do); in talk the person spoken to stands or sits properly, and the map hand-over is shown, not narrated | A slow-motion capture or frame pair of a walking townsperson's shadow; a GPU shot of talk with the person standing | 9.1, 11.7 |

Gate P (**passed 2026-10-30** on 94d6dc9, Arnd's eye; F2 town under the aim, cave mouth 12.7, capital market 13.4, seat 12.2 ms; F3 0 violations; F4 capital 17.7 s): the F1 set adds the cavern from the floor, water and a light shaft in a cave, a mesa wall in the rock material, the moor and badlands at hero height, and the capital gate and market; F2, F3 and F4 hold; Arnd's eye on the shots; the review.

### Phase D: Seas (milestone 7; Arnd, 2026-10-30, D60)

Goal: the sea becomes a place to go. Harbours, ships and islands beyond the fog are the VGM's largest frontier (13). There is no rowing boat (D60): the hero rides ships, walks around on them, and goes under water by spell, potion or aquatic form. Steps are named S1 and on (for seas), so they don't clash with the decisions; PR lines read `PLAN: S3 ship`.

What is already there: coasts in the skeleton, Gerstner-wave seas with swell and shore foam, swimming and diving, the underwater view (D25), bird form's change of shape (C14).

| Step | Delivers | Done when | Design |
|---|---|---|---|
| S1 ✓ | **The sea in the floor**: the coast, a beach, a sea cliff and the underwater look in the F1 land run; any gaps against D25 (foam, depth colour, the waterline at the camera) fixed first | F1 coast and underwater shots within F2 and F3 | 13, D25 |
| S2 ✓ | **Harbour towns, the whole harbour** (D60): settlements where a river meets the sea (D50: the river is the fresh water) on the one township core (B3a), with quays, piers, ships at their moorings, cargo carried and craned aboard and ashore, a fish market, a sailors' tavern, fisherfolk and dockhands with routines, and a harbour master; fishing boats go out at dawn and come back (world simulation, no hero boat). Regions opened towards the coast can make one (a VGM tool) | Test: a region by a river mouth gets a harbour town; the loop check runs an evening in one; GPU shots of the quay by day and the tavern at night | 6, 7, 13, D50 |
| S3 ✓ | **The ship** (D60): a sailing ship that is good to walk around in: deck, rigging, a hold with cargo, cabins, a galley and a captain's cabin, hero-class look; it rides the swell and the hero walks, climbs ladders and stands at the rail on it as it moves (physics on a moving deck, the camera steady); its crew works (sails set and furled shown, the helm, the lookout), and other passengers are aboard, people from the world simulation travelling with their own reasons, who can be talked to | GPU shots on deck under sail, below deck, and of passengers; F2 holds aboard; a walk test on a rolling deck (no falling through, no sliding) | 9.3, 13, D25, rule 11 |
| S4 ✓ | **The voyage** (5.4, 4.4): passage bought from the harbour master (or a captain in the tavern), boarding by the gangplank, casting off, the crossing played aboard with time running faster at sea and a cabin bunk to sleep through it, docking at the far harbour; the Builder outlines and builds the far harbour before the ship arrives, the way the cart between inns works (C7). No teleport, no fade past the crossing (rule 11) | Test against 5.4's numbers; the far side is built before arrival; a loop-check voyage between two harbours | 4.4, 5.4, 13 |
| S5 ✓ | **Breathing under water** (D60): a water-breathing spell in a fitting school and a potion (sold by a harbour herbalist, found in the treasure), lasting minutes; breath while under otherwise; every ability works under water in the hero's own form | Test: breath runs out without it and holds with it; a GPU shot casting under water | 10, 11.4, D25 |
| S6 ✓ | **The aquatic form** (D60): a second change of shape beside bird form, a sea animal from the library (seal, otter or dolphin, whichever Actors or the animal packs have best), changed into in water with its own shown change, swimming fast and diving deep, breath much longer; taught or gifted like bird form (a deed, a hidden teacher). **No other ability works in any animal form**: the action bar shows only the change back in bird and aquatic form | Test: no ability but the change back in either form; GPU shots of the change and of swimming in the form | 9.3, 10, D60 |
| S7 ✓ | **Islands as promises**: islands across the sea in the skeleton, opened as regions when the VGM promises one ("sailors talk of an island beyond the fog"). Told in a harbour (D52: a sailor's talk, a wreck washed up), reached by ship, mostly places to explore with at most a small fishing village, with a place on it from `dungeonFor` | Test: an island is promised, told and reached, and the log replays it | 4.2, 5.5, 13 |
| S8 ✓ | **Places by and under the sea**: sea caves, wrecks and sunken ruins as dungeon kinds added as data (C6c), reached on foot at low water or by diving (spell, potion or aquatic form) | The variety sweep covers the new kinds; an underwater shot inside one | 8, 13 |
| S9 ✓ | **Sea life and encounters**: gulls, seals and fish (small life); sea creatures under water, smugglers' coves on the coast (`encounterFor`); situations by the sea (D52: a cry from the water, a wreck washed up). No fights aboard a ship yet (D60) | The encounter sweep includes the sea; a situation by the sea in a shot | 4, 9.3, D52 |
| S10 ✓ | **Sea weather and sound**: storms at sea with swell and wind (D26), surf, gulls and creaking timber aboard; a storm makes a crossing rough (the ship pitches, the crew reefs sails) and the VGM can delay a ship in harbour | A storm at sea from the deck in the F1 set within F2; a crossing in a storm is delayed | 5.8, 16, D26 |

Gate D: an evening in a harbour town in the loop check, a voyage to a promised island played aboard with passengers, an underwater place reached once by spell or potion and once in the aquatic form, F1 to F4 with the new shots, Arnd's eye on the shots, and the review.

Later (D60): activities aboard, fights at sea (boarding, a creature attacking a ship), owning or sailing a ship.

### Phase Q: Quests that vary (Arnd, 2026-11-01, D62; now, in parallel with phase D)

Goal: what the hero is asked to do stops being "clear place X, tell the one who asked, get coin". Fully procedural (D62: no LLM). D52 holds: few quests, situations from the world, no quest hub. Each new verb is a VGM tool in `src/vgm` with its row in vgm.md (rule 10), and every task counts only the thing it names (D62).

| Step | Delivers | Done when | Design |
|---|---|---|---|
| Q1 ✓ | **New verbs on the existing places**: find a lost person (alive or not, brought home or their fate told), fetch an heirloom (one named thing in one place), parley with dwellers who are not hostile (talk instead of a fight, a price or a promise), seal something (a breach, a tomb, a shrine, shown being sealed, rule 11), guard at night (a watch at a farm or a gate, the threat comes or doesn't), find out who is stealing (clues in the town, the thief named and caught or let go). They combine with the place kinds (C6c) and with who asks (people, trade, standing) | Tests: each verb made, told, done and judged only by its named thing; the loop check meets at least three verbs in one run | 4, 9.1, D52, D62 |
| Q2 ✓ | **The VGM remembers what it gave**: the kind of the last tasks is kept in the save and weighed against, so the same kind does not come twice in a row and a kind comes back only after others | Test over many seeds: no kind twice in a row; the spread of kinds over an evening of play | 4, D53, D62 |
| Q3 ✓ | **Twists**: the client lies, someone got there first, the place changed since it was told; seen in the world and in talk, not as a note | Tests per twist; a shot of one | 4, D52 |
| Q4 ✓ | **Consequences**: how a task ended feeds the next situation (a parley kept makes a later visit friendly, a thief let go comes back, a sealed tomb stays shut) | Test: an ending changes what the VGM makes next, and the log replays it | 4, D52 |
| Q5 ✓ | **Causes from NPC wants**: tasks arise from what people in the world simulation want or lack (a farmer's lost herd, a widow's ring, a rival trader) rather than from a table | Test: a task traced back to an NPC's want in the log | 4, 9.1 |

Gate Q (**retake 2026-11-01 after #472: passes on the logic and the numbers; the Q2 repeat was a story event's cave, not an ask, and the loop now fails any repeated ask in a natural run (#475); waits only on Arnd's eye on the three shots**; review `/mnt/project-files/masterworld/shots/gateQ/gate-q-review.md`) (Arnd: "lets tackle all of that now", so all five steps): the loop check plays an evening with three different verbs and no kind twice in a row, meets a twist, and replays a consequence and a task caused by an NPC's want from the log; GPU shots of a parley, a seal and a night watch; F1 to F4; Arnd's eye; the review.

Built (2026-11-01, MW #457 to #464): all five steps. `npm run loop` prints `gate Q: met` for a run that has three kinds of task, none twice in a row, a twist, a consequence and a want, and each evening checks that the endings and wants read back from the log (two of the eight runs meet it). The plan thread's review (2026-11-01) found three of the six verbs and all but one kind of want missing in the runs; fixed: five kinds of want (`rival`, `elder`, `parent`, `pious`, `peaceable`), coverage runs that ask one kind only (`only`), the night watch widened to the dead and smugglers, and the loop now fails when a verb, three kinds of want, the three twists (first, changed, lied) or a run meeting gate Q is missing. GPU shots of a parley, a seal and a night watch were taken on Arnd's PC (`tools/shot/asks.mjs`, which now prints F2 and F3 per scene). Still open for the gate: F2 to F4 numbers, Arnd's eye.

### Phase K: Caves that form (Arnd, 2026-11-01, D63; K1 and K2 now, next to phases D and Q)

Goal: natural caves stop being rooms and passages. They form from rock and a process (water, lava, people after ore), and the game reads where one can go from the rock itself. The design is in [caves.md](caves.md). K1 and K2 are preview only, with Arnd's eye on many seeds before anything goes into play (hands-on design, Arnd's wish).

| Step | Delivers | Done when | Design |
|---|---|---|---|
| K1 | **The rock block and the preview**: geology from the land's kind (layers, joints, faults, ore bodies, groundwater from the real heights above); every size and share as a constant in the setting's cave data (Arnd: easy to change); a preview tool that forms and renders a cave alone (slices and the mesh, in the cloud) and a gallery page of seeds | Tests: the block is seeded and pure; a gallery of 12 seeds' rock blocks | caves.md 3.1 |
| K2 | **The solution former**: flow from sinks to springs on a coarse lattice, widening by flow, collapse voids, tube, canyon and keyhole sections, levels as the water table drops; the carver turns it into the field (sparse bricks, surface nets) | A gallery of 24 seeds and three rock settings (branchwork, maze, braids); **Arnd's eye on the gallery** before K3; forms and carves in under 3 s in a worker | caves.md 3.2, 3.3 |
| K3 | **The dresser**: silt floors, breakdown and rocks, streams along the flow lines, pools and rimstone, drips from ceiling joints with stalactites over stalagmites, flowstone; dead formations on dry levels | Gallery shots from the floor in the preview; the floor is level on under a tenth of standable ground | caves.md 3.4 |
| K4 | **The reader and the concession**: standable ground from the field, links (walk, step, climb, drop, swim; no squeezing, every way at least the hero's standing size), the network, places (voids, alcoves, junctions, ledges, depth), and the concession that opens cut-off parts | Tests: every seed of the gallery has its main part reachable from the way in; places found per seed; under 1 s per cave | caves.md 3.5, 3.6 |
| K5 | **Formed caves in play**: walker, creatures, minimap, save and bot on the network; sinkholes and spring mouths as ways in (portals); daylight shafts; drip and stream sounds; the old natural caves replaced (sea caves too) | The loop check delves formed caves; GPU shots from the floor, of a stream and drips, and of a daylight shaft; F2, F3 and F4 hold below ground and at load | caves.md 5 |
| K6 | **Content in places**: lairs, treasure and set pieces placed in places, danger by depth; natural locks (sump, climb, chasm, choke dug through on screen); the VGM `cave` tool asks for size, danger and the three shares (built, water, lava; pure is the norm, at most two filled) (row in vgm.md) | The variety sweep covers formed caves; tests for each lock; the loop check meets a sump and a climb | caves.md 3.7, rule 10 |
| K7 | **Lava tubes**: volcanic country as a kind of land (cinder cones, lava fields, basalt) where the skeleton allows; the lava former traced down the land surface; arches, ledges, set lava floors, lava drips, braids and stacked tubes; skylights as ways in and light | Gallery, then GPU shots of a skylight from inside and of a tube from the floor; the loop check delves one | caves.md 3.2, 4 |
| K8 | **Mines**: ore bodies in the rock block; the mine former (adit or shaft, drifts, crosscuts, stopes, winzes) with the built rooms near the entrance; tool marks, timbering, rails, carts; ore veins showing in the walls (only for show, no mining); break-throughs into water or lava caves by the shares | Gallery, then GPU shots of an ore vein, a stope and a break-through into a natural cave; the loop check delves one | caves.md 3.2, 3.3 |

Gate K: Arnd's eye on the K2 gallery (passed before K3); in play a solution cave, a lava tube and a mine, and a mixed cave of two shares (a mine broken into a solution cave, or a lava tube a stream found) in GPU shots from the floor, with water and drips, a skylight and an ore vein; the loop check delves each kind; F1 to F4 hold; the review.

### Parked: dialog needs a lot of love (Arnd, 2026-10-31)

Talk with NPCs works but does not read well yet. Arnd: "The dialog is not good yet anyways. Lets park that for now but put it in the plan. Dialog needs a lot of love." It is planned in detail when Arnd opens it, after phase Q. Already seen:
- **Feasts stack in talk.** After two deeds (the bandits and the cellar), the town's people speak of two feasts at once. Talk should know one day's events as one thing (one feast for both deeds, or the second on another evening, `vgm/festivities.ts`), and lines about the same event should not repeat across topics.
- What talk says should come from what the speaker knows and has seen (9.1, D52), in a voice that fits the person (people, trade, mood), with fewer stock lines and no topic list that reads like a menu. Procedural only (D62: no LLM).

### Later (milestone 8)

Multiplayer (14), crafting (D32). These are not planned until Arnd opens them. The LLM hook (15) is dropped (D62).

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
| ~~freeryder / free LLMs (O15)~~ | Dropped by D62: no LLM support |
| Parley side camera frames the hero poorly | Left from gate Q; small, after the gate |
| Parley and thief (and the "lied" twist) come up only in forced coverage runs, never by chance | Seen at gate Q; their conditions and weights need a look so players meet them |
| WebGPU playable in 17.6 s (limit 20 s) | Seen at gate Q; close to the limit, check before more load-time work lands |
| `npm run loop` takes 143–226 s in CI for 12 runs (warns at 60 s, fails at 300 s) | Seen at gate Q; close to the limit, needs a look before more runs are added |
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
| One 40–47 ms frame on first walking into the capital (its 2650 people built at once) | Seen at the second gate C; build them over several frames |
| Perched brooks (about 12 %); the F1 set stalled on a late page in 2 of 8 runs | Seen at gate L |
| Barrow nits: straight slab edges close up, a crease where bank meets mound, a yellowish patch at the foot | Seen at gate A after #149 |
