#!/usr/bin/env sh
# scripts/dev.sh <task> [test paths]: a narrow task dispatcher for build/test/verify commands (#1256).
#
# Why this exists: scripts/run-with-mise.sh ends in `mise exec -- "$@"`, so an approval layer that
# trusted it would also be trusting `run-with-mise.sh gh pr merge …` or `… node <any file>`. This
# script can run only the fixed tasks below, so it is safe to put in a trusted-scripts list.
#
# Contract (pinned by tests/hooks/dev-dispatcher.test.sh):
#   - every task is a hard-coded command through scripts/run-with-mise.sh; no caller word is ever
#     the command, and nothing is eval'd;
#   - no flags and no shell composition are needed: output goes to .verification/logs/<task>.log,
#     a header and the last 60 lines are printed, and `dev.sh log <task> [N]` shows more;
#   - the only forwarded arguments are the paths given to `test`, each validated by
#     validate_test_path (one legality source, a clear denial for every refusal);
#   - the exit status is the task's exit status. Usage and validation failures exit 2.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
MISE="$ROOT/scripts/run-with-mise.sh"
LOG_DIR_REL=".verification/logs"
TAIL_LINES=60
LOG_DEFAULT_LINES=200
LOG_MAX_LINES=5000

usage() {
  cat >&2 <<'USAGE'
usage: ./scripts/dev.sh <task> [args]

tasks (output is saved to .verification/logs/<task>.log; the last 60 lines are printed):
  build             yarn build
  typecheck         yarn tsc --noEmit
  typecheck-strict  yarn tsc --noEmit --noUnusedLocals --noUnusedParameters (dead locals/params; stricter than the build)
  test <paths>      yarn vitest run <paths>; each path is a *.test.ts(x) file or a directory under tests/
  test-all          yarn test (full suite + hook tests)
  test-regular      yarn test:regular
  hooks             hook smoke tests (tests/hooks/run.sh)
  install           yarn install --immutable
  setup-hooks       yarn setup:hooks
  verify-pr         yarn verify:pr
  verify-pr-status  yarn verify:pr:status
  verify-status     yarn verify:local:status (read-only view of every agent's runs)
  durable           yarn test:durable
  durable-status    yarn test:durable:status
  ai-playability    yarn test:ai-playability
  ai-playability-status  yarn test:ai-playability:status
  ai-long           yarn test:ai-long
  ai-long-status    yarn test:ai-long:status
  web-smoke         yarn test:web-smoke
  docs-lifecycle    node scripts/docs-lifecycle.mjs check
  verify-impact     yarn verify:impact (read-only: lists the evidence the current change requires)
  maintainability-check     node scripts/maintainability-audit.mjs --check (read-only drift check)
  maintainability-report    node scripts/maintainability-audit.mjs --report (rewrites docs/maintainability-audit-report.md)
  maintainability-baseline  node scripts/maintainability-audit.mjs --baseline (rewrites docs/maintainability-audit-baseline.json)
  log <task> [N]    last N lines (default 200, max 5000) of that task's saved log
USAGE
}

deny() {
  echo "dev.sh: $*" >&2
  exit 2
}

is_task() {
  case "$1" in
    build|typecheck|typecheck-strict|test|test-all|test-regular|hooks|install|setup-hooks|verify-pr|verify-pr-status|verify-status|durable|durable-status|ai-playability|ai-playability-status|ai-long|ai-long-status|web-smoke|docs-lifecycle|verify-impact|maintainability-check|maintainability-report|maintainability-baseline) return 0 ;;
    *) return 1 ;;
  esac
}

