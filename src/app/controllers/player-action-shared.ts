/**
 * Shared vocabulary for the use-case split of `player-action-controller.ts` (#1243): the public
 * `PlayerActionController` interface and its deps. Slices import from here, never from the composite.
 */
import type { RenderLoop } from '@/renderer/render-loop';
import type { EventBus } from '@/core/event-bus';
import type { GameSession, SelectionStore, Notifier } from '@/app/ports';
import type { HudController } from '@/app/controllers/hud-controller';
import type { SelectionController } from '@/app/controllers/selection-controller';
import type { TurnFlowController } from '@/app/controllers/turn-flow-controller';
import type { AdvisorSystem } from '@/ui/advisor-system';
import type { Civilization, CivBonusEffect, CombatResult, HexCoord, UnitType, WorkerActionType } from '@/core/types';
import type { UnitTurnFlow } from '@/ui/unit-turn-flow';

export interface PlayerActionController {
  getUnitTurnFlow(): UnitTurnFlow;
  performWorkerAction(action: WorkerActionType): void;
  performPreach(unitId: string, cityId: string): void;
  ensurePlayerWarState(targetCivId: string): void;
  restAction(): void;
  showEspionageCaptureChoice(spyId: string, spyOwner: string): void;
  executeAttack(attackerId: string, targetKey: string): void;
  foundCityAction(): void;
  executeUpgrade(unitId: string, targetType: UnitType): boolean;
  bombardCity(attackerId: string, cityId: string): void;
  holdSiege(attackerId: string, cityId: string): void;
  beginPlayerCityAssault(
    attackerId: string,
    cityId: string,
    attackerBonus?: CivBonusEffect,
    precedingCombat?: CombatResult,
    embarkedAssault?: boolean,
  ): 'pending' | 'resolved';
  beginPlayerCampAssault(attackerId: string, campId: string): void;
  executeMinorCivConquest(unitId: string, target: HexCoord, minorCivId: string, cityId: string): void;
}

/** The narrow slice of `RenderLoop` this controller needs. */
export type PlayerActionRenderer =
  & Pick<RenderLoop, 'setGameState'>
  & { readonly camera: Pick<RenderLoop['camera'], 'centerOn'> }
  & { readonly animations: Pick<RenderLoop['animations'], 'add'> };

export interface PlayerActionControllerDeps {
  readonly session: GameSession;
  readonly bus: EventBus;
  readonly uiLayer: HTMLDivElement;
  readonly selection: Pick<SelectionStore, 'getSelectedUnitId' | 'setPendingIntent'>;
  readonly selectionController: Pick<
    SelectionController,
    | 'selectUnit' | 'deselectUnit' | 'selectNextUnit' | 'refreshCurrentPlayerVisibility'
    | 'executeAnimatedUnitMove' | 'refreshSelectedUnitAfterCombat'
  >;
  /** Lazy wrapper not needed here -- constructed after `turnFlow` in `bootstrap.ts`. */
  readonly turnFlow: Pick<TurnFlowController, 'endTurn' | 'finalizePendingCityCaptureChoice'>;
  readonly hud: Pick<HudController, 'update'>;
  readonly renderLoop: PlayerActionRenderer;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  readonly setBlockingOverlay: (id: string | null) => void;
  readonly currentCiv: () => Civilization;
  /**
   * Lazy wrapper, not a direct reference -- `notifier` is a `let` not
   * assigned until `init()` runs, well after this controller is constructed.
   */
  readonly notifier: Pick<Notifier, 'choice'>;
  readonly advisorSystem: Pick<AdvisorSystem, 'resetMessage' | 'check'>;
  /** #787 phase 13: `executeAttack`'s post-kill beast-hoard hook; stays `main.ts`-local (see module docblock). */
  readonly maybeShowPendingHoardChoice: () => void;
}
