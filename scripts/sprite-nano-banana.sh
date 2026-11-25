#!/usr/bin/env sh
# scripts/sprite-nano-banana.sh <subcommand> [args]: the one allow-listable entry point for the Nano Banana
# sprite pipeline (scripts/sprite-nano-banana/pipeline.py).
#
# Dual-backend auth:
#   - Default (`NANO_BANANA_BACKEND=auto`): tries AI Studio (`GEMINI_API_KEY` or macOS Keychain via `gemini-api`
#     CLI) first so AI Studio Prepay / Developer Program credits are consumed first, then automatically fails over
#     to Vertex AI (ADC) on quota/billing exhaustion or missing AI Studio credentials.
#   - Forced backend: set `NANO_BANANA_BACKEND=aistudio|vertex` or pass `--backend aistudio|vertex`.
#   - Vertex AI defaults: `GOOGLE_CLOUD_PROJECT=conquestoria-image-gen`, `GOOGLE_CLOUD_LOCATION=us-central1`.
#
# Contract:
#   - runs `python3 -I <this worktree>/scripts/sprite-nano-banana/pipeline.py <subcommand> ...` and nothing else;
#   - the repo root is derived from this file's own path, so it works in any worktree;
#   - only the agent-safe subcommands are accepted: status, scaffold, produce, regenerate, approve. The
#     interactive `run` and `review` (they start a local web server and block) are refused;
#   - a unit id (first positional argument after the subcommand) must be [a-z0-9_]+ so it cannot be a path;
#   - output goes straight through (use --json for one compact JSON object); the exit status is the pipeline's
#     (0 ok, 1 runtime/API/QC error, 2 usage/spec error, 3 missing auth). Usage and validation failures exit 2.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
PIPELINE="$ROOT/scripts/sprite-nano-banana/pipeline.py"

usage() {
  cat >&2 <<'USAGE'
usage: ./scripts/sprite-nano-banana.sh <subcommand> [args]

subcommands (all accept --json except where noted):
  status                                       shipped units, previews awaiting sign-off, remaining units
  scaffold <unit> --family <family> [--theme "..."] [--draft] [--force]
  produce <unit> [--stage master|set|all] [--backend auto|aistudio|vertex] [--model ..] [--vertex-model ..] ...
  regenerate <unit> <a|b|c|d|e> [--note "..."] [--cascade]
  approve <unit> [--scale 0.75] [--no-wire]

Environment variables:
  NANO_BANANA_BACKEND     auto (default: AI Studio -> Vertex AI failover) | aistudio | vertex
  AISTUDIO_IMAGE_MODEL    AI Studio model ID/alias (default: gemini-nano-banana-2.1)
  VERTEX_IMAGE_MODEL      Vertex AI model ID/alias (default: gemini-3.1-flash-image)
  GOOGLE_CLOUD_PROJECT    Vertex AI project (default: conquestoria-image-gen)
  GOOGLE_CLOUD_LOCATION   Vertex AI location (default: us-central1)
USAGE
}

deny() {
  echo "sprite-nano-banana.sh: $*" >&2
  exit 2
}

[ "$#" -ge 1 ] || { usage; exit 2; }
SUB="$1"
shift

case "$SUB" in
  status|scaffold|produce|regenerate|approve) ;;
  run|review) deny "'$SUB' starts an interactive browser server and is not available here; use produce/approve" ;;
  -h|--help|help) usage; exit 0 ;;
  *) usage; deny "unknown subcommand '$SUB'" ;;
esac

if [ "$SUB" != "status" ]; then
  [ "$#" -ge 1 ] || deny "'$SUB' needs a unit id"
  case "$1" in
    ''|*[!a-z0-9_]*) deny "unit id '$1' must contain only a-z, 0-9 and _" ;;
  esac
fi

[ -f "$PIPELINE" ] || deny "pipeline not found at $PIPELINE"

# Expose mise shims (keychain-backed `gemini-api` CLI and `gcloud` for Vertex AI ADC).
PATH="$HOME/.local/share/mise/shims:$PATH"
export PATH

# Non-fatal dual-backend defaults: AI Studio primary -> Vertex AI ADC failover.
NANO_BANANA_BACKEND="${NANO_BANANA_BACKEND:-auto}"
GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-gen-lang-client-0840262071}"
GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-global}"
export NANO_BANANA_BACKEND GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_LOCATION

# Non-fatal macOS Keychain lookup for GEMINI_API_KEY when using auto/aistudio and no env key is set.
if [ -z "${GEMINI_API_KEY:-}" ] && [ "$NANO_BANANA_BACKEND" != "vertex" ] && command -v security >/dev/null 2>&1; then
  KC_KEY="$(security find-generic-password -s 'GEMINI_API_KEY' -w 2>/dev/null || true)"
  if [ -n "$KC_KEY" ]; then
    GEMINI_API_KEY="$KC_KEY"
    export GEMINI_API_KEY
  fi
fi

# The pipeline needs Pillow, numpy and scipy (dev-time only). The first python3 that has all three wins; the
# system python3 on macOS usually has none of them.
PY=""
for candidate in python3 "$HOME/miniconda3/bin/python3" "$HOME/anaconda3/bin/python3" /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -I -c 'import PIL, numpy, scipy' >/dev/null 2>&1; then
    PY="$candidate"
    break
  fi
done
[ -n "$PY" ] || deny "no python3 with Pillow, numpy and scipy found (pip install pillow numpy scipy)"

exec "$PY" -I "$PIPELINE" "$SUB" "$@"
