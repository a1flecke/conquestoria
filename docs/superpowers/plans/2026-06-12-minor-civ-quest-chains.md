# Minor-Civilization Quest Chains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement era-aware, archetype-specific three-step minor-civilization quest chains that end in a durable, player-scoped alliance without impossible objectives, cross-player progress, or information leaks.

**Architecture:** Static chain definitions select typed quest-objective handlers. Canonical gameplay mutations feed actor-attributed facts into a pure chain lifecycle, while `minor-civ-system.ts` applies immutable state changes and emits transition-owned events. Viewer-safe presentation helpers are the only route into diplomacy UI and notifications.

**Tech Stack:** TypeScript, Vitest, jsdom, Canvas/DOM game UI, event bus, serializable plain-object `GameState`, Vite.

---

## Scope And Delivery Shape

This is one gameplay feature with ordered dependencies, not a set of independently releasable user features. The tasks below keep every intermediate commit compiling and tested, but player-visible chain controls do not ship until the canonical systems, privacy boundary, persistence, and transition logic are all present.

## Binding Review Corrections

These corrections supersede narrower examples later in the plan:

- Gameplay helpers return state plus transitions and never emit internally. Every live caller assigns the returned state before calling `emitMinorCivQuestTransitions`, because notification listeners read and mutate the authoritative state through `getState()`.
- Attacking a minor-civilization unit or assaulting its city must first call the canonical bilateral war helper. Combat legality treats a neutral or allied minor civilization as non-hostile until that transition succeeds.
- `advisor-system.ts` and its tests are in scope. Advisor quest lookup is viewer-scoped, and every alliance trigger uses `isMinorCivAllianceActive` rather than raw relationship.
- Route feasibility includes queued production and production ETA. A trainable caravan qualifies only if it can finish and establish the route within the objective's remaining turns.
- Cultural chain definitions contain explicit era variants. Eras 1-3 use culturally named patronage and festival/delegation objectives; Era 4 may prefer exchange routes. Tests cover the title and preferred objective for every era.
- Chain quest metadata and chain status are discriminated unions. Partial `chainId`/`stepIndex`, pending without an expiry/index, and allied/broken records with pending fields are invalid save data.
- Shared military credit is intentional: one canonical defeat or camp action may advance multiple issuer assignments only when each independently matches the actor, target, hostility, visibility/remembered-intel rule, and radius. Add a regression and balance assertion.
- Pending retry lasts ten inclusive turns. On timeout it clears without relationship penalty, installs the standard cooldown, and allows normal quests to resume. AI receives minimal assigned gift/festival pursuit and assigned-route prioritization so its chains do not become inert.
- Legacy normalization seeds `lastNotifiedStatusByCiv` from current effective status rather than `{}`, preventing first-turn notification bursts.

Implementation work stays in the existing isolated worktree:

```text
/Users/aaronfleckenstein/development/github/conquestoria/.worktrees/issue-352-quest-chains-design
```

Read before implementation:

- `CLAUDE.md`
- `.claude/rules/game-systems.md`
- `.claude/rules/ui-panels.md`
- `.claude/rules/strategy-game-mechanics.md`
- `.claude/rules/end-to-end-wiring.md`
- `.claude/rules/spec-fidelity.md`
- `.claude/rules/incremental-mr-completion.md`
- `docs/superpowers/plans/README.md`
- `docs/superpowers/specs/2026-06-12-minor-civ-quest-chains-design.md`

## File Responsibility Map

### Create

- `src/systems/quest-chain-definitions.ts`: static chain catalog, era tuning, chain lookup, deterministic priority.
- `src/systems/quest-objective-system.ts`: exhaustive objective registry, feasibility, target creation, validation, descriptions, and actor-attributed progress.
- `src/systems/quest-chain-system.ts`: pure chain eligibility, pending/advance/expiry/invalidation/alliance transitions.
- `src/systems/minor-civ-actions.ts`: canonical gift, festival, war, and peace mutations.
- `tests/systems/quest-chain-definitions.test.ts`: archetype and definition completeness.
- `tests/systems/quest-objective-system.test.ts`: target feasibility, reality bounds, resource conjunctions, and attribution.
- `tests/systems/quest-chain-system.test.ts`: state-machine transition table and one-time transition behavior.
- `tests/systems/minor-civ-actions.test.ts`: gifts, festivals, bilateral war/peace, and alliance break behavior.

### Modify

- `src/core/types.ts`: runtime catalogs, festival target, chain metadata/state, quest action/transition types, event payloads.
- `src/core/game-state.ts`: initialize new typed minor-civ maps.
- `src/core/id-counters.ts`: scan quest values rather than assignment keys.
- `src/storage/save-manager.ts`: normalize legacy and invalid chain state.
- `src/systems/quest-system.ts`: delegate normal quest generation and completion semantics to the objective registry.
- `src/systems/quest-presentation.ts`: replace naked-quest presentation with assignment-scoped projection.
- `src/systems/minor-civ-system.ts`: immutable quest orchestration, rewards, cooldowns, alliance bonuses, relationship statuses, destruction cleanup.
- `src/systems/barbarian-system.ts`: emit camp-destruction quest facts at the mutation source.
- `src/systems/combat-reward-system.ts`: emit unit-defeat quest facts at the actor-agnostic combat mutation source.
- `src/systems/trade-system.ts`: emit route-created quest facts at the route mutation source.
- `src/systems/council-system.ts`: consume scoped quest presentation.
- `src/ui/diplomacy-panel.ts`: render chain states and expose gift/festival actions.
- `src/ui/minor-civ-notifications.ts`: format owner-scoped chain transitions.
- `src/ui/minor-civ-notification-listeners.ts`: route new events by explicit recipient.
- `src/main.ts`: delegate UI callbacks to canonical actions and rerender the open panel.
- `tests/core/game-state.test.ts`, `tests/core/migrate-id-counters.test.ts`, `tests/storage/save-persistence.test.ts`: initialization and persistence.
- `tests/systems/quest-system.test.ts`, `tests/systems/minor-civ-system.test.ts`, `tests/systems/barbarian-system.test.ts`, `tests/systems/combat-reward-system.test.ts`, `tests/systems/trade-system.test.ts`, `tests/systems/council-system.test.ts`: integration regressions.
- `tests/ui/diplomacy-panel.test.ts`, `tests/ui/minor-civ-notifications.test.ts`, `tests/ui/minor-civ-notification-listeners.test.ts`: visible behavior and hot-seat privacy.
- Test fixtures containing `MinorCivState`: add the new required typed maps.

## Task 1: Add Runtime Catalogs And Typed State Foundations

**Files:**
- Modify: `src/core/types.ts:825-884`
- Modify: `src/core/types.ts:1269-1278`
- Modify: `src/core/game-state.ts:276-299`
- Modify: `src/systems/minor-civ-system.ts:95-114`
- Modify: `src/systems/minor-civ-system.ts:486-507`
- Modify: test fixtures found by `rg -n "activeQuests:" tests src`
- Test: `tests/core/game-state.test.ts`

- [ ] **Step 1: Write failing new-game initialization assertions**

Add assertions to the existing minor-civilization creation tests:

```ts
for (const mc of Object.values(state.minorCivs)) {
  expect(mc.chainStatusByCiv).toEqual({});
  expect(mc.questCooldownUntilByCiv).toEqual({});
  expect(mc.lastNotifiedStatusByCiv).toEqual({});
}
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/game-state.test.ts
```

Expected: FAIL because the three maps are absent.

- [ ] **Step 3: Add the catalogs and state types**

Replace the hand-written unions and extend the quest/minor-civ types:

```ts
export const MINOR_CIV_ARCHETYPES = ['militaristic', 'mercantile', 'cultural'] as const;
export type MinorCivArchetype = typeof MINOR_CIV_ARCHETYPES[number];

export const QUEST_TYPES = [
  'destroy_camp',
  'gift_gold',
  'defeat_units',
  'trade_route',
  'sponsor_festival',
] as const;
export type QuestType = typeof QUEST_TYPES[number];

export type QuestTarget =
  | { type: 'destroy_camp'; campId: string }
  | { type: 'gift_gold'; amount: number }
  | { type: 'defeat_units'; count: number; nearPosition: HexCoord; radius: number; cityId?: string }
  | { type: 'trade_route'; minorCivId: string }
  | { type: 'sponsor_festival'; amount: number; requiresLuxury: true };

export type Quest = {
  id: string;
  type: QuestType;
  description: string;
  target: QuestTarget;
  cityId?: string;
  reward: QuestReward;
  progress: number;
  status: 'active' | 'completed' | 'expired';
  turnIssued: number;
  expiresOnTurn: number | null;
} & (
  | { chainId?: never; stepIndex?: never }
  | { chainId: string; stepIndex: 0 | 1 | 2 }
);

export type MinorCivChainStatus =
  | { chainId: string; status: 'pending'; statusTurn: number; pendingStepIndex: 0 | 1 | 2; pendingExpiresOnTurn: number }
  | { chainId: string; status: 'allied'; statusTurn: number; earnedTurn: number }
  | { chainId: string; status: 'broken'; statusTurn: number; earnedTurn: number };

export type MinorCivRelationshipStatus = 'at-war' | 'hostile' | 'neutral' | 'friendly' | 'allied';
```

