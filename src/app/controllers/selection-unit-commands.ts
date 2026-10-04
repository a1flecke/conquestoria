/**
 * Unit-command callbacks (#1243), split out of `selection-controller.ts`.
 *
 * This is the `renderSelectedUnitInfo` callback set `selectUnit` wires: the
 * unit's own actions (air missions, transport load/unload, espionage
 * disguise/infiltration/embed, outpost establishment, worker actions,
 * pillage, fortify, upgrade, rally/seize, strategic launch) plus the panel's
 * cross-links (stack picker, pirate assault, network intent, hall of fame).
 *
 * The callbacks are extracted verbatim — this is a behaviour-preserving move.
 * They reach selection through the `SelectionCore` handle, so this module never
 * imports the selection core.
 */
import type { Unit, UnitType } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { hexKey, mapHexesInRange } from '@/systems/hex-utils';
import { isMajorCivOwner } from '@/core/owner-kind';
import { SFX } from '@/audio/sfx';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import { renderSelectedUnitInfo } from '@/ui/selected-unit-info';
import { createWorkerReplacementConfirmPanel } from '@/ui/worker-task-warning-panel';
import { handleFriendlyUnitStackTap } from '@/input/unit-stack-selection';
import { AIR_MISSION_FAILURE_MESSAGES, startIntercept, getInterceptCoverage, getLegalRebaseDestinations, getAirBaseRoster, getAirBaseCapacity, rebaseAircraft, getLegalAirMissionTargets } from '@/systems/air-operations-system';
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
import { getRallyPreview, issueRally, getSeizeTheMomentEligibleUnits, issueSeizeTheMoment } from '@/systems/great-general-abilities';
import { createRallyPanel, createSeizeThePanelMoment } from '@/ui/general-command-panel';
import { createStrategicLaunchFlow } from '@/ui/strategic-launch-flow';
import { executeStrategicLaunch } from '@/systems/strategic-launch-execution-system';
import { resolveGeneralDefinition } from '@/systems/great-general-definitions';
import { getEffectiveCommandStats } from '@/systems/great-general-system';
import { removeUnits } from '@/systems/unit-removal-system';
import type { GameState } from '@/core/types';
import type { SelectionCommonDeps, SelectionCore } from './selection-shared';

export interface RenderSelectedUnitInfoArgs {
  panel: HTMLElement;
  unitId: string;
  pendingUnloadUnitName?: string;
  highlightResult: ReturnType<typeof buildSelectedUnitHighlights>;
  pendingIntent: ReturnType<SelectionCommonDeps['selection']['getPendingIntent']>;
}

