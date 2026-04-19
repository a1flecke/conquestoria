# MR 7 — Counter-Espionage Embedding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players can station spies in their own cities to boost counter-intelligence and run sweeps that detect enemy infiltrators. Embedded spies show a 🛡 indicator on the city tile (visible only to the owner). Players can recall embedded spies with a 5-turn cooldown.

**Prerequisite MRs:** MR 1–6

**Key mechanics:**
- `embedSpy`: sets status to `'embedded'`, removes unit from `state.units`, grants one-time CI boost
- `setCounterIntelligence`: module-private helper, used here and in MR 9 buildings
- `unembedSpy`: sets status `'cooldown'`, cooldownTurns 5, targetCityId null — caller recreates unit and rekeys spy record
- `attemptSweep`: rolls per-city for enemy stationed spies; returns `detectedSpyIds`
- Embedded spy indicator: 🛡 rendered on own city tile (visible only to owner)
- If spy becomes obsolete while embedded: auto-expires without diplomatic damage

---

## Task 10: Embed Spy in Own City

**Files:**
- Modify: `src/systems/espionage-system.ts` — `embedSpy`, `unembedSpy`, `attemptSweep`, `setCounterIntelligence`, CI per-turn contribution
- Modify: `src/renderer/render-loop.ts` — draw 🛡 indicator for embedded spies on own cities
- Modify: `src/ui/espionage-panel.ts` — show [Unembed] and [Sweep] actions for embedded spies
- Modify: `src/core/turn-manager.ts` — process embedded spy per-turn CI contributions
- Tests: add to `tests/systems/espionage-capture.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/systems/espionage-capture.test.ts`:

```typescript
describe('embedSpy', () => {
  it('sets spy status to embedded and removes from map', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    const result = embedSpy(civEsp, 'unit-1', 'city-1', { q: 0, r: 0 });
    expect(result.spies['unit-1'].status).toBe('embedded');
    expect(result.spies['unit-1'].targetCityId).toBe('city-1');
  });

  it('embedding boosts CI score for the city', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    const before = civEsp.counterIntelligence['city-1'] ?? 0;
    const result = embedSpy(civEsp, 'unit-1', 'city-1', { q: 0, r: 0 });
    expect(result.counterIntelligence['city-1']).toBeGreaterThan(before);
  });
});

describe('unembedSpy', () => {
  it('sets status to cooldown with cooldownTurns 5', () => {
    let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: civEsp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'seed'));
    civEsp = embedSpy(civEsp, 'unit-1', 'city-1', { q: 0, r: 0 });
    const result = unembedSpy(civEsp, 'unit-1');
    expect(result.spies['unit-1'].status).toBe('cooldown');
    expect(result.spies['unit-1'].cooldownTurns).toBe(5);
    expect(result.spies['unit-1'].targetCityId).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/espionage-capture.test.ts
```

- [ ] **Step 3: Add core functions to `src/systems/espionage-system.ts`**

```typescript
// Helper used by embedSpy and CI building accumulation in MR 9
function setCounterIntelligence(
  state: EspionageCivState,
  cityId: string,
  value: number,
): EspionageCivState {
  return { ...state, counterIntelligence: { ...state.counterIntelligence, [cityId]: value } };
}

export function embedSpy(
  state: EspionageCivState,
  spyId: string,
  cityId: string,
  cityPosition: HexCoord,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'idle') throw new Error('Spy must be idle to embed');
  // One-time CI boost on embed
  const baseCi = 15;
  const expBonus = Math.floor(spy.experience * 0.3);
  const newCi = Math.min(100, (state.counterIntelligence[cityId] ?? 0) + baseCi + expBonus);
  const withCi = setCounterIntelligence(state, cityId, newCi);
  return {
    ...withCi,
    spies: { ...withCi.spies, [spyId]: { ...spy, status: 'embedded', targetCityId: cityId, position: { ...cityPosition } } },
  };
}

// Recall embedded spy: sets to cooldown — caller recreates unit and rekeys spy record
export function unembedSpy(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'embedded') return state;
  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: { ...spy, status: 'cooldown', cooldownTurns: 5, targetCityId: null },
    },
  };
}

export function attemptSweep(
  state: EspionageCivState,
  spyId: string,
  seed: string,
  gameState: GameState,
): { state: EspionageCivState; detectedSpyIds: string[] } {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return { state, detectedSpyIds: [] };
  const rng = createRng(seed);
  const detected: string[] = [];
  const baseSweepChance = 0.40 + spy.experience * 0.003;
  for (const [otherId, otherEsp] of Object.entries(gameState.espionage ?? {})) {
    if (otherId === spy.owner) continue;
    for (const enemySpy of Object.values(otherEsp.spies)) {
      if (enemySpy.infiltrationCityId !== spy.targetCityId) continue;
      if (rng() < baseSweepChance) detected.push(enemySpy.id);
    }
  }
  return { state, detectedSpyIds: detected };
}
```

- [ ] **Step 4: Wire per-turn CI contribution in `src/core/turn-manager.ts`**

In the espionage turn processing loop, after processing spy turn:

```typescript
// Embedded spy per-turn CI contribution
for (const [spyId, spy] of Object.entries(newState.espionage![civId].spies)) {
  if (spy.status !== 'embedded' || !spy.targetCityId) continue;
  const cityCI = newState.espionage![civId].counterIntelligence[spy.targetCityId] ?? 0;
  const perTurnBonus = 2 + Math.floor(spy.experience * 0.1);
  const newCI = Math.min(100, cityCI + perTurnBonus);
  newState.espionage![civId] = {
    ...newState.espionage![civId],
    counterIntelligence: { ...newState.espionage![civId].counterIntelligence, [spy.targetCityId]: newCI },
  };
}
```

