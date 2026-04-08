# M4d Grand Ambitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship M4d as three independently mergeable vertical slices: full breakaway, legendary quest wonders, and Stage 5 espionage with the Artisan advisor and the M4d civilization roster.

**Architecture:** Preserve the current event-driven game loop and serializable `GameState`, but add focused state and system modules for each slice instead of bloating the existing M4c files. Slice 1 adds a breakaway lifecycle on top of the unrest/revolt system. Slice 2 adds a data-driven legendary wonder framework with explicit quest and construction phases plus the reusable reward/effect plumbing required by the four flagship wonders. Slice 3 extends the espionage stack to late-game digital operations, introduces the Artisan advisor as the wonder UX layer, and adds three civ bonuses that hook into existing production, diplomacy, and map systems.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, DOM panels, EventBus, IndexedDB/localStorage save serialization

---

## Background And Conventions

Before starting any slice:

- Read `CLAUDE.md`
- Read `.claude/rules/game-systems.md`
- Read `.claude/rules/ui-panels.md`
- Read `.claude/rules/end-to-end-wiring.md`
- Read `docs/superpowers/specs/2026-04-07-m4d-grand-ambitions-design.md`

Critical rules to preserve:

1. **Never use `Math.random()`**. Derive deterministic seeds from `state.turn`, civ IDs, city IDs, or wonder IDs.
2. **Never hardcode `'player'`**. All UI, advisors, diplomacy, and espionage must use `state.currentPlayer`.
3. **Events are notifications, not commands**. Any emitted event must have its state mutation already applied.
4. **UI must explain itself**. New panels need inline descriptions, visible progress, and clear loss/penalty messaging.
5. **Use `textContent` or DOM creation for game text**. No `innerHTML` with game-generated strings.
6. **Every slice must end with a clean build, targeted tests, full tests, commit, push, MR/PR, and merge to `main`**.

Standard commands:

- Activate toolchain: `eval "$(mise activate bash)"`
- Targeted test: `eval "$(mise activate bash)" && yarn test --run tests/path/to/file.test.ts`
- Full test suite: `eval "$(mise activate bash)" && yarn test --run`
- Build: `eval "$(mise activate bash)" && yarn build`

---

## File Structure

### Slice 1: Full Breakaway

| File | Responsibility |
|------|----------------|
| `src/core/types.ts` | Add breakaway metadata, diplomacy action, and events |
| `src/core/game-state.ts` | Initialize any new advisor/state defaults safely |
| `src/core/turn-manager.ts` | Tick breakaway maturation and emit notifications in turn order |
| `src/systems/faction-system.ts` | Continue handling unrest/revolt and hand off secession trigger |
| `src/systems/breakaway-system.ts` | NEW - create breakaway civs, mature them after 50 turns, handle reabsorption/reconquest penalties |
| `src/systems/diplomacy-system.ts` | Add reabsorption action and symmetric diplomacy handling |
| `src/ui/diplomacy-panel.ts` | Show breakaway actors, countdown, and reabsorption affordance |
| `src/renderer/city-renderer.ts` | Render secession/establishment overlays and countdown badges |
| `src/ai/basic-ai.ts` | Teach AI to recover, tolerate, or exploit breakaways |
| `tests/systems/helpers/breakaway-fixture.ts` | NEW - shared deterministic state builders for Slice 1 system tests |
| `tests/ui/helpers/diplomacy-fixture.ts` | NEW - shared DOM/state builders for breakaway diplomacy UI tests |
| `tests/systems/faction-system.test.ts` | Keep unrest/revolt regressions green |
| `tests/systems/breakaway-system.test.ts` | NEW - secession, maturation, reconquest, reabsorption |
| `tests/ui/diplomacy-panel.test.ts` | NEW - breakaway UI and current-player safety |
| `tests/renderer/city-renderer.test.ts` | Add visual-state coverage for breakaway cities |
| `tests/ai/basic-ai.test.ts` | Add breakaway-response AI coverage |
| `tests/storage/save-persistence.test.ts` | Add serialization coverage for new breakaway metadata |

### Slice 2: Legendary Quest Wonders

| File | Responsibility |
|------|----------------|
| `src/core/types.ts` | Add legendary wonder definitions, project state, quest steps, production carryover, and completed-wonder reward/effect state |
| `src/systems/legendary-wonder-definitions.ts` | NEW - define the first four legendary wonders and their quest chains |
| `src/systems/legendary-wonder-system.ts` | NEW - eligibility, quest progress, construction race, compensation, global race resolution, reward/effect completion |
| `src/systems/city-system.ts` | Support wonder build queue entries and production transfer |
| `src/core/turn-manager.ts` | Tick wonder quests, race progress, and completion events |
| `src/ui/city-panel.ts` | Add legendary wonder entry point and city-specific build state |
| `src/ui/wonder-panel.ts` | NEW - explain eligibility, quest steps, race status, and loss compensation |
| `src/main.ts` | Wire wonder-panel open/close flow from the city panel into the running game UI |
| `src/ai/basic-ai.ts` | Decide which wonders to pursue and when to abandon races |
| `tests/systems/helpers/legendary-wonder-fixture.ts` | NEW - shared deterministic state builders for Slice 2 system tests |
| `tests/ui/helpers/wonder-panel-fixture.ts` | NEW - shared DOM/state builders for wonder UI tests |
| `tests/systems/legendary-wonder-system.test.ts` | NEW - system rules and race compensation |
| `tests/ui/city-panel.test.ts` | NEW - city-panel wonder-entry and carryover rendering coverage |
| `tests/ui/wonder-panel.test.ts` | NEW - panel messaging and hot-seat filtering |
| `tests/core/turn-manager.test.ts` | Add wonder tick integration coverage |
| `tests/ai/basic-ai.test.ts` | Add AI wonder pursuit/abandonment coverage |
| `tests/storage/save-persistence.test.ts` | Add legendary wonder serialization coverage |

### Slice 3: Digital Espionage, Artisan, And M4d Civs

| File | Responsibility |
|------|----------------|
| `src/core/types.ts` | Add Stage 5 mission types, `artisan` advisor, and new civ bonus types |
| `src/core/game-state.ts` | Initialize `artisan` in advisor settings safely |
| `src/systems/tech-definitions.ts` | Add Stage 5 espionage tech unlocks |
| `src/systems/espionage-system.ts` | Implement Stage 5 effect plumbing, double agents, remote-capable missions, and simplified election interference |
| `src/core/turn-manager.ts` | Apply Stage 5 production/research penalties and clear temporary effects deterministically |
| `src/systems/fog-of-war.ts` | Support satellite-surveillance visibility overrides without breaking normal vision rules |
| `src/ui/espionage-panel.ts` | Show Stage 5 missions, remote-vs-placed rules, mission success preview, and threat-board messaging |
| `src/ui/advisor-system.ts` | Add Artisan advisor triggers and wonder-focused UX copy |
| `src/systems/civ-definitions.ts` | Add Lothlorien, Narnia, and Atlantis |
| `src/systems/resource-system.ts` | Apply any new civ economy/yield bonuses cleanly |
| `src/systems/combat-system.ts` | Apply any new civ combat modifiers cleanly |
| `src/systems/unit-system.ts` | Support any new civ-specific stealth or naval-power hooks needed for M4d civ fidelity |
| `src/ai/basic-ai.ts` | Use Stage 5 missions, react to remote threats, and play new civ bonuses coherently |
| `tests/systems/tech-definitions.test.ts` | Add Stage 5 tech coverage |
| `tests/systems/espionage-system.test.ts` | Add Stage 5 mission logic coverage |
| `tests/systems/fog-of-war.test.ts` | Add satellite-surveillance visibility coverage |
| `tests/ui/espionage-panel.test.ts` | Add Stage 5 UI and current-player safety coverage |
| `tests/core/turn-manager.test.ts` | Add Stage 5 effect-duration and decay coverage |
| `tests/ui/advisor-system.test.ts` | Add Artisan message coverage |
| `tests/ui/advisor-spymaster.test.ts` | Add threat-board and warning coverage for late-game espionage |
| `tests/systems/civ-definitions.test.ts` | Add M4d civ definition coverage |
| `tests/ai/basic-ai.test.ts` | Add late-game espionage and civ-bonus AI coverage |
| `tests/integration/m4a-espionage-integration.test.ts` | Add hot-seat and full espionage-lifecycle regressions for Stage 5 |
| `tests/storage/save-persistence.test.ts` | Add Stage 5/artisan serialization coverage |

