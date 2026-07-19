import { describe, expect, it, vi } from 'vitest';
import type { GameEvents, GameState } from '@/core/types';
import { handleCombatResolvedEvent } from '@/ui/combat-resolved-presentation';

function makeState(): GameState {
  return {
    currentPlayer: 'defender',
    turn: 4,
    civilizations: {
      attacker: { id: 'attacker', name: 'Rome' },
      defender: { id: 'defender', name: 'Egypt' },
    },
    units: {},
  } as unknown as GameState;
}

function makeEvent(): GameEvents['combat:resolved'] {
  return {
    result: {
      attackerId: 'attacker-unit',
      defenderId: 'destroyed-unit',
      attackerDamage: 5,
      defenderDamage: 100,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerStrength: 20,
      defenderStrength: 20,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    },
    visibleToViewerIds: ['defender'],
    attackerType: 'warrior',
    defenderType: 'archer',
    attackerOwnerId: 'attacker',
    defenderOwnerId: 'defender',
  };
}

describe('combat resolved presentation', () => {
  it('keeps the defender report while suppressing hidden-round visuals', () => {
    const applyVisual = vi.fn();
    const appendNotification = vi.fn();

    handleCombatResolvedEvent(makeState(), makeEvent(), {
      isPresentationSuppressed: () => true,
      applyVisual,
      appendNotification,
    });

    expect(applyVisual).not.toHaveBeenCalled();
    expect(appendNotification).toHaveBeenCalledWith(
      'defender',
      'Archer was destroyed by Rome!',
      'warning',
    );
  });
});
