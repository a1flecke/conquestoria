# sprite-puppet

Painted unit art for the game is made with the **strip pipeline**: see [`STRIPS.md`](STRIPS.md) (`strips.py prompt|calibrate|probe|build|export`,
specs in `strip-rigs/`).

`puppet.py` is the older one-image rig tool. Its per-unit rig specs and source images were removed in #1627 once every unit had strip art
(they remain in the repository history). The file stays because `strips.py` imports its animation primitives (`Canvas`, `Layer`,
`layer_from`, `keyframes`); it is no longer run on its own.
