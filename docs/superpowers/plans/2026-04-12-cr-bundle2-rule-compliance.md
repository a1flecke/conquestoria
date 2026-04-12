# Code Review Bundle 2 — Rule Compliance & UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Honour the CLAUDE.md rule that city-scoped UI must cycle through every city rather than `cities[0]`, and stop silently discarding city production queues when a legendary wonder build starts.

**Architecture:** Replace `cities[0]` shortcuts in advisor/council with full-iteration helpers that pick the *worst-off* or *most-relevant* city. For the wonder build, preserve any existing non-wonder queue entries by prepending the legendary marker and carrying progress, keeping queued items behind it.

**Tech Stack:** TypeScript, Vitest.

**Reference:** April 12 code review, issues 1 and 4. Baseline SHA: `9eae2dc` (or after Bundle 1 lands).

---

## Task 1: Advisor "empty production queue" check covers every city

**Files:**
- Test: `tests/ui/advisor-system.test.ts`
- Modify: `src/ui/advisor-system.ts:49-50`

- [ ] **Step 1: Write failing test**

Append to `tests/ui/advisor-system.test.ts`:

```typescript
it('flags empty-production-queue when any player city has an empty queue', () => {
  const state = makeAdvisorState({
    cities: [
      { id: 'c1', owner: 'player', productionQueue: ['warrior'] },
      { id: 'c2', owner: 'player', productionQueue: [] },
    ],
  });

  const triggered = ADVISOR_TRIGGERS.find(t => t.id === 'empty-production-queue');
  expect(triggered?.trigger(state)).toBe(true);
});
```

Use the existing `makeAdvisorState` / `ADVISOR_TRIGGERS` export patterns already in the file. If `makeAdvisorState` does not exist, inline a minimal state fixture.

- [ ] **Step 2: Run and verify fail**

Run: `yarn test tests/ui/advisor-system.test.ts -t "empty-production-queue"`
Expected: FAIL — current check only inspects `cities[0]`.

- [ ] **Step 3: Update the trigger**

In `src/ui/advisor-system.ts`, change lines 47-51 (the trigger whose body is `return cities.length > 0 && cities[0].productionQueue.length === 0;`) to:

```typescript
trigger: (state) => {
  const cities = Object.values(state.cities).filter(c => c.owner === state.currentPlayer);
  return cities.some(c => c.productionQueue.length === 0);
},
```

- [ ] **Step 4: Run the test**

Run: `yarn test tests/ui/advisor-system.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/ui/advisor-system.test.ts src/ui/advisor-system.ts
git commit -m "fix(m4-review): advisor empty-queue trigger scans all cities"
```

---

## Task 2: Council food card picks the hungriest city, not `cities[0]`

**Files:**
- Test: `tests/ui/council-panel.test.ts` (or `tests/systems/council-system.test.ts`)
- Modify: `src/systems/council-system.ts:11-14, :114-139`

- [ ] **Step 1: Locate the right test file**

Run: `grep -l "buildCouncilAgenda" tests/` to find where council-system tests live.

- [ ] **Step 2: Write failing test**

