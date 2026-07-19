# MR2a (#604): propaganda's flip-loyalty spy mission

Index: #587. Escalated from MR2 (#589). Source spec: #587's MR2a comment / #604's issue body.

## Goal

`propaganda` (era 6, espionage) claims: "Spy missions to flip loyalties available in
foreign cities." Make it real: a new `flip_loyalty` spy mission that, on success,
peacefully transfers a foreign (non-capital) city to the spy's owner.

## Step 1 — types.ts: new mission type

- Add `'flip_loyalty'` to `SpyMissionType` (`src/core/types.ts:773-797`), placed after
  `arms_smuggling` in the Stage 4 comment block, with its own inline comment noting it's
  gated by `propaganda` specifically (not the shared Stage 4 tech set).

## Step 2 — espionage-system.ts: gating, tables, resolution

All edits in `src/systems/espionage-system.ts`.

1. New stage constants (mirroring the `STAGE_5` "intentionally standalone" pattern at
   line ~352-356):
   ```ts
   const STAGE_PROPAGANDA_TECHS = ['propaganda']; // era 6 — gates flip_loyalty only, not the shared Stage 4 set
   const STAGE_PROPAGANDA_MISSIONS: SpyMissionType[] = ['flip_loyalty'];
   ```
   Add to `getAvailableMissions`'s union (line ~373-379).
2. `MISSION_BASE_SUCCESS.flip_loyalty = 0.40` (line ~48) — lowest tier alongside
   `election_interference` (0.40), reflecting this is the strongest-effect mission in the
   game (outright city transfer vs. temporary effects).
3. `MISSION_DURATIONS.flip_loyalty = 8` (line ~68) — longest duration, above
   `fund_rebels`/`assassinate_advisor` (6), reflecting the stakes.
4. `XP_PER_MISSION.flip_loyalty = 20` (line ~467) — highest XP, above
   `assassinate_advisor` (18).
5. `missionRequiresPlacedSpy('flip_loyalty')` → `true` (already the default for anything
   not in the remote-capable exclusion list at line ~384 — no change needed, just confirm
   in a test).
6. `INFILTRATOR_MISSIONS`/`HANDLER_MISSIONS` (line ~455-459): add `flip_loyalty` to
   `HANDLER_MISSIONS` — it's an influence mission (fits the handler promotion category
   description: "bonus to influence missions").
7. `resolveMissionResult` new case (mirrors `sabotage_relief`'s eligibility-guard style,
   returns `{}` when ineligible instead of throwing):
   ```ts
   case 'flip_loyalty': {
     if (!targetCity) return {};
     if (getCapitalCityId(gameState, targetCivId) === targetCityId) return {}; // capitals never flip
     return { flippedCityId: targetCityId, flippedFromCivId: targetCivId };
   }
   ```
8. New result-application branch in `processEspionageTurn`'s `mission_succeeded` handling
   (near the `forge_documents` branch, ~line 1422): on `result.flippedCityId`, call
   `transferCapturedCityOwnership(state, result.flippedCityId, civId, state.turn)`, then
   apply bilateral `modifyRelationship` (spy owner ↔ victim, -30 — steeper than
   `forge_documents`'s -25 since this is a direct territorial loss, but shallower than
   `computeRazeGold`'s implicit -40 raze penalty since it's non-destructive) on **both**
   sides per the Hot Seat bilateral rule, and `bus.emit('espionage:city-flipped', { civId,
   victimCivId: targetCivId, cityId: result.flippedCityId })`.
   - Guard: if `state.cities[result.flippedCityId]` is already owned by `civId` (race:
     city was captured by combat the same turn the mission resolves), no-op — mirror the
     `previousOwnerId === newOwnerId` short-circuit already inside
     `transferCapturedCityOwnership` itself, so this is likely already safe; add a test
     instead of redundant guard code.

## Step 3 — AI: `chooseAiMission` (`src/ai/basic-ai.ts`)

Add `'flip_loyalty'` into the existing `preferredOrder` arrays (line ~1588-1631) — put it
in the `aggressive` and `hasStage5`+aggressive orderings near `steal_tech`/`arms_smuggling`
(high-value aggressive plays), and in the `diplomatic`/`trader` ordering near
`forge_documents` (both are influence-flavored). Do not add a new branch — this is a
data-table change like the others.

## Step 4 — UI: `src/ui/espionage-panel.ts`

- `MISSION_LABELS.flip_loyalty = 'Flip Loyalty'`
- `MISSION_STAGE.flip_loyalty = 4` (Shadow Operations bucket — same UI tier as
  `assassinate_advisor`/`forge_documents`/`fund_rebels`, matching the precedent that UI
  stage buckets by rough tier, not literal internal stage number — see the existing
  `sabotage_relief` comment at line ~110 for the same pattern).

## Step 5 — Tests (`tests/systems/espionage-system.test.ts`, new cases)

- `getAvailableMissions` includes `flip_loyalty` iff `propaganda` is completed.
- `missionRequiresPlacedSpy('flip_loyalty')` is `true`.
- `resolveMissionResult('flip_loyalty', ...)` against a capital → `{}` (no flip).
- `resolveMissionResult('flip_loyalty', ...)` against a non-capital foreign city →
  `flippedCityId`/`flippedFromCivId` populated.
- Full `processEspionageTurn` integration: successful mission →
  `state.cities[cityId].owner` changes to the spy's civ, both civs'
  `diplomacy.relationships` move by -30, `espionage:city-flipped` event fires.
- Failure path: mission fails → no ownership change, existing failure-consequence path
  applies (mirror an existing Stage 4 failure test, e.g. `fund_rebels`'s).
- Regression: cannot target own civ's city (existing `startMission`/target-selection
  invariant — confirm rather than re-implement).
- `tests/ai/basic-ai.test.ts` (or wherever `chooseAiMission` is tested): `flip_loyalty`
  is selectable when available and preferred tech is present.
- `tests/ui/espionage-panel.test.ts`: `flip_loyalty` appears in the Stage 4 group when
  available.

## Step 6 — Content honesty check

`propaganda`'s `unlocks` text ("Spy missions to flip loyalties available in foreign
cities") is now true — no text change needed. Run
`tests/systems/description-honesty.test.ts` to confirm no regression.

## Verification

`bash scripts/run-with-mise.sh yarn test` and `bash scripts/run-with-mise.sh yarn build`
must both exit 0 before PR.

## PR

Title: `feat(espionage): flip-loyalty spy mission (#604 MR2a)`. Body references #604 and
#587, states save decision (no migration — additive event only, no new persistent
fields), never "closes #524".
