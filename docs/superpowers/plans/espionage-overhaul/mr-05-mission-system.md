# MR 5 — Mission System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Era 2+ stationed spies can issue missions from inside enemy cities. The UI shows success % before committing. Steal-tech deduplication prevents exploiting the same civ repeatedly. AI logic added for spy movement and mission issuance.

**Prerequisite MRs:** MR 1–4

**Key changes vs. existing mission system:**
- `startMission` now only available when `spy.status === 'stationed'`
- Mission selection UI shows success % and detection risk
- `cooldownMode` toggle: `stay_low` (lower detection risk) vs `passive_observe` (get basic intel during cooldown)
- Steal tech deduplication: check `spy.stolenTechFrom[targetCivId]` before resolving
- Passive detection risk during cooldown is processed in `processEspionageTurn`

---

## Task 8: Two-Phase Missions with Cooldowns and Steal-Tech Deduplication

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/ui/espionage-panel.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/systems/espionage-infiltration.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/systems/espionage-infiltration.test.ts`:

```typescript
describe('steal tech deduplication', () => {
  it('cannot steal the same tech twice from the same civ', () => {
    const spyOwnerState = makeGameStateForMission();
    const result1 = resolveMissionResult('steal_tech', 'ai-egypt', 'city-egypt-1', spyOwnerState, 'player', 'unit-1');
    // Simulate recording the steal
    spyOwnerState.espionage!['player'].spies['unit-1'].stolenTechFrom!['ai-egypt'] = [result1.stolenTechId!];
    const result2 = resolveMissionResult('steal_tech', 'ai-egypt', 'city-egypt-1', spyOwnerState, 'player', 'unit-1');
    expect(result2.stolenTechId).toBeUndefined();
  });
});