---

## Slice 1: Full Breakaway

### Task 1: Add Breakaway Data Model And Failing Tests

**Files:**
- Create: `tests/systems/helpers/breakaway-fixture.ts`
- Create: `tests/systems/breakaway-system.test.ts`
- Create: `tests/ui/helpers/diplomacy-fixture.ts`
- Create: `tests/ui/diplomacy-panel.test.ts`
- Modify: `src/core/types.ts`

- [ ] **Step 1: Create shared deterministic breakaway fixtures**

Create `tests/systems/helpers/breakaway-fixture.ts` and `tests/ui/helpers/diplomacy-fixture.ts` with minimal exported builders used by the new tests. Keep these helpers local to M4d tests so the new state shape does not leak into unrelated suites.

- [ ] **Step 2: Write failing system tests for secession and 50-turn establishment**

Create `tests/systems/breakaway-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processBreakawayTurn, createBreakawayFromCity, tryReabsorbBreakaway } from '@/systems/breakaway-system';
import { makeBreakawayFixture } from './helpers/breakaway-fixture';

describe('breakaway-system', () => {
  it('turns an unresolved revolt into a breakaway civ with deterministic metadata', () => {
    const { state } = makeBreakawayFixture({ unrestLevel: 2, unrestTurns: 10, turn: 40 });
    const bus = new EventBus();

    const result = createBreakawayFromCity(state, 'city-border', bus);
    const spawned = Object.values(result.civilizations).find(c => c.breakaway?.originCityId === 'city-border');

    expect(spawned).toBeDefined();
    expect(result.cities['city-border'].owner).toBe(spawned!.id);
    expect(spawned!.breakaway?.status).toBe('secession');
    expect(spawned!.breakaway?.establishesOnTurn).toBe(90);
  });

  it('promotes a surviving breakaway state into an established civilization after 50 turns', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 62 });
    const bus = new EventBus();

    const result = processBreakawayTurn(state, bus);
    expect(result.civilizations[breakawayId].breakaway?.status).toBe('established');
  });

  it('requires both relationship and gold to reabsorb a breakaway state', () => {
    const { state, breakawayId } = makeBreakawayFixture({ relationship: 35, gold: 150 });
    expect(() => tryReabsorbBreakaway(state, 'player', breakawayId)).toThrow(/relationship/i);
  });
});
```

- [ ] **Step 3: Write failing UI test for breakaway countdown and reabsorption action**

Create `tests/ui/diplomacy-panel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { makeDiplomacyFixture } from './helpers/diplomacy-fixture';

describe('diplomacy-panel breakaway rows', () => {
  it('renders breakaway status, countdown, and reabsorb action for the current player only', () => {
    const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player-2', includeBreakaway: true });
    const panel = createDiplomacyPanel(container, state, {
      onAction: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Breakaway');
    expect(panel.textContent).toContain('50 turns');
    expect(panel.textContent).toContain('reabsorb breakaway');
    expect(panel.textContent).not.toContain('player-1 hidden spies');
  });
});
```

- [ ] **Step 4: Run targeted tests to verify they fail**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/breakaway-system.test.ts tests/ui/diplomacy-panel.test.ts
```

Expected: FAIL with missing `breakaway-system` exports and missing UI handling.

- [ ] **Step 5: Add concrete breakaway types and events**

In `src/core/types.ts`, add:

```typescript
export interface BreakawayMetadata {
  originOwnerId: string;
  originCityId: string;
  startedTurn: number;
  establishesOnTurn: number;
  status: 'secession' | 'established';
}

export type DiplomaticAction =
  | 'declare_war'
  | 'request_peace'
  | 'non_aggression_pact'
  | 'trade_agreement'
  | 'open_borders'
  | 'alliance'
  | 'offer_vassalage'
  | 'petition_independence'
  | 'propose_embargo'
  | 'join_embargo'
  | 'leave_embargo'
  | 'propose_league'
  | 'invite_to_league'
  | 'petition_league'
  | 'leave_league'
  | 'reabsorb_breakaway';

// Add to Civilization
breakaway?: BreakawayMetadata;

// Add to GameEvents
'faction:breakaway-started': { cityId: string; oldOwner: string; breakawayId: string };
'faction:breakaway-established': { civId: string; originOwnerId: string };
'faction:breakaway-reabsorbed': { civId: string; ownerId: string; cityId: string };
```

- [ ] **Step 6: Run tests to confirm the new shapes compile**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/breakaway-system.test.ts
```

Expected: still FAIL on missing implementation, but type errors should be gone.

### Task 2: Implement Secession Creation And 50-Turn Maturation

**Files:**
- Create: `src/systems/breakaway-system.ts`
- Modify: `src/systems/faction-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `tests/systems/faction-system.test.ts`
- Modify: `tests/systems/breakaway-system.test.ts`

- [ ] **Step 1: Add failing faction regression for revolt-to-breakaway handoff**

Append to `tests/systems/faction-system.test.ts`:

```typescript
it('hands an unresolved revolt to breakaway creation instead of leaving it permanent', () => {
  const state = makeState({
    cityCount: 10,
    unrestLevel: 2,
    unrestTurns: 10,
    cityPosition: { q: 6, r: 6 },
  });

  const result = processFactionTurn(state, bus);
  expect(result.cities['city-1'].owner).not.toBe('player');
});
```

- [ ] **Step 2: Implement focused breakaway helpers in a new system file**

Create `src/systems/breakaway-system.ts` with these public APIs:

```typescript
export function createBreakawayFromCity(state: GameState, cityId: string, bus: EventBus): GameState;
export function processBreakawayTurn(state: GameState, bus: EventBus): GameState;
export function tryReabsorbBreakaway(state: GameState, ownerId: string, breakawayId: string): GameState;
export function isBreakawayCiv(civ: Civilization): boolean;
```

Use deterministic IDs and metadata:

```typescript
const seed = `breakaway-${cityId}-${state.turn}`;
const civId = `breakaway-${cityId}-${state.turn}`;
const metadata: BreakawayMetadata = {
  originOwnerId: oldOwner,
  originCityId: cityId,
  startedTurn: state.turn,
  establishesOnTurn: state.turn + 50,
  status: 'secession',
};
```

- [ ] **Step 3: Call breakaway creation from the unrest ladder**

In `src/systems/faction-system.ts`, replace the permanent revolt branch with:

```typescript
if (updated.unrestLevel === 2) {
  const nearbyRebels = Object.values(state.units).filter(
    u => u.owner === 'rebels' && hexDistance(u.position, city.position) <= 3,
  );

  if (nearbyRebels.length === 0 && pressure <= UNREST_TRIGGER_PRESSURE) {
    state.cities[cityId] = { ...updated, unrestLevel: 0, unrestTurns: 0 };
    bus.emit('faction:unrest-resolved', { cityId, owner: city.owner });
    continue;
  }

  updated = { ...updated, unrestTurns: updated.unrestTurns + 1 };
  state.cities[cityId] = updated;
  if (updated.unrestTurns >= 10) {
    state = createBreakawayFromCity(state, cityId, bus);
  }
}
```

- [ ] **Step 4: Tick breakaway maturation during turn processing**

In `src/core/turn-manager.ts`, after `processFactionTurn`:

```typescript
newState = processFactionTurn(newState, bus);
newState = processBreakawayTurn(newState, bus);
```

- [ ] **Step 5: Run targeted system tests**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/faction-system.test.ts tests/systems/breakaway-system.test.ts
```

Expected: PASS for secession creation and 50-turn establishment.

### Task 3: Add Reabsorption, Reconquest Pressure, And Player-Facing UI

