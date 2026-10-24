# Shader policy

Shader compiles are the worst kind of stutter: the frame waits for the driver. Scale fought this for a long time, and Dunfinity had strict rules from its first commit. MasterWorld has them from the start too, with a budget that is about time, not about counts.

## The rules

1. **One third of every second, at most.** In any rolling one-second window, the time the main thread spends blocked on shader work (compiling, linking, creating pipelines) is at most **333 ms**.
2. **Each shader aims for 10 ms.** A shader should compile in 10 ms or less. A compile that takes longer is a **breach**: the monitor records it, and the fix is a smaller shader or fewer variants, not a bigger budget.
3. **Spread over the second, never in a burst.** At most one compile per frame. After a compile that took `t` ms, the next one waits at least `2t` ms (and at least 20 ms). So a 10 ms compile is followed by a 20 ms gap, and the one-third share holds over any stretch of time, not only on average over the second.
4. **Nothing compiles on the render path.** An object enters the scene only after its shaders are ready. Until then it stays hidden or is drawn with a stand-in material that is already compiled.
5. **The loading screen is the exception.** During warm-up behind the loading screen, the cap is off and everything visible at the start is compiled in one go.

In the worst case, shader work takes a third of the time and the game keeps two thirds of every second for itself. With 10 ms compiles, that is up to about 33 new shaders per second, enough to stream a new region in without anyone noticing.

## How the code will keep them

There is no rendering code yet. These are the pieces to build, taken from Dunfinity and Scale:

| Piece | What it does |
|---|---|
| Material registry | Every material is a *kind* from a closed list, and every mesh of a kind shares one material. So the set of shaders is known up front. Variation goes into vertex attributes or uniforms, never into a new material. |
| Stage | `warmUp()` compiles every kind against the real scene (lights, fog, render target) behind the loading screen. After that, `stage.add(obj)` compiles first and only then puts the object into the scene. |
| Cap | Hands out compile slots by the rules above: measures each compile and makes the next one wait `2t`. Off during warm-up. |
| Monitor | Records every compile with its duration. `shaders.report()` in the browser console lists breaches (over 10 ms, or over the one-third budget). |
| Guards | `npm test` fails on a material made outside the registry, on `onBeforeCompile`, and on `renderer.compile*` outside the Stage. |

## Lessons this is built on

- Warm-up must compile against the *real* scene and render target. A shader's cache key includes lights, fog, render context and geometry layout, so a warm-up against a different setup warms nothing.
- The number, order and shadow flags of lights are part of every key. Fix the lights before warm-up and keep unused ones in the scene at intensity 0.
- `compileAsync` skips objects outside the view, which then compile on the render path the first time the camera turns. The Stage turns culling off while compiling.
- Pipelines cost separately from shader source and need their own async path.
- Shadow passes build their own shaders. Warm those too.
