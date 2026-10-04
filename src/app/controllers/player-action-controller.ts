/**
 * Owns the player-unit-action functions extracted from `main.ts`:
 * `getUnitTurnFlow`, `performWorkerAction`, `performPreach`,
 * `ensurePlayerWarState`, `restAction`, `showEspionageCaptureChoice` (#787
 * phase 10b-e, ~274 lines pre-move), plus `executeAttack`, `foundCityAction`,
 * `executeUpgrade`, `beginPlayerCityAssault`, `executeMinorCivConquest`
 * (#787 phase 13, ~220 lines pre-move) -- "the mutation that runs after the
 * player confirms a preview or dialog" for combat, city founding, unit
 * upgrades, and city capture. Phase 13's plan doc (PR #800) was written
 * before 10b-e shipped and predates two things it still describes
 * incorrectly: it lists `finalizePendingCityCaptureChoice` as a sixth
 * function to move here, but that function already belongs to
 * `TurnFlowController` (#787 phase 9) and was never `main.ts`-local by the
 * time this phase started -- confirmed by grep, not assumed, per
 * `.claude/rules/spec-fidelity.md`; it also describes creating this file
 * fresh, but 10b-e already created it for the unrelated six-function group
 * above -- exactly the fallback the earlier phase's own docblock predicted
 * ("if Phase 13 has not yet been implemented when 10b-e starts, add these
 * functions to Phase 13's own Moves list instead of creating a second
 * controller").
 *
 * Construction-order circularity: `getUnitTurnFlow`'s body needs
 * `turnFlow.endTurn` and `selectionController`'s unit-selection methods;
 * conversely `selectionController` and `turnFlow` both take
 * `getUnitTurnFlow` (and `selectionController` also takes
 * `performWorkerAction`/`performPreach`/`restAction`/`ensurePlayerWarState`,
 * plus now `foundCityAction`/`executeUpgrade`; `mapInteraction` takes
 * `executeAttack`/`executeMinorCivConquest`/`beginPlayerCityAssault`) as
 * their own construction deps. `bootstrap.ts` resolves this the same way it
 * resolves every other three-way forward reference in `createAppComposition`
 * (#787 phase 10b-g): this controller is constructed *after*
 * `selectionController` and `turnFlow`, taking direct references to both;
 * `selectionController`'s, `turnFlow`'s, and `mapInteraction`'s own
 * construction route through `playerActions.<method>` for everything that
 * lives here, the same deferred-but-eager pattern `router`/`notifier`/
 * `campaignEntry` already use elsewhere in that file.
 *
 * `notifier` is threaded through as a lazy wrapper too -- it's a `let` not
 * assigned until `init()` runs, well after every module-scope controller
 * construction, same as `turnFlow`'s own `notifier` dep.
 *
 * `setBlockingOverlay`, `currentCiv`, and `maybeShowPendingHoardChoice` are
 * cross-cutting helpers/`main.ts`-local functions threaded through as deps
 * -- `maybeShowPendingHoardChoice` in particular stays `main.ts`-local
 * because it is not "a mutation after a preview/dialog confirm" the way the
 * other five functions are; it is `executeAttack`'s own post-kill hook into
 * a beast-hoard-choice flow that also has other, unrelated callers.
 *
 * Everything this file calls that is a pure `@/systems/*`, `@/ui/*` helper
 * is imported directly, matching the precedent set by every prior controller
 * in this arc. `ensurePlayerWarState`, `beginPlayerCityAssault`, and
 * `finalizePendingCityCaptureChoice` (the latter via `deps.turnFlow`) are
 * called as same-file sibling references from `beginPlayerCityAssault`/
 * `executeAttack` now that they live together -- no wrapper needed, per the
 * arc's own "keep consumer deps unchanged, rewire only the call site"
 * precedent.
 *
 * #1243 split this by player use case (the #1242 pattern). This file keeps the public
 * `PlayerActionController` interface, the deps vocabulary and a thin composite:
 *   - `player-unit-actions.ts`       -- turn flow, worker, preach, rest, war guard, upgrade, found city
 *   - `player-espionage-capture.ts`  -- captured-spy choice dialog
 *   - `player-combat-actions.ts`     -- attack, bombard, siege, city/camp assault, minor-civ conquest
 * Combat reaches `ensurePlayerWarState` through a handle; every action still routes through
 * its existing typed contract (no alternate executor).
 */

import { createPlayerUnitActions } from './player-unit-actions';
import { createPlayerEspionageCapture } from './player-espionage-capture';
import { createPlayerCombatActions } from './player-combat-actions';
import type { PlayerActionController, PlayerActionControllerDeps } from './player-action-shared';

export type { PlayerActionController, PlayerActionControllerDeps, PlayerActionRenderer } from './player-action-shared';

export function createPlayerActionController(deps: PlayerActionControllerDeps): PlayerActionController {
  const unitActions = createPlayerUnitActions(deps);
  const espionageCapture = createPlayerEspionageCapture(deps);
  const combatActions = createPlayerCombatActions(deps, { ensurePlayerWarState: unitActions.ensurePlayerWarState });

  return {
    ...unitActions,
    ...espionageCapture,
    ...combatActions,
  };
}
