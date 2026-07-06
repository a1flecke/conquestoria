#!/usr/bin/env bash
# Functional tests for linked-worktree command routing.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAIN_ROOT="$(git -C "$ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree /{sub(/^worktree /, ""); print; exit}')"

if [ -n "$MAIN_ROOT" ] && [ "$ROOT" != "$MAIN_ROOT" ]; then
  observed="$(cd "$ROOT" && ./scripts/run-with-mise.sh yarn node -e 'console.log(process.cwd())')" || exit 1
  [ "$observed" = "$ROOT" ] || {
    echo "expected yarn node cwd $ROOT, got $observed"
    exit 1
  }
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

main="$tmpdir/main"
linked="$tmpdir/linked"
fake_bin="$tmpdir/bin"
mise_log="$tmpdir/mise.log"

git init -q "$main"
git -C "$main" config user.name Test
git -C "$main" config user.email test@example.com
mkdir -p "$main/scripts" "$fake_bin"
cp "$ROOT/scripts/run-with-mise.sh" "$main/scripts/run-with-mise.sh"
cp "$ROOT/scripts/setup-git-hooks.sh" "$main/scripts/setup-git-hooks.sh"
cp -R "$ROOT/.githooks" "$main/.githooks"
cp "$ROOT/mise.toml" "$main/mise.toml"
printf 'base\n' > "$main/base.txt"
git -C "$main" add .
git -C "$main" commit -q -m base
git -C "$main" worktree add -q -b linked "$linked"
main="$(cd "$main" && pwd -P)"
linked="$(cd "$linked" && pwd -P)"

# Simulate version skew: the main checkout can still have the older wrapper
# while the linked branch contains this fix. The linked wrapper must not leak
# hook-exported Git variables when it delegates into the main checkout.
cat > "$main/scripts/run-with-mise.sh" <<'EOF'
#!/bin/sh
set -eu
[ -z "${GIT_DIR:-}" ] || {
  echo "linked-worktree GIT_DIR leaked into main wrapper" >&2
  exit 41
}
[ "$*" != "yarn bin tauri" ] || {
  printf '%s\n' '/fake/tauri.js'
  exit 0
}
exec mise exec -- "$@"
EOF
chmod +x "$main/scripts/run-with-mise.sh"

cat > "$fake_bin/mise" <<'EOF'
#!/bin/sh
printf '%s|%s\n' "$PWD" "$*" >> "$MISE_LOG"
exit 0
EOF
chmod +x "$fake_bin/mise"

cat > "$fake_bin/node" <<'EOF'
#!/bin/sh
echo "worktree wrapper invoked node outside mise" >&2
exit 43
EOF
chmod +x "$fake_bin/node"

linked_git_dir="$(git -C "$linked" rev-parse --git-dir)"

rm -f "$mise_log"
(
  cd "$linked"
  PATH="$fake_bin:$PATH" \
    MISE_LOG="$mise_log" \
    GIT_DIR="$linked_git_dir" \
    ./scripts/run-with-mise.sh yarn install --immutable
)
install_cwd="$(cut -d'|' -f1 "$mise_log")"
install_cwd="$(cd "$install_cwd" && pwd -P)"
[ "$install_cwd" = "$main" ] || {
  echo "first linked-worktree install ran in $install_cwd instead of $main"
  exit 1
}

rm -f "$mise_log"
set +e
missing_output="$(
  cd "$linked"
  PATH="$fake_bin:$PATH" \
    MISE_LOG="$mise_log" \
    ./scripts/run-with-mise.sh yarn test 2>&1
)"
missing_status=$?
set -e
[ "$missing_status" -ne 0 ] || {
  echo "dependency-requiring command ran without main-worktree .pnp.cjs"
  exit 1
}
printf '%s' "$missing_output" | grep -Fq 'yarn install --immutable' || {
  echo "missing-dependency error did not provide the install command"
  exit 1
}

touch "$main/.pnp.cjs"
mkdir -p "$linked/tests/hooks"
cat > "$linked/tests/hooks/run.sh" <<'EOF'
#!/bin/sh
[ -z "${GIT_DIR:-}" ] || {
  echo "linked-worktree GIT_DIR leaked into hook smoke tests" >&2
  exit 42
}
EOF
chmod +x "$linked/tests/hooks/run.sh"

rm -f "$mise_log"
(
  cd "$linked"
  PATH="$fake_bin:$PATH" \
    MISE_LOG="$mise_log" \
    ./scripts/run-with-mise.sh yarn build
)
grep -Fq "$linked|exec -- node $linked/scripts/version-sw-cache.mjs" "$mise_log" || {
  echo "worktree build did not route service-worker versioning through mise"
  exit 1
}

rm -f "$mise_log"
(
  cd "$linked"
  PATH="$fake_bin:$PATH" \
    MISE_LOG="$mise_log" \
    ./scripts/run-with-mise.sh yarn tauri:build:mac-app
)
grep -Eq "^$linked\\|exec -- node /fake/tauri\\.js build --config .* --bundles app$" "$mise_log" || {
  echo "worktree macOS app build ran outside the active worktree"
  exit 1
}
grep -Fq './scripts/run-with-mise.sh yarn build:tauri' "$mise_log" || {
  echo "worktree macOS app build did not override the frontend command"
  exit 1
}

rm -f "$mise_log"
(
  cd "$linked"
  PATH="$fake_bin:$PATH" \
    MISE_LOG="$mise_log" \
    ./scripts/run-with-mise.sh yarn tauri:check:mac-artifacts
)
grep -Fq "$linked|exec -- node $linked/scripts/check-tauri-macos-artifacts.mjs" "$mise_log" || {
  echo "worktree macOS artifact check ran outside the active worktree"
  exit 1
}

verify_marker="$tmpdir/linked-verifier-ran"
cat > "$linked/scripts/verify-before-push.sh" <<EOF
#!/bin/sh
printf 'ran\n' > "$verify_marker"
EOF
chmod +x "$linked/scripts/verify-before-push.sh"

(
  cd "$linked"
  PATH="$fake_bin:$PATH" \
    MISE_LOG="$mise_log" \
    GIT_DIR="$linked_git_dir" \
    ./scripts/run-with-mise.sh yarn test
)

(
  cd "$linked"
  PATH="$fake_bin:$PATH" \
    MISE_LOG="$mise_log" \
    ./scripts/run-with-mise.sh yarn verify:push
)
[ -f "$verify_marker" ] || {
  echo "canonical verifier package route ran from the main worktree"
  exit 1
}

(
  cd "$linked"
  PATH="$fake_bin:$PATH" \
    MISE_LOG="$mise_log" \
    ./scripts/run-with-mise.sh yarn setup:hooks >/dev/null
)
hooks_path="$(git -C "$linked" config core.hooksPath)"
[ "$hooks_path" = ".githooks" ] || {
  echo "hook setup was not applied to the active linked worktree: $hooks_path"
  exit 1
}