describe('mission shows % success in panel data', () => {
  it('getEspionagePanelData includes missionSuccessChances when spy is stationed', async () => {
    const { getEspionagePanelData } = await import('@/ui/espionage-panel');
    const state = makeStationedSpyState();
    const data = getEspionagePanelData(state);
    expect(data.missionSuccessChances).toBeDefined();
    expect(Object.keys(data.missionSuccessChances ?? {})).toContain('scout_area');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/espionage-infiltration.test.ts
```

- [ ] **Step 3: Update `resolveMissionResult` for steal-tech deduplication**

In `src/systems/espionage-system.ts`, in the `'steal_tech'` case:

```typescript
case 'steal_tech': {
  const spy = gameState.espionage?.[spyingCivId]?.spies[spyId];
  const alreadyStolen = spy?.stolenTechFrom?.[targetCivId] ?? [];
  const stealable = theyHave.filter(t => !iHave.has(t) && !alreadyStolen.includes(t));
  if (stealable.length === 0) return {};
  // ... rest unchanged
}
```

After successful steal_tech in `processEspionageTurn`, record it:
```typescript
if (evt.missionType === 'steal_tech' && result.stolenTechId) {
  const stolenId = result.stolenTechId as string;
  // existing: add to completed techs
  // new: record in stolenTechFrom
  const existingRecord = state.espionage![civId].spies[evt.spyId]?.stolenTechFrom ?? {};
  state.espionage![civId].spies[evt.spyId] = {
    ...state.espionage![civId].spies[evt.spyId],
    stolenTechFrom: {
      ...existingRecord,
      [spy?.targetCivId ?? '']: [...(existingRecord[spy?.targetCivId ?? ''] ?? []), stolenId],
    },
  };
}
```

- [ ] **Step 4: Add `missionSuccessChances` to `EspionagePanelData`**

In `src/ui/espionage-panel.ts`, add to `EspionagePanelData`:
```typescript
missionSuccessChances?: Record<SpyMissionType, number>;
```

In `getEspionagePanelData`, compute it when a spy is stationed:
```typescript
const stationedSpy = spies.find(s => s.status === 'stationed' && s.targetCivId);
const missionSuccessChances: Record<string, number> = {};
if (stationedSpy) {
  const ci = state.espionage?.[stationedSpy.targetCivId!]?.counterIntelligence[stationedSpy.targetCityId!] ?? 0;
  for (const mission of availableMissions) {
    missionSuccessChances[mission] = getSpySuccessChance(stationedSpy.experience, ci, mission, stationedSpy.promotion);
  }
}
```

Update `appendMissionStage` to show `(62%)` success next to each mission label when data is available.

- [ ] **Step 5: Add passive detection during cooldown in `processEspionageTurn`**

In the spy turn processing loop, add a cooldown-detection pass for `'cooldown'` status spies inside enemy cities:

```typescript
if (spy.status === 'cooldown' && spy.infiltrationCityId && spy.cooldownTurns > 0) {
  const cityCI = updatedEsp.counterIntelligence[spy.infiltrationCityId] ?? 0;
  const detectionChance = spy.cooldownMode === 'passive_observe' ? 0.04 : 0.02;
  const adjustedChance = detectionChance + cityCI * 0.002;
  if (rng() < adjustedChance) {
    // Spy caught during cooldown
    events.push({ type: 'spy_captured', spyId, missionType: spy.currentMission?.type });
  }
}
```

- [ ] **Step 6: Add `cooldownMode` UI to espionage panel**

In `src/ui/espionage-panel.ts`, for any spy with `status === 'cooldown'` and `infiltrationCityId` set (they're lying low inside an enemy city), show a toggle:

```typescript
// In the spy summary row for cooldown-inside-city spies:
const modeLabel = spy.cooldownMode === 'passive_observe' ? 'Passive Observe (higher risk)' : 'Stay Low (safer)';
const toggleBtn = makeButton(`Mode: ${modeLabel}`, '#374151', () => callbacks.onToggleCooldownMode?.(spy.id));
spyRow.appendChild(toggleBtn);
```

Add tooltip: "Stay Low: 2% detection risk per turn. Passive Observe: 4% but grants basic intel at cooldown end."

Add `onToggleCooldownMode?: (spyId: string) => void` to the panel callbacks. Wire in `main.ts`:
```typescript
onToggleCooldownMode: (spyId) => {
  const spy = gameState.espionage?.[gameState.currentPlayer]?.spies[spyId];
  if (!spy || spy.status !== 'cooldown') return;
  const next: 'stay_low' | 'passive_observe' =
    spy.cooldownMode === 'passive_observe' ? 'stay_low' : 'passive_observe';
  gameState.espionage![gameState.currentPlayer].spies[spyId] = { ...spy, cooldownMode: next };
  renderLoop.setGameState(gameState);
},
```

- [ ] **Step 7: Add AI infiltration and mission logic to `src/ai/basic-ai.ts`**

The AI currently trains spy units but does nothing with them. Add logic to:

1. Move idle spy units toward the nearest enemy city:
```typescript
const idleSpyUnits = civ.units
  .map(id => newState.units[id])
  .filter(u => u && isSpyUnitType(u.type) && !u.hasActed);

for (const spyUnit of idleSpyUnits) {
  // Find nearest enemy city not already infiltrated by this civ
  const targets = Object.values(newState.cities)
    .filter(c => c.owner !== civId && isAtWar(civ.diplomacy, c.owner) === false)
    .sort((a, b) => hexDistance(spyUnit.position, a.position) - hexDistance(spyUnit.position, b.position));
  if (targets.length === 0) continue;
  const target = targets[0];
  // Move toward target (one step)
  const path = findPath(spyUnit.position, target.position, newState.map, newState.units);
  if (path && path.length > 1) {
    newState = moveUnit(newState, spyUnit.id, path[1], bus);
  }
}
```

2. Attempt infiltration when spy is on enemy city tile:
```typescript
for (const spyUnit of idleSpyUnits) {
  const cityHere = Object.values(newState.cities).find(
    c => c.owner !== civId && c.position.q === spyUnit.position.q && c.position.r === spyUnit.position.r,
  );
  if (!cityHere || !newState.espionage?.[civId]) continue;
  // Check no spy already inside
  const alreadyIn = Object.values(newState.espionage[civId].spies)
    .some(s => s.infiltrationCityId === cityHere.id &&
              (s.status === 'stationed' || s.status === 'on_mission'));
  if (alreadyIn) continue;
  const cityCI = newState.espionage[cityHere.owner]?.counterIntelligence[cityHere.id] ?? 0;
  const seed = `ai-infiltrate-${spyUnit.id}-${newState.turn}`;
  const result = attemptInfiltration(newState.espionage[civId], spyUnit.id, spyUnit.type as UnitType, cityHere.id, cityHere.position, cityCI, seed);
  newState.espionage[civId] = result.civEsp;
  if (result.removeUnitFromMap) {
    delete newState.units[spyUnit.id];
    newState.civilizations[civId].units = newState.civilizations[civId].units.filter(id => id !== spyUnit.id);
  }
}
```

3. Issue missions for stationed spies (era 2+):
```typescript
for (const spy of Object.values(newState.espionage?.[civId]?.spies ?? {})) {
  if (spy.status !== 'stationed' || !spy.targetCivId || !spy.targetCityId) continue;
  const available = getAvailableMissions(civ.techState.completed)
    .filter(m => m !== 'scout_area'); // AI prioritizes impactful missions
  if (available.length === 0) continue;
  const mission = available[Math.floor(rng() * available.length)];
  newState = startMissionForSpy(newState, civId, spy.id, mission, bus);
}
```

Import `attemptInfiltration`, `getAvailableMissions`, `isSpyUnitType` at the top of `basic-ai.ts`.

- [ ] **Step 8: Run full test suite**

```bash
yarn test
```

- [ ] **Step 9: Commit**

```bash
git add src/systems/espionage-system.ts src/ui/espionage-panel.ts src/ai/basic-ai.ts src/core/turn-manager.ts tests/systems/espionage-infiltration.test.ts
git commit -m "feat(espionage): mission system — % odds, steal-tech dedup, cooldown mode UI, AI infiltration + mission logic"
```