/** Renders the info panel for `unit`, wiring the unit-command callbacks. */
export function renderUnitInfoWithCommands(
  deps: SelectionCommonDeps,
  core: SelectionCore,
  args: RenderSelectedUnitInfoArgs,
): void {
  const { session, selection, renderLoop } = deps;
  const { panel, unitId, pendingUnloadUnitName, highlightResult, pendingIntent } = args;

  renderSelectedUnitInfo(panel, session.getState(), unitId, {
    onClose: () => core.deselectUnit(),
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
          core.selectUnit(generalUnitId); // refresh the panel so charges/cooldown reflect immediately
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
          core.selectUnit(generalUnitId);
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
        deps.showNotification(AIR_MISSION_FAILURE_MESSAGES[result.reason], 'warning');
        return;
      }
      session.commit(result.state);
      SFX.airScramble();
      core.selectUnit(uid);
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
        deps.showNotification(AIR_MISSION_FAILURE_MESSAGES[result.reason], 'warning');
        return;
      }
      session.commit(result.state);
      SFX.airRebase();
      core.selectUnit(uid);
    },
    onStartAirMission: (uid, mission) => {
      selection.setPendingIntent({ kind: 'air-mission', unitId: uid, mission });
      const targets = getLegalAirMissionTargets(session.getState(), uid, mission);
      selection.setRanges([], []);
      core.selectUnit(uid);
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
      core.selectUnit(uid);
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
      core.selectUnit(uid);
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
      core.selectUnit(uid);
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
      core.selectUnit(uid);
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
      core.selectUnit(uid);
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
      core.selectUnit(uid);
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
        session.commit(unfortifyUnitInState(session.getState(), session.getState().currentPlayer, uid));
        deps.showNotification('Unit unfortified.', 'info');
      } else {
        session.commit(fortifyUnitInState(session.getState(), session.getState().currentPlayer, uid));
        deps.showNotification('Unit fortified. +25% defense until unfortified or moved.', 'info');
      }
      core.selectUnit(uid);
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
      session.commit(result.state);
      deps.showNotification(
        result.goldAwarded! > 0 ? `Pillaged ${targetLabel} for ${result.goldAwarded} gold.` : `Pillaged ${targetLabel}.`,
        'success',
      );
      core.selectUnit(uid);
    },
    onStartAutoExplore: uid => core.startAutoExplore(uid),
    onCancelAutoExplore: () => core.cancelAutoExplore(unitId),
    onCancelJourney: () => core.cancelJourney(unitId),
    onOpenStack: (coord) => {
      handleFriendlyUnitStackTap(session.getState(), coord, selection.getSelectedUnitId(), {
        onSelectUnit: core.selectUnit,
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
      core.selectUnit(transportId, { pendingUnloadUnitName: unitName });
    },
    onCancelUnload: () => {
      deps.clearUnloadState();
      renderLoop.clearHighlights();
      const currentlySelected = selection.getSelectedUnitId();
      if (currentlySelected) core.selectUnit(currentlySelected);
    },
    pendingUnloadUnitName,
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
      core.selectUnit(transportId);
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
      core.selectUnit(transportId);
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
      core.selectUnit(uid);
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
      // The spy leaves the map by design (stationed or caught): its espionage record stays, so the unit is
      // 'consumed', not destroyed. Removal itself is the canonical transition (#1198).
      let spyLeavesMap = false;

      if (result.removeUnitFromMap) {
        // Era 2+: spy removed from map, stationed inside city
        spyLeavesMap = true;
        runSideEffects = () => {
          deps.showNotification(`Spy successfully infiltrated ${targetCity.name}. Open Intel panel to issue orders.`, 'success');
          deps.bus.emit('espionage:spy-infiltrated', { civId: currentPlayer, spyId: uid, cityId: targetCity.id });
          core.deselectUnit();
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
          core.selectUnit(uid);
        };
      } else if (result.caught) {
        // Caught: remove unit from map (spy lost)
        spyLeavesMap = true;
        runSideEffects = () => {
          deps.bus.emit('espionage:spy-caught-infiltrating', { capturingCivId: targetCity.owner, spyOwner: currentPlayer, spyId: uid, cityId: targetCity.id });
          core.deselectUnit();
        };
      } else {
        const cooldown = result.civEsp.spies[uid]?.cooldownTurns ?? 3;
        nextUnits = { ...nextUnits, [uid]: { ...unit, hasActed: true, movementPointsLeft: 0 } };
        runSideEffects = () => {
          deps.showNotification(`Spy failed to infiltrate ${targetCity.name}. Lying low for ${cooldown} turns.`, 'info');
          core.selectUnit(uid);
        };
      }

      const afterAttempt: GameState = {
        ...session.getState(),
        espionage: { ...session.getState().espionage, [currentPlayer]: civEspWithTarget },
        units: nextUnits,
        civilizations: nextCivilizations,
      };
      session.commit(spyLeavesMap ? removeUnits(afterAttempt, [uid], { reason: 'consumed' }).state : afterAttempt);

      runSideEffects();
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
      // An embedded spy goes off-map but its record IS the spy now: 'consumed' keeps it.
      session.commit(removeUnits({
        ...session.getState(),
        espionage: { ...session.getState().espionage, [currentPlayer]: embedSpy(civEsp, uid, city.id, city.position) },
      }, [uid], { reason: 'consumed' }).state);
      core.deselectUnit();
      deps.showNotification(`Spy embedded in ${city.name}. Counter-intelligence boosted.`, 'info');
    },
    onUpgradeUnit: (uid) => {
      const unit = session.getState().units[uid];
      if (!unit || unit.owner !== session.getState().currentPlayer) return;
      const targetType = TRAINABLE_UNITS.find(entry => entry.type === unit.type)?.upgradesTo;
      if (!targetType) return;
      const upgrade = evaluateUnitUpgrade(session.getState(), uid, targetType);
      if (!upgrade.canUpgrade || !upgrade.targetType) return;
      if (deps.executeUpgrade(uid, upgrade.targetType)) {
        core.selectUnit(uid);
        deps.showNotification(`Upgraded to ${UNIT_DEFINITIONS[upgrade.targetType].name}!`, 'success');
      }
    },
    onEstablishOutpost: (unitId) => {
      if (!canEstablishOutpost(session.getState(), unitId)) return;
      session.commit(performEstablishOutpost(session.getState(), unitId));
      autoSave(session.getState()).catch(() => {});
      selection.setSelectedUnitId(null);
      renderLoop.setSelectedUnitId(null);
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
      createWorkerReplacementConfirmPanel(deps.uiLayer, {
        existingName,
        newName,
        existingYield,
        newYield,
        onCancel: () => core.selectUnit(uid),
        onConfirm: () => {
          const result = applyWorkerAction(session.getState(), uid, action, { allowReplacement: true });
          if (!result.ok) return;
          session.commit(result.state);
          for (const event of result.events) {
            if (event.type === 'improvement:started') {
              deps.bus.emit('improvement:started', event.payload);
            } else if (event.type === 'road:started') {
              deps.bus.emit('road:started', event.payload);
            } else {
              deps.bus.emit('unit:destroyed', event.payload);
            }
          }
          if (result.workerConsumed || result.workerLost || !session.getState().units[uid]) {
            core.deselectUnit();
          } else {
            core.selectUnit(uid);
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