# The single legality source for a path handed to `test`. Prints nothing and returns 0 when the path is
# acceptable; otherwise exits 2 naming the rule it broke.
validate_test_path() {
  p="$1"
  [ -n "$p" ] || deny "test path rejected: empty path"
  case "$p" in
    [!A-Za-z0-9_@+]*) deny "test path '$p' rejected: must start with a letter, digit, _, @ or + (no flags, no absolute paths, no ~)" ;;
    *[!A-Za-z0-9._/@+-]*) deny "test path rejected: '$p' has a character outside A-Za-z0-9._/@+- (no spaces, quotes, globs or shell syntax)" ;;
    *..*) deny "test path '$p' rejected: '..' is not allowed" ;;
    */.*) deny "test path '$p' rejected: hidden files and directories (such as .env) are not allowed" ;;
  esac
  case "$p" in
    tests/*) ;;
    *) deny "test path '$p' rejected: must be under tests/" ;;
  esac
  [ -e "$ROOT/$p" ] || deny "test path '$p' rejected: it does not exist"
  [ ! -L "$ROOT/$p" ] || deny "test path '$p' rejected: symlinks are not allowed"
  if [ -d "$ROOT/$p" ]; then
    resolved="$(cd -P "$ROOT/$p" && pwd -P)"
  else
    resolved="$(cd -P "$(dirname "$ROOT/$p")" && pwd -P)/$(basename "$p")"
  fi
  case "$resolved" in
    "$ROOT/tests/"?*) ;;
    *) deny "test path '$p' rejected: it resolves outside $ROOT/tests/" ;;
  esac
  if [ -f "$ROOT/$p" ]; then
    case "$p" in
      *.test.ts|*.test.tsx) ;;
      *) deny "test path '$p' rejected: a file must end in .test.ts or .test.tsx" ;;
    esac
  elif [ ! -d "$ROOT/$p" ]; then
    deny "test path '$p' rejected: not a regular file or directory"
  fi
}

# Every command is spelled out here; the arguments after the task name are only ever appended to the
# fixed `yarn vitest run` prefix of the `test` task, after validation.
execute() {
  task="$1"
  shift
  case "$task" in
    build) bash "$MISE" yarn build ;;
    typecheck) bash "$MISE" yarn tsc --noEmit ;;
    typecheck-strict) bash "$MISE" yarn tsc --noEmit --noUnusedLocals --noUnusedParameters ;;
    test) bash "$MISE" yarn vitest run "$@" ;;
    test-all) bash "$MISE" yarn test ;;
    test-regular) bash "$MISE" yarn test:regular ;;
    hooks) bash "$MISE" bash tests/hooks/run.sh ;;
    install) bash "$MISE" yarn install --immutable ;;
    setup-hooks) bash "$MISE" yarn setup:hooks ;;
    verify-pr) bash "$MISE" yarn verify:pr ;;
    verify-pr-status) bash "$MISE" yarn verify:pr:status ;;
    verify-status) bash "$MISE" yarn verify:local:status ;;
    durable) bash "$MISE" yarn test:durable ;;
    durable-status) bash "$MISE" yarn test:durable:status ;;
    ai-playability) bash "$MISE" yarn test:ai-playability ;;
    ai-playability-status) bash "$MISE" yarn test:ai-playability:status ;;
    ai-long) bash "$MISE" yarn test:ai-long ;;
    ai-long-status) bash "$MISE" yarn test:ai-long:status ;;
    web-smoke) bash "$MISE" yarn test:web-smoke ;;
    docs-lifecycle) bash "$MISE" node scripts/docs-lifecycle.mjs check ;;
    verify-impact) bash "$MISE" yarn verify:impact ;;
    maintainability-check) bash "$MISE" node scripts/maintainability-audit.mjs --check ;;
    maintainability-report) bash "$MISE" node scripts/maintainability-audit.mjs --report ;;
    maintainability-baseline) bash "$MISE" node scripts/maintainability-audit.mjs --baseline ;;
  esac
}

show_log() {
  [ "$#" -ge 1 ] || { usage; deny "log needs a task name"; }
  [ "$#" -le 2 ] || deny "log takes a task name and an optional line count"
  is_task "$1" || deny "log: unknown task '$1'"
  lines="$LOG_DEFAULT_LINES"
  if [ "$#" -eq 2 ]; then lines="$2"; fi
  case "$lines" in
    ''|*[!0-9]*) deny "log: line count '$lines' must be a whole number" ;;
  esac
  [ "$lines" -ge 1 ] && [ "$lines" -le "$LOG_MAX_LINES" ] || deny "log: line count must be between 1 and $LOG_MAX_LINES"
  file="$ROOT/$LOG_DIR_REL/$1.log"
  if [ ! -f "$file" ]; then
    echo "dev.sh: no log for '$1' yet (run ./scripts/dev.sh $1 first)" >&2
    exit 1
  fi
  tail -n "$lines" "$file"
}

[ "$#" -ge 1 ] || { usage; exit 2; }
TASK="$1"
shift

if [ "$TASK" = log ]; then
  show_log "$@"
  exit 0
fi

if ! is_task "$TASK"; then
  usage
  deny "unknown task '$TASK'"
fi

if [ "$TASK" = test ]; then
  [ "$#" -ge 1 ] || deny "test requires at least one path under tests/"
  for path in "$@"; do
    validate_test_path "$path"
  done
elif [ "$#" -gt 0 ]; then
  deny "task '$TASK' takes no arguments"
fi

cd "$ROOT"
# A planted symlink must not redirect where the log is written.
for dir in .verification "$LOG_DIR_REL"; do
  [ ! -L "$dir" ] || deny "$dir is a symlink; refusing to write logs through it"
done
mkdir -p "$LOG_DIR_REL"
LOG="$LOG_DIR_REL/$TASK.log"
[ ! -L "$LOG" ] || deny "$LOG is a symlink; refusing to write through it"

status=0
execute "$TASK" "$@" >"$LOG" 2>&1 || status=$?

echo "== dev.sh $TASK exit=$status log=$LOG =="
tail -n "$TAIL_LINES" "$LOG"
exit "$status"
