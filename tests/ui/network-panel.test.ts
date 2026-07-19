// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, Unit } from '@/core/types';
import { createNetworkPanel, getNetworkPanelModel } from '@/ui/network-panel';

function city(): City {
  return {
    id: 'city-player', name: 'Roma', owner: 'player', position: { q: 0, r: 0 }, population: 1,
    food: 0, foodNeeded: 10, buildings: ['smart_grid'], productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village', unrestLevel: 0,
    unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
}

describe('network panel model', () => {
  it('is hidden before activation and exposes every currently actionable city plan after activation', () => {
    const state = createNewGame('rome', 'network-panel', 'small');
    state.cities = { 'city-player': city() };
    state.civilizations.player.cities = ['city-player'];

    expect(getNetworkPanelModel(state, 'player')).toMatchObject({ active: false, candidates: [] });
    state.civilizations.player.techState.completed = ['quantum-computing'];
    const model = getNetworkPanelModel(state, 'player');

    expect(model.statusText).toBe('Network: Stable · 0/2');
    expect(model.candidates.find(candidate => candidate.request.definitionId === 'fabrication-sprint')).toMatchObject({ enabled: true });
    expect(model.candidates.find(candidate => candidate.request.definitionId === 'research-mesh')).toMatchObject({ enabled: false });
  });

  it('renders explicit stable capacity text and invokes the canonical request for a reachable plan', () => {
    const state = createNewGame('rome', 'network-panel-dom', 'small');
    state.cities = { 'city-player': city() };
    state.civilizations.player.cities = ['city-player'];
    state.civilizations.player.techState.completed = ['quantum-computing'];
    const assigned: string[] = [];
    const panel = createNetworkPanel(getNetworkPanelModel(state, 'player'), {
      onAssign: request => assigned.push(request.definitionId), onCancel: () => {}, onSurge: () => {},
      onPosture: () => {}, onClose: () => {},
    });
    document.body.appendChild(panel);

    expect(panel.textContent).toContain('Network: Stable · 0/2');
    const button = Array.from(panel.querySelectorAll('button')).find(candidate => candidate.textContent?.includes('Assign Fabrication Sprint'))!;
    expect(button.disabled).toBe(false);
    button.click();
    expect(assigned).toEqual(['fabrication-sprint']);
  });

  it('shows the shorter Machine Ethics Surge recovery in the player-visible posture summary', () => {
    const state = createNewGame('rome', 'network-panel-machine-ethics', 'small');
    state.cities = { 'city-player': city() };
    state.civilizations.player.cities = ['city-player'];
    state.civilizations.player.techState.completed = ['quantum-computing', 'machine-ethics'];

    expect(getNetworkPanelModel(state, 'player').posture).toBe('Integrated · Surge 1/1');
  });

  it('surfaces the Drone Controller formation plans only when it has friendly military recipients', () => {
    const state = createNewGame('rome', 'network-panel-controller', 'small');
    state.cities = { 'city-player': city() };
    state.civilizations.player.cities = ['city-player'];
    state.civilizations.player.techState.completed = ['quantum-computing'];
    const controller: Unit = {
      id: 'controller', type: 'drone_controller', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    const escort: Unit = { ...controller, id: 'escort', type: 'exosuit_infantry', position: { q: 2, r: 0 } };
    state.units = { controller, escort };
    state.civilizations.player.units = ['controller', 'escort'];

    const model = getNetworkPanelModel(state, 'player');
    expect(model.candidates.map(candidate => candidate.request.definitionId)).toEqual(expect.arrayContaining(['guardian-screen', 'swarm-strike']));
    expect(model.candidates.find(candidate => candidate.request.definitionId === 'guardian-screen')?.request).toMatchObject({
      sourceUnitId: 'controller', target: { kind: 'formation', unitIds: ['escort'] },
    });
  });
});
