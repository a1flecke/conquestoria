/**
 * Thin composite over the four use-case panel-action controllers (#1242).
 *
 * The former 1,342-line monolith is split by player use case:
 *   - `city-panel-actions-controller.ts`            (city / empire management)
 *   - `knowledge-panel-actions-controller.ts`       (read/learn surfaces)
 *   - `diplomacy-trade-panel-actions-controller.ts` (diplomacy, marketplace)
 *   - `world-threat-panel-actions-controller.ts`    (pirates, network, espionage)
 *
 * This file keeps the exact public `PanelActionsController` /
 * `PanelActionsControllerDeps` surface, so `bootstrap.ts` and every other caller
 * are unchanged. It only distributes the shared deps and wires the few
 * legitimate cross-use-case openers through `PanelActionsCrossCalls` (the
 * groups never import each other).
 */
import type { City, HexCoord } from '@/core/types';
import { createCityPanelActionsController } from './city-panel-actions-controller';
import { createKnowledgePanelActionsController } from './knowledge-panel-actions-controller';
import { createDiplomacyTradePanelActionsController } from './diplomacy-trade-panel-actions-controller';
import { createWorldThreatPanelActionsController } from './world-threat-panel-actions-controller';
import { createEspionagePanelActionsController } from './espionage-panel-actions-controller';
import type {
  PanelActionsCommonDeps,
  PanelActionsCrossCalls,
} from './panel-actions-shared';

export type { PanelActionsAudio, PanelActionsRenderer } from './panel-actions-shared';

export interface PanelActionsController {
  openPacingDebugPanel(): void;
  openBestiary(): void;
  openHallOfFame(): void;
  openWonderAtlas(initialWonderId?: string): void;
  openPirateWaters(focus?: { factionId?: string; historyId?: string }): void;
  openPirateHeadquartersAssault(factionId: string, unitId: string): void;
  openNotificationLog(): void;
  openDiplomacyPanel(focusMinorCivId?: string): void;
  openMarketplacePanel(): void;
  openWonderPanelForCityId(selectedCityId: string): void;
  openCityOverviewPanel(): void;
  openCouncilPanel(): void;
  openTechPanel(): void;
  openUnitStackPicker(coord: HexCoord, unitIds: string[]): void;
  openNetworkIntentPanel(sourceUnitId: string): void;
  openNetworkPanel(): void;
  openCityPanelForCity(city: City): void;
  openEspionagePanel(): void;
  openStrategicArsenalPanel(): void;
  openGovernancePanel(): void;
  openVictoryProgressPanel(): void;
  closeVictoryProgressPanel(): void;
  refreshVictoryProgressPanel(): void;
}

/** Kept for back-compat: the public dep shape is the shared deps. */
export type PanelActionsControllerDeps = PanelActionsCommonDeps;

export function createPanelActionsController(deps: PanelActionsControllerDeps): PanelActionsController {
  // Forwarding stub: filled once every group exists, before any opener can run
  // (construction is synchronous; the groups only close over this object).
  const cross: PanelActionsCrossCalls = {
    openCityPanelForCity: () => {},
    openWonderPanelForCityId: () => {},
    openPirateWaters: () => {},
    openDiplomacyPanel: () => {},
    openNetworkPanel: () => {},
    openPirateHeadquartersAssault: () => {},
  };

  const city = createCityPanelActionsController(deps, cross);
  const knowledge = createKnowledgePanelActionsController(deps, cross);
  const diplomacyTrade = createDiplomacyTradePanelActionsController(deps);
  const worldThreat = createWorldThreatPanelActionsController(deps, cross);
  const espionage = createEspionagePanelActionsController(deps, cross);

  cross.openCityPanelForCity = city.openCityPanelForCity;
  cross.openWonderPanelForCityId = city.openWonderPanelForCityId;
  cross.openPirateWaters = worldThreat.openPirateWaters;
  cross.openDiplomacyPanel = diplomacyTrade.openDiplomacyPanel;
  cross.openNetworkPanel = worldThreat.openNetworkPanel;
  cross.openPirateHeadquartersAssault = worldThreat.openPirateHeadquartersAssault;

  return {
    openPacingDebugPanel: knowledge.openPacingDebugPanel,
    openBestiary: knowledge.openBestiary,
    openHallOfFame: knowledge.openHallOfFame,
    openWonderAtlas: knowledge.openWonderAtlas,
    openPirateWaters: worldThreat.openPirateWaters,
    openPirateHeadquartersAssault: worldThreat.openPirateHeadquartersAssault,
    openNotificationLog: knowledge.openNotificationLog,
    openDiplomacyPanel: diplomacyTrade.openDiplomacyPanel,
    openMarketplacePanel: diplomacyTrade.openMarketplacePanel,
    openWonderPanelForCityId: city.openWonderPanelForCityId,
    openCityOverviewPanel: city.openCityOverviewPanel,
    openCouncilPanel: knowledge.openCouncilPanel,
    openTechPanel: knowledge.openTechPanel,
    openUnitStackPicker: city.openUnitStackPicker,
    openNetworkIntentPanel: worldThreat.openNetworkIntentPanel,
    openNetworkPanel: worldThreat.openNetworkPanel,
    openCityPanelForCity: city.openCityPanelForCity,
    openEspionagePanel: espionage.openEspionagePanel,
    openStrategicArsenalPanel: city.openStrategicArsenalPanel,
    openGovernancePanel: city.openGovernancePanel,
    openVictoryProgressPanel: city.openVictoryProgressPanel,
    closeVictoryProgressPanel: city.closeVictoryProgressPanel,
    refreshVictoryProgressPanel: city.refreshVictoryProgressPanel,
  };
}
