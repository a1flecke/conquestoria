# AGENTS.md Codex Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `AGENTS.md` accurate, lower-drift, and Codex-native by replacing prose-only enforcement with concrete runnable checks and by clearly separating canonical policy from enforcement helpers.

**Architecture:** Keep `CLAUDE.md` and `.claude/rules/*.md` as the canonical policy layer, and add one repo-level validation script that Codex can run directly after `src/` edits. Then slim `AGENTS.md` down so it points to the canonical rule files, names the exact verification commands to run, and avoids duplicating large policy summaries that will drift.

**Tech Stack:** Markdown, POSIX shell, `rg`, git, existing repo wrapper scripts

---

### Task 1: Add a Codex-runnable source-rule verification script

**Files:**
- Create: `scripts/check-src-rule-violations.sh`
- Verify against: `.claude/hooks/check-src-edit.sh`

**Parity requirements:**
- The new script is a direct-file Codex wrapper around the same heuristics already enforced by `.claude/hooks/check-src-edit.sh`; do not intentionally broaden or narrow the checks.
- Keep the same allowed path exceptions as the Claude hook: `src/ai/**` and `src/systems/faction-system.ts` are exempt from the `.cities[0]` check.
- Keep the same `Math.random()` behavior as the Claude hook by ignoring matches on lines filtered out by `grep -v '//'`.
- Keep the same target scope as the Claude hook: only existing `.ts` files under `src/` should be scanned, and non-`src` files passed on the command line should be skipped without error.
- Exit `0` when no violations are found, `1` for usage errors such as no arguments, and `2` when one or more violations are found.
- Output should stay human-readable and multiline, matching the spirit of the hook output rather than printing literal `\n` sequences.

- [ ] **Step 1: Write the script skeleton with direct file arguments**

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <file> [file...]" >&2
  exit 1
fi

status=0

append_violation() {
  local file="$1"
  local message="$2"
  printf 'check-src-rule-violations: %s\n%s\n' "$file" "$message" >&2
  status=2
}

append_match_block() {
  local label="$1"
  local lines="$2"
  printf -v violations '%s- %s:\n%s\n' "$violations" "$label" "$lines"
}
```

- [ ] **Step 2: Mirror the existing Claude hook heuristics in a direct file scan**

```bash
for file_path in "$@"; do
  case "$file_path" in
    src/*.ts|src/**/*.ts) ;;
    *) continue ;;
  esac

  [ -f "$file_path" ] || continue
  violations=""

  case "$file_path" in
    src/ai/*|src/systems/faction-system.ts) ;;
    *)
      if rg -n '\.cities\[0\]' "$file_path" >/dev/null; then
        lines="$(rg -n '\.cities\[0\]' "$file_path" | head -5)"
        append_match_block "cities[0] used outside approved capital heuristics" "$lines"
      fi
      ;;
  esac

  if rg -n 'state\.(cities|units|civilizations)\[[^]]+\]\s*=' "$file_path" >/dev/null; then
    lines="$(rg -n 'state\.(cities|units|civilizations)\[[^]]+\]\s*=' "$file_path" | head -5)"
    append_match_block "Direct state mutation in turn-processing path" "$lines"
  fi

  if grep -nE 'Math\.random\(' "$file_path" | grep -v '//' >/dev/null; then
    lines="$(grep -nE 'Math\.random\(' "$file_path" | grep -v '//' | head -5)"
    append_match_block "Math.random() is banned in src/" "$lines"
  fi

  if rg -n "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" >/dev/null; then
    lines="$(rg -n "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" | head -5)"
    append_match_block "Hardcoded player ownership check" "$lines"
  fi

  if rg -n 'innerHTML\s*=\s*`[^`]*\$\{' "$file_path" >/dev/null; then
    lines="$(rg -n 'innerHTML\s*=\s*`[^`]*\$\{' "$file_path" | head -5)"
    append_match_block "innerHTML with interpolated game data" "$lines"
  fi

  if rg -n ':\s*(0|null|\[\])\s*,\s*//\s*calculated' "$file_path" >/dev/null; then
    lines="$(rg -n ':\s*(0|null|\[\])\s*,\s*//\s*calculated' "$file_path" | head -5)"
    append_match_block "Placeholder return field left for later calculation" "$lines"
  fi

  if [ -n "$violations" ]; then
    append_violation "$file_path" "$violations"
  fi
done

exit "$status"
```

- [ ] **Step 3: Make the script executable**

Run: `chmod +x scripts/check-src-rule-violations.sh`
Expected: command exits successfully with no output

- [ ] **Step 4: Smoke-test the script against the current source tree subset**

Run: `scripts/check-src-rule-violations.sh src/main.ts src/ui/advisor-system.ts`
Expected: exits `0` if the files are clean, or exits `2` with specific violations if not

- [ ] **Step 5: Commit**

```bash
git add scripts/check-src-rule-violations.sh
git commit -m "chore(codex): add src rule verification script"
```

### Task 2: Rewrite AGENTS.md around canonical sources and exact commands

**Files:**
- Modify: `AGENTS.md`
- Reference: `CLAUDE.md`
- Reference: `.claude/rules/game-systems.md`
- Reference: `.claude/rules/ui-panels.md`
- Reference: `.claude/rules/strategy-game-mechanics.md`
- Reference: `.claude/rules/end-to-end-wiring.md`
- Reference: `.claude/rules/spec-fidelity.md`
- Reference: `scripts/check-src-rule-violations.sh`

- [ ] **Step 1: Replace the purpose section so policy and enforcement are clearly separated**

```md
## Purpose
`AGENTS.md` is the official repo instruction file for Codex.

