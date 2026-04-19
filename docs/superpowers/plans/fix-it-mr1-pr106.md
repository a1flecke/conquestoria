# Fix-It Plan — PR #106 (Espionage MR1 Tasks 1+2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (or `superpowers:subagent-driven-development`) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Implementor model target:** Sonnet 4.6.
> **Branch:** `fix-it/mr1-pr106` (this branch). Land all fixes here, then push and either (a) update PR #106 in place, or (b) open a new PR that supersedes #106.
> **Source PR under audit:** https://github.com/a1flecke/conquestoria/pull/106

---

## Audit summary

PR #106 ships partial MR1 work and ships it incorrectly. Two classes of problem:

**Class A — Claude/tooling guardrails (so this never repeats):** the two new PreToolUse hooks (`block-claire-paths.sh`, `block-commit-on-main.sh`) read `$CLAUDE_TOOL_INPUT` — an environment variable that **does not exist**. Per current Claude Code hook docs, `PreToolUse` hooks receive their input as JSON on **stdin** (`jq -r '.tool_input.file_path'`, etc.). Both hooks empirically exit 0 on inputs they should block. The user believes they have protection; they have none. This kind of "looks-correct-but-no-op" bug ships when there's no test infrastructure for hooks and no rule documenting the contract.

**Class B — Code/spec issues in the espionage MR1 implementation:** the PR title claims "Tasks 1+2" but Task 1 is incomplete, and shipping Task 2 without Tasks 3+4 produces a **broken player-facing feature** — players can train spy units, but the units are orphans (no `Spy` record, no missions possible). This violates the existing project rule "If you create a utility function, it MUST be called from at least one code path — dead code is a bug" (`.claude/rules/end-to-end-wiring.md`) and "Filter trainable units by `techRequired` against `civ.techState.completed`" (`.claude/rules/ui-panels.md`).

Full per-issue confidence: every issue below was verified against the PR diff at `pr-106-head` and the corresponding source file before being included; nits and likely-false-positives were excluded.

---

## Issues found (consolidated)

### Critical — broken-as-shipped

1. **Both PreToolUse hooks are no-ops.** `.claude/hooks/block-claire-paths.sh` and `.claude/hooks/block-commit-on-main.sh` set `TOOL_INPUT="${CLAUDE_TOOL_INPUT:-}"`. There is no such env var. Empirical proof: `echo '{"tool_name":"Write","tool_input":{"file_path":"/foo/.claire/x"}}' | bash .claude/hooks/block-claire-paths.sh` exits 0. Both hooks must read JSON from stdin via `jq`.

2. **Spy units are dead-on-arrival.** `TRAINABLE_UNITS` in `src/systems/city-system.ts` now lists `spy_scout`…`spy_hacker`, so a player whose civ has `espionage-scouting` will see "Scout Agent" in their city build menu and queue it. On completion, `src/core/turn-manager.ts:90-95` calls `createUnit(...)` and adds it to `state.units`, but **nothing creates the corresponding `Spy` record** in `state.espionage[civId].spies`. Result: a unit on the map with no espionage state — cannot be assigned, cannot run missions. (`createSpyFromUnit`/`isSpyUnitType` from MR1 Task 3 was not added.)

3. **`getTrainableUnitsForCiv` is dead code.** Helper added in `city-system.ts` but no caller. `processCity` (line 190) still does `TRAINABLE_UNITS.find(u => u.type === currentItem)` with no tech-completion or obsolescence filter, so:
   - Players can never see the obsolescence filter actually take effect in the city build list.
   - A queued obsolete unit (e.g. `spy_scout` after researching `espionage-informants`) keeps producing forever.
   - Directly violates `.claude/rules/end-to-end-wiring.md` ("dead code is a bug") and `.claude/rules/ui-panels.md` ("Filter trainable units by `techRequired` against `civ.techState.completed`").

4. **`Spy.unitType` is optional in PR; plan requires it.** `src/core/types.ts` has `unitType?: UnitType;`. The MR1 plan and the README's Type Consistency Check both specify `spy.unitType: UnitType` (required) because every downstream MR (4, 6, 7) reads it to recreate the physical unit on expel/unembed/exfiltrate. Optional → either runtime crashes (`!`) or silent skip — both are bug seeds. The two are also mutually inconsistent: a `Spy` created via `recruitSpy` (still live) would lack `unitType`, while a future `createSpyFromUnit` would set it.

5. **`createEspionageCivState` still returns `maxSpies: 1`.** Plan Task 3 Step 3 explicitly says change to `0`. Only `initializeEspionage` was fixed (Math.max(1, …) removed). Civs created via `createEspionageCivState` (used by tests and any code path that bypasses `initializeEspionage`) still get the wrong default.

