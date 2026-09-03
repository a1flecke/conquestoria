# War-Weariness and Occupation Relief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Military Administration as a bounded, city-local paid counter to war-weariness and recent-conquest unrest, with AI parity, truthful guidance, and additive save behavior.

**Architecture:** Add building data plus target-row metadata to `UNREST_RELIEF_SOURCES`. Shared faction calculations drive AI valuation, research, guidance, and city-panel rendering. The building is an ordinary `city.buildings` entry, so no schema migration or new policy state exists.

**Tech Stack:** TypeScript, Vitest, event bus, city-panel DOM.

---

## File map

- `src/systems/city-system.ts`, `src/systems/tech-definitions-eras1-4.ts`, and `.claude/rules/game-balance.md`: catalog, Civil Service unlock, icon, cost, and documented ceiling.
- `src/systems/faction-system.ts`: typed target-row metadata and canonical `Military Administration` negative row.
- `src/ai/ai-research.ts`: generic target-row pressure detection; production already reads `UNREST_RELIEF_SOURCES` generically.
- `src/systems/unrest-guidance.ts` and `src/ui/unrest-guidance-copy.ts`: eligibility and player text.
- `tests/systems/{faction-system,faction-happiness,city-system,tech-unlocks-consistency,unrest-guidance,economy-system,pacing-model}.test.ts`, `tests/ai/{ai-production,ai-research}.test.ts`, `tests/ui/city-panel.test.ts`, `tests/storage/save-migrations.test.ts`: focused regression proof.

## Player Truth Table

| Before | Action | Internal state | Immediate visual result |
|---|---|---|---|
| Eligible city has target pressure | Queue building | Queue gains `military-administration` | Active item name and ETA render. |
| Production-locked, active building, 113+ gold | Click Buy now | Shared rush buy completes ordinary building | Same panel rerenders with `Military Administration −…`. |
| Locked but no gold/high strain | Inspect active purchase | Queue persists; quote rejects purchase | Existing disabled reason plus truthful peace/wait fallback. |
| No target pressure | Open city panel | Source inactive | No zero row or recommendation; full build catalog reachable. |

## Misleading UI Risks and replay checklist

- `build-military-administration` must use the same `getAvailableBuildings` eligibility as the production list: never before Civil Service, after completion, or without a target row.
- A queue under a production lock is not an instant cure; only the existing affordable rush-buy control is immediate.
- When unavailable, preserve Make peace and settle/Constitutional Law advice.
- Test: queue → rerender → locked-city rush buy → same-panel row; repeat for insufficient gold/high strain; verify a calm city has no recommendation but can browse the catalog.

### Task 1: Catalog and faction calculation

**Files:** Modify `src/systems/city-system.ts:80-83`, `src/systems/tech-definitions-eras1-4.ts:48`, `src/systems/faction-system.ts:55-103`, `.claude/rules/game-balance.md:81-108`; test `tests/systems/faction-system.test.ts:1223-1366`, `tests/systems/city-system.test.ts:1539-1548`, `tests/systems/tech-unlocks-consistency.test.ts:79-89`, `tests/systems/pacing-model.test.ts:226-230`.

- [ ] **Step 1: Write failing catalog and formula tests.**

```ts
expect(BUILDINGS['military-administration']).toMatchObject({
  category: 'culture', productionCost: 45, techRequired: 'civil-service',
  yields: { food: 0, production: 0, gold: 0, science: 0 },
});
expect(PRODUCTION_ICONS['military-administration']).toBe('🛡️');
expect(TECH_TREE.find(t => t.id === 'civil-service')?.unlocksBuildings).toContain('military-administration');
const rows = getUnrestPressureBreakdown('city-1', addBuilding(makeState({ conquestTurn: 0, atWarCount: 3 }), 'city-1', 'military-administration'));
expect(rows.find(row => row.label === 'Military Administration')?.amount).toBe(-18);
```

Add a negative one-war + Constitutional Law case: `-9` relief leaves 12 target pressure.

- [ ] **Step 2: Run red.** Run `./scripts/run-with-mise.sh yarn test --run tests/systems/faction-system.test.ts tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts`; expect missing catalog/source failures.

