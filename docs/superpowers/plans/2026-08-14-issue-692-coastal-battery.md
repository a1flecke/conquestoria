# Coastal Battery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver #692’s Naval Armor-gated Coastal Battery with naval-only city defense and once-per-city-per-turn deterministic counterfire.

**Architecture:** Put build eligibility in the existing `BUILDINGS`/`getAvailableBuildings` path, put the +8 fact in `getCityDefenseBreakdown`, and put the stateful retaliation in a new pure `coastal-defense-system`. Call the resolver only after shared city-siege damage is known, persist its city-local turn marker, and deliver a recipient-explicit event through the existing presentation boundary.

**Tech Stack:** TypeScript, Vitest, Canvas/DOM city panel, serializable `GameState`, event bus, Vite.

---

## File map

- `src/core/types.ts`: City turn marker and recipient-safe Battery event payload.
- `src/systems/city-system.ts`: building definition; existing coastal eligibility and production dequeue path consume it without an ID branch.
- `src/systems/tech-definitions-eras8.ts`: Naval Armor unlock registration.
- `src/systems/combat-system.ts`: named +8 naval defense fact.
- `src/systems/coastal-defense-system.ts`: pure eligibility, damage calculation, immutable state application, and event payload.
- `src/core/turn-manager.ts`, `src/systems/pirate-system.ts`, `src/systems/city-capture-system.ts`: mutation callers pass actual `CitySiegeResult.hpLost` to the shared resolver.
- `src/storage/save-migrations.ts`: additive, idempotent city-marker normalization.
- `src/presentation/register-raider-presentation.ts`: owner-recipient event delivery.
- Tests mirror each changed module; city panel and AI catalog tests prove the player-facing and computer-player paths.

## Player Truth Table

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Coastal city, Naval Armor complete | Open Build | Coastal Battery is listed at 170 production with its exact naval-only rule. |
| Inland city, Naval Armor complete | Open Build | Coastal Battery is absent; it cannot enter the queue. |
| Battery city, first damaging naval siege this turn | Resolve attack | City takes mitigated damage; attacker takes `min(12, round(hpLost * .20))`; owner receives one Battery notice. |
| Same city, second naval siege this turn | Resolve attack | No second Battery damage or notice. |
| Different Battery city or next global turn | Resolve first naval siege | That city’s Battery can fire once. |
| Land/air attack, or naval zero-damage/block | Resolve attack | No Battery defense part outside naval and no retaliation marker/event. |

## Misleading UI Risks

- “Naval defense +8” must not appear as general city defense; its displayed label includes “against naval attacks”.
- A player must not see a buildable Battery in a landlocked city; use the existing `coastalRequired` eligibility and production-dequeue guard.
- A notification must not suggest every naval hit retaliates; say “first naval hit this turn”.
- The city panel remains the complete build catalog; do not hide other unlocked military buildings while surfacing Battery.

## Interaction Replay Checklist

- Open a Naval Armor coastal city and find Battery in Build.
- Build Battery, rerender the still-open city panel, and assert its name/rule text appears immediately.
- Reopen an inland city and assert Battery is unavailable.
- Resolve first naval hit, repeat the hit in the same turn, then advance a turn and hit again.
- Repeat on a second Battery city and verify independent state.
- Switch `currentPlayer` between two human owners and assert delivery stays with the city owner.

## Approved execution expansion — real player and major-AI naval bombardment

The #692 parity audit found that naval units advertise city targets, but the player and major-AI executors only resolve unit combat/capture. The user explicitly approved completing this now so Coastal Battery is never a player-reachable partial feature.

