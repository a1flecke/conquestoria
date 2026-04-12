# Code Review Bundle 0 — Prevention (Claude Config Changes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the April 12 bug classes from recurring by extending `.claude/rules/*.md` and adding PostToolUse / PreToolUse hooks that catch the same mistakes while Claude is writing the code, not three weeks later in review.

**Why Bundle 0:** Every bug in Bundles 1-3 was either a violation of an existing written rule (`cities[0]`, hotseat `'player'`) or a violation of an *unwritten* rule the codebase clearly follows elsewhere (immutable turn processing, full-civ diplomacy wiring, no silent destructive UI). The fix is two-pronged: write the missing rules down, and enforce every rule with a hook script that fires on Write/Edit.

**Architecture:** Three layers.

1. **Rules** — extend `.claude/rules/*.md` with the missing guidance. Rules files are auto-loaded based on path frontmatter.
2. **Enforcement hooks** — a single `.claude/hooks/check-src-edit.sh` script invoked via `PostToolUse` on `Write|Edit`. It greps the edited file for forbidden patterns and returns exit 2 with a stderr reminder, which the Claude Code harness feeds back as non-blocking feedback (tool already ran — Claude sees the violation and fixes it in the next turn).
3. **Pre-push reminder** — a `PreToolUse` hook on `Bash` matching git push / gh pr merge commands that reminds to run the `code-review:code-review` skill before shipping.

**Tech Stack:** Bash, `jq`, grep, `.claude/settings.json` (checked in), existing `.claude/rules/*.md` layout.

**Reference:** April 12 code review. Claude Code hooks documentation: https://code.claude.com/docs/en/hooks. Baseline SHA: `9eae2dc`.

**Scope boundary:** This bundle changes ONLY `.claude/**`, `docs/**`, and adds shell scripts under `.claude/hooks/**`. It does not touch `src/**` or `tests/**`. Ship before Bundles 1-3 so those bundles get the benefit of the new guardrails as they land.

---

## Task 1: Document the "immutable turn processing" rule

**Files:**
- Modify: `.claude/rules/game-systems.md`

- [ ] **Step 1: Append the new section**

Add at the bottom of `.claude/rules/game-systems.md`:

```markdown
## Immutable Turn Processing
- Systems that process a turn (faction, minor-civ, diplomacy, wonder tick, etc.) MUST return a new `GameState`; never mutate `state.cities[id] = ...`, `state.units[id] = ...`, `state.civilizations[id] = ...`, or nested fields on those objects.
- Use spread-copy: `{ ...state, cities: { ...state.cities, [id]: { ...city, field: newValue } } }`.
- If you need to chain updates, thread a `let nextState = state;` through the loop and reassign; do not reach into the input state.
- Helpers that spawn entities (rebels, free units, barbarians) must return the new `units` map; never write through `state.units[...] = ...`.

## Diplomacy Lifecycle
- When a new civ is introduced mid-game (breakaway, rebellion statehood), every existing civ's `diplomacy.relationships` must get an entry for the new civ id, and the new civ's `relationships` must get an entry for every existing civ id.
- When a civ is removed (reabsorbed, eliminated), every other civ's `diplomacy.relationships` AND `diplomacy.atWarWith` AND active treaties involving that id must be scrubbed in the same operation. Dangling ids cause silent lookup failures downstream.

## No Dead Return Fields
- If a function's return type declares a field, populate it with real data.
- Do not return a placeholder (`0`, `null`, `''`) with a `// computed elsewhere` comment. Either compute it, or remove the field from the return type.

## Spawn Occupancy
- Any code that adds a unit to the map (rebel spawns, free unit rewards, barbarian raids, scenario seeding) MUST check `state.map.tiles[key]` exists AND no existing unit occupies that tile. If no free adjacent tile is found, skip the spawn — never stack.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/game-systems.md
git commit -m "docs(claude): document immutable turn processing and diplomacy lifecycle rules"
```

---

## Task 2: Strengthen the UI rules for recommendation surfaces and destructive mutations

**Files:**
- Modify: `.claude/rules/ui-panels.md`

- [ ] **Step 1: Append new sections**

Add at the bottom of `.claude/rules/ui-panels.md`:

```markdown
## Cities[0] Is Never The Answer (Extended)
The "cycle through all cities" rule applies to EVERY surface that gives city-scoped advice, not just the main city panel. This includes:
- Advisor triggers (`src/ui/advisor-system.ts`)
- Council agenda cards (`src/systems/council-system.ts`)
- Tutorial hints (`src/ui/tutorial.ts`)
- Turn summaries and HUD chips

