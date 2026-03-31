// src/ui/espionage-panel.ts
import type { GameState, Spy } from '../core/types';
import { canRecruitSpy, getAvailableMissions } from '../systems/espionage-system';

export interface EspionagePanelData {
  spies: Spy[];
  canRecruit: boolean;
  maxSpies: number;
  activeSpyCount: number;
  availableMissions: string[];
}

export type SpyAction = 'assign' | 'assign_defensive' | 'start_mission' | 'recall';

export function getEspionagePanelData(state: GameState): EspionagePanelData {
  const civEsp = state.espionage?.[state.currentPlayer];
  if (!civEsp) {
    return { spies: [], canRecruit: false, maxSpies: 0, activeSpyCount: 0, availableMissions: [] };
  }

  const spies = Object.values(civEsp.spies).filter(s => s.owner === state.currentPlayer);
  const activeSpyCount = spies.filter(s => s.status !== 'captured').length;
  const completedTechs = state.civilizations[state.currentPlayer]?.techState.completed ?? [];

  return {
    spies,
    canRecruit: canRecruitSpy(civEsp),
    maxSpies: civEsp.maxSpies,
    activeSpyCount,
    availableMissions: getAvailableMissions(completedTechs),
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