- Introduce one shared naval-bombardment mutation for human and major-AI warships. It validates a visible hostile city target through existing targeting rules, uses `round(attacker strength × current-health fraction × 0.40)` as bounded raw siege damage, resolves the existing naval-defense formula, applies Battery counterfire from the resulting `hpLost`, and consumes the ship's action.
- Naval bombardment cannot capture, sack, or destroy a city; it leaves an otherwise lethal city at 1 HP for a land capture. This preserves #522's explicit single-exchange land-capture contract and prevents an offshore unit from bypassing occupation/capture choice.
- Add one recipient-explicit `city:naval-bombarded` event. Presentation uses it only to notify the city owner; the actor's ordinary local feedback stays in the existing action flow. The Battery event remains distinct.
- Add an AI `bombard-city` tactical action. It can target only a visible hostile city with no hostile unit occupying the city tile, uses the same shared mutation, and scores from legal observed state. It must not derive target information from hidden cities or units.

### Task 1: Add the buildable, coastal-gated content entry

**Files:**
- Modify: `src/systems/city-system.ts: BUILDINGS military section`
- Modify: `src/systems/tech-definitions-eras8.ts: naval-armor`
- Test: `tests/systems/city-system.test.ts`
- Test: `tests/systems/tech-unlocks-consistency.test.ts`

- [ ] **Step 1: Write failing catalog tests.**

```ts
expect(getAvailableBuildings(coastalCity, ['naval-armor'], coastalMap))
  .toContainEqual(expect.objectContaining({ id: 'coastal_battery', productionCost: 170 }));
expect(getAvailableBuildings(inlandCity, ['naval-armor'], inlandMap)
  .map(building => building.id)).not.toContain('coastal_battery');
```

- [ ] **Step 2: Run the focused tests and confirm Battery is absent.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts`

Expected: failing assertion because `coastal_battery` is not yet defined/unlocked.

- [ ] **Step 3: Add the typed definition and tech registration.**

```ts
coastal_battery: {
  id: 'coastal_battery', name: 'Coastal Battery', category: 'military',
  yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 170,
  description: 'Naval defense +8. First naval hit each turn returns 20% damage (max 12).',
  techRequired: 'naval-armor', coastalRequired: true,
},
// Naval Armor: unlocksBuildings: ['coastal_battery']
```

- [ ] **Step 4: Add a production-queue regression.**

```ts
const result = processCity(inlandCityQueuedWithBattery, ownerCiv, inlandMap, options);
expect(result.droppedProductionItems).toContainEqual({
  itemId: 'coastal_battery', itemKind: 'building', reason: 'coastal-access-lost',
});
```

- [ ] **Step 5: Run focused tests and commit.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts`

Expected: PASS.

Commit: `git commit -am "feat(coastal): add Battery production entry"`

### Task 2: Make the +8 defense fact naval-only and preview-visible

**Files:**
- Modify: `src/systems/combat-system.ts: getCityDefenseBreakdown`
- Test: `tests/systems/city-defense.test.ts`
- Test: `tests/systems/city-siege-system.test.ts`
- Test: `tests/ui/combat-preview.test.ts`

- [ ] **Step 1: Write failing naval/land/air breakdown tests.**

```ts
expect(getCityDefenseBreakdown({ cityBuildings: ['coastal_battery'], defenderCompletedTechs: [], attackerDomain: 'naval' }))
  .toMatchObject({ flatBonus: 8, parts: [expect.objectContaining({ source: 'coastal_battery' })] });
expect(getCityDefenseBreakdown({ cityBuildings: ['coastal_battery'], defenderCompletedTechs: [], attackerDomain: 'land' }).flatBonus).toBe(0);
expect(getCityDefenseBreakdown({ cityBuildings: ['coastal_battery'], defenderCompletedTechs: [], attackerDomain: 'air' }).flatBonus).toBe(0);
```

