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
3. **Gameplay surface** — tech-gated interactions with rival crises, with reputation consequences observed by witnesses.

Delivery constraint: many small, self-contained, never-broken MRs. Dark (flag-disabled) code is acceptable between stages.

## Non-goals

- Minor civs experiencing crises or pirate fleets (excluded; revisit only if a concrete need appears).
- Changing what barbarians/beasts/unrest do — they are already symmetric; this spec documents that so it isn't "fixed" twice.
- Changing per-human personal challenge semantics in any way.
- AI worker-driven catastrophe restoration in stage 1 (see Known Limitation).

## Decisions (settled during brainstorm)

| Question | Decision |
|---|---|
| Architecture | **Generalize in place** — the existing scheduler/pressure pipeline becomes actor-agnostic. No parallel AI orchestrator, no abstracted shadow crises. |
| AI severity | **Fixed `'standard'`** severity columns, always, regardless of any challenge setting. |
| AI competence | **Scales with the game-wide `opponentChallenge`** (veteran AI responds fast and pays for remedies; explorer AI dithers). Hot-seat-safe: one shared knob, personal challenges untouched. |
| Crisis depth | **Same machinery** — real `ActiveCrisis` objects, real spread/devastation/hunt entities. |
| Interactions | All four hooks (hunt-their-foe, send aid, exploit weakness, sabotage relief), tech-gated, with witness-visible reputation effects. |

### The severity inversion trap (do not reuse `resolveChallengeForCiv` for AI severity)

`resolveChallengeForCiv` returns the game-wide `opponentChallenge` for AI civs. The `severityByChallenge` tables are written human-facing: veteran = harsher on *you*. Feeding `opponentChallenge` into severity for AI civs would mean picking veteran makes AI civs suffer **more**, making the game **easier** — inverted. Severity for AI must come from a separate resolver that always returns `'standard'`.

## Architecture

### New/changed seams

1. **`resolvePressureSeverityForCiv(state, civId): OpponentChallenge`** (in `src/core/opponent-challenge.ts`)
   Humans → personal challenge via existing resolution; AI → literal `'standard'`. Every severity lookup in crisis/threat systems switches from `resolveChallengeForCiv` to this. `resolveChallengeForCiv` remains for AI-competence lookups.

2. **`processCrisisScheduler(state, bus)`** (renames `processCrisisSchedulerForHumans`, `src/systems/crisis-system.ts`)
   Iterates all non-eliminated major civs with ≥ 1 city. Humans keep per-human caps/grace/cooldowns from their personal profile. AI civs use the standard profile's grace/cooldown values plus a **world-level AI crisis cap**: at most 2 (small map) / 3 (medium) / 4 (large) AI-targeted crises active globally. Human crises never count against the AI cap and vice versa.

3. **`processThreatPressure` / `computeThreatScore`** (`src/systems/threat-pressure-system.ts`)
   Drop `isHuman` early-returns. `pressureByHuman` generalizes to `pressureByCiv`; the save loader migrates the old key on read (old saves keep working; no version bump needed since the shape is identical).

4. **`src/ai/ai-crisis-response.ts`** (new)
   Pure deterministic policy — `(state, civId, profile) → CrisisResponseAction[]`. No RNG. Actions: `{ kind: 'quarantine', crisisId, cityId }`, `{ kind: 'fund-remedy', crisisId, cityId }`, `{ kind: 'dispatch', targetKind: 'hunt-foe' | 'pirate-fleet', targetId }`. Quarantine/remedy call the same `applyQuarantine`/`applyRemedy` helpers the human UI calls (AI pays real gold via `getCityAppeaseCost`). Dispatch injects a high-priority target into the existing AI plan portfolio (`src/ai/ai-plan-portfolio.ts`) — no parallel unit-mover.

5. **`getWorldPressurePresentationForViewer(state, viewerCivId)`** (new, `src/systems/` presentation module)
   The single viewer-safe read path for all AI-pressure UI (see Visibility).

6. **Feature flags** (on `GameState.settings`): `aiPressure: 'off' | 'pirates' | 'full'`, `aiPressureVisibility: boolean`, `aiCrisisInteractions: 'off' | 'benign' | 'full'` (`'benign'` = hunt-their-foe + aid only). Each MR merges with its surfaces dark until the stage completes; the stage's final MR flips the default.

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
| `crisisDispatchPriority` — plan-portfolio weight for hunt/pirate response | low | medium | high |

Policy rules (deterministic):

- **Quarantine** when `crisis age ≥ crisisResponseDelayTurns` OR `infected cities ≥ 2 + (veteran ? 0 : 1)`.
- **Fund remedy** for one infected city per turn when `civ.gold ≥ getCityAppeaseCost(city) × crisisRemedyGoldMultiplier`, most-populous city first.
- **Dispatch** against a hunt foe or sieging fleet whenever one menaces the civ, at `crisisDispatchPriority` weight.

Severity is identical at all three levels; only response speed and willingness differ. On explorer this visibly softens rivals; on veteran crises barely dent them.

### Known limitation (recorded, not silent)

Catastrophe *active restoration* (clearing devastated tiles early to earn the resilience bonus) is a worker-action flow. Stage 1 ships with AI catastrophes recovering on the natural timer only; the resilience bonus remains effectively human-only. Teaching AI workers restoration is an optional late MR in the plan, explicitly listed — not dropped.

## Visibility (stage 2)

All AI-pressure UI reads exclusively from `getWorldPressurePresentationForViewer(state, viewerCivId)`:

