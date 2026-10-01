# Type-Safety Inventory: Ambiguous Primitive Domain Concepts (#1022)

Audited at `370e145c` (post-#1009). This is the #1022 report: the remaining
ambiguous primitives after the six domain-hardening issues landed, ranked by
demonstrated/high-confidence bug potential, with what was adopted and what is
deliberately left alone.

It complements — and does not repeat — [`caller-discipline-inventory.md`](./caller-discipline-inventory.md)
(#1014), which catalogues *sequence/ordering* contracts. This file is about
*primitive identity*: two values with the same runtime representation but
different meanings.

## Method

1. Enumerate concepts represented as interchangeable `number`, `string`, or raw id.
2. Rank by evidence, not theoretical confusability. Highest weight: has this
   already caused a bug? Also: does it cross a trust boundary (viewer/hot-seat/AI
   omniscience)? Are two same-typed primitives commonly passed together? Is a
   `.claude/rules/` sentence needed to compensate for it? Would a brand cost more
   in casts than the mistakes it prevents?
3. Adopt the smallest mechanism that makes the top mistakes structurally hard.
4. Ship a compile-time negative test per adopted change, and an explicit
   "leave as-is" section.

## Already structurally solved (do NOT re-brand)

| Concept | Mechanism | Landed |
|---|---|---|
| World Age vs Civilization Era | `WorldAge` / `CivilizationEra` brands, construction only at `resolveWorldAge` / `resolveCivilizationEra` / `*FromNumber` | #1016/#1017 |
| Civilization liveness | `getCivilizationLiveness` (canonical query); roster lengths banned by source rule | #1018 |
| Owned cities | canonical owned-city query surface; roster scans banned by source rule | #1019 |
| Owned units | canonical owned-unit query surface; `unit.owner` authoritative | #1020 |
| Simulation RNG | `createSimulationRng` / `createStableIdentityRng` with a structured `SimulationDomainKey`; a bare seed integer is a compile error — this is where the `unit.id.charCodeAt(0)` identity bug (#983) was made unrepresentable | #1021 |
| Production-cost inputs | `ProductionCostContext` with every field required; `era` is `CivilizationEra` | #984 |
| Owner kind | `classifyOwner` / `isMajorCivOwner` / `isPirateOwner` (a truthful runtime classifier, not a brand) | #985-era |

A second brand for any of these would be redundant.

## Adopted in this change

### 1. `SensedUnits` — barbarian camp perception

```
Concept:            the unit set a barbarian camp may sense this turn
Current (was):      readonly Unit[]
Confusable with:    a global unit scan (Object.values(state.units))
Concrete risk:      passing a global scan silently makes camps omniscient --
                    armor/air pressure recorded from anywhere on the map, and
                    findPredatorHuntTarget sees escorts it cannot actually sense.
                    A prose contract existed in two files saying "must never pass
                    a global unit scan"; #1014 deferred the real fix to #1022.
Current protection: a docblock contract in barbarian-pressure.ts and
                    barbarian-archetype.ts (prose compensation).
Proposed action:    brand + one sanctioned constructor, campSensedUnits(...)
Why:                AI-omniscience trust boundary; construction is confined to
                    one boundary (barbarian-system.ts's per-camp loop), so cast
                    pressure is ~1 site. The brand erases at runtime.
Runtime/save effect: none (compile-time only).
```

### 2. `EspionageModifierQuery` — named acting/target roles

```
Concept:            acting civ vs target civ vs target city for a modifier query
Current (was):      getEspionageModifierBreakdown(state, actingCivId, targetCivId, targetCityId)
Confusable with:    three bare strings in adjacent positions
Concrete risk:      transposing acting/target compiles and silently inverts
                    every offense row against every defense row -- wrong odds
                    shown to the player and wrong AI evaluation.
Concrete evidence:  the exact "two same-typed primitives in one API position"
                    shape the audit was asked to find.
Current protection: the parameter names and call-site ordering only.
Proposed action:    required-field options object with named roles.
Why:                3 call sites (turn, panel, tests); required fields make an
                    omitted or positional role a compile error.
Runtime/save effect: none.
```

### 3. `TurnCapturedSpyCommand` — named captor/victim roles

```
Concept:            captor civ vs the captured spy's owner
Current (was):      turnCapturedSpy(state, captorId, spyOwner, spyId, turn = 0)
Confusable with:    captorId and spyOwner are both bare ids and semantically
                    opposite.
Concrete risk:      a transposed call hands the spy to the wrong civilization
                    and writes the detected-threat intel against the wrong civ.
Current protection: parameter names only.
Proposed action:    required-field options object (turn stays optional to keep
                    the original default of 0).
Why:                4 call sites; the two identity fields are the hazard.
Runtime/save effect: none.
```

## Leave as-is (intentionally not branded)

| Concept | Why not |
|---|---|
| Entity ids (`UnitId` / `CityId` / `VillageId`) | Brands would require casting every persisted fixture, every `Map<string, …>` boundary and every id literal in tests — cast pressure far above the demonstrated risk. Prefix conventions (`unit-`, `city-`) plus typed record access (`state.units[id]`) already catch most mistakes, and the one real identity bug (#983) was fixed at the RNG boundary (#1021), not here. |
| `hexKey` string | Pervasive `Map`/`Set` keys; branding needs a cast at every boundary. No demonstrated misuse. `HexCoord` (the structured form) already exists and is the type gameplay code passes around. |
| Absolute turn vs duration | Convention is consistent and discoverable: `*UntilTurn` / `expiresOnTurn` are absolute; `turnsRemaining` is relative. Branding ~40 fields across `types.ts` would be high-cast-pressure for no demonstrated bug, and the audit's own note warns against one vague `TurnNumber` brand that still lets the two interchange. |
| Percent vs multiplier vs fraction | Naming already disambiguates (`retreatHealthPercent: 55`, `crisisSeverityMultiplier: 0.5`, `fadeMultiplier`). Branding every combat/economy coefficient is the "relocate mistakes into casts" failure mode. |
| `productionProgress` vs `productionCost` | Distinct local variables compared directly inside one function; no API takes both in adjacent same-typed positions. |
| `viewerId` vs `civId` vs hot-seat slot | Genuinely a trust boundary, but `state.currentPlayer` is already the hot-seat-safe viewer and there are 60+ `viewerId: string` query call sites. A brand would need pervasive casts. Protected today by the #1002 viewer-safety boundary rule + differential harness, and by keeping viewer projections viewer-scoped. Revisit only if a concrete leak is demonstrated. |
| Generic owner id vs major civ id | `classifyOwner`/`isMajorCivOwner` already give the truthful boundary at runtime; a `MajorCivId` brand would force casts of minor/pirate/beast/rebels/crisis ids, which the audit explicitly warns against. |

## Cast/construction audit

- `SensedUnits`: exactly one construction site, inside `campSensedUnits` in
  `barbarian-pressure.ts` (`as SensedUnits`). No other `as SensedUnits` in `src`.
- `EspionageModifierQuery` / `TurnCapturedSpyCommand`: no casts; they are
  structural object types. Construction happens only at real call sites.

## Enforcement

- Compile-time negative fixtures (`@ts-expect-error`) live in
  `tests/systems/barbarian-pressure.test.ts` and `tests/systems/espionage-system.test.ts`;
  they are enforced by `tsc` in `yarn build` (the tsconfig includes `tests/**`).
- The API-design rule that this audit's method generalizes lives in
  [`.claude/rules/caller-discipline.md`](../.claude/rules/caller-discipline.md)
  → "Ambiguous primitives".

## Adoption budget

Three focused structural changes, each with a negative type test and each with a
single sanctioned construction path. Everything else above is deliberately left
alone with a reason.
