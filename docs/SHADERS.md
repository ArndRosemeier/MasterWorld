# Shader policy

Shader compiles are the worst kind of stutter: the frame waits for the driver. Scale fought this for a long time, and Dunfinity had strict rules from its first commit. MasterWorld has them from the start too, with a budget that is about time, not about counts.

## The rules

1. **One third of every second, at most.** In any rolling one-second window, the time the main thread spends blocked on shader work (compiling, linking, creating pipelines) is at most **333 ms**.
2. **Each shader aims for 10 ms.** A shader should compile in 10 ms or less. A compile that takes longer is a **breach**: the monitor records it, and the fix is a smaller shader or fewer variants, not a bigger budget.
3. **Spread over the second, never in a burst.** At most one compile per frame. After a compile that took `t` ms, the next one waits at least `2t` ms (and at least 20 ms). So a 10 ms compile is followed by a 20 ms gap, and the one-third share holds over any stretch of time, not only on average over the second.
4. **Nothing compiles on the render path.** An object enters the scene only after its shaders are ready. Until then it stays hidden or is drawn with a stand-in material that is already compiled.
5. **The loading screen is the exception.** During warm-up behind the loading screen, the cap is off and everything visible at the start is compiled in one go.

In the worst case, shader work takes a third of the time and the game keeps two thirds of every second for itself. With 10 ms compiles, that is up to about 33 new shaders per second, enough to stream a new region in without anyone noticing.

## How the code keeps them

The policy is implemented once, in the shared package **`@futuremagic/stage`** (AssetGenerator `packages/stage`, vendored at `vendor/assetgenerator`), which Dunfinity uses too:

| Piece | Where | What it does |
|---|---|---|
| Material registry | `src/render/materials.ts` | Every material is a *kind* from a closed list, and every mesh of a kind shares one material. So the set of shaders is known up front. Variation goes into vertex attributes or uniforms, never into a new material. |
| Stage | `@futuremagic/stage` `Stage`, made in `src/render/view.ts` | `warmUp()` compiles every kind against the real scene behind the loading screen, except the late ones (`defineKind(..., late = true)`: spells, the bird form's feathers), which are not needed in the first seconds and build under the cap when first added. After that, `stage.add(obj)` compiles first and only then puts the object into the scene. |
| Cap | `@futuremagic/stage` `ShaderCap` | `share = 1/3`: after a build that took `t` ms the next waits `2t`, one per frame. Off during warm-up. |
| Monitor | `@futuremagic/stage` `ShaderMonitor` | Records every build with its duration. `shaders.report()` in the browser console; `?hud` shows a summary line. Its hard violation line is 100 ms; the 10 ms target is ours and is read from the same records. |
| Guards | `tools/guards/rules.json` | `npm test` fails on a material made outside the registry, on `onBeforeCompile`, on `renderer.compile*` in our code, and on a second renderer. |

## The floating origin (plan B0)

The scene is drawn relative to a point near the camera (`ORIGIN` in `src/render/origin.ts`, `FloatingOrigin` in `@futuremagic/stage`), so float32 stays exact however far out the hero walks. The origin moves in 1280 m steps. A step changes one uniform and the scene root's position, and builds no shader. So in every shader:

- `positionWorld`, `modelWorldMatrix` and `cameraPosition` are **relative to the origin**. Their differences (a view ray, a distance to the camera) are right as they are.
- A **pattern, noise or mask** read at a world point uses `WORLD` (the fragment's world position), and one that follows the camera uses `EYE`. Both come from `src/render/origin.ts`. Raw `positionWorld` there makes the pattern jump at every step, and breaks it far out.
- **Geometry placed on the GPU** (instances, grass, far folk, precipitation) has no matrix of its own. Its group is `ORIGIN.pin`ned so its matrixWorld is the identity, and it writes positions minus `ORIGIN.at`. On the CPU an object's matrixWorld is relative too: add `ORIGIN.at` (`ORIGIN.toWorld`). Meshes with big vertex coordinates are placed at their middle with local vertices (`recentre` in `src/world/chunkMesh.ts`).
- A shadow map that is snapped in world space is redrawn when `ORIGIN.steps` changes (`src/render/sky.ts`, `src/render/warmLights.ts`).

A guard in `tools/guards/rules.json` lets `positionWorld` and `modelWorldMatrix` appear only in the files that use the relative value on purpose. `npm run shot:origin` checks the town at 32 km and a shore at 300 km, with the origin on and with `?origin=0`, and checks that an origin step does not show.

## Lessons this is built on

- Warm-up must compile against the *real* scene and render target. A shader's cache key includes lights, fog, render context and geometry layout, so a warm-up against a different setup warms nothing.
- The number, order and shadow flags of lights are part of every key. Fix the lights before warm-up and keep unused ones in the scene at intensity 0.
- `compileAsync` skips objects outside the view, which then compile on the render path the first time the camera turns. The Stage turns culling off while compiling.
- Pipelines cost separately from shader source and need their own async path.
- Shadow passes build their own shaders. Warm those too.

## Texture units

WebGL 2 promises a fragment shader 16 textures, and a shader that reads more does not link (the land drew white after the roads, MW #155). The land's shader is near the limit (15 in October 2026): a new mask goes into a channel or a half of a texture it already reads (the town's two masks share one, `TOWN_MASKS`), a small table into a uniform array (`CROP_LOOK`). `npm run check:units` (in CI) fails above 16.
