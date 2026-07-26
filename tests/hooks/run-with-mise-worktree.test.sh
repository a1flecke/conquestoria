#!/usr/bin/env bash
# Functional contract tests for linked-worktree command routing.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
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
printf 'runtime base\n' > "$main/base.txt"
git -C "$main" add .
git -C "$main" commit -q -m base
git -C "$main" worktree add -q -b linked "$linked"
main="$(cd "$main" && pwd -P)"
linked="$(cd "$linked" && pwd -P)"

# A stale main branch must never be selected as an executor for linked-worktree
# commands. Its wrapper is deliberately fatal; a correct adapter never reads it.
cat > "$main/scripts/run-with-mise.sh" <<'EOF'
#!/bin/sh
echo 'stale main wrapper executed' >&2
exit 99
EOF
chmod +x "$main/scripts/run-with-mise.sh"

cat > "$fake_bin/mise" <<'EOF'
#!/bin/sh
printf '%s|%s|%s|%s\n' "$PWD" "${CONQUESTORIA_VITEST_CACHE_DIR:-}" "${GIT_DIR:-}" "$*" >> "$MISE_LOG"
exit 0
EOF
chmod +x "$fake_bin/mise"

# A linked worktree without its own PnP map must be told to install from its
# own lockfile rather than borrowing a potentially stale map from main.
set +e
missing_output="$(
  cd "$linked"
  PATH="$fake_bin:$PATH" MISE_LOG="$mise_log" \
    ./scripts/run-with-mise.sh yarn test 2>&1
)"
missing_status=$?
set -e
[ "$missing_status" -ne 0 ] || {
  echo 'dependency-requiring command ran without an active-worktree PnP map' >&2
  exit 1
}
printf '%s' "$missing_output" | grep -Fq 'yarn install --immutable' || {
  echo 'missing-runtime error did not provide the active install command' >&2
  exit 1
}

# A linked PnP file is just as unsafe: it can describe a different branch's
# dependency graph and must be rejected in favor of an active install.
touch "$main/.pnp.cjs"
ln -s "$main/.pnp.cjs" "$linked/.pnp.cjs"
set +e
linked_output="$(
  cd "$linked"
  PATH="$fake_bin:$PATH" MISE_LOG="$mise_log" \
    ./scripts/run-with-mise.sh yarn build 2>&1
)"
linked_status=$?
set -e
[ "$linked_status" -ne 0 ] && printf '%s' "$linked_output" | grep -Fq 'yarn install --immutable' || {
  echo 'linked PnP map was accepted as an active dependency graph' >&2
  exit 1
}
rm "$linked/.pnp.cjs"
touch "$linked/.pnp.cjs"

rm -f "$mise_log"
(
  cd "$linked"
  PATH="$fake_bin:$PATH" MISE_LOG="$mise_log" GIT_DIR="$(git -C "$linked" rev-parse --git-dir)" \
    ./scripts/run-with-mise.sh yarn test --run tests/systems/example.test.ts
)
grep -Fq "$linked|$linked/.vite/vitest||exec -- yarn test --run tests/systems/example.test.ts" "$mise_log" || {
  echo 'focused test did not use the active worktree package command' >&2
  exit 1
}

for command in 'test:fast' 'test:slow' 'test:watch' build build:tauri test:web-smoke verify:push; do
  rm -f "$mise_log"
  (
    cd "$linked"
    PATH="$fake_bin:$PATH" MISE_LOG="$mise_log" \
      ./scripts/run-with-mise.sh yarn "$command"
  )
  grep -Fq "$linked|$linked/.vite/vitest||exec -- yarn $command" "$mise_log" || {
    echo "$command did not execute through the active worktree package command" >&2
    exit 1
  }
done

# Installation is active-worktree-local: it materializes the PnP map for that
# exact package.json/yarn.lock while Yarn's download cache remains shared.
rm -f "$mise_log"
(
  cd "$linked"
  PATH="$fake_bin:$PATH" MISE_LOG="$mise_log" \
    ./scripts/run-with-mise.sh yarn install --immutable
)
grep -Fq "$linked|$linked/.vite/vitest||exec -- yarn install --immutable" "$mise_log" || {
  echo 'install did not target the active worktree' >&2
  exit 1
}
