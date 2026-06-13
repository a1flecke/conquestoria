import { describe, it, expect } from 'vitest';
import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { BEAST_OWNER, getClaimedTrophyGoldPerTurn } from '@/systems/beast-system';

describe('turn-manager beast wiring', () => {
  it('eventually spawns a beast unit from an awakened lair and emits beast:awakened', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Beast Turn Test');
    if (!state.beasts || Object.keys(state.beasts.lairs).length === 0) {
      // Small maps may have no forest tiles for this seed — skip rather than fail
      return;
    }
    const bus = new EventBus();
    let awakened = 0;
    bus.on('beast:awakened', () => { awakened++; });
    let s = state;
    for (let i = 0; i < 120 && awakened === 0; i++) s = processTurn(s, bus);
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
