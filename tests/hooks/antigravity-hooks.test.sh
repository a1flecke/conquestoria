#!/usr/bin/env bash
# Smoke tests for Antigravity workspace onboarding:
#   - GEMINI.md size stays under Antigravity's 24,000-byte per-file rule cap
#   - .agents/hooks.json structure and all 6 hook scripts (.agents/hooks/*.sh)
#   - .agents/skills/*/SKILL.md frontmatter + symlink targets

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOKS_DIR="$ROOT/.agents/hooks"
HOOKS_JSON="$ROOT/.agents/hooks.json"

fail() { echo "FAIL: $*" >&2; exit 1; }

# --- 1. GEMINI.md stays under Antigravity's 24,000-byte per-file rule cap --------
[ -f "$ROOT/GEMINI.md" ] || fail "GEMINI.md is missing"
gemini_bytes="$(wc -c < "$ROOT/GEMINI.md" | tr -d '[:space:]')"
[ "$gemini_bytes" -lt 24000 ] || fail "GEMINI.md is $gemini_bytes bytes (must stay under 24,000-byte Antigravity cap)"

# --- 2. .agents/hooks.json is valid JSON with expected lifecycle events ----------
jq -e '.["conquestoria-guardrails"].SessionStart | length >= 1' "$HOOKS_JSON" >/dev/null || fail "missing SessionStart in .agents/hooks.json"
jq -e '.["conquestoria-guardrails"].PreToolUse | length >= 3' "$HOOKS_JSON" >/dev/null || fail "missing PreToolUse in .agents/hooks.json"
jq -e '.["conquestoria-guardrails"].PostToolUse | length >= 1' "$HOOKS_JSON" >/dev/null || fail "missing PostToolUse in .agents/hooks.json"
jq -e '.["conquestoria-guardrails"].PostInvocation | length >= 1' "$HOOKS_JSON" >/dev/null || fail "missing PostInvocation in .agents/hooks.json"

# --- 3. .agents/skills/*/SKILL.md exist and have matching frontmatter ------------
for skill in button-styling generate-sprite-prompt work-issue ship; do
  skill_file="$ROOT/.agents/skills/$skill/SKILL.md"
  [ -f "$skill_file" ] || fail "missing skill file: $skill_file"
  grep -qE "^name:[[:space:]]*${skill}[[:space:]]*$" "$skill_file" || fail "$skill_file missing matching 'name: $skill' frontmatter"
  grep -qE "^description:[[:space:]]*[^[:space:]]" "$skill_file" || fail "$skill_file missing non-empty 'description:' frontmatter"
done

