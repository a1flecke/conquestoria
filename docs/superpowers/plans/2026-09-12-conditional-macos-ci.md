# Conditional macOS CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Repository policy prohibits subagent delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the hosted macOS package build only when desktop-risk inputs changed, while keeping it fail-closed in the merge gate and retaining Tauri frontend coverage for every pull request and `main` push.

**Architecture:** A new Node CLI owns the pure, newline-delimited changed-path classification policy. `desktop-change-check` gathers the correct Git range for each GitHub event and calls that CLI; `tauri-macos-build` relies exclusively on the check output. Focused tests prove the policy, and the shell workflow contract prevents future broad or bypassing workflow edits.

**Tech Stack:** Node.js ESM, TypeScript/Vitest, Bash workflow-contract tests, GitHub Actions YAML, Yarn.

---

## File structure

| File | Responsibility |
| --- | --- |
| `scripts/desktop-build-inputs.mjs` | Read changed paths from standard input and print whether any path requires hosted macOS packaging. |
| `tests/scripts/desktop-build-inputs.test.ts` | Exercise the CLI's positive, negative, mixed, and empty input behavior. |
| `scripts/ci-test-shards.json` | Keep the new default-discovered test assigned to exactly one CI shard. |
| `.github/workflows/deploy.yml` | Supply event-specific Git ranges to the classifier and condition the macOS job solely on its output. |
| `tests/hooks/verification-config.test.sh` | Enforce the workflow's path-classifier and merge-gate wiring contract. |
| `AGENTS.md` | Tell future agents where the policy lives and how to evolve it safely. |
| `docs/superpowers/plans/2026-09-12-conditional-macos-ci.md` | Record execution status for this one-phase change. |

### Task 1: Establish the desktop-risk classifier contract

**Files:**
- Create: `tests/scripts/desktop-build-inputs.test.ts`
- Create: `scripts/desktop-build-inputs.mjs`

- [ ] **Step 1: Write the failing CLI tests**

Create `tests/scripts/desktop-build-inputs.test.ts` with a helper that invokes the new script through `spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8' })`. Add these tests:

```ts
it.each([
  'src-tauri/tauri.conf.json',
  'src/platform/desktop-capabilities.ts',
  'public/icons/icon.png',
  'index.html',
  'vite.config.ts',
  'package.json',
  'yarn.lock',
  '.yarnrc.yml',
  '.yarn/releases/yarn-4.6.0.cjs',
  'mise.toml',
  'scripts/check-tauri-macos-artifacts.mjs',
])('requires macOS packaging for %s', path => {
  expect(classify(`${path}\n`).stdout.trim()).toBe('true');
});

it.each([
  '.github/workflows/deploy.yml',
  'src/systems/city-system.ts',
  'src/ui/city-panel.ts',
  'tests/systems/city-system.test.ts',
  'docs/superpowers/plans/example.md',
  'scripts/build-run-macos-app.sh',
])('does not require macOS packaging for %s', path => {
  expect(classify(`${path}\n`).stdout.trim()).toBe('false');
});

it('requires macOS packaging when any path in a mixed list is risky', () => {
  expect(classify('docs/readme.md\nsrc-tauri/Cargo.toml\n').stdout.trim()).toBe('true');
});

it('does not require macOS packaging for an empty list', () => {
  expect(classify('').stdout.trim()).toBe('false');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/desktop-build-inputs.test.ts
```

Expected: FAIL because `scripts/desktop-build-inputs.mjs` does not exist.

- [ ] **Step 3: Implement the smallest pure classifier**

Create `scripts/desktop-build-inputs.mjs` with one `isDesktopBuildInput(path)` predicate and a standard-input adapter. Its policy must be exactly:

```js
const desktopBuildInput =
  path.startsWith('src-tauri/') ||
  path.startsWith('src/platform/') ||
  path.startsWith('public/') ||
  path === 'index.html' ||
  path === 'vite.config.ts' ||
  path === 'package.json' ||
  path === 'yarn.lock' ||
  path === '.yarnrc.yml' ||
  path.startsWith('.yarn/') ||
  path === 'mise.toml' ||
  path === 'scripts/check-tauri-macos-artifacts.mjs';
```

