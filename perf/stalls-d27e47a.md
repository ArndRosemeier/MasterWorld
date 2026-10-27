# Dressing stall check on d27e47a, 2026-10-27

Commit d27e47a (prepareSlot waits one frame before each detail level and before 'auto'), `npm run build`, WebGPU, SHOT_GPU=1, 1920x1080, RTX 5070 / 60 Hz monitor. Waited 30 s with no other probe/shot/build job before each run.

## Summary

- **The prepareSlot part of the stall is gone.** Probe (vsync off, 15 s): inn 8.6 / 8.7 ms p50, **1 of 1900** frames over 25 ms in each run (25.8 and 29.6 ms). On ea96be8 the slowest were 71/65 ms.
- **Vsync on:** inn p50 17.3, p95 18.1, p99 18.6, max 34.1, one frame over 25 and over 34 ms. Town noon p50 17.6, p95 18.2, p99 18.4, max 18.8, none over 25 ms. Gate B (p95 <= 25 ms) passes.
- **6 s trace (vsync off):** rAF gaps p50 9.4, p95 11.6, p99 13.3, max 39.6, 1 over 26 ms. One main-thread task over 25 ms is left: **`HandlePostMessage` 30.2 ms** (1.95 s into the trace), the worker message that finishes Actors' `ch.set`. Its stack is all Actors (creatorUi bundle): `applyLook` → `reconcile` → `parts` → `applyShape` → `faceDelta` / `surfaceDelta` (gaussian, vert), plus `updateHiddenSkin` via `updateVisibility`. That is the body shape being applied on the main thread when a person is dressed. It's inside Actors, not in FolkView.
- The only other long task is `V8.StackGuard` 281 ms before the first traced frame: the tracer starting up, not the game.

## Probe, village inn `?title=0&day=0&hour=20&site=village&room=inn` (PROBE_PROFILE=0, PROBE_SLOW_MS=15000)

### Run 1


## noon: ?title=0&day=0&hour=20&site=village&room=inn

settled in 1.5 s

| part | objects | meshes | casters | skinned | triangles |
|---|---|---|---|---|---|
| town | 3 | 66 | 66 | 0 | 144086 |
| volumes | 1 | 1 | 1 | 0 | 19654 |
| terrain | 270 | 270 | 270 | 0 | 2350080 |
| sky | 1 | 1 | 0 | 0 | 12 |
| sea | 1 | 1 | 0 | 0 | 57408 |
| grass | 1 | 2 | 0 | 0 | 10752 |
| horse | 2 | 16 | 14 | 16 | 352236 |
| cow | 5 | 5 | 5 | 5 | 13715 |
| hold | 1 | 1 | 1 | 0 | 4560 |
| open inn | 1 | 1 | 1 | 0 | 2306 |
| far folk | 1 | 1 | 1 | 0 | 0 |
| townsfolk | 17 | 258 | 67 | 258 | 2000666 |
| flora | 1 | 70 | 52 | 0 | 147912 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 8.6 | 10.8 | 8.6 | 301 | 0 |  |
| without town | 8.0 | 10.1 | 8.1 | 278 | 0 | 0.6 |
| without volumes | 8.8 | 11.0 | 8.6 | 306 | 0 | -0.3 |
| without terrain | 6.6 | 8.7 | 7.2 | 233 | 0 | 2.0 |
| without sky | 8.6 | 10.4 | 8.5 | 311 | 0 | 0.1 |
| without sea | 8.6 | 11.5 | 9.2 | 310 | 0 | 0.2 |
| without grass | 9.8 | 14.5 | 9.4 | 313 | 0 | -0.8 |
| without horse | 8.8 | 10.7 | 8.8 | 294 | 0 | 0.2 |
| without cow | 8.9 | 11.2 | 9.2 | 316 | 0 | 0.2 |
| without hold | 9.0 | 11.3 | 9.3 | 316 | 0 | -0.3 |
| without open inn | 8.9 | 11.2 | 9.1 | 310 | 0 | -0.6 |
| without far folk | 8.0 | 10.7 | 8.9 | 306 | 0 | 0.5 |
| without townsfolk | 5.8 | 8.0 | 6.1 | 220 | 0 | 2.8 |
| without flora | 7.6 | 9.9 | 7.6 | 227 | 0 | 0.9 |
| without sun shadow redraw | 6.3 | 7.7 | 5.5 | 307 | 0 | 2.2 |
| nothing (empty scene, post chain only) | 2.1 | 2.6 | 1.6 | 4 | 0 | 6.3 |

townsfolk over 5 s: 1 dressings, freed {"hidden":0,"ranked":0,"far":0}; updateHiddenSkin 5× 21 ms: 2× other -> level 2, 1× other -> level 0, 1× other -> level 1, 1× auto level -> level 0

slow frames over 15 s: 1 of 1900 over 25 ms (p50 8.4, p95 10.3); in them / in the rest: sun shadow redrawn 0 / 950, with a build 0 / 0