- [ ] **Step 2: Run them and confirm the Battery fact is missing.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/city-defense.test.ts tests/systems/city-siege-system.test.ts tests/ui/combat-preview.test.ts`

Expected: FAIL on the naval flat-defense assertion.

- [ ] **Step 3: Add one named naval-domain part.**

```ts
if (input.attackerDomain === 'naval' && input.cityBuildings.includes('coastal_battery')) {
  flatBonus += 8;
  parts.push({ source: 'coastal_battery', label: 'Coastal Battery +8 vs naval', kind: 'flat', value: 8 });
}
```

- [ ] **Step 4: Assert the live city intrinsic strength and combat preview both retain that named part.**

```ts
expect(getCityIntrinsicStrength(cityWithBattery, owner, 'naval'))
  .toBeCloseTo(getCityIntrinsicStrength(cityWithoutBattery, owner, 'naval') + 8, 5);
expect(renderedPreviewText).toContain('Coastal Battery +8 vs naval');
```

- [ ] **Step 5: Run focused tests and commit.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/city-defense.test.ts tests/systems/city-siege-system.test.ts tests/ui/combat-preview.test.ts`

Expected: PASS.

Commit: `git commit -am "feat(coastal): apply naval-only city defense"`

### Task 3: Implement deterministic, persisted Battery counterfire

**Files:**
- Modify: `src/core/types.ts: City and GameEventMap`
- Create: `src/systems/coastal-defense-system.ts`
- Modify: `src/storage/save-migrations.ts: CURRENT_SAVE_SCHEMA_VERSION, migration map, normalization chain`
- Test: `tests/systems/coastal-defense-system.test.ts`
- Test: `tests/storage/save-migrations-v13.test.ts`

- [ ] **Step 1: Write failing resolver tests.**

```ts
const fired = resolveCoastalBatteryCounterfire(state, {
  cityId: 'port', attackerUnitId: 'ship', attackerDomain: 'naval', cityDamage: 40, source: 'pirate',
});
expect(fired.damage).toBe(8);
expect(fired.state.cities.port.coastalBatteryCounterfireTurn).toBe(state.turn);
expect(fired.event).toMatchObject({ recipientCivId: state.cities.port.owner, source: 'pirate' });

expect(resolveCoastalBatteryCounterfire(fired.state, { ...input, cityDamage: 60 }).damage).toBe(0);
expect(resolveCoastalBatteryCounterfire(state, { ...input, attackerDomain: 'land' }).damage).toBe(0);
expect(resolveCoastalBatteryCounterfire(state, { ...input, cityDamage: 0 }).damage).toBe(0);
```

- [ ] **Step 2: Run the new test and confirm it fails because the module does not exist.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/coastal-defense-system.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Define the serializable state and pure resolver.**

```ts
export type CoastalBatterySource = 'player' | 'ai' | 'barbarian' | 'pirate';
export interface CoastalBatteryCounterfireEvent {
  cityId: string; attackerUnitId: string; recipientCivId: string;
  source: CoastalBatterySource; damage: number; attackerDied: boolean;
}
export function resolveCoastalBatteryCounterfire(
  state: GameState, input: CoastalBatteryCounterfireInput,
): CoastalBatteryCounterfireResult {
  // return unchanged state/no event unless Battery, naval, positive CitySiegeResult.hpLost,
  // live attacker, and city.coastalBatteryCounterfireTurn !== state.turn.
  // apply min(12, Math.round(input.cityDamage * 0.2)) immutably, then record the turn.
}
```

- [ ] **Step 4: Add schema-13 migration and additive normalization.**

```ts
function normalizeCoastalBatteryCounterfireTurns(state: GameState): GameState {
  // retain only finite integer city markers; omit any malformed marker without changing valid ones.
}
// CURRENT_SAVE_SCHEMA_VERSION = 13; SAVE_MIGRATIONS[13] = normalizeCoastalBatteryCounterfireTurns
// also call the normalizer after every migration for current-schema malformed saves.
```

- [ ] **Step 5: Add save tests.**

```ts
expect(migrateSaveToCurrent(legacyWithoutMarker).cities.port.coastalBatteryCounterfireTurn).toBeUndefined();
expect(migrateSaveToCurrent(malformedMarker).cities.port.coastalBatteryCounterfireTurn).toBeUndefined();
expect(migrateSaveToCurrent(midTurnMarker).cities.port.coastalBatteryCounterfireTurn).toBe(42);
expect(migrateSaveToCurrent(migrateSaveToCurrent(midTurnMarker))).toEqual(migrateSaveToCurrent(midTurnMarker));
```