**Files:**
- Modify: `src/systems/diplomacy-system.ts`
- Modify: `src/ui/diplomacy-panel.ts`
- Modify: `src/renderer/city-renderer.ts`
- Modify: `tests/ui/diplomacy-panel.test.ts`
- Modify: `tests/renderer/city-renderer.test.ts`

- [ ] **Step 1: Add failing tests for reabsorption gating and city overlay messaging**

Add to `tests/renderer/city-renderer.test.ts`:

```typescript
it('renders a breakaway badge and establishment countdown for seceded cities', () => {
  const { state, cityId } = makeBreakawayRenderFixture();
  const playerCity = getRenderableCities(state, 'player').find(c => c.id === cityId);
  expect(playerCity?.breakawayStatus).toBe('secession');
  expect(playerCity?.breakawayTurnsLeft).toBe(17);
});
```

- [ ] **Step 2: Add the diplomacy action and symmetric handler**

In `src/systems/diplomacy-system.ts`, add:

```typescript
export function canReabsorbBreakaway(state: GameState, ownerId: string, breakawayId: string): boolean {
  const civ = state.civilizations[breakawayId];
  if (!civ?.breakaway || civ.breakaway.originOwnerId !== ownerId) return false;
  const rel = getRelationship(state.civilizations[ownerId].diplomacy, breakawayId);
  return rel >= 50 && state.civilizations[ownerId].gold >= 200;
}
```

Keep diplomacy bilateral when reabsorbing:

```typescript
modifyRelationship(ownerDip, breakawayId, 15);
modifyRelationship(breakawayDip, ownerId, 15);
```

- [ ] **Step 3: Render breakaway rows and countdown in the diplomacy panel**

In `src/ui/diplomacy-panel.ts`, extend `CivRowData`:

```typescript
breakawayStatus?: 'secession' | 'established';
breakawayTurnsLeft?: number;
```

Render:

```typescript
const turnsLeft = civ.breakaway
  ? Math.max(0, civ.breakaway.establishesOnTurn - state.turn)
  : undefined;
const statusText = civ.breakaway
  ? (civ.breakaway.status === 'secession' ? `Breakaway · ${turnsLeft} turns to establishment` : 'Established breakaway civ')
  : existingStatusText;
```

Expose `reabsorb_breakaway` only when:

```typescript
civ.breakaway?.originOwnerId === state.currentPlayer && canReabsorbBreakaway(state, state.currentPlayer, civId)
```

- [ ] **Step 4: Render a distinct city overlay for secession and establishment**

In `src/renderer/city-renderer.ts`, add fields to the render model:

```typescript
breakawayStatus?: 'secession' | 'established';
breakawayTurnsLeft?: number;
```

Use distinct marker text:

```typescript
const badge = city.ownerData?.breakaway?.status === 'secession' ? '⛓' : '👑';
```

- [ ] **Step 5: Run UI and renderer tests**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/ui/diplomacy-panel.test.ts tests/renderer/city-renderer.test.ts
```

Expected: PASS and no current-player leaks.

- [ ] **Step 6: Add a reconquest regression proving brute-force recapture is not a permanent fix**

Append to `tests/systems/breakaway-system.test.ts`:

```typescript
it('reapplies instability pressure after reconquest instead of restoring a fully stable city', () => {
  const { state, breakawayId } = makeBreakawayFixture({ established: false });
  const result = reconquerBreakawayCity(state, 'player', breakawayId, 'city-border');
  expect(result.cities['city-border'].unrestLevel).toBeGreaterThan(0);
});
```

### Task 4: Finish Slice 1 AI And Save/Load Coverage

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/ai/basic-ai.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Add failing AI tests for breakaway response**

Append to `tests/ai/basic-ai.test.ts`:

```typescript
it('prioritizes reclaiming a seceded former core city before expanding elsewhere', () => {
  const state = makeAiFixtureWithBreakaway();
  const result = processAiTurn(state, 'player-ai', new EventBus());
  expect(result.aiDecisions.some(d => d.type === 'recover-breakaway')).toBe(true);
});

it('does not ignore a 49-turn-old breakaway that will establish next turn', () => {
  const state = makeAiFixtureWithBreakaway({ turnsLeft: 1 });
  const result = processAiTurn(state, 'player-ai', new EventBus());
  expect(result.aiDecisions.some(d => d.priority === 'critical')).toBe(true);
});
```

- [ ] **Step 2: Teach AI to recognize and prioritize breakaways**

In `src/ai/basic-ai.ts`, add a focused branch before normal expansion:

```typescript
const ownedBreakaways = Object.entries(newState.civilizations)
  .filter(([, civ]) => civ.breakaway?.originOwnerId === civId);

if (ownedBreakaways.length > 0) {
  // Highest priority: city about to establish, then nearest former core city.
}
```

- [ ] **Step 3: Add save/load regression**

Append to `tests/storage/save-persistence.test.ts`:

```typescript
it('round-trips breakaway metadata through JSON serialization', () => {
  const state = {
    turn: 61,
    civilizations: {
      'breakaway-city-1': {
        breakaway: {
          originOwnerId: 'player',
          originCityId: 'city-1',
          startedTurn: 11,
          establishesOnTurn: 61,
          status: 'established',
        },
      },
    },
  };
  const roundTrip = JSON.parse(JSON.stringify(state));
  expect(roundTrip.civilizations['breakaway-city-1'].breakaway.status).toBe('established');
});
```

- [ ] **Step 4: Run Slice 1 targeted verification**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/faction-system.test.ts tests/systems/breakaway-system.test.ts tests/ui/diplomacy-panel.test.ts tests/renderer/city-renderer.test.ts tests/ai/basic-ai.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

### Task 5: Slice 1 Release Gate

**Files:**
- Modify: `docs/superpowers/specs/2026-04-07-m4d-grand-ambitions-design.md` only if implementation-required clarifications were discovered

- [ ] **Step 1: Run full build and full test suite**

Run:

```bash
eval "$(mise activate bash)" && yarn build
eval "$(mise activate bash)" && yarn test --run
```

Expected: both PASS.

- [ ] **Step 2: Create the slice branch from updated `main`**

Run:

```bash
git pull --ff-only origin main
git checkout -b feature/m4d-slice1-breakaway
```

- [ ] **Step 3: Commit the slice**

Run:

```bash
git add src/core/types.ts src/core/turn-manager.ts src/systems/faction-system.ts src/systems/breakaway-system.ts src/systems/diplomacy-system.ts src/ui/diplomacy-panel.ts src/renderer/city-renderer.ts src/ai/basic-ai.ts tests/systems/helpers/breakaway-fixture.ts tests/ui/helpers/diplomacy-fixture.ts tests/systems/faction-system.test.ts tests/systems/breakaway-system.test.ts tests/ui/diplomacy-panel.test.ts tests/renderer/city-renderer.test.ts tests/ai/basic-ai.test.ts tests/storage/save-persistence.test.ts
git commit -m "feat(m4d): ship full breakaway slice"
```

- [ ] **Step 4: Push and open the MR/PR**

Run:

```bash
git push -u origin feature/m4d-slice1-breakaway
gh pr create --base main --head feature/m4d-slice1-breakaway --title "feat(m4d): ship full breakaway slice" --body "## Summary\n- add breakaway secession and 50-turn establishment\n- add reabsorption UI and breakaway AI behavior\n- add save/load and renderer coverage\n\n## Verification\n- yarn build\n- yarn test --run"
```

- [ ] **Step 5: Merge, delete branch, refresh `main`, and clean up the Slice 1 worktree only after confirming the merge landed on `origin/main`**

Run:

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --ff-only origin main
git branch --remotes --contains <slice1-merge-commit>
git worktree remove .worktrees/feature-m4d-slice1-breakaway
```

Expected: the merged Slice 1 commit appears in `origin/main` before the worktree is removed.

---

## Slice 2: Legendary Quest Wonders

### Task 6: Add Legendary Wonder Types, Definitions, And Failing Tests