Append to that file (adapt imports/fixtures to match the file's style):

```typescript
it('food-warning card surfaces the hungriest player city, not just cities[0]', () => {
  const state = makeCouncilState({
    civId: 'player',
    cities: [
      { id: 'c1', population: 3, yields: { food: 3 } },  // breaking even
      { id: 'c2', population: 6, yields: { food: 1 } },  // starving
    ],
  });

  const agenda = buildCouncilAgenda(state, 'player');
  const foodCard = agenda.doNow.find(c => c.id === 'food-warning');

  expect(foodCard).toBeDefined();
  expect(foodCard?.title).toContain('c2');
});
```

If no `makeCouncilState` exists, construct the state object directly; the key is that two cities exist, one starving and one breaking even, and the starving one is NOT `cities[0]`.

- [ ] **Step 3: Run and verify fail**

Run: `yarn test -t "hungriest player city"`
Expected: FAIL — card references `c1` or is missing.

- [ ] **Step 4: Replace `getPrimaryCity` usage with hungriest-city logic**

In `src/systems/council-system.ts`, replace `getPrimaryCity` (lines 11-14) and the "food warning" block inside `buildCouncilAgenda` (lines 114-139) with:

```typescript
function findHungriestCity(
  state: GameState,
  civId: string,
  civBonus: ReturnType<typeof getCivDefinition>['bonusEffect'] | undefined,
): { city: GameState['cities'][string]; surplus: number } | undefined {
  const cityIds = state.civilizations[civId]?.cities ?? [];
  let worst: { city: GameState['cities'][string]; surplus: number } | undefined;
  for (const cityId of cityIds) {
    const city = state.cities[cityId];
    if (!city) continue;
    const yields = calculateCityYields(city, state.map, civBonus);
    const surplus = yields.food - city.population;
    if (!worst || surplus < worst.surplus) {
      worst = { city, surplus };
    }
  }
  return worst;
}
```

Then in `buildCouncilAgenda`, replace:

```typescript
const primaryCity = getPrimaryCity(state, civId);
const civBonus = getCivDefinition(state.civilizations[civId]?.civType ?? '')?.bonusEffect;
// ...
if (primaryCity) {
  const yields = calculateCityYields(primaryCity, state.map, civBonus);
  const foodSurplus = yields.food - primaryCity.population;
  // ... existing food-warning branches ...
}
```

with:

```typescript
const civBonus = getCivDefinition(state.civilizations[civId]?.civType ?? '')?.bonusEffect;
const hungriest = findHungriestCity(state, civId, civBonus);
if (hungriest) {
  const { city: targetCity, surplus: foodSurplus } = hungriest;
  const yieldsSummary = calculateCityYields(targetCity, state.map, civBonus);
  if (foodSurplus < 0) {
    doNow.unshift({
      id: 'food-warning',
      advisor: 'treasurer',
      bucket: 'do-now' as const,
      title: `Feed ${targetCity.name}`,
      summary: `${targetCity.name} is only making ${yieldsSummary.food} food for ${targetCity.population} citizens. ${getFoodRecommendation(targetCity)}`,
      why: 'Food keeps growth alive. If the pantry is flat, every future plan slows down.',
      priority: 95,
      actionLabel: 'Fix food',
    });
  } else if (foodSurplus === 0) {
    doNow.push({
      id: 'food-warning',
      advisor: 'treasurer',
      bucket: 'do-now' as const,
      title: `Keep ${targetCity.name} growing`,
      summary: `${targetCity.name} is breaking even on food. ${getFoodRecommendation(targetCity)}`,
      why: 'A city that only treads water stops feeling lively fast.',
      priority: 20,
      actionLabel: 'Add food',
    });
  }
}
```

Delete the now-unused `getPrimaryCity` helper.

- [ ] **Step 5: Run the test**

Run: `yarn test -t "hungriest player city"`
Expected: PASS.

- [ ] **Step 6: Run the full council test file to catch regressions**

Run: `yarn test tests/ui/council-panel.test.ts tests/systems/council-system.test.ts` (whichever exist)
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/systems/council-system.ts tests/ui/council-panel.test.ts tests/systems/council-system.test.ts
git commit -m "fix(m4-review): council food card picks the hungriest city"
```

---

## Task 3: `startLegendaryWonderBuild` preserves existing production queue

**Files:**
- Test: `tests/systems/legendary-wonder-system.test.ts`
- Modify: `src/systems/legendary-wonder-system.ts:653-675`

- [ ] **Step 1: Write failing test**

Append to `tests/systems/legendary-wonder-system.test.ts`:

```typescript
it('startLegendaryWonderBuild preserves queued items after the wonder marker', () => {
  const state = makeWonderReadyState({
    civId: 'player',
    cityId: 'c1',
    wonderId: 'TEST_WONDER',               // pick a real wonder id available in fixtures
    existingQueue: ['warrior', 'granary'],
  });

  const next = startLegendaryWonderBuild(state, 'player', 'c1', 'TEST_WONDER');

  const queue = next.cities['c1'].productionQueue;
  expect(queue[0]).toBe('legendary:TEST_WONDER');
  expect(queue).toContain('warrior');
  expect(queue).toContain('granary');
});
```

Replace `TEST_WONDER` with any real id from `getLegendaryWonderDefinitions()`. Adapt `makeWonderReadyState` to whatever helper the file already provides for seeded `ready_to_build` fixtures.

- [ ] **Step 2: Run and verify fail**

Run: `yarn test tests/systems/legendary-wonder-system.test.ts -t "preserves queued items"`
Expected: FAIL — queue is just `['legendary:TEST_WONDER']`.

- [ ] **Step 3: Preserve the existing queue**

In `src/systems/legendary-wonder-system.ts`, inside `startLegendaryWonderBuild`, replace the `cities:` field in the returned state (around lines 657-664) with:

```typescript
cities: city ? {
  ...seededState.cities,
  [cityId]: {
    ...city,
    productionQueue: [
      `legendary:${wonderId}`,
      ...city.productionQueue.filter(entry => entry !== `legendary:${wonderId}`),
    ],
    productionProgress: carriedProduction,
  },
} : state.cities,
```

- [ ] **Step 4: Run the test**

Run: `yarn test tests/systems/legendary-wonder-system.test.ts`
Expected: PASS, and no existing tests broken (any test that explicitly asserted a single-element queue needs updating to allow the preserved tail — adjust those tests to assert only on index 0 being the legendary marker).

- [ ] **Step 5: Commit**

```bash
git add src/systems/legendary-wonder-system.ts tests/systems/legendary-wonder-system.test.ts
git commit -m "fix(m4-review): preserve production queue when starting legendary wonder"
```

---

## Task 4: Bundle verification

- [ ] **Step 1: Full suite**

Run: `yarn test`
Expected: All green.

- [ ] **Step 2: Build smoke**

Run: `yarn build`
Expected: Success.

- [ ] **Step 3: Commit any verification follow-ups**

```bash
git add -p
git commit -m "fix(m4-review): bundle 2 verification follow-ups"
```

---

**Done when:** all tasks green, food card targets the hungriest city, wonder build preserves queued items.