Add the required maps to `MinorCivState`. Remove `chainNext` and `minorCivId` from new quest state. Extend `GameEventMap` with:

```ts
'minor-civ:quest-progressed': { minorCivId: string; majorCivId: string; quest: Quest };
'minor-civ:quest-retargeted': { minorCivId: string; majorCivId: string; quest: Quest };
'minor-civ:quest-cancelled': { minorCivId: string; majorCivId: string; chainId: string; stepIndex: number };
'minor-civ:quest-chain-pending': { minorCivId: string; majorCivId: string; chainId: string; stepIndex: number };
'minor-civ:alliance-broken': { minorCivId: string; majorCivId: string; chainId: string };
```

Change the existing relationship event to use the shared status type:

```ts
'minor-civ:relationship-threshold': {
  minorCivId: string;
  majorCivId: string;
  newStatus: MinorCivRelationshipStatus;
};
```

- [ ] **Step 4: Initialize every production `MinorCivState`**

Use these exact fields in both placed-minor-civ and evolved-camp creation:

```ts
activeQuests: {},
chainStatusByCiv: {},
questCooldownUntilByCiv: {},
lastNotifiedStatusByCiv: {},
```

Update typed test fixtures with the same empty maps. Do not use casts to bypass the required state.

- [ ] **Step 5: Run type validation and the focused test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/game-state.test.ts tests/systems/minor-civ-system.test.ts
./scripts/run-with-mise.sh yarn build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit the state foundation**

```bash
git add src/core/types.ts src/core/game-state.ts src/systems/minor-civ-system.ts tests
git commit -m "feat(quests): add quest chain state types"
```

## Task 2: Define Exhaustive Archetype Chains

**Files:**
- Create: `src/systems/quest-chain-definitions.ts`
- Create: `tests/systems/quest-chain-definitions.test.ts`

- [ ] **Step 1: Write the failing completeness tests**

```ts
import { describe, expect, it } from 'vitest';
import { MINOR_CIV_ARCHETYPES, QUEST_TYPES } from '@/core/types';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { QUEST_CHAINS_BY_ARCHETYPE, getAllQuestChains } from '@/systems/quest-chain-definitions';

describe('quest chain definitions', () => {
  it('covers every runtime archetype with a three-step chain', () => {
    expect(Object.keys(QUEST_CHAINS_BY_ARCHETYPE).sort()).toEqual([...MINOR_CIV_ARCHETYPES].sort());
    for (const archetype of MINOR_CIV_ARCHETYPES) {
      expect(QUEST_CHAINS_BY_ARCHETYPE[archetype].length).toBeGreaterThan(0);
      for (const chain of QUEST_CHAINS_BY_ARCHETYPE[archetype]) {
        expect(chain.steps).toHaveLength(3);
      }
    }
  });

  it('covers every archetype used by the minor-civ roster', () => {
    for (const definition of MINOR_CIV_DEFINITIONS) {
      expect(QUEST_CHAINS_BY_ARCHETYPE[definition.archetype].length).toBeGreaterThan(0);
    }
  });

  it('uses unique ids and registered objective types', () => {
    const chains = getAllQuestChains();
    expect(new Set(chains.map(chain => chain.id)).size).toBe(chains.length);
    for (const chain of chains) {
      for (const step of chain.steps) {
        for (const option of [step.preferred, ...step.fallbacks]) {
          expect(QUEST_TYPES).toContain(option.type);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-chain-definitions.test.ts
```

Expected: FAIL because `quest-chain-definitions.ts` does not exist.

- [ ] **Step 3: Implement static definitions and tuning**

Define these concrete shapes:

```ts
export interface QuestObjectiveOption {
  type: QuestType;
  description: string;
  goldMultiplier?: number;
  radius?: number;
  fixedCount?: number;
}

export interface QuestChainStepDefinition {
  title: string;
  preferred: QuestObjectiveOption;
  fallbacks: readonly QuestObjectiveOption[];
  reward: QuestReward;
  duration: number;
}

export interface QuestChainDefinition {
  id: string;
  name: string;
  theme: string;
  priority: number;
  steps: readonly [QuestChainStepDefinition, QuestChainStepDefinition, QuestChainStepDefinition];
}

export const ERA_QUEST_TUNING = {
  1: { baseGold: 25, militaryCount: 1, festivalGold: 50 },
  2: { baseGold: 50, militaryCount: 2, festivalGold: 100 },
  3: { baseGold: 75, militaryCount: 3, festivalGold: 150 },
  4: { baseGold: 100, militaryCount: 4, festivalGold: 200 },
} as const;
```

Encode the chain steps as data, including objective-specific prose:

```ts
const rewards = [
  { relationshipBonus: 15 },
  { relationshipBonus: 20 },
  { relationshipBonus: 25 },
] as const;

export const MILITARY_ASSISTANCE_CHAIN: QuestChainDefinition = {
  id: 'military-assistance',
  name: 'Military Assistance',
  theme: 'Protect the city-state and prove dependable military support.',
  priority: 10,
  steps: [
    {
      title: 'Remove the Immediate Threat', duration: 20, reward: rewards[0],
      preferred: { type: 'destroy_camp', radius: 8, description: 'Destroy a nearby hostile camp' },
      fallbacks: [
        { type: 'defeat_units', radius: 8, fixedCount: 1, description: 'Defeat a nearby hostile unit' },
        { type: 'gift_gold', goldMultiplier: 1, description: 'Fund immediate defenses' },
      ],
    },
    {
      title: 'Secure the Approaches', duration: 20, reward: rewards[1],
      preferred: { type: 'destroy_camp', radius: 10, description: 'Destroy another nearby hostile camp' },
      fallbacks: [
        { type: 'defeat_units', radius: 10, description: 'Defeat nearby hostile units' },
        { type: 'gift_gold', goldMultiplier: 1.25, description: 'Fund reinforcements' },
      ],
    },
    {
      title: 'Stand With Us', duration: 20, reward: rewards[2],
      preferred: { type: 'defeat_units', radius: 10, description: 'Defeat nearby hostile units' },
      fallbacks: [
        { type: 'destroy_camp', radius: 10, description: 'Destroy a nearby hostile camp' },
        { type: 'gift_gold', goldMultiplier: 1.5, description: 'Mobilize city defenses' },
      ],
    },
  ],
};

export const TRADE_PARTNERSHIP_CHAIN: QuestChainDefinition = {
  id: 'trade-partnership', name: 'Trade Partnership',
  theme: 'Build trust through credit, exchange, and durable commerce.', priority: 10,
  steps: [
    { title: 'Demonstrate Good Credit', duration: 20, reward: rewards[0], preferred: { type: 'gift_gold', goldMultiplier: 1, description: 'Demonstrate good credit' }, fallbacks: [] },
    { title: 'Open an Exchange', duration: 20, reward: rewards[1], preferred: { type: 'trade_route', description: 'Establish a new trade route to this city-state' }, fallbacks: [{ type: 'gift_gold', goldMultiplier: 1.25, description: 'Finance a merchant delegation' }] },
    { title: 'Secure the Partnership', duration: 20, reward: rewards[2], preferred: { type: 'trade_route', description: 'Establish another new trade route to this city-state' }, fallbacks: [{ type: 'gift_gold', goldMultiplier: 1.5, description: 'Capitalize the partnership' }] },
  ],
};

export const FESTIVALS_AND_EXCHANGE_CHAIN: QuestChainDefinition = {
  id: 'festivals-and-exchange', name: 'Festivals And Exchange',
  theme: 'Deepen cultural ties through patronage, exchange, and celebration.', priority: 10,
  steps: [
    eraVariantStep(1, culturalEraVariants),
    eraVariantStep(2, culturalEraVariants),
    eraVariantStep(3, culturalEraVariants),
  ],
};
```

- [ ] **Step 4: Add stable lookup helpers**

```ts
export function getAllQuestChains(): QuestChainDefinition[] {
  return Object.values(QUEST_CHAINS_BY_ARCHETYPE)
    .flatMap(chains => [...chains])
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export function getQuestChain(chainId: string): QuestChainDefinition | null {
  return getAllQuestChains().find(chain => chain.id === chainId) ?? null;
}
```