**Files:**
- Modify: `src/core/types.ts`
- Create: `tests/systems/helpers/legendary-wonder-fixture.ts`
- Create: `src/systems/legendary-wonder-definitions.ts`
- Create: `tests/systems/legendary-wonder-system.test.ts`

- [ ] **Step 1: Create shared deterministic legendary-wonder fixtures**

Create `tests/systems/helpers/legendary-wonder-fixture.ts` with builders for wonder eligibility, quest progress, and race-loss states so the Slice 2 tests use the same assumptions.

- [ ] **Step 2: Write failing tests for eligibility, quest steps, and 25/25/50 compensation**

Create `tests/systems/legendary-wonder-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getEligibleLegendaryWonders,
  unlockLegendaryWonderProject,
  loseLegendaryWonderRace,
} from '@/systems/legendary-wonder-system';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-system', () => {
  it('requires all eligibility constraints, not only one of them', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: ['philosophy'], resources: [] });
    const eligible = getEligibleLegendaryWonders(state, 'player', 'city-river');
    expect(eligible).not.toContain('oracle-of-delphi');
  });

  it('unlocks construction only after every quest step is complete', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    const project = unlockLegendaryWonderProject(state, 'player', 'oracle-of-delphi');
    expect(project.phase).toBe('ready_to_build');
  });

  it('converts 25 percent to coins and 25 percent to city carryover when a race is lost', () => {
    const result = loseLegendaryWonderRace(200);
    expect(result.goldRefund).toBe(50);
    expect(result.transferableProduction).toBe(50);
    expect(result.lostProduction).toBe(100);
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/legendary-wonder-system.test.ts
```

Expected: FAIL with missing module/types.

- [ ] **Step 4: Add explicit legendary wonder state to `src/core/types.ts`**

Add:

```typescript
export interface LegendaryWonderStep {
  id: string;
  description: string;
  completed: boolean;
}

export interface LegendaryWonderDefinition {
  id: string;
  name: string;
  era: number;
  requiredTechs: string[];
  requiredResources: string[];
  cityRequirement: 'river' | 'coastal' | 'any';
  questSteps: Array<{ id: string; type: 'discover_wonder' | 'trade_route' | 'research_count' | 'defeat_stronghold' }>;
}

export interface LegendaryWonderProject {
  wonderId: string;
  ownerId: string;
  cityId: string;
  phase: 'locked' | 'questing' | 'ready_to_build' | 'building' | 'completed' | 'lost_race';
  investedProduction: number;
  transferableProduction: number;
  questSteps: LegendaryWonderStep[];
}

// Add to GameState
legendaryWonderProjects?: Record<string, LegendaryWonderProject>;
```

- [ ] **Step 5: Define the first four wonders concretely within the current M4d tech envelope**

Create `src/systems/legendary-wonder-definitions.ts`:

```typescript
export const LEGENDARY_WONDER_DEFINITIONS: LegendaryWonderDefinition[] = [
  { id: 'oracle-of-delphi', name: 'Oracle of Delphi', era: 3, requiredTechs: ['philosophy', 'pilgrimages'], requiredResources: [], cityRequirement: 'any', questSteps: [{ id: 'discover-natural-wonder', type: 'discover_wonder' }, { id: 'complete-pilgrimage-route', type: 'trade_route' }] },
  { id: 'grand-canal', name: 'Grand Canal', era: 4, requiredTechs: ['city-planning', 'printing'], requiredResources: ['stone'], cityRequirement: 'river', questSteps: [{ id: 'connect-two-cities', type: 'trade_route' }, { id: 'grow-river-city', type: 'research_count' }] },
  { id: 'sun-spire', name: 'Sun Spire', era: 4, requiredTechs: ['architecture-arts', 'theology-tech'], requiredResources: ['stone'], cityRequirement: 'any', questSteps: [{ id: 'complete-sacred-route', type: 'trade_route' }, { id: 'defeat-nearby-stronghold', type: 'defeat_stronghold' }] },
  { id: 'world-archive', name: 'World Archive', era: 4, requiredTechs: ['printing', 'diplomats'], requiredResources: [], cityRequirement: 'any', questSteps: [{ id: 'complete-four-communication-techs', type: 'research_count' }, { id: 'establish-two-trade-links', type: 'trade_route' }] },
];
```

`Manhattan Project`, `Internet`, and other wonders that require the late-era tech tree expansion move to `M4e` and must not be added to the initial M4d flagship set.

- [ ] **Step 6: Run the test again**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/legendary-wonder-system.test.ts
```

Expected: still FAIL on missing logic, but type and definition imports should resolve.

### Task 7: Implement Quest Progression And Race Resolution

**Files:**
- Create: `src/systems/legendary-wonder-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `tests/systems/legendary-wonder-system.test.ts`
- Modify: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Add failing integration test for quest completion and construction unlock**

Append to `tests/core/turn-manager.test.ts`:

```typescript
it('moves a legendary wonder project from questing to ready_to_build once all steps complete', () => {
  const state = makeTurnManagerWonderFixture();
  state.legendaryWonderProjects!['oracle-of-delphi'].questSteps.forEach(step => { step.completed = true; });

  const result = processTurn(state, new EventBus());
  expect(result.legendaryWonderProjects!['oracle-of-delphi'].phase).toBe('ready_to_build');
});
```

- [ ] **Step 2: Implement the core system with explicit phases**

Create `src/systems/legendary-wonder-system.ts` with:

```typescript
export function getEligibleLegendaryWonders(state: GameState, civId: string, cityId: string): string[];
export function tickLegendaryWonderProjects(state: GameState, bus: EventBus): GameState;
export function startLegendaryWonderBuild(state: GameState, civId: string, cityId: string, wonderId: string): GameState;
export function loseLegendaryWonderRace(investedProduction: number): {
  goldRefund: number;
  transferableProduction: number;
  lostProduction: number;
};
```

The core system must also resolve the global race when a wonder completes:

```typescript
// when one project completes, all rival projects for that wonderId immediately become lost_race
// and receive the 25/25/50 compensation in their own city
```

Compensation must be exact:

```typescript
const goldRefund = Math.floor(investedProduction * 0.25);
const transferableProduction = Math.floor(investedProduction * 0.25);
const lostProduction = investedProduction - goldRefund - transferableProduction;
```

- [ ] **Step 3: Support wonder queue items in the city system**

In `src/systems/city-system.ts`, gate wonder build entries separately from buildings and units:

```typescript
if (itemId.startsWith('legendary:')) {
  return processLegendaryWonderProduction(city, itemId, production);
}
```

Preserve transfer carryover:

```typescript
city.productionProgress = city.productionProgress + transferableProduction;
```

- [ ] **Step 4: Tick legendary projects during the turn**

In `src/core/turn-manager.ts`, after city production and before wonder-effect notifications:

```typescript
newState = tickLegendaryWonderProjects(newState, bus);
```

Emit:

```typescript
bus.emit('wonder:legendary-ready', { civId, cityId, wonderId });
bus.emit('wonder:legendary-lost', { civId, cityId, wonderId, goldRefund, transferableProduction });
```

Also apply the reusable reward/effect plumbing for completed wonders:

```typescript
bus.emit('wonder:legendary-completed', { civId, cityId, wonderId });
// apply wonder-specific reward/effect state here
```

