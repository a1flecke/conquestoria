# CI Action Pin Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a trustworthy passing security-analysis workflow without weakening action pinning.

**Architecture:** Keep the existing immutable checkout release SHA and make every version comment identify the exact immutable release. Update the scanner action and scanner binary together from their official releases; do not change permissions or job logic.

**Tech Stack:** GitHub Actions YAML, zizmor.

---

### Task 1: Correct action metadata and scanner version

**Files:**
- Modify: `.github/workflows/deploy.yml:23-239`

- [ ] **Step 1: Write a source-level failing check**

Run:

```bash
rg -n 'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4$|zizmorcore/zizmor-action@5f14fd08f7cf1cb1609c1e344975f152c7ee938d|version: v1.21.0' .github/workflows/deploy.yml
```

Expected: eight checkout-comment matches plus the previous zizmor action and binary version.

- [ ] **Step 2: Replace only the audited metadata**

Change the eight checkout comments to `# v4.3.1`. Change zizmor-action to its official `v0.6.0` immutable SHA and set its requested binary version to `v1.26.1`. Preserve every workflow permission, trigger, and input.

- [ ] **Step 3: Run the source-level check again**

Run:

```bash
rg -n 'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4$|zizmorcore/zizmor-action@5f14fd08f7cf1cb1609c1e344975f152c7ee938d|version: v1.21.0' .github/workflows/deploy.yml
```

Expected: exit 1 with no output.

- [ ] **Step 4: Inspect the intended diff and commit**

Run:

```bash
git diff --check && git diff -- .github/workflows/deploy.yml
git add .github/workflows/deploy.yml docs/superpowers/specs/2026-07-20-ci-action-pin-maintenance-design.md docs/superpowers/plans/2026-07-20-ci-action-pin-maintenance.md
git commit -m "ci: refresh action pin metadata"
```

Expected: only the action pin comments, zizmor pin/version, and required design/plan documents are committed.

### Task 2: Publish and obtain the authoritative scan

**Files:**
- Modify: none

- [ ] **Step 1: Run the narrow repository workflow validation**

Run:

```bash
bash scripts/run-with-mise.sh yarn test:hooks
```

Expected: exit 0.

- [ ] **Step 2: Push the branch and open a draft PR**

Run:

```bash
git push -u origin codex/ci-action-pins
gh pr create --draft --base main --head codex/ci-action-pins --title "ci: refresh action pin metadata" --body-file /tmp/ci-action-pins-pr.md
```

Expected: a draft PR whose security-analysis job is the authoritative verification.
