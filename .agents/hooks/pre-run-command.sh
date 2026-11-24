#!/usr/bin/env bash
# Antigravity PreToolUse hook for run_command.
#
# Mirrors both Claude Code's canonical .claude/hooks/*.sh guards (by delegating directly
# to them — zero duplicated logic) and OpenCode's destructive/approval command guards
# from .opencode/opencode.jsonc:
#   1. Static denies: ~/.config/opencode/service.json, sudo, rm -rf, git reset --hard,
#      git clean, git restore, git checkout --, git push force/delete/tags/mirror/+/:,
#      gh repo delete, tailscale, networksetup, security, diskutil.
#   2. Canonical .claude/hooks/ delegation:
#      - block-commit-on-main.sh
#      - block-pattern-kill.sh
#      - block-raw-dev-server.sh
#      - pre-push-review-reminder.sh
#      - require-green-before-push.sh
#   3. Explicit approval prompts (force_ask):
#      - gh pr merge, gh pr review --approve/-a, gh issue delete, gh repo edit,
#        git branch -d/-D/--delete, git push --force-with-lease.

set -u

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.toolCall.args.CommandLine // .toolCall.args.command // empty' 2>/dev/null || true)"

if [ -z "$COMMAND" ]; then
  printf '{"decision":"allow"}\n'
  exit 0
fi

emit() {
  local decision="$1"
  local reason="$2"
  jq -n --arg decision "$decision" --arg reason "$reason" '{decision: $decision, reason: $reason}'
  exit 0
}

# For git/gh/pr-body commands that may carry commit messages or PR bodies quoting blocked
# tokens, scan only the first line with quoted strings stripped (matching block-pattern-kill.sh).
if printf '%s' "$COMMAND" | grep -qE '^[[:space:]]*(git|gh)[[:space:]]|pr-body\.sh'; then
  SCAN="$(printf '%s' "$COMMAND" | head -n 1 | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")"
else
  SCAN="$COMMAND"
fi

CMDPOS=$'(^|[;&|(`]|(env|nohup|time|exec|then|do|else)[[:space:]])[[:space:]]*'

# --- 1. Credential file guard ----------------------------------------------------
if printf '%s' "$COMMAND" | grep -qE '\.config/opencode/service\.json'; then
  emit "deny" "Accessing ~/.config/opencode/service.json is forbidden — it holds a credential (see .claude/rules/opencode-config.md)."
fi

# --- 2. Destructive shell & git/gh commands (.opencode/opencode.jsonc parity) ----
if printf '%s' "$SCAN" | grep -qE "${CMDPOS}sudo([[:space:]]|\$)"; then
  emit "deny" "Running 'sudo' is blocked by Conquestoria policy."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}rm[[:space:]]+([^;&|]*[[:space:]])?-(rf|fr)([[:space:]]|\$)|${CMDPOS}rm[[:space:]]+([^;&|]*[[:space:]])?-r[[:space:]][^;&|]*-f([[:space:]]|\$)|${CMDPOS}rm[[:space:]]+([^;&|]*[[:space:]])?-f[[:space:]][^;&|]*-r([[:space:]]|\$)"; then
  emit "deny" "Running 'rm -rf' is blocked by Conquestoria policy."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}(tailscale|networksetup|security|diskutil)([[:space:]]|\$)"; then
  emit "deny" "Host administration commands (tailscale, networksetup, security, diskutil) are blocked by Conquestoria policy."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}git[[:space:]]+reset[[:space:]]+([^;&|]*[[:space:]])?--hard([[:space:]]|\$)"; then
  emit "deny" "Running 'git reset --hard' is blocked by Conquestoria policy."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}git[[:space:]]+clean([[:space:]]|\$)"; then
  emit "deny" "Running 'git clean' is blocked by Conquestoria policy."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}git[[:space:]]+restore([[:space:]]|\$)"; then
  emit "deny" "Running 'git restore' is blocked by Conquestoria policy."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}git[[:space:]]+checkout[[:space:]]+--([[:space:]]|\$)"; then
  emit "deny" "Running 'git checkout --' is blocked by Conquestoria policy."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}gh[[:space:]]+repo[[:space:]]+delete([[:space:]]|\$)"; then
  emit "deny" "Running 'gh repo delete' is blocked by Conquestoria policy."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}git[[:space:]]+push([[:space:]]|\$)"; then
  if printf '%s' "$SCAN" | grep -qE '([[:space:]]|^)--force([[:space:]]|$)|[[:space:]]-f([[:space:]]|$)'; then
    emit "deny" "Raw 'git push --force' / '-f' is blocked. Use ./scripts/push-branch.sh for safe lease-checked publishing."
  fi
  if printf '%s' "$SCAN" | grep -qE '[[:space:]]\+[^[:space:];&|]'; then
    emit "deny" "Forced refspec push ('git push ... +...') is blocked. Use ./scripts/push-branch.sh instead."
  fi
  if printf '%s' "$SCAN" | grep -qE '([[:space:]]|^)--delete([[:space:]]|$)|[[:space:]]:[^[:space:];&|]'; then
    emit "deny" "Remote ref deletion ('git push --delete' / ':ref') is blocked by Conquestoria policy."
  fi
  if printf '%s' "$SCAN" | grep -qE '([[:space:]]|^)--(tags|mirror)([[:space:]]|$)'; then
    emit "deny" "Running 'git push --tags' or '--mirror' is blocked by Conquestoria policy."
  fi