- **Met-civ gate:** events for a civ appear only if that civ is in the viewer's `knownCivilizations`. Notification-log entries (turn-stamped, queued, never toast-only): "Plague reported in Carthage", "Corsairs raiding Aztec waters", "Carthage has contained its plague."
- **Tile-visibility gate:** map indicators render only on tiles the viewer's fog state allows. Real entities (pirate ships, hunt foes, devastation tints) already obey fog; the new surface is a crisis badge on known AI cities, reusing the human crisis badge in an "intel" style.
- **Diplomacy panel:** a known civ with an active crisis shows a status line ("Suffering: Red Tide outbreak — 3 cities, 4 turns"). This is the anchor surface for stage-3 interaction buttons, so it ships in the visibility MR and the buttons attach later (no dead buttons in between — buttons are added only in the MR that wires them, per `.claude/rules/incremental-mr-completion.md`).
- **Hot seat:** strictly per-viewer. Each human's intel is independent.
- **Required negative tests:** unmet civ ⇒ no notification/no panel line; unseen tile ⇒ no badge; hot-seat human B sees nothing human A hasn't earned.

## Interactions (stage 3)

Witness set for all reputation effects: civs that have met **both** actor and target. Relationship changes go through the existing bilateral diplomacy helpers (both sides updated, dedup preserved).

| Hook | Tech gate | Effect | Reputation |
|---|---|---|---|
| **Hunt their foe** | none (available once visibility ships; hunts already resolve for any killer) | Slaying a known civ's hunt foe grants the existing kill rewards plus a relationship boost with the target | Target: large +. Witnesses: small +. |
| **Send aid** | `medicine` (era 4) for outbreak remedy funding; `trade-routes` (era 4) for catastrophe relief gold | Pay the target's remedy/relief cost from your treasury; their recovery accelerates (remedy timer starts immediately / recovery multiplier eases) | Target: large +. Witnesses: small +. |
| **Exploit weakness** | `diplomatic-networks` (era 5–7, espionage track) | Full crisis intel on known civs (severity, turns active, infected-city list); declaring war on a crisis-struck civ is marked *opportunistic* | Target: large − on opportunistic war. Witnesses: medium −. |
| **Sabotage relief** | `covert-operations` (era 5–7, espionage track) | Spy mission: extend a rival's outbreak / block their remedy for N turns | Covert. On discovery (existing espionage detection roll): target huge −, witnesses medium −. Undiscovered: no penalty. |

- Overt acts (aid, foe-hunt, opportunistic war) apply reputation immediately.
- Covert acts reuse the espionage system's existing detection mechanics — no new stealth subsystem.
- AI civs already participate in *hunt-their-foe* implicitly — hunts resolve for whoever kills the foe, and the reward/reputation wiring applies to AI killers too. Aid, exploit, and sabotage are **human-initiated only** in this arc; AI-initiated versions are a future extension (keeps stage 3 bounded).
- Content-honesty rule applies: the tech `unlocks` strings for `medicine`, `trade-routes`, `diplomatic-networks`, and `covert-operations` gain new effect text **in the same MR that implements the effect**, with a positive test each (`.claude/rules/content-description-honesty.md`).

## MR staging

Each MR is self-contained, green, and player-unbroken; flags keep incomplete stages dark.

| Stage | MRs | Flag |
|---|---|---|
| 0 | Bug fixes #519, #521, #522, #520 (1–3 MRs as sized during planning) | — |
| 1 | Scheduler + threat-pressure generalization, `resolvePressureSeverityForCiv`, `pressureByCiv` migration, parity regressions (zero behavior change, flag off) | `aiPressure` (off) |
| 2 | Pirates vs AI + navy dispatch policy | `aiPressure: 'pirates'` |
| 3 | Crises vs AI + full response policy + world cap | `aiPressure: 'full'` |
| 4 | Visibility: presentation helper, notifications, map badge, diplomacy status line | `aiPressureVisibility: true` |
| 5 | Hunt-their-foe rewards + send-aid | `aiCrisisInteractions: 'benign'` |
| 6 | Exploit weakness + sabotage relief + witness reputation | `aiCrisisInteractions: 'full'` |
| 7 | Balance pass: pacing-audit re-run, cap/knob tuning, optional AI catastrophe restoration | — |

## Testing

- **Parity regressions (stage 1):** human crisis/pirate behavior is byte-identical before/after the refactor with flags off — the seam that lets every later MR merge safely.
- **Policy determinism:** unit tests per challenge level asserting exact response turns and gold thresholds; no RNG in the policy module.
- **Privacy negatives:** the three visibility negative tests above, per viewer.
- **Hot-seat isolation:** two humans, different `knownCivilizations`, independent intel.
- **Fairness smoke test:** scripted full-game run at standard asserting AI civs measurably lose yields/population to crises (guards against the policy accidentally neutralizing all pressure).
- **Pacing gate:** `tests/systems/pacing-audit.test.ts` full-catalog run in stage 7, and at any stage that touches yields (`.claude/rules/game-balance.md` requirement).
- **Reputation:** bilateral-update assertions for every interaction (both civs' relationship records move; witness set computed from mutual contact).

## Open items deferred to the implementation plan

- Exact relationship delta values (large/medium/small placeholders here are tuned in stage 5/6 MRs against existing diplomacy scales).
- Sabotage mission's N-turn extension value and its detection-chance source (reuse nearest existing espionage mission's numbers).
- Whether stage 2's AI navy dispatch needs a new unit-role or reuses the existing warship role (decide in-plan after reading `ai-unit-roles.ts`).