- [ ] **Step 5: Run the definition tests and build**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-chain-definitions.test.ts
./scripts/run-with-mise.sh yarn build
```

Expected: PASS. The `satisfies Record<MinorCivArchetype, ...>` declaration must make an omitted future archetype a compile error.

- [ ] **Step 6: Commit the chain catalog**

```bash
git add src/systems/quest-chain-definitions.ts tests/systems/quest-chain-definitions.test.ts
git commit -m "feat(quests): define archetype alliance chains"
```

## Task 3: Build Objective Feasibility And Reality-Bounded Targets

**Files:**
- Create: `src/systems/quest-objective-system.ts`
- Create: `tests/systems/quest-objective-system.test.ts`
- Modify: `src/systems/quest-system.ts:1-176`
- Modify: `tests/systems/quest-system.test.ts:16-170`

- [ ] **Step 1: Write failing feasibility tests**

Cover the exact conjunctions:

```ts
it('bounds a military request to one currently visible legal target', () => {
  const target = createQuestTarget(contextWithVisibleHostiles(1), { type: 'defeat_units', radius: 10 });
  expect(target).toMatchObject({ type: 'defeat_units', count: 1 });
});

it('does not count a hostile target on a fog tile', () => {
  const target = createQuestTarget(contextWithFoggedHostile(), { type: 'defeat_units', radius: 10 });
  expect(target).toBeNull();
});

it.each([
  ['missing tech', stateWithoutTradeTech()],
  ['undiscovered issuer', stateWithUndiscoveredIssuer()],
  ['at war', stateAtWarWithIssuer()],
  ['no route capacity', stateWithoutRouteCapacity()],
  ['no land path', stateWithoutLandPath()],
  ['no caravan or trainability', stateWithoutCaravanAccess()],
])('rejects route feasibility when %s', (_label, state) => {
  expect(canPursueMinorCivTradeRoute(state, 'player', 'mc-carthage')).toBe(false);
});

it('rejects a gold objective outside the twenty-turn economy projection', () => {
  expect(canReachGoldRequirement(stateWithGoldAndNetRate(0, 1), 'player', 25, 20)).toBe(false);
});

it('keeps an issued era-scaled target fixed after the world advances an era', () => {
  const quest = createEraOneGiftQuest();
  const state = { ...eraOneState(), era: 2 };
  expect(quest.target).toEqual({ type: 'gift_gold', amount: 25 });
  expect(validateQuestTarget(state, assignmentFor(quest)).valid).toBe(true);
});
```

- [ ] **Step 2: Run the objective tests and verify failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-objective-system.test.ts
```

Expected: FAIL because the objective module does not exist.

- [ ] **Step 3: Implement shared feasibility helpers**

Create:

```ts
export interface QuestGenerationContext {
  state: GameState;
  minorCivId: string;
  majorCivId: string;
  currentTurn: number;
  counters: IdCounters;
}

export interface QuestAssignmentContext {
  state: GameState;
  minorCivId: string;
  majorCivId: string;
  quest: Quest;
}

export interface QuestTargetValidity {
  valid: boolean;
  reason?: string;
}

export interface QuestObjectiveHandler {
  createTarget(context: QuestGenerationContext, option: QuestObjectiveOption): QuestTarget | null;
  validateTarget(context: QuestAssignmentContext): QuestTargetValidity;
  isComplete(context: QuestAssignmentContext): boolean;
  describe(context: QuestAssignmentContext): string;
}

export function canReachGoldRequirement(
  state: GameState,
  majorCivId: string,
  requiredGold: number,
  duration: number,
): boolean {
  const civ = state.civilizations[majorCivId];
  if (!civ) return false;
  const { netGoldPerTurn } = calculateCivEconomy(state, majorCivId);
  return civ.gold + Math.max(0, netGoldPerTurn) * duration >= requiredGold;
}
```

Export these stable helper names for systems and tests:

```ts
export function createQuestTarget(context: QuestGenerationContext, option: QuestObjectiveOption): QuestTarget | null;
export function validateQuestTarget(state: GameState, assignment: Omit<QuestAssignmentContext, 'state'>): QuestTargetValidity;
export function canPursueMinorCivTradeRoute(state: GameState, majorCivId: string, minorCivId: string): boolean;
export function canReachGoldRequirement(state: GameState, majorCivId: string, requiredGold: number, duration: number): boolean;
```

Implement `canPursueMinorCivTradeRoute` using all route predicates. Use `getRouteCapacity` minus routes whose `fromCityId` matches the origin, `getTrainableUnitsForCity(...).some(unit => unit.type === 'caravan')`, `getCivAvailableResources`, discovery state, completed `trade-routes`, and `canEstablishRoute` for each existing uncommitted caravan. For a trainable future caravan, verify at least one capacity-bearing origin city has a land path to the issuer city, valid diplomacy, and a queue-aware production ETA that leaves time to establish the route before expiry. Export the helper so normal quests, chains, AI guidance, and presentation share one truth.

Use `getVisibility(civ.visibility, coord) === 'visible'` and shared combat-legality helpers for camps and units. Sort candidate targets by distance then stable ID before choosing one.

- [ ] **Step 4: Implement the exhaustive objective registry**

```ts
export const QUEST_OBJECTIVE_HANDLERS = {
  destroy_camp: destroyCampHandler,
  gift_gold: giftGoldHandler,
  defeat_units: defeatUnitsHandler,
  trade_route: tradeRouteHandler,
  sponsor_festival: sponsorFestivalHandler,
} satisfies Record<QuestType, QuestObjectiveHandler>;
```

At this stage implement `createTarget`, `validateTarget`, and `describe`; Task 4 adds action application. `sponsor_festival` filters `getCivAvailableResources` through `RESOURCE_DEFINITIONS.filter(def => def.type === 'luxury')`.

- [ ] **Step 5: Refactor normal quest generation to use handlers**

Keep the seeded weighted choice in `quest-system.ts`, but replace its switch-based target builder and description builder:

```ts
const target = QUEST_OBJECTIVE_HANDLERS[type].createTarget(context, option);
if (!target) return null;
return createQuestFromTarget({ type, target, context, reward: getRewardForType(type) });
```

Remove the stale test that asserts trade routes are always unsupported. Add a positive route-feasibility test and preserve normal quest weighting.

- [ ] **Step 6: Run targeted tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-objective-system.test.ts tests/systems/quest-system.test.ts tests/systems/trade-system.test.ts
```

Expected: PASS, including era 1 through era 4 bound checks.

- [ ] **Step 7: Commit objective feasibility**

```bash
git add src/systems/quest-objective-system.ts src/systems/quest-system.ts tests/systems/quest-objective-system.test.ts tests/systems/quest-system.test.ts
git commit -m "feat(quests): add reality-aware objective generation"
```

## Task 4: Add Actor-Attributed Objective Progress

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/quest-objective-system.ts`
- Modify: `tests/systems/quest-objective-system.test.ts`

- [ ] **Step 1: Write cross-player and conjunctive failing tests**

```ts
it('does not advance player B when player A destroys the assigned camp', () => {
  const result = applyQuestAction(stateWithIdenticalCampQuests(), {
    type: 'camp_destroyed', actorCivId: 'player-a', campId: 'camp-1', position: { q: 2, r: 0 }, turn: 10,
  });
  expect(result.state.minorCivs['mc-sparta'].activeQuests['player-a'].progress).toBe(1);
  expect(result.state.minorCivs['mc-sparta'].activeQuests['player-b'].progress).toBe(0);
});

it('requires both gold and luxury for a festival action', () => {
  expect(applyQuestAction(festivalState({ gold: 200, luxury: false }), festivalAction()).accepted).toBe(false);
  expect(applyQuestAction(festivalState({ gold: 0, luxury: true }), festivalAction()).accepted).toBe(false);
  const accepted = applyQuestAction(festivalState({ gold: 200, luxury: true }), festivalAction());
  expect(accepted.accepted).toBe(true);
  expect(accepted.state.civilizations.player.gold).toBe(50);
});

it('credits a route only to its origin owner and exact issuer city', () => {
  const wrongDestination = applyQuestAction(routeQuestState(), routeAction({ toCityId: 'other-city' }));
  expect(wrongDestination.accepted).toBe(false);
});
```

- [ ] **Step 2: Run the tests and verify failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-objective-system.test.ts
```

Expected: FAIL because `QuestAction` and `applyQuestAction` are absent.

- [ ] **Step 3: Add the action and result unions**

```ts
export type QuestAction =
  | { type: 'gift_gold'; actorCivId: string; minorCivId: string; amount: number; turn: number }
  | { type: 'sponsor_festival'; actorCivId: string; minorCivId: string; turn: number }
  | { type: 'trade_route_created'; actorCivId: string; fromCityId: string; toCityId: string; routeId: string; turn: number }
  | { type: 'unit_defeated'; actorCivId: string; defeatedOwnerId: string; unitId: string; position: HexCoord; turn: number }
  | { type: 'camp_destroyed'; actorCivId: string; campId: string; position: HexCoord; turn: number };

