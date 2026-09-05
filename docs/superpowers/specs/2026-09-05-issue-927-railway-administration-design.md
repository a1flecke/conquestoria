# #927 Railway Administration Rung — Design

**Date:** 2026-09-05
**Issue:** #927 (administration-ladder tracker)
**Base:** `origin/main` at `b474a5e6` (post Bureaucracy, PR #967)
**Scope:** Era 7–8 rung. Player-facing effect name: **Railway Administration**
(deliberately not "Telegraph" — see Decision).

## Goal

An industrial-era counter to `Distance from capital` specifically (not
`Empire overextension`), built as a genuine upgrade on top of an already-active
Road & Post Network connection rather than a second graph/pathfinding
implementation, preserving the unchanged positive row and the shared residual
sprawl floor.

## Current-main audit

- `getCitiesConnectedToCapital(state, civId, 'owned-road')` (`road-network.ts`)
  is the canonical owned-road connectivity BFS, already reused by Road & Post
  Network's own relief source and cached per-evaluation via
  `getOwnedRoadConnectedCities` (`context.connectedOwnedRoadCityIdsByCivId`).
- `resolveTileHasRail(hasRoad, owner, ownerCompletedTechs)` already ties "does
  this owned road tile render as rail" to exactly one tech:
  `railway-expansion` — no separate rail-tile or telegraph-cable system exists
  anywhere in the codebase.
- `railway-expansion` (era 7, metallurgy, prereqs `precision-casting` +
  `fortification-engineering`) already: halves road movement cost (does not
  stack with Military Logistics per the movement-stacking policy), and unlocks
  the `national_railway` national project (era 7–9, non-milestone, fades and
  expires like every other ordinary national project — `civYieldBonus` only,
  "trade route gold, no movement" per the existing movement-stacking table).
- `electric-telegraph` (era 7, communication) exists as a real tech but has no
  infrastructure requirement of its own (`+1 gold per city connected to your
  capital by road`) and no connection to unrest relief; using it would mean
  "no infrastructure relationship" — exactly what the rung design explicitly
  forbids.

## Decision

**Reject reusing `national_railway`.** It is a fading, non-milestone national
project (fade curve 1.0 → 0.5 → 0.0 by `eraBuilt + 3`, then the building is
removed and a `city:national-project-expired` event fires). Every other rung
(Courthouse, Road & Post, Regional Capital, Bureaucracy) is permanent once
achieved. Hanging administration relief off a fading project would mean a
player's rail administration silently vanishes a few eras later — a dead-end
regression relative to every other rung's contract, not a legitimate
trade-off, so this project is left untouched.

**Reuse `railway-expansion` directly as a pure research unlock** — no new
building, no new project — mirroring Road & Post Network's and Bureaucracy's
own "pure tech" shape. Appended an honest second `unlocks` sentence describing
the effect; left the tech's existing movement/project text untouched.

**Require `military-logistics` in addition to `railway-expansion`.**
`railway-expansion` has no tech-tree dependency on `military-logistics` (their
prerequisite chains are independent — metallurgy vs. exploration), so an
unusual research order could reach it without ever completing Road & Post
Network's own gate. Gating Railway Administration's `isActive` on both closes
that gap and keeps the mechanic what its own design description promises: a
strict upgrade layered on top of an already-active Road & Post connection,
never a substitute for it. `isPotentiallyUseful` (used only for AI relevance
gating, not eligibility) still checks the same owned-road-connectivity
predicate Road & Post Network's own source uses.

**Row name: "Railway Administration"**, not "Telegraph" or "Industrial
administration" — the row is named for what the code actually checks
(`railway-expansion` + owned-road connectivity), matching
`resolveTileHasRail`'s own criterion for when a road tile is honestly rail.

## Relief contract

The base positive row remains unchanged:

```
Distance from capital +D
```

```
rawRelief = min(round(0.2 * D), 4)
railwayRelief = min(
  rawRelief,
  max(0, D + O - 2 - courthouseRelief - roadPostRelief - regionalCapitalRelief - bureaucracyRelief)
)
```

`0.2` and `4` are roughly half of Road & Post Network's own `0.35` fraction
and `6` cap — this is explicitly a smaller marginal compression layered on an
already-active connection, not a second independent network. The consumed
budget subtracts every earlier rung's *actual delivered relief* (computed via
the exact same functions that produce their real rows — `getCourthouseReliefAmount`,
`getRoadPostNetworkReliefAmount`, `getRegionalCapitalReliefAmount`,
`getBureaucracyReliefAmount` — never a reimplemented copy), so the shared
2-point residual floor holds by construction across any combination of
sources: each source's own cap enforces `priorSum + ownRelief <= D + O - 2`,
so the invariant carries inductively no matter how many rungs stack. Verified
directly by the "stacks with Courthouse and Road & Post Network without
dropping below the shared residual floor" test, which lands exactly on the
floor for a maxed-out `D = 20` city.

