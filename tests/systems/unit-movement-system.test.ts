import { EventBus } from '@/core/event-bus';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { makeAutoExploreFixture } from './helpers/auto-explore-fixture';

describe('unit-movement-system', () => {
  it('applies village rewards and removes the village when automation enters it', () => {
    const { state, unitId, villageId } = makeAutoExploreFixture({ villageNorth: true, safeFogNorth: true });

    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, {
      actor: 'automation',
      civId: 'player',
      bus: new EventBus(),
    });

    expect(result.villageOutcome?.outcome).toBeDefined();
    expect(villageId).toBeDefined();
    expect(state.tribalVillages[villageId!]).toBeUndefined();
  });

  it('refreshes visibility and civilization contacts after an automated move', () => {
    const { state, unitId, hiddenCivId } = makeAutoExploreFixture({ foreignBorderNorth: true, safeFogNorth: true });

    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, {
      actor: 'automation',
      civId: 'player',
      bus: new EventBus(),
    });

    expect(result.revealedTiles.length).toBeGreaterThan(0);
    expect(state.civilizations.player.knownCivilizations).toContain(hiddenCivId);
  });

  it('emits wonder discovery metadata when automation reveals a wonder tile', () => {
    const { state, unitId } = makeAutoExploreFixture({ wonderNorth: 'grand_canyon', safeFogNorth: true });

    const result = executeUnitMove(state, unitId, { q: 1, r: 0 }, {
      actor: 'automation',
      civId: 'player',
      bus: new EventBus(),
    });

    expect(result.discoveredWonders).toEqual([
      expect.objectContaining({ wonderId: 'grand_canyon' }),
    ]);
  });
});
