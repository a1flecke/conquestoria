#!/bin/sh
# read-verification-proof.sh <capability>... (#1166)
#
# Exits 0 (and prints `STATUS: satisfied`) only when this worktree holds a
# verification proof, recorded by scripts/verify-pr.sh, that covers every
# requested capability for EXACTLY the current state. Otherwise exits 1 and
# prints `STATUS: unsatisfied` plus the reason on stderr. It never starts any
# verification itself, so a gate can ask it first and fall back to running
# the real checks.
#
# Capabilities: build, test:regular, test:full. `test:full` satisfies
# `test:regular`: both run the same default Vitest config (vite.config.ts)
# and the same tests/hooks suite; `regular` only additionally excludes
# scripts/run-tests-by-local-tier.sh's SLOW_TEST_FILES.
#
# Validity rules -- a stale or mismatched proof must never skip verification:
#   - proof_format must be the one this reader understands;
#   - recorded worktree path and HEAD must equal the current ones;
#   - the current worktree must be clean (porcelain empty, untracked files
#     included). verify-pr.sh grants capabilities only when its run was clean
#     from start to finish, so HEAD then pins every tracked input -- tests,
#     configs, lockfile, toolchain pins (mise.toml) and the verification
#     scripts themselves. A porcelain-state checksum alone is NOT enough for a
#     dirty tree: editing an already-modified file leaves ` M path` unchanged;
#   - exit_code must be 0.

set -eu

[ "$#" -ge 1 ] || {
  echo 'Usage: read-verification-proof.sh <capability>...' >&2
  exit 2
}

# Its main caller is the git pre-push hook, and git exports GIT_DIR (and friends)
# to hooks. With GIT_DIR set but no GIT_WORK_TREE, `git -C scripts rev-parse
# --show-toplevel` answers with the scripts directory itself, so the recorded
# worktree never matched and a valid proof was silently ignored. Resolve the
# repository from this script's location only (same approach as
# scripts/run-with-mise.sh).
for hook_git_var in $(git rev-parse --local-env-vars 2>/dev/null); do
  unset "$hook_git_var"
done

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
artifact_dir="${VERIFY_PR_ARTIFACT_DIR:-$repo_root/.verification}"
proof="$artifact_dir/pr-verification.status"

unsatisfied() {
  echo 'STATUS: unsatisfied'
  echo "verification proof: $1" >&2
  exit 1
}

field() {
  sed -n "s/^$1=//p" "$proof" | head -n 1
}

[ -f "$proof" ] || unsatisfied "no proof recorded (run yarn verify:pr)."
[ "$(field proof_format)" = '1' ] || unsatisfied "unsupported proof format."
[ "$(field worktree)" = "$repo_root" ] || unsatisfied "proof belongs to a different worktree."
[ "$(field head)" = "$(git -C "$repo_root" rev-parse HEAD)" ] || unsatisfied "proof belongs to a different HEAD."
[ -z "$(git -C "$repo_root" status --porcelain=v1 --untracked-files=all)" ] || unsatisfied "worktree is not clean."
[ "$(field exit_code)" = '0' ] || unsatisfied "recorded verification did not pass."

capabilities=",$(field capabilities),"
for required in "$@"; do
  case "$required" in
    build) wanted=',build,' ;;
    test:full) wanted=',test:full,' ;;
    test:regular)
      case "$capabilities" in
        *,test:regular,*|*,test:full,*) continue ;;
      esac
      unsatisfied "proof does not cover test:regular."
      ;;
    *)
      echo "read-verification-proof.sh: unknown capability '$required'" >&2
      exit 2
      ;;
  esac
  case "$capabilities" in
    *"$wanted"*) ;;
    *) unsatisfied "proof does not cover $required." ;;
  esac
done

echo 'STATUS: satisfied'
printf 'verification proof: %s satisfied by verify:pr evidence for %s.\n' "$*" "$(field head)"