- [ ] **Step 5: Run system and turn-manager tests**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/legendary-wonder-system.test.ts tests/core/turn-manager.test.ts
```

Expected: PASS.

### Task 7a: Add Complete Wonder Reward And Effect Plumbing

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/legendary-wonder-definitions.ts`
- Modify: `src/systems/legendary-wonder-system.ts`
- Modify: `tests/systems/legendary-wonder-system.test.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Add failing tests for global race resolution and completion rewards**

Add regressions proving:

- only one civ can complete a given legendary wonder
- rival in-progress projects for that wonder immediately become `lost_race`
- the 25/25/50 compensation is applied to each losing city
- the winning civ receives the wonder-specific reward/effect

- [ ] **Step 2: Extend wonder definitions with explicit reward/effect metadata**

Each of the four flagship wonders must define the reward/effect it applies on completion. The framework only needs to support the effect patterns required by those four wonders, but it must do so completely.

- [ ] **Step 3: Persist completed-wonder ownership and applied effects in serializable game state**

Add explicit state for:

- completed legendary wonders
- owner civ
- completion city
- any ongoing reward/effect data needed by turn processing or UI

- [ ] **Step 4: Apply rewards/effects and global race resolution inside the completion path**

When a wonder completes:

- mark the winning project `completed`
- mark all rival projects for that `wonderId` as `lost_race`
- convert each losing rival's investment using the 25/25/50 rule
- apply the winning wonder's reward/effect immediately
- emit completion/loss events for the affected civs

- [ ] **Step 5: Run targeted reward/effect verification**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/legendary-wonder-system.test.ts tests/core/turn-manager.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

### Task 8: Build The Wonder UI And City UX

**Files:**
- Create: `src/ui/wonder-panel.ts`
- Modify: `src/ui/city-panel.ts`
- Modify: `src/main.ts`
- Create: `tests/ui/helpers/wonder-panel-fixture.ts`
- Create: `tests/ui/city-panel.test.ts`
- Create: `tests/ui/wonder-panel.test.ts`

- [ ] **Step 1: Create shared UI fixtures for the wonder panel and city panel**

Create `tests/ui/helpers/wonder-panel-fixture.ts` with a deterministic container/state builder used by both wonder-panel and city-panel tests.

- [ ] **Step 2: Write failing UI tests for three-phase clarity and loss messaging**

Create `tests/ui/wonder-panel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createWonderPanel } from '@/ui/wonder-panel';
import { makeWonderPanelFixture } from './helpers/wonder-panel-fixture';

describe('wonder-panel', () => {
  it('shows eligibility, quest steps, build city, and race compensation text', () => {
    const { container, state } = makeWonderPanelFixture();
    const panel = createWonderPanel(container, state, { onStartBuild: () => {}, onClose: () => {} });

    expect(panel.textContent).toContain('Eligibility');
    expect(panel.textContent).toContain('Quest');
    expect(panel.textContent).toContain('Construction Race');
    expect(panel.textContent).toContain('25% coins');
    expect(panel.textContent).toContain('25% carryover');
  });
});
```

- [ ] **Step 3: Create a dedicated wonder panel instead of overloading the city panel**

Create `src/ui/wonder-panel.ts` using DOM APIs:

```typescript
export interface WonderPanelCallbacks {
  onStartBuild: (cityId: string, wonderId: string) => void;
  onClose: () => void;
}

export function createWonderPanel(container: HTMLElement, state: GameState, callbacks: WonderPanelCallbacks): HTMLElement;
```

Panel sections:

```typescript
appendSection('Eligibility', 'Required techs, resources, and city conditions.');
appendSection('Quest', 'Complete every step before construction unlocks.');
appendSection('Construction Race', 'Losing returns 25% coins and 25% city carryover.');
```

The panel must also surface:

- concrete eligibility failures for the selected city
- explicit quest-step progress
- visible race status for the selected project
- completed reward/effect summary once a wonder is claimed

- [ ] **Step 4: Add a wonder entry point in the city panel**

In `src/ui/city-panel.ts`, add a `"Legendary Wonders"` launch button next to current tabs:

```typescript
export interface CityPanelCallbacks {
  onBuild: (cityId: string, itemId: string) => void;
  onOpenWonderPanel: (cityId: string) => void;
  onClose: () => void;
}

const wondersButton = document.createElement('button');
wondersButton.textContent = 'Legendary Wonders';
wondersButton.addEventListener('click', () => callbacks.onOpenWonderPanel(city.id));
```

Also surface city carryover:

```typescript
const carryoverEl = document.createElement('div');
carryoverEl.textContent = `Wonder carryover: ${project.transferableProduction}`;
```

- [ ] **Step 5: Wire the panel through `src/main.ts` and test the city-panel affordance**

In `src/main.ts`, add the callback path that opens `createWonderPanel(...)` from the city panel and closes it cleanly when the player starts a build or dismisses the panel.

Create `tests/ui/city-panel.test.ts` with:

```typescript
it('renders a Legendary Wonders entry point and shows carryover in the active city', () => {
  const { container, city, state } = makeWonderPanelFixture();
  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
  });

  expect(panel.textContent).toContain('Legendary Wonders');
  expect(panel.textContent).toContain('Wonder carryover');
});
```

- [ ] **Step 6: Run the UI tests**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/ui/wonder-panel.test.ts tests/ui/city-panel.test.ts
```

Expected: PASS.

### Task 9: Add AI Behavior, Espionage Visibility Hook, And Save Coverage

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/systems/legendary-wonder-system.ts`
- Modify: `src/systems/espionage-system.ts`
- Modify: `tests/ai/basic-ai.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Add failing AI test for abandoning a losing race**

Append to `tests/ai/basic-ai.test.ts`:

```typescript
it('abandons a legendary wonder race when a rival is far ahead and reuses the carryover in the same city', () => {
  const state = makeLegendaryWonderAiFixture({ losingRace: true });
  const result = processAiTurn(state, 'ai-1', new EventBus());
  expect(result.legendaryWonderProjects!['grand-canal'].phase).toBe('lost_race');
  expect(result.cities['city-ai-1'].productionQueue[0]).toBe('granary');
});
```

- [ ] **Step 2: Hook wonder-start visibility into the espionage state**

In `src/systems/legendary-wonder-system.ts`, when a wonder build starts:

```typescript
for (const [observerId, esp] of Object.entries(state.espionage ?? {})) {
  const seesBuilder = Object.values(esp.spies).some(
    spy => spy.targetCivId === civId && spy.status !== 'captured',
  );
  if (seesBuilder) {
    bus.emit('wonder:legendary-race-revealed', { observerId, civId, cityId, wonderId });
  }
}
```

- [ ] **Step 3: Add a regression proving espionage sabotage interacts correctly with legendary wonder builds**

Append to `tests/systems/legendary-wonder-system.test.ts`:

```typescript
it('reduces legendary wonder progress when sabotage production succeeds', () => {
  const state = makeLegendaryWonderFixture({ buildingWonder: true, investedProduction: 120 });
  const result = applyLegendaryWonderSabotage(state, 'city-river', 40);
  expect(result.legendaryWonderProjects!['grand-canal'].investedProduction).toBe(80);
});
```

- [ ] **Step 4: Teach AI to pursue realistic wonders only**

In `src/ai/basic-ai.ts`:

```typescript
const eligible = getEligibleLegendaryWonders(newState, civId, cityId);
const preferred = eligible.filter(id => matchesAiWonderBias(civ.personality, id));
```

Abandon when:

```typescript
if (project.phase === 'building' && rivalProgress >= project.investedProduction * 1.5) {
  // lose race intentionally, take carryover, switch city queue
}
```

When abandoning, the AI must choose the next building by highest city need rather than a hardcoded fallback. Priority order:

- defense if the city lacks core protection
- food/growth if the city is starving or no longer growing
- production if output is weak
- military if threat pressure is high
- otherwise the best weighted normal building choice

- [ ] **Step 5: Add save regression for legendary wonder state**

Append to `tests/storage/save-persistence.test.ts`:

```typescript
it('round-trips legendary wonder projects and carryover through JSON serialization', () => {
  const state = {
    legendaryWonderProjects: {
      'grand-canal': {
        wonderId: 'grand-canal',
        ownerId: 'player',
        cityId: 'city-river',
        phase: 'building',
        investedProduction: 120,
        transferableProduction: 30,
        questSteps: [{ id: 'connect-two-cities', description: 'Connect two cities', completed: true }],
      },
    },
  };
  const roundTrip = JSON.parse(JSON.stringify(state));
  expect(roundTrip.legendaryWonderProjects['grand-canal'].transferableProduction).toBe(30);
});
```

- [ ] **Step 6: Run Slice 2 targeted verification**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/legendary-wonder-system.test.ts tests/ui/wonder-panel.test.ts tests/ui/city-panel.test.ts tests/core/turn-manager.test.ts tests/ai/basic-ai.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