6. **Spy unit deaths leave zombie `Spy` records.** No `cleanupDeadSpyUnit` helper exists, so when a spy unit is killed in combat (`main.ts` death branches), `state.units[id]` is removed but `state.espionage[civId].spies[id]` persists, eventually saturating `maxSpies`.

7. **`assignSpy` shortcut bypasses the entire physical-spy design.** `src/systems/espionage-system.ts:148` still teleports a spy from `idle` → `stationed` with no physical movement, no infiltration roll, no detection, no disguise. The panel's "Assign" button (`src/main.ts:711-720`) and "Recruit" button (`src/main.ts:696-708`) are still wired to `recruitSpy`/`assignSpy`. Plan Task 1 Step 6 explicitly says: *"In main.ts, find any assignSpy calls from the panel and remove/update them — the 'Assign' flow is replaced by physical movement + Infiltrate in MR 4."* Plan Task 3 Step 5 adds: *"Remove the onRecruit button and callback from createEspionagePanel and EspionagePanelCallbacks. Players build spy units in cities."*

### High — spec deviation / silent regression

8. **PR description claims "Tasks 1+2" but Task 1 Step 6 (panel-flow removal) is not done.** Title implies completeness; reality is partial. Either the title needs to change or the work needs finishing.

9. **AI never trains spy units.** `src/ai/basic-ai.ts:639` still calls `recruitSpy()` directly — the abstract path that doesn't produce physical units. With MR1 active, AI civs accumulate abstract spies that don't show up on the map; player civs build physical units that have no Spy record. Asymmetric and incoherent.

10. **Test enshrines the bug rather than catching it.** `tests/systems/espionage-system.test.ts` now contains *"assignSpy sets spy to stationed immediately (travel is now physical movement)"*. That test locks in the very short-circuit that should be removed. Once `assignSpy` is removed, this test should be deleted (not modified) — the only legitimate path is `Infiltrate` in MR4.

### Medium — fragile contracts / nits worth fixing while we're here

