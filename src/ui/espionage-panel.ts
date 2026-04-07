// src/ui/espionage-panel.ts
import type { AdvisorType, GameState, Spy, SpyMissionType, SpyPromotion } from '../core/types';
import { canRecruitSpy, getAvailableMissions } from '../systems/espionage-system';

export interface MissionCatalogEntry {
  id: SpyMissionType;
  label: string;
  stage: 1 | 2 | 3 | 4;
}

export interface SpySummary {
  id: string;
  name: string;
  status: Spy['status'];
  targetCityId: string | null;
  targetCivId: string | null;
  experience: number;
  promotion?: SpyPromotion;
  promotionReady: boolean;
  currentMission: SpyMissionType | null;
}

export interface EspionagePanelData {
  spies: Spy[];
  spySummaries: SpySummary[];
  canRecruit: boolean;
  maxSpies: number;
  activeSpyCount: number;
  availableMissions: string[];
  missionCatalog: MissionCatalogEntry[];
  defendingCityIds: string[];
  disabledAdvisors: AdvisorType[];
}

export type SpyAction = 'assign' | 'assign_defensive' | 'start_mission' | 'recall';

const MISSION_LABELS: Record<SpyMissionType, string> = {
  scout_area: 'Scout Area',
  monitor_troops: 'Monitor Troops',
  gather_intel: 'Gather Intel',
  identify_resources: 'Identify Resources',
  monitor_diplomacy: 'Monitor Diplomacy',
  steal_tech: 'Steal Tech',
  sabotage_production: 'Sabotage Production',
  incite_unrest: 'Incite Unrest',
  counter_espionage: 'Counter-Espionage',
  assassinate_advisor: 'Assassinate Advisor',
  forge_documents: 'Forge Documents',
  fund_rebels: 'Fund Rebels',
  arms_smuggling: 'Arms Smuggling',
};

const MISSION_STAGE: Record<SpyMissionType, 1 | 2 | 3 | 4> = {
  scout_area: 1,
  monitor_troops: 1,
  gather_intel: 2,
  identify_resources: 2,
  monitor_diplomacy: 2,
  steal_tech: 3,
  sabotage_production: 3,
  incite_unrest: 3,
  counter_espionage: 3,
  assassinate_advisor: 4,
  forge_documents: 4,
  fund_rebels: 4,
  arms_smuggling: 4,
};

function toMissionCatalog(missions: SpyMissionType[]): MissionCatalogEntry[] {
  return missions.map((mission) => ({
    id: mission,
    label: MISSION_LABELS[mission],
    stage: MISSION_STAGE[mission],
  }));
}

export function getEspionagePanelData(state: GameState): EspionagePanelData {
  const civEsp = state.espionage?.[state.currentPlayer];
  if (!civEsp) {
    return {
      spies: [],
      spySummaries: [],
      canRecruit: false,
      maxSpies: 0,
      activeSpyCount: 0,
      availableMissions: [],
      missionCatalog: [],
      defendingCityIds: [],
      disabledAdvisors: [],
    };
  }

  const spies = Object.values(civEsp.spies).filter(s => s.owner === state.currentPlayer);
  const activeSpyCount = spies.filter(s => s.status !== 'captured').length;
  const completedTechs = state.civilizations[state.currentPlayer]?.techState.completed ?? [];
  const availableMissions = getAvailableMissions(completedTechs);
  const disabledAdvisors = Object.entries(
    state.civilizations[state.currentPlayer]?.advisorDisabledUntil ?? {},
  )
    .filter(([, disabledUntil]) => disabledUntil !== undefined && disabledUntil >= state.turn)
    .map(([advisor]) => advisor as AdvisorType);
  const defendingCityIds = spies
    .filter(s => s.status === 'stationed' && s.targetCivId === null && s.targetCityId !== null)
    .map(s => s.targetCityId!)
    .sort();
  const spySummaries = spies.map((spy) => ({
    id: spy.id,
    name: spy.name,
    status: spy.status,
    targetCityId: spy.targetCityId,
    targetCivId: spy.targetCivId,
    experience: spy.experience,
    promotion: spy.promotion,
    promotionReady: spy.promotionAvailable || (spy.experience >= 60 && spy.promotion === undefined),
    currentMission: spy.currentMission?.type ?? null,
  }));

  return {
    spies,
    spySummaries,
    canRecruit: canRecruitSpy(civEsp),
    maxSpies: civEsp.maxSpies,
    activeSpyCount,
    availableMissions,
    missionCatalog: toMissionCatalog(availableMissions),
    defendingCityIds,
    disabledAdvisors,
  };
}

export function getSpyActions(state: GameState, spyId: string): SpyAction[] {
  const civEsp = state.espionage?.[state.currentPlayer];
  if (!civEsp) return [];
  const spy = civEsp.spies[spyId];
  if (!spy) return [];

  const actions: SpyAction[] = [];

  switch (spy.status) {
    case 'idle':
      actions.push('assign', 'assign_defensive');
      break;
    case 'stationed':
      if (!spy.currentMission && spy.targetCivId) {
        actions.push('start_mission');
      }
      actions.push('recall');
      break;
    case 'traveling':
      actions.push('recall');
      break;
    case 'captured':
    case 'cooldown':
    case 'on_mission':
      // No actions available
      break;
  }

  return actions;
}