- [ ] **Step 6: Run system/storage tests and commit.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/coastal-defense-system.test.ts tests/storage/save-migrations-v13.test.ts tests/storage/save-migrations.test.ts`

Expected: PASS.

Commit: `git commit -am "feat(coastal): add bounded Battery counterfire"`

### Task 4: Wire all actual naval siege mutation paths and owner-safe presentation

**Files:**
- Modify: `src/systems/pirate-system.ts: completed-round naval siege`
- Modify: `src/core/turn-manager.ts: any naval city siege order path`
- Modify: `src/systems/city-capture-system.ts: city-assault path when attacker domain is naval`
- Modify: `src/presentation/register-raider-presentation.ts`
- Test: `tests/systems/pirate-system.test.ts`
- Test: `tests/core/turn-manager.test.ts`
- Test: `tests/systems/city-capture-system.test.ts`
- Test: `tests/presentation/register-raider-presentation.test.ts`

- [ ] **Step 1: Write integration tests that spy on the new event.**

```ts
bus.on('city:coastal-battery-fired', onBattery);
processPiratesForCompletedRound(batterySiegeState, bus);
expect(onBattery).toHaveBeenCalledWith(expect.objectContaining({ source: 'pirate', recipientCivId: 'player' }));
expect(attackerAfter.health).toBe(attackerBefore.health - Math.min(12, Math.round(cityHpLost * .2)));
```

- [ ] **Step 2: Add parity/negative cases before wiring.**

```ts
expect(secondSameTurnEvent).not.toHaveBeenCalled();
expect(landSiegeBatteryEvent).not.toHaveBeenCalled();
expect(airSiegeBatteryEvent).not.toHaveBeenCalled();
expect(barbarianAndMajorAiEventSources).toEqual(expect.arrayContaining(['barbarian', 'ai']));
```

- [ ] **Step 3: Run tests and confirm the Battery event is absent.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-system.test.ts tests/core/turn-manager.test.ts tests/systems/city-capture-system.test.ts tests/presentation/register-raider-presentation.test.ts`

Expected: FAIL because callers do not yet invoke the resolver.

- [ ] **Step 4: Wire immediately after `resolveCitySiegeDamage` and before applying its outcome.**

```ts
const siege = resolveCitySiegeDamage(input);
const battery = resolveCoastalBatteryCounterfire(nextState, {
  cityId, attackerUnitId, attackerDomain: 'naval', cityDamage: siege.hpLost, source,
});
nextState = battery.state;
nextState = applyCitySiegeOutcome(nextState, cityId, siege);
if (battery.event) bus.emit('city:coastal-battery-fired', battery.event);
```

This ordering lets an eligible Battery fire from the pre-destruction city snapshot using the exact resolved `hpLost`; the outcome application then preserves the recorded marker if the city survives and naturally removes it if the city is destroyed. Never call this for land/air orders or from existing `city:counter-fire`; preserve existing walls behavior unchanged.

- [ ] **Step 5: Deliver only to the explicit owner recipient.**

```ts
bus.on('city:coastal-battery-fired', ({ cityId, recipientCivId, damage, attackerDied }) => {
  if (!ctx.session.getState().civilizations[recipientCivId]?.isHuman) return;
  ctx.notifier.deliver(recipientCivId, batteryMessage(cityId, damage, attackerDied), attackerDied ? 'success' : 'info');
});
```