export interface QuestTransition {
  type: 'progressed' | 'completed' | 'retargeted' | 'cancelled';
  majorCivId: string;
  minorCivId: string;
  quest?: Quest;
}

export interface QuestActionResult {
  state: GameState;
  accepted: boolean;
  transitions: QuestTransition[];
  reason?: string;
}
```

Extend `QuestObjectiveHandler` in the same change:

```ts
applyAction(context: QuestAssignmentContext, action: QuestAction): QuestActionResult;
```

- [ ] **Step 4: Implement owner-first action routing**

`applyQuestAction` must iterate minor civilizations only to locate assignments for `action.actorCivId`. It may inspect another player's assignment only in a separate invalidation pass after a target has been removed.

```ts
const quest = minorCiv.activeQuests[action.actorCivId];
if (!quest) continue;
const result = QUEST_OBJECTIVE_HANDLERS[quest.type].applyAction(context, action);
```

The handler returns an updated quest copy. It does not award rewards or advance chain steps; that belongs to Task 5.

- [ ] **Step 5: Implement exact objective matches**

- Camp: actor, `campId`, and assigned quest must match.
- Unit: actor receives combat credit, defeated owner is legally hostile, position is within stored radius.
- Route: origin city owner equals actor and destination equals issuer city.
- Gift: actor, issuer, amount, active target, and treasury are valid.
- Festival: actor, issuer, treasury, and at least one accessible luxury are all valid.

Never use `state.currentPlayer`.

The `gift_gold` and `sponsor_festival` handlers own their atomic economic cost. They validate against the pre-action state, copy the affected civilization, deduct gold once, and then update quest progress. This prevents wrappers from deducting before the handler checks requirements and prevents double charging during chain advancement.

- [ ] **Step 6: Run objective tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-objective-system.test.ts
```

Expected: PASS, including all cross-player negative tests.

- [ ] **Step 7: Commit actor attribution**

```bash
git add src/core/types.ts src/systems/quest-objective-system.ts tests/systems/quest-objective-system.test.ts
git commit -m "feat(quests): attribute objective progress to actors"
```

## Task 5: Implement The Pure Chain State Machine

**Files:**
- Create: `src/systems/quest-chain-system.ts`
- Create: `tests/systems/quest-chain-system.test.ts`

- [ ] **Step 1: Write failing transition-table tests**

```ts
it('evaluates Friendly eligibility after applying the normal reward', () => {
  const result = applyQuestGameplayAction(
    activeNormalGiftStateAtRelationship(25),
    giftActionForActiveQuest({ amount: 25 }),
  );
  expect(result.state.minorCivs['mc-sparta'].activeQuests.player).toMatchObject({ chainId: 'military-assistance', stepIndex: 0 });
});

it('stores the exact next pending step when no objective is feasible', () => {
  const result = applyQuestGameplayAction(
    completableStepOneWithoutStepTwoTarget(),
    giftActionForActiveQuest({ amount: 25 }),
  );
  expect(result.state.minorCivs['mc-sparta'].chainStatusByCiv.player).toMatchObject({
    status: 'pending',
    chainId: 'military-assistance',
    pendingStepIndex: 1,
  });
});

it('allows completion on expiresOnTurn and expires one turn later', () => {
  expect(reconcileMinorCivQuestTurn(activeQuestExpiringAt(20), 'mc-sparta', 'player', 20).transitions).toHaveLength(0);
  expect(reconcileMinorCivQuestTurn(activeQuestExpiringAt(20), 'mc-sparta', 'player', 21).transitions[0]?.type).toBe('expired');
});

it('floors final relationship at 60 and emits alliance once', () => {
  const first = applyQuestGameplayAction(finalFestivalStateAtRelationship(40), festivalActionForActiveQuest());
  const second = reconcileMinorCivQuestTurn(first.state, 'mc-athens', 'player', first.state.turn);
  expect(first.state.minorCivs['mc-athens'].diplomacy.relationships.player).toBe(65);
  expect(first.transitions.filter(t => t.type === 'allied')).toHaveLength(1);
  expect(second.transitions.filter(t => t.type === 'allied')).toHaveLength(0);
});

it('clears pending after ten retry turns without a relationship penalty', () => {
  const state = pendingStepState({ statusTurn: 10, pendingStepIndex: 1 });
  const result = reconcileMinorCivQuestTurn(state, 'mc-sparta', 'player', 21);
  expect(result.state.minorCivs['mc-sparta'].chainStatusByCiv.player).toBeUndefined();
  expect(result.state.minorCivs['mc-sparta'].questCooldownUntilByCiv.player).toBeGreaterThan(21);
  expect(result.state.minorCivs['mc-sparta'].diplomacy.relationships.player).toBe(
    state.minorCivs['mc-sparta'].diplomacy.relationships.player,
  );
});

it('allows two majors to earn independent alliances with one issuer', () => {
  const result = applyQuestGameplayAction(twoPlayerFinalStepState(), festivalActionFor('player-a'));
  expect(isMinorCivAllianceActive(result.state, 'player-a', 'mc-athens')).toBe(true);
  expect(isMinorCivAllianceActive(result.state, 'player-b', 'mc-athens')).toBe(false);
});
```

- [ ] **Step 2: Run and verify the module is missing**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-chain-system.test.ts
```

Expected: FAIL because `quest-chain-system.ts` does not exist.

- [ ] **Step 3: Define pure chain results**

```ts
export type ChainTransition =
  | { type: 'issued'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'pending'; majorCivId: string; minorCivId: string; chainId: string; stepIndex: number }
  | { type: 'progressed'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'completed'; majorCivId: string; minorCivId: string; quest: Quest; reward: QuestReward }
  | { type: 'expired'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'retargeted'; majorCivId: string; minorCivId: string; quest: Quest }
  | { type: 'cancelled'; majorCivId: string; minorCivId: string; chainId: string; stepIndex: number }
  | { type: 'allied'; majorCivId: string; minorCivId: string; chainId: string }
  | { type: 'alliance-broken'; majorCivId: string; minorCivId: string; chainId: string };

export interface ChainTransitionResult {
  state: GameState;
  transitions: ChainTransition[];
}
```

Export these stable public entry points:

```ts
export function applyQuestGameplayAction(state: GameState, action: QuestAction): ChainTransitionResult;
export function reconcileMinorCivQuestTurn(
  state: GameState,
  minorCivId: string,
  majorCivId: string,
  currentTurn: number,
): ChainTransitionResult;
export function getMinorCivRelationshipStatus(
  state: GameState,
  majorCivId: string,
  minorCivId: string,
): MinorCivRelationshipStatus;
export function isMinorCivAllianceActive(state: GameState, majorCivId: string, minorCivId: string): boolean;
```

`applyQuestGameplayAction` is the canonical wrapper around the lower-level objective router from Task 4. It applies progress, detects completion, applies the reward exactly once, starts a chain after a qualifying normal quest, advances a chain step, or records the final alliance in one returned state.

- [ ] **Step 4: Implement deterministic chain selection and pending retry**

Use `priority`, then stable ID. The first valid preferred/fallback objective wins. If every chain is infeasible, store the highest-priority chain at `pendingStepIndex: 0`. Retrying pending must use the stored chain ID and step index, not reroll.

- [ ] **Step 5: Implement advancement, expiry, invalidation, and final alliance**

Apply rewards before creating the next step. Install the next quest or pending status in the same returned state. Expiry applies `-5` and sets `questCooldownUntilByCiv[majorCivId] = currentTurn + 3`. Target cancellation applies the cooldown without `-5`.

- [ ] **Step 6: Add effective status helpers**

```ts
export function isMinorCivAllianceActive(state: GameState, majorCivId: string, minorCivId: string): boolean {
  const mc = state.minorCivs[minorCivId];
  return Boolean(
    mc
    && !mc.isDestroyed
    && !mc.diplomacy.atWarWith.includes(majorCivId)
    && mc.chainStatusByCiv[majorCivId]?.status === 'allied'
  );
}
```

Implement `getMinorCivRelationshipStatus` with at-war, allied, hostile, friendly, neutral priority. Raw `60+` is Friendly unless a durable alliance is stored.

- [ ] **Step 7: Run chain tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-chain-system.test.ts tests/systems/quest-objective-system.test.ts
```

Expected: PASS for all transition, expiry, pending, and effective-status cases.

- [ ] **Step 8: Commit the state machine**

```bash
git add src/systems/quest-chain-system.ts tests/systems/quest-chain-system.test.ts
git commit -m "feat(quests): add quest chain state machine"
```