11. **`block-commit-on-main.sh` regex matches `git commit-tree`, `git commit-graph`, `git commit-msg-hook`.** `git (commit|merge)` lacks word boundaries. Use `\bgit (commit|merge)\b` or split commands more carefully. Low-impact today (Claude doesn't run those subcommands), but easy to fix.

12. **Two `Bash` PreToolUse matcher entries** in `.claude/settings.json` instead of merging into one. Works (both fire), but messier than necessary. Combine into a single block with two hook commands.

### Acceptable forward-stubs (do not fix)

- `BuildingCategory: 'espionage'` added with no current consumer — used in MR9.
- `spyDetectionChance: 0.35` added on `scout_hound` with no consumer — used in MR2.
- `InterrogationRecord`/`InterrogationIntel` types — used in MR6.
- `recentDetections`, `activeInterrogations` on `EspionageCivState` — used in MR2/MR6.
- Spy `UNIT_DESCRIPTIONS` mention disguise/missions/detection that don't exist yet — descriptive copy, not behavior.

These are all forward-compatible additions consistent with the staged-MR plan. Leave them alone.

---

## Plan

Three task groups: **G1 = Claude/tooling guardrails** (so this class of bug stops shipping), **G2 = Hook fixes**, **G3 = Espionage MR1 completion**. Implement in order; each ends with `yarn test` (and for G2, an explicit hook smoke test) green before proceeding.

---

### G1 — Claude/tooling guardrails

#### G1-T1: Add `.claude/rules/hooks-and-tooling.md` documenting the hook contract

**File to create:** `.claude/rules/hooks-and-tooling.md`

- [x] **G1-T1 Step 1:** Create the rule file with this exact content:

  ```markdown
  # Hooks And Tooling

  ## PreToolUse / PostToolUse hooks read JSON from stdin
  - Claude Code hooks do NOT receive `CLAUDE_TOOL_INPUT` or any other env var holding the tool input.
  - Tool input arrives as JSON on stdin. Parse it with `jq`:
    - `jq -r '.tool_name'` for the tool name
    - `jq -r '.tool_input.file_path // empty'` for Write/Edit/Read paths
    - `jq -r '.tool_input.command // empty'` for Bash commands
  - Read stdin exactly once into a variable, then query that variable with `jq`:
    ```bash
    INPUT=$(cat)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    ```
  - Source: https://code.claude.com/docs/en/hooks

  ## Hook exit codes
  - `0` — allow the tool call (proceed). stdout JSON may control the call further.
  - `2` — block the tool call. stderr is fed back to Claude as the reason.
  - Any other code — non-blocking error; Claude proceeds, stderr surfaces in the transcript.

  ## Every new hook script needs a smoke test
  - When you add a hook script under `.claude/hooks/`, add a matching smoke test under `tests/hooks/<name>.test.sh` that:
    1. pipes a representative blocking input as JSON via stdin and asserts exit code 2,
    2. pipes a representative passing input and asserts exit code 0,
    3. is wired into `yarn test` (or a top-level `bash tests/hooks/run.sh` invoked by CI/lint).
  - Without a smoke test, a non-functional hook (e.g. wrong env var, wrong jq path) will silently no-op forever and erode trust in the safety system.

  ## Hook authorship checklist (apply before merging any new hook)
  - [ ] Reads stdin via `cat` exactly once
  - [ ] Uses `jq -r '.tool_input.<field> // empty'` for every field it queries
  - [ ] Returns exit 2 on the deny path with a clear stderr message
  - [ ] Has matching `tests/hooks/<name>.test.sh` covering pass and block paths
  - [ ] Registered in `.claude/settings.json` under the correct `matcher` for the tool it cares about
  ```

- [x] **G1-T1 Step 2:** No code change yet — just the doc. Verify the file exists and renders correctly in any Markdown previewer.

#### G1-T2: Extend `.claude/rules/end-to-end-wiring.md` with a "trainable unit completeness" clause

**File to modify:** `.claude/rules/end-to-end-wiring.md`

- [x] **G1-T2 Step 1:** Append a new section immediately after the existing "Never compute without rendering" section:

  ```markdown
  ## Trainable units must be wired end-to-end
  - When you add a `UnitType` to `TRAINABLE_UNITS` in `src/systems/city-system.ts`, the same change MUST also wire:
    1. **`UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS`** entries in `src/systems/unit-system.ts`.
    2. **Unit-renderer icon** in `src/renderer/unit-renderer.ts`.
    3. **Production-completion side-effects.** If the unit type has matching system state (e.g. spies → `state.espionage[civId].spies`, settlers → `state.cities` foundation), `src/core/turn-manager.ts` MUST create that state record at the same moment the `Unit` is added to `state.units`.
    4. **Death cleanup.** If the unit type has matching system state, `src/main.ts` death branches MUST clean it up to avoid zombie records.
    5. **AI usage.** `src/ai/basic-ai.ts` MUST queue the new unit type when its conditions hold; otherwise AI civs become asymmetric with the player.
    6. **Tech-gated dequeue.** `processCity` MUST consult `getTrainableUnitsForCiv(civ.techState.completed)` — or an equivalent — so an obsolete queued unit silently dequeues instead of producing forever.
  - Adding a `UnitType` to `TRAINABLE_UNITS` without all six wirings is "dead computed data" and is a bug.
  ```

- [x] **G1-T2 Step 2:** Verify the existing rule list (lines 4-12 of the current file) is preserved intact.

#### G1-T3: Add `.claude/rules/incremental-mr-completion.md`

**File to create:** `.claude/rules/incremental-mr-completion.md`

- [x] **G1-T3 Step 1:** Create with the following content:

  ```markdown
  # Incremental MR Completion

  When implementing only a subset of an MR plan's tasks:
  - The PR title MUST reflect the subset (e.g. "MR1 Tasks 1+2" not "MR1").
  - The PR body MUST list the omitted tasks under an "Out of scope" heading.
  - The PR body MUST include a "Why this is safe to merge partial" paragraph that names every player-visible surface introduced by the included tasks and confirms it does not produce dead-end UX.
  - If any included task introduces a player-visible action (button, queue entry, panel item) whose follow-up wiring lives in an omitted task, EITHER:
    1. Finish the omitted task, OR
    2. Hide the surface behind a feature flag until the follow-up ships.
  - Shipping a player-facing button/queue entry that does nothing — or that links to a half-built system — is not "incremental delivery"; it is shipping a bug.
  ```

#### G1-T4: Bootstrap `tests/hooks/` infrastructure

**Files to create:**
- `tests/hooks/run.sh`
- `tests/hooks/block-claire-paths.test.sh`
- `tests/hooks/block-commit-on-main.test.sh`
- `package.json` (modify `scripts.test:hooks`)

- [ ] **G1-T4 Step 1:** Create `tests/hooks/run.sh`:

  ```bash
  #!/usr/bin/env bash
  # Run every *.test.sh under tests/hooks/ and aggregate results.
  set -u
  fail=0
  for t in "$(dirname "$0")"/*.test.sh; do
    [ -f "$t" ] || continue
    if bash "$t"; then
      echo "PASS $(basename "$t")"
    else
      echo "FAIL $(basename "$t")"
      fail=1
    fi
  done
  exit "$fail"
  ```
  Then `chmod +x tests/hooks/run.sh`.

- [ ] **G1-T4 Step 2:** Create `tests/hooks/block-claire-paths.test.sh`:

  ```bash
  #!/usr/bin/env bash
  # Smoke test: block-claire-paths.sh must exit 2 on .claire paths, exit 0 otherwise.
  set -u
  HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/block-claire-paths.sh"

  fail=0

  # Should block (exit 2): any field containing .claire
  for payload in \
    '{"tool_name":"Write","tool_input":{"file_path":"/repo/.claire/foo"}}' \
    '{"tool_name":"Edit","tool_input":{"file_path":"/repo/.claire/rules/x.md"}}' \
    '{"tool_name":"Read","tool_input":{"file_path":"/repo/.claire/settings.json"}}'; do
    out=$(echo "$payload" | bash "$HOOK" 2>&1); rc=$?
    if [ "$rc" != "2" ]; then
      echo "expected exit 2 for $payload, got $rc ($out)"; fail=1
    fi
  done

  # Should allow (exit 0): paths that contain .claude or unrelated text
  for payload in \
    '{"tool_name":"Write","tool_input":{"file_path":"/repo/.claude/settings.json"}}' \
    '{"tool_name":"Read","tool_input":{"file_path":"/repo/src/main.ts"}}' \
    '{"tool_name":"Bash","tool_input":{"command":"echo hello"}}'; do
    out=$(echo "$payload" | bash "$HOOK" 2>&1); rc=$?
    if [ "$rc" != "0" ]; then
      echo "expected exit 0 for $payload, got $rc ($out)"; fail=1
    fi
  done

  exit "$fail"
  ```
  Then `chmod +x tests/hooks/block-claire-paths.test.sh`.

- [ ] **G1-T4 Step 3:** Create `tests/hooks/block-commit-on-main.test.sh`:

  ```bash
  #!/usr/bin/env bash
  # Smoke test: block-commit-on-main.sh must exit 2 on git commit/merge when on main, exit 0 otherwise.
  set -u
  HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/block-commit-on-main.sh"

  fail=0
  ORIG_BRANCH=$(git rev-parse --abbrev-ref HEAD)

  trap 'git checkout -q "$ORIG_BRANCH" 2>/dev/null || true' EXIT

  # Helper: run hook in a synthetic branch context
  run_with_branch() {
    local branch="$1" payload="$2"
    if git show-ref --verify --quiet "refs/heads/$branch"; then :; else
      git branch -q "$branch" 2>/dev/null || true
    fi
    git checkout -q "$branch"
    echo "$payload" | bash "$HOOK" 2>&1
    echo "rc=$?"
  }

  # On main with git commit: must block
  out=$(run_with_branch main '{"tool_name":"Bash","tool_input":{"command":"git commit -m foo"}}')
  echo "$out" | grep -q 'rc=2' || { echo "expected block on main+commit, got: $out"; fail=1; }

  # On main with git merge: must block
  out=$(run_with_branch main '{"tool_name":"Bash","tool_input":{"command":"git merge feature"}}')
  echo "$out" | grep -q 'rc=2' || { echo "expected block on main+merge, got: $out"; fail=1; }

  # On main with non-git command: must pass
  out=$(run_with_branch main '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}')
  echo "$out" | grep -q 'rc=0' || { echo "expected allow on main+ls, got: $out"; fail=1; }

  # On a feature branch with git commit: must pass
  git branch -q test-feat 2>/dev/null || true
  out=$(run_with_branch test-feat '{"tool_name":"Bash","tool_input":{"command":"git commit -m foo"}}')
  echo "$out" | grep -q 'rc=0' || { echo "expected allow on feat+commit, got: $out"; fail=1; }
  git branch -qD test-feat 2>/dev/null || true

  exit "$fail"
  ```
  Then `chmod +x tests/hooks/block-commit-on-main.test.sh`.

  **Note for implementor:** the branch-switching test is invasive (it actually checks out `main`). If the working tree is dirty this test should self-skip — wrap the body in `if [ -n "$(git status --porcelain)" ]; then echo "skip: dirty tree"; exit 0; fi`. Add that guard.

- [ ] **G1-T4 Step 4:** Modify `package.json` `scripts` to add:

  ```json
  "test:hooks": "bash tests/hooks/run.sh"
  ```

  And update the existing `"test"` script to chain hook smoke tests **after** the vitest run, e.g.:

  ```json
  "test": "vitest run && bash tests/hooks/run.sh"
  ```

  (Read the current `test` script first; preserve any existing flags.)

- [ ] **G1-T4 Step 5:** Run `bash tests/hooks/run.sh`. With the current broken hook scripts these tests MUST FAIL — that failure is the proof the smoke harness works. Do not "fix" the test to make the broken hook pass; G2 fixes the hook.

---

### G2 — Hook fixes

#### G2-T1: Rewrite `.claude/hooks/block-claire-paths.sh` to read stdin

**File to modify:** `.claude/hooks/block-claire-paths.sh`

- [ ] **G2-T1 Step 1:** Replace the entire file content with:

  ```bash
  #!/usr/bin/env bash
  # PreToolUse hook — blocks file operations whose path contains '.claire'
  # (typo for '.claude'). See https://github.com/anthropics/claude-code/issues/31493
  #
  # Hook contract: tool input arrives as JSON on stdin (NOT in CLAUDE_TOOL_INPUT).
  # See .claude/rules/hooks-and-tooling.md.

  INPUT=$(cat)
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

  if [ -n "$FILE_PATH" ] && echo "$FILE_PATH" | grep -q '\.claire'; then
    echo "ERROR: Path '$FILE_PATH' contains '.claire' — this is a typo bug for '.claude'. Refusing operation." >&2
    exit 2
  fi

  exit 0
  ```

- [ ] **G2-T1 Step 2:** `chmod +x .claude/hooks/block-claire-paths.sh` (preserve executable bit).

- [ ] **G2-T1 Step 3:** Re-run `bash tests/hooks/block-claire-paths.test.sh` — it must now pass.

#### G2-T2: Rewrite `.claude/hooks/block-commit-on-main.sh` to read stdin

**File to modify:** `.claude/hooks/block-commit-on-main.sh`

- [ ] **G2-T2 Step 1:** Replace the entire file content with:

  ```bash
  #!/usr/bin/env bash
  # PreToolUse hook — blocks `git commit` or `git merge` when current branch is main/master.
  # Memory: aaron's "never commit directly to main" preference.
  #
  # Hook contract: tool input arrives as JSON on stdin (NOT in CLAUDE_TOOL_INPUT).
  # See .claude/rules/hooks-and-tooling.md.

  INPUT=$(cat)
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

  # Only inspect git commands; word-boundary the subcommand match to avoid
  # false positives like `git commit-tree`.
  if [ -z "$COMMAND" ] || ! echo "$COMMAND" | grep -qE '(^|[[:space:]&;|])git[[:space:]]+(commit|merge)([[:space:]]|$)'; then
    exit 0
  fi

  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

  if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "ERROR: Direct '$COMMAND' on '$CURRENT_BRANCH' is blocked. Create a branch and open a PR instead." >&2
    exit 2
  fi

  exit 0
  ```

- [ ] **G2-T2 Step 2:** `chmod +x .claude/hooks/block-commit-on-main.sh`.

- [ ] **G2-T2 Step 3:** Re-run `bash tests/hooks/block-commit-on-main.test.sh` — it must now pass.

#### G2-T3: Consolidate the two `Bash` PreToolUse matcher entries in `.claude/settings.json`

**File to modify:** `.claude/settings.json`

- [ ] **G2-T3 Step 1:** The current PR adds two separate `{ "matcher": "Bash", ... }` blocks. Merge them into a single block that fires both hooks for every Bash call:

  ```json
  {
    "matcher": "Bash",
    "hooks": [
      {
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/pre-push-review-reminder.sh",
        "timeout": 5
      },
      {
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-commit-on-main.sh",
        "timeout": 5
      }
    ]
  }
  ```

  Leave the `Write|Edit|Read` matcher (which runs `block-claire-paths.sh`) as-is.

- [ ] **G2-T3 Step 2:** Validate JSON (`jq . .claude/settings.json` should not error) and re-run `bash tests/hooks/run.sh`.

---

### G3 — Espionage MR1 completion

The implementor should treat this as **completing MR1** as specified in `docs/superpowers/plans/espionage-overhaul/mr-01-physical-spy-units.md`. PR #106 covered Tasks 1+2 partially. G3 finishes Task 1 Step 6, completes Tasks 3+4, and corrects the type/contract issues from Task 1.

#### G3-T1: Make `Spy.unitType` required

**File to modify:** `src/core/types.ts`

- [ ] **G3-T1 Step 1:** Change line containing `unitType?: UnitType;` (in the `Spy` interface) to `unitType: UnitType;` (no `?`). Reason: every downstream MR (4, 6, 7) reads it to recreate physical units; optional invites silent skips and `!` crashes.

- [ ] **G3-T1 Step 2:** TypeScript will now error on every existing `Spy` construction site that doesn't set `unitType`. Run `yarn test` to surface the compile errors. Expected sites:
  - `recruitSpy()` in `src/systems/espionage-system.ts` — see G3-T6 (helper is being removed; no fix needed if removal happens first).
  - Test fixtures that build `Spy` literals — fix each by adding `unitType: 'spy_scout'` (or whatever fits the test scenario).

- [ ] **G3-T1 Step 3:** Do not add `unitType: 'spy_scout' as UnitType` casts anywhere. If TypeScript can't infer it, the construction site is suspect — examine it.

#### G3-T2: Fix `createEspionageCivState` default `maxSpies`

**File to modify:** `src/systems/espionage-system.ts`

- [ ] **G3-T2 Step 1:** Change line 71 from `maxSpies: 1,` to `maxSpies: 0,`. Add `activeInterrogations: {},` and `recentDetections: [],` to the returned object so it matches the extended `EspionageCivState` shape:

  ```typescript
  export function createEspionageCivState(): EspionageCivState {
    return {
      spies: {},
      maxSpies: 0,
      counterIntelligence: {},
      detectedThreats: {},
      activeInterrogations: {},
      recentDetections: [],
    };
  }
  ```

- [ ] **G3-T2 Step 2:** Update any test that asserted `maxSpies >= 1` on a freshly-created civ state to reflect the new default of `0`. Tests that need a spy slot for setup must explicitly set `maxSpies` after calling `createEspionageCivState`.

#### G3-T3: Add `isSpyUnitType`, `createSpyFromUnit`, `cleanupDeadSpyUnit`

**File to modify:** `src/systems/espionage-system.ts`

- [ ] **G3-T3 Step 1:** After `recruitSpy` (line ~146), add:

  ```typescript
  const SPY_UNIT_TYPES = new Set<UnitType>([
    'spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_hacker',
  ]);

  export function isSpyUnitType(type: UnitType): boolean {
    return SPY_UNIT_TYPES.has(type);
  }

  export function createSpyFromUnit(
    state: EspionageCivState,
    unitId: string,
    owner: string,
    unitType: UnitType,
    seed: string,
  ): { state: EspionageCivState; spy: Spy } {
    const rng = createRng(seed);
    const nameIndex = Math.floor(rng() * SPY_NAMES.length);
    const spy: Spy = {
      id: unitId,
      owner,
      name: `Agent ${SPY_NAMES[nameIndex]}`,
      unitType,
      targetCivId: null,
      targetCityId: null,
      position: null,
      status: 'idle',
      experience: 0,
      currentMission: null,
      cooldownTurns: 0,
      promotion: undefined,
      promotionAvailable: false,
      feedsFalseIntel: false,
      disguiseAs: null,
      infiltrationCityId: null,
      cityVisionTurnsLeft: 0,
      stolenTechFrom: {},
    };
    return {
      state: { ...state, spies: { ...state.spies, [unitId]: spy } },
      spy,
    };
  }

  export function cleanupDeadSpyUnit(
    espionage: EspionageState,
    owner: string,
    unitId: string,
  ): EspionageState {
    const civEsp = espionage[owner];
    if (!civEsp?.spies[unitId]) return espionage;
    const { [unitId]: _removed, ...remainingSpies } = civEsp.spies;
    return {
      ...espionage,
      [owner]: { ...civEsp, spies: remainingSpies },
    };
  }
  ```

- [ ] **G3-T3 Step 2:** Export both `isSpyUnitType` and `createSpyFromUnit` and `cleanupDeadSpyUnit` from the module.

#### G3-T4: Wire `createSpyFromUnit` into `turn-manager.ts`

**File to modify:** `src/core/turn-manager.ts`

- [ ] **G3-T4 Step 1:** Add to the import block at the top:

  ```typescript
  import { isSpyUnitType, createSpyFromUnit } from '@/systems/espionage-system';
  ```

- [ ] **G3-T4 Step 2:** Replace the existing block (currently around lines 90-95):

  ```typescript
  if (result.completedUnit) {
    bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
    const newUnit = createUnit(result.completedUnit, civId, city.position, civDef?.bonusEffect);
    newState.units[newUnit.id] = newUnit;
    newState.civilizations[civId].units.push(newUnit.id);
  }
  ```

  with:

  ```typescript
  if (result.completedUnit) {
    bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
    const newUnit = createUnit(result.completedUnit, civId, city.position, civDef?.bonusEffect);
    newState.units[newUnit.id] = newUnit;
    newState.civilizations[civId].units.push(newUnit.id);

    if (isSpyUnitType(result.completedUnit) && newState.espionage?.[civId]) {
      const { state: updatedEsp, spy } = createSpyFromUnit(
        newState.espionage[civId],
        newUnit.id,
        civId,
        result.completedUnit,
        `spy-unit-${newUnit.id}-${newState.turn}`,
      );
      newState.espionage[civId] = updatedEsp;
      bus.emit('espionage:spy-recruited', { civId, spy });
    }
  }
  ```

- [ ] **G3-T4 Step 3:** Note that this block mutates `newState.units` / `newState.civilizations[civId].units` directly — that pre-existing pattern is what `processTurn` already uses. Do NOT refactor to immutable here; it's out of scope and would risk regressions across unrelated systems. Match the surrounding style.

#### G3-T5: Wire `getTrainableUnitsForCiv` into `processCity` for tech-gated dequeue

**Files to modify:** `src/systems/city-system.ts`, `src/core/turn-manager.ts`

- [ ] **G3-T5 Step 1:** Change the `processCity` signature to accept `completedTechs`:

  ```typescript
  export function processCity(
    city: City,
    map: GameMap,
    foodYield: number,
    productionYield: number = 0,
    bonusEffect?: CivBonusEffect,
    completedTechs: string[] = [],
  ): CityProcessResult {
  ```

- [ ] **G3-T5 Step 2:** Inside `processCity`, replace the `unitDef` lookup (line ~190) so an obsolete unit silently dequeues without producing:

  ```typescript
  const unitDef = TRAINABLE_UNITS.find(u => u.type === currentItem);
  if (unitDef?.obsoletedByTech && completedTechs.includes(unitDef.obsoletedByTech)) {
    // Silently drop obsolete unit from queue.
    newQueue.shift();
    newProgress = 0;
    // Do NOT set completedUnit — nothing was produced.
  } else {
    const unitCostMult = unitDef ? applyProductionBonus(currentItem, bonusEffect) : 1;
    if (unitDef && newProgress >= Math.round(unitDef.cost * unitCostMult)) {
      newQueue.shift();
      newProgress = 0;
      completedUnit = unitDef.type;
    }
  }
  ```

- [ ] **G3-T5 Step 3:** Update the `processCity` callsite in `src/core/turn-manager.ts` to pass `civ.techState.completed` (or whatever the local `civ` reference is in that scope) as the new sixth argument. Example:

  ```typescript
  const result = processCity(
    city,
    newState.map,
    yields.food,
    effectiveProduction,
    civDef?.bonusEffect,
    civ.techState.completed,
  );
  ```

  Find the callsite by grep; there may be more than one (test fixtures, AI sim). Update each — for tests with no civ context, pass `[]` explicitly.

#### G3-T6: Remove the abstract `recruitSpy` / `assignSpy` panel flow

**Files to modify:** `src/main.ts`, `src/ui/espionage-panel.ts`, `src/ai/basic-ai.ts`, `src/systems/espionage-system.ts`

This is the load-bearing change — once `recruitSpy` and `assignSpy` are gone, the only path to a spy is via city production (G3-T4) and the only path to `stationed` is via `attemptInfiltration` (MR4, future).

- [ ] **G3-T6 Step 1 (panel):** In `src/ui/espionage-panel.ts`:
  - Remove `onRecruit?: () => void;` from the `EspionagePanelCallbacks` interface.
  - Remove the `if (data.canRecruit && callbacks.onRecruit)` block (line ~335) that renders the "Recruit" button.
  - Update the header subtitle (`'Spies ${activeSpyCount}/${maxSpies} · ${canRecruit ? 'Recruitment available' : 'No recruitment available'}'`) to: `'Spies ${activeSpyCount}/${maxSpies}'` (drop the recruitment phrase entirely — players now train spies in cities).
  - Remove `canRecruit` from `EspionagePanelData` only if no other code still reads it; otherwise leave the field but stop using it in the panel header.
  - Remove `onAssign?: ...` from the same interface and the corresponding `appendSpyCard` "Assign" button. Spies are now assigned by physically moving the unit (MR4); a panel button is no longer the action surface.

- [ ] **G3-T6 Step 2 (main.ts):** In `src/main.ts`:
  - Delete the `onRecruit: () => { ... }` block (lines ~696-708) and the `onAssign: (spyId) => { ... }` block (lines ~711-720) that pass into `createEspionagePanel(...)`.
  - Remove the `recruitSpy`, `assignSpy`, and `canRecruitSpy` imports if they are now unused (the linter will flag).

- [ ] **G3-T6 Step 3 (ai):** In `src/ai/basic-ai.ts`:
  - Find the `recruitSpy(...)` call (line ~639) and replace the entire AI espionage block with city-production queueing. Use `getTrainableUnitsForCiv(civ.techState.completed)` and `isSpyUnitType` to pick the highest-tier available spy unit; queue it on a city with an empty production queue. Concrete shape:

    ```typescript
    const espState = newState.espionage?.[civId];
    if (espState) {
      const activeSpies = Object.values(espState.spies).filter(s => s.status !== 'captured').length;
      if (activeSpies < espState.maxSpies) {
        const availableSpyTypes = getTrainableUnitsForCiv(civ.techState.completed)
          .filter(u => isSpyUnitType(u.type));
        if (availableSpyTypes.length > 0) {
          const bestType = availableSpyTypes[availableSpyTypes.length - 1];
          for (const cityId of civ.cities) {
            const city = newState.cities[cityId];
            if (city && city.productionQueue.length === 0) {
              newState.cities[cityId] = {
                ...city,
                productionQueue: [bestType.type],
              };
              break;
            }
          }
        }
      }
    }
    ```

  - Remove the `recruitSpy` import.

- [ ] **G3-T6 Step 4 (espionage-system):** In `src/systems/espionage-system.ts`:
  - Delete `recruitSpy` and `assignSpy` (and `canRecruitSpy` if no other call site remains — confirm by grep). Tests that exercise spy creation must switch to `createSpyFromUnit`.
  - Keep `assignSpyDefensive` for now — that's the embed-in-own-city path (MR7). It is unrelated to the offensive `assignSpy` shortcut.

- [ ] **G3-T6 Step 5 (tests):** Update `tests/systems/espionage-system.test.ts` and `tests/integration/m4a-espionage-integration.test.ts`:
  - Delete the `assignSpy sets spy to stationed immediately ...` test.
  - Replace any other `recruitSpy` / `assignSpy` calls with `createSpyFromUnit` (for setup) and direct `Spy` literal mutation (for legacy tests that need a spy in `stationed` state). Add a `// MR1: legacy fixture for pre-physical-spy mission flow` comment on each.
  - Add the new tests from MR1 plan Task 3 Step 1 (in `tests/integration/spy-lifecycle.test.ts`):
    - "trains spy_scout and creates matching Spy record with same id"
    - "new Spy record has status idle and owner player"
    - "emits espionage:spy-recruited on spy unit completion"
  - Add a new test for G3-T5 (obsolete dequeue): queue `spy_scout` in a city, mark `espionage-informants` as completed, run `processCity`, assert the queue is empty AND `completedUnit` is null AND no unit was created.
  - Add a new test for G3-T3 cleanup: build state with a spy unit + matching Spy record, simulate combat death (`delete state.units[id]` then call `cleanupDeadSpyUnit`), assert spy record is gone.

#### G3-T7: Run the whole test matrix

- [ ] **G3-T7 Step 1:** `eval "$(mise activate bash)" && yarn test`. Every test must pass.
- [ ] **G3-T7 Step 2:** `bash tests/hooks/run.sh` (already chained from `yarn test` if G1-T4 Step 4 was applied).
- [ ] **G3-T7 Step 3:** `yarn build` to confirm no TypeScript regressions.

#### G3-T8: Manual smoke (UI sanity)

- [ ] **G3-T8 Step 1:** `yarn dev`. Found a city, research `espionage-scouting` (use the dev console / console-cheat if available). Verify "Scout Agent" appears in city build queue.
- [ ] **G3-T8 Step 2:** Build a Scout Agent. Verify a spy unit appears on the map at the city's tile and a notification fires (or check the espionage panel — the spy roster should now contain "Agent <name>" with status `idle`).
- [ ] **G3-T8 Step 3:** Open the espionage panel — confirm there is no "Recruit" button and no per-spy "Assign" button.
- [ ] **G3-T8 Step 4:** If anything looks off, stop and re-evaluate before committing — UI golden path is the user's primary correctness signal.

---

## Commit and PR strategy

The implementor should land G1, G2, G3 as **three separate commits** (or three sub-PRs) for reviewability:

1. `chore(rules,tests): document hook contract and add hook smoke test infra` — covers G1.
2. `fix(hooks): read tool input from stdin, not nonexistent CLAUDE_TOOL_INPUT` — covers G2.
3. `fix(espionage): complete MR1 — wire spy unit training to Spy records, drop abstract recruit/assign` — covers G3.

After all three land:
- Update PR #106's title to reflect actual scope, OR open a new PR `feat(espionage): MR1 complete — physical spy units (supersedes #106)` and close #106.
- The PR body must include: "G1 ships hook test harness; G2 fixes both PreToolUse hooks (they were no-ops); G3 finishes MR1 Tasks 1-4 per `docs/superpowers/plans/espionage-overhaul/mr-01-physical-spy-units.md`".

---

## Out of scope for this fix-it

These are real follow-ups but belong to MR2+:
- Detection logic (`scout_hound.spyDetectionChance` consumption) — MR2.
- Disguise mechanics — MR3.
- Infiltration roll, city-vision, exfiltrate — MR4.
- Mission system rewrites — MR5.
- Capture/interrogate/execute — MR6.
- Embed and CI sweep — MR7.
- Era unit upgrade flow — MR8.
- Espionage buildings — MR9.
- Civ-unique detection units — MR10.

If during G3 implementation you find that a player can build a spy and the only useful thing to do with it is delete the unit, that is **expected** for MR1: the spy sits in `idle`, visible on the map, with a Spy record. MR4 is what makes them useful. The point of MR1 is the foundation — it is not supposed to deliver mission gameplay.
