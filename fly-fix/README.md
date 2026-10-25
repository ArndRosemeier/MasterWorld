# Fly test: tree flicker fix (2026-10-25, real GPU, headed Chrome WebGPU, 1920x1080)

Start `?fly&hud&hour=12&day=0&weather=clear&pos=-32000,120,32000&look=0,-10`, turned south and leveled,
then W+Shift held for 60 s (about 180 m/s, following the ground over woods and meadows), turns of about 35° every 12 s,
a frame every 3 s. Same path for all three builds.

- `fix-031d896/` - claude/project-thread-9lag9f (AssetGenerator af3714b): trees in every frame, near trees full detail.
- `old-d331345/` - the GPU culling commit: all trees gone after about 3 s of flying and never come back.
- `main-4e1fe73/` - current main (fix merged as #34): same as the fix.
- `compare-*.jpg` - old (left) vs fix (right), frame by frame.
