# #1722 — AI spy doctrine: reserve one mobile operative

**Status:** active (owner: #1722)
**Base verified:** `origin/main` (`1dcea731`), 2026-11-15.

## Problem

No AI civilization starts a spy mission in a long-horizon campaign. `spyMissionsStarted`
is `0` for every AI civ across 250 rounds of `lh-late-era-medium`, and every observed spy
status is `embedded` from the turn the spy first became idle. This is not a telemetry
defect (#1706 made the zero accurate) and not a recruitment defect (#1699 restored
recruitment): each AI civ pays for a spy and then permanently garrisons it in its own
capital, where it can never operate.

Reproduced statically against `origin/main` and corroborated by
`tests/simulation/ai-playability.test.ts`, whose #1693 mission-metrics test had to seed an
already-stationed spy because a naturally recruited one never starts a mission.

## Root cause (confirmed)

1. **One-operative roster.** `spyProcurementDemand` (`src/ai/ai-prepared-turn.ts`) calls
   `incrementalDemandSeed(..., activeSpies, 1)`, so `desired = min(active + 1, 1)` — one
   active spy per civ — and `activeSpies` counts an `embedded` spy as satisfying demand.
   `espionage.maxSpies` (tech-gated 1→11) is ignored. A fielded or embedded spy therefore
   permanently satisfies the civ's entire espionage demand.
2. **Unconditional defensive embed.** `shouldAiStationDefensiveSpy`
   (`src/ai/basic-ai.ts`) returns true whenever the civ has `spy-networks`/`sabotage` and
   its capital counter-intelligence is `0`. It is not threat-aware, does not require a
   spare operative, and fires on the first turn an idle spy exists.
3. **No return path.** `embedSpy` sets `status: 'embedded'`; `processSpyTurn` never
   processes that status; the AI never calls `unembedSpy` (only the player panel does). The
   spy is inert for the rest of the game.
4. **No startable-mission fallback.** The general AI mission loop takes
   `chooseAiMission` (the single top-ranked mission). If that mission needs a placed spy
   and the spy is not `stationed`, the loop `continue`s the spy without trying the next
   ranked mission. Even a mobile, non-embedded spy therefore starts nothing whenever the
   top-ranked mission is placed.

`embedded` spies were also re-ranked every round: 574 placed-spy evaluations across three
civs in the reproduction, each refused.

## Decision (product)

**Reserve one mobile operative.** A civ may keep one operative defending its capital only
when it has a second operative to operate with. The AI never embeds its last mobile spy,
and it walks the ranked mission list until it finds a mission the spy can actually start.

Rejected alternatives, for the record:

- *Threat-gated embedding* — better behavior long term, but adds a campaign-state
  dependency (recent `attributedIncidents`/`detectedThreats`) without changing the
  structural defect. Deferred as a separate refinement.
- *Defensive-only AI espionage* — accepts a permanently unused asset and leaves AI
  offensive espionage untested in long-horizon play.
- *Embedded counter-intelligence missions* — `attemptSweep` is player-only today; wiring a
  new AI action surface is a much larger change than this defect requires.

## Design

### 1. Bounded two-operative roster (`src/ai/ai-prepared-turn.ts`)

- Add `export const AI_SPY_ROSTER_CAP = 2`.
- `spyProcurementDemand` uses `cap = Math.min(espionage.maxSpies, AI_SPY_ROSTER_CAP)`.
- Incremental demand is unchanged: at most one spy is requested at a time, so this cannot
  become a spy farm, and `hasQueuedAISpy` still prevents duplicate queue entries.
- Two is the smallest roster that can both defend and operate, and `spy-networks` (the
  earliest tech that enables the defensive embed) already implies `maxSpies >= 3`, so the
  cap is reachable.

### 2. Never garrison the last mobile operative (`src/ai/basic-ai.ts`)

`shouldAiStationDefensiveSpy` additionally requires at least two non-captured,
non-embedded spies. Counting non-embedded rather than only non-captured keeps the
invariant true if the capital changes after a capture: a civ with two embedded spies and
zero mobile spies must not embed a third "because there are three".

### 3. Walk the ranked list for a startable mission (`src/ai/basic-ai.ts`)

In the general "start missions for stationed spies" pass:

- Rank once per civ turn (`rankAiMissions`), not once per spy.
- Skip spies that cannot start any mission (`embedded`, `captured`, `cooldown`) before
  ranking. This removes the measured per-round waste and makes the embedded defender
  explicitly inert instead of repeatedly refused.
- For each remaining `idle`/`stationed` spy, resolve its target once, then take the first
  ranked mission that satisfies:
  - placed mission ⇒ the spy is `stationed` and carries its own `targetCivId`;
  - remote mission ⇒ the spy is `idle` or `stationed`;
  - the operation effect is not already at full strength
    (`isOperationEffectFullyActive`), matching the infiltrated and remote paths;
  - `startMission` accepts it.
- Emit `espionage:mission-started` from the accepted result only, as #1706 requires.

`chooseAiMission` and `rankAiMissions` keep their current exported semantics.

## Invariants and tests

Each is a regression that fails on `origin/main`:

1. A mature AI civ with one idle spy and capital counter-intelligence `0` does **not**
   embed it (it stays mobile and can move/infiltrate). This is the reported failure.
2. A civ with two mobile spies embeds exactly one in the capital and keeps at least one
   non-embedded.
3. Procurement: zero spies ⇒ one demanded; one spy ⇒ a second demanded when
   `maxSpies >= 2`; two spies ⇒ none; never past `maxSpies`.
4. An idle spy whose top-ranked mission is placed, with a remote mission available, starts
   the remote one instead of nothing.
5. An `embedded` spy never starts a mission and never blocks a co-located `stationed` spy
   from starting one.

Existing tests to update because they encode the old one-spy rule:

- `tests/ai/basic-ai.test.ts` — "AI stations a defensive spy in its capital by stage 3"
  gains the second operative and asserts the reserve invariant.
- `tests/ai/ai-prepared-turn.test.ts` — "counts an off-map spy against the peacetime roster
  limit" expects a second demand at one spy under the two-spy roster.

## Acceptance

- All invariants above pass.
- `./scripts/dev.sh build` passes (TypeScript).
- The focused `lh-late-era-medium` campaign run reports `summary.espionage.spyMissionsStarted
  > 0`, against the issue's `0` baseline. The full matrix's known-gap ratchet is unaffected
  because no finding entry is added or removed.

## Out of scope

- Threat-aware defensive embedding.
- AI counter-intelligence sweeps (`attemptSweep` stays player-initiated).
- `unembed` / re-embed cycles for AI defenders.
- Any change to player espionage, mission effects, or mission balance.
