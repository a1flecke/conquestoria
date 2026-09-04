# #927 Regional Capital Administration Rung — Design

**Date:** 2026-09-04  
**Issue:** #927 (administration-ladder tracker; must be reopened and remain open)  
**Base:** `4523b0d2db7c3e949a8078aaa4ad161e0fe5286d` (`origin/main`)  
**Scope:** Era 4–5 Second Seat of Government only. Player-facing name: **Regional Capital**.

## Goal

Let a geographically wide empire establish exactly one scarce secondary administrative seat in a chosen non-capital city. It reduces only distance-related unrest in cities geographically nearer that seat, while preserving the original capital, the unchanged positive `Distance from capital` row, Road & Post value, Courthouse value, and a nonzero residual administrative burden.

This does not implement the later #927 bureaucracy, rail/telegraph, or federalism rungs; Governors; capital relocation; or any war/occupation relief.

## Current-main audit

### Capital and distance

- `getCapitalCityId` in `src/systems/capital-system.ts` defines a capital as `civilization.cities[0]`, validating that the city still belongs to the civilization. There is no capital-transfer mechanism.
- `getUnrestPressureBreakdown` in `src/systems/faction-system.ts` computes the positive `Distance from capital` row as `min(20, max(0, (hexDistance(city, capital) - 5) * 2))`. It is a direct canonical axial distance, not a road/path/movement measure.
- Capturing the capital removes it from the prior owner’s `cities` list. The base helper then returns no capital for that owner, which is existing behavior and out of scope. A Regional Capital never becomes the true capital.

### Existing distance relief

- Courthouse produces `Courthouse` relief of `min(round(0.5·D) + min(3, O), max(0, D + O - 2))`, where `D` is the positive distance row and `O` positive overextension. Its residual floor is 2 total sprawl pressure.
- Road & Post Network is an Era-4 `military-logistics` unlock. For cities continuously connected to the capital over current-owner land roads, it produces `min(round(0.35·D), 6, max(0, D - 4), max(0, D + O - 2 - courthouseRelief))`. It has no save state and does not accept foreign, neutral, water, or unowned-road gaps.
- `UNREST_RELIEF_SOURCES` is the canonical table. It already supplies generic AI production/research valuation and all relief rows are appended after positive rows.

### National projects, capture, and saves

- A national project is a `BUILDINGS` entry with `uniquePerEmpire: true` and `nationalProject`. Completion appends the building to `city.buildings` and creates `builtNationalProjects[`${civId}:${buildingId}`] = { civId, cityId, eraBuilt }`.
- `getReservedNationalProjectKeys` includes both completed projects and production queues, preventing same-civ duplicate queues. Different civilizations reserve independently.
- Ordinary national projects expire after their home era plus two; `milestone: true` prevents expiry. Regional Capital must be a milestone because its administrative location must persist until lost.
- Current city-capture paths transfer city ownership but do not normalize `builtNationalProjects` or remove project buildings. This would leave a former owner’s project record pointing at a foreign city. The implementation must add a generic capture/raze normalization for completed unique national projects whose record points to the affected city: remove the record and the building; do not give it to the captor. This enables the former owner to rebuild and prevents foreign inheritance or ghosts.
- Project location and completion already serialize through `builtNationalProjects` plus `city.buildings`; no new state or save-schema migration is required. Current schema is 24.

### AI, guidance, and UI

- AI production derives legal projects through `getAvailableBuildings` and `getReservedNationalProjectKeys`; relief-source buildings receive a generic simulated pressure-drop score.
- AI research derives pressure demand from `UNREST_RELIEF_SOURCES`, keyed either by a source building unlock or a source research unlock.
- `unrest-guidance.ts` currently handles Courthouse, then Road/Post, in the sprawl resolver. It returns structured, owner-scoped data; the UI copy layer owns text.
- Existing city production surfaces show national projects. No Regional Capital screen, overlay, or new input flow is needed. Completion uses the generic national-project sound.

## Decision

