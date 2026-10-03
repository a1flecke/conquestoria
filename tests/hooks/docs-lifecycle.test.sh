#!/usr/bin/env bash
# #1024: the plan/spec lifecycle guard (scripts/docs-lifecycle.mjs check) is offline and deterministic. This
# test (1) requires the REAL tree to pass, and (2) proves the guard is not vacuous with fixtures: it must reject a
# delivered plan left in the active tree, an unclassified plan, a broken canonical reference, an active plan whose
# issue is closed, a dangling reference and an orphaned asset -- and accept active work, a durable reference and an
# intentionally current plan.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOOL="$ROOT/scripts/docs-lifecycle.mjs"

run_node() {
  if command -v node >/dev/null 2>&1; then node "$@"; else "$ROOT/scripts/run-with-mise.sh" node "$@"; fi
}

# The fixtures must not spell a literal plan/spec path: the real-tree check scans this file too.
SP="docs/super""powers"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() { echo "$1" >&2; [ -f "$tmp/out" ] && cat "$tmp/out" >&2; exit 1; }

# 1. the real repository satisfies its own lifecycle
run_node "$TOOL" check --root "$ROOT" >"$tmp/out" 2>&1 || fail "the real tree violates its docs lifecycle manifest"
grep -q '"deleted"' "$ROOT/docs/docs-lifecycle-manifest.json" || fail "the real manifest has no deleted ledger"

# --- fixtures -----------------------------------------------------------------------------------------------
mk_repo() { # mk_repo <dir>: a clean, passing mini repository
  d="$1"
  mkdir -p "$d/$SP/plans" "$d/$SP/specs" "$d/src" "$d/.claude/rules"
  printf '# Active work\n' > "$d/$SP/plans/2026-10-01-active-work.md"
  printf '# Durable rationale\n' > "$d/$SP/specs/2026-09-01-durable-design.md"
  printf "// see $SP/specs/2026-09-01-durable-design.md\n" > "$d/src/cites.ts"
  cat > "$d/docs/docs-lifecycle-manifest.json" <<JSON
{
 "schema": 1,
 "entries": {
  "$SP/plans/2026-10-01-active-work.md": { "category": "active", "reason": "Plan owned by open issue #900.", "issues": [900], "issueStates": { "900": "OPEN" } },
  "$SP/specs/2026-09-01-durable-design.md": { "category": "durable-reference", "reason": "Rationale cited by src/cites.ts.", "liveReferences": ["src/cites.ts"] }
 },
 "deleted": {
  "$SP/plans/2026-01-01-old-delivered.md": { "category": "delivered-stale", "reason": "Delivered long ago." }
 }
}
JSON
}
expect_fail() { # expect_fail <dir> <needle> <label>
  if run_node "$TOOL" check --root "$1" >"$tmp/out" 2>&1; then fail "guard passed but should reject: $3"; fi
  grep -q "$2" "$tmp/out" || fail "guard rejected '$3' for the wrong reason (wanted: $2)"
}

# positive: active work + a durable reference + an intentionally current plan
good="$tmp/good"; mk_repo "$good"
printf '# Another current plan\n' > "$good/$SP/plans/2026-10-02-current.md"
python3 - "$good/docs/docs-lifecycle-manifest.json" <<PY
import json,sys
p=sys.argv[1]; m=json.load(open(p))
m['entries']['$SP/plans/2026-10-02-current.md']={'category':'active','reason':'Intentionally current plan for open issue #901.','issues':[901],'issueStates':{'901':'OPEN'}}
json.dump(m,open(p,'w'))
PY
run_node "$TOOL" check --root "$good" >"$tmp/out" 2>&1 || fail "guard rejected valid active + durable + current plans"

# negative 1: a delivered plan left in the active location
c="$tmp/stale"; mk_repo "$c"; printf '# old\n' > "$c/$SP/plans/2026-01-01-old-delivered.md"
expect_fail "$c" 'still exists' 'delivered stale plan left in the active tree'

# negative 2: an unclassified plan
c="$tmp/unclassified"; mk_repo "$c"; printf '# new\n' > "$c/$SP/plans/2026-10-03-unclassified.md"
expect_fail "$c" 'unclassified' 'unclassified plan'

# negative 3: a broken canonical reference (the citing file no longer mentions the durable doc)
c="$tmp/broken-ref"; mk_repo "$c"; printf '// no longer cites it\n' > "$c/src/cites.ts"
expect_fail "$c" 'broken canonical reference' 'durable doc whose citation vanished'

# negative 4: an active plan whose recorded issue is closed
c="$tmp/closed"; mk_repo "$c"
python3 - "$c/docs/docs-lifecycle-manifest.json" <<PY
import json,sys
p=sys.argv[1]; m=json.load(open(p)); m['entries']['$SP/plans/2026-10-01-active-work.md']['issueStates']={'900':'CLOSED'}; json.dump(m,open(p,'w'))
PY
expect_fail "$c" 'recorded CLOSED' 'active plan whose issue is closed'

# negative 5: a dangling reference to a plan that does not exist
c="$tmp/dangling"; mk_repo "$c"; printf "// $SP/plans/2026-02-02-missing.md\n" > "$c/src/dangling.ts"
expect_fail "$c" 'dangling reference' 'reference to a missing plan'

# negative 6: an orphaned asset
c="$tmp/orphan"; mk_repo "$c"; mkdir -p "$c/$SP/specs/assets"; printf 'x' > "$c/$SP/specs/assets/mockup.svg"
expect_fail "$c" 'orphaned asset' 'orphaned asset'

# negative 7: an active plan with no owning issue
c="$tmp/no-issue"; mk_repo "$c"
python3 - "$c/docs/docs-lifecycle-manifest.json" <<PY
import json,sys
p=sys.argv[1]; m=json.load(open(p)); m['entries']['$SP/plans/2026-10-01-active-work.md']['issues']=[]; json.dump(m,open(p,'w'))
PY
expect_fail "$c" 'name the issue that owns' 'active plan with no issue'

echo ok
