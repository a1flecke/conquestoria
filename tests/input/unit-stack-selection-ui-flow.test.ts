// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { handleFriendlyUnitStackTap } from '@/input/unit-stack-selection';
import { renderSelectedUnitInfo } from '@/ui/selected-unit-info';
import { renderUnitStackPanel } from '@/ui/unit-stack-panel';

function unit(id: string, type: Unit['type']): Unit {
  return {
    id,
    type,
    owner: 'player',
    position: { q: 2, r: 1 },
    movementPointsLeft: 2,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
}

function stackedState(): GameState {
  return {
    currentPlayer: 'player',
    turn: 1,
    era: 1,
    map: {
      width: 10,
      height: 10,
      wrapsHorizontally: false,
      rivers: [],
      tiles: { '2,1': { coord: { q: 2, r: 1 }, terrain: 'plains', resources: [], visible: true, explored: true } },
    },
    units: {
      warrior: unit('warrior', 'warrior'),
      worker: unit('worker', 'worker'),
    },
    cities: {},
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        units: ['warrior', 'worker'],
        cities: [],
        techState: { completed: [] },
      },
    },
  } as unknown as GameState;
}

describe('unit stack selection live UI flow', () => {
  it('opens the stack picker from a friendly stack tap and updates selected unit info after row click', () => {
    const state = stackedState();
    const stackPanel = document.createElement('div');
    const infoPanel = document.createElement('div');
    let selectedUnitId = 'warrior';

    const selectUnit = (unitId: string) => {
      selectedUnitId = unitId;
      renderSelectedUnitInfo(infoPanel, state, selectedUnitId, {
        onOpenStack: coord => {
          handleFriendlyUnitStackTap(state, coord, selectedUnitId, {
            onSelectUnit: selectUnit,
            onOpenStackPicker: (pickerCoord, unitIds) => {
              renderUnitStackPanel(stackPanel, state, pickerCoord, unitIds, {
                onSelectUnit: selectUnit,
              }, { selectedUnitId });
            },
          });
        },
      });
    };

    selectUnit(selectedUnitId);

    const handled = handleFriendlyUnitStackTap(state, { q: 2, r: 1 }, selectedUnitId, {
      onSelectUnit: selectUnit,
      onOpenStackPicker: (coord, unitIds) => {
        renderUnitStackPanel(stackPanel, state, coord, unitIds, {
          onSelectUnit: selectUnit,
        }, { selectedUnitId });
      },
    });

    expect(handled).toBe(true);
    expect(stackPanel.textContent).toContain('2 units at 2,1');

    (stackPanel.querySelector('[data-unit-id="worker"]') as HTMLButtonElement).click();

    expect(selectedUnitId).toBe('worker');
    expect(infoPanel.textContent).toContain('Worker');
    expect(infoPanel.textContent).toContain('Stack: 2 units here');
  });
});
