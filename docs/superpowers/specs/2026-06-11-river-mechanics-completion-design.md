# River Mechanics Completion Design

**Issue:** [#351](https://github.com/a1flecke/conquestoria/issues/351)

## Context

Issue 351 was written against an older repository state. On current `origin/main`, the following acceptance criteria are already implemented:

- Land units pay one additional movement point for each crossed river edge.
- Naval units are exempt from the river movement surcharge.
- Civilizations with `bridge-building` ignore the surcharge.
- Bridge Building exists in the exploration track at era 3 and requires `road-building`.
- Unit movement regressions cover the surcharge, the technology exemption, forced march, and naval movement.

The remaining work is to apply the existing combat helper and make the existing river-yield helper canonical without changing current farm balance.

Review also requires the already-present movement rule to use one step-cost calculation across pathfinding, reachable highlights, blocker messaging, and execution. This prevents the UI and executor from disagreeing about river cost and lets route selection avoid unnecessarily expensive crossings.

## Gameplay Contract

### Combat

When an attacker and defender occupy adjacent hexes separated by a river edge, the attacker's effective combat strength is reduced by 20 percent. `getRiverDefensePenalty(true)` is the canonical source of the modifier.

The penalty is determined by the canonical combat-strength calculation from the attacker's position, the defender's position, and `GameMap.rivers`. `resolveCombat` and the player-facing combat preview consume that same calculation. Callers do not pass a separate crossing flag. This makes the rule apply consistently to player combat, AI combat, turn-manager combat, and minor-civilization combat.

Attacks that do not cross a river receive no river modifier. Ranged attacks cannot cross a single map edge between non-adjacent units, so they receive no river-crossing penalty under this design.

### Worked-Tile Yields

`getRiverYieldBonus(tile.hasRiver)` supplies the canonical base river yield and is added to the worked tile total. Its current contract remains `+1 gold` for a river tile and no bonus otherwise.

A completed farm on a river tile continues to receive an unconditional `+1 food`. This behavior is intentionally preserved and is not gated by Bridge Building or Irrigation. The existing Irrigation rule also remains unchanged: a completed riverside farm owned by a civilization with Irrigation receives `+1 production`.

## Architecture

`src/systems/combat-system.ts` will import `isRiverBetween` and `getRiverDefensePenalty`. `calculateCombatStrengths` will multiply attacker strength by `1 + penalty`, where the penalty is derived from the two unit positions, and will return the modifier breakdown used by both combat resolution and presentation. `src/main.ts` will render the resulting attacker strength and a visible river-crossing warning through `src/ui/combat-preview.ts`. Keeping resolution and preview on one calculation avoids duplicated logic and misleading pre-attack information.

`src/systems/city-work-system.ts` will import `getRiverYieldBonus` and add its result through the existing `addYield` helper. `src/systems/resource-system.ts`, which supplies live turn yields and projected city totals, will use the same helper instead of maintaining a second inline base-river bonus. Farm-specific food remains local to both callers because it depends on improvement state rather than river presence alone. The existing Irrigation production rule remains in `city-work-system.ts`; expanding its live-economy wiring is outside this issue's approved contract.

`src/systems/unit-system.ts` will own `getMovementStepCost`, including terrain, naval domain, Bridge Building, and river-edge rules. Pathfinding, movement range, blocker messaging, and `src/systems/unit-movement-system.ts` execution will all call it.

No types, save schema, events, UI, renderer, movement logic, or technology definitions change.

## Testing

`tests/systems/combat-system.test.ts` will prove both sides of the combat boundary with deterministic seeds:

- an otherwise identical river-crossing attack deals less damage to the defender than a non-crossing attack;
- a river segment elsewhere on the map does not affect combat.

`tests/ai/basic-ai.test.ts` will prove a non-human attack receives the same penalty through the live AI combat path.

`tests/ui/combat-preview.test.ts` will prove the player-facing detail text shows the river penalty only when the shared strength breakdown reports one.

`tests/systems/unit-system.test.ts` will prove pathfinding prefers a river-free detour when cheaper, Bridge Building restores the shorter route, and blocker messaging reports river-caused insufficient movement.

`tests/systems/city-work-system.test.ts` will prove the refactor preserves visible game balance:

- a river tile receives the canonical `+1 gold` bonus;
- a completed riverside farm still receives `+1 food` without Bridge Building or Irrigation;
- Irrigation still adds only its existing `+1 production` bonus.

`tests/systems/resource-system.test.ts` will characterize the matching live city-yield behavior so refactoring that path to the canonical helper cannot change river gold or completed riverside farm food.

Existing river-system and movement-system tests remain unchanged unless they expose a regression during implementation.

## Verification

After implementation, run:

- `scripts/check-src-rule-violations.sh src/systems/combat-system.ts src/systems/city-work-system.ts src/systems/resource-system.ts src/systems/unit-system.ts src/systems/unit-movement-system.ts src/ui/combat-preview.ts src/main.ts`
- `./scripts/run-with-mise.sh yarn vitest run tests/systems/combat-system.test.ts tests/systems/city-work-system.test.ts tests/systems/resource-system.test.ts tests/systems/river-system.test.ts tests/systems/unit-system.test.ts tests/systems/unit-movement-system.test.ts tests/ai/basic-ai.test.ts tests/ui/combat-preview.test.ts`
- `./scripts/run-with-mise.sh yarn build`
- `./scripts/run-with-mise.sh yarn test`

Review both `git diff --stat origin/main...HEAD` and `git diff --stat`, then inspect the corresponding full diffs before reporting completion.

## Out Of Scope

- Changing the Bridge Building technology or its tech-tree placement.
- Changing river movement costs or forced-march behavior.
- Gating river-farm food behind any technology.
- Adding river renderer effects.
- Applying a river-edge modifier to non-adjacent ranged attacks.