## Task 6: Make Minor-Civ Turn Processing Immutable And Chain-Aware

**Files:**
- Modify: `src/systems/minor-civ-system.ts:145-310`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Write failing orchestration and immutability tests**

```ts
it('does not mutate the input state while issuing or completing quests', () => {
  const state = discoveredMinorCivState();
  const snapshot = structuredClone(state);
  const result = processMinorCivTurn(state, new EventBus());
  expect(state).toEqual(snapshot);
  expect(result).not.toBe(state);
});

it('emits completion then next issuance from one atomic transition', () => {
  const events: string[] = [];
  const bus = new EventBus();
  bus.on('minor-civ:quest-completed', () => events.push('completed'));
  bus.on('minor-civ:quest-issued', () => events.push('issued'));
  processMinorCivTurn(completedStepOneState(), bus);
  expect(events).toEqual(['completed', 'issued']);
});

it('does not activate ally bonus from relationship score alone', () => {
  const state = minorCivStateAtRelationship(65, { chainStatus: undefined });
  const result = processMinorCivTurn(state, new EventBus());
  expect(result.civilizations.player.gold).toBe(state.civilizations.player.gold);
});
```

- [ ] **Step 2: Run and verify failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-system.test.ts
```

Expected: FAIL because current processing mutates input and uses relationship `>= 60` for bonuses.

- [ ] **Step 3: Replace mutable quest processing**

Thread `let nextState = state` through every active minor civilization. For each major civilization:

1. skip undiscovered and at-war pairs
2. retry pending step
3. reconcile active target/expiry
4. issue a normal quest after typed cooldown
5. convert returned transitions to event payloads after assigning `nextState`

Delete `_cooldown_<civId>` and `_prevStatus` dynamic properties.
Delete passive completion inference through `checkQuestCompletion`. Canonical action sources now complete normal and chain quests immediately through `applyQuestGameplayAction`; turn processing handles only pending retry, target reconciliation, expiry, normal issuance, bonuses, and status notification.

- [ ] **Step 4: Apply rewards immutably**

Copy the affected minor civilization, diplomacy relationship map, major civilization, research state, and city/unit maps as needed. A free-unit reward must use occupancy-safe spawning and update both `state.units` and the civilization roster.

- [ ] **Step 5: Gate ally bonuses and relationship events through shared helpers**

Use `isMinorCivAllianceActive`. Store `lastNotifiedStatusByCiv` in state and emit threshold/allied events only from actual before/after changes. Do not emit `minor-civ:allied` for raw-score transitions.

Export one transition-to-event adapter so every canonical mutation source uses identical payload mapping:

```ts
export function emitMinorCivQuestTransitions(bus: EventBus | undefined, transitions: ChainTransition[]): void {
  if (!bus) return;
  for (const transition of transitions) {
    switch (transition.type) {
      case 'issued': bus.emit('minor-civ:quest-issued', transition); break;
      case 'pending': bus.emit('minor-civ:quest-chain-pending', transition); break;
      case 'progressed': bus.emit('minor-civ:quest-progressed', transition); break;
      case 'completed': bus.emit('minor-civ:quest-completed', transition); break;
      case 'expired': bus.emit('minor-civ:quest-expired', transition); break;
      case 'retargeted': bus.emit('minor-civ:quest-retargeted', transition); break;
      case 'cancelled': bus.emit('minor-civ:quest-cancelled', transition); break;
      case 'allied': bus.emit('minor-civ:allied', transition); break;
      case 'alliance-broken': bus.emit('minor-civ:alliance-broken', transition); break;
    }
  }
}
```

Keep this adapter notification-only. It must not inspect final state or mutate gameplay data.

- [ ] **Step 6: Run the focused suite**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-system.test.ts tests/systems/quest-chain-system.test.ts
```

Expected: PASS, including the input-state equality assertion.

- [ ] **Step 7: Commit orchestration**

```bash
git add src/systems/minor-civ-system.ts tests/systems/minor-civ-system.test.ts
git commit -m "refactor(quests): orchestrate chains immutably"
```

## Task 7: Add Canonical Gift And Festival Actions

**Files:**
- Create: `src/systems/minor-civ-actions.ts`
- Create: `tests/systems/minor-civ-actions.test.ts`
- Modify: `src/main.ts:640-660`

- [ ] **Step 1: Write failing action tests**

```ts
it('deducts an exact active gift amount and advances only that assignment', () => {
  const result = performMinorCivGift(giftQuestState(), 'player', 'mc-carthage', 50);
  expect(result.ok).toBe(true);
  expect(result.state.civilizations.player.gold).toBe(50);
  expect(result.transitions.some(t => t.type === 'completed')).toBe(true);
});

it('rejects festival atomically when either requirement is missing', () => {
  const noLuxury = performMinorCivFestival(festivalState({ gold: 200, luxury: false }), 'player', 'mc-athens');
  expect(noLuxury.ok).toBe(false);
  expect(noLuxury.state.civilizations.player.gold).toBe(200);
});

it('does not consume luxury access on festival completion', () => {
  const state = festivalState({ gold: 200, luxury: true });
  const before = getCivAvailableResources(state, 'player');
  const result = performMinorCivFestival(state, 'player', 'mc-athens');
  expect(getCivAvailableResources(result.state, 'player')).toEqual(before);
});
```

- [ ] **Step 2: Run and verify failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-actions.test.ts
```

Expected: FAIL because the action module does not exist.

- [ ] **Step 3: Implement structured action results**

```ts
export interface MinorCivActionResult {
  state: GameState;
  ok: boolean;
  reason?: string;
  transitions: ChainTransition[];
}
```

Both actions call `applyQuestGameplayAction`, which owns requirement validation, atomic quest costs, reward, and chain advancement. They return transitions without emitting. The live caller assigns `gameState = result.state` and only then calls `emitMinorCivQuestTransitions(bus, result.transitions)`.

`performMinorCivGift` preserves the existing non-quest gift behavior: when the pair has no active `gift_gold` objective, a valid gift costs `25` gold and applies the existing `+10` relationship change without fabricating quest progress. When a gift objective is active, its stored amount replaces the normal amount and the objective handler owns the deduction.

- [ ] **Step 4: Replace direct gift mutation in `main.ts`**

`handleGiftGold` must call `performMinorCivGift(..., bus)`, assign `gameState = result.state`, display `reason` on failure, and rerender the open panel on success. Do not touch `quest.progress` or diplomacy directly.

- [ ] **Step 5: Run action and existing UI tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-actions.test.ts tests/ui/diplomacy-panel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit canonical economic actions**

```bash
git add src/systems/minor-civ-actions.ts src/main.ts tests/systems/minor-civ-actions.test.ts
git commit -m "feat(quests): add canonical gift and festival actions"
```

## Task 8: Wire Route, Combat, And Camp Facts At Mutation Sources

**Files:**
- Modify: `src/systems/trade-system.ts:287-356`
- Modify: `src/systems/combat-reward-system.ts:217-292`
- Modify: `src/systems/barbarian-system.ts:59-104`
- Modify: `tests/systems/trade-system.test.ts:351-480`
- Modify: `tests/systems/combat-reward-system.test.ts:195-360`
- Modify: `tests/systems/barbarian-system.test.ts:55-105`

- [ ] **Step 1: Write failing source-parity regressions**

```ts
it('advances the issuer route quest inside establishRoute', () => {
  const result = establishRoute(routeQuestState(), 'caravan1', 'mc-city', new EventBus(), 0);
  expect(result.minorCivs['mc-carthage'].activeQuests.player.progress).toBe(1);
});

it('records a defender defeat inside applyCombatOutcomeToState', () => {
  const result = applyCombatOutcomeToState(defeatQuestState(), lethalCombatResult(), 64);
  expect(result.state.minorCivs['mc-sparta'].activeQuests.player.progress).toBe(1);
});

it('records camp credit before the camp disappears', () => {
  const result = applyCampDestruction(campQuestState(), 'player', 'camp-1', 10);
  expect(result.state.minorCivs['mc-sparta'].activeQuests.player.progress).toBe(1);
});
```

- [ ] **Step 2: Run the three focused tests and verify failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/trade-system.test.ts tests/systems/combat-reward-system.test.ts tests/systems/barbarian-system.test.ts
```

Expected: FAIL on quest progress assertions.

- [ ] **Step 3: Wire route facts before the notification event**

After installing the route and caravan state, call `applyQuestGameplayAction` with origin owner, exact city IDs, route ID, and turn. Return its transitions alongside the new state. The player or AI caller installs the state, emits the quest transitions, and then emits `trade:route-created`.

- [ ] **Step 4: Wire unit-defeat facts inside combat application**

