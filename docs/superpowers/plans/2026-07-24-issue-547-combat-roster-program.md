# Issue 547 Combat Roster Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Repository policy
> additionally requires explicit user approval before any subagent is used.

**Goal:** Deliver the reviewed combat-roster, defensive-infrastructure, barbarian,
world-pressure, presentation, and legendary-wonder program as small buildable and
deployable pull requests.

**Architecture:** Definition-driven contracts live in focused systems and are consumed by
canonical gameplay, AI, UI, renderer, audio, and persistence paths. Each numbered task
maps to one GitHub issue and normally one pull request. Foundation code stays inert until
its first fully wired consumer; no reachable content may merge partially integrated.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, DOM/CSS, seeded game RNG, Web Audio, Vite
PWA, Tauri distribution shell.

---

## Governing documents

- Design and exact values:
  `docs/superpowers/specs/2026-07-24-issue-547-combat-roster-expansion-design.md`
- Interactive-plan guardrails: `docs/superpowers/plans/README.md`
- Repository architecture and verification: `CLAUDE.md`, `AGENTS.md`, and matching
  `.claude/rules/*.md`

Re-audit every path against the latest `origin/main` before editing. The paths below are
the audited seams at base `c6279df67a70a0d85487aa0cce77b63e1fd3415d`; they are not
permission to overwrite concurrent work.

## Ordered plan suite

| Order | Plan | Child issues | Merge gate |
|---:|---|---:|---|
| 1 | `2026-07-24-issue-547-foundations-and-legibility.md` | 1–6 | All shared contracts typed, tested, and inert |
| 2 | `2026-07-24-issue-547-mounted-beast-and-industrial.md` | 7–17 | Mounted, beast, air, and industrial chains playable |
| 3 | `2026-07-24-issue-547-naval-siege-and-armor.md` | 18–25 | Naval/siege/armor succession playable |
| 4 | `2026-07-24-issue-547-fortifications-and-air-defense.md` | 26–31 | Defensive layers playable and counterable |
| 5 | `2026-07-24-issue-547-barbarian-modernization.md` | 32–36 | Modernization deterministic and non-omniscient |
| 6 | `2026-07-24-issue-547-beast-world-pressure.md` | 37–43 | Both crises complete for human, AI, save, and hot seat |
| 7 | `2026-07-24-issue-547-visual-and-audio-polish.md` | 44–55 | All temporary presentation mappings replaced |
| 8 | `2026-07-24-issue-547-wonders-and-final-audit.md` | 56–63 | Wonders complete and program-wide audit green |

Visual and audio work may trail mechanics once stable IDs and event contracts exist.
Nothing in those parallel lanes may change balance or saved-game semantics.

## Per-task execution loop

Every task in the suite uses this exact loop:

1. Rebase a fresh `codex/issue-<number>-<slug>` worktree on current `origin/main`; install
   hooks and verify `core.hooksPath=.githooks`.
2. Read the rule files matching every intended source and plan path.
3. Add the named failing test first. Run only that test and confirm the expected failure.
4. Implement the smallest canonical data/helper change, then wire all named callers.
5. Re-run the focused test; add the task's negative, AI, UI, persistence, and hot-seat
   cases.
6. Run `scripts/check-src-rule-violations.sh` for changed `src` files and all mirrored
   tests in one command.
7. Inspect `git diff --check`, `git diff --stat origin/main...HEAD`, `git diff --stat`,
   and the full source diff.
8. Run `./scripts/run-with-mise.sh yarn build` and
   `./scripts/run-with-mise.sh yarn test` before push or PR.
9. Commit with an imperative Conventional Commit subject and open one focused PR whose
   body records balance scenarios, migration behavior, player impact, and checks.

Stop if a requested value must leave the design's tuning envelope, if an inherited
player-visible defect lacks an in-scope fix, or if two materially similar validations
fail. Update the design/dependency graph before broadening the PR.

## Program-wide quality gates

- All definitions, rules, and legal actions are identical on Explorer, Standard, and
  Veteran. Only typed challenge pressure and decision-quality fields vary.
- Recommendations never hide legal production or actions.
- Current-player scoping covers panels, overlays, notifications, history, animation, and
  audio in hot seat.
- Every persisted addition has idempotent normalization and schema-0, previous-schema,
  current-schema, and mid-action round trips.
- Mechanics never depend on final art/audio, and final art/audio never mutate mechanics.
- AI, barbarians, and crisis actors use owned or earned local facts and shared legality
  helpers.
- No effect is communicated only by color, animation, or sound.
- Final audit runs `./scripts/run-wonder-regressions.sh` in addition to build and full
  tests.

## Execution handoff

Implement this suite inline only unless the user explicitly approves subagents in the
current conversation. Use the subsystem plans in order, but preserve one-issue/one-PR
delivery and pause at every merge gate for review.