Use `Object.values(state.cities).filter(c => c.owner === civId)` and then pick the relevant city (hungriest, most under-garrisoned, etc.) — never `civ.cities[0]`.

Exceptions: AI internal decisions that legitimately mean "capital" (e.g., `src/ai/basic-ai.ts` capital-distance heuristics, `src/systems/faction-system.ts` unrest-from-distance). Those may use `cities[0]` with a `// capital = cities[0] by convention` comment, so the hook script can tell intent from accident.

## Privacy And Discovery
- `getMinorCivPresentationForPlayer`, `getQuest*ForPlayer`, `getLegendaryWonderIntel*`, and any other `*ForPlayer` helper must mask EVERY player-visible field — name, color, icon, flavor text — behind the `known` / `discovered` check. Returning the real color while masking the name is a leak.
- UI code must prefer `*ForPlayer` helpers; never read `state.minorCivs[id].color` etc. directly from a viewer-side render path.

## No Silent Destructive UI
- Never silently replace a player-visible list (production queue, research queue, unit stack, trade route roster) when the player takes an action.
- If starting a new activity would discard scheduled work, preserve it (prepend/append the new item, keep the tail) or prompt for explicit confirmation.
- Regression tests must assert that pre-existing queue entries survive the operation.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/ui-panels.md
git commit -m "docs(claude): extend UI rules for cities[0], privacy masking, and destructive UI"
```

---

## Task 3: Create the PostToolUse enforcement script

**Files:**
- Create: `.claude/hooks/check-src-edit.sh`

- [ ] **Step 1: Create the hook script**

Write `.claude/hooks/check-src-edit.sh`:

```bash
#!/usr/bin/env bash
# Claude Code PostToolUse hook — inspects the most recent Write/Edit target
# and returns exit 2 with stderr feedback if it contains known bug patterns.
#
# This script is fired by settings.json after every Write/Edit under src/.
# Exit 2 means "non-blocking error"; the tool already ran, stderr goes back
# to Claude as feedback for its next turn.

set -u

payload="$(cat)"
file_path="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')"

# Only police TypeScript source under src/
case "$file_path" in
  */src/*.ts|*/src/**/*.ts) : ;;
  *) exit 0 ;;
esac

[ -f "$file_path" ] || exit 0

violations=""

append() {
  violations+="- $1
"
}

# --- cities[0] outside known-OK files ---
case "$file_path" in
  */src/ai/*|*/src/systems/faction-system.ts)
    : # allowed: capital heuristics
    ;;
  *)
    if grep -nE '\.cities\[0\]' "$file_path" >/dev/null; then
      lines="$(grep -nE '\.cities\[0\]' "$file_path" | head -5)"
      append "cities[0] used in a UI/recommendation path — cycle all cities (see .claude/rules/ui-panels.md):
$lines"
    fi
    ;;
esac

# --- direct state mutation in turn processing ---
if grep -nE 'state\.(cities|units|civilizations)\[[^]]+\]\s*=' "$file_path" >/dev/null; then
  lines="$(grep -nE 'state\.(cities|units|civilizations)\[[^]]+\]\s*=' "$file_path" | head -5)"
  append "Direct state mutation detected. Turn-processing systems must return a new GameState (see .claude/rules/game-systems.md#immutable-turn-processing):
$lines"
fi

# --- Math.random in src ---
if grep -nE 'Math\.random\(' "$file_path" | grep -v '//' >/dev/null; then
  lines="$(grep -nE 'Math\.random\(' "$file_path" | grep -v '//' | head -5)"
  append "Math.random() is banned in src/ — use seeded RNG (see .claude/rules/game-systems.md#deterministic-rng):
$lines"
fi

# --- hardcoded 'player' ownership check ---
if grep -nE "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" >/dev/null; then
  lines="$(grep -nE "=== ['\"]player['\"]|owner === ['\"]player['\"]" "$file_path" | head -5)"
  append "Hardcoded 'player' ownership check — use state.currentPlayer (see .claude/rules/ui-panels.md#hot-seat-multiplayer):
$lines"
fi

# --- innerHTML with template-literal game text ---
if grep -nE 'innerHTML\s*=\s*`[^`]*\$\{' "$file_path" >/dev/null; then
  lines="$(grep -nE 'innerHTML\s*=\s*`[^`]*\$\{' "$file_path" | head -5)"
  append "innerHTML with interpolated game data — use textContent or data-text placeholders (see .claude/rules/ui-panels.md#unit-info-panels):
$lines"
fi

