# Era 13 MR6 — Wonders, Strategic Audio, and Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Open Intelligence Commons and Lunar Gateway through the existing legendary-wonder, NetworkPlan, audio, AI, UI, renderer, save, and hot-seat contracts.

**Architecture:** Add definition-driven Era-13 wonder metadata and narrowly extend shared typed evaluators/history. All availability, AI, production, intel, and UI must consume those shared helpers. Strategic audio uses the catalogue/director/event route and is never a hidden-information channel.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, DOM, Web Audio, Vite.

---

## Live-base drift and prerequisite record

- Base fetched 2026-07-19: `113da3233b1a0a03b845ec474d01369d8d584420` (`origin/main`). It is 11 commits beyond the brief's `14d163f`; all are merged #656 combat/AI/difficulty work (21 files), so it is additive implementation drift, not a contract change.
- #511–#515 are closed; #655/#515 merged. #516/#517/#418 remain open. #652 remains open and owns replacement of MR5 placeholder art. #656 is merged, so no open-worktree overlap remains.
- `CURRENT_SAVE_SCHEMA_VERSION` is 7; migrations are ordered and idempotent. Do not add schema 8 unless the new history cannot be derived from existing serializable project/plan state.
- Era-13 live content is the MR5 catalog (30 technologies/15 tracks, 12 buildings, 3 national projects, five units). Use the measured reference economy already recorded by MR5: 1220 science and 775 production over five cities; use current pacing helpers/tests, never stale prompt literals.
- Existing seams: `legendary-wonder-definitions`, `legendary-wonder-system`, `legendary-wonder-history`, `legendary-wonder-intel`, completion/map/landmark presentations, city production, `basic-ai`, `wonder-atlas-panel`, renderer wonder catalog, `sfx-catalog`, `sfx-director`, audio system, and service-worker precache. The authoritative Era-13 branch and MR4/MR5 plans exist.

## File map

- Modify `src/core/types.ts`: add typed quest predicates/history only when an existing union cannot express a required condition.
- Modify `src/systems/legendary-wonder-definitions.ts`, `legendary-wonder-system.ts`, `legendary-wonder-history.ts`: definitions, normalization, event-owned progress and exactly-once rewards.
- Modify `src/systems/network-plan-system.ts` and the owning plan-resolution path: record constructive/Stable and host-city exploration resolution facts at resolution, not by retrospective scans.
- Modify `src/systems/legendary-wonder-production.ts`, `src/ai/basic-ai.ts`, `src/ui/wonder-atlas-panel.ts`, `src/ui/wonder-codex-page.ts`, `src/renderer/wonders/*`, and live `src/main.ts` callers only through existing shared presentation contracts.
- Modify `src/audio/sfx-catalog.ts`, a dedicated strategic director if the existing director cannot own semantic events, `src/audio/audio-system.ts`, routing call sites, `AUDIO-CREDITS.md`, and precache inputs only if authored assets are introduced.
- Tests: mirrored legendary-wonder, history, NetworkPlan, AI, UI/atlas/Codex, renderer, audio/catalog/director, storage, hot-seat, pacing and simulation suites.

## Task 1: Add typed wonder contracts (RED → GREEN)

