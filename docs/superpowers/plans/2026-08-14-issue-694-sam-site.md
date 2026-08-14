# SAM Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the #694 SAM Site building with exact conjunctive gates and canonical +12, radius-two air-defense coverage.

**Architecture:** `BUILDINGS.sam_site` will be the sole source of its production gates and typed air-defense capability. Existing `getAvailableBuildings`, generic AI candidate generation, `resolveAirDefenseCoverage`, combat presentation, and the overlay consume that definition; #695 exclusively owns Radar Station operational-state behavior.

**Tech Stack:** TypeScript, Vitest, existing Canvas building-sprite catalog.

---

### Task 1: Establish the SAM Site behavior with failing system tests

**Files:**
- Modify: `tests/systems/city-system.test.ts`
- Modify: `tests/systems/air-defense-system.test.ts`
- Modify: `tests/ai/ai-production.test.ts`

- [ ] **Step 1: Write failing production-eligibility tests**

Add a `getAvailableBuildings` case which uses an otherwise eligible city and asserts:

```ts
expect(getAvailableBuildings(city, ['radar-systems', 'rocketry'], map)
  .some(building => building.id === 'sam_site')).toBe(false);
expect(getAvailableBuildings({ ...city, buildings: ['anti_air_battery', 'radar_station'] }, ['radar-systems'], map)
  .some(building => building.id === 'sam_site')).toBe(false);
expect(getAvailableBuildings({ ...city, buildings: ['anti_air_battery', 'radar_station'] }, ['rocketry'], map)
  .some(building => building.id === 'sam_site')).toBe(false);
expect(getAvailableBuildings({ ...city, buildings: ['anti_air_battery', 'radar_station'] }, ['radar-systems', 'rocketry'], map)
  .some(building => building.id === 'sam_site')).toBe(true);
```

In the same test, prove a new city with the technologies can still build `anti_air_battery`.

- [ ] **Step 2: Run the eligibility test and confirm red**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts`

Expected: FAIL because `sam_site` is absent from the building catalog.

- [ ] **Step 3: Write failing coverage and visibility tests**

Extend the air-defense fixture with a city holding `anti_air_battery`, `radar_station`, and `sam_site`. Assert a friendly land defender at hex distance two receives +12, a defender at distance three receives no SAM coverage, and the known-provider list exposes SAM only to the owner or a viewer with visible provider tile. Assert the existing battery is reported as `superseded`, never summed to +20.

- [ ] **Step 4: Run the air-defense test and confirm red**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-defense-system.test.ts`

Expected: FAIL because no SAM provider is available.

- [ ] **Step 5: Write failing catalog-driven AI tests**

Use `generateAIProductionCandidates` with an AI-owned city holding both prerequisite buildings. Assert it includes `sam_site` only with both technologies; repeat for Explorer, Standard, and Veteran state settings and assert identical candidate legality. Assert a different owner’s unseen city buildings do not make the candidate available.

- [ ] **Step 6: Run the AI test and confirm red**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts`

Expected: FAIL because `sam_site` is absent.

### Task 2: Add the catalog data and temporary presentation fallback

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/tech-definitions-eras10.ts`
- Modify: `src/renderer/sprites/sprite-catalog.ts`

- [ ] **Step 1: Add the exact building definition**

Add this Era-10 military building next to `radar_station`:

```ts
sam_site: {
  id: 'sam_site', name: 'SAM Site', category: 'military',
  yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 195,
  description: 'Surface-to-Air Missile (SAM) site. Friendly defenders within 2 hexes gain +12 defense strength against air attacks.',
  techRequired: 'radar-systems', requiredTechs: ['rocketry'],
  requiresBuildings: ['anti_air_battery', 'radar_station'],
  airDefenseProvider: { radius: 2, defenseModifier: 12, stackingGroup: 'ground-air-defense' },
},
```

- [ ] **Step 2: Update both technology records**

Append `sam_site` only to `radar-systems.unlocksBuildings`, because the current
tech-integrity contract requires each structured building unlock to equal that building's
single `techRequired`. Revise both technology descriptions to say SAM Site also requires
the other technology; `requiredTechs: ['rocketry']` remains the authoritative second gate.

- [ ] **Step 3: Add temporary renderer coverage**

Map `sam_site` to `RadarStationSprite` in `BUILDING_SPRITE_CATALOG`, with a comment that #710 owns the bespoke air-defense asset. Do not add a new sprite component in this mechanics delivery.

- [ ] **Step 4: Run focused tests and confirm green**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/air-defense-system.test.ts tests/ai/ai-production.test.ts`

Expected: PASS, including the new regression tests.

### Task 3: Verify the #694 slice

**Files:**
- Verify: `src/systems/city-system.ts`
- Verify: `src/systems/tech-definitions-eras10.ts`
- Verify: `src/renderer/sprites/sprite-catalog.ts`

- [ ] **Step 1: Run source-rule checks**

Run: `scripts/check-src-rule-violations.sh src/systems/city-system.ts src/systems/tech-definitions-eras10.ts src/renderer/sprites/sprite-catalog.ts`

Expected: no reported violations.

- [ ] **Step 2: Inspect the deliverable**

Run: `git diff --check origin/main...HEAD` and `git diff origin/main...HEAD`.

Expected: only the documented #694 catalog, test, and temporary-fallback changes; no Radar operational-state change, no save migration, and no bespoke combat ID branch.

- [ ] **Step 3: Commit the implementation**

Run: `git add src/systems/city-system.ts src/systems/tech-definitions-eras10.ts src/renderer/sprites/sprite-catalog.ts tests/systems/city-system.test.ts tests/systems/air-defense-system.test.ts tests/ai/ai-production.test.ts && git commit -m "feat(694): add SAM Site air defense"`

Expected: one focused implementation commit after all focused tests pass.
