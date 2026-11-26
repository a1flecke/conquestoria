# Nano Banana Automated Sprite Production Pipeline

A second unit-sprite production pipeline alongside the ChatGPT workflow (`scripts/sprite-puppet/strips.py`). It calls Google's **Nano Banana** (Gemini Interactions API v1) directly, automates every validation, rigging, preview, provenance, export, and wiring step, and is designed to be driven end-to-end by an AI coding agent so **the only human step is reviewing the compact sprite review cards directly in Antigravity**.

## Entry point: `./scripts/sprite-nano-banana.sh`

Always run the pipeline through the shell wrapper. It runs only `status`, `scaffold`, `produce`, `regenerate` and `approve` (never an arbitrary command; the interactive `run`/`review` are refused), validates the unit id (`[a-z0-9_]+`), finds a `python3` with Pillow, numpy and scipy, and derives the repo root from its own path, so it works in any worktree. That makes it the one thing to allow-list for agents, for example with a single rule on `scripts/sprite-nano-banana.sh`.


## One-Time Auth Setup (AI Studio Primary + Vertex AI ADC Failover)

By default (`NANO_BANANA_BACKEND=auto`), `./scripts/sprite-nano-banana.sh` tries **AI Studio** first (so AI Studio Prepay and Developer Program credits are consumed first) and automatically fails over to **Vertex AI (ADC)** if AI Studio credits/quota are exhausted (`429`/`402`/`RESOURCE_EXHAUSTED`/billing disabled) or if no AI Studio key is configured.

1. **AI Studio (Primary):** either store `GEMINI_API_KEY` in the macOS Keychain via `gemini-api` CLI (or Keychain service `GEMINI_API_KEY`) or export `GEMINI_API_KEY`:

   ```bash
   mise use -g github:google-gemini/gemini-api-cli@0.5.0
   gemini-api configure --api-key "YOUR_GEMINI_API_KEY"
   gemini-api whoami
   ```

2. **Vertex AI (Automatic Failover / Forced `--backend vertex`):** configure Application Default Credentials (ADC) once with `gcloud`:

   ```bash
   gcloud auth application-default login
   gcloud auth application-default set-quota-project gen-lang-client-0840262071
   ```

3. **Backend & Model Environment Variables:**

   | Variable | Default | Purpose |
   |---|---|---|
   | `NANO_BANANA_BACKEND` | `auto` | `auto` (AI Studio → Vertex AI failover), `aistudio`, or `vertex` (also `--backend`) |
   | `AISTUDIO_IMAGE_MODEL` | `gemini-nano-banana-2.1` | Model ID/alias used on AI Studio (also `--model`) |
   | `VERTEX_IMAGE_MODEL` | `gemini-nano-banana-2.1` | Model ID/alias used on Vertex AI (also `--vertex-model`) |
   | `GOOGLE_CLOUD_PROJECT` | `gen-lang-client-0840262071` | GCP project ID for Vertex AI (`conquestoria-image-gen`) |
   | `GOOGLE_CLOUD_LOCATION` | `global` | GCP region for Vertex AI (`global` for Nano Banana 2.1 / Gemini 3; `us-central1` for `gemini-2.5-flash-image`) |

## Agent-Driven Flow (Recommended — Zero Browser, Minimal Tokens)

An agent follows `.agents/skills/nano-banana-sprites/SKILL.md`:

```bash
# 1. Check status (compact JSON)
./scripts/sprite-nano-banana.sh status --json

# 2. Stage 1: generate ONLY master a.png (1K = 1,120 tokens) + <id>-review-master-v1.png
./scripts/sprite-nano-banana.sh produce axeman --stage master --json
#    -> Human signs off on <id>-review-master-v1.png directly in Antigravity
#    -> If tweaks needed (emits -v2, -v3... so Antigravity never caches an old take):
#       ./scripts/sprite-nano-banana.sh regenerate axeman a --note "..." --json

# 3. Stage 2: generate b..e from approved a.png + build preview + <id>-review-sheet-v1.png + <id>-review-anim-v1.gif
./scripts/sprite-nano-banana.sh produce axeman --stage set --json
#    -> Human signs off on <id>-review-sheet-v1.png + <id>-review-anim-v1.gif in Antigravity
#    -> If one action needs a tweak (emits -v2, -v3...):
#       ./scripts/sprite-nano-banana.sh regenerate axeman c --note "..." --json

# 4. Ship: export + finalize provenance + wire catalog, scenarios, tests, and asset-rights ledger
./scripts/sprite-nano-banana.sh approve axeman --json
```