- [ ] **Step 3: Implement the minimal table entry.**

```ts
export interface UnrestReliefSource {
  id: string;
  targetRowLabels: readonly string[];
  isActive(city: City, state: GameState): boolean;
  reliefRows(city: City, state: GameState, positiveRows: UnrestPressureRow[]): UnrestPressureRow[];
}
const MILITARY_ADMINISTRATION_RELIEF: UnrestReliefSource = {
  id: 'military-administration', targetRowLabels: ['War weariness', 'Recent conquest'],
  isActive: city => city.buildings.includes('military-administration'),
  reliefRows: (_city, _state, rows) => {
    const war = rows.find(row => row.label === 'War weariness')?.amount ?? 0;
    const conquest = rows.find(row => row.label === 'Recent conquest')?.amount ?? 0;
    const relief = Math.min(8, Math.max(0, war - 4)) + Math.min(10, Math.max(0, conquest - 8));
    return relief > 0 ? [{ label: 'Military Administration', amount: -relief }] : [];
  },
};
```

Add Courthouse labels, exact catalog/icon data, Civil Service effect text, and the inventory formula/`-18` ceiling.

- [ ] **Step 4: Run green and commit.** Run `./scripts/run-with-mise.sh yarn test --run tests/systems/faction-system.test.ts tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/pacing-model.test.ts`; expect PASS. Commit with `git add src/systems/faction-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras1-4.ts .claude/rules/game-balance.md tests/systems/faction-system.test.ts tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/pacing-model.test.ts && git commit -m "feat(unrest): add military administration relief"`.

### Task 2: Generic AI production and research

**Files:** Modify `src/ai/ai-research.ts:22-25,67-91,330-350`; test `tests/ai/ai-production.test.ts:853-930`, `tests/ai/ai-research.test.ts:320-395`.

- [ ] **Step 1: Write failing AI tests.** Assert the eligible building candidate has a positive `unrestReliefScore` for real war/conquest pressure on Explorer, Standard, and Veteran. Extend the existing state-derived research fixture: two pressured cities pull Civil Service within three choices, calm cities do not.

- [ ] **Step 2: Run red.** Run `./scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts`; expect failure because `COURTHOUSE_ADDRESSABLE_ROWS` excludes both new target rows.

- [ ] **Step 3: Replace the named row set with metadata.**

```ts
const UNREST_RELIEF_ADDRESSABLE_ROWS = new Set(UNREST_RELIEF_SOURCES.flatMap(source => source.targetRowLabels));
function cityHasReliefAddressablePressure(cityId: string, state: GameState, civId: string): boolean {
  return getUnrestPressureBreakdown(cityId, state, getCivHappinessFromResources(state, civId))
    .some(row => row.amount > 0 && UNREST_RELIEF_ADDRESSABLE_ROWS.has(row.label));
}
```

Keep the existing two-city gate and `6 + 1.5 × count`, capped at 18. Add no building-ID or difficulty branch.

- [ ] **Step 4: Run green and commit.** Run `./scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts`; expect PASS. Commit with `git add src/ai/ai-research.ts tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts && git commit -m "feat(ai): value war and conquest unrest relief"`.

### Task 3: Guidance, copy, and locked-city rush buy

**Files:** Modify `src/systems/unrest-guidance.ts:23-29,49-69,118-146`, `src/ui/unrest-guidance-copy.ts:19-29`; test `tests/systems/unrest-guidance.test.ts:177-207,239-270`, `tests/ui/city-panel.test.ts:967-1015,2584-2695`, `tests/systems/economy-system.test.ts:260-350`.

- [ ] **Step 1: Write failing system and DOM tests.** With Civil Service, one war, and fresh conquest, assert one `build-military-administration` recommendation. Without Civil Service, assert it is absent while Make peace and wait/Constitutional Law remain. In a level-2 unrest city with 113 gold and active building, click `[data-rush-buy]` and assert the same panel contains `Military Administration`; add insufficient-gold and high-strain disabled-reason cases.

- [ ] **Step 2: Run red.** Run `./scripts/run-with-mise.sh yarn test --run tests/systems/unrest-guidance.test.ts tests/ui/city-panel.test.ts tests/systems/economy-system.test.ts`; expect missing kind/copy/rerender failures.

