import { EventBus } from '@/core/event-bus';
import type { GameEvents } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import { abandonWorkerTask, executeUnitMove } from '@/systems/unit-movement-system';
import { makeAutoExploreFixture } from './helpers/auto-explore-fixture';
import { makeEdgeMoveState } from './unit-movement-system.test-helpers';

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

  it('emits first-contact when movement reveals a new civilization', () => {
    const { state, unitId, hiddenCivId } = makeAutoExploreFixture({ foreignBorderNorth: true, safeFogNorth: true });
    state.civilizations.traders.knownCivilizations = [];
    const bus = new EventBus();
    const contacts: Array<{ civA: string; civB: string }> = [];
    bus.on('civilization:first-contact', event => contacts.push(event));

    executeUnitMove(state, unitId, { q: 1, r: 0 }, {
      actor: 'player',
      civId: 'player',
      bus,
    });

    expect(contacts).toEqual([{ civA: 'player', civB: hiddenCivId }]);
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

  it('emits wonder discovery with the revealed event coordinate for presentation wiring', () => {
    const { state, unitId } = makeAutoExploreFixture({ wonderNorth: 'grand_canyon', safeFogNorth: true });
    const target = { q: 1, r: 0 };
    const bus = new EventBus();
    const events: Array<GameEvents['wonder:discovered']> = [];
    bus.on('wonder:discovered', event => events.push(event));

    executeUnitMove(state, unitId, target, {
      actor: 'player',
      civId: 'player',
      bus,
    });

    expect(events).toContainEqual(expect.objectContaining({
      civId: 'player',
      wonderId: 'grand_canyon',
      position: target,
    }));
  });

  it('returns canonical wrapped revealed tiles after moving through the seam', () => {
    const { state, unitId } = makeEdgeMoveState();
    const bus = new EventBus();
    const fogRevealed = vi.fn();
    bus.on('fog:revealed', fogRevealed);

    const result = executeUnitMove(state, unitId, { q: 4, r: 1 }, {
      actor: 'player',
      civId: 'player',
      bus,
    });
    const revealedKeys = result.revealedTiles.map(hexKey);

    expect(result.to).toEqual({ q: 4, r: 1 });
    expect(revealedKeys).toContain('0,1');
    expect(revealedKeys.some(key => Number(key.split(',')[0]) < 0 || Number(key.split(',')[0]) >= state.map.width)).toBe(false);
    expect(getVisibility(state.civilizations.player.visibility, { q: 0, r: 1 })).toBe('visible');
    expect(fogRevealed).toHaveBeenCalledWith(expect.objectContaining({
      tiles: expect.arrayContaining([{ q: 0, r: 1 }]),
    }));
  });

  it('can abandon a busy worker task before moving', () => {
    const { state, unitId } = makeEdgeMoveState();
    state.units[unitId] = {
      ...state.units[unitId],
      type: 'worker',
      workerTask: { action: 'farm', coord: { q: 0, r: 1 } },
    };
    state.map.tiles['0,1'].improvement = 'farm';
    state.map.tiles['0,1'].improvementTurnsLeft = 3;

    abandonWorkerTask(state, unitId);

    expect(state.units[unitId].workerTask).toBeUndefined();
    expect(state.map.tiles['0,1']).toMatchObject({ improvement: 'none', improvementTurnsLeft: 0 });
  });
});
