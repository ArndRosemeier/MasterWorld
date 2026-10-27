# MasterWorld: implementation plan

What gets built, in which order, and when a step counts as done. The design is [masterworld-plan.md](masterworld-plan.md). This file only decides the order and the bar, and it points to the design for everything else.

Status: **2026-10-26.** Written after the first review of the build (milestones 1–4 as first cuts, see the plan's status line). **Gate A passed on 2026-10-26** (review: `/mnt/project-files/masterworld/shots/2026-10-26-8ca069c-webgpu/gate-a-review.md` and the fixes after it). **Gate B passed on 2026-10-27** (review: `/mnt/project-files/masterworld/shots/gateb/gate-b-review.md`, final retake on 01ac13b in `/mnt/project-files/masterworld/shots/gateb-final/`). **Current phase: C.**

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
| F1 | **Standard shots.** One script takes the same set on a GPU: title, the creator, town at noon, dusk, night and in rain, a cellar, a barrow, the wild, a fight, the pack, the map, the trade window, talk. They are saved with the commit hash. | `npm run shot:set` (`tools/shot/set.mjs`, built in A1). Run at every phase gate and after visual PRs. |
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
| C3 | **Unlock sources** (D49): the magic teachers open a school at rank 0 and its abilities by rank, like the guild houses; the hedge witch's cottage and the warden of the half-ruined tower teach, and a hidden house underground that the hero must find (D49); tomes, scrolls, items and deeds are rare extra ways to an ability | Tests per source; a fresh hero with no magic asks the bard, finds a teacher and casts a first spell on the first evening; the loop check with a mage hero | 10, D11, D49 |
| C4 | **Spell effects** within the shader budget (F3), compiled before first use | F3 passes in a fight with every school | SHADERS.md |
| C5 | **Rare item-only abilities** on items (D31) | A legendary item with its ability in the F1 pack shot | 11.5 |
| C6 | **Story events**: a raid on a farm, bandits taking a waystation, a dungeon's dwellers moving out to the land; the town shows what happened | Test: an event's ledger entry changes the world and the leads | 4.2, 11.3 |
| C7 | **Travel**: horses on roads, fast travel rules, time passing as designed | Test against 5.4's numbers | 5.4, D37 |

Built ahead of phase C (Arnd asked by name, 2026-10-27): **bird form**, a taught change of shape (the hero becomes a pheasant and flies; design section 10), and the **action bar** (ten slots, always shown, arranged in the ability book; 17.1) that C1's abilities will sit on. C3 gives bird form a teacher: the hidden Undercroft (C3 part 1, 2026-10-27).

Gate C: a fight with magic in the F1 set, the loop check with a mage hero, the review.

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
| The capital | Prepared in B3, placed once a road network exists |
| Companions (animals, elementals, summons) | After magic (C), since summons need it |
| A hedge witch who teaches | Her cottage is C3 (D49) |
| Interiors rework (ceiling joists cross the wall tops, dim rooms) | Seen at gate A; looks, not function. Before gate B's shots |
| Who teaches bird form (built 2026-10-27, opened only by the debug menu) | Its teacher comes with the magic teachers (C3) |
| Rare one-frame hitches: a region opening (7–47 ms), the first time a door opens a building (16–22 ms) | Seen at gate B; p95 holds at 18 ms. Move to a worker or spread over frames before gate C |
| Talk framing outdoors: the camera looks down at a house wall with the speaker small in the frame | Seen at gate B after #203; the speaker is now in the shot |
| The horse reads coarse (flat body, flat white saddle pad) | Seen at gate B; looks, not function |
| Leaf litter has bright green blotches like texture splats | Seen at gate B |
| Loop check: the hamlet summary says "0 copper earned" though the purse ends at 511 | Seen at gate B; a counting bug in the summary only |
| Barrow nits: straight slab edges close up, a crease where bank meets mound, a yellowish patch at the foot | Seen at gate A after #149 |
