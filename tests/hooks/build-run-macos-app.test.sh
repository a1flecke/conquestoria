#!/usr/bin/env bash
# Contract tests for the `mise run macos:run` entry point (scripts/build-run-macos-app.sh).
#
# The task is a human entry point, so it owns its own dependency state: a checkout whose
# generated Yarn PnP map predates package.json (or a fresh worktree with no map at all) must
# install first instead of surfacing as a TypeScript "cannot find module" during `tsc`. These
# tests pin the observable order, the routing, and the failure behavior without building an app.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

repo="$tmpdir/repo"
bin="$tmpdir/bin"
wrapper_log="$tmpdir/wrapper.log"
yarn_log="$tmpdir/yarn.log"
open_log="$tmpdir/open.log"
app_path="$repo/src-tauri/target/release/bundle/macos/Conquestoria.app"
expected_log="$tmpdir/expected.log"

mkdir -p "$repo/scripts" "$repo/src-tauri/target/release/bundle/macos" "$bin"
cp "$ROOT/scripts/build-run-macos-app.sh" "$repo/scripts/build-run-macos-app.sh"
chmod +x "$repo/scripts/build-run-macos-app.sh"

fail() {
  echo "$*" >&2
  exit 1
}

# Stand-in for the worktree wrapper: records the command and the ad-hoc signing identity, so the
# test can prove both that the wrapper was used and what it was asked to do.
cat > "$repo/scripts/run-with-mise.sh" <<'EOF'
#!/bin/sh
printf '%s|%s\n' "${APPLE_SIGNING_IDENTITY-<unset>}" "$*" >> "$WRAPPER_LOG"
if [ "${FAIL_INSTALL:-0}" = 1 ] && [ "$*" = 'yarn install --immutable' ]; then
  echo 'install refused' >&2
  exit 1
fi
exit 0
EOF
chmod +x "$repo/scripts/run-with-mise.sh"

# A bare `yarn` must never run: the task has to route through scripts/run-with-mise.sh, which is
# what enforces the active-worktree dependency contract.
cat > "$bin/yarn" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$YARN_LOG"
exit 0
EOF

cat > "$bin/codesign" <<'EOF'
#!/bin/sh
: > "$CODESIGN_LOG"
EOF

cat > "$bin/xattr" <<'EOF'
#!/bin/sh
exit 0
EOF

cat > "$bin/open" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$OPEN_LOG"
EOF

chmod +x "$bin/yarn" "$bin/codesign" "$bin/xattr" "$bin/open"

status=0
output=''
run_task() {
  : > "$wrapper_log"
  : > "$yarn_log"
  : > "$open_log"
  set +e
  output="$(PATH="$bin:$PATH" WRAPPER_LOG="$wrapper_log" YARN_LOG="$yarn_log" OPEN_LOG="$open_log" \
    CODESIGN_LOG="$tmpdir/codesign.log" FAIL_INSTALL="${FAIL_INSTALL:-0}" \
    sh "$repo/scripts/build-run-macos-app.sh" "$@" 2>&1)"
  status=$?
  set -e
}

# 1. Dependencies are provisioned through the wrapper before the app build, and only the build
#    runs with the ad-hoc signing identity.
run_task --no-open
[ "$status" -eq 0 ] || fail "task failed for --no-open (exit $status): $output"
printf '<unset>|yarn install --immutable\n-|yarn tauri:build:mac-app\n' > "$expected_log"
diff -u "$expected_log" "$wrapper_log" || fail 'the task must install dependencies first, then build, both through scripts/run-with-mise.sh'
[ ! -s "$yarn_log" ] || fail "bare yarn was invoked ($(cat "$yarn_log")); the task must route through scripts/run-with-mise.sh"

# 2. --no-open builds and reports the bundle without launching it.
[ ! -s "$open_log" ] || fail '--no-open launched the app'
printf '%s' "$output" | grep -Fq "Built macOS app: $app_path" || fail '--no-open did not report the built bundle'

# 3. The default run opens the bundle it just built.
run_task
[ "$status" -eq 0 ] || fail "task failed for the default run (exit $status): $output"
[ "$(cat "$open_log")" = "$app_path" ] || fail 'the default run did not open the built bundle'

# 4. A failed install aborts before the build, so a stale install can never reach `tauri build`.
FAIL_INSTALL=1 run_task --no-open
[ "$status" -ne 0 ] || fail 'a failed dependency install did not stop the task'
printf '<unset>|yarn install --immutable\n' > "$expected_log"
diff -u "$expected_log" "$wrapper_log" || fail 'the app build ran after a failed dependency install'

# 5. An unknown argument is refused before anything is provisioned or built.
run_task --bogus
[ "$status" -eq 2 ] || fail "an unknown argument exited $status instead of 2"
printf '%s' "$output" | grep -Fq 'Usage: mise run macos:run' || fail 'an unknown argument did not print usage'
[ ! -s "$wrapper_log" ] || fail 'an unknown argument still provisioned or built'