fi

# --- 3. Canonical .claude/hooks/ delegation (single source of truth) -------------
SCRIPT_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION_CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // .workspacePaths[0] // empty' 2>/dev/null || true)"
if [ -z "$SESSION_CWD" ] || [ ! -d "$SESSION_CWD" ]; then
  SESSION_CWD="$SCRIPT_REPO_ROOT"
fi

HOOK_REPO_ROOT="$SCRIPT_REPO_ROOT"
SESSION_TOP="$(git -C "$SESSION_CWD" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$SESSION_TOP" ] && [ -d "$SESSION_TOP/.claude/hooks" ]; then
  HOOK_REPO_ROOT="$SESSION_TOP"
fi

CLAUDE_PAYLOAD="$(jq -n --arg cmd "$COMMAND" --arg cwd "$SESSION_CWD" '{tool_name: "Bash", tool_input: {command: $cmd}, cwd: $cwd}')"

run_claude_hook() {
  local hook_name="$1"
  local hook_path="$HOOK_REPO_ROOT/.claude/hooks/$hook_name"
  [ -x "$hook_path" ] || return 0
  local err_file status
  err_file="$(mktemp)"
  if (cd "$SESSION_CWD" && CLAUDE_PROJECT_DIR="$HOOK_REPO_ROOT" "$hook_path") <<<"$CLAUDE_PAYLOAD" >/dev/null 2>"$err_file"; then
    rm -f "$err_file"
    return 0
  else
    status=$?
    local msg
    msg="$(cat "$err_file")"
    rm -f "$err_file"
    [ -n "$msg" ] || msg="Blocked by $hook_name (exit $status)."
    emit "deny" "$msg"
  fi
}

run_claude_hook "block-commit-on-main.sh"
run_claude_hook "block-pattern-kill.sh"
run_claude_hook "block-raw-dev-server.sh"
run_claude_hook "pre-push-review-reminder.sh"
run_claude_hook "require-green-before-push.sh"

# --- 4. Sensitive actions requiring explicit human approval (force_ask) ----------
if printf '%s' "$SCAN" | grep -qE "${CMDPOS}gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|\$)"; then
  emit "force_ask" "Merging a pull request requires explicit human authorization."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}gh[[:space:]]+pr[[:space:]]+review([[:space:]]|\$)"; then
  if printf '%s' "$SCAN" | grep -qE '([[:space:]]|^)--approve([[:space:]]|$)|[[:space:]]-a([[:space:]]|$)'; then
    emit "force_ask" "Approving a pull request requires explicit human authorization (an agent must never self-approve)."
  fi
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}gh[[:space:]]+issue[[:space:]]+delete([[:space:]]|\$)"; then
  emit "force_ask" "Deleting a GitHub issue requires explicit human authorization."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}gh[[:space:]]+repo[[:space:]]+edit([[:space:]]|\$)"; then
  emit "force_ask" "Editing GitHub repository settings requires explicit human authorization."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}git[[:space:]]+branch[[:space:]]+([^;&|]*[[:space:]])?(-[dD]|--delete)([[:space:]]|\$)"; then
  emit "force_ask" "Deleting a git branch requires explicit human authorization."
fi

if printf '%s' "$SCAN" | grep -qE "${CMDPOS}git[[:space:]]+push([[:space:]]|\$)" && printf '%s' "$SCAN" | grep -qE '([[:space:]]|^)--force-with-lease([[:space:]=]|$)'; then
  emit "force_ask" "Raw 'git push --force-with-lease' requires explicit human authorization (prefer ./scripts/push-branch.sh)."
fi

printf '{"decision":"allow"}\n'
exit 0
