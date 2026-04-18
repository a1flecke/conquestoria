#!/bin/sh

set -eu

staged_files="$(git diff --cached --name-only --diff-filter=ACMR)"

if [ -z "$staged_files" ]; then
  exit 0
fi

warn() {
  printf '%s\n' "Guardrail warning: $1" >&2
}

has_ui_changes=0

for file in $staged_files; do
  case "$file" in
    src/ui/*.ts|src/main.ts)
      has_ui_changes=1
      ;;
  esac
done

for file in $staged_files; do
  case "$file" in
    src/ui/*.ts)
      mirrored_test="tests/${file#src/}"
      mirrored_test="${mirrored_test%.ts}.test.ts"
      if [ -f "$mirrored_test" ] && ! printf '%s\n' "$staged_files" | grep -Fxq "$mirrored_test"; then
        warn "$file is staged without its mirrored UI test $mirrored_test. If behavior changed, stage a regression or add one before committing."
      fi
      ;;
  esac
done

cached_ui_diff="$(git diff --cached --unified=0 -- src/ui src/main.ts || true)"

if [ "$has_ui_changes" -eq 1 ] && printf '%s' "$cached_ui_diff" | grep -Eq 'onQueue|onMoveQueue|onRemoveQueue|data-queue-action|productionQueue|researchQueue'; then
  warn "Queue-related UI code changed. Verify add/reorder/remove updates the visible panel immediately and that ETA/order text is asserted in tests."
fi

if [ "$has_ui_changes" -eq 1 ] && printf '%s' "$cached_ui_diff" | grep -Eq 'nextLayer|reachable|recommended|available soon|show-all|Show all'; then
  warn "Derived UI semantics changed. Add a negative test proving unreachable or non-recommended items stay hidden."
fi

if [ "$has_ui_changes" -eq 1 ] && printf '%s' "$cached_ui_diff" | grep -Eq 'addEventListener|onclick|create.*Panel|togglePanel'; then
  warn "Interactive panel code changed. Confirm the plan includes a player-truth table and the tests assert visible DOM/text changes after the interaction."
fi

exit 0
