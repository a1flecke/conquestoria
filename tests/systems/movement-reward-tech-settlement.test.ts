import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { makeAutoExploreFixture } from './helpers/auto-explore-fixture';

// The village's reward is a seeded roll; this pins the executor's contract, not the roll: whatever tech a
// village (or a first natural-wonder discovery) completes during a move is announced and settled.
vi.mock('@/systems/village-system', async importOriginal => {
  const actual = await importOriginal<typeof import('@/systems/village-system')>();
  return {
    ...actual,
    visitVillage: (state: Parameters<typeof actual.visitVillage>[0], villageId: string, unit: Parameters<typeof actual.visitVillage>[2]) => {
      delete state.tribalVillages[villageId];
      const techState = state.civilizations[unit.owner]!.techState;
      techState.completed = [...techState.completed, 'gathering'];
      return { outcome: 'free_tech' as const, message: 'The villagers taught us Gathering!' };
    },
  };
});

describe('a tech a move completes is settled like a researched one', () => {
  it('a village that teaches a tech announces it', () => {
    const { state, unitId } = makeAutoExploreFixture({ villageNorth: true, safeFogNorth: true });
    state.civilizations.player.techState.completed = state.civilizations.player.techState.completed.filter(id => id !== 'gathering');
    const bus = new EventBus();
    const completed: string[] = [];
    bus.on('tech:completed', ({ civId, techId }) => { if (civId === 'player') completed.push(techId); });

    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, { actor: 'player', civId: 'player', bus });

    expect(result.ok).toBe(true);
    expect(completed).toEqual(['gathering']);
  });
});
