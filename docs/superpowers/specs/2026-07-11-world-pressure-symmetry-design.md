# World-Pressure Symmetry — Design

**Issue:** #526
**Date:** 2026-07-11
**Status:** Approved design, awaiting implementation plan
**Predecessor specs:** `2026-06-15-threat-pressure-system-design.md` (scoped AI pressure out as a non-goal), `2026-07-09-crisis-events-and-revolutions-design.md` (listed "AI civs suffering crises" as a future extension — this is that extension)

## Problem

World-pressure systems split into two groups today, and the split is invisible to the player:

- **Human-only (hard-gated):** crises (`processCrisisSchedulerForHumans`, `src/systems/crisis-system.ts`) and pirate fleets / threat pressure (`processThreatPressure` early-returns on `!civ.isHuman`, `src/systems/threat-pressure-system.ts`; the ledger is named `pressureByHuman`).
- **Symmetric already:** barbarians, beasts, faction unrest, minor-civ hostility.

Consequences: a hidden difficulty tax on the human (compounding #523's world-era racing), a rigged-feeling world (plagues only ever strike the player), and a missing gameplay surface (rival crises can't be aided, exploited, or hunted).

## Goals (staged, in one implementation plan)

1. **Fairness** — AI civs take comparable pressure so the human isn't structurally behind.
2. **Living world** — AI crises are visible stories: notifications, map indicators, diplomacy-panel status.
3. **Gameplay surface** — tech-gated interactions with any crisis-struck civ (AI *or* human), with reputation consequences observed by witnesses.

Delivery constraint: many small, self-contained, never-broken MRs. Dark (flag-disabled) code is acceptable between stages.

### Play-style coverage (all four hooks are load-bearing — do not cut one "for scope")

| Style | Hook that serves it |
|---|---|
| Peaceful builder / diplomat | Send aid |
| Warmonger | Exploit weakness (informed, reputation-priced aggression) |
| Explorer / quester | Hunt their foe |
| Espionage player | Sabotage relief |

## Non-goals

- Minor civs experiencing crises or pirate fleets (excluded; revisit only if a concrete need appears).
- Changing what barbarians/beasts/unrest do — they are already symmetric; this spec documents that so it isn't "fixed" twice.
- Changing per-human personal challenge semantics in any way.
- AI-initiated aid/exploit/sabotage (future extension; AI participates in hunt-their-foe implicitly — see Interactions).
- New audio assets (see SFX).

## Decisions (settled during brainstorm)

| Question | Decision |
|---|---|
| Architecture | **Generalize in place** — the existing scheduler/pressure pipeline becomes actor-agnostic. No parallel AI orchestrator, no abstracted shadow crises. |
| AI severity | **Fixed `'standard'`** severity columns, always, regardless of any challenge setting. |
| AI competence | **Scales with the game-wide `opponentChallenge`** (veteran AI responds fast and pays for remedies; explorer AI dithers). Hot-seat-safe: one shared knob, personal challenges untouched. |
| Crisis depth | **Same machinery** — real `ActiveCrisis` objects, real spread/devastation/hunt entities. |
| Interactions | All four hooks, tech-gated, targetable at **any known crisis-struck civ, human or AI**, with witness-visible reputation effects. |

### The severity inversion trap (do not reuse `resolveChallengeForCiv` for AI severity)

`resolveChallengeForCiv` returns the game-wide `opponentChallenge` for AI civs. The `severityByChallenge` tables are written human-facing: veteran = harsher on *you*. Feeding `opponentChallenge` into severity for AI civs would mean picking veteran makes AI civs suffer **more**, making the game **easier** — inverted. Severity for AI must come from a separate resolver that always returns `'standard'`.

### Intended veteran asymmetry (do not "fix")

At `opponentChallenge: 'veteran'`, AI civs respond to crises immediately and fund remedies readily — crises barely dent them — while a veteran human still takes full personal pressure. The fairness gain is smallest exactly on the hardest setting. This is intentional: veteran means "the world does not help you." A future reviewer noticing this asymmetry should find this paragraph, not file a bug.

## Architecture

### New/changed seams

1. **`resolvePressureSeverityForCiv(state, civId): OpponentChallenge`** (in `src/core/opponent-challenge.ts`)
   Humans → personal challenge via existing resolution; AI → literal `'standard'`. Every severity lookup in crisis/threat systems switches from `resolveChallengeForCiv` to this. `resolveChallengeForCiv` remains for AI-competence lookups.

2. **`processCrisisScheduler(state, bus)`** (renames `processCrisisSchedulerForHumans`, `src/systems/crisis-system.ts`)
   Iterates all non-eliminated major civs with ≥ 1 city. **AI civs pass through the same preconditions humans do** — grace era/turns, per-civ cooldown, and the `CRISIS_PRESSURE_FLOOR` check against the generalized threat score (seam 3) — using the standard profile's values. On top of that, a **world-level AI crisis cap**: at most 2 (small map) / 3 (medium) / 4 (large) AI-targeted crises active globally. Human crises never count against the AI cap and vice versa.

3. **`processThreatPressure` / `computeThreatScore`** (`src/systems/threat-pressure-system.ts`)
   Drop `isHuman` early-returns. `pressureByHuman` generalizes to `pressureByCiv`; the save loader migrates the old key on read (old saves keep working).

4. **`src/ai/ai-crisis-response.ts`** (new)
   Pure deterministic policy — `(state, civId, profile) → CrisisResponseAction[]`. No RNG. Actions: `{ kind: 'quarantine', crisisId, cityId }`, `{ kind: 'fund-remedy', crisisId, cityId }`, `{ kind: 'dispatch', targetKind: 'hunt-foe' | 'pirate-fleet', targetId }`. Quarantine/remedy call the same `applyQuarantine`/`applyRemedy` helpers the human UI calls (AI pays real gold via `getCityAppeaseCost`). Dispatch injects a target into the existing AI plan portfolio (`src/ai/ai-plan-portfolio.ts`) — no parallel unit-mover. **Dispatch objectives carry the crisis/fleet id and are invalidated when it resolves or the foe dies**, using the portfolio's existing plan-expiry path, so AI navies never chase resolved threats.

   **Turn-order placement:** invoked from `turn-manager.ts` after `processCrisisTurn` and before AI planning each round, so this turn's responses feed this turn's plans.

5. **`getWorldPressurePresentationForViewer(state, viewerCivId)`** (new, `src/systems/` presentation module)
   The single viewer-safe read path for all AI-pressure UI (see Visibility).

6. **`CRISIS_INTERACTION_DEFINITIONS`** (new typed data table, stage 5/6)
   One row per hook: `{ id, techRequired, kind: 'overt' | 'covert', targetReputationDelta, witnessReputationDelta, oncePerCrisisPerActor }`. The resolver consumes rows generically — adding a future hook is a row, not a branch (same pattern as `NP_PRODUCTION_DISCOUNTS` in `city-system.ts`, per `.claude/rules/game-balance.md`).

7. **Feature flags** (on `GameState.settings`): `aiPressure: 'off' | 'pirates' | 'full'`, `aiPressureVisibility: boolean`, `aiCrisisInteractions: 'off' | 'benign' | 'full'` (`'benign'` = hunt-their-foe + aid only). Read exclusively through a `resolveWorldPressureFlags(settings)` helper that supplies defaults, so legacy saves without the fields resolve to the current defaults with no migration. Each MR merges with its surfaces dark until the stage completes; the stage's final MR flips the default.

### Per-system behavior

- **Pirate fleets (first system):** spawn scheduling extends to AI coastal cities via the same landmass threat scoring. Siege/plunder mechanics are already owner-generic. Cooldown keys (`civId:landmassId`) already generalize. AI response: navy-intercept objective through the plan portfolio (a partial adjacent-pirate attack already exists in `src/ai/basic-ai.ts` and remains as the close-range fallback).
- **Crises — all three archetypes:** outbreaks spread among the AI civ's own cities; catastrophes devastate its tiles; hunts spawn real foes near its cities (`findHuntSpawnHex` is already owner-agnostic). The tick pipeline (`processCrisisTurn`, `tickCrisisByArchetype`) is untouched apart from severity resolution.
- **Unchanged (already symmetric):** barbarians, beasts, faction unrest, minor-civ hostility/coalitions.

### Prerequisites (MR 0)

Extending pressure onto known-buggy mechanics multiplies the damage. Before stage 1:

- **#519** — world-actor combat paths must pass `CombatContext` (walls/techs defend).
- **#521** — combat seed collisions fixed (shared `deterministicCombatSeed`).
- **#522** — city-siege flat damage / permanent destruction / no-HP-regen redesign (AI cities will now be sieged too; the zero-HP consequence must be settled first).
- **#520** — wrap-aware distance helpers, at minimum for hunt spawn rings and pirate retargeting.

## AI response competence

Three new fields on `OpponentChallengeProfile` (`src/core/opponent-challenge.ts`), sitting beside the existing tactical knobs:

| Field | explorer | standard | veteran |
|---|---|---|---|
| `crisisResponseDelayTurns` — crisis age before the AI acts | 4 | 2 | 0 |
| `crisisRemedyGoldMultiplier` — treasury required as a multiple of remedy cost | 3.0 | 2.0 | 1.2 |
| `crisisDispatchWeight` — numeric multiplier on the dispatch objective's plan-portfolio score | 0.5 | 1.0 | 1.5 |

Policy rules (deterministic):

- **Quarantine** when `crisis age ≥ crisisResponseDelayTurns` OR `infected cities ≥ 2 + (veteran ? 0 : 1)`.
- **Fund remedy** for one infected city per turn when `civ.gold ≥ getCityAppeaseCost(city) × crisisRemedyGoldMultiplier`, most-populous city first.
- **Dispatch** against a hunt foe or sieging fleet whenever one menaces the civ, scored with `crisisDispatchWeight`.

Severity is identical at all three levels; only response speed and willingness differ. On explorer this visibly softens rivals; on veteran crises barely dent them (see Intended veteran asymmetry).

### Fairness target (makes goal 1 measurable)

Over a scripted 150-turn standard-challenge reference game, each surviving AI civ's crisis count must land within **50–120% of the human's** crisis count, and AI civs must show measurable yield/population loss from crises. The stage-3 fairness smoke test asserts this band; the stage-7 balance pass tunes the world cap and scheduler knobs against it. Without a numeric band, "fairness" regresses silently.

### AI catastrophe restoration (committed, stage 3)

Humans respond to catastrophes with the `restore_land` worker action (`src/systems/worker-action-system.ts:227`), clearing `devastatedUntilTurn` early; clearing every tile inside the recovery window earns the resilience bonus (`tickCatastropheCrisis`). No AI code path uses `restore_land` today — AI worker tasking lives in `src/ai/ai-prepared-turn.ts`.

The AI gets the same verb: during a catastrophe's recovery stage, AI worker assignment prioritizes `restore_land` on its own devastated tiles above normal improvement tasks, using the existing eligibility helper (`isRestoreLandEligible`-style check in `src/systems/improvement-system.ts:230`) — no parallel restoration path. Competence scales the same way as the other responses: restoration tasking begins after `crisisResponseDelayTurns` (veteran: immediately, explorer: 4 turns), which naturally decides whether the AI makes the resilience-bonus window. The resilience bonus itself is evaluated by the existing crisis tick with zero owner-awareness — an AI that restores in time earns it exactly like a human.

## Visibility (stage 2)

All AI-pressure UI reads exclusively from `getWorldPressurePresentationForViewer(state, viewerCivId)`:

- **Met-civ gate:** events for a civ appear only if that civ is in the viewer's `knownCivilizations`. Notification-log entries (turn-stamped, queued, never toast-only): "Plague reported in Carthage", "Corsairs raiding Aztec waters", "Carthage has contained its plague."
- **Notification discipline (anti-spam):** notify on crisis **start** and **resolution** only — never per spread step, per siege tick, or per AI response. All world-pressure notifications for a turn are batched into at most one log group per civ per turn. With 7 AI civs this is the difference between a living world and an unreadable log.
- **Tile-visibility gate:** map indicators render only on tiles the viewer's fog state allows. Real entities (pirate ships, hunt foes, devastation tints) already obey fog; the new surface is a crisis badge on known AI cities, reusing the human crisis badge in an "intel" style.
- **Diplomacy panel:** a known civ with an active crisis shows a status line ("Suffering: Red Tide outbreak — 3 cities, 4 turns"). This is the anchor surface for stage-3 interaction buttons, so it ships in the visibility MR and the buttons attach later (no dead buttons in between, per `.claude/rules/incremental-mr-completion.md`).
- **Hot seat:** strictly per-viewer. Each human's intel is independent.
- **Required negative tests:** unmet civ ⇒ no notification/no panel line; unseen tile ⇒ no badge; hot-seat human B sees nothing human A hasn't earned.

## Interactions (stage 3)

**Targets:** any *known* civ with an active crisis — **AI or human**. In hot seat this is deliberate and is the payoff of hot-seat-first design: Dad can fund the remedy for his daughter's plague (relationship boost both ways), and a sibling *can* sabotage yours — with the same discovery risk and reputation fallout as against an AI. No special-casing by target's humanity anywhere in the resolver.

Witness set for all reputation effects: civs that have met **both** actor and target — including human civs. **Human witnesses receive a notification when a covert act against anyone is discovered** ("Rome's spies were caught sabotaging Carthage's relief!"), and when overt acts occur (aid sent, opportunistic war declared). Relationship changes go through the existing bilateral diplomacy helpers (both sides updated, dedup preserved).

| Hook | Tech gate | Effect | Limits | Reputation |
|---|---|---|---|---|
| **Hunt their foe** | none (available once visibility ships; hunts already resolve for any killer) | Slaying a known civ's hunt foe grants the existing kill rewards plus a relationship boost with the target | inherent (one foe per hunt) | Target: large +. Witnesses: small +. |
| **Send aid** | `medicine` (era 4) for outbreak remedy funding; `trade-routes` (era 4) for catastrophe relief gold | Pay the target's remedy/relief cost from your treasury; their recovery accelerates (remedy timer starts immediately / recovery multiplier eases) | **once per crisis per actor** — prevents farming alliances by serially funding plagues | Target: large +. Witnesses: small +. |
| **Exploit weakness** | `diplomatic-networks` (era 5–7, espionage track) | Full crisis intel on known civs (severity, turns active, infected-city list); declaring war on a crisis-struck civ is marked *opportunistic* | — | Target: large − on opportunistic war. Witnesses: medium −. |
| **Sabotage relief** | `covert-operations` (era 5–7, espionage track) | Spy mission: extend a rival's outbreak / block their remedy for N turns | **one active sabotage per crisis** (across all actors); costs a spy mission slot like existing missions | Covert. On discovery (existing espionage detection roll): target huge −, witnesses medium −. Undiscovered: no penalty. |

- Overt acts (aid, foe-hunt, opportunistic war) apply reputation immediately.
- Covert acts reuse the espionage system's existing detection mechanics — no new stealth subsystem.
- AI civs already participate in *hunt-their-foe* implicitly — hunts resolve for whoever kills the foe, and the reward/reputation wiring applies to AI killers too. Aid, exploit, and sabotage are **human-initiated only** in this arc; AI-initiated versions are a future extension (keeps stage 3 bounded).
- Content-honesty rule applies: the tech `unlocks` strings for `medicine`, `trade-routes`, `diplomatic-networks`, and `covert-operations` gain new effect text **in the same MR that implements the effect**, with a positive test each (`.claude/rules/content-description-honesty.md`).

### Tone (ages 7–43)

This is a family game (players from ~7 up). All crisis and interaction flavor text stays in the adventure-story register: "spoil their relief supplies", "the plague lifts", "bandits menace their roads" — no graphic disease or suffering prose. Sabotage is framed as mischief-with-consequences, not cruelty. Existing crisis flavor text already follows this register; new interaction strings must match it.

## UI/UX requirements

- Every interaction button is built with `createGameButton()` (44px touch targets, `.claude/rules/ui-panels.md`) and shows **cost, effect, and risk inline at the point of choice** — e.g. Send Aid: "Pay 45 gold — Carthage's plague is cured in 2 turns. Carthage and onlookers will remember this." A 7-year-old should understand the trade from the button alone.
- Interaction buttons live on the diplomacy panel's crisis status line (the stage-4 anchor surface); sabotage additionally appears in the espionage panel's mission list alongside existing missions.
- Panels that mutate crisis state re-render immediately (panel-rerender rule).
- Mobile-first: the city crisis badge and status lines must be legible at phone sizes; no new hover-only affordances.

## Data & save compatibility

- **`pressureByHuman` → `pressureByCiv`:** loader migrates the key on read; shape unchanged; no save-version bump.
- **New optional fields** (all optional ⇒ legacy saves load unchanged, matching the `hasRoad?` precedent in `HexTile`):
  - `ActiveCrisis.aidedByCivIds?: string[]` (enforces once-per-crisis aid, powers "X sent aid" history)
  - `ActiveCrisis.sabotage?: { byCivId: string; untilTurn: number; discovered: boolean }` (one active sabotage per crisis)
  - `GameState.settings.aiPressure? / aiPressureVisibility? / aiCrisisInteractions?` (resolved through `resolveWorldPressureFlags` with defaults)
- **Mid-flight saves:** active human crises and fleets are untouched by every stage; AI crises simply begin scheduling on the first post-load turn where preconditions pass.

## SFX

No new audio assets. World-pressure notifications reuse the existing notification stinger; AI-city sieges and hunt combat reuse existing combat/crisis SFX (they run through the same combat and crisis event paths). Bespoke stingers (aid fanfare, sabotage-discovered sting) are deferred to the audio-curation arc as optional polish — listed in the plan, not silently dropped.

## MR staging

Each MR is self-contained, green, and player-unbroken; flags keep incomplete stages dark.

| Stage | MRs | Flag |
|---|---|---|
| 0 | Bug fixes #519, #521, #522, #520 (1–3 MRs as sized during planning) | — |
| 1 | Scheduler + threat-pressure generalization, `resolvePressureSeverityForCiv`, `pressureByCiv` migration, parity regressions (zero behavior change, flag off) | `aiPressure: 'off'` |
| 2 | Pirates vs AI + navy dispatch policy | `aiPressure: 'pirates'` |
| 3 | Crises vs AI + full response policy + world cap + fairness smoke test; second MR: AI catastrophe restoration (worker `restore_land` dispatch) | `aiPressure: 'full'` |
| 4 | Visibility: presentation helper, notifications (batched), map badge, diplomacy status line | `aiPressureVisibility: true` |
| 5 | Hunt-their-foe rewards + send-aid (+ interaction definition table) | `aiCrisisInteractions: 'benign'` |
| 6 | Exploit weakness + sabotage relief + witness reputation | `aiCrisisInteractions: 'full'` |
| 7 | Balance pass: pacing-audit re-run, fairness-band tuning, optional bespoke SFX handoff | — |

## Testing

- **Parity regressions (stage 1):** human crisis/pirate behavior is byte-identical before/after the refactor with flags off — the seam that lets every later MR merge safely.
- **Policy determinism:** unit tests per challenge level asserting exact response turns and gold thresholds; no RNG in the policy module.
- **Privacy negatives:** the three visibility negative tests above, per viewer.
- **Hot-seat isolation:** two humans, different `knownCivilizations`, independent intel; plus a human-target interaction test (aid from human A to human B updates both relationships and notifies witnesses).
- **Fairness smoke test:** the 150-turn reference game asserting the 50–120% crisis-count band and measurable AI yield/pop loss (guards against the policy accidentally neutralizing all pressure).
- **Interaction limits:** once-per-crisis aid and one-active-sabotage negative tests; dispatch-objective expiry when the crisis resolves.
- **AI restoration:** at veteran, an AI civ's workers restore devastated tiles within the recovery window and earn the resilience bonus; at explorer, the delay makes them miss it (both asserted — the delay knob must have teeth).
- **Pacing gate:** `tests/systems/pacing-audit.test.ts` full-catalog run in stage 7, and at any stage that touches yields (`.claude/rules/game-balance.md` requirement).
- **Reputation:** bilateral-update assertions for every interaction (both civs' relationship records move; witness set computed from mutual contact; human witnesses notified).

## Open items deferred to the implementation plan

- Exact relationship delta values (large/medium/small here are tuned in stage 5/6 MRs against existing diplomacy scales).
- Sabotage mission's N-turn extension value and its detection-chance source (reuse nearest existing espionage mission's numbers).
- Whether stage 2's AI navy dispatch needs a new unit-role or reuses the existing warship role (decide in-plan after reading `ai-unit-roles.ts`).

## MR8 final tuned values (2026-07-16)

All three items above shipped in MR6/MR7 (`src/systems/crisis-interaction-definitions.ts`, `src/systems/espionage-system.ts`) and held without further adjustment through the MR8 balance pass — no constants changed in this stage:

- **Relationship deltas:** `hunt_their_foe` +15 target / +4 witness; `send_aid` +15 target / +4 witness; `exploit_weakness` −15 target / −8 witness; `sabotage_relief` −25 target / −8 witness (all bilateral via `modifyRelationship`, clamped ±100).
- **Sabotage relief:** 4-turn remedy-pause window; detection chance 0.60, reusing `sabotage_production`'s existing detection parameters (the spec's earlier 0.3 baseline assumption was superseded by that reuse — see the code comment at `espionage-system.ts:57`).
- **AI navy dispatch:** reuses the existing `AIPlanCandidate`/portfolio machinery (`ai-crisis-response.ts`'s `CrisisDispatchCandidate` merges into `refreshMajorCivPortfolio`'s candidate list) — no new unit role was needed.
- **Fairness band:** `tests/systems/world-pressure-fairness.test.ts` pools all 3 seeds into one assertion (a documented MR3 follow-up deviation from this doc's original per-seed 50–120% band — see that test's header comment) and holds at ~65% AI/human crisis rate, comfortably inside its 40–160% band. `AI_CRISIS_WORLD_CAP` (`{ small: 2, medium: 3, large: 4 }`) and the `crisisResponseDelayTurns`/`crisisRemedyGoldMultiplier`/`crisisDispatchWeight` competence knobs per challenge level (explorer `4 / 3.0 / 0.5`, standard `2 / 2.0 / 1.0`, veteran `0 / 1.2 / 1.5`) needed no retuning.
- **Pacing gates:** `pacing-audit.test.ts` and `pacing-reference-economy.test.ts` both green with no reference-economy snapshot drift — the arc's yield changes (AI crisis penalties, catastrophe restoration, interaction reputation) don't touch the yield tables those tests pin.
- **Notification volume:** measured (not just play-checked) via a new permanent regression, `tests/systems/world-pressure-notification-volume.test.ts` — a 2-human hot-seat simulation across the same 3 seeds, 60 turns each, counting every event kind that can reach a hot-seat viewer as a world-pressure notification (AI-targeted `crisis:started`/`resolved`, `crisis:foe-hunted-by-ally`, `crisis:aid-sent`, `diplomacy:opportunistic-war`, `espionage:sabotage-relief-discovered`). Measured ~0.07 notifications/turn, far under the ≤3/turn ceiling — MR5's start/resolve-only, met-civ-gated batching discipline already handles this without further coalescing.
