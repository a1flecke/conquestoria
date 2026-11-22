/**
 * Espionage panel opener (#1242), split out of the monolithic
 * `panel-actions-controller.ts`. The Espionage panel is its own player use
 * case (covert operations) and the largest single opener, so it is a peer
 * group rather than a member of the world-threat (pirates/network) group.
 *
 * No behaviour change: same panel, same publication (`session.commit`), same
 * copy. It needs no cross-use-case openers, so `cross` is accepted only for
 * factory symmetry.
 */
import type { GameState, HexCoord, SpyMissionType } from '@/core/types';
import { createEspionagePanel, getSpyMissionLabel } from '@/ui/espionage-panel';
import { createEspionageTargetPicker } from '@/ui/espionage-target-picker';
import { getCapitalCity, getCapitalCityId } from '@/systems/capital-system';
import {
  embedSpy, recallSpy, runCounterIntelSweep, SWEEP_DENIAL_MESSAGES, getAvailableMissions, getMissionStartDenial, missionRequiresPlacedSpy,
  START_MISSION_FAILURE_MESSAGES, unembedSpy, startDebrief, DEBRIEF_DENIAL_MESSAGES, DEBRIEF_TURNS,
} from '@/systems/espionage-system';
import {
  getRemoteMissionTargetMode, getRemoteMissionTargetsForViewer, startMissionForCiv,
} from '@/systems/espionage-remote-targets';
import { createUnit } from '@/systems/unit-lifecycle';
import { findSpyReturnTile } from '@/systems/unit-spawn-placement';
import { removeUnits } from '@/systems/unit-removal-system';
import type { PanelActionsCommonDeps, PanelActionsCrossCalls } from './panel-actions-shared';

export interface EspionagePanelActionsController {
  openEspionagePanel(): void;
}