### Task 10: Slice 2 Release Gate

**Files:**
- Modify: `docs/superpowers/specs/2026-04-07-m4d-grand-ambitions-design.md` only if a concrete implementation clarification was required

- [ ] **Step 1: Run full build and full test suite**

Run:

```bash
eval "$(mise activate bash)" && yarn build
eval "$(mise activate bash)" && yarn test --run
```

Expected: PASS.

- [ ] **Step 2: Create the slice branch**

Run:

```bash
git pull --ff-only origin main
git checkout -b feature/m4d-slice2-legendary-wonders
```

- [ ] **Step 3: Commit the slice**

Run:

```bash
git add src/core/types.ts src/systems/legendary-wonder-definitions.ts src/systems/legendary-wonder-system.ts src/systems/city-system.ts src/core/turn-manager.ts src/ui/city-panel.ts src/ui/wonder-panel.ts src/main.ts src/ai/basic-ai.ts tests/systems/helpers/legendary-wonder-fixture.ts tests/ui/helpers/wonder-panel-fixture.ts tests/systems/legendary-wonder-system.test.ts tests/ui/city-panel.test.ts tests/ui/wonder-panel.test.ts tests/core/turn-manager.test.ts tests/ai/basic-ai.test.ts tests/storage/save-persistence.test.ts
git commit -m "feat(m4d): ship legendary quest wonders slice"
```

- [ ] **Step 4: Push and open the MR/PR**

Run:

```bash
git push -u origin feature/m4d-slice2-legendary-wonders
gh pr create --base main --head feature/m4d-slice2-legendary-wonders --title "feat(m4d): ship legendary quest wonders slice" --body "## Summary\n- add legendary wonder system and four flagship wonders\n- add wonder panel and city UX for the three-phase flow\n- add AI race logic and 25/25/50 compensation\n\n## Verification\n- yarn build\n- yarn test --run"
```

- [ ] **Step 5: Merge, delete branch, refresh `main`, and clean up the Slice 1/2 worktrees only after confirming their merged commits landed on `origin/main`**

Run:

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --ff-only origin main
git branch --remotes --contains <slice1-fix-merge-commit>
git branch --remotes --contains <slice2-merge-commit>
git worktree remove .worktrees/feature-m4d-slice1-breakaway
git worktree remove .worktrees/feature-m4d-slice2-legendary-wonders
```

Expected: both merged commits are reachable from `origin/main` before either worktree is removed.

---

## Slice 3: Digital Espionage, Artisan, And M4d Civs

### Task 11: Add Stage 5 Types, Techs, And Failing Tests

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/tech-definitions.ts`
- Modify: `tests/systems/tech-definitions.test.ts`
- Modify: `tests/systems/espionage-system.test.ts`

- [ ] **Step 1: Add failing tests for Stage 5 mission unlocks**

Append to `tests/systems/espionage-system.test.ts`:

```typescript
it('unlocks Stage 5 missions from digital-surveillance and cyber-warfare', () => {
  const missions = getAvailableMissions([
    'espionage-scouting',
    'espionage-informants',
    'spy-networks',
    'cryptography',
    'digital-surveillance',
    'cyber-warfare',
  ]);

  expect(missions).toContain('cyber_attack');
  expect(missions).toContain('misinformation_campaign');
  expect(missions).toContain('election_interference');
  expect(missions).toContain('satellite_surveillance');
});
```

- [ ] **Step 2: Add failing tech-definition coverage**

Append to `tests/systems/tech-definitions.test.ts`:

```typescript
it('adds Stage 5 espionage techs after counter-intelligence', () => {
  const ids = TECH_TREE.filter(t => t.track === 'espionage').map(t => t.id);
  expect(ids).toContain('digital-surveillance');
  expect(ids).toContain('cyber-warfare');
});
```

- [ ] **Step 3: Add Stage 5 mission types and the Artisan advisor type**

In `src/core/types.ts`, extend:

```typescript
export type SpyMissionType =
  // existing missions...
  | 'cyber_attack'
  | 'misinformation_campaign'
  | 'election_interference'
  | 'satellite_surveillance';

export type AdvisorType =
  | 'builder'
  | 'explorer'
  | 'chancellor'
  | 'warchief'
  | 'treasurer'
  | 'scholar'
  | 'spymaster'
  | 'artisan';
```

- [ ] **Step 4: Add concrete Stage 5 techs**

In `src/systems/tech-definitions.ts`, append:

```typescript
{ id: 'digital-surveillance', name: 'Digital Surveillance', track: 'espionage', cost: 175, prerequisites: ['cryptography', 'counter-intelligence'], unlocks: ['Satellite Surveillance', 'Misinformation Campaign'], era: 5 },
{ id: 'cyber-warfare', name: 'Cyber Warfare', track: 'espionage', cost: 185, prerequisites: ['digital-surveillance'], unlocks: ['Cyber Attack', 'Election Interference'], era: 5 },
```

- [ ] **Step 5: Run the failing tests**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/tech-definitions.test.ts tests/systems/espionage-system.test.ts
```

Expected: FAIL on missing mission logic.

### Task 12: Implement Stage 5 Espionage, Double Agents, And Panel UX

**Files:**
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/systems/fog-of-war.ts`
- Modify: `src/ui/espionage-panel.ts`
- Modify: `tests/systems/espionage-system.test.ts`
- Modify: `tests/core/turn-manager.test.ts`
- Modify: `tests/systems/fog-of-war.test.ts`
- Modify: `tests/ui/espionage-panel.test.ts`

- [ ] **Step 1: Implement Stage 5 missions with the allowed simplification**

In `src/systems/espionage-system.ts`, add mission config:

```typescript
cyber_attack: 0.45,
misinformation_campaign: 0.55,
election_interference: 0.40,
satellite_surveillance: 0.70,
```

And durations:

```typescript
cyber_attack: 2,
misinformation_campaign: 3,
election_interference: 5,
satellite_surveillance: 1,
```

Important: `election_interference` must use the permitted stability-penalty version because governments are not implemented:

```typescript
case 'election_interference':
  return { stabilityPenaltyTurns: 15, unrestInjected: 20 };
```

- [ ] **Step 2: Add remote-capable mission rules explicitly**

Implement:

```typescript
export function missionRequiresPlacedSpy(missionType: SpyMissionType): boolean {
  return !['cyber_attack', 'misinformation_campaign', 'satellite_surveillance'].includes(missionType);
}
```

For remote missions:

```typescript
if (!missionRequiresPlacedSpy(missionType)) {
  // Allow launch from idle/stationed spy owned by the civ without target-city placement.
}
```

- [ ] **Step 3: Add Stage 5 effect plumbing and double-agent handling**

In `src/systems/espionage-system.ts`, wire each mission into real game state:

```typescript
case 'cyber_attack':
  return { productionDisabledTurns: 3 };
case 'misinformation_campaign':
  return { researchPenaltyTurns: 10, researchPenaltyMultiplier: 0.2 };
case 'satellite_surveillance':
  return { grantTerritoryVision: true };
```

Add double-agent support:

```typescript
// Add to Spy
turnedBy?: string;
feedsFalseIntel?: boolean;

export function turnCapturedSpy(state: EspionageState, captorId: string, spyOwner: string, spyId: string): EspionageState;
export function verifyAgent(state: EspionageCivState, spyId: string): EspionageCivState;
```

- [ ] **Step 4: Apply Stage 5 temporary effects during turn processing**

In `src/core/turn-manager.ts`, add explicit handling for:

```typescript
productionDisabledTurns
researchPenaltyTurns
researchPenaltyMultiplier
```

Rules:

- `cyber_attack` must shut down target-city production for exactly 3 turns
- `misinformation_campaign` must reduce research gains for exactly 10 turns
- penalties must decay deterministically at end of each affected civ turn

Add a failing regression in `tests/core/turn-manager.test.ts` proving the effect expires on schedule.

- [ ] **Step 5: Update the panel to explain remote vs placed operations and show confidence/threat data**