# --- dead return field (heuristic: literal 0/null followed by 'computed' comment) ---
if grep -nE ':\s*(0|null|\[\])\s*,\s*//\s*calculated' "$file_path" >/dev/null; then
  lines="$(grep -nE ':\s*(0|null|\[\])\s*,\s*//\s*calculated' "$file_path" | head -5)"
  append "Placeholder return field with 'calculated elsewhere' comment — populate it or remove the field (see .claude/rules/game-systems.md#no-dead-return-fields):
$lines"
fi

if [ -n "$violations" ]; then
  printf 'check-src-edit: possible rule violations in %s\n%s\n' "$file_path" "$violations" >&2
  exit 2
fi

exit 0
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x .claude/hooks/check-src-edit.sh`

- [ ] **Step 3: Smoke-test the script manually**

Run:

```bash
echo '{"tool_input":{"file_path":"'"$PWD"'/src/ai/ai-personality.ts"}}' | .claude/hooks/check-src-edit.sh
echo "exit=$?"
```

Expected: `exit=0` (clean file).

Now test the detection path on a deliberately bad temp file:

```bash
mkdir -p /tmp/fakesrc/src
cat > /tmp/fakesrc/src/bad.ts <<'EOF'
const x = Math.random();
state.cities['c1'] = { id: 'c1' };
EOF
echo '{"tool_input":{"file_path":"/tmp/fakesrc/src/bad.ts"}}' | .claude/hooks/check-src-edit.sh
echo "exit=$?"
rm -rf /tmp/fakesrc
```

Expected: `exit=2`, stderr contains `Math.random()` and `Direct state mutation` violations.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/check-src-edit.sh
git commit -m "feat(claude): add PostToolUse src edit enforcement hook"
```

---

## Task 4: Create the pre-push code-review reminder hook

**Files:**
- Create: `.claude/hooks/pre-push-review-reminder.sh`

- [ ] **Step 1: Create the script**

Write `.claude/hooks/pre-push-review-reminder.sh`:

```bash
#!/usr/bin/env bash
# Claude Code PreToolUse hook for Bash — reminds Claude to run the
# code-review skill before pushing or merging if the current branch
# has commits ahead of origin/main.

set -u
payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"

case "$cmd" in
  *"git push"*|*"gh pr merge"*|*"gh pr create"*) : ;;
  *) exit 0 ;;
esac

# How many commits ahead of origin/main?
ahead=0
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  ahead="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
fi

if [ "${ahead:-0}" -ge 1 ]; then
  reason="This branch has $ahead commit(s) ahead of origin/main. Run the 'code-review:code-review' skill before pushing/merging. If you've already reviewed this branch in this session, proceed."
  jq -n --arg r "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: $r
    }
  }'
  exit 0
fi

exit 0
```

- [ ] **Step 2: Make executable**

Run: `chmod +x .claude/hooks/pre-push-review-reminder.sh`

- [ ] **Step 3: Smoke test**

Run:

```bash
echo '{"tool_input":{"command":"git push origin feature/x"}}' | .claude/hooks/pre-push-review-reminder.sh
```

Expected: if ahead of origin/main, emits JSON with `permissionDecision: "ask"`; otherwise exit 0 with no output.

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/pre-push-review-reminder.sh
git commit -m "feat(claude): add pre-push code-review reminder hook"
```

---

## Task 5: Wire both hooks into committed `.claude/settings.json`

**Files:**
- Create: `.claude/settings.json` (note: `settings.local.json` exists but is gitignored; we want these hooks shared across the team)

- [ ] **Step 1: Create the settings file**

Write `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/check-src-edit.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/pre-push-review-reminder.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify the harness picks it up**

Run: `/hooks` in Claude Code (interactive — tell the user to run it).

