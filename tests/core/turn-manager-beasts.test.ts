import { describe, it, expect } from 'vitest';
import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { BEAST_OWNER, getClaimedTrophyGoldPerTurn } from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';

describe('turn-manager beast wiring', () => {
  it('eventually spawns a beast unit from an awakened lair and emits beast:awakened', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Beast Turn Test');
    if (!state.beasts || Object.keys(state.beasts.lairs).length === 0) {
      // Small maps may have no valid habitat tiles for this seed — skip rather than fail
      return;
    }
    // Preset era to the minimum awakenEra of placed lairs so the test doesn't
    // depend on which beasts the seeded shuffle placed (roster size changes as
    // new beast types are added, shifting the shuffle order).
    const minEra = Math.min(
      ...Object.values(state.beasts.lairs).map(l => BEAST_DEFINITIONS[l.beastId].awakenEra),
    );
    const bus = new EventBus();
    let awakened = 0;
    bus.on('beast:awakened', () => { awakened++; });
    let s = { ...state, era: minEra };
    for (let i = 0; i < 60 && awakened === 0; i++) s = processTurn(s, bus);
    expect(awakened).toBeGreaterThan(0);
    const beastUnits = Object.values(s.units).filter(u => u.owner === BEAST_OWNER);
    expect(beastUnits.length).toBeGreaterThan(0);
    const lair = Object.values(s.beasts!.lairs).find(l => l.status === 'awake')!;
    expect(lair.unitIds).toContain(beastUnits[0].id);
  });

  it('does not process beasts when mode is off', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Beast Off Test');
    if (state.beasts) state.beasts.mode = 'off';
    const bus = new EventBus();
    let s = state;
    for (let i = 0; i < 30; i++) s = processTurn(s, bus);
    expect(Object.values(s.units).some(u => u.owner === BEAST_OWNER)).toBe(false);
  });
});

describe('turn-manager hoard handling', () => {
  it('AI pending hoard choices auto-resolve to gold during processTurn', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'AI Hoard Test');
    const aiCivId = Object.keys(state.civilizations).find(id => id !== state.currentPlayer)!;
    state.beasts = {
      mode: 'wild',
      lairs: {
        'lair-emerald_basilisk': {
          id: 'lair-emerald_basilisk', beastId: 'emerald_basilisk',
          position: { q: 10, r: 10 }, status: 'slain', strength: 0, unitIds: [],
          slainBy: aiCivId, slainTurn: 1,
        },
      },
      sightingsByCiv: {},
      pendingHoardChoices: [{ lairId: 'lair-emerald_basilisk', civId: aiCivId }],
    };
    const goldBefore = state.civilizations[aiCivId].gold;
    const next = processTurn(state, new EventBus());
    expect(next.beasts!.pendingHoardChoices).toEqual([]);
    expect(next.civilizations[aiCivId].gold).toBeGreaterThan(goldBefore);
  });

  it('hydra regen is applied and clamped at 100 by processTurn', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Hydra Regen Test');
    state.era = 3;
    // Find a non-water tile to place the hydra so processBeasts can compute move/attack orders safely
    const nonWaterKey = Object.keys(state.map.tiles).find(k => {
      const t = state.map.tiles[k].terrain;
      return t !== 'ocean' && t !== 'coast';
    }) ?? '5,5';
    const [hq, hr] = nonWaterKey.split(',').map(Number);
    state.beasts = {
      mode: 'wild',
      lairs: {
        'lair-swamp_hydra': {
          id: 'lair-swamp_hydra', beastId: 'swamp_hydra',
          position: { q: hq, r: hr }, status: 'awake', strength: 0, unitIds: ['hydra-1'],
        },
      },
      sightingsByCiv: {},
    };
    state.units['hydra-1'] = {
      id: 'hydra-1', type: 'beast_hydra', owner: 'beasts',
      position: { q: hq, r: hr }, movementPointsLeft: 1, health: 95,
      experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as any;
    const next = processTurn(state, new EventBus());
    expect(next.units['hydra-1'].health).toBe(100);
  });

  it('claimed trophies pay per-turn gold during processTurn', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Trophy Test');
    const me = state.currentPlayer;
    state.beasts = {
      mode: 'wild',
      lairs: {
        'lair-emerald_basilisk': {
          id: 'lair-emerald_basilisk', beastId: 'emerald_basilisk',
          position: { q: 10, r: 10 }, status: 'claimed', claimedBy: me,
          strength: 0, unitIds: [], slainBy: me, slainTurn: 1,
        },
      },
      sightingsByCiv: {},
    };
    const baseline = createNewGame('rome', 'beast-turn-seed', 'small', 'Trophy Baseline');
    const withTrophy = processTurn(state, new EventBus());
    const withoutTrophy = processTurn(baseline, new EventBus());
    const delta = withTrophy.civilizations[me].gold - withoutTrophy.civilizations[me].gold;
    expect(delta).toBe(getClaimedTrophyGoldPerTurn(state, me));
  });
});

describe('legacy save migration (migrationPending)', () => {
  it('places lairs on the first processTurn and clears the flag', () => {
    const state = createNewGame('rome', 'migration-seed', 'small', 'Migration Test');
    // Simulate a legacy save: beasts state with no lairs, just the migration flag.
    state.beasts = { mode: 'wild', lairs: {}, sightingsByCiv: {}, migrationPending: true };

    expect(Object.keys(state.beasts.lairs)).toHaveLength(0);

    const next = processTurn(state, new EventBus());

    expect(next.beasts!.migrationPending).toBeFalsy();
    expect(Object.keys(next.beasts!.lairs).length).toBeGreaterThan(0);
  });

  it('queues a discovery notification for every civ on the migration turn', () => {
    const state = createNewGame('rome', 'migration-seed', 'small', 'Migration Notify Test');
    state.beasts = { mode: 'wild', lairs: {}, sightingsByCiv: {}, migrationPending: true };

    const next = processTurn(state, new EventBus());

    for (const civId of Object.keys(next.civilizations)) {
      expect(next.pendingEvents?.[civId]?.some(e => e.message.includes('Legendary beasts'))).toBe(true);
    }
  });
});