`bureaucracy` is only included in the consumed budget when
`separation-of-powers` is actually completed — `getBureaucracyReliefAmount`
itself does not check tech completion (that check lives only in its own
`isActive`), so an un-gated call would have silently over-shrunk this rung's
budget for civs who never researched Bureaucracy.

## AI, guidance, and UI

No Railway-Administration-specific AI code: `unrestReliefTechBonus` picks up
`railway-expansion` generically via `researchUnlockTechId`, and AI production
is naturally skipped (no `buildingId`). A `railway-expansion`-specific test
had to assert on the `unrestReliefTechBonus` score component and
`reasonCodes` directly rather than on which tech an AI ultimately picks —
`railway-expansion` already gates the real `national_railway` building, so it
wins on `economicSupport` alone regardless of relief pressure; the analogous
`#926`/`#927` tests earlier in the same file hit the same real-content
collision and use the same pattern.

`unrest-guidance.ts`'s `SPRAWL_RESOLVER` gets one new `Distance from capital`
branch, placed after the existing `connect-city-road-network` branch (mutually
exclusive with it — Railway Administration's condition requires the city to
already be connected, `connect-city-road-network`'s requires it not to be):
recommend researching `railway-expansion` once Road & Post Network is already
active for the city and `railway-expansion`'s own direct prerequisites
(`precision-casting`, `fortification-engineering`) are done; falls through to
the existing chain once researched (no duplicate "already active"
recommendation).

## Performance

Reuses the cached `getOwnedRoadConnectedCities` context helper exclusively —
the same pattern the Bureaucracy rung's own performance fix established — so
Railway Administration adds no new BFS invocation per city; the connectivity
computation is shared with Road & Post Network's own check.

## Save and hot-seat contract

No new save state: fully derived from `civ.techState.completed` and the
existing road-tile map, both already persisted. No `SAVE_VERSION` bump. All
lookups key off `city.owner`; a dedicated test proves owner-scoping
(hot-seat viewer independence), mirroring Road & Post Network's own test.

## Test contract

Covered in `tests/systems/faction-system.test.ts` (`#927 Rung 5 — Railway
Administration unrest relief`): no relief without `railway-expansion`; no
relief without `military-logistics` even with `railway-expansion` researched
(the "must upgrade an active connection" design decision); no relief when not
actually connected; bounded relief matching the formula with `Distance from
capital` left unchanged; war weariness / recent conquest untouched; an
unrelated era-7 tech grants nothing; Courthouse + Road & Post + Railway
stacking lands exactly on the shared residual floor; a broken route removes
the relief and a repaired one restores it; owner-scoped hot-seat isolation.
`tests/systems/unrest-guidance.test.ts` (`#927 Railway Administration
guidance`): recommends once the connection is already active and prerequisites
are reachable, not before Road & Post Network is itself active, stops once
researched. `tests/ai/ai-research.test.ts`: generic AI valuation picks up the
new `researchUnlockTechId` source.

Not independently re-tested here (inherited, not a gap): foreign-owner and
water-gap exclusions, and city-capture ownership transfer — all already
exercised exhaustively by Road & Post Network's own test block, and Railway
Administration reuses that exact connectivity helper with zero
reimplementation, so those properties transfer structurally.

## Roadmap tracking

#927 reopened and its roadmap updated before implementation: Bureaucracy
marked shipped (#967); Railway Administration marked active; Federalism left
open. This PR does not close #927.