- [ ] **Step 5: Add embedded spy map indicator to `src/renderer/render-loop.ts`**

Add a `drawEmbeddedSpyIndicators()` private method alongside `drawInfiltratedSpyIndicators()`. Renders a small 🛡 on own city tiles where an embedded spy is stationed (visible only to the owning player):

```typescript
private drawEmbeddedSpyIndicators(): void {
  if (!this.state) return;
  const civEsp = this.state.espionage?.[this.state.currentPlayer];
  if (!civEsp) return;
  for (const spy of Object.values(civEsp.spies)) {
    if (spy.status !== 'embedded' || !spy.targetCityId) continue;
    const city = this.state.cities[spy.targetCityId];
    if (!city || city.owner !== this.state.currentPlayer) continue;
    const pixel = hexToPixel(city.position, this.camera.hexSize);
    const screen = this.camera.worldToScreen(pixel.x, pixel.y);
    const size = this.camera.hexSize * this.camera.zoom;
    this.ctx.font = `${size * 0.3}px system-ui`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('🛡', screen.x - size * 0.5, screen.y - size * 0.4);
  }
}
```

Call `this.drawEmbeddedSpyIndicators()` in `render()` after `drawInfiltratedSpyIndicators()`.

- [ ] **Step 6: Add Embed action to `src/ui/selected-unit-info.ts` and Unembed/Sweep to `src/ui/espionage-panel.ts`**

In `selected-unit-info.ts`, add `onEmbed?: (unitId: string) => void` to `SelectedUnitInfoCallbacks`. Show Embed button when spy is idle and standing on own city:

```typescript
if (isSpyUnitType(unit.type) && callbacks.onEmbed) {
  const ownCityHere = Object.values(state.cities).some(
    c => c.owner === unit.owner && c.position.q === unit.position.q && c.position.r === unit.position.r,
  );
  const spyRecord = state.espionage?.[unit.owner]?.spies[unitId];
  if (ownCityHere && spyRecord?.status === 'idle') {
    actionsDiv.appendChild(makeButton('Embed (counter-espionage)', '#374151', () => callbacks.onEmbed!(unitId)));
  }
}
```

In `espionage-panel.ts`, for each embedded spy in the spy summaries section, show:
- `[Unembed (5 turn cooldown)]`
- `[Run Sweep]` — triggers `callbacks.onSweep(spy.id)`

Add `onUnembed?: (spyId: string) => void` and `onSweep?: (spyId: string) => void` to panel callbacks.

- [ ] **Step 7: Wire `onEmbed`, `onUnembed`, `onSweep` in `src/main.ts`**

```typescript
onEmbed: (unitId) => {
  const unit = gameState.units[unitId];
  if (!unit || !gameState.espionage?.[gameState.currentPlayer]) return;
  const city = Object.values(gameState.cities).find(
    c => c.owner === gameState.currentPlayer && c.position.q === unit.position.q && c.position.r === unit.position.r,
  );
  if (!city) return;
  gameState.espionage![gameState.currentPlayer] = embedSpy(
    gameState.espionage![gameState.currentPlayer], unitId, city.id, city.position,
  );
  // Remove unit from map (it's now embedded)
  delete gameState.units[unitId];
  gameState.civilizations[gameState.currentPlayer].units =
    gameState.civilizations[gameState.currentPlayer].units.filter(id => id !== unitId);
  showNotification(`Spy embedded in ${city.name}. Counter-intelligence boosted.`, 'info');
  renderLoop.setGameState(gameState);
},

onUnembed: (spyId) => {
  const ownerEsp = gameState.espionage?.[gameState.currentPlayer];
  const spy = ownerEsp?.spies[spyId];
  if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return;
  const city = gameState.cities[spy.targetCityId];
  if (!city) return;
  // Recreate unit at city position
  const newUnit = createUnit(spy.unitType, gameState.currentPlayer, city.position);
  gameState.units[newUnit.id] = newUnit;
  gameState.civilizations[gameState.currentPlayer].units.push(newUnit.id);
  // Rekey spy record with new unit ID
  const unembedded = unembedSpy(ownerEsp!, spyId);
  const rekeyed = { ...unembedded.spies[spyId], id: newUnit.id };
  const { [spyId]: _old2, ...rest2 } = unembedded.spies;
  gameState.espionage![gameState.currentPlayer] = { ...unembedded, spies: { ...rest2, [newUnit.id]: rekeyed } };
  showNotification(`Spy recalled from ${city.name}. Available in 5 turns.`, 'info');
  renderLoop.setGameState(gameState);
},

onSweep: (spyId) => {
  const ownerEsp = gameState.espionage?.[gameState.currentPlayer];
  if (!ownerEsp) return;
  const seed = `sweep-${spyId}-${gameState.turn}`;
  const { detectedSpyIds } = attemptSweep(ownerEsp, spyId, seed, gameState);
  if (detectedSpyIds.length > 0) {
    showNotification(`Sweep detected ${detectedSpyIds.length} enemy spy(ies) in the city!`, 'warning');
  } else {
    showNotification('Sweep complete — no enemy spies detected.', 'info');
  }
  renderLoop.setGameState(gameState);
},
```

- [ ] **Step 8: Run full test suite**

```bash
yarn test
```

- [ ] **Step 9: Commit**

```bash
git add src/systems/espionage-system.ts src/renderer/render-loop.ts src/ui/selected-unit-info.ts src/ui/espionage-panel.ts src/main.ts src/core/turn-manager.ts tests/systems/espionage-capture.test.ts
git commit -m "feat(espionage): counter-espionage embedding — embed spy in own city for CI boost, sweep action, 🛡 map indicator"
```
