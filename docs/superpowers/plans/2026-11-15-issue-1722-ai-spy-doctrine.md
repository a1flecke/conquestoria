# AI Spy Doctrine (#1722) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an AI civilization keep one spy mobile so its espionage mission pipeline actually runs, without removing the deliberate capital-defender behavior.

**Architecture:** Three narrow changes in the AI layer. `spyProcurementDemand` raises the roster ceiling from one spy to `min(maxSpies, 2)`; `shouldAiStationDefensiveSpy` refuses to embed the last non-embedded operative; the general mission pass ranks missions once, skips spies that cannot start anything, and walks the ranked list until `startMission` accepts one. No gameplay-system, UI, or save-format change.

**Tech Stack:** TypeScript, Vitest, existing `@/ai/*` and `@/systems/espionage-*` helpers.

**Spec:** `docs/superpowers/specs/2026-11-15-issue-1722-ai-spy-doctrine-design.md`

---

### Task 1: Bounded two-operative roster

**Files:**
- Modify: `src/ai/ai-prepared-turn.ts:227-247`
- Test: `tests/ai/ai-prepared-turn.test.ts:137-202`

- [ ] **Step 1: Write the failing tests**

In `tests/ai/ai-prepared-turn.test.ts`, replace the existing `it('counts an off-map spy against the peacetime roster limit', ...)` block (lines 162-171) with these three tests:

```ts
    it('asks for a second operative so one can defend and one can operate (#1722)', () => {
      const { state, civ } = spyProcurementGame();
      const created = createSpyFromUnit(
        state.espionage![civ.id], 'fielded-spy', civ.id, 'spy_informant', 'fielded',
      );
      created.spy.status = 'stationed';
      state.espionage![civ.id] = created.state;

      const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
        .find(entry => entry.role === 'espionage');

      expect(demand?.missing).toBe(1);
    });

    it('stops asking once the two-operative roster is full (#1722)', () => {
      const { state, civ } = spyProcurementGame();
      let aiEsp = state.espionage![civ.id];
      ({ state: aiEsp } = createSpyFromUnit(aiEsp, 'fielded-spy-1', civ.id, 'spy_informant', 'one'));
      ({ state: aiEsp } = createSpyFromUnit(aiEsp, 'fielded-spy-2', civ.id, 'spy_informant', 'two'));
      state.espionage![civ.id] = {
        ...aiEsp,
        spies: {
          ...aiEsp.spies,
          'fielded-spy-1': { ...aiEsp.spies['fielded-spy-1'], status: 'stationed' },
          'fielded-spy-2': { ...aiEsp.spies['fielded-spy-2'], status: 'stationed' },
        },
      };

      const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
        .find(entry => entry.role === 'espionage');

      expect(demand?.missing ?? 0).toBe(0);
    });

    it('never exceeds the tech-gated spy slot count', () => {
      const { state, civ } = spyProcurementGame();
      state.espionage![civ.id].maxSpies = 1;
      const created = createSpyFromUnit(
        state.espionage![civ.id], 'only-slot-spy', civ.id, 'spy_informant', 'only-slot',
      );
      created.spy.status = 'stationed';
      state.espionage![civ.id] = created.state;

      const demand = prepareMajorCivStrategicPlan(state, civ.id).forceDemands
        .find(entry => entry.role === 'espionage');

      expect(demand?.missing ?? 0).toBe(0);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./scripts/dev.sh test tests/ai/ai-prepared-turn.test.ts`

Expected: FAIL on the second-operative test only (`missing: 0` today because the cap is still one). The full-roster and slot-cap tests already expect no demand and pass before and after the change.

- [ ] **Step 3: Implement the roster cap**

In `src/ai/ai-prepared-turn.ts`, add the constant above `spyProcurementDemand` and change the cap:

