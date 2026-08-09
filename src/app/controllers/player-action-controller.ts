/**
 * Owns the player-unit-action functions extracted from `main.ts` in #787
 * phase 10b-e: `getUnitTurnFlow`, `performWorkerAction`, `performPreach`,
 * `ensurePlayerWarState`, `restAction`, `showEspionageCaptureChoice`
 * (~274 lines pre-move).
 *
 * This is a partial `PlayerActionController` -- Phase 13 (PR #800, not yet
 * merged as of this writing) covers a *different* six-function group in the
 * same domain (`executeAttack`, `foundCityAction`, `executeUpgrade`,
 * `beginPlayerCityAssault`, `executeMinorCivConquest`,
 * `finalizePendingCityCaptureChoice`) and is expected to extend this same
 * file with those functions once it lands, per the plan doc's explicit
 * fallback: "if Phase 13 has not yet been implemented when 10b-e starts,
 * add these functions to Phase 13's own Moves list instead of creating a
 * second controller." Those six functions stay in `main.ts` for now and are
 * NOT touched by this phase.
 *
 * Construction-order circularity: `getUnitTurnFlow`'s body needs
 * `turnFlow.endTurn` and `selectionController`'s unit-selection methods;
 * conversely `selectionController` and `turnFlow` both take
 * `getUnitTurnFlow` (and `selectionController` also takes
 * `performWorkerAction`/`performPreach`/`restAction`/`ensurePlayerWarState`)
 * as their own construction deps. `main.ts` resolves this the same way it
 * resolves every other three-way forward reference in this file: this
 * controller is constructed *after* both `selectionController` and
 * `turnFlow`, taking direct references to both; `selectionController`'s and
 * `turnFlow`'s own construction use lazy wrappers (`{ getUnitTurnFlow: () =>
 * playerActions.getUnitTurnFlow(), ... }`) for the functions that moved here,
 * the same deferred-but-eager pattern `router`/`notifier`/`campaignEntry`
 * already use elsewhere in `main.ts`.
 *
 * `notifier` is threaded through as a lazy wrapper too -- it's a `let` not
 * assigned until `init()` runs, well after every module-scope controller
 * construction, same as `turnFlow`'s own `notifier` dep.
 *
 * `setBlockingOverlay` and `currentCiv` are cross-cutting helpers (phase
 * 10b-f's domain) still living in `main.ts` -- threaded through as deps
 * until that phase gives them a real home.
 *
 * Everything this file calls that is a pure `@/systems/*`, `@/ui/*` helper
 * is imported directly, matching the precedent set by every prior controller
 * in this arc.
 */
import type { RenderLoop } from '@/renderer/render-loop';
import type { EventBus } from '@/core/event-bus';
import type { GameSession, SelectionStore, Notifier } from '@/app/ports';
import type { HudController } from '@/app/controllers/hud-controller';
import type { SelectionController } from '@/app/controllers/selection-controller';
import type { TurnFlowController } from '@/app/controllers/turn-flow-controller';
import type { Civilization, WorkerActionType } from '@/core/types';
import type { UnitTurnFlow } from '@/ui/unit-turn-flow';
import { createUnitTurnFlow } from '@/ui/unit-turn-flow';
import { removeRouteForUnit } from '@/systems/trade-system';
import { applyWorkerAction } from '@/systems/worker-action-system';
import { preach } from '@/systems/religion-system';
import { createUnitDeleteConfirmationPanel } from '@/ui/unit-delete-confirmation-panel';
import { UNIT_DEFINITIONS, canHeal, restUnit, createUnit } from '@/systems/unit-system';
import { isMajorCivOwner } from '@/core/owner-kind';
import { declareWar, modifyRelationship, resolveOpponentKind } from '@/systems/diplomacy-system';
import { applyOpportunisticWarPenaltyIfCrisisStruck } from '@/systems/crisis-interaction-system';
import { getSpyCaptureRelationshipPenalty, expelSpy, executeSpy, startInterrogation } from '@/systems/espionage-system';
import { getCapitalCity } from '@/systems/capital-system';

