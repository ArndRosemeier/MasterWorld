# Checks: tests and duplication

## Test time limits

Tests are only useful if people run them all the time, so they must stay fast.

| Limit | Value | How it is kept |
|---|---|---|
| One test | **5 s** | `--test-timeout=5000` in `npm test` (and `testTimeout: 5000` once there is a Vitest config). A test that needs more is split, given a smaller fixture, or moved to a slow check. |
| The whole of `npm test` | **60 s** | Checked by hand for now. Keep `npm test` free of browsers, network and big worlds. |
| A slow check (browser, screenshots, shader check, long simulation) | **5 min** each | Own script, never inside `npm test`. Run on demand and after changes to what it covers. |

Tests use seeds, fake clocks and small fixtures, never wall-clock waits.

## Duplication

The duplication finders come from [toolbox](https://github.com/ArndRosemeier/toolbox), copied as the whole `tools/` folder (see `tools/README.md`, do not copy single files):

| Command | What it finds |
|---|---|
| `npm run dup` | Functions sharing an exact, normalised or near-identical name across files |
| `npm run repeated` | Function bodies that are near-identical under different names, and inline idioms pasted into several files |

Both scan `src/`, write their report to `reports/` (git-ignored) and exit `0`. They point, they don't judge: open both places before folding anything.

How we use them:

1. **Before writing a helper, search for the one that exists.** A second way to do the same thing is a bug.
2. **Every PR description has a `COPIES:` line**: `COPIES: 1 — checked (grepped: ...)` or `COPIES: 3→1 — <where it now lives>`.
3. **Every ~10 PRs, a sweep:** run both finders, read the top of each report, fold what is worth folding.
4. Updating the tools: copy the whole `tools/` folder from toolbox again and run `npm test`.
