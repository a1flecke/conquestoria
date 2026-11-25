---
name: nano-banana-sprites
description: Automated, token-lean Conquestoria unit sprite production using Nano Banana with in-Antigravity visual sign-off. Use whenever the user asks to generate, replace, or ship a painted unit strip sprite.
---

# Nano Banana Sprite Production (Agent Workflow)

Generate and ship Conquestoria painted unit strip sprites with **minimal token cost** while keeping **all human image sign-off directly inside Antigravity**.

## Token-Efficiency Rules

1. **Always pass `--json`**: stdout stays a single compact JSON object (<250 tokens); verbose logs go to `.verification/nano-banana/<id>/run.log`.
2. **Use the two-stage flow (`--stage master` → human sign-off → `--stage set` → human sign-off)**: never waste Nano Banana output tokens generating `b..e` before the human approves master `a.png`.
3. **Keep `--image-size auto` (default)**: uses `1K` (1,120 tokens) for 1-cell masters, 2×2 damage sheets, and 1×3 wreck/sinking/down rows, and `2K` (1,680 tokens) only for 5–6 figure grids (`attack`, biped `hit`/`defeat`).
4. **Show ONE compact review image per gate**: present `review-master.png` for Stage 1 and `review-sheet.png` + `review-anim.gif` for Stage 2. Do **not** call `read_file` on all 5 raw 2K source sheets unless debugging a specific QC warning.

## Step-by-Step Procedure

### 1. Pick or prepare the unit spec
- Check status:
  ```bash
  ./scripts/sprite-nano-banana.sh status --json
  ```
- If `scripts/sprite-puppet/strip-rigs/<id>.json` does not exist yet, read the unit's SVG in `src/renderer/sprites/units.tsx` and catalog row in `src/systems/city-unit-catalog.ts`, then run:
  ```bash
  ./scripts/sprite-nano-banana.sh scaffold <id> --family <biped|mounted|vehicle|naval|aircraft> --json
  ```
  Fill `prompt.look`, `prompt.team_area`, `prompt.identity`, `prompt.weapon_pose`, and `prompt.attack` (or pass `--draft`) so the spec matches the unit's era/theme and keeps pure red (`#E01010`) strictly on `team_area`.

### 2. Stage 1 — Generate Master (`a.png`) & Request Sign-Off
```bash
./scripts/sprite-nano-banana.sh produce <id> --stage master --json
```
- If exit code is `3` (missing auth), tell the user to configure AI Studio (`gemini-api configure --api-key "..."`) and/or Vertex AI ADC (`gcloud auth application-default login && gcloud auth application-default set-quota-project gen-lang-client-0840262071`). By default (`NANO_BANANA_BACKEND=auto`), the wrapper tries AI Studio first and automatically fails over to Vertex AI when AI Studio credits/quota are exhausted.
- Copy `reviewImages.master` (already uniquely versioned per take, e.g. `<id>-review-master-v1.png`, `-v2.png`, with `[vN]` stamped in the header so Antigravity's artifact viewer never serves a cached earlier take) into `<appDataDir>/brain/<conversation-id>/` preserving its exact basename, embed it in a concise review artifact (`RequestFeedback: true`), and ask the user: **Approve master or describe tweaks?**
- On tweaks:
  ```bash
  ./scripts/sprite-nano-banana.sh regenerate <id> a --note "<user feedback>" --json
  ```
  then copy the new versioned `reviewImages.master` (`-v2`, `-v3`, ...) preserving its basename and update the review artifact to embed the new filename.

### 3. Stage 2 — Generate Full Action Set (`b..e`) & Request Final Sign-Off
```bash
./scripts/sprite-nano-banana.sh produce <id> --stage set --json
```
- Copy `reviewImages.sheet` (`<id>-review-sheet-v1.png`) and `reviewImages.animGif` (`<id>-review-anim-v1.gif`) into `<appDataDir>/brain/<conversation-id>/` preserving their exact versioned basenames, embed both in a concise review artifact alongside the `preflight` budget summary, and ask for final sign-off.
- If a single action sheet needs a tweak (e.g. `c` attack):
  ```bash
  ./scripts/sprite-nano-banana.sh regenerate <id> c --note "<user feedback>" --json
  ```
  then copy the newly incremented `reviewImages.sheet` (`-v2`, ...) and `reviewImages.animGif` (`-v2`, ...) preserving their basenames and update the review artifact to embed the new filenames.

### 4. Ship on Approval
```bash
./scripts/sprite-nano-banana.sh approve <id> --json
```
This automatically runs `strips.py export`, finalizes `design/png-sprites/previews/<id>/provenance.json`, and idempotently wires `png-sprite-catalog.ts`, `src/testing/scenarios.ts`, `tests/testing/scenarios.test.ts`, `tests/e2e/issue-1627-strip-units.spec.ts`, and `docs/asset-rights-ledger.md`.

Then run `./scripts/dev.sh verify-impact` and complete the required repo verification checks before reporting done.