export function createEspionagePanelActionsController(
  deps: PanelActionsCommonDeps,
  cross: PanelActionsCrossCalls,
): EspionagePanelActionsController {
  function openEspionagePanel(): void {
    deps.hud.closeDrawer();
    const chooseFriendlyCityTarget = (): { cityId: string; position: HexCoord } | null => {
      const choices = deps.currentCiv().cities
        .map(cityId => deps.session.getState().cities[cityId])
        .filter((city): city is NonNullable<GameState['cities'][string]> => city !== undefined);
      if (choices.length === 0) {
        deps.showNotification('No cities available for defensive espionage.', 'info');
        return null;
      }
      const selection = window.prompt(
        `Choose friendly city by id:\n${choices.map(city => city.id).join('\n')}`,
        choices[0].id,
      );
      if (!selection) return null;
      const city = deps.session.getState().cities[selection];
      if (!city || city.owner !== deps.session.getState().currentPlayer) {
        deps.showNotification('Invalid defensive target.', 'warning');
        return null;
      }
      return { cityId: city.id, position: city.position };
    };

    const chooseMission = (spyId: string): SpyMissionType | null => {
      const spy = deps.session.getState().espionage?.[deps.session.getState().currentPlayer]?.spies[spyId];
      const completedTechs = deps.currentCiv().techState.completed ?? [];
      // #524 MR2a review fix: flip_loyalty can never succeed against a capital (see
      // resolveMissionResult's guard in espionage-system.ts) -- don't offer it as a
      // choice when the spy's current target already is one. Without this, a spy
      // stationed in an enemy capital could "succeed" an 8-turn flip_loyalty mission
      // that silently does nothing, with no explanation.
      const spyTargetsCapital = Boolean(
        spy?.targetCivId && spy.targetCityId
          && getCapitalCityId(deps.session.getState(), spy.targetCivId) === spy.targetCityId,
      );
      const candidates = getAvailableMissions(completedTechs)
        .filter(mission => mission !== 'flip_loyalty' || !spyTargetsCapital);
      // The same eligibility source `startMission` revalidates with (#1222): what we offer is
      // exactly what can start. A remote mission's target is chosen after the offer.
      const esp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
      const denials = candidates.map(mission => esp
        ? getMissionStartDenial(esp, spyId, mission, undefined, undefined, { targetToBeChosen: !missionRequiresPlacedSpy(mission) })
        : 'spy-not-found' as const);
      const missions = candidates.filter((_, index) => denials[index] === null);
      if (missions.length === 0) {
        const denial = denials.find(reason => reason !== null);
        if (denial) deps.showNotification(START_MISSION_FAILURE_MESSAGES[denial], 'warning');
        else deps.showNotification('No missions available for this spy.', 'info');
        return null;
      }
      // `window.prompt` always returns a plain string -- cast once here to the real
      // union type instead of casting at each downstream use site with `as any`.
      return window.prompt(`Choose mission:\n${missions.join('\n')}`, missions[0]) as SpyMissionType | null;
    };

    deps.uiLayer.appendChild(createEspionagePanel(deps.session.getState(), {
      onClose: () => deps.getElementById('espionage-panel')?.remove(),
      onShowCaptureChoice: (spyId, spyOwner) => {
        // The verdict dialog is the decision surface; close the panel rather than leave a stale
        // captured-agent row behind after the player chooses expel/execute/interrogate.
        deps.getElementById('espionage-panel')?.remove();
        deps.showEspionageCaptureChoice(spyId, spyOwner);
      },
      onAssignDefensive: (spyId) => {
        const target = chooseFriendlyCityTarget();
        if (!target) return;
        const currentPlayer = deps.session.getState().currentPlayer;
        const unit = deps.session.getState().units[spyId];
        const nextEspionage = {
          ...deps.session.getState().espionage,
          [currentPlayer]: embedSpy(deps.session.getState().espionage![currentPlayer], spyId, target.cityId, target.position),
        };
        // The spy goes off-map but its record IS the spy now: 'consumed' keeps it (#1198).
        const withEspionage: GameState = { ...deps.session.getState(), espionage: nextEspionage };
        deps.session.commit(unit ? removeUnits(withEspionage, [spyId], { reason: 'consumed' }).state : withEspionage);
        deps.router.open('espionage');
        const cityName = deps.session.getState().cities[target.cityId]?.name ?? target.cityId;
        deps.showNotification(`Spy embedded in ${cityName}. Counter-intelligence boosted.`, 'info');
      },
      onStartMission: (spyId) => {
        const spy = deps.session.getState().espionage?.[deps.session.getState().currentPlayer]?.spies[spyId];
        if (!spy) {
          deps.showNotification(START_MISSION_FAILURE_MESSAGES['spy-not-found'], 'warning');
          return;
        }
        const mission = chooseMission(spyId);
        if (!mission) return;
        const finishStart = (targetCivId: string | undefined, targetCityId: string | undefined): void => {
          const currentPlayer = deps.session.getState().currentPlayer;
          // Revalidate against the live state: the choices above can outlive the spy's status (#1222)
          // and the target's eligibility (#1780).
          const started = startMissionForCiv(
            deps.session.getState(), currentPlayer, spyId, mission, deps.currentCivDef()?.bonusEffect, targetCivId, targetCityId,
          );
          if (!started.ok) {
            deps.showNotification(START_MISSION_FAILURE_MESSAGES[started.reason], 'warning');
            return;
          }
          deps.session.commit({
            ...deps.session.getState(),
            espionage: {
              ...deps.session.getState().espionage,
              [currentPlayer]: started.state,
            },
          });
          deps.router.open('espionage');
          deps.showNotification(`Mission ${mission} started.`, 'info');
        };
        if (missionRequiresPlacedSpy(mission)) {
          finishStart(spy.targetCivId ?? undefined, spy.targetCityId ?? undefined);
          return;
        }
        // #1780: a remote mission may only be aimed at what this player has earned: met empires
        // with a found city (or, for a city strike, the found cities themselves).
        const state = deps.session.getState();
        createEspionageTargetPicker(deps.uiLayer, {
          missionLabel: getSpyMissionLabel(mission),
          mode: getRemoteMissionTargetMode(mission),
          targets: getRemoteMissionTargetsForViewer(state, state.currentPlayer, mission),
          onChoose: target => finishStart(target.civId, target.cityId),
          onCancel: () => {},
        });
      },
      onRecall: (spyId) => {
        const currentPlayer = deps.session.getState().currentPlayer;
        deps.session.commit({
          ...deps.session.getState(),
          espionage: { ...deps.session.getState().espionage, [currentPlayer]: recallSpy(deps.session.getState().espionage![currentPlayer], spyId) },
        });
        deps.router.open('espionage');
        deps.showNotification('Spy recalled.', 'info');
      },
      onDebriefAgent: (spyId) => {
        const state = deps.session.getState();
        const currentPlayer = state.currentPlayer;
        const result = startDebrief(state.espionage![currentPlayer], spyId, state.turn);
        if (!result.ok) {
          deps.showNotification(DEBRIEF_DENIAL_MESSAGES[result.reason], 'warning');
          return;
        }
        deps.session.commit({ ...state, espionage: { ...state.espionage, [currentPlayer]: result.state } });
        deps.router.open('espionage');
        deps.showNotification(`Debrief started. The spy will stand down for ${DEBRIEF_TURNS} turns while it is checked.`, 'info');
      },
      onExfiltrate: (spyId) => {
        const ownerEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'stationed') return;
        const capital = getCapitalCity(deps.session.getState(), deps.session.getState().currentPlayer);
        if (!capital) { deps.showNotification('Cannot exfiltrate — no capital found.', 'warning'); return; }

        const currentPlayer = deps.session.getState().currentPlayer;
        // The capital itself (alongside its own garrison), else a neighbour the spy can stand on.
        const spawnPos = findSpyReturnTile(deps.session.getState(), currentPlayer, spy.unitType, capital.position);
        if (!spawnPos) {
          deps.showNotification('Cannot exfiltrate — no free tile near capital.', 'warning');
          return;
        }

        const idCounters = { ...deps.session.getState().idCounters };
        const newUnit = createUnit(spy.unitType, currentPlayer, spawnPos, idCounters);
        const updatedSpy = {
          ...spy, id: newUnit.id, status: 'cooldown' as const,
          cooldownTurns: 8, infiltrationCityId: null, cityVisionTurnsLeft: 0, targetCivId: null, cooldownMode: undefined,
        };
        const { [spyId]: _old, ...rest } = ownerEsp!.spies;
        deps.session.commit({
          ...deps.session.getState(),
          idCounters,
          units: { ...deps.session.getState().units, [newUnit.id]: newUnit },
          civilizations: {
            ...deps.session.getState().civilizations,
            [currentPlayer]: { ...deps.session.getState().civilizations[currentPlayer], units: [...(deps.session.getState().civilizations[currentPlayer].units ?? []), newUnit.id] },
          },
          espionage: { ...deps.session.getState().espionage, [currentPlayer]: { ...ownerEsp!, spies: { ...rest, [newUnit.id]: updatedSpy } } },
        });
        // Refresh panel in place
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
        deps.showNotification('Spy exfiltrated. Available again in 8 turns.', 'info');
      },
      onToggleCooldownMode: (spyId) => {
        const civEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        const spy = civEsp?.spies[spyId];
        if (!spy || spy.status !== 'cooldown') return;
        const next: 'stay_low' | 'passive_observe' =
          (spy.cooldownMode ?? 'stay_low') === 'passive_observe' ? 'stay_low' : 'passive_observe';
        deps.session.commit({
          ...deps.session.getState(),
          espionage: {
            ...deps.session.getState().espionage!,
            [deps.session.getState().currentPlayer]: {
              ...civEsp!,
              spies: { ...civEsp!.spies, [spyId]: { ...spy, cooldownMode: next } },
            },
          },
        });
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
      },
      onUnembed: (spyId) => {
        const ownerEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return;
        const city = deps.session.getState().cities[spy.targetCityId];
        if (!city) return;
        const currentPlayer = deps.session.getState().currentPlayer;
        const spawnPos = findSpyReturnTile(deps.session.getState(), currentPlayer, spy.unitType, city.position);
        if (!spawnPos) {
          deps.showNotification(`Cannot recall — no free tile near ${city.name}.`, 'warning');
          return;
        }
        const idCounters = { ...deps.session.getState().idCounters };
        const newUnit = createUnit(spy.unitType, currentPlayer, spawnPos, idCounters);
        const unembedded = unembedSpy(ownerEsp!, spyId);
        const rekeyed = { ...unembedded.spies[spyId], id: newUnit.id };
        const { [spyId]: _old, ...rest } = unembedded.spies;
        deps.session.commit({
          ...deps.session.getState(),
          idCounters,
          units: { ...deps.session.getState().units, [newUnit.id]: newUnit },
          civilizations: {
            ...deps.session.getState().civilizations,
            [currentPlayer]: { ...deps.session.getState().civilizations[currentPlayer], units: [...deps.session.getState().civilizations[currentPlayer].units, newUnit.id] },
          },
          espionage: { ...deps.session.getState().espionage, [currentPlayer]: { ...unembedded, spies: { ...rest, [newUnit.id]: rekeyed } } },
        });
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
        deps.showNotification(`Spy recalled from ${city.name}. Available in 5 turns.`, 'info');
      },
      onSweep: (spyId) => {
        const result = runCounterIntelSweep(deps.session.getState(), deps.session.getState().currentPlayer, spyId, deps.bus);
        if (!result.ok) {
          deps.showNotification(SWEEP_DENIAL_MESSAGES[result.reason], 'warning');
          return;
        }
        deps.session.commit(result.state);
        const count = result.expelledSpyIds.length;
        deps.showNotification(
          count > 0
            ? `Sweep caught ${count} enemy ${count === 1 ? 'spy' : 'spies'} and expelled them from the city.`
            : 'Sweep complete — no enemy spies detected.',
          count > 0 ? 'warning' : 'info',
        );
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
      },
    }));
  }

  void cross; // symmetry with the other group factories (no peer cross-calls)

  return { openEspionagePanel };
}