Read all input with `readFileSync(0, 'utf8')`, split it on newlines, discard empty paths, and print `${paths.some(isDesktopBuildInput)}\n`. Do not add GitHub event logic or shell parsing to this file.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/desktop-build-inputs.test.ts
```

Expected: PASS; every desktop-risk example prints `true`, and every excluded path prints `false`.

- [ ] **Step 5: Refresh the default-test shard contract**

Because the new Vitest file is default-discovered, run:

```bash
./scripts/run-with-mise.sh yarn test:profile:default
./scripts/run-with-mise.sh yarn test:ci-shards:allocate
./scripts/run-with-mise.sh yarn test --run tests/scripts/ci-test-shard-selection.test.ts
```

Expected: PASS. Commit the regenerated `scripts/ci-test-shards.json`; the new
classifier test appears in exactly one shard and no existing assignment moves
unless the allocator's retained timing data requires it.

- [ ] **Step 6: Commit the classifier, focused test, and shard manifest**

```bash
git add scripts/desktop-build-inputs.mjs tests/scripts/desktop-build-inputs.test.ts scripts/ci-test-shards.json
git commit -m "feat(ci): classify macOS build inputs"
```

### Task 2: Wire event ranges and macOS gating through the classifier

**Files:**
- Modify: `.github/workflows/deploy.yml:24-48`
- Modify: `.github/workflows/deploy.yml:392-396`
- Modify: `tests/hooks/verification-config.test.sh`

- [ ] **Step 1: Add failing workflow-contract assertions**

In `tests/hooks/verification-config.test.sh`, isolate the `desktop-change-check` job (from its header through `web-build`) and add assertions that require all of the following literal workflow behavior:

```bash
node scripts/desktop-build-inputs.mjs
github.event.pull_request.base.sha
github.event.before
github.event_name == 'workflow_dispatch'
```

Require the top-level `workflow_dispatch:` trigger as well, so manual release
validation is reachable rather than dead conditional code.

Also isolate `tauri-macos-build` (through `merge-gate`) and assert:

```bash
needs.desktop-change-check.outputs.desktop_changed == 'true'
```

Reject the old bypass and false-positive trigger with explicit negative checks:

```bash
github.ref == 'refs/heads/main' || needs.desktop-change-check.outputs.desktop_changed
.github/workflows/deploy.yml
```

Keep the existing merge-gate checks and add assertions that `merge-gate` continues to need both `desktop-change-check` and `tauri-macos-build`.

- [ ] **Step 2: Run the hook contract test to verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test:hooks
```

Expected: FAIL with the new desktop-policy assertions because the current workflow has inline matching, always marks non-PR events as changed, and contains the old main-branch bypass.

- [ ] **Step 3: Replace inline matching with event-aware classifier plumbing**

In `.github/workflows/deploy.yml`, update the `Check for desktop build inputs` step to:

```bash
if [[ "${{ github.event_name }}" == 'workflow_dispatch' ]]; then
  echo 'desktop_changed=true' >> "$GITHUB_OUTPUT"
  exit 0
fi

if [[ "${{ github.event_name }}" == 'pull_request' ]]; then
  base_sha='${{ github.event.pull_request.base.sha }}'
else
  base_sha='${{ github.event.before }}'
fi

changed_files="$(git diff --name-only "$base_sha" "${{ github.sha }}")"
desktop_changed="$(printf '%s\n' "$changed_files" | node scripts/desktop-build-inputs.mjs)"
echo "desktop_changed=$desktop_changed" >> "$GITHUB_OUTPUT"
```

Do not add `.github/workflows/deploy.yml` to the classifier. Preserve the full-history checkout so both base SHAs are available. Change the macOS job condition to exactly:

```yaml
if: needs.desktop-change-check.outputs.desktop_changed == 'true'
```

Leave `merge-gate`'s dependency list and the existing verifier intact; it is the fail-closed enforcement point for both the success and skipped states.
Add the top-level event trigger:

```yaml
workflow_dispatch:
```

For `test-suite-shard-a`, `test-suite-shard-b`, `test-suite-shard-c`, `hooks`,
`web-smoke`, and `tauri-frontend-build`, extend the existing PR-or-main job
condition to also accept `github.event_name == 'workflow_dispatch'`. This
ensures a manual run on a selected branch executes every merge-gate child.

Before calling `git diff` for a push, compare `base_sha` with forty zeroes. If
it is all zeroes, write `desktop_changed=true` and exit successfully; the
missing comparison base is a packaging-risk condition, not a reason to fail
or skip the macOS job.

