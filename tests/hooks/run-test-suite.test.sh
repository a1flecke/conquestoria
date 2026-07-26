#!/usr/bin/env sh
# Package test commands must forward focused filters to Vitest, then run hooks.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

fake_bin="$tmpdir/bin"
log="$tmpdir/log"
mkdir -p "$fake_bin"

cat > "$fake_bin/yarn" <<'EOF'
#!/bin/sh
printf 'yarn %s\n' "$*" >> "$TEST_LOG"
EOF
cat > "$fake_bin/bash" <<'EOF'
#!/bin/sh
printf 'bash %s\n' "$*" >> "$TEST_LOG"
EOF
chmod +x "$fake_bin/yarn" "$fake_bin/bash"

PATH="$fake_bin:$PATH" TEST_LOG="$log" \
  sh "$ROOT/scripts/run-test-suite.sh" full --run tests/systems/city-system.test.ts

grep -Fxq 'yarn vitest run --run tests/systems/city-system.test.ts' "$log" || {
  echo 'focused filters were not forwarded to Vitest' >&2
  exit 1
}
grep -Fxq 'bash tests/hooks/run.sh' "$log" || {
  echo 'full test suite did not run hook smoke tests after Vitest' >&2
  exit 1
}
