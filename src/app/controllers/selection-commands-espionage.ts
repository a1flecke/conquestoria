/**
 * Espionage commands: disguise, infiltrate, embed (#1222; unit removal via removeUnits) (#1243), split out of `selection-unit-commands.ts`.
 * Callbacks are moved verbatim; each reaches selection through the `SelectionCore` handle.
 */
import type { UnitType } from '@/core/types';
import { setDisguise, attemptInfiltration, getInfiltrationSuccessChance, resolveMissionResult, embedSpy } from '@/systems/espionage-system';
import { removeUnits } from '@/systems/unit-removal-system';
import type { GameState } from '@/core/types';
import type { SelectionCommonDeps, SelectionCore, SelectedUnitCommands, SelectionCommandArgs } from './selection-shared';

export function createEspionageCommands(
  deps: SelectionCommonDeps,
  core: SelectionCore,
  _args: SelectionCommandArgs,
): Pick<SelectedUnitCommands, 'onSetDisguise' | 'onInfiltrate' | 'onEmbed'> {
  const { session } = deps;

  return {
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
  };
}