In `src/ui/espionage-panel.ts`, render badges:

```typescript
const accessLabel = missionRequiresPlacedSpy(m.id) ? 'Requires placed spy' : 'Remote-capable';
const riskLabel = m.id === 'election_interference' ? 'Applies stability penalty; does not change government' : defaultRisk;
const chanceLabel = `Success: ${Math.round(getSpySuccessChance(...args) * 100)}%`;
```

The Stage 5 section must display:

```typescript
title: 'Stage 5: Digital Warfare'
description: 'Remote disruption and global surveillance. Higher stakes, higher diplomatic fallout.'
```

Threat board requirements:

```typescript
appendSectionHeader(threatBlock, 'Threat Board', 'Detected foreign spy activity in your cities.');
```

- [ ] **Step 6: Add targeted Stage 5 tests**

Add to `tests/ui/espionage-panel.test.ts`:

```typescript
it('labels Stage 5 remote-capable missions clearly and does not leak other players data in hot seat', () => {
  const state = makeEspUiState();
  state.currentPlayer = 'player-2';
  state.civilizations['player-2'] = { ...state.civilizations.player, id: 'player-2', cities: ['city-player-1'] } as any;
  state.civilizations['player-2'].techState.completed = ['digital-surveillance', 'cyber-warfare'];

  const panel = createEspionagePanel(state) as any;
  expect(panel.textContent).toContain('Remote-capable');
  expect(panel.textContent).toContain('Digital Warfare');
});
```

Add to `tests/systems/fog-of-war.test.ts`:

```typescript
it('satellite surveillance grants territory vision without permanently mutating base visibility rules', () => {
  const state = makeSatelliteVisionFixture();
  const result = applySatelliteSurveillance(state, 'player', 'ai-1');
  expect(result.civilizations.player.visibility.tiles['5,5']).toBe('visible');
});
```

Add to `tests/integration/m4a-espionage-integration.test.ts`:

```typescript
it('handles double-agent deception and verify-agent exposure deterministically', () => {
  const state = makeStage5IntegrationFixture();
  // capture -> turn -> false intel -> verify -> exposure
  expect(runStage5Lifecycle(state).exposedDoubleAgent).toBe(true);
});
```

- [ ] **Step 6: Run targeted Stage 5 tests**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/espionage-system.test.ts tests/core/turn-manager.test.ts tests/systems/fog-of-war.test.ts tests/ui/espionage-panel.test.ts tests/integration/m4a-espionage-integration.test.ts
```

Expected: PASS.

### Task 13: Add The Artisan Advisor And Wonder-Focused Messaging

**Files:**
- Modify: `src/core/game-state.ts`
- Modify: `src/ui/advisor-system.ts`
- Modify: `tests/ui/advisor-system.test.ts`

- [ ] **Step 1: Add failing Artisan tests**

Append to `tests/ui/advisor-system.test.ts`:

```typescript
it('shows Artisan guidance when a legendary wonder is eligible but not started', () => {
  const bus = new EventBus();
  const advisor = new AdvisorSystem(bus);
  const state = makeState() as any;
  state.tutorial.active = false;
  state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: true };
  state.legendaryWonderProjects = {
    'oracle-of-delphi': {
      wonderId: 'oracle-of-delphi',
      ownerId: 'player',
      cityId: 'city-1',
      phase: 'ready_to_build',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [],
    },
  };

  const messages: any[] = [];
  bus.on('advisor:message', msg => messages.push(msg));
  advisor.check(state);

  expect(messages[0].advisor).toBe('artisan');
  expect(messages[0].message).toMatch(/wonder/i);
});
```

- [ ] **Step 2: Initialize the new advisor in game-state defaults**

In `src/core/game-state.ts`, update both settings initializers:

```typescript
advisorsEnabled: {
  builder: true,
  explorer: true,
  chancellor: true,
  warchief: true,
  treasurer: true,
  scholar: true,
  spymaster: true,
  artisan: true,
},
```

- [ ] **Step 3: Add concrete Artisan messages for ready, race, completion, and loss states**

In `src/ui/advisor-system.ts`, append:

```typescript
{
  id: 'artisan_legendary_ready',
  advisor: 'artisan',
  icon: '🎨',
  message: 'A legendary wonder now lies within our grasp. Choose the city carefully — greatness needs the right stage.',
  trigger: (state) => Object.values(state.legendaryWonderProjects ?? {}).some(
    p => p.ownerId === state.currentPlayer && p.phase === 'ready_to_build',
  ),
},
{
  id: 'artisan_race_warning',
  advisor: 'artisan',
  icon: '🎨',
  message: 'Another civilization is closing in on a wonder we covet. If we delay, our legacy will belong to someone else.',
  trigger: (state) => Object.values(state.legendaryWonderProjects ?? {}).some(
    p => p.ownerId === state.currentPlayer && p.phase === 'building' && p.investedProduction > 0,
  ),
},
{
  id: 'artisan_wonder_complete',
  advisor: 'artisan',
  icon: '🎨',
  message: 'Magnificent. Our wonder is complete, and our legacy now has a shape the world can see.',
  trigger: (state) => Object.values(state.legendaryWonderProjects ?? {}).some(
    p => p.ownerId === state.currentPlayer && p.phase === 'completed',
  ),
},
{
  id: 'artisan_wonder_lost',
  advisor: 'artisan',
  icon: '🎨',
  message: 'A rival has claimed the wonder we sought. We salvaged part of the effort, but the glory is theirs.',
  trigger: (state) => Object.values(state.legendaryWonderProjects ?? {}).some(
    p => p.ownerId === state.currentPlayer && p.phase === 'lost_race',
  ),
},
```

- [ ] **Step 4: Run Artisan tests**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/ui/advisor-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add a hot-seat regression proving Artisan only comments on the current player’s wonder state**

Append to `tests/ui/advisor-system.test.ts`:

```typescript
it('does not surface another human players wonder state in hot seat', () => {
  const bus = new EventBus();
  const advisor = new AdvisorSystem(bus);
  const state = makeState() as any;
  state.currentPlayer = 'player-2';
  state.legendaryWonderProjects = {
    'oracle-of-delphi': { wonderId: 'oracle-of-delphi', ownerId: 'player', cityId: 'city-1', phase: 'ready_to_build', investedProduction: 0, transferableProduction: 0, questSteps: [] },
  };
  state.settings.advisorsEnabled.artisan = true;

  const messages: any[] = [];
  bus.on('advisor:message', msg => messages.push(msg));
  advisor.check(state);

  expect(messages).toHaveLength(0);
});
```

### Task 14: Add M4d Civs, Bonus Wiring, And Final AI Coverage

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/civ-definitions.ts`
- Modify: `src/systems/resource-system.ts`
- Modify: `src/systems/combat-system.ts`
- Modify: `src/systems/fog-of-war.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/systems/civ-definitions.test.ts`
- Modify: `tests/ai/basic-ai.test.ts`
- Modify: `tests/storage/save-persistence.test.ts`

- [ ] **Step 1: Add failing civ-definition tests**

Append to `tests/systems/civ-definitions.test.ts`:

```typescript
it('includes the three M4d civilizations', () => {
  expect(getCivDefinition('lothlorien')).toBeDefined();
  expect(getCivDefinition('narnia')).toBeDefined();
  expect(getCivDefinition('atlantis')).toBeDefined();
});
```

- [ ] **Step 2: Add concrete bonus types and civ definitions**

In `src/core/types.ts`, extend `CivBonusEffect`:

```typescript
| { type: 'forest_guardians'; defenseBonus: number; visionBonus: number; concealmentInForest: boolean; forestYieldBonus: number }
| { type: 'allied_kingdoms'; treatyRelationshipBonus: number; allianceYieldBonus: number }
| { type: 'coastal_science'; coastalScienceBonus: number; navalProductionBonus: number; navalCombatBonus: number };
```

In `src/systems/civ-definitions.ts`, append:

