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
import { createUnitTurnFlow } from '@/ui/unit-turn-flow';
import { removeRouteForUnit } from '@/systems/trade-system';
import { applyWorkerAction } from '@/systems/worker-action-system';
import { preach } from '@/systems/religion-system';
import { createUnitDeleteConfirmationPanel } from '@/ui/unit-delete-confirmation-panel';
import { UNIT_DEFINITIONS, canHeal, restUnit, createUnit, getBlockingMapEntityAt } from '@/systems/unit-system';
import { isMajorCivOwner } from '@/core/owner-kind';
import { declareWar, modifyRelationship, resolveOpponentKind } from '@/systems/diplomacy-system';
import { applyOpportunisticWarPenaltyIfCrisisStruck } from '@/systems/crisis-interaction-system';
import { getSpyCaptureRelationshipPenalty, expelSpy, executeSpy, startInterrogation } from '@/systems/espionage-system';
import { getCapitalCity } from '@/systems/capital-system';
import { hexKey, parseHexKey, hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { foundCityInState } from '@/systems/city-founding-system';
import { formatCityFoundingBlockerMessage, getCityFoundingBlockers } from '@/systems/city-territory-system';
import { createCityCapturePanel } from '@/ui/city-capture-panel';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { buildCombatContextForDefender, getAmphibiousAssaultMultiplier } from '@/systems/combat-context';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { resolveNavalCityBombardment } from '@/systems/naval-city-bombardment-system';
import { applyCombatOutcomeToState, getCaptureNotificationLabel } from '@/systems/combat-reward-system';
import { recordCombatForCiv } from '@/systems/threat-pressure-system';
import { resolveCombatEra } from '@/systems/era-resolution';
import { applyCampDestructionAtTarget } from '@/systems/barbarian-system';
import { recordBeastSlain } from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { SFX } from '@/audio/sfx';
import { conquestMinorCiv, applyDiplomaticReaction } from '@/systems/minor-civ-system';
import { buildUnitOccupancy, hasHostileUnitAtCoord } from '@/systems/unit-occupancy';
import { beginPlayerCityAssaultChoice, shouldPromptForPlayerCityCapture } from '@/input/city-assault-flow';
import { canUnitOccupyCity } from '@/systems/city-capture-system';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import { applyUnitUpgradeToState } from '@/systems/unit-upgrade-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { getEmbarkedAssaultTarget, detachCargoForEmbarkedAssault } from '@/systems/transport-system';
import { updateAndRefreshVisibility } from '@/systems/last-seen-presentation';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { getCurrentCivDef } from '@/app/cross-cutting-helpers';

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

    // #787 phase 12 (#794): same existing-panel guard as unit-turn-flow.ts's
    // showDeleteUnitConfirmation -- both call sites share this panel/overlay id.
    if (result.unitConsumed && deps.uiLayer.querySelector('#unit-delete-confirmation-panel')) return;

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
    const attackerCiv = deps.currentCiv();
    const alreadyAtWar = attackerCiv.diplomacy?.atWarWith.includes(targetCivId) ?? false;
    if (alreadyAtWar) return;

    const turn = deps.session.getState().turn;
    // Commit the declared-war state BEFORE emitting: registerDiplomacyPresentation's
    // 'diplomacy:war-declared' listener reads session.getState() synchronously to pick
    // a notification reason from the post-declareWar relationship score (declareWar
    // applies a -50 relationship hit, and describeWarReason's bands sit at -50/-20/0 --
    // tight enough that reading pre-war state there would show the wrong reason).
    // The opportunistic-crisis penalty below is a separate, later state stage and must
    // not be visible to that listener either, matching this function's original
    // (accidental, in-place-mutation-order) behavior exactly.
    deps.session.commit({
      ...deps.session.getState(),
      civilizations: {
        ...deps.session.getState().civilizations,
        [cp]: { ...attackerCiv, diplomacy: declareWar(attackerCiv.diplomacy, targetCivId, turn) },
        [targetCivId]: { ...targetCiv, diplomacy: declareWar(targetCiv.diplomacy, cp, turn) },
      },
    });
    deps.bus.emit('diplomacy:war-declared', { attackerId: cp, defenderId: targetCivId, opponentKind: resolveOpponentKind(targetCivId) });
    deps.session.commit(applyOpportunisticWarPenaltyIfCrisisStruck(deps.session.getState(), cp, targetCivId, deps.bus));
  }

  function restAction(): void {
    const selectedUnitId = deps.selection.getSelectedUnitId();
    if (!selectedUnitId) return;
    const unit = deps.session.getState().units[selectedUnitId];
    if (!unit || !canHeal(unit)) return;

    deps.session.commit({
      ...deps.session.getState(),
      units: { ...deps.session.getState().units, [selectedUnitId]: restUnit(unit) },
    });
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

  function executeMinorCivConquest(unitId: string, target: HexCoord, minorCivId: string, cityId: string): void {
    const cityName = deps.session.getState().cities[cityId]?.name ?? 'City-State';
    const movement = deps.selectionController.executeAnimatedUnitMove(unitId, () => executeUnitMove(deps.session.getState(), unitId, target, {
      actor: 'player',
      civId: deps.session.getState().currentPlayer,
      bus: deps.bus,
      foreignCityEntryId: cityId,
    }));
    if (!movement.ok) return;
    const movedUnit = deps.session.getState().units[unitId];
    const stateAfterMove = movedUnit
      ? { ...deps.session.getState(), units: { ...deps.session.getState().units, [unitId]: { ...movedUnit, movementPointsLeft: 0 } } }
      : deps.session.getState();
    const conquered = conquestMinorCiv(stateAfterMove, minorCivId, stateAfterMove.currentPlayer);
    deps.session.commit(conquered.state);
    emitMinorCivQuestTransitions(deps.bus, conquered.transitions, deps.session.getState());
    if (conquered.conquered) deps.bus.emit('minor-civ:destroyed', { minorCivId, conquerorId: deps.session.getState().currentPlayer });
    deps.showNotification(`${cityName} has been conquered!`, 'success');
    SFX.tap();
    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
  }

  function executeUpgrade(unitId: string, targetType: UnitType): boolean {
    const result = applyUnitUpgradeToState(deps.session.getState(), unitId, targetType);
    if (!result.upgraded) return false;
    deps.session.commit(result.state);
    return true;
  }

  function foundCityAction(): void {
    const selectedUnitId = deps.selection.getSelectedUnitId();
    if (!selectedUnitId) return;
    const unit = deps.session.getState().units[selectedUnitId];
    if (!unit || unit.type !== 'settler') return;

    const blockers = getCityFoundingBlockers(deps.session.getState(), unit.position);
    if (blockers.length > 0) {
      deps.showNotification(formatCityFoundingBlockerMessage(blockers), 'warning');
      return;
    }

    let result;
    try {
      result = foundCityInState(deps.session.getState(), selectedUnitId, deps.bus);
    } catch (error) {
      deps.showNotification(
        error instanceof Error ? error.message : 'City cannot be founded here.',
        'warning',
      );
      return;
    }
    deps.session.setStateWithoutRefresh(result.state);

    deps.selectionController.deselectUnit();
    const foundedCity = deps.session.getState().cities[result.cityId];
    deps.showNotification(`${foundedCity.name} has been founded!`, 'success');
    SFX.foundCity();

    // Update visibility
    updateAndRefreshVisibility(deps.session.getState(), deps.session.getState().currentPlayer);
    for (const contact of syncCivilizationContactsFromVisibility(deps.session.getState(), deps.session.getState().currentPlayer)) {
      deps.bus.emit('civilization:first-contact', contact);
    }

    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
  }

  function beginPlayerCityAssault(
    attackerId: string,
    cityId: string,
    attackerBonus?: CivBonusEffect,
    precedingCombat?: CombatResult,
    embarkedAssault = false,
  ): 'pending' | 'resolved' {
    const city = deps.session.getState().cities[cityId];
    if (!city) return 'resolved';
    const attacker = deps.session.getState().units[attackerId];
    if (!attacker || !canUnitOccupyCity(attacker)) return 'resolved';

    ensurePlayerWarState(city.owner);
    let attackerMultiplier: number | undefined;
    if (embarkedAssault) {
      const legality = getEmbarkedAssaultTarget(deps.session.getState(), attackerId, city.position, { viewerId: deps.session.getState().currentPlayer });
      if (!legality.ok || legality.targetType !== 'city') {
        deps.showNotification('That coastal assault is no longer possible.', 'warning');
        return 'resolved';
      }
      attackerMultiplier = getAmphibiousAssaultMultiplier(deps.session.getState(), attacker, city.position);
      const detached = detachCargoForEmbarkedAssault(deps.session.getState(), attackerId);
      if (!detached.ok) return 'resolved';
      deps.session.setStateWithoutRefresh(detached.state);
    }
    const begun = beginPlayerCityAssaultChoice(
      deps.session.getState(),
      attackerId,
      cityId,
      deps.bus,
      precedingCombat,
      attackerMultiplier,
    );
    deps.session.setStateWithoutRefresh(begun.state);

    if (!begun.ok) {
      deps.showNotification(
        begun.reason === 'repelled-by-city-defense'
          ? "Your attack was repelled by the city's defenses!"
          : 'The attack could not proceed.',
        'warning',
      );
      deps.renderLoop.setGameState(deps.session.getState());
      deps.hud.update();
      return 'resolved';
    }

    deps.selection.setPendingIntent({ kind: 'city-capture', choice: begun.pending });
    if (!shouldPromptForPlayerCityCapture(city)) {
      deps.turnFlow.finalizePendingCityCaptureChoice('raze', attackerBonus);
      return 'resolved';
    }

    createCityCapturePanel(deps.uiLayer, {
      cityName: city.name,
      occupiedPopulation: begun.pending.occupiedPopulation,
      razeGold: begun.pending.razeGold,
      onOccupy: () => deps.turnFlow.finalizePendingCityCaptureChoice('occupy', attackerBonus),
      onRaze: () => deps.turnFlow.finalizePendingCityCaptureChoice('raze', attackerBonus),
    });
    return 'pending';
  }

  /**
   * Destroys an undefended barbarian camp the attacker is directly adjacent to (#845).
   * Unlike `beginPlayerCityAssault`, a camp has no capture/raze choice -- `destroyCamp`
   * always produces the same flat-gold outcome, so this consumes the unit's action and
   * calls `applyCampDestructionAtTarget` in one step, mirroring the exact notification/
   * quest-transition/advisor/diplomatic-reaction sequence `executeAttack` already runs
   * when a camp's last defender dies (see below) -- this is just that same sequence
   * reached without a defending unit to fight first.
   */
  function beginPlayerCampAssault(attackerId: string, campId: string): void {
    const state = deps.session.getState();
    const attacker = state.units[attackerId];
    const camp = state.barbarianCamps[campId];
    if (!attacker || !camp) return;

    const blockingEntity = getBlockingMapEntityAt(state, attacker, camp.position);
    const distance = state.map.wrapsHorizontally
      ? wrappedHexDistance(attacker.position, camp.position, state.map.width)
      : hexDistance(attacker.position, camp.position);
    // Defense-in-depth (matching executeAttack's own hasActed re-check comment): a garrisoned
    // camp must go through ordinary combat against its defender instead, not this direct
    // one-step destroy path. The normal tap-intent flow already routes a garrisoned camp to
    // combat-preview before it ever reaches resolveSelectedUnitTapIntent's camp check, but this
    // execution-layer check must not trust that UI precedence alone.
    const occupancy = buildUnitOccupancy(state.units);
    const hasDefender = hasHostileUnitAtCoord(occupancy, camp.position, attacker.owner);
    if (
      attacker.hasActed
      || blockingEntity?.reason !== 'barbarian-camp'
      || blockingEntity.entityId !== campId
      || distance !== 1
      || hasDefender
    ) {
      deps.showNotification('That camp is no longer within reach.', 'warning');
      return;
    }

    const banditLordName = camp.banditLordName;
    deps.session.setStateWithoutRefresh({
      ...state,
      units: {
        ...state.units,
        [attackerId]: { ...attacker, hasActed: true, hasMoved: true, movementPointsLeft: 0 },
      },
    });

    const destroyedCamp = applyCampDestructionAtTarget(
      deps.session.getState(),
      deps.session.getState().currentPlayer,
      camp.position,
      deps.session.getState().turn,
    );
    if (destroyedCamp.campId) {
      deps.session.setStateWithoutRefresh(destroyedCamp.state);
      emitMinorCivQuestTransitions(deps.bus, destroyedCamp.questTransitions, deps.session.getState());
      const label = banditLordName ? `${banditLordName}'s camp` : 'Barbarian camp';
      deps.showNotification(`${label} destroyed! +${destroyedCamp.reward} gold`, 'success');
      deps.advisorSystem.resetMessage('treasurer_camp_reward');
      deps.advisorSystem.check(deps.session.getState());
      for (const mcId of Object.keys(deps.session.getState().minorCivs)) {
        applyDiplomaticReaction(deps.session.getState(), 'camp_destroyed_nearby', deps.session.getState().currentPlayer, mcId);
      }
    }

    SFX.combat();
    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
  }

  function executeAttack(attackerId: string, targetKey: string): void {
    const initialAttacker = deps.session.getState().units[attackerId];
    const targetCoord = parseHexKey(targetKey);
    const amphibiousAssault = Boolean(initialAttacker?.transportId);
    const legality = amphibiousAssault
      ? getEmbarkedAssaultTarget(deps.session.getState(), attackerId, targetCoord, { viewerId: deps.session.getState().currentPlayer })
      : canUnitAttackTarget(deps.session.getState(), initialAttacker, targetCoord, { viewerId: deps.session.getState().currentPlayer });
    // hasActed guard: enforce "no action remaining" at the execution layer, not just
    // the highlight layer (getAttackTargets). Prevents double-action if executeAttack
    // is ever called outside the normal tap → highlight → confirm flow.
    if (!initialAttacker || initialAttacker.hasActed || !legality.ok) {
      deps.showNotification('That target is no longer attackable.', 'warning');
      const currentlySelected = deps.selection.getSelectedUnitId();
      if (currentlySelected) deps.selectionController.selectUnit(currentlySelected);
      return;
    }

    if (!amphibiousAssault && legality.targetType === 'city') {
      const city = deps.session.getState().cities[legality.cityId];
      if (!city) return;
      ensurePlayerWarState(city.owner);
      const bombardment = resolveNavalCityBombardment(deps.session.getState(), {
        attackerUnitId: initialAttacker.id,
        cityId: city.id,
        source: 'player',
      });
      if (!bombardment.ok) {
        deps.showNotification('That city cannot be bombarded by this unit.', 'warning');
        return;
      }
      deps.session.setStateWithoutRefresh(bombardment.state);
      if (bombardment.cityEvent) deps.bus.emit('city:naval-bombarded', bombardment.cityEvent);
      if (bombardment.batteryEvent) deps.bus.emit('city:coastal-battery-fired', bombardment.batteryEvent);
      deps.renderLoop.setGameState(deps.session.getState());
      deps.hud.update();
      deps.selectionController.refreshSelectedUnitAfterCombat();
      deps.selectionController.selectNextUnit();
      return;
    }

    if (legality.targetType !== 'unit') {
      deps.showNotification('That target is no longer attackable.', 'warning');
      return;
    }

    const defenderId = legality.targetUnitId;
    const defender = deps.session.getState().units[defenderId];
    if (!defender) return;

    let attacker = initialAttacker;
    if (amphibiousAssault) {
      const detached = detachCargoForEmbarkedAssault(deps.session.getState(), attackerId);
      if (!detached.ok) {
        deps.showNotification('That coastal assault is no longer possible.', 'warning');
        return;
      }
      deps.session.setStateWithoutRefresh(detached.state);
      attacker = detached.attacker;
    }

    ensurePlayerWarState(defender.owner);

    const seed = deterministicCombatSeed(deps.session.getState().gameId, deps.session.getState().turn, attacker.id, defender.id);
    const attackerBonus = getCurrentCivDef(deps.session)?.bonusEffect;
    // Capture defender position before combat (defender may be removed from state after)
    const defenderPosition = { ...defender.position };
    // Capture route IDs before combat (units may be removed from state after)
    const attackerRouteId = attacker.committedToRouteId;
    const defenderRouteId = defender.committedToRouteId;
    const result = resolveCombat(
      attacker,
      deps.session.getState().units[defenderId] ?? defender,
      deps.session.getState().map,
      seed,
      buildCombatContextForDefender(deps.session.getState(), attacker, defender, { amphibiousAssault }),
      resolveCombatEra(deps.session.getState(), attacker, defender),
      deps.session.getState(),
    );
    deps.bus.emit('combat:resolved', {
      result,
      ...buildCombatPresentation(deps.session.getState(), result, attacker, defender),
    });

    const applied = applyCombatOutcomeToState(deps.session.getState(), result, seed);
    deps.session.setStateWithoutRefresh(applied.state);
    deps.session.setStateWithoutRefresh(recordCombatForCiv(deps.session.getState(), deps.session.getState().currentPlayer, defenderPosition));
    emitMinorCivQuestTransitions(deps.bus, applied.questTransitions, deps.session.getState());
    // Clean up trade routes for any committed caravans that died or were captured
    if (applied.attackerDefeated && attackerRouteId) {
      deps.session.setStateWithoutRefresh(removeRouteForUnit(deps.session.getState(), result.attackerId, deps.bus, 'unit-died', attackerRouteId));
    } else if (applied.attackerCaptured && attackerRouteId) {
      deps.session.setStateWithoutRefresh(removeRouteForUnit(deps.session.getState(), result.attackerId, deps.bus, 'unit-captured', attackerRouteId));
    }
    if (applied.defenderDefeated && defenderRouteId) {
      deps.session.setStateWithoutRefresh(removeRouteForUnit(deps.session.getState(), result.defenderId, deps.bus, 'unit-died', defenderRouteId));
    } else if (applied.defenderCaptured && defenderRouteId) {
      deps.session.setStateWithoutRefresh(removeRouteForUnit(deps.session.getState(), result.defenderId, deps.bus, 'unit-captured', defenderRouteId));
    }

    if (applied.attackerDefeated) {
      deps.showNotification('Our unit was destroyed!', 'warning');
    } else if (applied.attackerCaptured) {
      deps.showNotification(`Our ${getCaptureNotificationLabel(attacker.type)}`, 'warning');
    }

    for (const reward of applied.rewards) {
      deps.bus.emit('combat:reward-earned', { reward });
    }

    if (applied.defenderDefeated) {
      deps.showNotification('Enemy unit destroyed!', 'success');

      const slayResult = recordBeastSlain(deps.session.getState(), defender, attacker);
      deps.session.setStateWithoutRefresh(slayResult.state);
      if (slayResult.slain) {
        deps.bus.emit('beast:slain', slayResult.slain);
      }
      // Tier 3+ beasts use the slay ceremony (beast:slain listener); ceremony calls
      // maybeShowPendingHoardChoice via onContinue so the choice panel appears after
      // the ceremony is dismissed rather than racing with it.
      if (!slayResult.slain || BEAST_DEFINITIONS[slayResult.slain.beastId].tier < 3) {
        deps.maybeShowPendingHoardChoice();
      }

      const destroyedCamp = applyCampDestructionAtTarget(deps.session.getState(), deps.session.getState().currentPlayer, defender.position, deps.session.getState().turn);
      if (destroyedCamp.campId) {
        deps.session.setStateWithoutRefresh(destroyedCamp.state);
        emitMinorCivQuestTransitions(deps.bus, destroyedCamp.questTransitions, deps.session.getState());
        deps.showNotification(`Barbarian camp destroyed! +${destroyedCamp.reward} gold`, 'success');
        deps.advisorSystem.resetMessage('treasurer_camp_reward');
        deps.advisorSystem.check(deps.session.getState());
        for (const mcId of Object.keys(deps.session.getState().minorCivs)) {
          applyDiplomaticReaction(deps.session.getState(), 'camp_destroyed_nearby', deps.session.getState().currentPlayer, mcId);
        }
      }

      const cityAtTarget = Object.values(deps.session.getState().cities).find(c => hexKey(c.position) === targetKey);
      if (cityAtTarget) {
        const occupancy = buildUnitOccupancy(deps.session.getState().units);
        const remainingHostileDefenders = hasHostileUnitAtCoord(occupancy, cityAtTarget.position, deps.session.getState().currentPlayer);
        if (!remainingHostileDefenders) {
          if (cityAtTarget.owner.startsWith('mc-')) {
            const conqueredCityName = cityAtTarget.name;
            const conquered = conquestMinorCiv(deps.session.getState(), cityAtTarget.owner, deps.session.getState().currentPlayer);
            deps.session.setStateWithoutRefresh(conquered.state);
            emitMinorCivQuestTransitions(deps.bus, conquered.transitions, deps.session.getState());
            if (conquered.conquered) {
              deps.bus.emit('minor-civ:destroyed', { minorCivId: cityAtTarget.owner, conquerorId: deps.session.getState().currentPlayer });
            }
            deps.showNotification(`${conqueredCityName} has been conquered!`, 'success');
          }
          if (!cityAtTarget.owner.startsWith('mc-') && cityAtTarget.owner !== deps.session.getState().currentPlayer) {
            const assaultStatus = beginPlayerCityAssault(
              attackerId,
              cityAtTarget.id,
              attackerBonus,
              result,
              amphibiousAssault,
            );
            SFX.combat();
            deps.renderLoop.setGameState(deps.session.getState());
            deps.hud.update();
            deps.selectionController.refreshSelectedUnitAfterCombat();
            if (assaultStatus === 'resolved') {
              setTimeout(() => deps.selectionController.selectNextUnit(), 400);
            }
            return;
          }
        }
      }
    } else if (applied.defenderCaptured) {
      deps.showNotification(getCaptureNotificationLabel(defender.type), 'success');
    }

    // `attacker` was captured before applyCombatOutcomeToState — safe even if attacker was destroyed
    SFX.combat();
    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
    deps.selectionController.refreshSelectedUnitAfterCombat();
    deps.renderLoop.animations.add('combat-flash', 400, { coord: attacker.position }, () => deps.selectionController.selectNextUnit());
  }

  return {
    getUnitTurnFlow,
    performWorkerAction,
    performPreach,
    ensurePlayerWarState,
    restAction,
    showEspionageCaptureChoice,
    executeAttack,
    foundCityAction,
    executeUpgrade,
    beginPlayerCityAssault,
    beginPlayerCampAssault,
    executeMinorCivConquest,
  };
}