Add `regional_capital` as an Era-4 milestone national project unlocked by existing `political-philosophy` (Era 4, civics track). It has no yield bonus, costs the canonical Era-4 national-project 160 production, uses the existing `marquee`/`national-project` pacing metadata, and may be built in any owned city except the true capital. Add `cannotBuildInCapital?: boolean` to the typed building definition and enforce it centrally in `getAvailableBuildings` by resolving the caller's capital through `getCapitalCityId`; player production, AI production, and guidance then inherit the same legality without duplicate checks. It uses standard one-per-empire queue reservation.

Add `regional_capital` to `political-philosophy.unlocksBuildings` and add the effect text `Unlock Regional Capital national project` to its player-facing unlocks. Add `regional_capital: '🏛️'` to `PRODUCTION_ICONS`. `political-philosophy` is already appropriately thematic and preserves the Era-4–5 timing without adding or retuning technology.

The project is physically located in the selected city. Its effect is derived at evaluation time from the owner’s completed project record and that record’s city, only when the record, city, and city ownership agree. No secondary-capital flag, cached distance, computed relief, or parallel administration state is persisted.

## Relief contract

The base positive row remains unchanged:

```
Distance from capital +D
```

For each evaluated city, resolve the valid Regional Capital for that city owner. Compute:

```
capitalPressure = base positive distance pressure D
nearestSeatPressure = base distance formula using min(distance(city, trueCapital), distance(city, regionalCapital))
rawSeatRelief = capitalPressure - nearestSeatPressure
```

If the city is nearer the true capital, `rawSeatRelief` is zero. The true capital receives zero. A seat beside the capital provides little or no benefit; a seat beside a remote cluster provides meaningful relief. Island geometry still uses `hexDistance`, exactly like the base row; it neither requires nor invents a land/road connection.

The row label is `Regional Capital administration`. It is emitted by a `UNREST_RELIEF_SOURCES` entry after positive rows. Its exact formula is:

```
regionalCapitalRelief = min(
  rawSeatRelief,
  10,
  max(0, D + O - 2 - courthouseRelief - roadPostRelief)
)
```

`D` and `O` are the unchanged positive distance and overextension rows. `courthouseRelief` is the current Courthouse formula and `roadPostRelief` is the current Road & Post formula. The evaluation order is Courthouse, Road & Post, then Regional Capital. This preserves the existing Road & Post contract verbatim, gives existing local and infrastructure investments priority, caps a seat's independent benefit at 10, and enforces the shared two-point sprawl residual after all three distance-targeting levers. A nonzero Regional Capital row is impossible unless a city is genuinely nearer the Regional Capital and the shared budget remains.

This is intentionally separate from `Military Administration`: Regional Capital never targets `War weariness` or `Recent conquest`.

## Capture and loss contract

When the project city is captured or razed:

1. remove the former owner’s national-project record for any completed unique national project located there;
2. remove the matching project building from that city;
3. do not create a project record for the captor;
4. allow the prior owner to build that project again if its normal era/tech/queue rules allow it.

The normalizer must also cover every capture entry path, including major-city occupy, direct ownership transfer, raze, and breakaway/reconquest where applicable. It must not change true-capital ownership semantics or transfer Regional Capital into a foreign benefit.

## AI and guidance

The project participates in the existing generic relief-source scoring, but a one-city simulation is insufficient because its benefit is empire-wide and location-dependent. Add an optional source-level location scorer to `UnrestReliefSource`: for an eligible candidate city, sum the bounded Regional Capital pressure decrease across the owner’s cities, evaluate only owned cities, and use it once per candidate planning pass. With modest city counts this is bounded O(cities²), requires no pathfinding, and sees no opponent information. Sources without a location scorer retain current AI behavior.

Expected AI behavior:

- compact/few-city empires score it low;
- wide empires with remote clusters score it higher;
- a remote candidate that helps multiple cities beats a capital-adjacent candidate;
- distance relief does not become a blanket response to war or recent-conquest pressure.

Guidance adds typed recommendations only while the owner has no valid Regional Capital: research `political-philosophy` when materially useful, then establish the project at a useful eligible city. Once completed, it emits no duplicate seat recommendation and retains legitimate Courthouse and Road/Post recommendations. UI copy stays plain: “Establish a Regional Capital in a distant city to reduce distance pressure nearby.”

