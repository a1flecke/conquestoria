/**
 * Air commands: intercept, rebase, air missions, paradrop and air assault (#1223 typed failures) (#1243), split out of `selection-unit-commands.ts`.
 * Callbacks are moved verbatim; each reaches selection through the `SelectionCore` handle.
 */
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { hexKey } from '@/systems/hex-utils';
import { SFX } from '@/audio/sfx';
import { AIR_MISSION_FAILURE_MESSAGES, startIntercept, getInterceptCoverage, getLegalRebaseDestinations, getAirBaseRoster, getAirBaseCapacity, rebaseAircraft, getLegalAirMissionTargets } from '@/systems/air-operations-system';
import { getParadropTargets, getAirAssaultTargets, getAirAssaultLaunchState, AIR_ASSAULT_FAILURE_MESSAGES } from '@/systems/airborne-system';
import { getKnownHostileAirDefenseThreat } from '@/systems/air-defense-system';
import type { SelectionCommonDeps, SelectionCore, SelectedUnitCommands, SelectionCommandArgs } from './selection-shared';

export function createAirCommands(
  deps: SelectionCommonDeps,
  core: SelectionCore,
  args: SelectionCommandArgs,
): Pick<SelectedUnitCommands, 'onStartIntercept' | 'getAirRebaseDestinations' | 'onRebaseAircraft' | 'onStartAirMission' | 'onCancelAirMission' | 'onStartParadrop' | 'onCancelParadrop' | 'onStartAirAssault' | 'onCancelAirAssault'> {
  const { session, selection, renderLoop } = deps;

  return {
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
  };
}
