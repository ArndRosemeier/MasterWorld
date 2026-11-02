# The leak from the first world: the plague and the giants

Design from the talk with Arnd on 2026-11-02 (plan thread), with his answers of 17:12. Decision D67 in [masterworld-plan.md](masterworld-plan.md). Steps are in [implementation-plan.md](implementation-plan.md), phase M. Nothing here is built yet.

## 1. The idea

**The first world is the source of all magic.** Three hundred years ago magic drained out of our world (the Fading, D43). Now it is coming back through **Bright spots**: tears between the worlds, viewports into a far more colourful world. Other things come through with it:
- **seeds**, which have already taken root;
- **small first-world creatures**, which slip out now and then.

Both are unlike anything of this world: very colourful plants and animals with a faint glow.

**Eating them changes a being.** A deer that grazes the bright plants, or a wolf that eats a stray or a changed deer, slowly **mutates**. It grows bigger and twisted, with a wrong skin and a wrong gait, and it turns hostile to everything.

The changed ones **wander**. That carries the plague, and the seeds caught in their coats, far from where it began. So the plague is not confined to one area: twisted creatures turn up anywhere, but most of them are round the **origin area** of a Bright spot.

**Any creature or person can catch it**, animals, monsters and people alike; twisted giant humanoids are part of it. **The hero never does** (Arnd: the plague spreads by eating, and the hero does not eat in the game).

Arnd: "We can later expand into actually visiting the first world, that could be a high level thing... not now though."

## 2. Arnd's points

- The first world is the source of all magic; it drained and is coming back through those cracks (named **Bright spots**).
- Small first-world animals can escape, and plant seeds already did.
- Affected beings mutate into twisted, giant versions of the original. They spread, not just in one area, with an origin area holding more of them.
- **Actors gets a Deform function** that mutates the bones and textures of an actor (humanoid or animal) and twists standard animations. The animations must still work, but become awkward.
- **Giant versions of our established creatures** are a cheap win on top. The same function delivers them without twists, but not as a mere upscale: modified textures and bones.
- Anybody can catch it. "Twisted giant humanoids will be great to have." But not the hero: "since we do not have eating in game yet and this is spread by eating... lets not have the hero get it at all."
- The cracks are called **Bright spots**: viewports into a way more colourful world.
- **No Bright spots at the start.** Twisted creatures can appear without them. The Bright spots exist, but the player can't find them at first; the VGM decides later when and where to place one. That is content for level 6 and up; weaker twisted creatures can come earlier.
- **Peaceful giant animals from the start**, such as a giant turtle, as a promise.
- **Fighting it back is a second step.** Closing a Bright spot needs a plug that only one mage in the capital can provide, "or something like that". It must not be an easy ability.
- **NPCs must convey it.** This is where the dialog work comes in (section 7). Not LLM dialog and no free chat, just better than now: people who differ.

## 3. Deform in Actors (the new system)

Deform is a function in Actors, not MasterWorld (Actors is the source for creatures). It takes three inputs:
- **a recipe**, as data: `giant`, `plague`, and later others;
- **a seed**, so the same creature always deforms the same way;
- **a strength** from 0 to 1, so a creature can worsen over days.

It works on generated people and on the library animals (wolves, deer, boars), which carry skin weights too.

