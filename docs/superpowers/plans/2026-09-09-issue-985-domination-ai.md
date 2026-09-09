# Domination AI Pursuit and Counterplay Implementation Plan

**Goal:** Complete #985 with purposeful, legal AI Domination pursuit and earned-intelligence counterplay, then prove a real AI campaign reaches the existing Domination resolution deterministically.

**Boundaries:** This is MR4 only. It reuses the merged sovereignty rule, observer-safe `DominationKnowledge`, warnings, and #995 bilateral war APIs. It adds no victory types, persisted AI doctrine, new surrender mechanics, omniscient AI queries, direct war-array writes, or new player UI surface.

## AI evidence contract

| Situation | Doctrine may do | Doctrine must not do |
|---|---|---|
| Aggressive independent AI has a known, reachable, legal rival city and a ready force | Prefer the existing capture candidate with a bounded challenge bonus | Invent a target from hidden cities or declare before the normal legality check |
| A known report crosses the shared Domination threat threshold | Add existing defense demand and one legal peace/alliance proposal | Read hidden current sovereignty, force a recipient's treaty choice, or declare war solely from the warning |
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
- Reuse `getDominationThreats` for ranking: fewer unresolved rivals, more secured rivals, newer report, then contender ID.
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
