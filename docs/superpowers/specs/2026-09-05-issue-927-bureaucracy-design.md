# #927 Bureaucracy Administration Rung — Design

**Date:** 2026-09-05
**Issue:** #927 (administration-ladder tracker)
**Base:** `origin/main` at `32679740` (post Regional Capital, PR #957)
**Scope:** Era 5–6 Bureaucracy only. Player-facing effect name: **Bureaucratic administration**.

## Goal

Give a wide empire an empire-wide research counter to `Empire overextension`
pressure specifically (never `Distance from capital`, war weariness, or recent
conquest), modeled as a raised effective free-city allowance, while preserving
the unchanged positive `Empire overextension` row and a nonzero residual
sprawl floor when stacked with Courthouse, Road & Post Network, and Regional
Capital.

## Current-main audit

- `OVEREXTENSION_FREE_CITIES = 6`; `Empire overextension` row =
  `min(30, max(0, (cityCount - 6) * 3))` (`faction-system.ts`).
- `UNREST_RELIEF_SOURCES` is the canonical table. Road & Post Network already
  proves the "pure research unlock, no building" pattern
  (`researchUnlockTechId: 'military-logistics'`, no `buildingId`) — Bureaucracy
  reuses that shape rather than adding a new building (would duplicate
  Courthouse) or national project (would duplicate Regional Capital).
- `unrestReliefTechBonus` (`ai-research.ts`) and `unrestReliefScore`
  (`ai-production.ts`) are fully generic over `UNREST_RELIEF_SOURCES`: a
  `researchUnlockTechId` entry is picked up automatically by AI research
  valuation with zero Bureaucracy-specific code; a source with no `buildingId`
  is automatically skipped by AI production valuation (nothing to build).
- Era 5–6 civics techs available: `civic-humanism`, `constitutional-law`
  (era 5); `separation-of-powers`, `parliamentary-reform` (era 6). No existing
  tech is literally named "bureaucracy" or "administration".

## Decision

Reuse `separation-of-powers` (era 6, civics, prerequisite `constitutional-law`
only) as the unlock — no new tech. Division of power across specialized
institutions is a reasonable thematic fit for professional administrative
capacity, and this codebase already stacks multiple unrelated unlock texts on
one tech (`political-philosophy` unlocks both alliances and Regional Capital).
Appended an honest, mechanism-matching sentence to its `unlocks` array; left
its existing `+1 gold per culture building empire-wide` effect untouched.

No building, no national project: `BUREAUCRACY_RELIEF` in `faction-system.ts`
has `researchUnlockTechId: 'separation-of-powers'` and no `buildingId`. AI
production, guidance-build-eligibility, and production-icon coverage are all
therefore not applicable — verified this is consistent with Road & Post
Network's existing precedent, not a gap.

## Relief contract

The base positive row remains unchanged:

```
Empire overextension +O
```

```
hypotheticalO = min(30, max(0, (cityCount - (6 + 3)) * 3))
rawRelief = O - hypotheticalO
bureaucracyRelief = min(
  rawRelief,
  9,
  max(0, D + O - 2 - courthouseRelief - roadPostRelief - regionalCapitalRelief)
)
```

`+3` free cities (allowance 6 → 9) was chosen to land a fully-invested era 5–6
wide empire (the `pacing-reference-economy` 9-city fixture) exactly on the
shared residual floor once stacked with Courthouse, rather than under- or
over-shooting it. `9` is the formula's own natural ceiling (3 excess cities ×
3 pressure/city) once both the real and hypothetical curves saturate at
`MAX_PRESSURE_EMPIRE` — kept as an explicit constant so a future slope or
bonus change cannot silently raise it. The residual-floor budget mirrors
Regional Capital's own convention: treat Courthouse/Road-Post/Regional
Capital's already-delivered relief as spent from the same `D + O` budget with
the shared `COURTHOUSE_SPRAWL_FLOOR` (2) minimum.

Unlike the two distance-only rungs, Bureaucracy is **not** gated on
`distance > 0` — the true capital shares in empire-wide overextension
pressure too and can receive Bureaucracy relief.

## AI, guidance, and UI

No Bureaucracy-specific AI code: `unrestReliefTechBonus` picks up
`separation-of-powers` generically via `researchUnlockTechId`, gated the same
way Magistracy/Political Philosophy/Military Logistics already are (>= 2
pressured cities). Verified with a direct `planAIResearch` unit test (mirrors
the existing "#927: generic relief research recognizes a direct-tech road
network source" test for Road & Post Network).

`unrest-guidance.ts`'s `SPRAWL_RESOLVER` gets one new branch: for the
`Empire overextension` row, recommend researching `separation-of-powers` once
`constitutional-law` (its direct prerequisite) is done and the tech is not
yet completed; falls through to the existing Courthouse/Magistracy/garrison
chain once researched (no duplicate "already active" recommendation) or
before its prerequisite is reachable. UI copy lives only in
`unrest-guidance-copy.ts`; the breakdown-row list in `city-panel.ts` is
generic over `getUnrestPressureBreakdown` and needed no changes.

## Save and hot-seat contract

No new save state: relief is derived every evaluation from
`civ.techState.completed`, which already persists. No `SAVE_VERSION` bump.
All lookups key off `city.owner` / explicit civ ids, matching the existing
rungs; a dedicated `faction-system.test.ts` case proves a second civ with the
same city count but no researched tech gets no relief.

## Performance

`getBureaucracyReliefAmount` reuses the existing per-evaluation
`context.connectedOwnedRoadCityIdsByCivId` cache (via
`getOwnedRoadConnectedCities`) for its own Road & Post consumed-budget check,
instead of re-running the capital road-connectivity BFS a third time per city.
(Regional Capital's own formula still runs that BFS uncached — pre-existing,
out of scope for this rung; flagged for a future pass rather than touching an
already-shipped rung's exported signature here.)

## Test contract

Covered in `tests/systems/faction-system.test.ts` (`#927 Bureaucracy unrest
relief`): no relief without the tech; no relief below the base allowance;
bounded relief formula with the residual floor; a sweep proving relief never
exceeds `BUREAUCRACY_MAX_RELIEF`; `Distance from capital` left untouched; war
weariness / recent conquest untouched; an unrelated era-6 tech grants nothing;
Courthouse + Bureaucracy stacking preserves the residual floor; owner-scoped
hot-seat isolation. `tests/systems/unrest-guidance.test.ts` (`#927 Bureaucracy
guidance`): research recommendation appears once reachable, not before its
prerequisite, and stops once researched. `tests/ai/ai-research.test.ts`:
generic AI valuation picks up the new `researchUnlockTechId` source with no
Bureaucracy-specific code.

## Roadmap tracking

#927 reopened and its roadmap updated before implementation: Regional Capital
marked shipped (#957); Bureaucracy marked active; Telegraph/Rail and
Federalism left open. This PR does not close #927.