Expected: both hooks show up under their event names, source file `.claude/settings.json`.

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(claude): enable src edit + pre-push hooks in shared settings"
```

---

## Task 6: Add rule reference to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the current CLAUDE.md**

Run: `cat CLAUDE.md` and note the existing structure. The rule content should stay in `.claude/rules/*.md`; `CLAUDE.md` should just point there with a short reminder.

- [ ] **Step 2: Add a short "Rules Index" section near the top**

Insert after the intro block:

```markdown
## Rules Index

Detailed rules live in `.claude/rules/` and auto-apply based on the files you edit:
- `.claude/rules/game-systems.md` — RNG, events-vs-state, diplomacy, unit types, **immutable turn processing**, **diplomacy lifecycle**, **no dead return fields**, **spawn occupancy**
- `.claude/rules/ui-panels.md` — hot-seat `currentPlayer`, **cities[0] is never the answer**, **privacy and discovery**, **no silent destructive UI**, XSS-safe rendering
- `.claude/rules/strategy-game-mechanics.md` — combat, tech gating, victory
- `.claude/rules/end-to-end-wiring.md` — computed-data-must-render
- `.claude/rules/spec-fidelity.md` — spec conjunctions and gating preservation

A PostToolUse hook (`.claude/hooks/check-src-edit.sh`) greps every Write/Edit under `src/` for known rule violations and returns feedback in the same turn.

Before pushing or merging, run the `code-review:code-review` skill. A PreToolUse hook will remind you if the branch is ahead of `origin/main`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): add rules index and hook summary to CLAUDE.md"
```

---

## Task 7: Back-test hooks against the April 12 bugs

This step proves the new guardrails would have caught the bugs that landed. No code changes — just a reproducible record that the hooks work on real historical violations.

**Files:**
- Create: `docs/superpowers/plans/2026-04-12-cr-bundle0-backtest.md`

- [ ] **Step 1: Check out each buggy file at the offending SHA and run the hook**

Run each of the following from the repo root. Record outputs into the backtest doc as they run.

```bash
BACKTEST=/tmp/cr-backtest
rm -rf "$BACKTEST"; mkdir -p "$BACKTEST"

# Issue 2 — faction-system.ts direct mutation
git show 9eae2dc:src/systems/faction-system.ts > "$BACKTEST/faction-system.ts"
echo '{"tool_input":{"file_path":"'"$BACKTEST"'/faction-system.ts"}}' | \
  .claude/hooks/check-src-edit.sh; echo "exit=$?"

# Issue 1 — council-system.ts cities[0]
git show 9eae2dc:src/systems/council-system.ts > "$BACKTEST/council-system.ts"
echo '{"tool_input":{"file_path":"'"$BACKTEST"'/council-system.ts"}}' | \
  .claude/hooks/check-src-edit.sh; echo "exit=$?"

# Issue 5 — hotseat-events.ts dead sciencePerTurn field
git show 9eae2dc:src/core/hotseat-events.ts > "$BACKTEST/hotseat-events.ts"
echo '{"tool_input":{"file_path":"'"$BACKTEST"'/hotseat-events.ts"}}' | \
  .claude/hooks/check-src-edit.sh; echo "exit=$?"
```

Expected:
- faction-system: exit 2, flags direct mutation.
- council-system: exit 2, flags `cities[0]` (the file path is not `src/ai/*` or `src/systems/faction-system.ts`, so it is NOT on the allowlist — good, it should warn).
- hotseat-events: exit 2, flags the dead-field heuristic.

If any of the three fail to flag, refine `check-src-edit.sh` until they do, then re-run.

- [ ] **Step 2: Write the backtest record**

Create `docs/superpowers/plans/2026-04-12-cr-bundle0-backtest.md` with the three commands, their outputs, and a one-line "caught / missed" verdict per issue. Keep it under 50 lines.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-04-12-cr-bundle0-backtest.md .claude/hooks/check-src-edit.sh
git commit -m "test(claude): back-test enforcement hook against april 12 bugs"
```

---

## Task 8: Bundle verification

- [ ] **Step 1: Confirm hooks do not false-positive on a clean, already-good file**

Run:

```bash
echo '{"tool_input":{"file_path":"'"$PWD"'/src/systems/diplomacy-system.ts"}}' | .claude/hooks/check-src-edit.sh
echo "exit=$?"
```

Expected: `exit=0` (this file is known clean — it dedupes `atWarWith` correctly).

If it flags, tighten the regex.

- [ ] **Step 2: Confirm the AI allowlist works**

Run:

```bash
echo '{"tool_input":{"file_path":"'"$PWD"'/src/ai/basic-ai.ts"}}' | .claude/hooks/check-src-edit.sh
echo "exit=$?"
```

Expected: `exit=0`, because `cities[0]` in AI capital heuristics is allowlisted.

- [ ] **Step 3: Final commit of any regex tweaks**

```bash
git add -p
git commit -m "fix(claude): tune hook regexes after verification"
```

---

**Done when:**
- `.claude/rules/game-systems.md` and `ui-panels.md` carry the new rules.
- `.claude/hooks/check-src-edit.sh` and `pre-push-review-reminder.sh` exist, are executable, and catch all three back-test scenarios.
- `.claude/settings.json` is committed and wires both hooks.
- `CLAUDE.md` points at the rules index.
- Backtest doc shows 3/3 caught.

**Ship order:** Bundle 0 first, then Bundles 1-3 benefit from the new guardrails while being implemented.
