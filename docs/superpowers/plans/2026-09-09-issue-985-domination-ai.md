# Domination AI Pursuit and Counterplay Implementation Plan

**Goal:** Complete #985 with purposeful, legal AI Domination pursuit and earned-intelligence counterplay, then prove a real AI campaign reaches the existing Domination resolution deterministically.

**Boundaries:** This is MR4 only. It reuses the merged sovereignty rule, observer-safe `DominationKnowledge`, warnings, and #995 bilateral war APIs. It adds no victory types, persisted AI doctrine, new surrender mechanics, omniscient AI queries, direct war-array writes, or new player UI surface.

## AI evidence contract

| Situation | Doctrine may do | Doctrine must not do |
|---|---|---|
| Aggressive independent AI has a known, reachable, legal rival city and a ready force | Prefer the existing capture candidate with a bounded challenge bonus | Invent a target from hidden cities or declare before the normal legality check |
| A current report confirms an independent contender has secured at least two rivals | Add existing defense demand and one legal peace/alliance proposal | Read hidden current sovereignty, force a recipient's treaty choice, or declare war solely from the report |
| Report is stale, unknown, provisional, or from a vassal contender | Preserve ordinary AI behavior | Create urgency, force demand, or diplomatic proposal |
| Cityless/recovery-reserved AI | Preserve recovery and settler/transport priority | Pursue Domination or consume recovery units |

## Task 0 — Current dependency and drift gate

- Verify #995 / [#1052](https://github.com/a1flecke/conquestoria/pull/1052) remains on `origin/main` and reread `declareMajorWar`, `makeMajorPeace`, `proposeTreatyAgreement`, and `assertBilateralWar`.
- Record the actual current ownership: `declareMajorWar` performs bilateral war mutation and `makeMajorPeace` performs bilateral peace mutation; AI can only request these through existing legal decision execution.
- Update the parent #985 plan with MR1–MR3 merged status and keep MR4 status honest.

## Task 1 — Pure doctrine and candidate admission

- Write failing `tests/ai/ai-domination.test.ts` examples for aggressive versus trader personality, Explorer/Standard/Veteran bonuses (8/14/20, score capped at 100), recovery precedence, stale/unknown/subordinate rejection, and hidden-world invariance.
- Add `src/ai/ai-domination.ts` with transient doctrine input/output only. It consumes `DominationKnowledge`, `MajorCivPerception`, personality, and game-wide challenge.
- Extend only `objectiveCandidates` in `ai-prepared-turn.ts`: a peaceful known city is admitted only after contact, canonical declaration eligibility, known-map path, capture/frontline roles, and perceived loss ratio no greater than 1.0. Existing war/recent-attack candidates retain their behavior.
- Apply the bounded bonus before existing portfolio scoring. Attach deterministic reason codes to the existing capped decision trace; no portfolio storage or new persisted enum.

## Task 2 — Latest-state legality and execution

- Add regressions proving prepared plans are revalidated against current knowledge, force readiness, liveness, and canonical declaration eligibility before action execution.
- Route a ready legal Domination capture target through the existing final #995 `declareMajorWar` path only. Assert bilateral-war invariants after the resulting transition.
- Preserve normal defense, retreat, expiry, transport, and recovery behavior; an outdated prepared target is discarded rather than repaired from hidden state.

## Task 3 — Earned-intelligence counterplay

- Write failing `tests/ai/ai-domination-counterplay.test.ts` examples for deterministic threat ranking, a defended owned-city demand, one legal proposal per actor/world turn, no action from unknown/stale evidence, no duplicate re-entry proposal, and hidden-world trace/proposal equality.
- Keep the stricter `getDominationThreats` warning threshold unchanged. Counterplay instead ranks current earned reports with at least two independently confirmed secured rivals, then secured count, report freshness, and contender ID. This lets an AI respond while a known independent partner still exists; the warning threshold cannot do so because it permits at most one unresolved rival.
- Feed existing defense and force-demand machinery. Propose either legal peace with a known active-war third party or a legal alliance with a known independent non-threat partner through `proposeTreatyAgreement`; never force acceptance or add league mechanics.
- Assert `assertBilateralWar` after every new diplomacy transition and campaign round.

## Task 4 — Deterministic campaign proof and final audit

- Build a three-empire occupied fixture using real preparation, diplomacy, combat, capture, improvement, and completed-round processing. Bound it to 200 rounds and require a real AI Domination winner, pursuit traces, and two real rival status changes.
- Save/reload at a fixed intermediate round and compare final state, winning turn, report/warning outputs, and decision traces. Add a near-win reversal case.
- Run the proof on Standard and bounded Explorer/Veteran doctrine regressions. Do not increase candidate/path caps or weaken the win requirement to chase a passing seed.
- After two materially similar campaign failures, stop with the seed, traces, and first blocking behavior. Escalate a contradicted central contract; fix ordinary implementation defects.
- Complete the mandated inline review across gameplay, ages/play styles, difficulty, AI, UI/UX, architecture, extensibility, data, SFX, saves, testing, solo/hot-seat regressions, and implementation. Fix every in-scope finding, then run focused suites, source-rule checks, build, durable verification, browser smoke, and final CI.

## Final MR requirements

