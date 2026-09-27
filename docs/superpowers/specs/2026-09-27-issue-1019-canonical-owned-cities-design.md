# #1019 — Canonical owned-city resolution: design

## Status

Design approved; implementation not started.

## 0. Repository state

- Base SHA: `8926fefcdb8f8e427300ad3bb585e4f817b940e0` (`origin/main`, confirmed via `git fetch origin main`).
- Fresh worktree: `.worktrees/opencode-issue-1019`, branch `opencode/issue-1019-canonical-owned-cities`, hooks configured, mise trusted.
- Issue #1019: OPEN, no overlapping open PR for #1019. Open PR #997 (`test/997-city-roster-lifecycle-coverage`) touches the same invariant family but owns the exhaustive lifecycle suite; this issue does not duplicate it.
- Read: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/game-systems.md`, `.claude/rules/strategy-game-mechanics.md`, `.claude/rules/end-to-end-wiring.md`, `.claude/rules/invariants.md`, `.claude/rules/ui-panels.md`, `.claude/rules/hooks-and-tooling.md`, `.claude/rules/spec-fidelity.md`, `.claude/rules/incremental-mr-completion.md`.
- Audited source: `tests/helpers/save-state-invariants.ts` (`assertCityRosters`), `src/systems/capital-system.ts`, `src/systems/domination-sovereignty.ts`, `src/systems/civilization-liveness.ts`, `src/systems/city-capture-system.ts`, `src/core/turn-manager.ts`, `src/ai/ai-production.ts`, `src/ai/ai-treasury.ts`, `src/systems/diplomacy-system.ts`, `src/systems/national-project-system.ts`, `src/systems/fortification-system.ts`, `src/systems/autonomy-capacity.ts`, `src/systems/supply-sources.ts`, `src/systems/wonder-system.ts`, `src/systems/pirate-actions.ts`, `src/ui/advisor-system.ts`, `src/ui/city-overview-panel.ts`, `src/ui/network-panel.ts`, `src/core/hotseat-events.ts`, `scripts/check-src-rule-violations.sh`, `tests/scripts/check-src-rule-violations.test.ts`.

## 1. Current architecture audit

| Concept | Representation | Meaning today |
|---|---|---|
| Authoritative city ownership | `city.owner` | The single source of truth for who owns a city. |
| Major-civ ordered roster | `civ.cities: string[]` | Denormalized index that also carries the capital convention (`cities[0]`). |
| Minor-civ single-city index | `minorCiv.cityId: string` | The city-state's city pointer. |
| Cross-check | `assertCityRosters` | Validates roster/index ↔ `city.owner` agreement for major and minor civs. |

Already-authoritative consumers:
- `getCivilizationLiveness` scans `state.cities` by `city.owner`.
- `domination-sovereignty.ts` builds city counts by scanning `state.cities` by `city.owner`.
- Many ad hoc call sites already use `Object.values(state.cities).filter(c => c.owner === civId)`.

Stale-issue reconciliation:
- The original #1019 mention of "victory trusted roster length" is already fixed by the domination-authority boundary (`victory-system.ts` may not read roster lengths). This issue does not re-fix it.

## 2. Authority decision

`city.owner` is authoritative for city ownership.

`civ.cities` and `minorCiv.cityId` are denormalized indexes with legitimate non-ownership semantics:
- stable ordering;
- capital selection (`cities[0]`);
- roster maintenance during founding, capture, elimination, and serialization;
- ordered turn processing.

## 3. Canonical query surface

New module: `src/systems/city-ownership.ts`.

```ts
export function getOwnedCities(state: GameState, ownerId: string): readonly City[];
export function getOwnedCityCount(state: GameState, ownerId: string): number;
```

- Both scan `state.cities` and filter `city.owner === ownerId`.
- Work identically for major civs, minor civs, and unsupported owner kinds (the latter return empty/`0`).
- No ordering guarantee. Callers that need capital order or roster order continue to use `civ.cities` / `getCapitalCityId`.
- No mutable cache, no persistent index, no schema change.

No additional helpers (`getOwnedCityIds`, `ownsCity`, `hasAnyOwnedCities`) are introduced; the surface is intentionally minimal.

## 4. Corrupt-index semantics

Tested in `tests/systems/city-ownership.test.ts`:

| Shape | `getOwnedCities` / `getOwnedCityCount` behavior |
|---|---|
| Ghost roster entry (`civ.cities` names a missing city) | Not returned / not counted. |
| Wrong owner (`civ.cities` names a city owned by someone else) | Not returned for this owner; returned for its actual `city.owner`. |
| Missing roster entry (city's `owner` matches but owner's roster omits it) | Returned anyway — ownership is authoritative. |
| Duplicate roster id | Does not inflate count. |
| Minor civ whose `cityId` points to a city owned by another actor | `getOwnedCities(state, mcId)` returns empty. |
| Barbarian / pirate / beast / rebel / crisis owner | Returns empty / `0` because no city has those owners. |

## 5. Consumer migration

### Migrated in this PR (decision-critical)

| File | Current pattern | New call |
|---|---|---|
| `src/ai/ai-production.ts` | `civ.cities.flatMap(cityId => ...)` | `getOwnedCities(state, civId)` |
| `src/ai/ai-treasury.ts` | `for (const cityId of civ.cities)` | `getOwnedCities(state, civId)` |
| `src/systems/diplomacy-system.ts` | `Object.values(state.cities).some(c => c.owner === vassalId)` | `getOwnedCityCount(state, vassalId) > 0` |
| `src/systems/national-project-system.ts` | `Object.values(state.cities).filter(c => c.owner === civId).length` | `getOwnedCityCount(state, civId)` |
| `src/systems/fortification-system.ts` | `Object.values(state.cities).filter(c => c.owner === ownerId).length` | `getOwnedCityCount(state, ownerId)` |
| `src/systems/autonomy-capacity.ts` | `Object.values(state.cities).filter(c => c.owner === civId)` | `getOwnedCities(state, civId)` |
| `src/systems/supply-sources.ts` | `Object.values(state.cities).filter(c => c.owner === civId && isCityStabilized(...))` | `getOwnedCities(state, civId).filter(c => isCityStabilized(...))` |
| `src/systems/wonder-system.ts` | `for (const cityId of civ.cities)` | `getOwnedCities(state, civId)` |
| `src/systems/pirate-actions.ts` | `target.cities.some(cityId => state.cities[cityId]?.owner === targetId)` | `getOwnedCityCount(state, targetId) > 0` |
| `src/ui/advisor-system.ts` | `Object.values(state.cities).some(c => c.owner === state.currentPlayer)` | `getOwnedCityCount(state, state.currentPlayer) > 0` |
| `src/ui/city-overview-panel.ts` | `Object.values(state.cities).filter(c => c.owner === state.currentPlayer)` | `getOwnedCities(state, state.currentPlayer)` |
| `src/ui/network-panel.ts` | `Object.values(state.cities).filter(c => c.owner === civId).sort(...)` | `getOwnedCities(state, civId).slice().sort(...)` |
| `src/core/hotseat-events.ts` | `civ?.cities.length ?? 0` | `getOwnedCityCount(state, civId)` |

### Kept as legitimate roster/index use

| File | Why it stays raw |
|---|---|
| `src/systems/capital-system.ts` | Capital = `cities[0]` convention, cross-checked against `city.owner`. |
| `src/core/turn-manager.ts` | Ordered per-city production loop; the roster is the processing order. |
| `src/systems/city-capture-system.ts` | Roster maintenance is the actual job of capture/breakaway/reabsorption. |
| `src/systems/city-founding-system.ts` | Roster maintenance on founding. |
| `src/systems/civilization-elimination-system.ts` | Roster teardown. |
| `src/storage/**` | Serialization. |
| `src/testing/**` | Scenario seeding. |

## 6. Structural prevention

Add a source rule to `scripts/check-src-rule-violations.sh`:

- Flag `\.cities\.length` in `src/ui/**`, `src/ai/**`, and `src/systems/*` **outside** an explicit allowlist.
- Allowlist (roster-maintenance/ordering files):
  - `src/systems/capital-system.ts`
  - `src/systems/city-capture-system.ts`
  - `src/systems/city-founding-system.ts`
  - `src/systems/civilization-elimination-system.ts`
  - `src/core/turn-manager.ts`
  - `src/systems/city-ownership.ts`
  - `src/storage/**`
  - `src/testing/**`

Self-test in `tests/scripts/check-src-rule-violations.test.ts`:
- A new file `src/ui/rogue-panel.ts` containing `if (civ.cities.length === 0)` is rejected.
- A new file `src/core/turn-manager.ts` containing `civ.cities.length` is allowed.

## 7. Performance

`getOwnedCities` and `getOwnedCityCount` are O(#cities). City counts are bounded (typically < 100 per game). The current code already uses equivalent `Object.values(state.cities).filter(...)` scans, so this change is semantics-preserving, not a new hot-path scan. No persistent cache or mutable index is introduced.

## 8. Saves

No `GameState` shape change. No save migration, no normalizer, no corruption repair. The canonical helpers are read-only.

## 9. Invariants reused

- `assertCityRosters` (`tests/helpers/save-state-invariants.ts`) continues to be the single cross-check for roster ↔ `city.owner` agreement.
- No new invariant framework is created.

## 10. Scope guardrails honored

- No #997 lifecycle-suite duplication.
- No war-goal / peace-settlement work absorbed.
- No long-horizon performance/stability work absorbed.
- No unrelated camp/spawn occupancy defects fixed.
- No generic owner-ID branding.
- No broad #1022 primitive audit.

## Mandatory review — INLINE REVIEW ACROSS ALL DIMENSIONS

**Gameplay / fun / new mechanics:** None introduced. This is a behavior-preserving architecture change: the same cities are owned by the same actors before and after.

**Player ages 7-43 / play styles:** No player-visible rule change. UI summary counts and advisor triggers continue to reflect the same truth.

**Difficulty modes:** Unaffected — the helpers read only `city.owner`, never `OpponentChallenge`.

**Computer players (AI):** AI scheduling consumers (`ai-production.ts`, `ai-treasury.ts`) see the same city sets; the change removes roster-trust drift, not AI behavior.

**UI/UX:** No new panels or interactions. Existing panels render from the same authoritative set.

**Architecture:** One canonical module for ownership semantics; roster-order callers keep their legitimate index. Capital/order semantics are preserved.

**Extensibility:** A new owner kind or a new consumer automatically works through the same two helpers; no per-owner branching.

**Data:** No persisted-shape change.

**SFX:** Not applicable.

**Updating saved games:** No migration needed.

**Proper testing:**
- New `tests/systems/city-ownership.test.ts` covering major/minor/unsupported owners and all corruption shapes.
- New source-rule self-test in `tests/scripts/check-src-rule-violations.test.ts`.
- Mirrored tests for every changed consumer must pass.
- Full regular suite and durable full suite before merge.

**Regressions solo play / hot seat:** Not seat-count-dependent; `city.owner` is viewer-independent.

**Proper implementation:** This doc, the forthcoming plan doc, and the diff together are the full scope.
