/**
 * City / empire-management panel openers (#1242), split out of the monolithic
 * `panel-actions-controller.ts`. Covers the City panel and its production /
 * wonder / crisis callbacks, the City overview, Strategic arsenal, Governance,
 * Victory progress, and the unit-stack picker (a stack often resolves to its
 * city).
 *
 * No behaviour change: same panels, same publication (`session.commit`), same
 * copy. Cross-use-case openers (Wonder, City-cycling) go through
 * `PanelActionsCrossCalls` so this module never imports a peer controller.
 */
import type { City, GameState, HexCoord } from '@/core/types';
import { createWonderPanel } from '@/ui/wonder-panel';
import { createCityOverviewPanel } from '@/ui/city-overview-panel';
import { createStrategicArsenalPanel } from '@/ui/strategic-arsenal-panel';
import { getStrategicArsenalSummaryPresentation } from '@/systems/strategic-arsenal-summary-presentation';
import { createGovernancePanel } from '@/ui/governance-panel';
import { getGovernancePresentation } from '@/systems/governance-presentation';
import { setGovernancePolicy } from '@/systems/governance-policy-system';
import { assignGovernor, removeGovernor, moveGovernor } from '@/systems/governor-system';
import { createVictoryProgressPanel } from '@/ui/victory-progress-panel';
import { projectDominationProgressForViewer } from '@/systems/domination-presentation';
import { createCityPanel } from '@/ui/city-panel';
import { createStrategicLaunchFlow } from '@/ui/strategic-launch-flow';
import { executeStrategicLaunch } from '@/systems/strategic-launch-execution-system';
import { renderUnitStackPanel } from '@/ui/unit-stack-panel';
import { initializeLegendaryWonderProjectsForCity, startLegendaryWonderBuild } from '@/systems/legendary-wonder-system';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { getProductionDisplayName } from '@/systems/city-production-presentation';
import { ENQUEUE_DENIAL_MESSAGES, enqueueCityProduction, removeQueuedId, reorderCityProduction, setIdleProduction } from '@/systems/planning-system';
import { assignCityFocus, setCityWorkedTile } from '@/systems/city-work-system';
import { chooseCircularManufacturingMaterial } from '@/systems/national-project-system';
import { rushBuyActiveProduction } from '@/systems/rush-buy-system';
import { setCityLevy } from '@/systems/city-levy-system';
import { applyEmpireContainment, applyQuarantine, applyRemedy } from '@/systems/crisis-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { evaluateUnitUpgrade } from '@/systems/unit-upgrade-system';
import type { PanelActionsCommonDeps, PanelActionsCrossCalls } from './panel-actions-shared';

export interface CityPanelActionsController {
  openCityPanelForCity(city: City): void;
  openWonderPanelForCityId(selectedCityId: string): void;
  openCityOverviewPanel(): void;
  openStrategicArsenalPanel(): void;
  openGovernancePanel(): void;
  openVictoryProgressPanel(): void;
  closeVictoryProgressPanel(): void;
  refreshVictoryProgressPanel(): void;
  openUnitStackPicker(coord: HexCoord, unitIds: string[]): void;
}

