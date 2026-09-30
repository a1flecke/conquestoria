#!/usr/bin/env bash
# One well-known, permission-friendly place for pull-request bodies.
#
# Agents kept improvising a temp file for `gh pr create --body-file` in random
# locations outside the repo (each one a fresh permission prompt, sometimes a
# refused write). Every body now lives in ONE directory -- /tmp/pr-bodies by
# default -- so a single narrow permission rule covers all of them:
#
#   Claude Code   Write(/tmp/pr-bodies/**)  Edit(/tmp/pr-bodies/**)  Read(/tmp/pr-bodies/**)
#   OpenCode      allow the external directory /tmp/pr-bodies
#
# (the project's .claude/settings.json already carries the Claude Code rules;
# see .claude/rules/hooks-and-tooling.md "PR bodies" for the global snippets).
#
# Names are validated (no path separators, no traversal, no dotfiles), the
# directory must be a real directory owned by the caller (never a symlink), and
# nothing here ever touches a path outside it -- so allowing the directory does
# not widen what an agent can write.

set -euo pipefail

ROOT="${PR_BODY_DIR:-/tmp/pr-bodies}"

usage() {
  cat >&2 <<'USAGE'
Usage: pr-body.sh <command> ...

  path   <name>                        print the body file path (creates the directory)
  new    <name> [--issue N] [--force]  seed a template (never overwrites without --force); prints the path
  write  <name>                        write stdin to the body file atomically; prints the path
  check  <name>                        validate the body (non-empty, no unfilled placeholders, has a Summary)
  create <name> --title T [gh flags]   check, then `gh pr create --title T --body-file <file> [gh flags]`
  update <pr-number> <name>            check, then `gh pr edit <pr-number> --body-file <file>`
  list                                 list existing bodies
  clean  [--days N]                    delete bodies older than N days (default 14); this directory only

Environment: PR_BODY_DIR (default /tmp/pr-bodies), PR_BODY_FOOTER (appended by
create/update when not already present, e.g. an attribution line).
USAGE
  exit 2
}

die() { echo "pr-body: $*" >&2; exit 1; }

validate_name() {
  local name="${1:-}"
  name="${name%.md}"
  [[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$ ]] || die "invalid body name '${1:-}': use letters, digits, '.', '_', '-' (no slashes, no leading dot)"
  [[ "$name" != *..* ]] || die "invalid body name '${1:-}': '..' is not allowed"
  printf '%s\n' "$name"
}

ensure_root() {
  if [[ -L "$ROOT" ]]; then die "$ROOT is a symlink; refusing"; fi
  mkdir -p "$ROOT"
  [[ -d "$ROOT" ]] || die "$ROOT is not a directory"
  [[ -O "$ROOT" ]] || die "$ROOT is not owned by you; refusing"
  chmod 700 "$ROOT" 2>/dev/null || true
}

body_path() {
  local name
  name="$(validate_name "$1")"
  printf '%s/%s.md\n' "$ROOT" "$name"
}

guard_file() {
  # guard_file <path>: must be a regular file, not a symlink, directly inside ROOT.
  local file="$1"
  [[ -e "$file" ]] || die "no such body: $file"
  [[ ! -L "$file" ]] || die "$file is a symlink; refusing"
  [[ -f "$file" ]] || die "$file is not a regular file"
}

