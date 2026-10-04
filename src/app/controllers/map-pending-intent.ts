/**
 * Pending-intent resolution for a map tap (#1243), split out of
 * `map-interaction-controller.ts`: journey destination, air missions (with the
 * #1213 air-strike forecast / confirm), paradrop, air assault, transport unload
 * and Great General Last Stand. Bodies are moved verbatim; legality stays in the
 * canonical systems (#1223 typed air failures).
 */
import type { HexCoord } from '@/core/types';

import { SFX } from '@/audio/sfx';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { findPath } from '@/systems/unit-pathfinding';
import { AIR_MISSION_FAILURE_MESSAGES, resolveAirStrike, resolveAirStrikeTarget, resolveReconMission, resolvePatrolMission } from '@/systems/air-operations-system';
import { executeParadrop, PARADROP_FAILURE_MESSAGES, executeAirAssault, AIR_ASSAULT_FAILURE_MESSAGES } from '@/systems/airborne-system';
import { unloadUnitFromTransport } from '@/systems/transport-system';
import { renderBattleForecastCard } from '@/ui/battle-forecast-card';
import { airForecastSignature, buildAirStrikeForecastView } from '@/ui/air-strike-forecast-projection';
import { getLastStandPreview, issueLastStand } from '@/systems/great-general-abilities';
import { createLastStandPanel } from '@/ui/general-command-panel';
import { getDeniedTerritoryOwners } from '@/systems/territorial-access';
import type { MapInteractionControllerDeps } from './map-interaction-shared';
import { describeForeignOwner } from './map-interaction-shared';
import type { ResolvablePendingIntent } from '@/input/map-tap-intent';

export function showAirStrikeForecast(deps: MapInteractionControllerDeps, unitId: string, coord: HexCoord, notice?: string): void {
  const { session, selection, selectionController, bus } = deps;
  const state = session.getState();
  const viewerId = state.currentPlayer;
  const striker = state.units[unitId];
  if (!striker) return;
  const targetOwner = resolveAirStrikeTarget(state, striker, coord);
  const ownerId = targetOwner.city?.owner ?? targetOwner.unit?.owner;
  const forecast = buildAirStrikeForecastView({
    state, viewerId, unitId, target: coord, ownerName: ownerId ? describeForeignOwner(deps, ownerId) : 'Unknown',
  });
  if (!forecast.ok) {
    deps.showNotification(forecast.message, 'warning');
    return; // pending intent stays: the player may pick another target or cancel
  }
  const panel = deps.getElementById('info-panel');
  if (!panel) return;
  panel.style.display = 'block';
  const signature = airForecastSignature(forecast.view);
  let spent = false;
  renderBattleForecastCard(panel, {
    view: forecast.view,
    notes: notice ? [{ text: notice, emphasis: 'warning' }] : [],
    action: { label: 'Strike', title: 'Air Strike Preview' },
  }, {
    onCancel: () => {
      spent = true;
      selection.setPendingIntent({ kind: 'none' });
      selectionController.selectUnit(unitId);
    },
    onAttack: () => {
      if (spent) return; // a rapid second tap must never fly the mission twice
      spent = true;
      const live = session.getState();
      const fresh = buildAirStrikeForecastView({
        state: live, viewerId: live.currentPlayer, unitId, target: coord, ownerName: ownerId ? describeForeignOwner(deps, ownerId) : 'Unknown',
      });
      if (!fresh.ok) {
        deps.showNotification(fresh.message, 'warning');
        selection.setPendingIntent({ kind: 'none' });
        selectionController.selectUnit(unitId);
        return;
      }
      if (airForecastSignature(fresh.view) !== signature) {
        showAirStrikeForecast(deps, unitId, coord, 'Things changed since this preview was shown. Review the updated forecast before striking.');
        return;
      }
      const result = resolveAirStrike(live, unitId, coord, bus);
      selection.setPendingIntent({ kind: 'none' });
      if (!result.ok) {
        deps.showNotification(AIR_MISSION_FAILURE_MESSAGES[result.reason], 'warning');
        selectionController.selectUnit(unitId);
        return;
      }
      session.commit(result.state);
      selectionController.refreshCurrentPlayerVisibility();
      SFX.combat();
      selectionController.selectUnit(unitId);
    },
  });
}

