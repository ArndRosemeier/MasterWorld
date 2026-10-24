# Working on MasterWorld

1. **Design first:** read [docs/design/masterworld-plan.md](docs/design/masterworld-plan.md) before larger changes.
2. **Shaders follow [docs/SHADERS.md](docs/SHADERS.md):** at most a third of every second goes to shader compiles, each compile aims for 10 ms, compiles are spread out (one per frame, then wait twice the compile's time), and nothing compiles on the render path.
3. **Tests follow [docs/CHECKS.md](docs/CHECKS.md):** at most 5 s per test, 60 s for all of `npm test`. Browser and other slow checks are separate scripts, at most 5 min each.
4. **No duplicates:** search before writing a helper; run `npm run dup` and `npm run repeated` (toolbox finders in `tools/`). Every PR description has a `COPIES:` line.
5. **No `Math.random`.** Every random number comes from a seed.
6. **PRs are merged to `main` automatically** once `npm test` is green.