```typescript
{
  id: 'lothlorien',
  name: 'Lothlorien',
  color: '#4d7c0f',
  bonusName: 'Forest Guardians',
  bonusDescription: 'Forest cities and units are harder to pin down, with stronger forests and hidden movement through woods',
  bonusEffect: { type: 'forest_guardians', defenseBonus: 0.2, visionBonus: 1, concealmentInForest: true, forestYieldBonus: 1 },
  personality: { traits: ['diplomatic', 'expansionist'], warLikelihood: 0.25, diplomacyFocus: 0.7, expansionDrive: 0.4 },
},
{
  id: 'narnia',
  name: 'Narnia',
  color: '#60a5fa',
  bonusName: 'Allied Kingdoms',
  bonusDescription: 'Treaties build stronger relationships and alliances improve empire yields',
  bonusEffect: { type: 'allied_kingdoms', treatyRelationshipBonus: 10, allianceYieldBonus: 2 },
  personality: { traits: ['diplomatic', 'aggressive'], warLikelihood: 0.35, diplomacyFocus: 0.8, expansionDrive: 0.5 },
},
{
  id: 'atlantis',
  name: 'Atlantis',
  color: '#0f766e',
  bonusName: 'Tidebound Knowledge',
  bonusDescription: 'Coastal cities gain extra science and naval forces are built and fight more effectively',
  bonusEffect: { type: 'coastal_science', coastalScienceBonus: 1, navalProductionBonus: 0.15, navalCombatBonus: 0.15 },
  personality: { traits: ['trader', 'expansionist'], warLikelihood: 0.3, diplomacyFocus: 0.6, expansionDrive: 0.7 },
},
```

- [ ] **Step 3: Wire the bonuses where they actually apply**

In `src/systems/resource-system.ts`:

```typescript
if (civBonus?.type === 'coastal_science' && tile.terrain === 'coast') {
  yields.science += civBonus.coastalScienceBonus;
}
if (civBonus?.type === 'forest_guardians' && tile.terrain === 'forest') {
  yields.food += civBonus.forestYieldBonus;
}
```

In `src/systems/combat-system.ts`:

```typescript
if (civBonus?.type === 'forest_guardians' && defTile?.terrain === 'forest') {
  defStrength *= 1 + civBonus.defenseBonus;
}
if (civBonus?.type === 'coastal_science' && attacker.type === 'galley') {
  attStrength *= 1 + civBonus.navalCombatBonus;
}
```

In `src/systems/fog-of-war.ts`, add the minimum concealment hook needed for Lothlorien:

```typescript
if (unit.ownerCivBonus?.type === 'forest_guardians' && unit.ownerCivBonus.concealmentInForest && tile?.terrain === 'forest') {
  // Treat as fog-hidden unless adjacent or at war with direct contact.
}
```

In `src/ai/basic-ai.ts`, bias the new civs:

```typescript
if (civ.civType === 'atlantis') wonderBias.push('internet');
if (civ.civType === 'narnia') diplomacyWeight += 0.3;
if (civ.civType === 'lothlorien') homelandDefenseWeight += 0.2;
```

- [ ] **Step 4: Add late-game AI and serialization coverage**

Append to `tests/ai/basic-ai.test.ts`:

```typescript
it('uses remote Stage 5 espionage when the civ has cyber-warfare tech', () => {
  const state = makeStage5AiFixture({ civType: 'annuvin', completedTechs: ['digital-surveillance', 'cyber-warfare'] });
  const result = processAiTurn(state, 'ai-1', new EventBus());
  expect(result.aiDecisions.some(d => d.type === 'stage5-espionage')).toBe(true);
});
```

Append to `tests/systems/civ-definitions.test.ts`:

```typescript
it('keeps Lothlorien forest concealment and Atlantis naval power in the M4d roster', () => {
  expect(getCivDefinition('lothlorien')!.bonusDescription).toMatch(/forest/i);
  expect(getCivDefinition('atlantis')!.bonusDescription).toMatch(/naval/i);
});
```

Append to `tests/storage/save-persistence.test.ts`:

```typescript
it('round-trips artisan settings and Stage 5 espionage state through JSON serialization', () => {
  const state = {
    settings: { advisorsEnabled: { artisan: true } },
    espionage: { player: { spies: { 'spy-1': { id: 'spy-1', owner: 'player', name: 'Agent Echo', status: 'idle' } } } },
  };
  const roundTrip = JSON.parse(JSON.stringify(state));
  expect(roundTrip.settings.advisorsEnabled.artisan).toBe(true);
  expect(roundTrip.espionage.player.spies['spy-1'].name).toBe('Agent Echo');
});
```

- [ ] **Step 5: Run Slice 3 targeted verification**

Run:

```bash
eval "$(mise activate bash)" && yarn test --run tests/systems/tech-definitions.test.ts tests/systems/espionage-system.test.ts tests/ui/espionage-panel.test.ts tests/ui/advisor-system.test.ts tests/systems/civ-definitions.test.ts tests/ai/basic-ai.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

### Task 15: Slice 3 Release Gate

**Files:**
- Modify: `docs/superpowers/specs/2026-04-07-m4d-grand-ambitions-design.md` only if an implementation clarification was required

- [ ] **Step 1: Run final build and full suite**

Run:

```bash
eval "$(mise activate bash)" && yarn build
eval "$(mise activate bash)" && yarn test --run
```

Expected: PASS.

- [ ] **Step 2: Create the slice branch**

Run:

```bash
git pull --ff-only origin main
git checkout -b feature/m4d-slice3-digital-espionage
```

- [ ] **Step 3: Commit the slice**

Run:

```bash
git add src/core/types.ts src/core/game-state.ts src/core/turn-manager.ts src/systems/tech-definitions.ts src/systems/espionage-system.ts src/systems/fog-of-war.ts src/systems/civ-definitions.ts src/systems/resource-system.ts src/systems/combat-system.ts src/systems/unit-system.ts src/ui/espionage-panel.ts src/ui/advisor-system.ts src/ai/basic-ai.ts tests/systems/tech-definitions.test.ts tests/systems/espionage-system.test.ts tests/systems/fog-of-war.test.ts tests/core/turn-manager.test.ts tests/ui/espionage-panel.test.ts tests/ui/advisor-system.test.ts tests/ui/advisor-spymaster.test.ts tests/systems/civ-definitions.test.ts tests/ai/basic-ai.test.ts tests/integration/m4a-espionage-integration.test.ts tests/storage/save-persistence.test.ts
git commit -m "feat(m4d): ship digital espionage and artisan slice"
```

- [ ] **Step 4: Push and open the MR/PR**

Run:

```bash
git push -u origin feature/m4d-slice3-digital-espionage
gh pr create --base main --head feature/m4d-slice3-digital-espionage --title "feat(m4d): ship digital espionage and artisan slice" --body "## Summary\n- add Stage 5 espionage and Stage 5 techs\n- add Artisan advisor and M4d civ roster\n- add AI and UI support for late-game ambition systems\n\n## Verification\n- yarn build\n- yarn test --run"
```

- [ ] **Step 5: Merge, delete branch, and refresh `main`**

Run:

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --ff-only origin main
```

---

## Plan Review Checklist

Run this review before implementation begins and again after any major plan edits:

- [ ] Spec coverage check: Slice 1 covers secession, 50-turn establishment, reconquest, reabsorption, AI, UI, and save/load.
- [ ] Spec coverage check: Slice 2 covers three-phase commitment, four flagship wonders, complete reward/effect plumbing, global race resolution, 25/25/50 loss rule, AI, UI, and save/load.
- [ ] Spec coverage check: Slice 3 covers Stage 5 espionage, Artisan advisor, M4d civs, Stage 5 tech unlocks, AI, UI, and save/load.
- [ ] UI/UX check: Every slice includes visible countdowns, risk/explanation text, and no hidden state changes.
- [ ] Test check: Every conjunctive rule has a negative test proving that partial conditions are insufficient.
- [ ] Rules check: No `Math.random()`, no hardcoded `'player'`, no event-only state mutation, no unrendered computed data.
- [ ] Merge-flow check: Each slice has its own branch, verification, push, MR/PR, merge, and refresh of `main`.
