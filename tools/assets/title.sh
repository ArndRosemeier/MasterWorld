#!/usr/bin/env bash
# How the title's music, sounds and painted stills (public/title/) were made, to make them again.
# Needs OPEN_ROUTER_KEY and an OpenRouter CLI (the openrouter skill's or.py). Made 2026-10-25 with
# google/lyria-3-pro-preview (music), bytedance-seed/seed-audio-1-0 (sounds), meta/muse-image (stills).
# Afterwards (ffmpeg): music to 112 kbit/s; sounds trimmed of leading silence, loudnorm I=-16, mono 80 kbit/s;
# stills scaled to 1600 px wide WebP quality 74.
set -e
OR="python3 ${OR_PY:-/mnt/project-files/tools/openrouter/or.py}"
SFX=bytedance-seed/seed-audio-1-0
$OR music "Main title theme for a classic high-fantasy role-playing game, about 2 minutes, instrumental, no vocals. Opens with quiet wind and a lone solo horn over low strings like dawn breaking over a valley, then grows into a warm, wondrous full orchestral theme with harp, choir pads without words, gentle timpani; hopeful and adventurous, a hint of old magic returning; ends calmly so it can loop." --model google/lyria-3-pro-preview --out music/title-theme.mp3 &
$OR sfx "a single large bronze bell in a town watchtower ringing three slow strokes across a valley, with long reverberating tail" --model $SFX --out sfx/bell.mp3 &
$OR sfx "a close lightning strike: sharp crack followed by rolling thunder rumbling away over hills" --model $SFX --out sfx/thunder.mp3 &
$OR sfx "a flock of small birds suddenly taking off from trees, many wings flapping and a few startled chirps" --model $SFX --out sfx/birds.mp3 &
$OR sfx "a huge dragon roaring in the distance, then giant leathery wings beating as it flies past overhead" --model $SFX --out sfx/dragon.mp3 &
$OR sfx "a heavy brass gear mechanism turning and locking into place with a satisfying metallic clunk" --model $SFX --out sfx/gear.mp3 &
$OR sfx "a fast rushing wind whoosh as if diving down through clouds from the sky" --model $SFX --out sfx/dive.mp3 &
$OR sfx "a soft magical shimmer: a glowing line of light igniting and running like a fuse, crystalline sparkle and low hum" --model $SFX --out sfx/ward.mp3 &
$OR sfx "gentle mountain wind blowing over an empty valley before dawn, soft and airy, no other sounds" --model $SFX --out sfx/wind.mp3 &
$OR sfx "a short bright brass click of a metal button being pressed" --model $SFX --out sfx/click.mp3 &
$OR sfx "a whale breaching the sea surface with a huge splash and water pouring down" --model $SFX --out sfx/splash.mp3 &
IMG=meta/muse-image
$OR image "Painted fantasy landscape, wide panoramic view from high above a green river valley at dawn: a small walled medieval town with a market square beside a winding river, forested hills, mist in the valleys, the sea glittering in the distance, tall dramatic mountains, first golden sunlight breaking over the ridge. Rich painterly concept art, warm light, no text, no people, no religious symbols." --model $IMG --aspect 16:9 --out img/still-dawn.png &
$OR image "Painted fantasy landscape, wide panoramic view from high above a green river valley in golden evening light: a small walled medieval town beside a winding river, forested hills, the sea in the distance, dramatic mountains, long shadows, warm orange sky. Rich painterly concept art, no text, no people, no religious symbols." --model $IMG --aspect 16:9 --out img/still-evening.png &
$OR image "Painted fantasy landscape, wide panoramic view from high above a green river valley under a rolling storm: dark clouds, rain curtains, a shaft of light on a small walled medieval town beside a winding river, forested hills, the grey sea in the distance, mountains. Rich painterly concept art, moody, no text, no people, no religious symbols." --model $IMG --aspect 16:9 --out img/still-storm.png &
wait
echo ALLDONE
