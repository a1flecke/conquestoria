#!/usr/bin/env bash
# #1231: the agent-policy parity check (scripts/check-agent-policy-parity.mjs) must
# (1) pass on the real tree, and (2) not be vacuous. Every declared rule gets a
# fixture proving it bites: a violation fails, the valid form passes, and a
# prohibition may mention the forbidden form. A new unindexed .claude/rules file
# must fail canonical-list.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TOOL="$ROOT/scripts/check-agent-policy-parity.mjs"

run_node() {
  if command -v node >/dev/null 2>&1; then node "$@"; else "$ROOT/scripts/run-with-mise.sh" node "$@"; fi
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() { echo "$1" >&2; [ -f "$tmp/out" ] && cat "$tmp/out" >&2; exit 1; }

# 1. the real repository satisfies its own parity rules
run_node "$TOOL" --root "$ROOT" >"$tmp/out" 2>&1 || fail "the real agent policy surface has a parity violation"

# --- fixtures -----------------------------------------------------------------------------------------------
mk_repo() { # mk_repo <dir>: a clean, parity-passing mini repository
  d="$1"
  mkdir -p "$d/.claude/rules" "$d/scripts"
  cat > "$d/CLAUDE.md" <<'MD'
# Policy

## Rules Index
- `.claude/rules/one.md` — the one rule
MD
  printf '# One\n' > "$d/.claude/rules/one.md"
  cat > "$d/AGENTS.md" <<'MD'
Canonical project policy lives in `CLAUDE.md` and `.claude/rules/*.md`.
MD
  cat > "$d/package.json" <<'JSON'
{ "scripts": { "build": "x", "test": "y" } }
JSON
  printf '#!/bin/sh\n' > "$d/scripts/real.sh"
}

expect_fail() { # expect_fail <dir> <rule> <file> <needle> <label>
  if run_node "$TOOL" --root "$1" --rule "$2" --file "$3" >"$tmp/out" 2>&1; then
    fail "parity passed but should reject: $5"
  fi
  grep -q "$4" "$tmp/out" || fail "parity rejected '$5' for the wrong reason (wanted: $4)"
}
expect_ok() { # expect_ok <dir> <rule> <file> <label>
  run_node "$TOOL" --root "$1" --rule "$2" --file "$3" >"$tmp/out" 2>&1 || fail "parity rejected valid: $4"
}

# no-mise-activate: the exact GEMINI.md/#1229 contradiction must fail
d="$tmp/mise"; mk_repo "$d"
printf 'Run `eval "$(mise activate bash)"` before any command.\n' > "$d/fixture.md"
expect_fail "$d" no-mise-activate fixture.md 'mise activate' 'bare mise activate instruction'
printf 'Do not run `eval "$(mise activate bash)"`; use the wrapper.\n' > "$d/fixture.md"
expect_ok "$d" no-mise-activate fixture.md 'mise activate as a prohibition'

# wrapper-required: a bare command in a fenced block fails; the wrapper passes
d="$tmp/wrapper"; mk_repo "$d"
printf 'Build:\n\n```bash\n./scripts/run-with-mise.sh yarn build\n```\n' > "$d/fixture.md"
expect_ok "$d" wrapper-required fixture.md 'wrapped fenced command'
printf 'Build:\n\n```bash\nyarn build\n```\n' > "$d/fixture.md"
expect_fail "$d" wrapper-required fixture.md 'bare' 'bare fenced yarn command'

# scripts-exist: stale repo scripts and renamed package scripts fail
d="$tmp/scripts"; mk_repo "$d"
printf 'Run `./scripts/run-with-mise.sh yarn build` and `scripts/real.sh`.\n' > "$d/fixture.md"
expect_ok "$d" scripts-exist fixture.md 'existing script references'
printf 'Run `yarn nonexistent-script`.\n' > "$d/fixture.md"
expect_fail "$d" scripts-exist fixture.md 'missing package script' 'renamed package script reference'
printf 'Run `scripts/does-not-exist.sh`.\n' > "$d/fixture.md"
expect_fail "$d" scripts-exist fixture.md 'missing repo script' 'stale repo script reference'

# no-pattern-kill: an instruction fails; a prohibition and a JSON deny pass
d="$tmp/kill"; mk_repo "$d"
printf 'Run `pkill -f run-ai-long-horizon.sh` to stop it.\n' > "$d/fixture.md"
expect_fail "$d" no-pattern-kill fixture.md 'pkill' 'bare pattern-kill instruction'
printf 'Never run `pkill`/`killall`; stop only a recorded pid.\n' > "$d/fixture.md"
expect_ok "$d" no-pattern-kill fixture.md 'pattern kill as a prohibition'
printf '{ "action": "shell", "resource": "pkill *", "effect": "deny" }\n' > "$d/fixture.md"
expect_ok "$d" no-pattern-kill fixture.md 'pattern kill denied in config'

# canonical-list: an unindexed .claude/rules file fails; a fully indexed tree passes
d="$tmp/canonical"; mk_repo "$d"
expect_ok "$d" canonical-list CLAUDE.md 'fully indexed rule tree'
printf '# Two\n' > "$d/.claude/rules/two.md"
expect_fail "$d" canonical-list CLAUDE.md 'missing from the Rules Index' 'new unindexed rule file'

# required-gates-defer-to-impact (#1362): prose may not require a command the impact map owns; it must point at verify:impact
d="$tmp/impact"; mk_repo "$d"
mkdir -p "$d/scripts/data"
cat > "$d/scripts/data/verification-impact.json" <<'JSON'
{
  "schema": 1,
  "baseline": ["build"],
  "evidence": [
    { "id": "build", "commands": ["./scripts/run-with-mise.sh yarn build"], "why": "fixture" },
    { "id": "hooks", "commands": ["./scripts/run-with-mise.sh yarn test:hooks"], "why": "fixture" }
  ],
  "diagnostics": [
    { "id": "campaign", "commands": ["scripts/real.sh"], "when": "sometimes", "source": "AGENTS.md" }
  ],
  "rules": [{ "id": "h", "match": [".claude/hooks/**"], "require": ["hooks"], "why": "fixture" }]
}
JSON
printf '#!/bin/sh\n' > "$d/scripts/real.sh"
cat > "$d/package.json" <<'JSON'
{ "scripts": { "build": "x", "test": "y", "test:hooks": "z" } }
JSON
printf 'Always run `./scripts/run-with-mise.sh yarn test:hooks` before declaring complete.\n' > "$d/fixture.md"
expect_fail "$d" required-gates-defer-to-impact fixture.md 'second gate' 'prose requiring a gated command on its own authority'
printf 'You must run `scripts/real.sh` before you finish.\n' > "$d/fixture.md"
expect_fail "$d" required-gates-defer-to-impact fixture.md 'diagnostic' 'prose requiring an optional diagnostic'
printf 'Run `yarn verify:impact`; it lists what is required. For hook edits that includes `yarn test:hooks`, which must be run before you push.\n' > "$d/fixture.md"
expect_ok "$d" required-gates-defer-to-impact fixture.md 'prose that defers to verify:impact'
printf 'Run `./scripts/run-with-mise.sh yarn build` before any push; it is always required.\n' > "$d/fixture.md"
expect_ok "$d" required-gates-defer-to-impact fixture.md 'a baseline command stated as always required'
printf 'The hooks suite (`yarn test:hooks`) exercises the hook scripts and is useful when you edit them.\n' > "$d/fixture.md"
expect_ok "$d" required-gates-defer-to-impact fixture.md 'prose that merely describes a gated command'

# Canonical OpenCode helper forms must not drift back to a bash prefix.
d="$tmp/opencode-helpers"; mk_repo "$d"
printf '#!/bin/sh\n' > "$d/scripts/pr-body.sh"
printf 'Use `./scripts/pr-body.sh new review`.\n' > "$d/fixture.md"
expect_ok "$d" opencode-helper-form fixture.md 'canonical PR body helper'
printf 'Use `bash scripts/pr-body.sh new review`.\n' > "$d/fixture.md"
expect_fail "$d" opencode-helper-form fixture.md 'canonical' 'noncanonical PR body helper'
printf 'Never use `bash scripts/pr-body.sh`; use the direct form.\n' > "$d/fixture.md"
expect_ok "$d" opencode-helper-form fixture.md 'noncanonical spelling as a prohibition'

# Broad gh pr allowances must leave approvals explicitly gated.
d="$tmp/opencode-approval"; mk_repo "$d"
mkdir -p "$d/.opencode"
cat > "$d/.opencode/opencode.jsonc" <<'JSON'
{"agents":{"build":{"permissions":[
  {"action":"shell","resource":"gh pr *","effect":"allow"}
]}}}
JSON
expect_fail "$d" opencode-pr-approval .opencode/opencode.jsonc 'PR approval' 'approval covered only by broad allow'
cat > "$d/.opencode/opencode.jsonc" <<'JSON'
{"agents":{"build":{"permissions":[
  {"action":"shell","resource":"gh pr *","effect":"allow"},
  {"action":"shell","resource":"gh pr review *--approve*","effect":"ask"},
  {"action":"shell","resource":"gh pr review -a*","effect":"ask"},
  {"action":"shell","resource":"gh pr review * -a*","effect":"ask"}
]}}}
JSON
expect_ok "$d" opencode-pr-approval .opencode/opencode.jsonc 'explicit approval gates'
# A later broad allow would silently undo the specific gate.
cat > "$d/.opencode/opencode.jsonc" <<'JSON'
{"agents":{"build":{"permissions":[
  {"action":"shell","resource":"gh pr review *","effect":"ask"},
  {"action":"shell","resource":"gh pr *","effect":"allow"}
]}}}
JSON
expect_fail "$d" opencode-pr-approval .opencode/opencode.jsonc 'PR approval' 'later broad allow overrides approval gate'

# Location-scoped plugin loads cannot be diagnosed by a whole-run count.
d="$tmp/opencode-loading"; mk_repo "$d"
printf 'Verify exactly one loading plugin entry across the server run.\n' > "$d/fixture.md"
expect_fail "$d" opencode-plugin-loading fixture.md 'location' 'whole-server plugin count'
printf 'Verify the configured plugin identity per active location and recent hook decisions.\n' > "$d/fixture.md"
expect_ok "$d" opencode-plugin-loading fixture.md 'location-scoped evidence'

echo ok