- [ ] **Step 6: Run integration tests and commit.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/pirate-system.test.ts tests/core/turn-manager.test.ts tests/systems/city-capture-system.test.ts tests/presentation/register-raider-presentation.test.ts`

Expected: PASS.

Commit: `git commit -am "feat(coastal): wire city Battery retaliation"`

### Task 5: Prove player UI, AI catalog, difficulty, and hot-seat behavior

**Files:**
- Test: `tests/ui/city-panel.test.ts`
- Test: `tests/ai/ai-production.test.ts`
- Test: `tests/presentation/register-raider-presentation.test.ts`
- Test: `tests/simulation/ai-playability-fixture.ts` if the existing coastal scenario can host a Battery assertion

- [ ] **Step 1: Add rendered-DOM city-panel tests.**

```ts
expect(collectText(createCityPanel(container, coastalCity, state, callbacks)))
  .toContain('Naval defense +8. First naval hit each turn returns 20% damage (max 12).');
expect(collectText(createCityPanel(inlandContainer, inlandCity, state, callbacks)))
  .not.toContain('Coastal Battery');
```

- [ ] **Step 2: Add generic AI-candidate coverage.**

```ts
expect(generateProductionCandidates(coastalAiState, aiId, coastalCity.id, demands)
  .map(candidate => candidate.itemId)).toContain('coastal_battery');
expect(generateProductionCandidates(inlandAiState, aiId, inlandCity.id, demands)
  .map(candidate => candidate.itemId)).not.toContain('coastal_battery');
```

- [ ] **Step 3: Add difficulty and hot-seat regressions.**

```ts
for (const challenge of ['explorer', 'standard', 'veteran'] as const) {
  expect(resolveCoastalBatteryCounterfire(fixture(challenge), input).damage).toBe(8);
}
expect(deliver).toHaveBeenCalledWith(city.owner, expect.stringContaining('Coastal Battery'), expect.any(String));
expect(deliver).not.toHaveBeenCalledWith(otherHumanId, expect.anything(), expect.anything());
```

- [ ] **Step 4: Run focused UI/AI/presentation tests and commit.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts tests/ai/ai-production.test.ts tests/presentation/register-raider-presentation.test.ts`

Expected: PASS.

Commit: `git commit -am "test(coastal): cover UI AI and hot-seat parity"`

### Task 6: Final review and verification

**Files:** Review all changed files and `docs/superpowers/specs/2026-08-14-issue-692-coastal-battery-design.md`.

- [ ] **Step 1: Run source-rule checks and focused suite.**

Run: `scripts/check-src-rule-violations.sh src/core/types.ts src/systems/city-system.ts src/systems/combat-system.ts src/systems/coastal-defense-system.ts src/storage/save-migrations.ts src/systems/pirate-system.ts src/core/turn-manager.ts src/systems/city-capture-system.ts src/presentation/register-raider-presentation.ts`

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/coastal-defense-system.test.ts tests/systems/city-system.test.ts tests/systems/city-defense.test.ts tests/systems/city-siege-system.test.ts tests/storage/save-migrations-v13.test.ts tests/systems/pirate-system.test.ts tests/core/turn-manager.test.ts tests/systems/city-capture-system.test.ts tests/ui/city-panel.test.ts tests/ai/ai-production.test.ts tests/presentation/register-raider-presentation.test.ts`

Expected: PASS.

- [ ] **Step 2: Rebase and review drift before PR.**

Run: `git fetch origin`, then `git rebase origin/main`, then inspect `git diff --check`, `git diff --stat origin/main...HEAD`, `git diff --stat`, and the full committed/uncommitted diff.

- [ ] **Step 3: Run release verification.**

Run separately: `./scripts/run-with-mise.sh yarn build`, `./scripts/run-with-mise.sh yarn test:durable`, and `./scripts/run-with-mise.sh yarn test:durable:status`.

Expected: build exit 0 and durable evidence bound to the rebased `HEAD`.

- [ ] **Step 4: Perform the requested inline review before opening the draft MR.**

Confirm balance cap, 7–43 clarity, coastal/non-coastal play styles, difficulty parity, AI non-omniscience, UI truth, architecture, data/save idempotence, no new SFX, solo/hot-seat recipient safety, and actor-path regressions. Fix every actionable finding before publishing.