export function createCityPanelActionsController(
  deps: PanelActionsCommonDeps,
  cross: PanelActionsCrossCalls,
): CityPanelActionsController {
  let stopVictoryProgressUpdates: (() => void) | null = null;
  let renderVictoryProgressPanel: (() => void) | null = null;
  let removeVictoryProgressPanel: (() => void) | null = null;

  function openStrategicArsenalPanel(): void {
    const presentation = getStrategicArsenalSummaryPresentation(deps.session.getState(), deps.session.getState().currentPlayer);
    createStrategicArsenalPanel(deps.uiLayer, presentation, () => {});
  }

  function openGovernancePanel(): void {
    const civId = deps.session.getState().currentPlayer;
    const rerender = () => {
      createGovernancePanel(
        deps.uiLayer,
        getGovernancePresentation(deps.session.getState(), civId),
        (policyId, enabled) => {
          const result = setGovernancePolicy(deps.session.getState(), civId, policyId, enabled);
          if (!result.success) {
            deps.showNotification(result.message, 'warning');
            return;
          }
          deps.session.commit(result.state);
          deps.showNotification(result.message, 'success');
          rerender();
        },
        (cityId, assign) => {
          const result = assign
            ? assignGovernor(deps.session.getState(), civId, cityId)
            : removeGovernor(deps.session.getState(), civId, cityId);
          if (!result.success) {
            deps.showNotification(result.message, 'warning');
            return;
          }
          deps.session.commit(result.state);
          deps.showNotification(result.message, 'success');
          rerender();
        },
        (fromCityId, toCityId) => {
          const result = moveGovernor(deps.session.getState(), civId, fromCityId, toCityId);
          if (!result.success) {
            deps.showNotification(result.message, 'warning');
            return;
          }
          deps.session.commit(result.state);
          deps.showNotification(result.message, 'success');
          rerender();
        },
        () => {},
      );
    };
    rerender();
  }

  function closeVictoryProgressPanel(): void {
    stopVictoryProgressUpdates?.();
    stopVictoryProgressUpdates = null;
    renderVictoryProgressPanel = null;
    removeVictoryProgressPanel?.();
    removeVictoryProgressPanel = null;
  }

  function refreshVictoryProgressPanel(): void {
    renderVictoryProgressPanel?.();
  }

  function openVictoryProgressPanel(): void {
    deps.hud.closeDrawer();
    closeVictoryProgressPanel();
    deps.getElementById('victory-progress-panel')?.remove();
    const viewerId = deps.session.getState().currentPlayer;
    let panel: HTMLElement | null = null;
    const close = () => closeVictoryProgressPanel();
    const render = (state: GameState) => {
      if (panel && !panel.isConnected) {
        stopVictoryProgressUpdates?.();
        stopVictoryProgressUpdates = null;
        return;
      }
      if (state.currentPlayer !== viewerId) {
        close();
        return;
      }
      panel?.remove();
      panel = createVictoryProgressPanel(projectDominationProgressForViewer(state, viewerId), {
        onClose: close,
        onOpenDiplomacy: () => {
          close();
          deps.router.open('diplomacy');
        },
        onOpenCity: cityId => {
          const city = deps.session.getState().cities[cityId];
          if (!city || city.owner !== deps.session.getState().currentPlayer) {
            deps.showNotification('That city is no longer available to this seat.', 'info');
            return;
          }
          close();
          openCityPanelForCity(city);
        },
        onOpenEspionage: () => {
          close();
          deps.router.open('espionage');
        },
      });
      deps.uiLayer.appendChild(panel);
    };
    removeVictoryProgressPanel = () => {
      panel?.remove();
      panel = null;
    };
    renderVictoryProgressPanel = () => render(deps.session.getState());
    render(deps.session.getState());
    stopVictoryProgressUpdates = deps.session.subscribe(render);
  }

  function openWonderPanelForCityId(selectedCityId: string): void {
    if (!deps.session.getState().cities[selectedCityId]) return;

    const openWonderPanel = () => {
      deps.getElementById('wonder-panel')?.remove();
      createWonderPanel(deps.uiLayer, deps.session.getState(), selectedCityId, {
        onStartBuild: (buildCityId, wonderId) => {
          deps.session.commit(startLegendaryWonderBuild(deps.session.getState(), deps.session.getState().currentPlayer, buildCityId, wonderId, deps.bus));
          const targetCity = deps.session.getState().cities[buildCityId];
          if (targetCity) {
            const productionItemId = `legendary:${wonderId}`;
            if (targetCity.productionQueue[0] === productionItemId) {
              deps.showNotification(`${targetCity.name}: preparing ${getProductionDisplayName(productionItemId)}`, 'info');
            } else {
              deps.showNotification(`${targetCity.name}: ${getProductionDisplayName(productionItemId)} is not ready to start.`, 'warning');
            }
            openWonderPanel();
          }
        },
        onClose: () => {
          deps.getElementById('wonder-panel')?.remove();
        },
      });
    };
    // Opening the panel lazily initialises its project records; publish only if that changed anything.
    const initialized = initializeLegendaryWonderProjectsForCity(deps.session.getState(), deps.session.getState().currentPlayer, selectedCityId);
    if (initialized !== deps.session.getState()) deps.session.commit(initialized);
    openWonderPanel();
  }

  function openCityOverviewPanel(): void {
    deps.hud.closeDrawer();
    const existing = deps.getElementById('city-overview-panel');
    if (existing) existing.remove();
    createCityOverviewPanel(deps.uiLayer, deps.session.getState(), {
      onOpenCity: (cityId) => {
        const overview = deps.getElementById('city-overview-panel');
        overview?.remove();
        const city = deps.session.getState().cities[cityId];
        if (city) openCityPanelForCity(city);
      },
      onAppeaseFaction: (cityId) => {
        deps.diplomacyActions.handleAppeaseFaction(cityId);
        openCityOverviewPanel(); // re-render with updated unrest/gold state
      },
      onConcedeToMovement: (cityId) => {
        deps.diplomacyActions.handleConcedeToMovement(cityId);
        openCityOverviewPanel(); // re-render with updated unrest/gold state
      },
      onClose: () => {
        deps.getElementById('city-overview-panel')?.remove();
      },
    });
  }

  function openUnitStackPicker(coord: HexCoord, unitIds: string[]): void {
    const panel = deps.getElementById('info-panel');
    if (!panel) return;

    renderUnitStackPanel(panel, deps.session.getState(), coord, unitIds, {
      onSelectUnit: (unitId) => deps.selectionController.selectUnit(unitId),
      onOpenCity: (cityId) => {
        const city = deps.session.getState().cities[cityId];
        if (!city) return;
        deps.getElementById('tech-panel')?.remove();
        deps.getElementById('city-panel')?.remove();
        deps.getElementById('espionage-panel')?.remove();
        deps.getElementById('diplomacy-panel')?.remove();
        deps.getElementById('marketplace-panel')?.remove();
        deps.getElementById('council-panel')?.remove();
        deps.selectionController.deselectUnit();
        openCityPanelForCity(city);
      },
      onClose: () => deps.selectionController.deselectUnit(),
    }, { selectedUnitId: deps.selection.getSelectedUnitId() });
  }

  function openCityPanelForCity(city: City): void {
    deps.hud.closeDrawer();
    if (city.owner !== deps.session.getState().currentPlayer) return;

    createCityPanel(deps.uiLayer, city, deps.session.getState(), {
      onBuild: (cityId, itemId) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        const result = enqueueCityProduction(deps.session.getState(), cityId, itemId);
        if (!result.ok) {
          deps.showNotification(`${targetCity.name}: ${ENQUEUE_DENIAL_MESSAGES[result.reason]}`, 'warning');
          return;
        }
        deps.session.commit(result.state);
        deps.showNotification(`${targetCity.name}: queued ${getProductionDisplayName(itemId)}`, 'info');
        return deps.session.getState();
      },
      onPrepareStrategicLaunch: (cityId: string) => {
        const launchingCity = deps.session.getState().cities[cityId];
        if (!launchingCity) return;
        createStrategicLaunchFlow(deps.uiLayer, deps.session.getState(), launchingCity.owner, {
          onSetPreview: preview => deps.renderLoop.setStrategicLaunchPreview(preview),
          onConfirmLaunch: targetCityId => {
            const targetCivId = deps.session.getState().cities[targetCityId]?.owner;
            const result = executeStrategicLaunch(deps.session.getState(), launchingCity.owner, targetCityId);
            if (result.ok && targetCivId) {
              deps.session.commit(result.state);
              deps.showNotification('Strategic strike launched.', 'warning');
              deps.bus.emit('city:strategic-strike', { cityId: targetCityId, recipientCivId: targetCivId, actorCivId: launchingCity.owner, goldLost: result.goldLost });
            }
          },
          onClose: () => {},
        });
      },
      onMoveQueueItem: (cityId, fromIndex, toIndex) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.commit({ ...deps.session.getState(), cities: { ...deps.session.getState().cities, [cityId]: reorderCityProduction(targetCity, fromIndex, toIndex) } });
        return deps.session.getState();
      },
      onRemoveQueueItem: (cityId, index) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.commit({
          ...deps.session.getState(),
          cities: {
            ...deps.session.getState().cities,
            [cityId]: {
              ...targetCity,
              productionQueue: removeQueuedId(targetCity.productionQueue, index),
              productionProgress: index === 0 ? 0 : targetCity.productionProgress,
            },
          },
        });
        return deps.session.getState();
      },
      onOpenWonderPanel: (selectedCityId) => {
        openWonderPanelForCityId(selectedCityId);
      },
      onSetCityFocus: (cityId, focus) => {
        const result = assignCityFocus(deps.session.getState(), cityId, focus);
        deps.session.commit(result.state);
        deps.showNotification(`${deps.session.getState().cities[cityId].name} reassigned citizens for ${focus} focus.`, 'info');
        return deps.session.getState();
      },
      onToggleWorkedTile: (cityId, coord, worked) => {
        const result = setCityWorkedTile(deps.session.getState(), cityId, coord, worked);
        deps.session.commit(result.state);
        if (!result.changed && result.reason === 'claimed') {
          deps.showNotification('That tile is already worked by another city.', 'warning');
        }
        return deps.session.getState();
      },
      onClose: () => {},
      onTip: (message) => { deps.showNotification(message, 'info'); },
      onSelectUnit: (unitId) => deps.selectionController.selectUnit(unitId),
      onEstablishRoute: deps.diplomacyActions.handleEstablishRoute,
      onPrevCity: () => {
        const cities = deps.currentCiv().cities;
        if (cities.length <= 1) return;
        const currentIdx = cities.indexOf(city.id);
        const prevIdx = (currentIdx - 1 + cities.length) % cities.length;
        const prevCity = deps.session.getState().cities[cities[prevIdx]];
        if (prevCity) openCityPanelForCity(prevCity);
      },
      onNextCity: () => {
        const cities = deps.currentCiv().cities;
        if (cities.length <= 1) return;
        const currentIdx = cities.indexOf(city.id);
        const nextIdx = (currentIdx + 1) % cities.length;
        const nextCity = deps.session.getState().cities[cities[nextIdx]];
        if (nextCity) openCityPanelForCity(nextCity);
      },
      onUpgradeUnit: (unitId) => {
        const unit = deps.session.getState().units[unitId];
        if (!unit || unit.owner !== deps.session.getState().currentPlayer) return;
        const targetType = TRAINABLE_UNITS.find(entry => entry.type === unit.type)?.upgradesTo;
        if (!targetType) return;
        const upgrade = evaluateUnitUpgrade(deps.session.getState(), unitId, targetType);
        if (!upgrade.canUpgrade || !upgrade.targetType) return;
        if (deps.executeUpgrade(unitId, upgrade.targetType)) {
          deps.showNotification(`Upgraded to ${UNIT_DEFINITIONS[upgrade.targetType].name}!`, 'success');
        }
      },
      onSetIdleProduction: (cityId, mode) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.commit({ ...deps.session.getState(), cities: { ...deps.session.getState().cities, [cityId]: setIdleProduction(targetCity, mode) } });
        return deps.session.getState();
      },
      onRushBuyActiveProduction: (cityId) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return deps.session.getState();
        const result = rushBuyActiveProduction(deps.session.getState(), deps.session.getState().currentPlayer, cityId, deps.bus);
        if (!result.success) {
          deps.showNotification(result.message, 'warning');
          return deps.session.getState();
        }
        deps.session.commit(result.state);
        deps.showNotification(`${targetCity.name}: rush bought ${result.label} for ${result.cost} gold.`, 'success');
        return deps.session.getState();
      },
      onAppeaseFaction: (cityId) => deps.diplomacyActions.handleAppeaseFaction(cityId),
      onConcedeToMovement: (cityId) => deps.diplomacyActions.handleConcedeToMovement(cityId),
      onSetCityLevy: (cityId, enabled) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return deps.session.getState();
        const result = setCityLevy(deps.session.getState(), {
          cityId,
          actorId: deps.session.getState().currentPlayer,
          enabled,
        });
        if (!result.ok) {
          deps.showNotification(`${targetCity.name}: cannot change the levy (${result.reason}).`, 'warning');
          return deps.session.getState();
        }
        deps.session.commit(result.state);
        deps.showNotification(
          enabled ? `${targetCity.name}: Imperial Levy placed.` : `${targetCity.name}: Imperial Levy ended.`,
          'info',
        );
        return deps.session.getState();
      },
      onQuarantineCrisis: (crisisId, cityId) => {
        const result = applyQuarantine(deps.session.getState(), crisisId, cityId);
        if (!result.success) {
          deps.showNotification(result.message, 'warning');
          return deps.session.getState();
        }
        deps.session.commit(result.state);
        deps.showNotification(result.message, 'success');
        return deps.session.getState();
      },
      onRemedyCrisis: (crisisId, cityId) => {
        const result = applyRemedy(deps.session.getState(), crisisId, cityId);
        if (!result.success) {
          deps.showNotification(result.message, 'warning');
          return deps.session.getState();
        }
        deps.session.commit(result.state);
        deps.showNotification(result.message, 'success');
        return deps.session.getState();
      },
      onEmpireContainment: (crisisId) => {
        const result = applyEmpireContainment(deps.session.getState(), crisisId, deps.bus);
        if (!result.success) {
          deps.showNotification(result.message, 'warning');
          return deps.session.getState();
        }
        // Success feedback comes from the crisis:contained event via routeCrisisContained
        // (delivered immediately to the acting player, queued for a non-active hot-seat
        // player) — a showNotification here would double it.
        deps.session.commit(result.state);
        return deps.session.getState();
      },
      onFindResources: (highlights, toasts) => {
        deps.renderLoop.setHighlights(highlights.map(coord => ({ coord, type: 'worker-buildable' as const })));
        for (const t of toasts) deps.showNotification(t.message, t.type);
      },
      onChooseCircularManufacturingMaterial: (material) => {
        try {
          deps.session.commit(chooseCircularManufacturingMaterial(deps.session.getState(), deps.session.getState().currentPlayer, material));
        } catch (error) {
          deps.showNotification(error instanceof Error ? error.message : 'That material choice is unavailable.', 'warning');
          return;
        }
        deps.showNotification(`Circular Manufacturing Network will substitute ${material.replaceAll('-', ' ')} when it helps.`, 'success');
        const refreshedCity = deps.session.getState().cities[city.id];
        if (refreshedCity) openCityPanelForCity(refreshedCity);
      },
    });
  }

  // `cross` is part of the shared handle's contract; the city group currently
  // needs none of its peer openers (it is the destination of several), but the
  // parameter keeps every group factory symmetrical for the composite.
  void cross;

  return {
    openCityPanelForCity,
    openWonderPanelForCityId,
    openCityOverviewPanel,
    openStrategicArsenalPanel,
    openGovernancePanel,
    openVictoryProgressPanel,
    closeVictoryProgressPanel,
    refreshVictoryProgressPanel,
    openUnitStackPicker,
  };
}