| mean ms in | slow frames | the rest |
|---|---|---|
| actors update | 1.4 | 0.4 |
| town life | 0.0 | 0.0 |
| folk follow | 1.2 | 0.3 |
| render | 10.2 | 8.4 |
| actors skin | 0.0 | 0.0 |
| actors shape write | 0.0 | 0.0 |
| actors crowd merge | 0.0 | 0.0 |
| stage prepare (sync part) | 0.0 | 0.0 |

slowest frames:
```
25.8 ms: actors update 1.4, folk follow 1.2, render 10.2
```

shaders:
```
shaders: 80 built in warm-up, 0 after (0 drawn late), worst block 11 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:


### Run 2


## noon: ?title=0&day=0&hour=20&site=village&room=inn

settled in 1.5 s

| part | objects | meshes | casters | skinned | triangles |
|---|---|---|---|---|---|
| town | 3 | 66 | 66 | 0 | 144086 |
| volumes | 1 | 1 | 1 | 0 | 19654 |
| terrain | 270 | 270 | 270 | 0 | 2350080 |
| sky | 1 | 1 | 0 | 0 | 12 |
| sea | 1 | 1 | 0 | 0 | 57408 |
| grass | 1 | 2 | 0 | 0 | 10752 |
| horse | 2 | 16 | 14 | 16 | 352236 |
| cow | 5 | 5 | 5 | 5 | 13715 |
| hold | 1 | 1 | 1 | 0 | 4560 |
| open inn | 1 | 1 | 1 | 0 | 2306 |
| far folk | 1 | 1 | 1 | 0 | 0 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| townsfolk | 17 | 258 | 67 | 258 | 2000666 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 8.7 | 11.0 | 8.8 | 301 | 0 |  |
| without town | 7.8 | 10.0 | 8.3 | 278 | 0 | 0.9 |
| without volumes | 8.7 | 10.7 | 8.6 | 306 | 0 | 0.1 |
| without terrain | 6.7 | 8.7 | 7.2 | 233 | 0 | 2.0 |
| without sky | 8.7 | 10.6 | 8.8 | 311 | 0 | 0.0 |
| without sea | 8.9 | 10.3 | 8.9 | 310 | 0 | -0.1 |
| without grass | 8.9 | 10.5 | 8.7 | 313 | 0 | -0.3 |
| without horse | 8.2 | 10.1 | 8.5 | 294 | 0 | 0.4 |
| without cow | 8.8 | 10.8 | 8.8 | 316 | 0 | -0.0 |
| without hold | 8.4 | 11.0 | 8.9 | 316 | 0 | 0.4 |
| without open inn | 8.4 | 10.3 | 8.8 | 310 | 0 | 0.1 |
| without far folk | 8.3 | 10.1 | 8.4 | 306 | 0 | 0.0 |
| without flora | 7.0 | 8.8 | 7.2 | 220 | 0 | 1.4 |
| without townsfolk | 6.1 | 8.8 | 6.2 | 220 | 0 | 2.4 |
| without sun shadow redraw | 6.3 | 7.7 | 5.6 | 300 | 0 | 2.2 |
| nothing (empty scene, post chain only) | 2.1 | 2.6 | 1.6 | 4 | 0 | 6.1 |

townsfolk over 5 s: 1 dressings, freed {"hidden":0,"ranked":0,"far":0}; updateHiddenSkin 5× 21 ms: 2× other -> level 2, 1× other -> level 0, 1× other -> level 1, 1× auto level -> level 0

slow frames over 15 s: 1 of 1900 over 25 ms (p50 8.4, p95 10.4); in them / in the rest: sun shadow redrawn 0 / 950, with a build 0 / 0

| mean ms in | slow frames | the rest |
|---|---|---|
| actors update | 0.5 | 0.3 |
| town life | 0.0 | 0.0 |
| folk follow | 5.1 | 0.3 |
| render | 6.2 | 8.5 |
| actors skin | 7.9 | 0.0 |
| actors shape write | 0.0 | 0.0 |
| actors crowd merge | 0.6 | 0.0 |
| stage prepare (sync part) | 0.0 | 0.0 |

slowest frames:
```
29.6 ms: actors update 0.5, folk follow 5.1, render 6.2, actors skin 7.9, actors crowd merge 0.6
```

shaders:
```
shaders: 81 built in warm-up, 0 after (0 drawn late), worst block 9 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:


## Vsync on, 10 s of rAF intervals

| query | frames | fps | p50 | p95 | p99 | max | > 25 ms | > 34 ms | histogram |
|---|---|---|---|---|---|---|---|---|---|
| ?title=0&day=0&hour=20&site=village&room=inn | 574 | 57.4 | 17.3 | 18.1 | 18.6 | 34.1 | 1 | 1 | {"<20":573,"34-51":1} |
| ?title=0&day=0&hour=12&weather=clear | 569 | 56.9 | 17.6 | 18.2 | 18.4 | 18.8 | 0 | 0 | {"<20":569} |

## 6 s trace of the inn (vsync off, with CPU sampling)