# --- 4. .agents/rules/*.md have valid trigger: glob frontmatter ------------------
for rule_file in "$ROOT"/.agents/rules/*.md; do
  [ -f "$rule_file" ] || fail "no rule files under .agents/rules/"
  grep -qE '^trigger:[[:space:]]*glob[[:space:]]*$' "$rule_file" || fail "$rule_file missing 'trigger: glob'"
  grep -qE '^globs:[[:space:]]*"[^"]+"' "$rule_file" || fail "$rule_file missing quoted 'globs:'"
  grep -qE '^description:[[:space:]]*"[^"]+"' "$rule_file" || fail "$rule_file missing 'description:'"
done

# Helper for PreToolUse decision checks.
expect_decision() {
  local script="$1" payload="$2" expected="$3" label="$4"
  local out decision
  out="$(printf '%s' "$payload" | "$HOOKS_DIR/$script")"
  decision="$(printf '%s' "$out" | jq -r '.decision // empty')"
  if [ "$decision" != "$expected" ]; then
    fail "$label: expected decision='$expected', got '$decision' (output: $out)"
  fi
}

# --- 5. pre-subagent.sh ----------------------------------------------------------
expect_decision pre-subagent.sh '{"toolCall":{"name":"invoke_subagent","args":{"TypeName":"browser"}}}' allow "allow browser subagent"
expect_decision pre-subagent.sh '{"toolCall":{"name":"invoke_subagent","args":{"TypeName":"image-generator"}}}' allow "allow image-generator subagent"
expect_decision pre-subagent.sh '{"toolCall":{"name":"invoke_subagent","args":{"TypeName":"self"}}}' deny "deny self subagent"
expect_decision pre-subagent.sh '{"toolCall":{"name":"invoke_subagent","args":{"TypeName":"research"}}}' deny "deny research subagent"
expect_decision pre-subagent.sh '{"toolCall":{"name":"define_subagent","args":{"Name":"helper"}}}' deny "deny define_subagent"
expect_decision pre-subagent.sh '{"toolCall":{"name":"swarm","args":{"action":"add"}}}' deny "deny swarm"
expect_decision pre-subagent.sh '{"toolCall":{"name":"run_workflow","args":{"Description":"fanout"}}}' deny "deny run_workflow"

# --- 6. pre-file-op.sh -----------------------------------------------------------
expect_decision pre-file-op.sh '{"toolCall":{"name":"read_file","args":{"Path":"~/.config/opencode/service.json"}}}' deny "deny reading service.json"
expect_decision pre-file-op.sh '{"toolCall":{"name":"read_file","args":{"Path":"/Users/tester/.config/opencode/service.json"}}}' deny "deny reading absolute service.json"
expect_decision pre-file-op.sh '{"toolCall":{"name":"edit_file","args":{"Path":"~/.config/opencode/opencode.jsonc"}}}' force_ask "force_ask editing opencode config"
expect_decision pre-file-op.sh '{"toolCall":{"name":"write_file","args":{"Path":"/Users/tester/.config/opencode/plugins/foo.json"}}}' force_ask "force_ask writing opencode config"
expect_decision pre-file-op.sh '{"toolCall":{"name":"read_file","args":{"Path":"~/.config/opencode/opencode.jsonc"}}}' allow "allow reading non-secret opencode config"
expect_decision pre-file-op.sh '{"toolCall":{"name":"edit_file","args":{"Path":"/tmp/workspace/src/core/types.ts"}}}' allow "allow normal repo edit"

# --- 7. pre-run-command.sh -------------------------------------------------------
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Create an isolated git repo with origin/main and a feature branch + a main checkout.
bare="$tmp/origin.git"
git init --bare -q -b main "$bare"
main_repo="$tmp/main-repo"
git init -q -b main "$main_repo"
git -C "$main_repo" config user.email test@example.com
git -C "$main_repo" config user.name Test
mkdir -p "$main_repo/.claude/hooks" "$main_repo/.githooks"
cp "$ROOT/.claude/hooks/"*.sh "$main_repo/.claude/hooks/"
chmod +x "$main_repo/.claude/hooks/"*.sh
printf '#!/bin/sh\nexit 0\n' > "$main_repo/.githooks/pre-push"
chmod +x "$main_repo/.githooks/pre-push"
git -C "$main_repo" config core.hooksPath .githooks
printf 'hello\n' > "$main_repo/README.md"
git -C "$main_repo" add .
git -C "$main_repo" commit -q -m "init"
git -C "$main_repo" remote add origin "$bare"
git -C "$main_repo" push -q origin main

feat_repo="$tmp/feat-repo"
git clone -q -b main "$bare" "$feat_repo"
git -C "$feat_repo" config user.email test@example.com
git -C "$feat_repo" config user.name Test
git -C "$feat_repo" checkout -q -b feat/test
git -C "$feat_repo" config core.hooksPath .githooks

cmd_payload() {
  jq -n --arg cmd "$1" --arg cwd "$2" '{toolCall:{name:"run_command",args:{CommandLine:$cmd}},cwd:$cwd}'
}

# Allowed routine commands
expect_decision pre-run-command.sh "$(cmd_payload 'git status --short' "$feat_repo")" allow "allow git status"
expect_decision pre-run-command.sh "$(cmd_payload './scripts/dev.sh build' "$feat_repo")" allow "allow dev.sh build"
expect_decision pre-run-command.sh "$(cmd_payload 'git checkout -b feat/another' "$feat_repo")" allow "allow git checkout -b"
expect_decision pre-run-command.sh "$(cmd_payload 'rg pkill docs' "$feat_repo")" allow "allow searching for pkill"
expect_decision pre-run-command.sh "$(cmd_payload 'git commit -m "document pkill, rm -rf, and --force guards"' "$feat_repo")" allow "allow commit message mentioning blocked tokens on feature branch"

# Denied destructive / credential / host-admin commands
expect_decision pre-run-command.sh "$(cmd_payload 'cat ~/.config/opencode/service.json' "$feat_repo")" deny "deny reading service.json via shell"
expect_decision pre-run-command.sh "$(cmd_payload 'sudo ls' "$feat_repo")" deny "deny sudo"
expect_decision pre-run-command.sh "$(cmd_payload 'rm -rf dist' "$feat_repo")" deny "deny rm -rf"
expect_decision pre-run-command.sh "$(cmd_payload 'git reset --hard HEAD' "$feat_repo")" deny "deny git reset --hard"
expect_decision pre-run-command.sh "$(cmd_payload 'git clean -fd' "$feat_repo")" deny "deny git clean"
expect_decision pre-run-command.sh "$(cmd_payload 'git restore src/main.ts' "$feat_repo")" deny "deny git restore"
expect_decision pre-run-command.sh "$(cmd_payload 'git checkout -- src/main.ts' "$feat_repo")" deny "deny git checkout --"
expect_decision pre-run-command.sh "$(cmd_payload 'git push --force origin feat/test' "$feat_repo")" deny "deny git push --force"
expect_decision pre-run-command.sh "$(cmd_payload 'git push -f origin feat/test' "$feat_repo")" deny "deny git push -f"
expect_decision pre-run-command.sh "$(cmd_payload 'git push origin +HEAD:feat/test' "$feat_repo")" deny "deny forced refspec push"
expect_decision pre-run-command.sh "$(cmd_payload 'git push origin --delete feat/test' "$feat_repo")" deny "deny git push --delete"
expect_decision pre-run-command.sh "$(cmd_payload 'git push origin :feat/test' "$feat_repo")" deny "deny colon ref deletion"
expect_decision pre-run-command.sh "$(cmd_payload 'git push --tags' "$feat_repo")" deny "deny git push --tags"
expect_decision pre-run-command.sh "$(cmd_payload 'git push --mirror' "$feat_repo")" deny "deny git push --mirror"
expect_decision pre-run-command.sh "$(cmd_payload 'gh repo delete a1flecke/conquestoria' "$feat_repo")" deny "deny gh repo delete"
expect_decision pre-run-command.sh "$(cmd_payload 'tailscale status' "$feat_repo")" deny "deny tailscale"

# Delegated .claude/hooks/ guards
expect_decision pre-run-command.sh "$(cmd_payload 'pkill -f vitest' "$feat_repo")" deny "deny pkill via block-pattern-kill.sh"
expect_decision pre-run-command.sh "$(cmd_payload './scripts/run-with-mise.sh yarn dev' "$feat_repo")" deny "deny raw yarn dev via block-raw-dev-server.sh"
expect_decision pre-run-command.sh "$(cmd_payload 'git commit -m "direct commit"' "$main_repo")" deny "deny commit on main via block-commit-on-main.sh"

# Explicit human approval prompts (force_ask)
expect_decision pre-run-command.sh "$(cmd_payload 'gh pr review 42 --approve' "$feat_repo")" force_ask "force_ask gh pr review --approve"
expect_decision pre-run-command.sh "$(cmd_payload 'gh pr review -a 42' "$feat_repo")" force_ask "force_ask gh pr review -a"
expect_decision pre-run-command.sh "$(cmd_payload 'gh issue delete 12' "$feat_repo")" force_ask "force_ask gh issue delete"
expect_decision pre-run-command.sh "$(cmd_payload 'gh repo edit --description x' "$feat_repo")" force_ask "force_ask gh repo edit"
expect_decision pre-run-command.sh "$(cmd_payload 'git branch -D old-branch' "$feat_repo")" force_ask "force_ask git branch -D"
expect_decision pre-run-command.sh "$(cmd_payload 'git push --force-with-lease origin feat/test' "$feat_repo")" force_ask "force_ask git push --force-with-lease"

# --- 8. post-file-edit.sh + post-invocation.sh (src/ rule check bridge) ----------
state_dir="$tmp/hook-state"
mkdir -p "$tmp/fake/src"
printf 'export const r = Math.random();\n' > "$tmp/fake/src/bad.ts"
printf 'export const ok = 42;\n' > "$tmp/fake/src/good.ts"

# Clean edit produces no injected steps
post_out="$(CONQUESTORIA_AGY_HOOK_STATE_DIR="$state_dir" "$HOOKS_DIR/post-file-edit.sh" \
  <<<"$(jq -n --arg p "$tmp/fake/src/good.ts" --arg cwd "$ROOT" '{conversationId:"conv-clean",cwd:$cwd,toolCall:{name:"edit_file",args:{Path:$p}}}')")"
[ "$post_out" = "{}" ] || fail "post-file-edit.sh must return {}, got: $post_out"

inv_out="$(CONQUESTORIA_AGY_HOOK_STATE_DIR="$state_dir" "$HOOKS_DIR/post-invocation.sh" \
  <<<'{"conversationId":"conv-clean"}')"
[ "$inv_out" = "{}" ] || fail "post-invocation.sh on clean edit must return {}, got: $inv_out"

# Violating edit records feedback and post-invocation injects + clears it
post_out="$(CONQUESTORIA_AGY_HOOK_STATE_DIR="$state_dir" "$HOOKS_DIR/post-file-edit.sh" \
  <<<"$(jq -n --arg p "$tmp/fake/src/bad.ts" --arg cwd "$ROOT" '{conversationId:"conv-bad",cwd:$cwd,toolCall:{name:"edit_file",args:{Path:$p}}}')")"
[ "$post_out" = "{}" ] || fail "post-file-edit.sh on bad edit must return {}, got: $post_out"

inv_out="$(CONQUESTORIA_AGY_HOOK_STATE_DIR="$state_dir" "$HOOKS_DIR/post-invocation.sh" \
  <<<'{"conversationId":"conv-bad"}')"
printf '%s' "$inv_out" | jq -e '.terminationBehavior == "force_continue"' >/dev/null || fail "post-invocation.sh did not force_continue on src violation: $inv_out"
printf '%s' "$inv_out" | jq -r '.injectSteps[0].systemMessage.systemMessage' | grep -q 'Math\.random' || fail "post-invocation.sh missing Math.random violation message: $inv_out"

# Second post-invocation sees empty state (consumed once)
inv_out2="$(CONQUESTORIA_AGY_HOOK_STATE_DIR="$state_dir" "$HOOKS_DIR/post-invocation.sh" \
  <<<'{"conversationId":"conv-bad"}')"
[ "$inv_out2" = "{}" ] || fail "post-invocation.sh did not clear state after injection: $inv_out2"

# --- 9. session-start.sh ---------------------------------------------------------
start_out="$(printf '{"cwd":"%s"}' "$feat_repo" | "$HOOKS_DIR/session-start.sh")"
[ "$start_out" = "{}" ] || fail "session-start.sh must return {}, got: $start_out"

echo "antigravity-hooks.test.sh: all checks passed"