```ts
/**
 * #1722: the AI's espionage roster ceiling. One operative can defend the capital while a
 * second operates, but the roster stays deliberately small: #1699 restored bounded peacetime
 * recruitment after an unbounded demand produced a spy farm, and `incrementalDemandSeed`
 * already asks for at most one unit per round. The tech-gated `maxSpies` still applies, so a
 * civ that has not researched a second slot never asks for one.
 */
export const AI_SPY_ROSTER_CAP = 2;

function spyProcurementDemand(
  state: Readonly<GameState>,
  perception: MajorCivPerception,
): PreparedForceDemandSeed[] {
  const espionage = state.espionage?.[perception.actorId];
  if (!espionage?.maxSpies || perception.ownCities.length === 0) return [];
  if (hasQueuedAISpy(perception.ownCities)) return [];

  // One operative gives the AI access to its mission pipeline. Stationed spies still
  // satisfy demand after their units leave the map -- but a permanently embedded defender
  // must never be the only operative (#1722), so the roster target is two.
  const activeSpies = Object.values(espionage.spies).filter(spy => spy.status !== 'captured').length;
  return incrementalDemandSeed(
    'espionage',
    ESPIONAGE_PROCUREMENT_SOURCE_ID,
    35,
    activeSpies,
    Math.min(espionage.maxSpies, AI_SPY_ROSTER_CAP),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./scripts/dev.sh test tests/ai/ai-prepared-turn.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-prepared-turn.ts tests/ai/ai-prepared-turn.test.ts
git commit -m "fix(ai): ask for a second spy so one can operate (#1722)"
```

---

### Task 2: Never garrison the last mobile operative

**Files:**
- Modify: `src/ai/basic-ai.ts:188-200`
- Test: `tests/ai/basic-ai.test.ts:1812-1835`

- [ ] **Step 1: Write the failing tests**

Replace the existing `it('AI stations a defensive spy in its capital by stage 3', ...)` block with these two tests:

```ts
  it('keeps a lone operative mobile instead of embedding it in the capital (#1722)', () => {
    const state = makeAiDefenseSpyState();
    state.units['unit-spy-ai'] = {
      id: 'unit-spy-ai', type: 'spy_scout', owner: 'ai-1',
      position: { q: 0, r: 0 }, movement: 2, maxMovement: 2,
      health: 100, maxHealth: 100, status: 'idle',
    } as any;
    state.civilizations['ai-1'].units = ['unit-spy-ai'];
    state.espionage!['ai-1'] = createSpyFromUnit(
      state.espionage!['ai-1'], 'unit-spy-ai', 'ai-1', 'spy_scout', 'seed-lone-operative',
    ).state;

    const newState = processAITurn(state, 'ai-1', new EventBus());

    const spies = Object.values(newState.espionage!['ai-1'].spies);
    expect(spies).toHaveLength(1);
    // Embedded defends the capital for the rest of the game and can never start a mission.
    expect(spies[0].status).toBe('idle');
    expect(newState.espionage!['ai-1'].counterIntelligence['city-ai'] ?? 0).toBe(0);
  });

  it('stations a defensive spy in the capital only when a spare operative remains', () => {
    const state = makeAiDefenseSpyState();
    for (const unitId of ['unit-spy-ai', 'unit-spy-ai-2']) {
      state.units[unitId] = {
        id: unitId, type: 'spy_scout', owner: 'ai-1',
        position: { q: 0, r: 0 }, movement: 2, maxMovement: 2,
        health: 100, maxHealth: 100, status: 'idle',
      } as any;
    }
    state.civilizations['ai-1'].units = ['unit-spy-ai', 'unit-spy-ai-2'];
    let aiEsp = state.espionage!['ai-1'];
    ({ state: aiEsp } = createSpyFromUnit(aiEsp, 'unit-spy-ai', 'ai-1', 'spy_scout', 'seed-spare-1'));
    ({ state: aiEsp } = createSpyFromUnit(aiEsp, 'unit-spy-ai-2', 'ai-1', 'spy_scout', 'seed-spare-2'));
    state.espionage!['ai-1'] = aiEsp;

    const newState = processAITurn(state, 'ai-1', new EventBus());

    const spies = Object.values(newState.espionage!['ai-1'].spies);
    expect(spies).toHaveLength(2);
    const embedded = spies.filter(spy => spy.status === 'embedded');
    expect(embedded).toHaveLength(1);
    expect(embedded[0].targetCivId).toBeNull();
    expect(embedded[0].targetCityId).toBe('city-ai');
    expect(newState.espionage!['ai-1'].counterIntelligence['city-ai']).toBeGreaterThan(0);
    expect(spies.some(spy => spy.status !== 'embedded')).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./scripts/dev.sh test tests/ai/basic-ai.test.ts`

Expected: FAIL. The lone-operative test sees `'embedded'` instead of `'idle'`.

- [ ] **Step 3: Implement the reserve rule**

Replace `shouldAiStationDefensiveSpy` in `src/ai/basic-ai.ts`:

```ts
function shouldAiStationDefensiveSpy(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  const espState = state.espionage?.[civId];
  if (!civ || !espState) return false;

  const hasStage3Espionage = civ.techState.completed.includes('spy-networks') || civ.techState.completed.includes('sabotage');
  if (!hasStage3Espionage) return false;

  // #1722: never garrison the civ's last mobile operative. An embedded spy cannot start a
  // mission and the AI never unembeds one, so spending the only operative on the capital
  // left the civ with no espionage at all. Counting non-embedded (not just non-captured)
  // keeps the reserve true even if the capital moves after a capture.
  const mobileSpies = Object.values(espState.spies)
    .filter(spy => spy.status !== 'captured' && spy.status !== 'embedded').length;
  if (mobileSpies < 2) return false;

  const capitalId = getCapitalCityId(state, civId);
  if (!capitalId) return false;

  return (espState.counterIntelligence[capitalId] ?? 0) === 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./scripts/dev.sh test tests/ai/basic-ai.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/basic-ai.test.ts
git commit -m "fix(ai): keep one spy mobile instead of garrisoning the last one (#1722)"
```

---

### Task 3: Walk the ranked mission list for a startable mission

**Files:**
- Modify: `src/ai/basic-ai.ts:1758-1818`
- Test: `tests/ai/ai-espionage.test.ts` (new `describe` block after the existing `repeat operations (#419)` block, before the file's closing `});` at line 474)

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `tests/ai/ai-espionage.test.ts`, inside the outer `describe` that contains `repeat operations (#419)`:

```ts
  // #1722: a mobile spy must start something even when the civ's favourite mission needs a
  // spy already inside a foreign city. The old loop took only the top-ranked mission and
  // skipped the whole spy when it was not eligible for it.
  describe('mobile-spy mission selection (#1722)', () => {
    function remoteFallbackState(): GameState {
      const state = makeAiTestState();
      state.turn = 42;
      state.civilizations['ai-egypt'].techState.completed = [
        'espionage-scouting', 'espionage-informants', 'spy-networks', 'cyber-intelligence',
      ];
      // Suppress the capital-defender pass so this test isolates mission selection.
      let aiEsp = { ...createEspionageCivState(), maxSpies: 2, counterIntelligence: { 'city-egypt-1': 1 } };
      ({ state: aiEsp } = createSpyFromUnit(aiEsp, 'spy-mobile', 'ai-egypt', 'spy_agent', 'seed-1722'));
      aiEsp = {
        ...aiEsp,
        spies: {
          'spy-mobile': {
            ...aiEsp.spies['spy-mobile'],
            status: 'idle',
            targetCivId: 'player',
            targetCityId: 'city-player-1',
            currentMission: null,
          },
        },
      };
      state.espionage = { ...state.espionage, 'ai-egypt': aiEsp };
      return state;
    }

    it('starts a remote mission when the top-ranked mission needs a placed spy', () => {
      const state = remoteFallbackState();
      const ranked = rankAiMissions(state, 'ai-egypt');
      expect(missionRequiresPlacedSpy(ranked[0]!)).toBe(true);
      expect(ranked).toContain('cyber_attack');

      const bus = new EventBus();
      const started: string[] = [];
      bus.on('espionage:mission-started', event => started.push(event.missionType));

      const after = processAITurn(state, 'ai-egypt', bus);

      expect(after.espionage!['ai-egypt'].spies['spy-mobile'].currentMission?.type).toBe('cyber_attack');
      expect(started).toEqual(['cyber_attack']);
    });

    it('leaves an embedded defender out of mission selection', () => {
      const state = remoteFallbackState();
      const aiEsp = state.espionage!['ai-egypt'];
      state.espionage!['ai-egypt'] = {
        ...aiEsp,
        spies: {
          ...aiEsp.spies,
          'spy-embedded': {
            ...aiEsp.spies['spy-mobile'],
            id: 'spy-embedded',
            status: 'embedded',
            targetCityId: 'city-egypt-1',
          },
        },
      };

      const after = processAITurn(state, 'ai-egypt', new EventBus());

      expect(after.espionage!['ai-egypt'].spies['spy-embedded'].status).toBe('embedded');
      expect(after.espionage!['ai-egypt'].spies['spy-embedded'].currentMission).toBeNull();
      expect(after.espionage!['ai-egypt'].spies['spy-mobile'].currentMission?.type).toBe('cyber_attack');
    });
  });
```

Add `missionRequiresPlacedSpy` to the test file's import from `@/systems/espionage-system` (line 19):

```ts
import { createEspionageCivState, createSpyFromUnit, missionRequiresPlacedSpy } from '@/systems/espionage-system';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./scripts/dev.sh test tests/ai/ai-espionage.test.ts`

Expected: FAIL. The mobile spy's `currentMission` is `null` and no `mission-started` event fires, because `chooseAiMission` returns a placed-spy mission and the loop `continue`s the spy.

- [ ] **Step 3: Implement the ranked-list walk**

Replace the block at `src/ai/basic-ai.ts:1758-1818` ("Start missions for stationed spies without active missions") with:

```ts
  // Start missions for spies that are actually free to run one (#1722). `embedded`,
  // `captured` and `cooldown` spies can start nothing, so ranking a mission for them only
  // repeated a placed-spy request every round that could never be accepted.
  const espState = newState.espionage?.[civId];
  if (espState) {
    const rankedMissions = rankAiMissions(newState, civId);
    for (const spy of Object.values(espState.spies)) {
      if (spy.currentMission) continue;
      if (!['idle', 'stationed'].includes(spy.status)) continue;
      const target = spy.targetCivId && spy.targetCityId
        ? { civId: spy.targetCivId, cityId: spy.targetCityId }
        : chooseAiSpyTarget(newState, civId, administrativePerception);
      if (!target) continue;
      for (const missionType of rankedMissions) {
        // A placed-spy mission needs the spy already inside a foreign city; a remote-capable
        // one can be run from home. Walking the ranking is what lets a mobile spy work at all
        // when its favourite mission is placed -- a refused top choice falls through instead
        // of idling the spy.
        if (missionRequiresPlacedSpy(missionType) && !(spy.status === 'stationed' && spy.targetCivId)) continue;
        // Repeating a fully active lockout/penalty only overwrites the timer with the same value.
        if (isOperationEffectFullyActive(newState, missionType, target.civId, target.cityId)) continue;
        const started = startMission(
          newState.espionage![civId],
          spy.id,
          missionType,
          resolveCivDefinition(newState, newState.civilizations[civId]?.civType ?? '')?.bonusEffect,
          target.civId,
          target.cityId,
        );
        if (!started.ok) continue;
        newState.espionage![civId] = started.state;
        emitAiMissionStarted(bus, civId, spy.id, started.state);
        break;
      }
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./scripts/dev.sh test tests/ai/ai-espionage.test.ts`

Expected: PASS, including the existing `repeat operations (#419)`, `infiltrated-spy mission selection`, and `Go public` blocks.

- [ ] **Step 5: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/ai-espionage.test.ts
git commit -m "fix(ai): start the first mission a mobile spy can actually run (#1722)"
```

---

### Task 4: Verification

**Files:** none (verification only)

- [ ] **Step 1: Source-rule check**

Run: `scripts/check-src-rule-violations.sh src/ai/ai-prepared-turn.ts src/ai/basic-ai.ts`

Expected: no violations.

- [ ] **Step 2: Focused tests**

Run: `./scripts/dev.sh test tests/ai/ai-prepared-turn.test.ts tests/ai/basic-ai.test.ts tests/ai/ai-espionage.test.ts`

Expected: PASS.

- [ ] **Step 3: TypeScript build**

Run: `./scripts/dev.sh build`

Expected: PASS.

- [ ] **Step 4: Long-horizon acceptance**

Run: `./scripts/run-with-mise.sh yarn test:ai-long -- -t lh-late-era-medium`

Expected: PASS, and `.verification/ai-long-horizon/lh-late-era-medium.json` reports `summary.espionage.spyMissionsStarted > 0`. On main this is `0` (the issue's baseline).

- [ ] **Step 5: Review both diffs**

Run: `git diff --stat origin/main...HEAD` and `git diff --stat`

Expected: only the spec, plan + manifest entry, `src/ai/ai-prepared-turn.ts`, `src/ai/basic-ai.ts`, and the three AI test files.

---

## Plan self-review notes

- Spec coverage: roster cap → Task 1; reserve invariant → Task 2; ranked-list walk + skip → Task 3; tests and end-to-end acceptance → Tasks 1-4; out-of-scope items are not implemented.
- No new test files, so `scripts/ci-test-shards.json` does not change.
- The plan file is deleted before delivery (delivered plans are not kept in the tree), and its manifest entry moves to `deleted`.