It builds on Actors' existing shape pass (`core/deform.ts`), which already scales each bone's length and girth, pulls regions out into points (an elf's ear) and scales the whole actor. That pass is how dwarves, elves and giantkin are made.

| Layer | Giant recipe | Plague recipe |
|---|---|---|
| **Bones** | Square-cube proportions: legs and neck thicker for the weight, a heavier jaw, a head a little smaller for the body | Uneven per-bone scales: one limb long and swollen, a hunched spine, a stretched jaw; growths and spikes pulled out of the skin |
| **Skin** | Detail kept sharp at size, not a stretched texture: scars, a greyed muzzle, torn ears, the look of age | Blotches and veins in first-world colours, spreading from the mouth and gut as the strength grows; a faint glow |
| **Movement** | Clips played slower for the size, heavier steps, deeper sounds | A twist layer after the clip: crooked joints, a dropped shoulder, a limp where one leg lags, twitches. The clip still plays underneath |

Rules:
- **Seeded, no `Math.random`.** The same seed and strength always give the same body.
- **The skin is one shared material driven by numbers** (recipe, strength, seed), so every deformed creature uses the same shaders and no new ones are compiled (SHADERS.md).
- **A deformed body is built off the render path**, like any actor look (prepared, then swapped).
- **What may break:** long legs may slide their feet without foot planting, held weapons need the hand's new size, and giants need room. Giants keep to the open land and big caves, never cellars.

## 4. In the world

### 4.1 Bright spots

A Bright spot is a tear between the worlds, a **viewport into a far more colourful world**: through it the player sees the first world, brighter and stranger than ours. It uses the portal's real viewport (MW #364), so it is seen through from both sides. Nobody walks through yet (visiting the first world is later and high level).

**There are none at the start.** The VGM places them later, as a tool in `src/vgm` (D51), deciding when and where, as content for **level 6 and up**. Round each lies its **origin area**, where the bright growth is thickest and twisted creatures gather. Once seen it gets its mark on the minimap and map (D66).

### 4.2 The bright growth

First-world plants are very colourful, slightly glowing, and unlike any plant of this world. They grow densest round a Bright spot and thin out with distance. Before any Bright spot exists, a few patches already grow in the land from seeds that came through long ago. New patches start where twisted creatures have been, because seeds are carried in coats and dung. The growth spreads over days of world time, seeded and saved; it does not change while the hero watches.

### 4.3 Strays

There are a few kinds of small first-world creatures, data in the setting, colourful and quick. They are mostly harmless prey, found near Bright spots and bright patches.

### 4.3a Twisted creatures before any Bright spot

Twisted creatures appear before any Bright spot does. The VGM places them like other foes, by danger and the hero's level (D29, D58): **weakly twisted** ones (a low Deform strength, a little bigger and meaner) from the early levels, worse ones further out and later, and the most round a Bright spot once one exists.

### 4.4 Mutation

Every being carries a **taint** from 0 to 1:
- grazers raise it by eating bright plants;
- hunters raise it by eating strays or tainted prey;
- people raise it by eating bright fruit or tainted meat (a herder's family eating from a turned flock).

The taint is the Deform strength. Past a threshold a creature:
- turns twisted;
- grows bigger and more dangerous (its danger rises with the taint);
- joins the **blighted** faction, hostile to all (D65).

This uses the existing creature simulation: herds graze, packs hunt (R5), and territories drift.

### 4.5 Spread

Blighted creatures leave their territory and wander. That is how the plague turns up far from any Bright spot, and how new bright patches start. A world simulation drives it, not the VGM. The VGM may use it, for example by sending blighted wolves into a town (R6's raid) or by asking a household for help when its herd turns.

### 4.6 People

**Anybody can catch it.** People turn into **twisted giant humanoids**: a farmer, a bandit, a hermit who ate the wrong fruit. They join the blighted faction like the animals. A town may lose someone to it, which the VGM can use (a household asking for help, a missing son seen in the woods).

**The hero does not catch it** (Arnd, 2026-11-02): it spreads by eating, and the hero does not eat in the game.

### 4.7 Giants without the plague

**Giant versions** of the established creatures are a cheap win, in two kinds:
- **Peaceful giants from the start**, as a promise of what the world holds: a **giant turtle** by a lake or shore, a giant elk or ox grazing on the far side of a valley. Seen early, not hunted for loot. The turtle is a new library animal in Actors.
- **Hostile giants**, rare: a giant boar, a giant wolf leading a pack, a giant spider deep in a cave.

Rules for both:
- They use the giant recipe, with no twist. A giant is just big; a twisted creature is changed.
- They are placed far out and deep by danger (D29), never as a scaled number on a normal one.
- They are their own creature kinds in the setting, so they keep their own loot and danger.

## 5. How the world tells it

Show, don't tell (rule 11, D52), but this needs people to explain it:
- **Seen:** bright patches, strays, twisted animals and people, the Bright spots themselves.
- **Said:**
  - herders whose sheep went strange;
  - hunters who saw a wolf "wrong in the shoulders";
  - the innkeeper's rumours, thinning with distance from the plague;
  - one scholar or mage in the capital who knows what the Bright spots are, the seed of the later plug.

What people say comes from what they have seen and how near the plague is. This needs the dialog work (section 7).

## 6. Later (second step and beyond)

- **The plug.** Closing a Bright spot needs something only one mage in the capital can provide, earned through a story, not bought or learned as an ability. Once a Bright spot is closed, its bright growth withers and its area slowly heals.
- **Cures and burning**, if wanted.
- **Visiting the first world**, a high-level thing.

## 7. Dialog: people who differ

Arnd: "I do not mean LLM dialog though, just better than we have now. Right now, NPCs are practically interchangeable." No free chat either. This is phase N in the implementation plan (D68): each person differs in who they are, what they know and have seen, and how they say it, using much more of the Conversations package than the game uses today. The plague is told through it (step M7).

## 8. Open questions for Arnd

1. Names for the growth, the strays and the twisted (working names: bright growth, strays, the blighted).
