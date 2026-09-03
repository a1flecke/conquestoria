/**
 * Owns unit selection: `selectUnit`, `deselectUnit`, `selectNextUnit`, and the
 * animated-move / auto-explore / journey lifecycle around a selected unit
 * (#787 phase 8c).
 *
 * `selectUnit` wires ~30 mutually-recursive callbacks into
 * `renderSelectedUnitInfo` (several call `selectUnit` itself) — per the plan's
 * split note for this phase, those callbacks move here verbatim and are not
 * further decomposed; that would be its own future MR if warranted.
 *
 * Everything this file calls that is a pure `@/systems/*` or `@/ui/*` helper
 * is imported directly, matching the precedent already set by
 * `src/presentation/register-*.ts` (Phase 7) for e.g. `SFX`. Only the
 * concrete platform services (`renderLoop`, `bus`, `host`, `ceremonies`) and
 * the main.ts-local functions this phase does NOT move (`showNotification`,
 * `updateHUD`, `foundCityAction`, etc.) are threaded through as deps.
 *
 * `getInfoPanel` exists so this file never calls `document.getElementById`
 * itself — Phase 11's port-purity test bans that in `src/app/controllers/*`,
 * and threading a getter through now is a zero-behavior-change substitution
 * for the three `document.getElementById('info-panel')` call sites main.ts
 * used to have inline, so there is nothing to revisit when Phase 11 lands.
 */