export function resolvePendingIntent(deps: MapInteractionControllerDeps, pending0: ResolvablePendingIntent, coord: HexCoord): void {
  const { session, selection, selectionController, renderLoop, bus, uiLayer } = deps;
    switch (pending0.kind) {
      case 'journey': {
        const journeyUnitId = pending0.unitId;
        const unit = session.getState().units[journeyUnitId];
        if (unit) {
          const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
          const completedTechs = session.getState().civilizations[unit.owner]?.techState.completed ?? [];
          const path = findPath(unit.position, coord, session.getState().map, domain, { unit, completedTechs, deniedOwnerIds: getDeniedTerritoryOwners(session.getState(), unit) });
          if (!path || path.length < 2) {
            deps.showNotification('No path to that destination.', 'warning');
          } else {
            session.commit({
              ...session.getState(),
              units: {
                ...session.getState().units,
                [journeyUnitId]: { ...unit, automation: { mode: 'journey', destination: coord } },
              },
            });
            selectionController.selectUnit(journeyUnitId);
            deps.showNotification('Journey set. Your unit will advance each turn.', 'info');
          }
        }
        selection.setPendingIntent({ kind: 'none' });
        return;
      }

      case 'air-mission': {
        const pending = pending0;
        if (pending.mission === 'strike') {
          showAirStrikeForecast(deps, pending.unitId, coord);
          return;
        }
        const result = pending.mission === 'recon'
          ? resolveReconMission(session.getState(), pending.unitId, coord)
          : resolvePatrolMission(session.getState(), pending.unitId, coord);
        if (!result.ok) {
          deps.showNotification(AIR_MISSION_FAILURE_MESSAGES[result.reason], 'warning');
          return;
        }
        selection.setPendingIntent({ kind: 'none' });
        session.commit(result.state);
        selectionController.refreshCurrentPlayerVisibility();
        SFX.airRecon();
        selectionController.selectUnit(pending.unitId);
        return;
      }

      case 'paradrop': {
        const pending = pending0;
        const result = executeParadrop(session.getState(), pending.unitId, coord, bus);
        if (!result.ok) {
          deps.showNotification(PARADROP_FAILURE_MESSAGES[result.reason], 'warning');
          return;
        }
        // executeParadrop already logged both sides' notifications
        // (dropping civ + any hostile civ that can see the landing
        // tile) via appendNotification -- that's the persistent log,
        // not immediate feedback. A flak/interception outcome is new
        // information beyond "did the tap succeed" (unlike an air
        // strike, where the target visibly takes the hit at the
        // tapped tile) -- the player's own unit just relocated and
        // may now be quietly missing HP, so it needs an explicit toast
        // here rather than relying on the map alone.
        selection.setPendingIntent({ kind: 'none' });
        session.commit(result.state);
        selectionController.refreshCurrentPlayerVisibility();
        const outcomeParts: string[] = [];
        if (result.flak) outcomeParts.push(`${result.flak.damage} flak damage from ${result.flak.providerLabel}`);
        if (result.interception) outcomeParts.push('intercepted');
        const survived = Boolean(result.state.units[pending.unitId]);
        const outcomeSuffix = outcomeParts.length ? ` (${outcomeParts.join(', ')})` : '';
        deps.showNotification(
          survived
            ? `Paratrooper landed${outcomeSuffix}. It cannot act again this turn.`
            : `Paratrooper was destroyed on the drop${outcomeSuffix}.`,
          survived && outcomeParts.length === 0 ? 'info' : 'warning',
        );
        // No dedicated "unit move" SFX exists in this codebase --
        // ordinary movement is silent by convention. transportUnload
        // is the closest existing analog for "a unit newly arrives on
        // a tile"; combat is reused for any HP-loss event (flak,
        // interception, or both).
        if (result.flak || result.interception) SFX.combat();
        else SFX.transportUnload();
        if (survived) selectionController.selectUnit(pending.unitId);
        return;
      }

      case 'air-assault': {
        const pending = pending0;
        const result = executeAirAssault(session.getState(), pending.unitId, coord, bus);
        if (!result.ok) {
          deps.showNotification(AIR_ASSAULT_FAILURE_MESSAGES[result.reason], 'warning');
          return;
        }
        // executeAirAssault already logged both sides' notifications
        // via appendNotification, same as executeParadrop above --
        // this toast is the acting player's own immediate feedback.
        selection.setPendingIntent({ kind: 'none' });
        session.commit(result.state);
        selectionController.refreshCurrentPlayerVisibility();
        const outcomeParts: string[] = [];
        if (result.flak) outcomeParts.push(`${result.flak.damage} flak damage from ${result.flak.providerLabel}`);
        if (result.interception) outcomeParts.push('intercepted');
        const survived = Boolean(result.state.units[pending.unitId]);
        const outcomeSuffix = outcomeParts.length ? ` (${outcomeParts.join(', ')})` : '';
        deps.showNotification(
          survived
            ? `Unit was flown in by helicopter${outcomeSuffix}. It cannot act again this turn.`
            : `Unit was destroyed on the air assault${outcomeSuffix}.`,
          survived && outcomeParts.length === 0 ? 'info' : 'warning',
        );
        if (result.flak || result.interception) SFX.combat();
        else SFX.transportUnload();
        if (survived) selectionController.selectUnit(pending.unitId);
        return;
      }

      case 'unload': {
        // Delegate to onUnloadTransport which handles state, animation, and notification
        const panel = deps.getElementById('info-panel');
        if (panel) {
          // Re-invoke via the callback registered in SelectionController's renderSelectedUnitInfo block
          // by triggering the transport system directly here (callbacks are not stored).
          const { transportId, cargoUnitId } = pending0;
          const result = unloadUnitFromTransport(session.getState(), transportId, cargoUnitId, coord);
          if (!result.ok) {
            deps.showNotification(result.message, 'warning');
            SFX.error();
          } else {
            const tName = UNIT_DEFINITIONS[session.getState().units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
            const cName = UNIT_DEFINITIONS[session.getState().units[cargoUnitId]?.type ?? 'warrior']?.name ?? 'Unit';
            deps.clearUnloadState();
            session.commit(result.state);
            renderLoop.animateUnitAppear(coord);
            selectionController.selectUnit(transportId);
            deps.showNotification(`${cName} disembarked from ${tName}.`, 'info');
            SFX.transportUnload();
          }
        }
        return;
      }

      case 'last-stand-target': {
        const generalUnitId = pending0.unitId;
        const preview = getLastStandPreview(session.getState(), generalUnitId, coord);
        selection.setPendingIntent({ kind: 'none' });
        createLastStandPanel(
          uiLayer,
          preview,
          () => {
            session.commit(issueLastStand(session.getState(), generalUnitId, coord));
            selectionController.selectUnit(generalUnitId);
          },
          () => {},
        );
        return;
      }

      default: {
        const _exhaustive: never = pending0;
        throw new Error(`Unhandled pending map intent: ${JSON.stringify(_exhaustive)}`);
      }
    }
}