Canonical project policy lives in:
- `CLAUDE.md`
- `.claude/rules/*.md`

Claude-specific hook scripts in `.claude/hooks/` are enforcement helpers, not the policy source. When Codex is working in this repo, follow the policy files above and run the repo checks listed below.
```

- [ ] **Step 2: Replace the rule-summary block with a short routing section**

```md
## Rule Files
If you touch files in these areas, read the matching rule file before editing:

- `src/systems/**`, `src/core/**`, `src/ai/**` → `.claude/rules/game-systems.md`
- `src/ui/**`, `src/renderer/**`, `src/main.ts` → `.claude/rules/ui-panels.md`
- `src/**` → `.claude/rules/end-to-end-wiring.md`
- `docs/superpowers/specs/**`, `docs/superpowers/plans/**` or any spec-driven implementation → `.claude/rules/spec-fidelity.md`

Use `CLAUDE.md` for repo-wide architecture, command, and gameplay conventions.
```

- [ ] **Step 3: Replace the manual parity section with exact commands Codex must run**

```md
## Required Verification
After editing files under `src/`, run:

- `scripts/check-src-rule-violations.sh path/to/changed-src-file.ts [more changed src files...]`
- `./scripts/run-with-mise.sh yarn test --run tests/path/to/mirrored-file.test.ts [more mirrored tests...]`

Test-selection rule:

- For each changed `src/foo/bar.ts`, first look for the mirrored test file `tests/foo/bar.test.ts`.
- If one or more mirrored test files exist, run all of them in the same `yarn test --run ...` command.
- If no mirrored test file exists for the changed area, run the smallest existing relevant test file in the same domain directory.
- If no targeted test can be identified confidently, run `./scripts/run-with-mise.sh yarn test`.

Before `git push`, PR creation, or merge when `HEAD` is ahead of `origin/main`, review both:

- `git diff --stat origin/main...HEAD`
- `git diff --stat`

If either diff includes source changes, inspect the full diff before concluding review is complete.
```

- [ ] **Step 4: Remove duplicated policy bullets that already exist in canonical rule files**

Delete the long duplicated summaries under:

```md
## Rules Index
## Codex Enforcement Parity
## Gameplay And UI Rules
```

Keep only short high-signal repo guidance that is not already maintained elsewhere.

- [ ] **Step 5: Verify the rewritten file still keeps the repo-specific commands and architecture notes**

Run: `sed -n '1,220p' AGENTS.md`
Expected: file still includes project layout, preferred commands, architecture notes, testing guidance, and commit/PR guidance, but no longer duplicates large rule summaries

- [ ] **Step 5a: Verify the `Required Verification` section contains no placeholders**

Run: `sed -n '/## Required Verification/,/## /p' AGENTS.md`
Expected: the section contains concrete command forms plus the explicit mirrored-test fallback rule, not angle-bracket placeholders

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md
git commit -m "docs(codex): tighten AGENTS.md guidance"
```

### Task 3: Verify Codex guidance matches the updated AGENTS contract

**Files:**
- Modify: `AGENTS.md` if needed after verification
- Reference: `docs/superpowers/plans/2026-04-12-agents-md-codex-alignment.md`

- [ ] **Step 1: Check the source-edit flow end to end**

Run: `git diff -- AGENTS.md scripts/check-src-rule-violations.sh`
Expected: diff shows `AGENTS.md` routing Codex to canonical policy files and naming runnable verification commands instead of prose-only reminders

- [ ] **Step 2: Confirm the required commands are repo-real**

Run: `test -x scripts/check-src-rule-violations.sh && test -x ./scripts/run-with-mise.sh`
Expected: command exits `0`

- [ ] **Step 3: Do a final drift check against the Claude policy files**

Run: `rg -n "canonical|Rule Files|Required Verification|Gameplay And UI Rules|Rules Index" AGENTS.md CLAUDE.md .claude/rules`
Expected: `AGENTS.md` points to the canonical rule files and no longer presents a second full copy of the same policy surface

- [ ] **Step 4: Make any final wording adjustments if the drift check reveals duplicated policy**

```md
If AGENTS still contains long gameplay-policy lists copied from `.claude/rules/*.md`, replace them with one-line pointers to the matching canonical rule file.
```

- [ ] **Step 5: Run final doc verification**

Run: `git diff --check`
Expected: no whitespace or formatting errors

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md scripts/check-src-rule-violations.sh
git commit -m "docs(codex): align AGENTS.md with Codex best practices"
```