export interface PlayerActionController {
  getUnitTurnFlow(): UnitTurnFlow;
  performWorkerAction(action: WorkerActionType): void;
  performPreach(unitId: string, cityId: string): void;
  ensurePlayerWarState(targetCivId: string): void;
  restAction(): void;
  showEspionageCaptureChoice(spyId: string, spyOwner: string): void;
}

/** The narrow slice of `RenderLoop` this controller needs. */
export type PlayerActionRenderer = Pick<RenderLoop, 'setGameState'> & { readonly camera: Pick<RenderLoop['camera'], 'centerOn'> };

export interface PlayerActionControllerDeps {
  readonly session: GameSession;
  readonly bus: EventBus;
  readonly uiLayer: HTMLDivElement;
  readonly selection: Pick<SelectionStore, 'getSelectedUnitId'>;
  readonly selectionController: Pick<SelectionController, 'selectUnit' | 'deselectUnit' | 'selectNextUnit' | 'refreshCurrentPlayerVisibility'>;
  /** Lazy wrapper not needed here -- constructed after `turnFlow` in `main.ts`. */
  readonly turnFlow: Pick<TurnFlowController, 'endTurn'>;
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
}

export function createPlayerActionController(deps: PlayerActionControllerDeps): PlayerActionController {
  function getUnitTurnFlow(): UnitTurnFlow {
    return createUnitTurnFlow({
      uiLayer: deps.uiLayer,
      getState: () => deps.session.getState(),
      setState: nextState => { deps.session.setStateWithoutRefresh(nextState); },
      getSelectedUnitId: () => deps.selection.getSelectedUnitId(),
      selectUnit: deps.selectionController.selectUnit,
      deselectUnit: deps.selectionController.deselectUnit,
      selectNextUnit: deps.selectionController.selectNextUnit,
      centerOn: coord => deps.renderLoop.camera.centerOn(coord),
      refreshVisibility: deps.selectionController.refreshCurrentPlayerVisibility,
      setRenderState: state => deps.renderLoop.setGameState(state),
      updateHUD: () => deps.hud.update(),
      showNotification: deps.showNotification,
      setBlockingOverlay: deps.setBlockingOverlay,
      endTurn: options => { void deps.turnFlow.endTurn(options); },
      onUnitDisbanded: (state, unitId, routeId) =>
        removeRouteForUnit(state, unitId, deps.bus, 'unit-disbanded', routeId),
    });
  }

  function performWorkerAction(action: WorkerActionType): void {
    const selectedUnitId = deps.selection.getSelectedUnitId();
    if (!selectedUnitId) return;

    const result = applyWorkerAction(deps.session.getState(), selectedUnitId, action);
    if (!result.ok) return;

    deps.session.setStateWithoutRefresh(result.state);
    for (const event of result.events) {
      if (event.type === 'improvement:started') {
        deps.bus.emit('improvement:started', event.payload);
      } else if (event.type === 'road:started') {
        deps.bus.emit('road:started', event.payload);
      } else {
        deps.bus.emit('unit:destroyed', event.payload);
      }
    }

    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();

    if (result.workerConsumed || result.workerLost || !deps.session.getState().units[selectedUnitId]) {
      deps.selectionController.deselectUnit();
    } else {
      deps.selectionController.selectUnit(selectedUnitId);
    }

    deps.showNotification(result.message, result.workerLost ? 'warning' : 'info');
  }

  // #592 MR5: preach action. Mirrors performWorkerAction's state-apply + rerender pattern,
  // but adds a non-destructive confirmation dialog when the missionary is consumed on its
  // last charge -- the deletion has already happened inside preach() by this point, so the
  // dialog is an acknowledgment, not a gate (hideCancel: true, no undo possible).
  function performPreach(unitId: string, cityId: string): void {
    const unit = deps.session.getState().units[unitId];
    const cityName = deps.session.getState().cities[cityId]?.name ?? cityId;
    const result = preach(deps.session.getState(), unitId, cityId, deps.bus);
    if (!result.ok) return;

    deps.session.commit(result.state);

    const message = result.converted
      ? `${cityName} has converted to your faith!`
      : `You preached in ${cityName}.`;

    if (result.unitConsumed) {
      deps.selectionController.deselectUnit();
      deps.setBlockingOverlay('unit-delete-confirmation');
      createUnitDeleteConfirmationPanel(deps.uiLayer, {
        unitName: unit ? UNIT_DEFINITIONS[unit.type].name : 'Missionary',
        title: 'Missionary Used Up',
        bodyText: `${message} That was its last charge, so the missionary is gone.`,
        confirmLabel: 'OK',
        hideCancel: true,
        tone: 'neutral',
        onConfirm: () => {
          deps.uiLayer.querySelector('#unit-delete-confirmation-panel')?.remove();
          deps.setBlockingOverlay(null);
        },
        onCancel: () => {
          deps.uiLayer.querySelector('#unit-delete-confirmation-panel')?.remove();
          deps.setBlockingOverlay(null);
        },
      });
    } else {
      deps.selectionController.selectUnit(unitId);
      deps.showNotification(message, result.converted ? 'success' : 'info');
    }
  }

  function ensurePlayerWarState(targetCivId: string): void {
    const targetCiv = deps.session.getState().civilizations[targetCivId];
    if (!targetCiv || !isMajorCivOwner(targetCivId)) return;

    const cp = deps.session.getState().currentPlayer;
    const alreadyAtWar = deps.currentCiv().diplomacy?.atWarWith.includes(targetCivId) ?? false;
    if (alreadyAtWar) return;

    deps.currentCiv().diplomacy = declareWar(deps.currentCiv().diplomacy, targetCivId, deps.session.getState().turn);
    targetCiv.diplomacy = declareWar(targetCiv.diplomacy, cp, deps.session.getState().turn);
    deps.bus.emit('diplomacy:war-declared', { attackerId: cp, defenderId: targetCivId, opponentKind: resolveOpponentKind(targetCivId) });
    deps.session.setStateWithoutRefresh(applyOpportunisticWarPenaltyIfCrisisStruck(deps.session.getState(), cp, targetCivId, deps.bus));
  }

  function restAction(): void {
    const selectedUnitId = deps.selection.getSelectedUnitId();
    if (!selectedUnitId) return;
    const unit = deps.session.getState().units[selectedUnitId];
    if (!unit || !canHeal(unit)) return;

    deps.session.getState().units[selectedUnitId] = restUnit(unit);
    deps.showNotification(`${UNIT_DEFINITIONS[unit.type].name} is resting and will heal +15 HP next turn`, 'info');
    deps.selectionController.deselectUnit();
    deps.renderLoop.setGameState(deps.session.getState());
  }

  function showEspionageCaptureChoice(spyId: string, spyOwner: string): void {
    const captorEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
    const spy = deps.session.getState().espionage?.[spyOwner]?.spies[spyId];
    if (!captorEsp || !spy) return;
    const spyOwnerName = deps.session.getState().civilizations[spyOwner]?.name ?? spyOwner;

    // D1: always reveal true identity to captor regardless of disguise
    const captureMessage = `You have captured ${spy.name}, a ${spy.unitType} belonging to ${spyOwnerName}.`;

    // infiltrated spies are inside the city (distance 0); otherwise use boundary penalty
    const distanceToCity = spy.infiltrationCityId ? 0 : 1;
    const relPenalty = getSpyCaptureRelationshipPenalty(distanceToCity);

    deps.notifier.choice(captureMessage, [
      {
        label: `Expel (${relPenalty} relations)`,
        onClick: () => {
          const updatedOwnerEsp = expelSpy(deps.session.getState().espionage![spyOwner], spyId, 15);
          const capital = getCapitalCity(deps.session.getState(), spyOwner);
          if (capital) {
            const newUnit = createUnit(spy.unitType, spyOwner, capital.position, deps.session.getState().idCounters);
            deps.session.setStateWithoutRefresh({
              ...deps.session.getState(),
              units: { ...deps.session.getState().units, [newUnit.id]: newUnit },
              civilizations: {
                ...deps.session.getState().civilizations,
                [spyOwner]: {
                  ...deps.session.getState().civilizations[spyOwner],
                  units: [...deps.session.getState().civilizations[spyOwner].units, newUnit.id],
                },
              },
            });
            const { [spyId]: _old, ...rest } = updatedOwnerEsp.spies;
            deps.session.setStateWithoutRefresh({
              ...deps.session.getState(),
              espionage: {
                ...deps.session.getState().espionage,
                [spyOwner]: {
                  ...updatedOwnerEsp,
                  spies: { ...rest, [newUnit.id]: { ...updatedOwnerEsp.spies[spyId]!, id: newUnit.id } },
                },
              },
            });
          } else {
            deps.session.setStateWithoutRefresh({ ...deps.session.getState(), espionage: { ...deps.session.getState().espionage, [spyOwner]: updatedOwnerEsp } });
          }
          // Bilateral: captor's view of spy owner AND spy owner's view of captor
          const captorId = deps.session.getState().currentPlayer;
          deps.session.setStateWithoutRefresh({
            ...deps.session.getState(),
            civilizations: {
              ...deps.session.getState().civilizations,
              [captorId]: {
                ...deps.session.getState().civilizations[captorId],
                diplomacy: modifyRelationship(
                  deps.session.getState().civilizations[captorId].diplomacy, spyOwner, relPenalty,
                ),
              },
              [spyOwner]: {
                ...deps.session.getState().civilizations[spyOwner],
                diplomacy: modifyRelationship(
                  deps.session.getState().civilizations[spyOwner].diplomacy, captorId, relPenalty,
                ),
              },
            },
          });
          deps.showNotification(`${spy.name} expelled. Will return to their capital after 15 turns.`, 'info');
          deps.renderLoop.setGameState(deps.session.getState());
        },
      },
      {
        label: 'Execute',
        danger: true,
        onClick: () => {
          // Second in-panel confirmation -- no window.confirm on mobile
          deps.notifier.choice(
            `Execute ${spy.name}? This cannot be undone and will severely damage relations with ${spyOwnerName}.`,
            [
              {
                label: 'Cancel',
                onClick: () => showEspionageCaptureChoice(spyId, spyOwner),
              },
              {
                label: 'Confirm Execute',
                danger: true,
                onClick: () => {
                  const captorId = deps.session.getState().currentPlayer;
                  deps.session.setStateWithoutRefresh({
                    ...deps.session.getState(),
                    espionage: {
                      ...deps.session.getState().espionage,
                      [spyOwner]: executeSpy(deps.session.getState().espionage![spyOwner], spyId),
                    },
                    // Bilateral: captor's view AND spy owner's view
                    civilizations: {
                      ...deps.session.getState().civilizations,
                      [captorId]: {
                        ...deps.session.getState().civilizations[captorId],
                        diplomacy: modifyRelationship(
                          deps.session.getState().civilizations[captorId].diplomacy, spyOwner, relPenalty * 2,
                        ),
                      },
                      [spyOwner]: {
                        ...deps.session.getState().civilizations[spyOwner],
                        diplomacy: modifyRelationship(
                          deps.session.getState().civilizations[spyOwner].diplomacy, captorId, relPenalty * 2,
                        ),
                      },
                    },
                  });
                  deps.bus.emit('espionage:spy-executed', {
                    executingCivId: captorId, spyOwner, spyId, spyName: spy.name,
                  });
                  deps.showNotification(`${spy.name} has been executed.`, 'warning');
                  deps.renderLoop.setGameState(deps.session.getState());
                },
              },
            ],
          );
        },
      },
      {
        label: 'Interrogate (4 turns)',
        onClick: () => {
          const ownerEsp = deps.session.getState().espionage![spyOwner];
          deps.session.setStateWithoutRefresh({
            ...deps.session.getState(),
            espionage: {
              ...deps.session.getState().espionage,
              [deps.session.getState().currentPlayer]: startInterrogation(captorEsp, spyId, spyOwner),
              // Set spy status to 'interrogated' on the spy owner's record
              [spyOwner]: {
                ...ownerEsp,
                spies: {
                  ...ownerEsp.spies,
                  [spyId]: { ...ownerEsp.spies[spyId]!, status: 'interrogated' as const },
                },
              },
            },
          });
          deps.showNotification(`${spy.name} is being interrogated. Check the Intel panel for results.`, 'info');
          deps.renderLoop.setGameState(deps.session.getState());
        },
      },
    ]);
  }

  return {
    getUnitTurnFlow,
    performWorkerAction,
    performPreach,
    ensurePlayerWarState,
    restAction,
    showEspionageCaptureChoice,
  };
}
