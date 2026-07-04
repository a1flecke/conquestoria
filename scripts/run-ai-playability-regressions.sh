#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

./scripts/run-with-mise.sh node ./scripts/run-with-timeout.mjs 300 ai-playability -- \
  ./scripts/run-with-mise.sh yarn test --run \
  tests/simulation/ai-playability.test.ts \
  --testTimeout=120000 \
  --hookTimeout=120000