```
rAF gaps 632 p50 9.4 p95 11.6 p99 13.3 max 39.6 over 26 1
longest top-level main-thread tasks:
  -0.29s 281.1 ms V8.StackGuard [V8.HandleInterrupts 281.1, V8.InvokeApiInterruptCallbacks 281.1]
  1.95s 30.2 ms RunTask [HandlePostMessage 30.2, RunMicrotasks 30.1]
  2.02s 16.5 ms RunTask [ProxyMain::BeginMainFrame 16.5, WebFrameWidgetImpl::BeginMainFrame 15.7, Blink.Animate.UpdateTime 15.7, PageAnimator::serviceScriptedAnimations 15.7]
  1.98s 15.6 ms RunTask [ProxyMain::BeginMainFrame 15.6, WebFrameWidgetImpl::BeginMainFrame 14.6, Blink.Animate.UpdateTime 14.6, PageAnimator::serviceScriptedAnimations 14.6]
  3.83s 15.4 ms RunTask [ProxyMain::BeginMainFrame 15.3, WebFrameWidgetImpl::BeginMainFrame 14.7, Blink.Animate.UpdateTime 14.7, PageAnimator::serviceScriptedAnimations 14.7]
  3.80s 15.1 ms RunTask [ProxyMain::BeginMainFrame 15.0, WebFrameWidgetImpl::BeginMainFrame 14.3, Blink.Animate.UpdateTime 14.3, PageAnimator::serviceScriptedAnimations 14.3]
  3.84s 14.3 ms RunTask [ProxyMain::BeginMainFrame 14.3, WebFrameWidgetImpl::BeginMainFrame 13.7, Blink.Animate.UpdateTime 13.7, PageAnimator::serviceScriptedAnimations 13.7]
  1.85s 14.3 ms RunTask [ProxyMain::BeginMainFrame 14.3, WebFrameWidgetImpl::BeginMainFrame 13.5, Blink.Animate.UpdateTime 13.5, PageAnimator::serviceScriptedAnimations 13.5]
tasks over 25 ms: 2  over 16 ms: 3

profile nodes 1513 samples 11217

=== 1.948s +32ms: 64 samples
self: 
  6 updateHiddenSkin creatorUi-z9FVL2Wp.js:486:31164
  6 ll creatorUi-z9FVL2Wp.js:486:86436
  5 (program) :undefined:undefined
  5 vert creatorUi-z9FVL2Wp.js:486:83142
  5 zn creatorUi-z9FVL2Wp.js:0:6373
  4 (garbage collector) :undefined:undefined
  4 ul creatorUi-z9FVL2Wp.js:486:87283
  3 Yc creatorUi-z9FVL2Wp.js:486:82448
  3 surfaceDelta creatorUi-z9FVL2Wp.js:0:18641
  2 hl creatorUi-z9FVL2Wp.js:486:88793
  2 Hc creatorUi-z9FVL2Wp.js:486:82134
  2 gaussian creatorUi-z9FVL2Wp.js:486:82899
inclusive: 
  64 (root) :undefined:undefined
  30 parts creatorUi-z9FVL2Wp.js:486:183376
  28 Ol creatorUi-z9FVL2Wp.js:486:94614
  27 i creatorUi-z9FVL2Wp.js:486:94673
  25 gl creatorUi-z9FVL2Wp.js:486:89298
  25 (anon) creatorUi-z9FVL2Wp.js:486:94893
  15 reconcile creatorUi-z9FVL2Wp.js:495:24179
  12 ll creatorUi-z9FVL2Wp.js:486:86436
  10 applyShape creatorUi-z9FVL2Wp.js:486:28521
  9 ul creatorUi-z9FVL2Wp.js:486:87283
  9 surfaceDelta creatorUi-z9FVL2Wp.js:0:18641
  9 faceDelta creatorUi-z9FVL2Wp.js:486:184721
  7 updateHiddenSkin creatorUi-z9FVL2Wp.js:486:31164
  7 updateVisibility creatorUi-z9FVL2Wp.js:486:21756
  5 (program) :undefined:undefined
  5 vert creatorUi-z9FVL2Wp.js:486:83142
  5 zn creatorUi-z9FVL2Wp.js:0:6373
  4 (garbage collector) :undefined:undefined
  3 al creatorUi-z9FVL2Wp.js:486:84780
  3 Yc creatorUi-z9FVL2Wp.js:486:82448
  2 play creatorUi-z9FVL2Wp.js:486:35914
  2 batch creatorUi-z9FVL2Wp.js:486:21629
  2 applyLook creatorUi-z9FVL2Wp.js:495:21223
  2 hl creatorUi-z9FVL2Wp.js:486:88793
  2 Hc creatorUi-z9FVL2Wp.js:486:82134
  2 gaussian creatorUi-z9FVL2Wp.js:486:82899
  1 writePositions creatorUi-z9FVL2Wp.js:486:24864
  1 Qr three-BTs03czF.js:0:89423
  1 _removeInactiveBinding three-BTs03czF.js:4:73055
  1 _removeInactiveBindingsForAction three-BTs03czF.js:4:72489
```
