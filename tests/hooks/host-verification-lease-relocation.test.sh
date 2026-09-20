#!/usr/bin/env bash
# #1133 (item A). The host verification lease used to live under
# <git-common-dir>/conquestoria-verification-lease -- inside `.git`. Codex's
# default workspace-write sandbox protects `.git` (and, for a linked
# worktree, the resolved gitdir target) read-only, so that coordination
# primitive was unusable by design for one of the two agent runtimes this
# repo supports. This test proves the relocated default (see
# hvl_resolve_host_scope_dir in scripts/host-verification-lease.sh):
#   1. never resolves under `.git`,
#   2. resolves identically for two linked worktrees of the same clone,
#   3. resolves differently for a separate, unrelated clone,
#   4. is fully usable (acquire + release a real lease) even when the
#      fake repo's `.git` is read-only, simulating that sandbox exactly.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/host-verification-lease.sh"
RUNNER="$ROOT/scripts/run-under-host-lease.sh"

tmpdir="$(mktemp -d)"
cleanup() {
  # A read-only .git (case 4 below) must be restored to writable before rm -rf,
  # or the directory removal itself fails.
  chmod -R u+w "$tmpdir" 2>/dev/null || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT

# make_fake_repo <dir>: an isolated git repo with its own scripts/ dir
# symlinking the real library + runner, so `$0`'s directory (which
# hvl_resolve_host_scope_dir relies on) resolves inside THIS fake repo.
make_fake_repo() {
  repo_dir="$1"
  mkdir -p "$repo_dir/scripts"
  ln -s "$LIB" "$repo_dir/scripts/host-verification-lease.sh"
  ln -s "$RUNNER" "$repo_dir/scripts/run-under-host-lease.sh"
  cat > "$repo_dir/scripts/probe.sh" <<'EOF'
#!/bin/sh
. "$(dirname "$0")/host-verification-lease.sh"
hvl_resolve_host_scope_dir
EOF
  chmod +x "$repo_dir/scripts/probe.sh"
  (
    cd "$repo_dir"
    git init --quiet
    git config user.email test@example.com
    git config user.name test
    printf 'x\n' > README
    git add README
    git commit -q -m init
  )
}

# link_worktree_scripts <worktree-dir>: a `git worktree add` checkout only
# carries tracked files, not the untracked scripts/ symlinks -- recreate
# them so the probe works there too.
link_worktree_scripts() {
  wt_dir="$1"
  mkdir -p "$wt_dir/scripts"
  ln -s "$LIB" "$wt_dir/scripts/host-verification-lease.sh"
  ln -s "$RUNNER" "$wt_dir/scripts/run-under-host-lease.sh"
  cat > "$wt_dir/scripts/probe.sh" <<'EOF'
#!/bin/sh
. "$(dirname "$0")/host-verification-lease.sh"
hvl_resolve_host_scope_dir
EOF
  chmod +x "$wt_dir/scripts/probe.sh"
}

# --- 1. default resolution never lands under .git -----------------------

mkdir -p "$tmpdir/xdg-tmp"
repo_a="$tmpdir/repo-a"
make_fake_repo "$repo_a"

root_a="$(cd "$repo_a" && HOME="$tmpdir/home" TMPDIR="$tmpdir/xdg-tmp" sh scripts/probe.sh)"

case "$root_a" in
  *"/.git"*|"$repo_a/.git"*)
    echo "default lease root resolved under .git: $root_a" >&2
    exit 1
    ;;
esac
case "$root_a" in
  "$tmpdir/xdg-tmp"/*) : ;;
  *)
    echo "default lease root did not resolve under the injected TMPDIR: $root_a" >&2
    exit 1
    ;;
esac

# --- 2. two linked worktrees of the same clone share the same root ------

worktree_b="$tmpdir/repo-a-worktree-b"
(cd "$repo_a" && git worktree add -q -b wt-b "$worktree_b")
link_worktree_scripts "$worktree_b"

root_b="$(cd "$worktree_b" && HOME="$tmpdir/home" TMPDIR="$tmpdir/xdg-tmp" sh scripts/probe.sh)"

[ "$root_a" = "$root_b" ] || {
  echo "two linked worktrees of the same clone resolved to different lease roots:" >&2
  echo "  main:     $root_a" >&2
  echo "  worktree: $root_b" >&2
  exit 1
}

# --- 3. a separate, unrelated clone resolves to a different root --------

repo_c="$tmpdir/repo-c"
make_fake_repo "$repo_c"
root_c="$(cd "$repo_c" && HOME="$tmpdir/home" TMPDIR="$tmpdir/xdg-tmp" sh scripts/probe.sh)"

[ "$root_a" != "$root_c" ] || {
  echo "two unrelated clones resolved to the same lease root: $root_a" >&2
  exit 1
}

# --- 4. fully usable (real acquire+release) with a read-only .git -------
#     (simulates Codex's default workspace-write sandbox, which protects
#     .git -- and a linked worktree's resolved gitdir -- read-only)

repo_d="$tmpdir/repo-d"
make_fake_repo "$repo_d"
chmod -R a-w "$repo_d/.git"

lease_log="$tmpdir/lease-readonly-git.log"
(
  cd "$repo_d"
  HOME="$tmpdir/home" TMPDIR="$tmpdir/xdg-tmp" \
    sh scripts/run-under-host-lease.sh readonly-git-probe -- sh -c 'echo ran-under-readonly-git; exit 0'
) > "$lease_log" 2>&1
lease_status=$?
chmod -R u+w "$repo_d/.git"

[ "$lease_status" -eq 0 ] || {
  echo "acquiring the lease failed with a read-only .git (status $lease_status):" >&2
  cat "$lease_log" >&2
  exit 1
}
grep -Fq 'ran-under-readonly-git' "$lease_log" || {
  echo "the wrapped command never ran with a read-only .git:" >&2
  cat "$lease_log" >&2
  exit 1
}

# --- 5. the resolved path is keyed by the real uid, not a shared bucket -

real_uid="$(id -u)"
case "$root_a" in
  *"/$real_uid/"*) : ;;
  *)
    echo "default lease root is not keyed by uid ($real_uid): $root_a" >&2
    exit 1
    ;;
esac

echo "all host-verification-lease relocation scenarios passed"