cmd_path() {
  [[ $# -eq 1 ]] || usage
  ensure_root
  body_path "$1"
}

cmd_new() {
  [[ $# -ge 1 ]] || usage
  local name="$1" issue="" force=0
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --issue) shift; [[ $# -gt 0 && "$1" =~ ^[0-9]+$ ]] || usage; issue="$1" ;;
      --force) force=1 ;;
      *) usage ;;
    esac
    shift
  done
  ensure_root
  local file
  file="$(body_path "$name")"
  if [[ -e "$file" && "$force" -ne 1 ]]; then
    echo "pr-body: $file already exists (kept; pass --force to reseed)" >&2
    printf '%s\n' "$file"
    return 0
  fi
  {
    echo '## Summary'
    echo
    echo '<!-- TODO(pr-body): what changed and why, in a few sentences -->'
    echo
    echo '## Why this is safe / what was verified'
    echo
    echo '<!-- TODO(pr-body): commands run and their results; anything not run and why -->'
    if [[ -n "$issue" ]]; then
      echo
      echo "Closes #$issue"
    fi
  } > "$file.tmp.$$"
  mv "$file.tmp.$$" "$file"
  printf '%s\n' "$file"
}

cmd_write() {
  [[ $# -eq 1 ]] || usage
  ensure_root
  local file tmp
  file="$(body_path "$1")"
  tmp="$file.tmp.$$"
  cat > "$tmp"
  if [[ ! -s "$tmp" ]]; then
    rm -f "$tmp"
    die "refusing to write an empty body (stdin was empty)"
  fi
  mv "$tmp" "$file"
  printf '%s\n' "$file"
}

cmd_check() {
  [[ $# -eq 1 ]] || usage
  ensure_root
  local file
  file="$(body_path "$1")"
  guard_file "$file"
  [[ -s "$file" ]] || die "$file is empty"
  if grep -n 'TODO(pr-body)' "$file" >&2; then
    die "$file still has unfilled TODO(pr-body) placeholders"
  fi
  grep -q '^## Summary' "$file" || die "$file has no '## Summary' section"
  # Never auto-close an issue by accident (a "Closes #N" for a follow-up's issue closes it on merge).
  # Surface each closing keyword so the author confirms it is deliberate; this does not fail.
  if grep -n -i -E '\b(close[sd]?|fix(e[sd])?|resolve[sd]?)[[:space:]]+#[0-9]+' "$file"; then
    echo "pr-body: note -- the lines above will CLOSE those issues when the PR merges." >&2
  fi
}

with_footer() {
  # with_footer <file> -> prints the file path to hand to gh (a temp copy when a footer is appended)
  local file="$1"
  if [[ -n "${PR_BODY_FOOTER:-}" ]] && ! grep -qF -- "$PR_BODY_FOOTER" "$file"; then
    local copy="$file.footer.$$"
    { cat "$file"; printf '\n\n%s\n' "$PR_BODY_FOOTER"; } > "$copy"
    printf '%s\n' "$copy"
  else
    printf '%s\n' "$file"
  fi
}

cmd_create() {
  [[ $# -ge 1 ]] || usage
  local name="$1" title=""
  shift
  local -a rest=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --title) shift; [[ $# -gt 0 ]] || usage; title="$1" ;;
      *) rest+=("$1") ;;
    esac
    shift
  done
  [[ -n "$title" ]] || die "create needs --title"
  cmd_check "$name"
  local file handed
  file="$(body_path "$name")"
  handed="$(with_footer "$file")"
  local status=0
  gh pr create --title "$title" --body-file "$handed" "${rest[@]+"${rest[@]}"}" || status=$?
  [[ "$handed" == "$file" ]] || rm -f "$handed"
  return "$status"
}

cmd_update() {
  [[ $# -eq 2 && "$1" =~ ^[0-9]+$ ]] || usage
  cmd_check "$2"
  local file handed
  file="$(body_path "$2")"
  handed="$(with_footer "$file")"
  local status=0
  gh pr edit "$1" --body-file "$handed" || status=$?
  [[ "$handed" == "$file" ]] || rm -f "$handed"
  return "$status"
}

cmd_list() {
  [[ $# -eq 0 ]] || usage
  ensure_root
  local found=0
  for file in "$ROOT"/*.md; do
    [[ -f "$file" && ! -L "$file" ]] || continue
    found=1
    printf '%s\n' "$file"
  done
  [[ "$found" -eq 1 ]] || echo "(no bodies in $ROOT)" >&2
}

cmd_clean() {
  local days=14
  if [[ $# -gt 0 ]]; then
    [[ "$1" == "--days" && $# -eq 2 && "$2" =~ ^[0-9]+$ ]] || usage
    days="$2"
  fi
  ensure_root
  # Regular files directly inside ROOT only; -mindepth/-maxdepth pin it, -type f skips symlinks.
  find "$ROOT" -mindepth 1 -maxdepth 1 -type f -name '*.md' -mtime "+$days" -print -delete
}

[[ $# -ge 1 ]] || usage
command="$1"
shift
case "$command" in
  path) cmd_path "$@" ;;
  new) cmd_new "$@" ;;
  write) cmd_write "$@" ;;
  check) cmd_check "$@" ;;
  create) cmd_create "$@" ;;
  update) cmd_update "$@" ;;
  list) cmd_list "$@" ;;
  clean) cmd_clean "$@" ;;
  -h|--help) usage ;;
  *) usage ;;
esac