## Player and hot-seat contract

| Before | Action | Immediate visible result |
|---|---|---|
| Eligible non-capital city, no Regional Capital | Queue and complete Regional Capital | Production surfaces use the existing national-project completion state; unrest breakdown rerenders with the named relief row where applicable. |
| City nearer Regional Capital than true capital | Open city unrest breakdown | Unchanged positive Distance row plus bounded `Regional Capital administration` negative row. |
| Project city captured | Resolve capture | Former owner’s other-city relief vanishes immediately; captor sees no inherited Regional Capital relief. |

All mechanics use `city.owner` / explicit civ ids, never `state.currentPlayer`. Guidance remains viewer-scoped through existing active-player UI calls. Hot-seat tests must prove player-one and player-two projects are isolated and a handoff does not retain stale advice.

## Review outcomes and guardrails

- **Balance and play styles:** benefits geographical wide play, but preserves tall play and Courthouse/Road/Post choices. The shared residual prevents free sprawl.
- **Ages 7–43 and UX:** plain `Regional Capital` name, no jargon, one familiar production interaction, and visible positive/negative rows make the cause understandable.
- **Difficulty:** formula, availability, and player mechanics remain difficulty-invariant. AI is scored from the same owner-scoped state.
- **Architecture/extensibility:** a generic active-seat helper and source metadata keep later bureaucracy, rail/telegraph, and federalism separate. No project-ID branches scattered through AI/UI/capture code.
- **Audio:** reuse existing national-project completion SFX; no asset work.
- **Saves:** normal project persistence only; legacy saves derive no Regional Capital until one is built. No migration.
- **Performance:** direct hex distance; no pathfinding; cache active seat lookup in one unrest evaluation context; only bounded candidate-city simulations in AI planning.

## Test contract

Focused tests must cover:

1. no project/no row; valid completed project/row; base positive row remains exactly unchanged; a malformed, captured, or foreign project record is inactive;
2. capital and capital-nearer cities receive zero seat relief; remote-cluster cities receive bounded relief; near-capital placement is weak;
3. compact, linear, wide, two-cluster, and island-separated layouts;
4. seat-only, Courthouse-only, Road-only, all seat/Courthouse/Road combinations, each retaining residual distance pressure;
5. no impact on war weariness or recent conquest;
6. one-per-civ completion and queue reservation; independent per-civ projects; non-capital placement legality shared by player and AI; `political-philosophy.unlocksBuildings` and production-icon coverage;
7. loss/capture/raze removes former benefit, does not grant captor benefit, prevents ghosts, and permits eligible rebuild;
8. save/load and legacy-save derivation with no schema increment;
9. wide AI values a useful remote site, compact AI does not overvalue it, no opponent data affects the score, and research uses generic source metadata;
10. guidance before unlock, after unlock/no seat, and after completion; Courthouse/Road guidance remains reachable;
11. player-one/player-two isolation and handoff refresh;
12. deterministic repeated evaluations and no road/pathfinding dependency;
13. deterministic balance fixtures for compact three-city, linear six-city, wide ten-city, two-cluster, island-separated, near-capital-seat, and remote-seat layouts. Each fixture asserts the unchanged positive distance row, Courthouse/Road/Regional Capital named relief rows, and final residual for seat-only, road-only, courthouse-only, each pair, and all three.

Required verification after implementation: changed-source rule checks; mirrored focused suites for faction, national projects, capture, city production, tech unlocks, AI production/research, unrest guidance, save/load, and hot-seat; pacing/reference-economy gates for the new project; `git diff --check`; build; durable full suite and status.

## Roadmap tracking

Before coding, reopen #927 and update its checklist/body using the existing umbrella issue: mark Road & Post Network complete via #955; mark Regional Capital as the active Era-4–5 rung; leave bureaucracy/free-city allowance, telegraph/rail administration, and federalism/autonomy unchecked and explicitly open. Do not close #927 with this PR.
