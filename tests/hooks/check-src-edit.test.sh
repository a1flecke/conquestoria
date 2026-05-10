#!/usr/bin/env bash
# Smoke test: check-src-edit.sh must exit 2 with feedback when a Write/Edit
# under src/ contains a known rule violation, and exit 0 for clean files or
# files outside src/. The hook reads the actual file contents on disk, so the
# test writes fixture files under a temp src/ tree and points the hook at them.
set -u
HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/check-src-edit.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/src/ui" "$tmp/src/systems" "$tmp/src/ai"

fail=0

run_hook() {
  local file="$1"
  echo "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$file\"}}" \
    | bash "$HOOK" 2>&1
}

expect_block() {
  local file="$1" name="$2"
  out="$(run_hook "$file")"; rc=$?
  if [ "$rc" != "2" ]; then
    echo "expected exit 2 for $name ($file), got $rc"; echo "$out"; fail=1
  fi
}

expect_allow() {
  local file="$1" name="$2"
  out="$(run_hook "$file")"; rc=$?
  if [ "$rc" != "0" ]; then
    echo "expected exit 0 for $name ($file), got $rc"; echo "$out"; fail=1
  fi
}

# --- block: cities[0] in a UI file ---
cat > "$tmp/src/ui/panel.ts" <<'EOF'
const c = state.civ.cities[0];
EOF
expect_block "$tmp/src/ui/panel.ts" "cities[0] in src/ui"

# --- allow: cities[0] in src/ai (capital heuristic exception) ---
cat > "$tmp/src/ai/basic-ai.ts" <<'EOF'
const capital = civ.cities[0];
EOF
expect_allow "$tmp/src/ai/basic-ai.ts" "cities[0] allowed in src/ai"

# --- block: Math.random in src ---
cat > "$tmp/src/systems/rng-bug.ts" <<'EOF'
const x = Math.random();
EOF
expect_block "$tmp/src/systems/rng-bug.ts" "Math.random in src"

# --- block: hardcoded 'player' ownership check ---
cat > "$tmp/src/ui/owner-check.ts" <<'EOF'
if (unit.owner === 'player') doStuff();
EOF
expect_block "$tmp/src/ui/owner-check.ts" "hardcoded 'player'"

# --- block: direct state mutation in turn processing ---
cat > "$tmp/src/systems/mutation.ts" <<'EOF'
state.cities[id] = { ...city };
EOF
expect_block "$tmp/src/systems/mutation.ts" "direct state mutation"

# --- block: innerHTML with template literal interpolation ---
cat > "$tmp/src/ui/xss.ts" <<'EOF'
el.innerHTML = `<div>${name}</div>`;
EOF
expect_block "$tmp/src/ui/xss.ts" "innerHTML with template literal"

# --- allow: clean src file ---
cat > "$tmp/src/systems/clean.ts" <<'EOF'
export function add(a: number, b: number): number { return a + b; }
EOF
expect_allow "$tmp/src/systems/clean.ts" "clean src file"

# --- allow: file outside src/ ---
mkdir -p "$tmp/tests"
cat > "$tmp/tests/example.test.ts" <<'EOF'
const x = Math.random();
EOF
expect_allow "$tmp/tests/example.test.ts" "non-src file ignored"

# --- allow: missing file (defensive no-op) ---
expect_allow "$tmp/src/does-not-exist.ts" "missing file"

# --- allow: empty payload (no file_path) ---
out="$(echo '{}' | bash "$HOOK" 2>&1)"; rc=$?
if [ "$rc" != "0" ]; then
  echo "expected exit 0 for empty payload, got $rc ($out)"; fail=1
fi

exit "$fail"