- [ ] **Step 4: Run workflow-contract tests to verify they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test:hooks
```

Expected: PASS. The contract must demonstrate that a workflow-only change no longer triggers macOS, that push events use a diff rather than a branch bypass, and that macOS remains a merge-gate dependency.

- [ ] **Step 5: Commit workflow wiring and contract test**

```bash
git add .github/workflows/deploy.yml tests/hooks/verification-config.test.sh
git commit -m "fix(ci): gate macOS packaging by desktop inputs"
```

### Task 3: Document the policy for future CI changes

**Files:**
- Modify: `AGENTS.md:CI-shard rule for agents`
- Modify: `docs/superpowers/plans/2026-09-12-conditional-macos-ci.md`

- [ ] **Step 1: Add a focused agent guardrail**

Add an `AGENTS.md` paragraph next to the CI guidance that states:

```markdown
Hosted macOS packaging is conditional: keep the authoritative path policy in
`scripts/desktop-build-inputs.mjs`, test it in
`tests/scripts/desktop-build-inputs.test.ts`, and protect workflow wiring in
`tests/hooks/verification-config.test.sh`. Add a path only when changing it
can break the Tauri package itself; workflow-only, test, docs, ordinary
gameplay/UI, and unrelated script changes must not trigger hosted macOS.
`tauri-frontend-build` and merge-gate coverage remain required on every PR.
```

- [ ] **Step 2: Mark the plan complete only after verification succeeds**

After all Task 4 checks pass and the PR is merged, change this plan's header to `✅ merged (#PR)` and check each completed task/step. Do not mark it merged before the merge result is known.

- [ ] **Step 3: Commit the agent-facing policy**

```bash
git add AGENTS.md docs/superpowers/plans/2026-09-12-conditional-macos-ci.md
git commit -m "docs(ci): guard conditional macOS packaging"
```

### Task 4: Verify the branch without weakening the release contract

**Files:**
- Verify only: `scripts/desktop-build-inputs.mjs`
- Verify only: `tests/scripts/desktop-build-inputs.test.ts`
- Verify only: `.github/workflows/deploy.yml`
- Verify only: `tests/hooks/verification-config.test.sh`
- Verify only: `AGENTS.md`

- [ ] **Step 1: Run the classifier and workflow-contract checks together**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/desktop-build-inputs.test.ts tests/scripts/verify-merge-gate.test.ts
./scripts/run-with-mise.sh yarn test:hooks
```

Expected: PASS. The first command proves the pure trigger policy plus fail-closed gate semantics; the second proves the YAML wiring contract.

- [ ] **Step 2: Run complete durable verification**

Run each command separately:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test:durable
./scripts/run-with-mise.sh yarn test:durable:status
```

Expected: each exits 0. The durable status must identify the current HEAD and working tree as passed.

- [ ] **Step 3: Review the final branch delta**

Run:

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- scripts/desktop-build-inputs.mjs tests/scripts/desktop-build-inputs.test.ts .github/workflows/deploy.yml tests/hooks/verification-config.test.sh AGENTS.md docs/superpowers
git status --short
```

Expected: no whitespace errors, only the planned files changed, no accidental reintroduction of a broad macOS trigger, and no uncommitted files before PR creation.

- [ ] **Step 4: Create a reviewable pull request**

Create a PR that links the CI optimization work, describes the exact positive and negative path categories, says that macOS remains conditionally merge-gated, and lists the focused, hooks, build, and durable-suite evidence. Do not merge without the user's explicit merge authorization.

## Self-review

- **Spec coverage:** Task 1 implements the canonical path policy and direct examples. Task 2 applies it to PRs, pushes, and manual dispatch while preserving the merge gate. Task 3 prevents broad future triggers. Task 4 verifies the precise behavior and full branch.
- **Approach and SRP:** event range collection stays in workflow YAML; path classification stays in one pure script; merge-gate result validation stays in the existing verifier. No test sharding, Pages, signing, or local macOS command behavior is changed.
- **CI safety:** the macOS job remains in `merge-gate`; applicable jobs must succeed and inapplicable jobs must be skipped. Linux `build:tauri` stays required everywhere, so the filter removes redundant package builds rather than desktop frontend coverage.
- **Placeholder scan:** no task contains a deferred implementation, an undefined API, or an unspecified test expectation.
- **Type/interface consistency:** the CLI's only external interface is newline paths on standard input and a single `true`/`false` line on standard output; the workflow and tests use that same interface.
