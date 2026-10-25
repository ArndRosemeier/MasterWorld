#!/usr/bin/env bash
# How the title's painted stills (public/title/) were made, to make them again. Its music and sounds moved to
# tools/sound/sounds.json (music/title, title/*) with the game's others; the sounds were made again there on
# 2026-10-25, because the files made here had been cut to their first 0.23 s.
# Needs OPEN_ROUTER_KEY and an OpenRouter CLI (the openrouter skill's or.py). Made 2026-10-25 with
# google/lyria-3-pro-preview (music), bytedance-seed/seed-audio-1-0 (sounds), meta/muse-image (stills).
# Afterwards (ffmpeg): stills scaled to 1600 px wide WebP quality 74.
set -e
OR="python3 ${OR_PY:-/mnt/project-files/tools/openrouter/or.py}"
IMG=meta/muse-image
$OR image "Painted fantasy landscape, wide panoramic view from high above a green river valley at dawn: a small walled medieval town with a market square beside a winding river, forested hills, mist in the valleys, the sea glittering in the distance, tall dramatic mountains, first golden sunlight breaking over the ridge. Rich painterly concept art, warm light, no text, no people, no religious symbols." --model $IMG --aspect 16:9 --out img/still-dawn.png &
$OR image "Painted fantasy landscape, wide panoramic view from high above a green river valley in golden evening light: a small walled medieval town beside a winding river, forested hills, the sea in the distance, dramatic mountains, long shadows, warm orange sky. Rich painterly concept art, no text, no people, no religious symbols." --model $IMG --aspect 16:9 --out img/still-evening.png &
$OR image "Painted fantasy landscape, wide panoramic view from high above a green river valley under a rolling storm: dark clouds, rain curtains, a shaft of light on a small walled medieval town beside a winding river, forested hills, the grey sea in the distance, mountains. Rich painterly concept art, moody, no text, no people, no religious symbols." --model $IMG --aspect 16:9 --out img/still-storm.png &
wait
echo ALLDONE