- [ ] Write RED definition tests for both wonder IDs, exact prerequisites, typed conjunctive steps, historical copy, global uniqueness, empire reward scope, and no self-competition.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-definitions.test.ts`; expected failure: missing Era-13 definitions.
- [ ] Add Open Intelligence Commons (+4 empire science; two AI Safety Institutes in distinct cities; Algorithmic Accountability + Machine Ethics; three Stable constructive resolutions) and Lunar Gateway (+3 science/+3 gold empire-wide; host Space Center + Network Operations Center; Mars Mission Architecture + Quantum Networking; three Stable host-city exploration resolutions) as typed definition data.
- [ ] Run the same command; expected PASS. Commit `feat(era13-mr6): define autonomous-systems legendary wonders`.

## Task 2: Event-owned quest progress and rewards (RED → GREEN)

- [ ] Write RED positive and one-missing-condition tests for every conjunct; include capture/loss, abandonment, malformed save normalization, AI and human resolution parity, exactly-once empire yields, and no host-city duplicate.
- [ ] Extend the shared typed history ledger only as required; append entries from research/build/NetworkPlan resolution mutation sources, then normalize current projects through the existing evaluator. Do not infer past resolutions from final state.
- [ ] Run legendary-wonder/history/network/capture/storage focused tests. Commit `feat(era13-mr6): track wonder quests from canonical transitions`.

## Task 3: Complete availability, production, AI, intel, renderer, and Codex (RED → GREEN)

- [ ] Write RED tests proving shared human/AI eligibility, reserved-project uniqueness, rival-intel masking, immediate atlas refresh, current-player hot-seat masking, host landmark/map/ceremony visibility, and accurate speculative/emerging Codex copy.
- [ ] Wire the definitions into existing roster, production, AI investment, viewer-safe intel, atlas/Codex, renderer catalog, landmark, ceremony, and notification paths. No separate Era-13 lifecycle.
- [ ] Run focused system/AI/UI/renderer tests. Commit `feat(era13-mr6): present and operate era13 wonder races`.

### Player truth table

| Before | Action | Immediate visible result |
|---|---|---|
| Quest is incomplete | Open Wonder Atlas | Every unmet condition is named; no seeded shell is advertised as buildable |
| Last condition resolves | Reopen/continue Atlas | Wonder changes to buildable without stale steps |
| Rival fact is unearned | Hot-seat handoff | No rival progress, source, or host detail is visible |

**Misleading UI risks:** “Buildable” means every typed conjunct is true; “Stable” cannot include Surge/recovery; host-city condition never passes from another city. Full catalogue remains reachable.

**Interaction replay:** seed → open → resolve → reopen; queue/start → cancel → reopen; rival discovery → handoff; capture/loss → reopen; save/load twice.

## Task 4: Strategic audio, accessibility, and assets (RED → GREEN)

- [ ] Write RED catalogue/routing tests for constructive success, hostile warning, Surge, strain/recovery, and wonder completion; test viewer authorization, one cue per formation, mute/volume, cooldown/dedup, disposal, reduced motion, and visible paired notification.
- [ ] Add only local provenance-documented assets (or reuse existing authorised cues); route semantic events through catalogue/director/audio system. Add manifest and credit coverage for any new file.
- [ ] Run audio/service-worker tests. Commit `feat(era13-mr6): add private strategic network and wonder feedback`.

## Task 5: Inline launch review and balance hardening (RED → GREEN)

- [ ] Run measured pacing/reference, AI playability, difficulty, and hot-seat suites before and after each slice. Keep Hold viable; verify 15% ceiling, sublinear Capacity, no movement bonus, equal rules across Explorer/Standard/Veteran, and non-network counters.
- [ ] Fix every in-scope defect found in shared mutation/UI/audio/save paths; stop only for a contract-changing discovery.
- [ ] Run source-rule check for changed `src` files, all mirrored tests, `bash scripts/run-with-mise.sh yarn build`, `bash scripts/run-with-mise.sh yarn test`, then inspect both `origin/main...HEAD` and uncommitted full diffs.

## Inline review gates

| Dimension | Required evidence / correction |
|---|---|
| Gameplay/fun/styles/ages 7–43 | Outcome-first copy, optional network/hold path, Build/Research/Trade/Defend/Influence/Explore/Conquer tests |
| Difficulty/AI | Same validators/prices/effects; bounded-search-only difficulty differences; AI Hold and counter behavior |
| UI/UX/accessibility | Keyboard/touch controls, 44px buttons, text plus color, reduced-motion visible feedback, immediate rerender |
| Architecture/data/saves | Typed metadata, canonical event history, serializable/idempotent state, no migration unless proved necessary |
| SFX/privacy | Local provenance/precache, muted fallback, current-viewer authorization, no formation spam |
| Solo/hot-seat/regressions | No automatic human choices; 2–4 human veil/reset/warning/input order; old wonder/network/save coverage |

## Final checklist

- [ ] All checkboxes tracked; no `TBD`/placeholder or stale design assumption remains.
- [ ] PR body records base, #656 drift, schema decision, measured pacing, audio listening truth, #652 follow-up, tests, and issue closure.