import type { EventBus } from '@/core/event-bus';
import type { RenderLoop } from '@/renderer/render-loop';
import type { GameState, HexCoord, Unit, UnitType, WorkerActionType, Civilization } from '@/core/types';
import type { GameSession, SelectionStore } from '@/app/ports';
import type { PanelHost } from '@/app/panel-host';
import type { AdvisorSystem } from '@/ui/advisor-system';
import type { CeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import type { UnitTurnFlow } from '@/ui/unit-turn-flow';
import type { ExecuteUnitMoveResult } from '@/systems/unit-movement-system';
import { UNIT_DEFINITIONS, findPath } from '@/systems/unit-system';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { hexKey, mapHexesInRange } from '@/systems/hex-utils';
import { isMajorCivOwner } from '@/core/owner-kind';
import { SFX } from '@/audio/sfx';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import { renderSelectedUnitInfo } from '@/ui/selected-unit-info';
import { createContextMenu } from '@/ui/context-menu';
import { createWorkerReplacementConfirmPanel } from '@/ui/worker-task-warning-panel';
import { handleFriendlyUnitStackTap } from '@/input/unit-stack-selection';
import { startIntercept, getInterceptCoverage, getLegalRebaseDestinations, getAirBaseRoster, getAirBaseCapacity, rebaseAircraft, getLegalAirMissionTargets } from '@/systems/air-operations-system';
import { getParadropTargets, getAirAssaultTargets, getAirAssaultLaunchState, AIR_ASSAULT_FAILURE_MESSAGES } from '@/systems/airborne-system';
import { getKnownHostileAirDefenseThreat } from '@/systems/air-defense-system';
import { usePropagandistAction } from '@/systems/propagandist-system';
import { fortifyUnitInState, unfortifyUnitInState } from '@/systems/unit-lifecycle-system';
import { canPillageTile, getPillageGoldReward, applyPillageToState } from '@/systems/pillage-system';
import { getImprovementDisplayName } from '@/systems/improvement-system';
import { getUnitCargoSize, getTransportCargoUsed, getTransportCapacity, canLoadUnitOntoTransport, getTransportCargo, getUnloadDestinations, loadUnitOntoTransport, unloadUnitFromTransport } from '@/systems/transport-system';
import { findAvailablePirateHeadquartersAssault } from '@/input/pirate-headquarters-assault';
import { getPirateWatersPresentation } from '@/systems/pirate-presentation';
import { setDisguise, attemptInfiltration, getInfiltrationSuccessChance, resolveMissionResult, embedSpy } from '@/systems/espionage-system';
import { evaluateUnitUpgrade } from '@/systems/unit-upgrade-system';
import { canEstablishOutpost, performEstablishOutpost } from '@/systems/resource-acquisition-system';
import { autoSave } from '@/storage/save-manager';
import { applyWorkerAction } from '@/systems/worker-action-system';
import { formatImprovementYieldLabel } from '@/systems/improvement-system';
import { applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { getUnmovedUnits } from '@/systems/unit-system';
import { updateAndRefreshVisibility } from '@/systems/last-seen-presentation';
import { fireResourceDiscoveredTip } from '@/ui/advisor-system';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { getRallyPreview, issueRally, getSeizeTheMomentEligibleUnits, issueSeizeTheMoment } from '@/systems/great-general-abilities';
import { createRallyPanel, createSeizeThePanelMoment } from '@/ui/general-command-panel';
import { createStrategicLaunchFlow } from '@/ui/strategic-launch-flow';
import { executeStrategicLaunch } from '@/systems/strategic-launch-execution-system';
import { resolveGeneralDefinition } from '@/systems/great-general-definitions';
import { getEffectiveCommandStats } from '@/systems/great-general-system';

/** The narrow slice of `RenderLoop` this controller needs. */
export type SelectionControllerRenderer = Pick<
  RenderLoop,
  | 'hasMovingUnit'
  | 'setSelectedUnitId'
  | 'setHighlights'
  | 'clearHighlights'
  | 'setJourneyPath'
  | 'setGameState'
  | 'animateUnitMove'
  | 'animateUnitSlide'
  | 'animateUnitAppear'
  | 'setStrategicLaunchPreview'
> & {
  readonly camera: Pick<RenderLoop['camera'], 'centerOn'>;
};

export interface SelectionControllerDeps {
  readonly session: GameSession;
  readonly selection: SelectionStore;
  readonly renderLoop: SelectionControllerRenderer;
  /**
   * The concrete class, not a narrowed `Pick<EventBus, 'emit'>` -- two
   * downstream calls (`applyAutoExploreOrder`, `fireResourceDiscoveredTip`)
   * are typed to require the real `EventBus`, and `EventBus` has a private
   * field, so no object literal can structurally satisfy it. Narrowing here
   * would only move the impedance mismatch into an `as EventBus` cast at
   * each call site instead of removing it.
   */
  readonly bus: EventBus;
  readonly uiLayer: HTMLElement;
  readonly host: PanelHost;
  readonly ceremonies: CeremonyCoordinator;
  /** Substitutes for `document.getElementById('info-panel')` — see file docblock. */
  readonly getInfoPanel: () => HTMLElement | null;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  readonly updateHUD: () => void;
  readonly clearUnloadState: () => void;
  readonly getUnitTurnFlow: () => UnitTurnFlow;
  readonly foundCityAction: () => void;
  readonly performWorkerAction: (action: WorkerActionType) => void;
  readonly performPreach: (unitId: string, cityId: string) => void;
  readonly restAction: () => void;
  readonly openNetworkIntentPanel: (unitId: string) => void;
  readonly openUnitStackPicker: (coord: HexCoord, unitIds: string[]) => void;
  readonly openPirateHeadquartersAssault: (factionId: string, unitId: string) => void;
  /** #887 Phase B: opens the Great General Hall of Fame (via panelActions).
   * Optional so existing deps fixtures compile unchanged; the composition root
   * always provides it, and selected-unit-info only renders the link when set. */
  readonly openHallOfFame?: () => void;
  readonly handleEstablishRoute: (caravanId: string) => void;
  readonly executeUpgrade: (unitId: string, targetType: UnitType) => boolean;
  readonly ensurePlayerWarState: (targetCivId: string) => void;
  readonly scanBeastSightings: () => void;
  readonly scanSubmarineSightings: () => void;
  readonly currentCiv: () => Civilization;
  /**
   * #544 MR2: `resetMessage`/`check` together are this codebase's existing
   * "show this advisor tip again on demand" idiom (already used by
   * `village:visited` outcomes via `ctx.resetAdvisorMessage`) -- reused here
   * rather than adding a bespoke reopen method.
   */
  readonly advisorSystem: Pick<AdvisorSystem, 'resetMessage' | 'check'>;
}

export interface SelectionController {
  selectUnit(unitId: string, opts?: { pendingUnloadUnitName?: string; suppressSelectionSfx?: boolean }): void;
  deselectUnit(): void;
  isUnitAnimationLocked(unitId: string | null): boolean;
  animateMovedUnit(unitId: string, path: HexCoord[]): void;
  executeAnimatedUnitMove(unitId: string, move: () => ExecuteUnitMoveResult): ExecuteUnitMoveResult;
  startAutoExplore(unitId: string): void;
  cancelAutoExplore(unitId: string): void;
  cancelJourney(unitId: string): void;
  openUnitContextMenu(unitId: string): void;
  selectNextUnit(): void;
  refreshSelectedUnitAfterCombat(): void;
  refreshCurrentPlayerVisibility(): void;
}

export function createSelectionController(deps: SelectionControllerDeps): SelectionController {
  const { session, selection, renderLoop, bus, uiLayer, host, ceremonies } = deps;

  function selectUnit(
    unitId: string,
    opts?: {
      pendingUnloadUnitName?: string;
      suppressSelectionSfx?: boolean;
    },
  ): void {
    if (renderLoop.hasMovingUnit(unitId)) {
      deps.showNotification('Unit is moving.', 'info');
      return;
    }
    const unit = session.getState().units[unitId];
    if (!unit || unit.owner !== session.getState().currentPlayer) return;
    selection.setSelectedUnitId(unitId);
    renderLoop.setSelectedUnitId(unitId);

    const highlightResult = buildSelectedUnitHighlights(session.getState(), unitId);
    selection.setWaterRecovery(highlightResult.waterRecovery);
    if (session.getState().units[unitId]?.committedToRouteId) {
      // Committed caravans cannot move or attack — keep highlights empty
      selection.setRanges([], []);
      deps.clearUnloadState();
    } else {
      selection.setRanges(highlightResult.movementRange, highlightResult.attackTargets.map(target => target.coord));
    }
    renderLoop.setHighlights(highlightResult.highlights);

    // Update journey path overlay
    if (unit.automation?.mode === 'journey') {
      const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
      const completedTechs = session.getState().civilizations[unit.owner]?.techState.completed ?? [];
      const path = findPath(unit.position, unit.automation.destination, session.getState().map, domain, { unit, completedTechs });
      renderLoop.setJourneyPath(path);
    } else {
      renderLoop.setJourneyPath(null);
    }

    // Show unit info panel
    const panel = deps.getInfoPanel();
    if (panel) {
      const pendingIntent = selection.getPendingIntent();
      renderSelectedUnitInfo(panel, session.getState(), unitId, {
        onClose: () => deselectUnit(),
        onReopenSupplyTutorial: () => {
          deps.advisorSystem.resetMessage('supply_intro');
          deps.advisorSystem.check(session.getState());
        },
        onReopenGeneralTutorial: () => {
          deps.advisorSystem.resetMessage('general_command_intro');
          deps.advisorSystem.check(session.getState());
        },
        onOpenHallOfFame: deps.openHallOfFame,
        onOpenRally: (generalUnitId: string) => {
          const preview = getRallyPreview(session.getState(), generalUnitId);
          createRallyPanel(
            deps.uiLayer,
            preview,
            () => {
              session.commit(issueRally(session.getState(), generalUnitId));
              selectUnit(generalUnitId); // refresh the panel so charges/cooldown reflect immediately
            },
            () => {},
          );
        },
        onPrepareStrategicLaunch: (subUnitId: string) => {
          const unit = session.getState().units[subUnitId];
          if (!unit) return;
          createStrategicLaunchFlow(deps.uiLayer, session.getState(), unit.owner, {
            onSetPreview: preview => deps.renderLoop.setStrategicLaunchPreview(preview),
            onConfirmLaunch: targetCityId => {
              const targetCivId = session.getState().cities[targetCityId]?.owner;
              const result = executeStrategicLaunch(session.getState(), unit.owner, targetCityId);
              if (result.ok && targetCivId) {
                session.commit(result.state);
                deps.renderLoop.setGameState(session.getState());
                deps.showNotification('Strategic strike launched.', 'warning');
                deps.bus.emit('city:strategic-strike', { cityId: targetCityId, recipientCivId: targetCivId, actorCivId: unit.owner, goldLost: result.goldLost });
              }
            },
            onClose: () => {},
          });
        },
        onOpenSeize: (generalUnitId: string) => {
          const { eligible } = getSeizeTheMomentEligibleUnits(session.getState(), generalUnitId);
          createSeizeThePanelMoment(
            deps.uiLayer,
            generalUnitId,
            eligible,
            (selectedUnitIds) => {
              session.commit(issueSeizeTheMoment(session.getState(), generalUnitId, selectedUnitIds));
              selectUnit(generalUnitId);
            },
            () => {},
          );
        },
        onStartLastStandTargeting: (generalUnitId: string) => {
          const state = session.getState();
          const general = state.units[generalUnitId];
          const definition = general ? resolveGeneralDefinition(state, general.generalDefinitionId) : undefined;
          if (!general || !definition) return;
          const { commandRange } = getEffectiveCommandStats(general, definition);
          const range = mapHexesInRange(state.map, general.position, commandRange);
          selection.setPendingIntent({ kind: 'last-stand-target', unitId: generalUnitId, range });
          deps.showNotification('Choose a hex to hold, within your General\'s command range.', 'info');
        },
        onStartIntercept: uid => {
          const result = startIntercept(session.getState(), uid);
          if (!result.ok) {
            deps.showNotification('That fighter cannot enter intercept stance now.', 'warning');
            return;
          }
          session.commit(result.state);
          SFX.airScramble();
          selectUnit(uid);
          renderLoop.setHighlights(getInterceptCoverage(session.getState(), uid).map(coord => ({ coord, type: 'air-intercept' as const })));
        },
        getAirRebaseDestinations: uid => getLegalRebaseDestinations(session.getState(), uid).map(base => {
          const position = base.kind === 'city' ? session.getState().cities[base.cityId]?.position : session.getState().units[base.unitId]?.position;
          const name = base.kind === 'city'
            ? session.getState().cities[base.cityId]?.name ?? base.cityId
            : UNIT_DEFINITIONS[session.getState().units[base.unitId]?.type ?? 'carrier'].name;
          return { base, label: `${name} (${getAirBaseRoster(session.getState(), base).length}/${getAirBaseCapacity(session.getState(), base)})${position ? '' : ''}` };
        }),
        onRebaseAircraft: (uid, base) => {
          const result = rebaseAircraft(session.getState(), uid, base);
          if (!result.ok) {
            deps.showNotification('That base is no longer reachable.', 'warning');
            return;
          }
          session.commit(result.state);
          SFX.airRebase();
          selectUnit(uid);
        },
        onStartAirMission: (uid, mission) => {
          selection.setPendingIntent({ kind: 'air-mission', unitId: uid, mission });
          const targets = getLegalAirMissionTargets(session.getState(), uid, mission);
          selection.setRanges([], []);
          selectUnit(uid);
          renderLoop.setHighlights(targets.map(coord => ({
            coord,
            type: mission === 'strike' ? 'air-strike' as const : mission === 'recon' ? 'air-recon' as const : 'air-patrol' as const,
          })));
          const noticeText = mission === 'strike'
            ? 'Tap a hostile target within operational range, or cancel.'
            : mission === 'recon'
              ? 'Tap a recon center within operational range, or cancel.'
              : 'Tap a patrol center — reveals ships and hidden submarines in a wide area for the rest of this turn. Uses this aircraft\'s turn, or cancel.';
          deps.showNotification(noticeText, 'info');
        },
        onCancelAirMission: uid => {
          const intent = selection.getPendingIntent();
          if (intent.kind !== 'air-mission' || intent.unitId !== uid) return;
          selection.setPendingIntent({ kind: 'none' });
          selectUnit(uid);
          deps.showNotification('Air mission cancelled.', 'info');
        },
        onStartParadrop: uid => {
          selection.setPendingIntent({ kind: 'paradrop', unitId: uid });
          const state = session.getState();
          const unit = state.units[uid]!;
          const range = UNIT_DEFINITIONS[unit.type].paradrop!.range;
          const targets = getParadropTargets(state, uid);
          const flakByTile = new Map(targets.map(coord => [
            hexKey(coord),
            getKnownHostileAirDefenseThreat(state, unit, coord, unit.owner).flatDefenseModifier,
          ]));
          selection.setRanges([], []);
          selectUnit(uid);
          renderLoop.setHighlights(targets.map(coord => ({
            coord,
            type: (flakByTile.get(hexKey(coord)) ?? 0) > 0 ? 'paradrop-flak-risk' as const : 'paradrop-target' as const,
          })));
          // Spec requires the exact numbers before commit, not just a
          // spatial highlight distinction: state the range and, if any
          // legal tile carries known flak, the worst known figure among
          // them. A per-tile hover tooltip with the exact number for the
          // specific tile under the cursor would need new UI machinery
          // this game doesn't have yet -- the flak-risk highlight color
          // already marks exactly which tiles carry it, so this notice
          // gives the worst-case number as a coarser-grained but still
          // real "know the risk before you commit" guarantee.
          const worstKnownFlak = Math.max(0, ...flakByTile.values());
          const flakWarning = worstKnownFlak > 0
            ? ` Highlighted red tiles have known anti-aircraft coverage — up to -${worstKnownFlak} HP on landing.`
            : '';
          deps.showNotification(
            `Paradrop range: ${range}. Lands with no movement and cannot act again this turn.${flakWarning}`,
            'info',
          );
        },
        onCancelParadrop: uid => {
          const intent = selection.getPendingIntent();
          if (intent.kind !== 'paradrop' || intent.unitId !== uid) return;
          selection.setPendingIntent({ kind: 'none' });
          selectUnit(uid);
          deps.showNotification('Paradrop cancelled.', 'info');
        },
        onStartAirAssault: uid => {
          selection.setPendingIntent({ kind: 'air-assault', unitId: uid });
          const state = session.getState();
          const unit = state.units[uid]!;
          const launchState = getAirAssaultLaunchState(state, uid);
          const targets = getAirAssaultTargets(state, uid);
          const flakByTile = new Map(targets.map(coord => [
            hexKey(coord),
            getKnownHostileAirDefenseThreat(state, unit, coord, unit.owner).flatDefenseModifier,
          ]));
          selection.setRanges([], []);
          selectUnit(uid);
          renderLoop.setHighlights(targets.map(coord => ({
            coord,
            type: (flakByTile.get(hexKey(coord)) ?? 0) > 0 ? 'air-assault-flak-risk' as const : 'air-assault-target' as const,
          })));
          const worstKnownFlak = Math.max(0, ...flakByTile.values());
          const flakWarning = worstKnownFlak > 0
            ? ` Highlighted red tiles have known anti-aircraft coverage — up to -${worstKnownFlak} HP on landing.`
            : '';
          const helicopterName = launchState.ok ? UNIT_DEFINITIONS[state.units[launchState.helicopterId]!.type].name : 'an Attack Helicopter';
          const rangeText = launchState.ok
            ? `Air Assault range: ${UNIT_DEFINITIONS[state.units[launchState.helicopterId]!.type].airOperation!.operationalRange}.`
            : AIR_ASSAULT_FAILURE_MESSAGES[launchState.reason];
          deps.showNotification(
            `${rangeText} This will use ${helicopterName} — it won't be able to attack this turn. Lands with no movement and cannot act again this turn.${flakWarning}`,
            'info',
          );
        },
        onCancelAirAssault: uid => {
          const intent = selection.getPendingIntent();
          if (intent.kind !== 'air-assault' || intent.unitId !== uid) return;
          selection.setPendingIntent({ kind: 'none' });
          selectUnit(uid);
          deps.showNotification('Air Assault cancelled.', 'info');
        },
        onOpenNetworkIntent: uid => deps.openNetworkIntentPanel(uid),
        onUsePropagandistAction: (uid, action, cityId) => {
          const result = usePropagandistAction(session.getState(), uid, action, cityId);
          if (!result.ok) {
            deps.showNotification('That civic action is no longer available.', 'warning');
            return;
          }
          session.commit(result.state);
          deps.showNotification(result.message, action === 'rally' ? 'success' : 'warning');
          selectUnit(uid);
        },
        onFoundCity: () => deps.foundCityAction(),
        onWorkerAction: action => deps.performWorkerAction(action),
        onPreach: (unitId, cityId) => deps.performPreach(unitId, cityId),
        onRest: () => deps.restAction(),
        onSkipTurn: uid => deps.getUnitTurnFlow().skipUnitAction(uid),
        onDeleteUnit: uid => deps.getUnitTurnFlow().showDeleteUnitConfirmation(uid),
        onFortify: uid => {
          const unit = session.getState().units[uid];
          if (!unit || unit.owner !== session.getState().currentPlayer) return;
          if (unit.isFortified) {
            session.setStateWithoutRefresh(unfortifyUnitInState(session.getState(), session.getState().currentPlayer, uid));
            deps.showNotification('Unit unfortified.', 'info');
          } else {
            session.setStateWithoutRefresh(fortifyUnitInState(session.getState(), session.getState().currentPlayer, uid));
            deps.showNotification('Unit fortified. +25% defense until unfortified or moved.', 'info');
          }
          renderLoop.setGameState(session.getState());
          deps.updateHUD();
          selectUnit(uid);
        },
        onPillage: uid => {
          const unit = session.getState().units[uid];
          if (!unit || unit.owner !== session.getState().currentPlayer) return;
          const tile = session.getState().map.tiles[hexKey(unit.position)];
          if (!tile || !canPillageTile(tile, unit.owner)) return;

          const hasFinishedImprovement = tile.improvement !== 'none' && tile.improvementTurnsLeft === 0;
          const goldPreview = hasFinishedImprovement ? getPillageGoldReward(tile.improvement) : 0;
          const targetLabel = hasFinishedImprovement ? getImprovementDisplayName(tile.improvement) : 'the road';
          const preview = goldPreview > 0
            ? `Pillage ${targetLabel}?\n\n+${goldPreview} gold, unit heals +25 HP.`
            : `Pillage ${targetLabel}?\n\nUnit heals +25 HP.`;
          if (!window.confirm(preview)) return;

          if (tile.owner && isMajorCivOwner(tile.owner)) {
            deps.ensurePlayerWarState(tile.owner);
          }

          const result = applyPillageToState(session.getState(), uid);
          if (!result.ok) return;
          session.setStateWithoutRefresh(result.state);
          deps.showNotification(
            result.goldAwarded! > 0 ? `Pillaged ${targetLabel} for ${result.goldAwarded} gold.` : `Pillaged ${targetLabel}.`,
            'success',
          );
          renderLoop.setGameState(session.getState());
          deps.updateHUD();
          selectUnit(uid);
        },
        onStartAutoExplore: uid => startAutoExplore(uid),
        onCancelAutoExplore: () => cancelAutoExplore(unitId),
        onCancelJourney: () => cancelJourney(unitId),
        onOpenStack: (coord) => {
          handleFriendlyUnitStackTap(session.getState(), coord, selection.getSelectedUnitId(), {
            onSelectUnit: selectUnit,
            onOpenStackPicker: deps.openUnitStackPicker,
          });
        },
        getTransportOptions: uid => {
          const selectedUnit = session.getState().units[uid];
          const needs = selectedUnit ? getUnitCargoSize(selectedUnit) : 1;
          return Object.values(session.getState().units)
            .filter(candidate => {
              const def = UNIT_DEFINITIONS[candidate.type];
              return (def?.domain ?? 'land') === 'naval' && def?.cargoCapacity !== undefined
                && candidate.owner === session.getState().currentPlayer;
            })
            .map(candidate => {
              const used  = getTransportCargoUsed(session.getState(), candidate.id);
              const cap   = getTransportCapacity(candidate);
              const free  = cap - used;
              const fits  = needs <= free;
              const suffix = !fits
                ? ` — needs ${needs} slots, ${free} remaining`
                : free - needs === 0
                  ? ' — last slot'
                  : ` — ${free} of ${cap} slots free`;
              return {
                transportId: candidate.id,
                label: `Load onto ${UNIT_DEFINITIONS[candidate.type]?.name ?? 'Transport'}${suffix}`,
                disabled: !fits,
                tooltip: !fits
                  ? `${UNIT_DEFINITIONS[selectedUnit?.type ?? 'warrior']?.name ?? 'This unit'} requires ${needs} cargo slots. A Galleon or larger transport is needed.`
                  : undefined,
              };
            })
            .filter(o => canLoadUnitOntoTransport(session.getState(), uid, o.transportId).ok || o.disabled);
        },
        getCargoBoardInfo: transportId => getTransportCargo(session.getState(), transportId).map(cargoUnit => ({
          cargoUnitId: cargoUnit.id,
          label: UNIT_DEFINITIONS[cargoUnit.type]?.name ?? cargoUnit.type,
          slotCost: getUnitCargoSize(cargoUnit),
          canUnload: !cargoUnit.hasActed && cargoUnit.movementPointsLeft > 0,
        })),
        onSelectCargoToUnload: (transportId, cargoUnitId) => {
          const range = getUnloadDestinations(session.getState(), transportId, cargoUnitId);
          selection.setPendingIntent({ kind: 'unload', transportId, cargoUnitId, range });
          renderLoop.setHighlights(range.map(coord => ({ coord, type: 'move' as const })));
          const cargoUnit = session.getState().units[cargoUnitId];
          const unitName = UNIT_DEFINITIONS[cargoUnit?.type ?? 'warrior']?.name ?? 'Unit';
          selectUnit(transportId, { pendingUnloadUnitName: unitName });
        },
        onCancelUnload: () => {
          deps.clearUnloadState();
          renderLoop.clearHighlights();
          const currentlySelected = selection.getSelectedUnitId();
          if (currentlySelected) selectUnit(currentlySelected);
        },
        pendingUnloadUnitName: opts?.pendingUnloadUnitName,
        getPirateAssaultAction: uid => {
          const pending = findAvailablePirateHeadquartersAssault(session.getState(), session.getState().currentPlayer, uid);
          if (!pending) return null;
          const faction = getPirateWatersPresentation(session.getState(), session.getState().currentPlayer).factions
            .find(entry => entry.factionId === pending.factionId);
          return { factionId: pending.factionId, label: `Assault ${faction?.name ?? 'pirate'} enclave` };
        },
        onOpenPirateAssault: (factionId, uid) => deps.openPirateHeadquartersAssault(factionId, uid),
        onLoadTransport: (uid, transportId) => {
          const prevPos = session.getState().units[uid]?.position;
          const result = loadUnitOntoTransport(session.getState(), uid, transportId);
          if (!result.ok) {
            deps.showNotification(result.message, 'warning');
            SFX.error();
            return;
          }
          session.commit(result.state);
          // Boarding animation: slide cargo unit to transport hex before it disappears
          const transportUnit = session.getState().units[transportId];
          if (prevPos && transportUnit) {
            renderLoop.animateUnitSlide(
              { ...result.state.units[uid] ?? { id: uid } as Unit, position: prevPos },
              transportUnit.position,
            );
          }
          selectUnit(transportId);
          const tName = UNIT_DEFINITIONS[session.getState().units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
          deps.showNotification(`Unit loaded onto ${tName}.`, 'info');
          SFX.transportLoad();
        },
        onUnloadTransport: (transportId, cargoUnitId, destination) => {
          const result = unloadUnitFromTransport(session.getState(), transportId, cargoUnitId, destination);
          if (!result.ok) {
            deps.showNotification(result.message, 'warning');
            SFX.error();
            return;
          }
          const tName = UNIT_DEFINITIONS[session.getState().units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
          const cName = UNIT_DEFINITIONS[session.getState().units[cargoUnitId]?.type ?? 'warrior']?.name ?? 'Unit';
          deps.clearUnloadState();
          session.commit(result.state);
          renderLoop.animateUnitAppear(destination);
          // Stay on the transport so the player can unload remaining cargo
          selectUnit(transportId);
          deps.showNotification(`${cName} disembarked from ${tName}.`, 'info');
          SFX.transportUnload();
        },
        onSetDisguise: (uid, disguise) => {
          const unit = session.getState().units[uid];
          if (!unit || unit.hasActed) return;
          if (unit.owner !== session.getState().currentPlayer) return;
          const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
          if (!civEsp) return;
          const spy = civEsp.spies[uid];
          if (!spy || spy.status !== 'idle') return;
          const currentPlayer = session.getState().currentPlayer;
          session.commit({
            ...session.getState(),
            espionage: { ...session.getState().espionage, [currentPlayer]: setDisguise(civEsp, uid, disguise) },
            units: disguise !== null
              ? { ...session.getState().units, [uid]: { ...unit, hasActed: true, movementPointsLeft: 0 } }
              : session.getState().units,
          });
          renderLoop.setGameState(session.getState());
          deps.updateHUD();
          selectUnit(uid);
          deps.showNotification(disguise ? `Spy disguised as ${disguise}.` : 'Disguise removed.', 'info');
        },
        onInfiltrate: (uid) => {
          const unit = session.getState().units[uid];
          if (!unit || unit.owner !== session.getState().currentPlayer) return;
          const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
          if (!civEsp) return;
          const targetCity = Object.values(session.getState().cities).find(
            c => c.owner !== session.getState().currentPlayer &&
                 c.position.q === unit.position.q && c.position.r === unit.position.r,
          );
          if (!targetCity) { deps.showNotification('No enemy city at this location.', 'info'); return; }

          const alreadyInside = Object.values(civEsp.spies).some(
            s => s.infiltrationCityId === targetCity.id &&
                 (s.status === 'stationed' || s.status === 'on_mission'),
          );
          if (alreadyInside) { deps.showNotification('You already have a spy in that city.', 'info'); return; }

          const cityCI = session.getState().espionage![targetCity.owner]?.counterIntelligence[targetCity.id] ?? 0;
          const chance = getInfiltrationSuccessChance(unit.type as UnitType, civEsp.spies[uid]?.experience ?? 0, cityCI);
          const preview = `Infiltrate ${targetCity.name}?\n\nSuccess chance: ${Math.round(chance * 100)}%\nCity CI: ${cityCI}\n\nIf caught, spy may be lost permanently.`;
          if (!window.confirm(preview)) return;

          const seed = `infiltrate-${uid}-${session.getState().turn}`;
          const result = attemptInfiltration(
            civEsp, uid, unit.type as UnitType, targetCity.id, targetCity.position, cityCI, seed,
          );
          // Record the original target civ so auto-exfiltrate can detect third-party captures
          const spyAfterAttempt = result.civEsp.spies[uid];
          const civEspWithTarget = spyAfterAttempt ? {
            ...result.civEsp,
            spies: { ...result.civEsp.spies, [uid]: { ...spyAfterAttempt, targetCivId: targetCity.owner } },
          } : result.civEsp;

          const currentPlayer = session.getState().currentPlayer;
          let nextUnits = session.getState().units;
          let nextCivilizations = session.getState().civilizations;
          // Deferred until after session.commit() below so that any bus listener reading
          // session.getState() synchronously (e.g. register-espionage-presentation.ts's
          // 'espionage:spy-caught-infiltrating' handler) observes the post-mutation state,
          // not the state as it stood before this action published.
          let runSideEffects: () => void;

          if (result.removeUnitFromMap) {
            // Era 2+: spy removed from map, stationed inside city
            const { [uid]: _removed, ...remainingUnits } = nextUnits;
            nextUnits = remainingUnits;
            const civUnits = nextCivilizations[currentPlayer].units;
            nextCivilizations = civUnits
              ? { ...nextCivilizations, [currentPlayer]: { ...nextCivilizations[currentPlayer], units: civUnits.filter(id => id !== uid) } }
              : nextCivilizations;
            runSideEffects = () => {
              deps.showNotification(`Spy successfully infiltrated ${targetCity.name}. Open Intel panel to issue orders.`, 'success');
              bus.emit('espionage:spy-infiltrated', { civId: currentPlayer, spyId: uid, cityId: targetCity.id });
              deselectUnit();
            };
          } else if (result.era1ScoutResult !== undefined) {
            // Era 1 (spy_scout): spy stays on map, infiltrationCityId + 5-turn city vision already set
            const missionResult = resolveMissionResult('scout_area', targetCity.owner, targetCity.id, session.getState(), currentPlayer, uid);
            const tilesToReveal = missionResult.tilesToReveal ?? [];
            if (tilesToReveal.length > 0) {
              const visibilityTiles = { ...(nextCivilizations[currentPlayer].visibility?.tiles ?? {}) };
              for (const coord of tilesToReveal) {
                visibilityTiles[`${coord.q},${coord.r}`] = 'visible';
              }
              nextCivilizations = {
                ...nextCivilizations,
                [currentPlayer]: { ...nextCivilizations[currentPlayer], visibility: { ...nextCivilizations[currentPlayer].visibility!, tiles: visibilityTiles } },
              };
            }
            nextUnits = { ...nextUnits, [uid]: { ...unit, hasActed: true, movementPointsLeft: 0 } };
            runSideEffects = () => {
              deps.showNotification(`Scout revealed ${tilesToReveal.length} tile${tilesToReveal.length !== 1 ? 's' : ''} around ${targetCity.name}.`, 'success');
              selectUnit(uid);
            };
          } else if (result.caught) {
            // Caught: remove unit from map (spy lost)
            const { [uid]: _removed, ...remainingUnits } = nextUnits;
            nextUnits = remainingUnits;
            const civUnits = nextCivilizations[currentPlayer].units;
            nextCivilizations = civUnits
              ? { ...nextCivilizations, [currentPlayer]: { ...nextCivilizations[currentPlayer], units: civUnits.filter(id => id !== uid) } }
              : nextCivilizations;
            runSideEffects = () => {
              bus.emit('espionage:spy-caught-infiltrating', { capturingCivId: targetCity.owner, spyOwner: currentPlayer, spyId: uid, cityId: targetCity.id });
              deselectUnit();
            };
          } else {
            const cooldown = result.civEsp.spies[uid]?.cooldownTurns ?? 3;
            nextUnits = { ...nextUnits, [uid]: { ...unit, hasActed: true, movementPointsLeft: 0 } };
            runSideEffects = () => {
              deps.showNotification(`Spy failed to infiltrate ${targetCity.name}. Lying low for ${cooldown} turns.`, 'info');
              selectUnit(uid);
            };
          }

          session.commit({
            ...session.getState(),
            espionage: { ...session.getState().espionage, [currentPlayer]: civEspWithTarget },
            units: nextUnits,
            civilizations: nextCivilizations,
          });

          runSideEffects();

          renderLoop.setGameState(session.getState());
          deps.updateHUD();
        },
        onEmbed: (uid) => {
          const unit = session.getState().units[uid];
          if (!unit || unit.owner !== session.getState().currentPlayer) return;
          const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
          if (!civEsp) return;
          const city = Object.values(session.getState().cities).find(
            c => c.owner === session.getState().currentPlayer &&
                 c.position.q === unit.position.q && c.position.r === unit.position.r,
          );
          if (!city) return;
          const currentPlayer = session.getState().currentPlayer;
          const { [uid]: _removed, ...remainingUnits } = session.getState().units;
          session.commit({
            ...session.getState(),
            espionage: { ...session.getState().espionage, [currentPlayer]: embedSpy(civEsp, uid, city.id, city.position) },
            units: remainingUnits,
            civilizations: {
              ...session.getState().civilizations,
              [currentPlayer]: {
                ...session.getState().civilizations[currentPlayer],
                units: session.getState().civilizations[currentPlayer].units.filter(id => id !== uid),
              },
            },
          });
          deselectUnit();
          renderLoop.setGameState(session.getState());
          deps.updateHUD();
          deps.showNotification(`Spy embedded in ${city.name}. Counter-intelligence boosted.`, 'info');
        },
        onUpgradeUnit: (uid, cityId) => {
          const unit = session.getState().units[uid];
          if (!unit || unit.owner !== session.getState().currentPlayer) return;
          const targetType = TRAINABLE_UNITS.find(entry => entry.type === unit.type)?.upgradesTo;
          if (!targetType) return;
          const upgrade = evaluateUnitUpgrade(session.getState(), uid, targetType);
          if (!upgrade.canUpgrade || !upgrade.targetType) return;
          if (deps.executeUpgrade(uid, upgrade.targetType)) {
            selectUnit(uid);
            deps.showNotification(`Upgraded to ${UNIT_DEFINITIONS[upgrade.targetType].name}!`, 'success');
          }
        },
        onEstablishOutpost: (unitId) => {
          if (!canEstablishOutpost(session.getState(), unitId)) return;
          session.setStateWithoutRefresh(performEstablishOutpost(session.getState(), unitId));
          autoSave(session.getState()).catch(() => {});
          selection.setSelectedUnitId(null);
          renderLoop.setSelectedUnitId(null);
          renderLoop.setGameState(session.getState());
          deps.updateHUD();
          deps.showNotification('Expedition planted a flag! Outpost completes in 2 turns.', 'success');
        },
        onEstablishRoute: deps.handleEstablishRoute,
        onReplaceImprovement: (action) => {
          const selectedUnitId = selection.getSelectedUnitId();
          if (!selectedUnitId) return;
          const unit = session.getState().units[selectedUnitId];
          if (!unit) return;
          const tileKey = hexKey(unit.position);
          const currentTile = session.getState().map.tiles[tileKey];
          if (!currentTile || currentTile.improvement === 'none') return;
          const existingName = getImprovementDisplayName(currentTile.improvement);
          const newName = getImprovementDisplayName(action);
          const existingYield = formatImprovementYieldLabel(currentTile.improvement) || undefined;
          const newYield = formatImprovementYieldLabel(action) || undefined;
          const uid = selectedUnitId;
          createWorkerReplacementConfirmPanel(uiLayer, {
            existingName,
            newName,
            existingYield,
            newYield,
            onCancel: () => selectUnit(uid),
            onConfirm: () => {
              const result = applyWorkerAction(session.getState(), uid, action, { allowReplacement: true });
              if (!result.ok) return;
              session.setStateWithoutRefresh(result.state);
              for (const event of result.events) {
                if (event.type === 'improvement:started') {
                  bus.emit('improvement:started', event.payload);
                } else if (event.type === 'road:started') {
                  bus.emit('road:started', event.payload);
                } else {
                  bus.emit('unit:destroyed', event.payload);
                }
              }
              renderLoop.setGameState(session.getState());
              deps.updateHUD();
              if (result.workerConsumed || result.workerLost || !session.getState().units[uid]) {
                deselectUnit();
              } else {
                selectUnit(uid);
              }
              deps.showNotification(result.message, result.workerLost ? 'warning' : 'info');
            },
          });
        },
      }, {
        waterRecovery: highlightResult.waterRecovery,
        hasZoneOfControlWarning: highlightResult.zocLimitedRange.length > 0,
        airMissionPending: pendingIntent.kind === 'air-mission' && pendingIntent.unitId === unitId ? pendingIntent.mission : undefined,
        paradropPending: pendingIntent.kind === 'paradrop' && pendingIntent.unitId === unitId,
        airAssaultPending: pendingIntent.kind === 'air-assault' && pendingIntent.unitId === unitId,
      });
    }

    if (!opts?.suppressSelectionSfx) SFX.select();
  }

  function deselectUnit(): void {
    // Clears the selection, both ranges, and any pending air mission, journey, or
    // unload. A pending city-capture choice deliberately survives — see the
    // `SelectionStore.clear()` contract.
    selection.clear();
    renderLoop.setSelectedUnitId(null);
    renderLoop.clearHighlights();
    renderLoop.setJourneyPath(null);
    const panel = deps.getInfoPanel();
    if (panel) {
      panel.style.display = 'none';
      panel.replaceChildren();
    }
  }

  function isUnitAnimationLocked(unitId: string | null): boolean {
    return Boolean(unitId && renderLoop.hasMovingUnit(unitId));
  }

  function animateMovedUnit(unitId: string, path: HexCoord[]): void {
    const movedUnit = session.getState().units[unitId];
    if (!movedUnit || path.length < 2) return;
    selection.setRanges([], []);
    deps.clearUnloadState();
    renderLoop.clearHighlights();
    renderLoop.animateUnitMove({ ...movedUnit, position: path[0]! }, path, () => {
      renderLoop.setGameState(session.getState());
      deps.updateHUD();
      ceremonies.endAction();
      const unit = session.getState().units[unitId];
      if (!unit || unit.owner !== session.getState().currentPlayer) return;

      if ((unit.movementPointsLeft ?? 0) <= 0) {
        selectNextUnit();
      } else if (selection.getSelectedUnitId() === unitId) {
        selectUnit(unitId);
      }
    });
  }

  function executeAnimatedUnitMove(unitId: string, move: () => ExecuteUnitMoveResult): ExecuteUnitMoveResult {
    const movingUnit = session.getState().units[unitId];
    ceremonies.beginDeferredAction();
    try {
      const moveResult = move();
      if (!moveResult.ok) {
        ceremonies.endAction();
        deps.showNotification(moveResult.message, 'warning');
        SFX.error();
        return moveResult;
      }
      if (moveResult.stopReason === 'zone-of-control') {
        deps.showNotification('Stopped — enemy nearby', 'info');
      }
      // Clear journey automation when the player manually moves a unit.
      if (movingUnit?.automation?.mode === 'journey') {
        const movedUnit = session.getState().units[unitId];
        if (movedUnit) {
          session.setStateWithoutRefresh({
            ...session.getState(),
            units: { ...session.getState().units, [unitId]: { ...movedUnit, automation: undefined } },
          });
        }
        renderLoop.setJourneyPath(null);
      }
      animateMovedUnit(unitId, moveResult.path);
      return moveResult;
    } catch (error) {
      ceremonies.endAction();
      throw error;
    }
  }

  function startAutoExplore(unitId: string): void {
    const unit = session.getState().units[unitId];
    if (!unit || unit.owner !== session.getState().currentPlayer) return;

    const withAutomation = {
      ...unit,
      automation: {
        mode: 'auto-explore' as const,
        startedTurn: session.getState().turn,
        lastTargets: unit.automation?.mode === 'auto-explore' ? unit.automation.lastTargets : [],
      },
    };
    session.commit({ ...session.getState(), units: { ...session.getState().units, [unitId]: withAutomation } });

    if (withAutomation.movementPointsLeft > 0 && !withAutomation.hasActed) {
      applyAutoExploreOrder(session.getState(), unitId, { bus });
    }

    renderLoop.setGameState(session.getState());
    deps.updateHUD();
    selectUnit(unitId);
  }

  function cancelAutoExplore(unitId: string): void {
    const unit = session.getState().units[unitId];
    if (!unit?.automation) return;
    const { automation: _removed, ...withoutAutomation } = unit;
    session.commit({ ...session.getState(), units: { ...session.getState().units, [unitId]: withoutAutomation } });
    renderLoop.setGameState(session.getState());
    deps.updateHUD();
    if (selection.getSelectedUnitId() === unitId) {
      selectUnit(unitId);
    }
  }

  function cancelJourney(unitId: string): void {
    const unit = session.getState().units[unitId];
    if (!unit?.automation) return;
    session.commit({
      ...session.getState(),
      units: { ...session.getState().units, [unitId]: { ...unit, automation: undefined } },
    });
    renderLoop.setJourneyPath(null);
    deps.updateHUD();
    if (selection.getSelectedUnitId() === unitId) {
      selectUnit(unitId);
    }
  }

  function openUnitContextMenu(unitId: string): void {
    const panel = deps.getInfoPanel();
    if (!panel) return;

    createContextMenu(panel, session.getState(), { unitId }, {
      onStartAutoExplore: id => startAutoExplore(id),
      onCancelAutoExplore: id => cancelAutoExplore(id),
    }, host);
  }

  function selectNextUnit(): void {
    const unmoved = getUnmovedUnits(session.getState().units, session.getState().currentPlayer);
    if (unmoved.length === 0) {
      // All units have moved — silently deselect
      deselectUnit();
      return;
    }
    // Skip current unit if it's in the list
    const filtered = unmoved.filter(u => u.id !== selection.getSelectedUnitId());
    const next = filtered.length > 0 ? filtered[0] : unmoved[0];
    selectUnit(next.id);
    renderLoop.camera.centerOn(next.position);
  }

  function refreshSelectedUnitAfterCombat(): void {
    const selectedUnitId = selection.getSelectedUnitId();
    if (!selectedUnitId) return;
    const selectedUnit = session.getState().units[selectedUnitId];
    if (!selectedUnit || selectedUnit.owner !== session.getState().currentPlayer) {
      deselectUnit();
      return;
    }
    selectUnit(selectedUnitId, { suppressSelectionSfx: true });
  }

  function refreshCurrentPlayerVisibility(): void {
    if (!deps.currentCiv()?.visibility) return;

    // Snapshot unexplored tile keys before the update so we can detect fog-lift transitions
    const visTiles = deps.currentCiv()!.visibility!.tiles;
    const prevUnexplored = new Set(
      Object.keys(visTiles).filter(k => visTiles[k] === 'unexplored'),
    );

    updateAndRefreshVisibility(session.getState(), session.getState().currentPlayer);

    // Fire at most one resource-discovered tip per visibility update to avoid
    // flooding the player when a scout reveals several resource tiles at once.
    const updatedTiles = deps.currentCiv()?.visibility?.tiles ?? {};
    for (const key of prevUnexplored) {
      if (updatedTiles[key] !== 'unexplored') {
        const tile = session.getState().map.tiles[key];
        if (tile?.resource) {
          const fired = fireResourceDiscoveredTip(tile.resource, session.getState(), bus);
          if (fired) break; // one tip per move is enough
        }
      }
    }

    for (const contact of syncCivilizationContactsFromVisibility(session.getState(), session.getState().currentPlayer)) {
      bus.emit('civilization:first-contact', contact);
    }

    deps.scanBeastSightings();
    deps.scanSubmarineSightings();
  }

  return {
    selectUnit,
    deselectUnit,
    isUnitAnimationLocked,
    animateMovedUnit,
    executeAnimatedUnitMove,
    startAutoExplore,
    cancelAutoExplore,
    cancelJourney,
    openUnitContextMenu,
    selectNextUnit,
    refreshSelectedUnitAfterCombat,
    refreshCurrentPlayerVisibility,
  };
}