- [ ] **Step 3: Extract shared availability and add ordered resolvers.**

```ts
function buildingBuildableHere(buildingId: string, state: GameState, city: City): boolean {
  const civ = state.civilizations[city.owner];
  if (!civ || city.buildings.includes(buildingId)) return false;
  const era = resolveCivilizationEra(civ.techState.completed);
  return getAvailableBuildings(city, civ.techState.completed, state.map,
    getCivAvailableResources(state, city.owner), era, undefined, city.owner)
    .some(building => building.id === buildingId);
}
```

Use it for Courthouse and the new building. Add the recommendation kind and plain city-scoped copy. Prefer it only while buildable; otherwise preserve existing fallback ordering. Do not add a custom event, audio event, or durable UI state: shared rush-buy already completes and rerenders ordinary buildings.

- [ ] **Step 4: Run green and commit.** Run `./scripts/run-with-mise.sh yarn test --run tests/systems/unrest-guidance.test.ts tests/ui/city-panel.test.ts tests/systems/economy-system.test.ts`; expect PASS. Commit with `git add src/systems/unrest-guidance.ts src/ui/unrest-guidance-copy.ts tests/systems/unrest-guidance.test.ts tests/ui/city-panel.test.ts tests/systems/economy-system.test.ts && git commit -m "feat(ui): guide military administration relief"`.

### Task 4: Escalation, hot-seat, save, pacing, and final proof

**Files:** Modify `tests/systems/faction-system.test.ts:522-588,1307-1366`, `tests/systems/faction-happiness.test.ts:170-184`, `tests/storage/save-migrations.test.ts:258-302`; verify `tests/systems/helpers/pacing-reference-economy.ts:24-53`.

- [ ] **Step 1: Write failing integration tests.** Prove a war/conquest fixture has a lower real `processFactionTurn` escalation result with the building. Rehome it to player two, switch `currentPlayer`, and assert the relief row is unchanged. Load a current-schema legacy-shaped save containing the building and assert `migrateSaveToCurrent` is idempotent.

- [ ] **Step 2: Run red.** Run `./scripts/run-with-mise.sh yarn test --run tests/systems/faction-system.test.ts tests/systems/faction-happiness.test.ts tests/storage/save-migrations.test.ts`; expect only newly added feature assertions to fail until the prior tasks land.

- [ ] **Step 3: Keep integration additive.** Do not add migration/schema, turn-manager, or audio code. Confirm reference-economy exclusion follows `UNREST_RELIEF_SOURCES` with no hardcoded duplicate.

- [ ] **Step 4: Run targeted verification.** Run `scripts/check-src-rule-violations.sh src/systems/faction-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras1-4.ts src/ai/ai-research.ts src/systems/unrest-guidance.ts src/ui/unrest-guidance-copy.ts`; expect no violations. Then run `./scripts/run-with-mise.sh yarn test --run tests/systems/faction-system.test.ts tests/systems/faction-happiness.test.ts tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/unrest-guidance.test.ts tests/systems/economy-system.test.ts tests/systems/pacing-model.test.ts tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts tests/ui/city-panel.test.ts tests/storage/save-migrations.test.ts`; expect PASS.

- [ ] **Step 5: Build and capture durable evidence.** Run `./scripts/run-with-mise.sh yarn build`, then `./scripts/run-with-mise.sh yarn test:durable`, then `./scripts/run-with-mise.sh yarn test:durable:status`; expect build exit 0 and a durable PASS tied to current `HEAD`/working tree. Inspect `git status --short --branch`, `git diff --check`, `git diff --stat origin/main...HEAD`, `git diff --stat`, `git diff origin/main...HEAD`, and `git diff` before final reporting.

## Plan self-review

- Tasks cover exact catalog data, arithmetic floors/ceiling, generic AI parity, actionable guidance, same-panel refresh, disabled purchase truthfulness, solo/hot-seat ownership, additive save behavior, and pacing.
- The UI truth table, semantic negative cases, and interaction replay checklist prevent a state-only implementation from misleading players.
- No stance/policy state, bespoke SFX, save migration, or difficulty-specific mechanic is introduced.