Capture `attackerBefore`, `defenderBefore`, and result positions before removal. If defender dies, credit attacker owner. If attacker dies from counterattack, credit defender owner. Call `applyQuestGameplayAction` for each actual defeat after the base combat state is built and return the accumulated quest transitions. Update player, AI, barbarian-turn, and beast-turn callers to assign the state before emitting those transitions through their existing bus.

This single location covers player combat, AI combat, barbarian attacks, beast attacks, and turn-manager callers without UI duplication.

- [ ] **Step 5: Wire camp facts before deletion reconciliation**

Create the `camp_destroyed` fact from the existing camp object, then delete the camp and apply `applyQuestGameplayAction` to the copied state. Return quest transitions to the caller instead of emitting. The actor's exact matching assignment completes first; a second reconciliation pass may retarget visible stale assignments without revealing hidden world changes. Player and AI callers assign the returned state before emitting.

- [ ] **Step 6: Add negative attribution checks**

Add tests proving:

- a route to another city does not count
- a foreign-origin route does not count for the viewer
- a nonlethal combat result does not count
- another actor destroying the camp does not progress the assignee

- [ ] **Step 7: Run system and parity tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/trade-system.test.ts tests/systems/combat-reward-system.test.ts tests/systems/barbarian-system.test.ts tests/ai/basic-ai.test.ts tests/core/turn-manager.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit source-owned progress**

```bash
git add src/systems/trade-system.ts src/systems/combat-reward-system.ts src/systems/barbarian-system.ts tests/systems/trade-system.test.ts tests/systems/combat-reward-system.test.ts tests/systems/barbarian-system.test.ts
git commit -m "feat(quests): wire canonical objective progress"
```

## Task 9: Canonicalize Minor-Civ War, Peace, And Destruction

**Files:**
- Modify: `src/systems/minor-civ-actions.ts`
- Modify: `src/systems/minor-civ-system.ts:335-380`
- Modify: `src/main.ts:662-681`
- Modify: `src/systems/attack-targeting.ts`
- Modify: `src/input/selected-unit-tap-intent.ts`
- Modify: `tests/systems/minor-civ-actions.test.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it('breaks an earned alliance and clears both diplomacy sides on war transition', () => {
  const result = setMinorCivWarState(alliedState(), 'player', 'mc-sparta', true);
  expect(result.state.minorCivs['mc-sparta'].chainStatusByCiv.player.status).toBe('broken');
  expect(result.state.minorCivs['mc-sparta'].diplomacy.atWarWith).toContain('player');
  expect(result.state.civilizations.player.diplomacy.atWarWith).toContain('mc-sparta');
  expect(result.transitions.filter(t => t.type === 'alliance-broken')).toHaveLength(1);
});

it('clears an unearned active chain without inventing broken status', () => {
  const result = setMinorCivWarState(stepTwoState(), 'player', 'mc-sparta', true);
  expect(result.state.minorCivs['mc-sparta'].activeQuests.player).toBeUndefined();
  expect(result.state.minorCivs['mc-sparta'].chainStatusByCiv.player).toBeUndefined();
});

it('peace preserves broken status and cooldown', () => {
  const result = setMinorCivWarState(brokenAtWarState(), 'player', 'mc-sparta', false);
  expect(result.state.minorCivs['mc-sparta'].chainStatusByCiv.player.status).toBe('broken');
  expect(result.state.minorCivs['mc-sparta'].questCooldownUntilByCiv.player).toBeGreaterThan(result.state.turn);
});

it('restarts a broken alliance from step one after a qualifying post-peace normal quest', () => {
  const result = applyQuestGameplayAction(
    completableNormalQuestWithBrokenStatus(),
    giftActionForActiveQuest({ amount: 25 }),
  );
  expect(result.state.minorCivs['mc-sparta'].chainStatusByCiv.player).toBeUndefined();
  expect(result.state.minorCivs['mc-sparta'].activeQuests.player).toMatchObject({ stepIndex: 0 });
});

it('requires canonical war before a neutral or allied minor-civ unit is attackable', () => {
  const before = canUnitAttackTarget(alliedMinorUnitState(), playerUnit(), minorUnitPosition());
  expect(before).toMatchObject({ ok: false, reason: 'not-hostile' });
  const war = setMinorCivWarState(alliedMinorUnitState(), 'player', 'mc-sparta', true);
  expect(canUnitAttackTarget(war.state, war.state.units.playerUnit, minorUnitPosition()).ok).toBe(true);
  expect(war.transitions).toContainEqual(expect.objectContaining({ type: 'alliance-broken' }));
});
```

- [ ] **Step 2: Run and verify failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-actions.test.ts tests/systems/minor-civ-system.test.ts
```

Expected: FAIL because war/peace still mutates directly in `main.ts` and destruction leaves chain state.

- [ ] **Step 3: Implement bilateral immutable war/peace**

Use existing `declareWar` and `makePeace` on copied diplomacy states. `setMinorCivWarState` accepts an optional bus, clears the pair's active quest or pending state, writes the three-turn cooldown, preserves earned alliance as `broken`, emits transitions through the shared adapter, and returns the new state. Peace removes both at-war entries but never changes `broken` to `allied`.

Return the existing `alliance-broken` `ChainTransition` only when the prior status was `allied`; repeated declarations must not emit it again.

- [ ] **Step 4: Delegate `main.ts` and refresh the panel**

`handleMinorCivWarPeace` must call `setMinorCivWarState(..., bus)`, assign the returned state, update renderer/HUD, and call `openDiplomacyPanel()` so the visible status changes immediately.

Unit attacks and city assault intents against a minor civilization must route through the same helper before combat or conquest. Do not retain the current `startsWith('mc-') && isHuman` combat exception. Add input and attack-targeting regressions for neutral, allied, already-at-war, and repeated-declaration paths.

- [ ] **Step 5: Clear chain state on conquest**

Make `conquestMinorCiv` return a new state plus transitions. It marks the issuer destroyed, transfers the city, removes units, clears `activeQuests`, `chainStatusByCiv`, cooldown/status maps, and prevents ally bonuses. Update all callers to assign the result.

- [ ] **Step 6: Run lifecycle tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-actions.test.ts tests/systems/minor-civ-system.test.ts tests/input/selected-unit-tap-intent.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit diplomacy lifecycle**

```bash
git add src/systems/minor-civ-actions.ts src/systems/minor-civ-system.ts src/main.ts tests/systems/minor-civ-actions.test.ts tests/systems/minor-civ-system.test.ts
git commit -m "feat(quests): break alliances through canonical war state"
```

## Task 10: Normalize Saves And Repair Quest ID Scanning

**Files:**
- Modify: `src/storage/save-manager.ts:88-104`
- Modify: `src/core/id-counters.ts:7-55`
- Modify: `tests/storage/save-persistence.test.ts:224-290`
- Modify: `tests/core/migrate-id-counters.test.ts:63-74`

- [ ] **Step 1: Correct the failing ID-counter fixture**

Replace assignment keys that look like quest IDs with real major IDs:

```ts
minorCivs: {
  'mc-1': { activeQuests: { player: { id: 'quest-9' } } },
  'mc-2': { activeQuests: { 'ai-1': { id: 'quest-2' } } },
},
```

Keep `expect(counters.nextQuestId).toBe(10)`.

- [ ] **Step 2: Run and verify the ID test fails**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/migrate-id-counters.test.ts
```

Expected: FAIL with `nextQuestId` equal to `1` under the old key scan.

- [ ] **Step 3: Scan nested quest values**

```ts
for (const mc of Object.values(state.minorCivs ?? {})) {
  for (const quest of Object.values(mc.activeQuests ?? {})) {
    const match = /^quest-(\d+)$/.exec(quest.id);
    if (match) maxQuest = Math.max(maxQuest, Number(match[1]));
  }
}
```

- [ ] **Step 4: Write save-normalization tests**

Add tests for:

```ts
it('adds empty typed quest-chain maps to legacy minor civs', () => {
  const state = createNewGame(undefined, 'legacy-chain-maps', 'small');
  const mc = Object.values(state.minorCivs)[0];
  delete (mc as Partial<typeof mc>).chainStatusByCiv;
  delete (mc as Partial<typeof mc>).questCooldownUntilByCiv;
  delete (mc as Partial<typeof mc>).lastNotifiedStatusByCiv;
  const loaded = normalizeLoadedStateForTest(state);
  const normalized = loaded.minorCivs[mc.id];
  expect(normalized.chainStatusByCiv).toEqual({});
  expect(normalized.questCooldownUntilByCiv).toEqual({});
  expect(normalized.lastNotifiedStatusByCiv).toEqual({});
});

it('preserves an active step-two quest through JSON normalization', () => {
  const state = stateWithActiveChainQuest({ chainId: 'trade-partnership', stepIndex: 1 });
  const loaded = normalizeLoadedStateForTest(JSON.parse(JSON.stringify(state)) as GameState);
  expect(loaded.minorCivs['mc-carthage'].activeQuests.player).toMatchObject({
    chainId: 'trade-partnership', stepIndex: 1,
  });
});

it.each(['pending', 'allied', 'broken'] as const)('preserves %s chain status and cooldown', status => {
  const state = stateWithChainStatus(status, { cooldownUntil: 42 });
  const loaded = normalizeLoadedStateForTest(JSON.parse(JSON.stringify(state)) as GameState);
  expect(loaded.minorCivs['mc-carthage'].chainStatusByCiv.player.status).toBe(status);
  expect(loaded.minorCivs['mc-carthage'].questCooldownUntilByCiv.player).toBe(42);
});

it('cancels an unknown chain id without reward or relationship penalty', () => {
  const state = stateWithActiveChainQuest({ chainId: 'removed-chain', stepIndex: 1 });
  const beforeGold = state.civilizations.player.gold;
  const beforeRelationship = state.minorCivs['mc-carthage'].diplomacy.relationships.player;
  const loaded = normalizeLoadedStateForTest(state);
  expect(loaded.minorCivs['mc-carthage'].activeQuests.player).toBeUndefined();
  expect(loaded.minorCivs['mc-carthage'].questCooldownUntilByCiv.player).toBe(state.turn + 3);
  expect(loaded.civilizations.player.gold).toBe(beforeGold);
  expect(loaded.minorCivs['mc-carthage'].diplomacy.relationships.player).toBe(beforeRelationship);
});

it('treats a quest without chain metadata as a normal quest', () => {
  const state = stateWithNormalGiftQuest();
  const loaded = normalizeLoadedStateForTest(state);
  expect(loaded.minorCivs['mc-carthage'].activeQuests.player.id).toBe('quest-normal');
});
```

- [ ] **Step 5: Implement immutable minor-civ normalization**

Create `normalizeMinorCivQuestState(state)` and call it before territory normalization. It must:

- default missing maps
- retain normal quests
- validate chain ID, step index, and objective type against definitions
- remove invalid chain quests without modifying gold or relationship
- set the standard cooldown for invalid active chain metadata
- remove unknown pending/allied/broken entries
- ignore extra legacy `chainNext` and `minorCivId` fields

- [ ] **Step 6: Run persistence tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/migrate-id-counters.test.ts tests/storage/save-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit persistence resilience**

```bash
git add src/core/id-counters.ts src/storage/save-manager.ts tests/core/migrate-id-counters.test.ts tests/storage/save-persistence.test.ts
git commit -m "fix(quests): normalize chain saves and quest ids"
```

## Task 11: Enforce Viewer-Scoped Presentation And Notifications

**Files:**
- Modify: `src/systems/quest-presentation.ts:1-95`
- Modify: `src/systems/quest-system.ts:150-176`
- Modify: `src/systems/council-system.ts:140-160`
- Modify: `src/ui/advisor-system.ts`
- Modify: `src/ui/minor-civ-notifications.ts`
- Modify: `src/ui/minor-civ-notification-listeners.ts`
- Modify: `tests/systems/quest-system.test.ts:280-450`
- Modify: `tests/systems/council-system.test.ts`
- Modify: `tests/ui/advisor-system.test.ts`
- Modify: `tests/ui/minor-civ-notifications.test.ts`
- Modify: `tests/ui/minor-civ-notification-listeners.test.ts`

- [ ] **Step 1: Write failing hot-seat isolation tests**

```ts
it('returns only the viewer assignment for a shared issuer', () => {
  const a = getMinorCivQuestPresentationForPlayer(twoPlayerQuestState(), 'player-a', 'mc-athens');
  const b = getMinorCivQuestPresentationForPlayer(twoPlayerQuestState(), 'player-b', 'mc-athens');
  expect(a?.description).toContain('25 gold');
  expect(a?.description).not.toContain('100 gold');
  expect(b?.description).toContain('100 gold');
});

it('returns null for an undiscovered issuer even when another player discovered it', () => {
  expect(getMinorCivQuestPresentationForPlayer(oneViewerDiscoveredState(), 'player-b', 'mc-athens')).toBeNull();
});

it('routes retarget and alliance-broken notifications to the owner only', () => {
  const other = getMinorCivNotification(state, 'player-b', ownerOnlyTransitionFor('player-a'));
  expect(other).toBeNull();
});
```

- [ ] **Step 2: Run and verify failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-system.test.ts tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts
```

Expected: FAIL because the public API still accepts a naked quest.

- [ ] **Step 3: Replace naked quest presentation**

```ts
export interface MinorCivQuestPresentation {
  chainName?: string;
  stepLabel?: string;
  stepTitle?: string;
  description: string;
  progressLabel?: string;
  turnsRemaining?: number;
  currentReward: QuestReward;
  finalAllianceLabel?: string;
}

export function getMinorCivQuestPresentationForPlayer(
  state: GameState,
  viewerCivId: string,
  minorCivId: string,
): MinorCivQuestPresentation | null {
  if (!hasDiscoveredMinorCiv(state, viewerCivId, minorCivId)) return null;
  const mc = state.minorCivs[minorCivId];
  const quest = mc?.activeQuests[viewerCivId];
  if (!mc || !quest) return null;
  return buildPresentationFromAssignment(state, viewerCivId, minorCivId, quest);
}
```

Keep internal description helpers private or require an explicit assignment context. Remove `isQuestVisibleToPlayer(state, quest, viewer)` and other public naked-quest APIs. Update council and diplomacy consumers.

Update advisor triggers in the same task. Quest advice reads only `activeQuests[state.currentPlayer]`; mercantile and cultural ally advice calls `isMinorCivAllianceActive`. Add a hot-seat regression proving another player's active quest cannot trigger the current viewer's advisor.

- [ ] **Step 4: Add chain-state presentation**

Export a second scoped helper for pending/allied/broken/effective-status display. It reads only `chainStatusByCiv[viewerCivId]`, never enumerates another player's records, and uses definition metadata for labels.

- [ ] **Step 5: Add and route transition notifications**

Extend notification event unions and listeners for progressed, retargeted, cancelled, pending, and alliance-broken. Every player-specific formatter begins with:

```ts
if (event.majorCivId !== viewerCivId) return null;
```

Then require discovered issuer presentation. Route logs and hot-seat pending events to `event.majorCivId`, never `state.currentPlayer`.

- [ ] **Step 6: Run privacy tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/quest-system.test.ts tests/systems/council-system.test.ts tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts
```

Expected: PASS, including two-player divergent quest contents and owner-only logs.

- [ ] **Step 7: Commit presentation boundaries**

```bash
git add src/systems/quest-presentation.ts src/systems/quest-system.ts src/systems/council-system.ts src/ui/minor-civ-notifications.ts src/ui/minor-civ-notification-listeners.ts tests/systems/quest-system.test.ts tests/systems/council-system.test.ts tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts
git commit -m "fix(quests): scope chain presentation per viewer"
```

## Task 12: Render Chain State And Festival Interaction In Diplomacy UI

**Files:**
- Modify: `src/ui/diplomacy-panel.ts:140-305`
- Modify: `src/main.ts:640-700`
- Modify: `tests/ui/diplomacy-panel.test.ts:64-228`

Before editing buttons, read `.claude/skills/button-styling.md` and follow the repository's `createGameButton` contract.

### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Normal quest completion crosses Friendly | Complete quest | Open panel changes to chain name and `Step 1 of 3` |
| Gift chain step is active | Tap `Gift Gold` | Gold changes and the same panel renders Step 2 or pending state |
| Festival has gold and luxury | Tap `Sponsor Grand Festival` | Panel renders Durable Alliance and ally bonus |
| Festival lacks gold or luxury | Inspect action | Button is disabled and a specific unmet reason is visible |
| Active alliance | Tap `Declare War` | Panel rerenders At War; alliance bonus/status disappear |
| Broken alliance at war | Tap `Make Peace` | Panel rerenders non-allied status and rebuild guidance |
| Player handoff | Reopen diplomacy | Only the new current player's quest and chain state appear |

### Misleading UI Risks

- Do not label raw relationship `60+` as Allied without stored durable alliance.
- Do not render a festival button for a fallback gift objective.
- Do not display another player's pending step or resource requirement.
- Do not show a stale step after gift/festival/war/peace mutation.
- Do not display negative turns remaining; the final valid turn is `0 turns`.

### Interaction Replay Checklist

- Open chain Step 1.
- Click gift once and inspect Step 2.
- Click the next available action after rerender; ensure the listener targets the new DOM.
- Retarget the objective and reopen the panel.
- Complete the festival and inspect alliance state.
- Declare war, make peace, and inspect broken guidance.
- Switch `state.currentPlayer`, reopen, and verify previous-player data is absent.

