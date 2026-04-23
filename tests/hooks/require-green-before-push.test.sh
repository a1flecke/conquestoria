#!/usr/bin/env bash
# Smoke test: require-green-before-push.sh
# - Non-matching commands: exit 0
# - Matching command + REQUIRE_GREEN_TEST_MODE=fail: exit 2
# - Matching command + REQUIRE_GREEN_TEST_MODE=pass: exit 0
set -u
HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/require-green-before-push.sh"
fail=0

run() {
  local payload="$1" mode="${2:-}"
  REQUIRE_GREEN_TEST_MODE="$mode" bash "$HOOK" <<<"$payload" >/dev/null 2>&1
  echo "rc=$?"
}

# Non-matching commands pass without running build
[ "$(run '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}')"             = "rc=0" ] || { echo "expected allow on ls"; fail=1; }
[ "$(run '{"tool_name":"Bash","tool_input":{"command":"git status"}}')"         = "rc=0" ] || { echo "expected allow on git status"; fail=1; }
[ "$(run '{"tool_name":"Bash","tool_input":{"command":"git commit -m foo"}}')"  = "rc=0" ] || { echo "expected allow on git commit"; fail=1; }

# Matching commands run the gate
[ "$(run '{"tool_name":"Bash","tool_input":{"command":"git push"}}'            fail)" = "rc=2" ] || { echo "expected block on git push (fail mode)"; fail=1; }
[ "$(run '{"tool_name":"Bash","tool_input":{"command":"git push origin HEAD"}}' fail)" = "rc=2" ] || { echo "expected block on git push origin (fail mode)"; fail=1; }
[ "$(run '{"tool_name":"Bash","tool_input":{"command":"gh pr create --fill"}}' fail)" = "rc=2" ] || { echo "expected block on gh pr create (fail mode)"; fail=1; }
[ "$(run '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 124"}}'     fail)" = "rc=2" ] || { echo "expected block on gh pr merge (fail mode)"; fail=1; }

[ "$(run '{"tool_name":"Bash","tool_input":{"command":"git push"}}'            pass)" = "rc=0" ] || { echo "expected allow on git push (pass mode)"; fail=1; }
[ "$(run '{"tool_name":"Bash","tool_input":{"command":"gh pr create"}}'        pass)" = "rc=0" ] || { echo "expected allow on gh pr create (pass mode)"; fail=1; }

# Word-boundary: "pushing" as substring must not match
[ "$(run '{"tool_name":"Bash","tool_input":{"command":"echo pushing"}}'        fail)" = "rc=0" ] || { echo "expected allow on non-git push substring"; fail=1; }

exit "$fail"
