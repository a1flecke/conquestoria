# sprite-puppet

Painted unit art for the game is made with the **strip pipeline**: see [`STRIPS.md`](STRIPS.md) (`strips.py prompt|calibrate|probe|build|export`,
specs in `strip-rigs/`).

For automated direct generation via Google's **Nano Banana** (Gemini image generation) API with automated QC, preview building, local Sign-Off Studio, and one-click export/wiring, see [`../sprite-nano-banana/README.md`](../sprite-nano-banana/README.md).

`puppet.py` is the older one-image rig tool. Its per-unit rig specs and source images were removed in #1627 once every unit had strip art
(they remain in the repository history). The file stays because `strips.py` imports its animation primitives (`Canvas`, `Layer`,
`layer_from`, `keyframes`); it is no longer run on its own.