- [ ] **Step 1: Write rendered-state tests before UI changes**

```ts
it('renders chain name, step, progress, expiry, rewards, and final ally bonus', () => {
  const panel = createDiplomacyPanel(container, activeChainState(), callbacks);
  expect(panel.textContent).toContain('Festivals And Exchange');
  expect(panel.textContent).toContain('Step 3 of 3');
  expect(panel.textContent).toContain('Sponsor the Grand Festival');
  expect(panel.textContent).toContain('0 turns remaining');
  expect(panel.textContent).toContain('Durable alliance');
});

it('shows exact disabled reasons for festival requirements', () => {
  const panel = createDiplomacyPanel(container, festivalWithoutLuxuryState(), callbacks);
  const button = panel.querySelector<HTMLButtonElement>('[data-action="sponsor-festival"]');
  expect(button?.disabled).toBe(true);
  expect(panel.textContent).toContain('Requires access to any luxury');
});

it('does not render player A chain data after switching to player B', () => {
  const state = divergentHotSeatChainState();
  state.currentPlayer = 'player-b';
  const panel = createDiplomacyPanel(container, state, callbacks);
  expect(panel.textContent).not.toContain('player-a-only-target');
});
```

- [ ] **Step 2: Run and verify UI failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/diplomacy-panel.test.ts
```

Expected: FAIL because chain details and festival controls are absent.

- [ ] **Step 3: Extend panel callback and row models**

Add:

```ts
onSponsorFestival?: (minorCivId: string) => void;
```

Build each row only from `getMinorCivPresentationForPlayer`, `getMinorCivQuestPresentationForPlayer`, and the scoped chain-state helper. Do not read another player's active quest or status through `Object.values`.

- [ ] **Step 4: Render chain states and requirements**

Use DOM nodes and `textContent` for dynamic data. Use `createGameButton` for new controls. Render active, pending, allied, broken, and at-war states exactly as the spec describes. Keep normal gifts reachable.

- [ ] **Step 5: Wire festival callback and immediate rerender**

Add `handleSponsorFestival` in `main.ts`, delegate to `performMinorCivFestival(..., bus)`, assign the state, update renderer/HUD, show structured failure reason, and call `openDiplomacyPanel()` after success.

Gift, festival, war, and peace handlers must all reopen the panel after applying the new state. Tests should click the first action, then query the newly rendered panel before clicking again.

- [ ] **Step 6: Run UI and action tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/diplomacy-panel.test.ts tests/systems/minor-civ-actions.test.ts tests/ui/minor-civ-notifications.test.ts
```

Expected: PASS for visible text, disabled reasons, repeat-click after rerender, and handoff isolation.

- [ ] **Step 7: Commit the live UI**

```bash
git add src/ui/diplomacy-panel.ts src/main.ts tests/ui/diplomacy-panel.test.ts
git commit -m "feat(quests): show alliance chains in diplomacy"
```

## Task 13: End-To-End Regression Sweep And Final Verification

**Files:**
- Modify only files required by failures found during verification.
- Test: all directly relevant suites plus full repository checks.

- [ ] **Step 1: Add one complete chain replay regression**

In `tests/systems/minor-civ-system.test.ts`, create one deterministic cultural replay:

```ts
it('replays normal quest through all three cultural steps into durable alliance', () => {
  let state = qualifyingCulturalNormalQuestState();
  state = applyQuestGameplayAction(state, giftActionForActiveQuest({ amount: 25 })).state;
  expect(getTestActiveStep(state, 'player', 'mc-athens')).toBe(0);

  state = performMinorCivGift(state, 'player', 'mc-athens', getTestRequiredGift(state, 'player', 'mc-athens')).state;
  expect(getTestActiveOrPendingStep(state, 'player', 'mc-athens')).toBe(1);

  state = satisfyTestCulturalExchangeStep(state, 'player', 'mc-athens');
  expect(getTestActiveOrPendingStep(state, 'player', 'mc-athens')).toBe(2);

  state = performMinorCivFestival(state, 'player', 'mc-athens').state;
  expect(isMinorCivAllianceActive(state, 'player', 'mc-athens')).toBe(true);
  expect(state.minorCivs['mc-athens'].diplomacy.relationships.player).toBeGreaterThanOrEqual(60);
});
```

Define `getTestActiveStep`, `getTestRequiredGift`, `getTestActiveOrPendingStep`, and `satisfyTestCulturalExchangeStep` as local test helpers in the same file. Use explicit fixtures so the replay never depends on random quest selection.

- [ ] **Step 2: Run source rule checks**

List changed source files, then run:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/core/game-state.ts src/core/id-counters.ts src/storage/save-manager.ts src/systems/quest-chain-definitions.ts src/systems/quest-objective-system.ts src/systems/quest-chain-system.ts src/systems/quest-system.ts src/systems/minor-civ-system.ts src/systems/minor-civ-actions.ts src/systems/barbarian-system.ts src/systems/combat-reward-system.ts src/systems/trade-system.ts src/systems/quest-presentation.ts src/systems/council-system.ts src/ui/diplomacy-panel.ts src/ui/minor-civ-notifications.ts src/ui/minor-civ-notification-listeners.ts src/main.ts
```

Expected: exit `0` with no rule violations.

- [ ] **Step 3: Run the complete targeted regression set**

```bash
./scripts/run-with-mise.sh yarn test --run tests/core/game-state.test.ts tests/core/migrate-id-counters.test.ts tests/storage/save-persistence.test.ts tests/systems/quest-chain-definitions.test.ts tests/systems/quest-objective-system.test.ts tests/systems/quest-chain-system.test.ts tests/systems/quest-system.test.ts tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-actions.test.ts tests/systems/barbarian-system.test.ts tests/systems/combat-reward-system.test.ts tests/systems/trade-system.test.ts tests/systems/council-system.test.ts tests/ai/basic-ai.test.ts tests/core/turn-manager.test.ts tests/ui/diplomacy-panel.test.ts tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts
```

Expected: all listed test files PASS.

- [ ] **Step 4: Run production build**

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: TypeScript and Vite build PASS.

- [ ] **Step 5: Run the full repository suite**

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: all Vitest and hook smoke tests PASS.

- [ ] **Step 6: Run the shared web smoke test and inspect the live panel**

```bash
./scripts/run-with-mise.sh yarn test:web-smoke
./scripts/run-with-mise.sh yarn dev --host 127.0.0.1
```

Expected: web smoke PASS and Vite reports a localhost URL. Use the Browser plugin to open that URL, start or load a game, discover a city-state, and open Diplomacy. Verify the panel renders without console errors, buttons retain touch-sized styling, normal gifts still work, and closing/reopening the panel does not retain stale DOM. The deterministic jsdom replay remains the proof for late-chain states that are impractical to reach manually.

- [ ] **Step 7: Inspect committed and uncommitted diffs**

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- src tests docs/superpowers
git diff -- src tests docs/superpowers
```

Expected: every source change maps to this plan, no unrelated sprite changes appear, and the uncommitted diff is empty before publishing.

- [ ] **Step 8: Commit verification fixes or the final replay test**

```bash
git add src tests
git commit -m "test(quests): cover complete alliance chain replay"
```

If the final replay test was already committed with a necessary verification fix, do not create an empty commit.

## Final Review Checklist

- [ ] Every runtime minor-civ archetype has at least one exactly three-step chain.
- [ ] Adding an archetype without a chain fails compilation and runtime completeness tests.
- [ ] Military targets are legal, currently visible, nearby, and count-bounded.
- [ ] Trade targets satisfy every feasibility predicate through one shared helper.
- [ ] Gold targets pass the twenty-turn economy projection before issuance.
- [ ] Festival completion requires gold and luxury access and consumes neither luxury nor another player's resources.
- [ ] Normal reward is applied before chain eligibility.
- [ ] Pending stores the exact next step and suppresses normal quests.
- [ ] Expiration is inclusive and applies the standard penalty/cooldown exactly once.
- [ ] Other-actor invalidation never awards progress.
- [ ] Raw relationship alone never activates durable alliance.
- [ ] War breaks earned alliance, clears active/pending chains, and is bilateral.
- [ ] Peace does not restore alliance.
- [ ] Human, AI, and turn-loop combat/camp paths share source-owned progress.
- [ ] Quest assignment and presentation are scoped by both major and minor civilization IDs.
- [ ] Hot-seat UI, logs, notifications, resources, targets, and alliance bonuses do not leak.
- [ ] Save normalization handles legacy, valid, and invalid chain state.
- [ ] Open diplomacy UI refreshes after every state-changing action.
- [ ] Targeted tests, build, full tests, rule checks, and both diff reviews pass.