### Why This Minimizes Token Cost (Both API & Agent Context)

| Optimization | Savings |
|---|---|
| **Two-stage generation** (`--stage master` then `--stage set`) | Never burns 4× follow-up sheet generations (`b..e`) if the master design needs a tweak |
| **Smart resolution** (`--image-size auto`, default) | Uses `1K` (1,120 tokens, 33% cheaper than 2K's 1,680) for 1-cell masters, 2×2 damage grids, and 1×3 rows; uses `2K` only for dense 5–6 figure sheets (`attack`, biped `hit`/`defeat`) |
| **Single compact review artifacts** (`review-master.png`, `review-sheet.png`, `review-anim.gif`) | Human & agent inspect 1 compact image per gate instead of 5–7 raw 2K PNGs |
| **Pure compact `--json` stdout** | Redirects noisy `strips.py` progress logs to `.verification/nano-banana/<id>/run.log` and omits multi-KB prompt text from stdout (saved verbatim in `provenance.json`) |
| **Structured exit codes** | `0` ok, `1` runtime/API/QC failure, `2` usage/spec error, `3` missing auth |

## Optional Interactive Browser Flow

If you prefer clicking buttons in a local web UI instead of reviewing inside Antigravity:

```bash
./scripts/sprite-nano-banana.sh run <unit-id>
```

## Model Tiers

Choose a Nano Banana model with `--model <alias-or-id>` or `NANO_BANANA_MODEL`:

| Alias | Model ID | Best for |
|---|---|---|
| `nano-banana-2.1` *(default)* | `gemini-nano-banana-2.1` | Default high-efficiency workhorse with strong style & multi-image reference consistency (1K/2K/4K) |
| `nano-banana-pro` | `gemini-3-pro-image` | Complex silhouettes, intricate weapon/pose adherence |
| `nano-banana-2-lite` | `gemini-3.1-flash-lite-image` | Fastest / lowest-cost rapid iteration |
| `nano-banana-2` | `gemini-3.1-flash-image` | Previous-gen 4K workhorse (prefer `nano-banana-2.1`) |

Uses the GA **Gemini Interactions API** (`POST https://generativelanguage.googleapis.com/v1/interactions`) with `response_format: {"type": "image", "mime_type": "image/png", ...}` (or delegates to `gemini-api image` when using Keychain auth) and `gemini-4-hydrogen` for `scaffold --draft`.

## Parity & Guardrails

- **Originals are never committed**: raw Nano Banana outputs live under `~/conquestoria-art-originals/strips/<id>/` (override via `SPRITE_ORIGINALS_DIR` or `--originals`), matching the ChatGPT pipeline.
- **Same runtime contract**: uses the exact same `strips.py` rigs (`LegRig`, `QuadRig`, `VehicleRig`, `NavalRig`, `FlightRig`), `strips_export.py` palette/budget/hold/alignment checks, `PngUnitSprite` manifests, and SVG fallback safety.
- **Leg stance (biped masters)**: QC measures each leg's resting angle the way the walk rig does and rejects a master whose legs spread more than 13 degrees or lean more than 13 degrees from vertical (`leg_stance`, auto-retried). A biped master call also carries a legs-only crop of the style exemplar as a stance guide. A splayed or turned leg makes the rig-built walk scissor and tilt the boots.
- **Asset rights ledger**: Nano Banana units are tracked in their own ledger family (`Nano Banana (unit strips)`) in `docs/asset-rights-ledger.md` and pinned by `tests/systems/asset-rights-ledger.test.ts`.