- Use `Closes #985` only if the long-horizon proof and final cross-arc audit both pass.
- Update this plan and the parent implementation plan with completed task status in the same MR.
- Include Scope, Design contract, Player-visible behavior, AI behavior, Viewer safety, Hot seat, Save/determinism, Difficulty, Pre-MR inline code review, Verification, and actual MR1–MR4 links in the PR body.

## Completion record — 2026-09-09

- **Task 0:** #995 / [#1052](https://github.com/a1flecke/conquestoria/pull/1052) was confirmed on the MR4 base `83f813f5`. `declareMajorWar` remains the bilateral-war owner; `proposeTreatyAgreement` owns consent and calls canonical peace handling; `assertBilateralWar` is run after new diplomatic transitions and every campaign round.
- **Task 1:** `ai-domination.ts` is pure over `DominationKnowledge`. Aggressive, independent city owners receive only the bounded Explorer/Standard/Veteran bonus (8/14/20); peaceful targets still require contact, current report, legal action, known path, roles, and a perceived loss ratio at most 1. The reason remains trace-only, does not change locality eligibility, and is not persisted.
- **Task 2:** `canDeclareWarForPreparedPlan` re-builds knowledge immediately before a Domination-pursuit declaration. Missing, stale, or changed reports reject the prepared target. The existing legal declaration path remains the only mutation path.
- **Task 3:** Counterplay adds one existing frontline demand and at most one legal peace-or-alliance request. It ignores stale, unconfirmed, non-independent, and vassal-observer reports; pending bilateral requests suppress re-entry duplicates. Review found the initial reuse of the UI warning threshold made counterplay inert whenever an independent partner was known. The final code keeps the UI threshold unchanged and uses a current two-secured-rival report threshold for AI response, with deterministic ordering and no world-state access.
- **Task 4:** `tests/simulation/domination-ai-campaign.test.ts` starts the fixed `domination-ai-campaign-standard-v1` three-empire hot-seat fixture from legal city/unit/tech setup, runs the real completed-round pipeline for at most 200 rounds, and requires an AI Domination winner, two real rival eliminations, pursuit traces, bilateral-war validity each round, and a fixed round-3 save/reload. It compares final canonical state, winning turn, traces, per-viewer progress, and warning queues; the second case reverses a near win through accepted vassalage followed by canonical release before finalization. Explorer, Standard, and Veteran candidate admission regressions run through real preparation.

## Pre-MR inline review

| Dimension | Inspected evidence and finding | Resolution |
|---|---|---|
| Balancing gameplay | `ai-domination.ts`, `ai-prepared-turn.ts`: pursuit is limited to aggressive independent city owners and +8/+14/+20; no unbounded score or difficulty rule change. | Accepted; three-mode regressions cover the bounds. |
| Fun | Prepared traces name the pursuit reason while normal capture readiness and treaty consent remain visible. | Accepted; players retain ordinary diplomacy choices. |
| New mechanics | `basic-ai.ts` routes only existing war, peace, alliance, and force-demand systems. | Accepted; no coalition, surrender, or player action was added. |
| Ages 7–43 | Existing panel/warning copy remains the plain-language source; the AI change adds no new player-facing vocabulary. | Accepted; browser smoke covers the existing readable surfaces. |
| Play styles | The doctrine does not touch human queues, build choices, or map navigation. | Accepted; force demand stays in the existing AI production pipeline. |
| Difficulty | `resolveOpponentChallenge` drives bounded values; the legal gates are mode-neutral. | Accepted; Explorer/Standard/Veteran preparation tests pass. |
| Computer players | Review found the warning threshold prevented counterplay with a potential ally. | **High fixed:** counterplay now recognizes a current, earned two-secured-rival lead before warning presentation would fire. |
| UI | No UI source changed; progress and pending warning queues were compared per viewer across save/reload. | Accepted; no inert control or new visual surface exists. |
| UX | A human receives a normal pending peace/alliance proposal and can accept or decline through existing controls. | Accepted; no forced recipient outcome. |
| Architecture | The new module consumes `DominationKnowledge` and pure presentation inference; AI never imports sovereignty/liveness truth. | Accepted; source-rule checks pass. |
| Extensibility | Doctrine and counterplay are transient, typed helpers; score telemetry is optional and never changes locality eligibility. | Accepted; no save schema or portfolio expansion. |
| Data | Reports must match current, earned actor facts; stale or conflicting facts fail closed. | Accepted; stale/current/vassal regressions pass. |
| SFX | No new event or cue path was added. | Accepted; existing warning queues remain per viewer and are compared after reload. |
| Saved games | No persisted shape changed. The campaign crosses serialize/parse/normalize at round 3 and compares final canonical state and per-viewer outputs. | Accepted. |
| Proper testing | Focused unit, preparation, live diplomacy, campaign, bilateral-war, timing, continuity, durable, build, and browser-smoke evidence was run. | Accepted; no flaky result was accepted. |
| Solo and hot-seat regressions | The campaign uses two human hot-seat rivals; existing solo/hot-seat result and save suites remain in the durable run. | Accepted; result finalization and privacy contracts are unchanged. |
| Proper implementation | Prepared war execution rechecks fresh knowledge; all mutations reuse canonical diplomacy APIs. | Accepted; no unilateral war write or direct treaty mutation was introduced. |
