#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

./scripts/run-with-mise.sh yarn test --run \
  tests/systems/legendary-wonder-system.test.ts \
  tests/systems/legendary-wonder-definitions.test.ts \
  tests/ui/wonder-panel.test.ts \
  tests/ui/council-panel.test.ts \
  tests/ui/legendary-wonder-notifications.test.ts \
  tests/systems/barbarian-system.test.ts \
  tests/ai/basic-ai.test.ts \
  tests/core/turn-manager.test.ts \
  tests/storage/save-persistence.test.ts
