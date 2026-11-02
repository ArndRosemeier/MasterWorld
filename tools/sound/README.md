# The game's sounds and music

Every sound and piece of music in `public/sound/` is listed in [`sounds.json`](sounds.json): its prompt (or the
take of another of Arnd's games it reuses, `from`), its kind and how it is cut. The shared script of
`@futuremagic/audio` turns the list into the files and `public/sound/index.json`, which the game's engine reads:

```
NODE_USE_ENV_PROXY=1 node vendor/assetgenerator/packages/audio/tools/make.mjs --spec tools/sound/sounds.json \
  --out public/sound --raw /mnt/project-files/masterworld/audio/raw --title MasterWorld [--only id,id] [--again id]
```

- Needs `OPEN_ROUTER_KEY` and ffmpeg; never part of CI. Raw takes are kept in the project's shared folder
  (`/mnt/project-files/masterworld/audio/raw`), so cutting again costs nothing; `--again id` asks for a new take.
- Models are resolved when the script runs, by Arnd's preferences: sounds from the newest ByteDance Seed Audio (a
  prompt must start with "The sound of", or it speaks the words), music from the newest Google Lyria Pro.
- Reused takes (`from`): steps, wind, leaves, water, birds and insects from Solarpolis; doors, ladder rungs, drips,
  a hard landing, the house's clock and the town at night from Dunfinity. Both were made with Seed Audio (MIT).
- 2026-10-25: 69 new takes and 17 pieces of music cost about $2.06. Every new take was checked for length, loudness
  and (with a transcriber) that it did not turn into speech. Listen before a new take goes in.

What plays when is decided in `src/game/soundscape.ts` (pure, tested) and played by `src/app/soundDirector.ts`.
- 2026-10-27: 13 spell takes (`spell/gather`, and `spell/<motif>-loose` / `-hit` for each school's motif) for a few
  cents. Seed Audio's moderation refused "magic gathering in a raised hand"; the gather prompt is a singing bowl.
- 2026-10-31: `bed/ship-creak` (a ship's timbers and rigging working at sea) and `bed/sea-storm` (a stormy open sea) for
  S10, for under a cent; a listening model heard no speech or music in either.
