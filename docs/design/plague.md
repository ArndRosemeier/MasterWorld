# The leak from the first world: the plague and the giants

Design draft from the talk with Arnd on 2026-11-02 (plan thread). Decision D67 in [masterworld-plan.md](masterworld-plan.md). Steps are in [implementation-plan.md](implementation-plan.md), phase M. Nothing here is built yet.

## 1. The idea

**The first world is the source of all magic.** Three hundred years ago magic drained out of our world (the Fading, D43). Now it is coming back through **cracks** between the worlds, and other things come through with it:
- **seeds**, which have already taken root;
- **small first-world creatures**, which slip out now and then.

Both are unlike anything of this world: very colourful plants and animals with a faint glow.

**Eating them changes a being.** A deer that grazes the bright plants, or a wolf that eats a stray or a changed deer, slowly **mutates**. It grows bigger and twisted, with a wrong skin and a wrong gait, and it turns hostile to everything.

The changed ones **wander**. That carries the plague, and the seeds caught in their coats, away from the cracks. So the plague is not confined to one area: changed creatures turn up anywhere, but most of them are round the **origin area** of a crack.

Arnd: "We can later expand into actually visiting the first world, that could be a high level thing... not now though."

## 2. Arnd's points

- The first world is the source of all magic; it drained and is coming back through those cracks.
- Small first-world animals can escape, and plant seeds already did.
- Affected beings mutate into twisted, giant versions of the original. They spread, not just in one area, with an origin area holding more of them.
- **Actors gets a Deform function** that mutates the bones and textures of an actor (humanoid or animal) and twists standard animations. The animations must still work, but become awkward.
- **Giant versions of our established creatures** are a cheap win on top. The same function delivers them without twists, but not as a mere upscale: modified textures and bones.
- **Fighting it back is a second step.** Closing a crack needs a plug that only one mage in the capital can provide, "or something like that". It must not be an easy ability.
- **NPCs must convey it.** This is where the parked dialog work comes in (section 7).

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

### 4.1 Cracks

A crack is a fixed place in the world's history, seeded with the land. There are few of them, the first far enough from the start to be found, not stumbled on (D29). It shows as a shimmer in the air, a tear of colour (the portal stone's rift look is a late shader kind already). Round it lies its **origin area**, where the bright growth is thickest.

A crack once seen gets its mark on the minimap and map (D66).

### 4.2 The bright growth

First-world plants are very colourful, slightly glowing, and unlike any plant of this world. They grow densest round a crack and thin out with distance. New patches start where changed creatures have been, because seeds are carried in coats and dung. The growth spreads over days of world time, seeded and saved; it does not change while the hero watches.

### 4.3 Strays

There are a few kinds of small first-world creatures, data in the setting, colourful and quick. They are mostly harmless prey, found near cracks and bright patches.

### 4.4 Mutation

Each creature carries a **taint** from 0 to 1:
- grazers raise it by eating bright plants;
- hunters raise it by eating strays or tainted prey.

The taint is the Deform strength. Past a threshold a creature:
- turns twisted;
- grows bigger and more dangerous (its danger rises with the taint);
- joins the **blighted** faction, hostile to all (D65).

This uses the existing creature simulation: herds graze, packs hunt (R5), and territories drift.

### 4.5 Spread

Blighted creatures leave their territory and wander. That is how the plague turns up far from any crack, and how new bright patches start. A world simulation drives it, not the VGM. The VGM may use it, for example by sending blighted wolves into a town (R6's raid) or by asking a household for help when its herd turns.

### 4.6 People

**First step: animals and monsters only.** Whether people, and the hero, can catch it is a later and darker question for Arnd.

### 4.7 Giants without the plague

Rare **giant versions** of the established creatures are a cheap win: a giant boar, a giant wolf leading a pack, a giant spider deep in a cave.
- They use the giant recipe, with no twist.
- They are placed far out and deep by danger (D29), never as a scaled number on a normal one.
- They are their own creature kinds in the setting, so they keep their own loot and danger.

## 5. How the world tells it

Show, don't tell (rule 11, D52), but this needs people to explain it:
- **Seen:** bright patches, strays, twisted animals, the cracks themselves.
- **Said:**
  - herders whose sheep went strange;
  - hunters who saw a wolf "wrong in the shoulders";
  - the innkeeper's rumours, thinning with distance from the plague;
  - one scholar or mage in the capital who knows what the cracks are, the seed of the later plug.

What people say comes from what they have seen and how near the plague is. This needs the dialog work (section 7).

## 6. Later (second step and beyond)

- **The plug.** Closing a crack needs something only one mage in the capital can provide, earned through a story, not bought or learned as an ability. Once a crack is closed, its bright growth withers and its area slowly heals.
- **Cures and burning**, if wanted.
- **People catching it.**
- **Visiting the first world**, a high-level thing.

## 7. Dialog

The parked dialog item ("dialog needs a lot of love", after phase Q, which is done) is what lets NPCs convey the plague. The proposal is to open it with this phase, starting with what the plague needs: people speak of what they know and have seen, in their own voice, near or far from it. A full dialog design follows as its own talk.

## 8. Open questions for Arnd

1. Can people and the hero catch it (later)?
2. Names: the cracks, the bright growth, the strays, the blighted.
3. How many cracks, and how far from the start is the first?
4. Does dialog open now, together with this phase?
