import { describe, it, expect } from 'vitest';
import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { BEAST_OWNER, getClaimedTrophyGoldPerTurn } from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { foundCity } from '@/systems/city-system';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';
import { simTimeout } from '../helpers/sim-timeout';
import { assertBeastLairIntegrity } from '../helpers/save-state-invariants';

function completedTechsForEra(era: number): string[] {
  return Array.from({ length: Math.max(0, era - 1) }, (_, index) => index + 2)
    .flatMap(candidate => {
      const techs = getEraAdvancementTechs(candidate);
      const required = Math.ceil(techs.length * (candidate <= 3 ? 0.5 : candidate <= 8 ? 0.6 : 0.55));
      return techs.slice(0, required).map(tech => tech.id);
    });
}

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
    const localLair = Object.values(state.beasts.lairs)[0]!;
    const city = foundCity('player', localLair.position, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations.player.cities = [city.id];
    state.civilizations.player.techState.completed = completedTechsForEra(minEra);
    let s = { ...state, era: minEra };
    for (let i = 0; i < 60 && awakened === 0; i++) s = processTurn(s, bus);
    expect(awakened).toBeGreaterThan(0);
    const beastUnits = Object.values(s.units).filter(u => u.owner === BEAST_OWNER);
    expect(beastUnits.length).toBeGreaterThan(0);
    const lair = Object.values(s.beasts!.lairs).find(l => l.status === 'awake')!;
    expect(lair.unitIds).toContain(beastUnits[0].id);
  }, simTimeout(2500));

  it('does not process beasts when mode is off', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Beast Off Test');
    if (state.beasts) state.beasts.mode = 'off';
    const bus = new EventBus();
    let s = state;
    for (let i = 0; i < 30; i++) s = processTurn(s, bus);
    expect(Object.values(s.units).some(u => u.owner === BEAST_OWNER)).toBe(false);
  }, simTimeout(600));
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

  // A human's unit can slay a beast outside that human's turn (defending in the beasts phase). The round
  // used to settle every choice but the current player's as gold, so in hot seat that human was told
  // "Choose your reward" and then had the choice taken away before their turn came.
  it('leaves a human\'s hoard choice for that human, even when another seat is current', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Human Hoard Test');
    const otherHumanId = Object.keys(state.civilizations).find(id => id !== state.currentPlayer)!;
    state.civilizations[otherHumanId].isHuman = true;
    state.beasts = {
      mode: 'wild',
      lairs: {
        'lair-emerald_basilisk': {
          id: 'lair-emerald_basilisk', beastId: 'emerald_basilisk',
          position: { q: 10, r: 10 }, status: 'slain', strength: 0, unitIds: [],
          slainBy: otherHumanId, slainTurn: 1,
        },
      },
      sightingsByCiv: {},
      pendingHoardChoices: [{ lairId: 'lair-emerald_basilisk', civId: otherHumanId }],
    };
    const next = processTurn(state, new EventBus());

    expect(next.beasts!.pendingHoardChoices).toEqual([{ lairId: 'lair-emerald_basilisk', civId: otherHumanId }]);
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
    // This test is purely about regen math, not combat — clear the rest of the
    // world's units so no civ/minor-civ unit the map seed happens to place
    // within the hydra's leash radius can trigger an unrelated attack (and
    // counter-damage) this turn. #982 changed minor-civ placement to be
    // gameId-rooted instead of an under-keyed shared seed, which legitimately
    // relocates where units start; this test was never meant to depend on that.
    state.units = {};
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

  it.each([
    ['missing', 'AI'],
    ['claimed', 'AI'],
    ['missing', 'human'],
    ['claimed', 'human'],
  ] as const)('discards a %s lair choice for a %s without paying it', (invalidLair, actor) => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Stale Hoard Test');
    const humanId = state.currentPlayer;
    const aiCivId = Object.keys(state.civilizations).find(id => !state.civilizations[id].isHuman)!;
    const staleCivId = actor === 'human' ? humanId : aiCivId;
    const validLairId = 'lair-emerald_basilisk';
    const staleLairId = 'stale-basilisk-lair';
    const validChoice = { lairId: validLairId, civId: humanId };
    const staleChoice = { lairId: staleLairId, civId: staleCivId };
    state.beasts = {
      mode: 'wild',
      lairs: {
        [validLairId]: {
          id: validLairId, beastId: 'emerald_basilisk', position: { q: 10, r: 10 },
          status: 'slain', strength: 0, unitIds: [], slainBy: humanId, slainTurn: 1,
        },
      },
      sightingsByCiv: {},
      pendingHoardChoices: [validChoice],
    };
    if (invalidLair === 'claimed') {
      state.beasts.lairs[staleLairId] = {
        ...state.beasts.lairs[validLairId], id: staleLairId, position: { q: 11, r: 10 },
        status: 'claimed', claimedBy: humanId,
      };
    }
    expect(state.civilizations[staleCivId]?.isHuman).toBe(actor === 'human');
    expect(state.beasts.lairs[staleLairId]?.status).toBe(invalidLair === 'claimed' ? 'claimed' : undefined);
    const baseline = structuredClone(state);
    state.beasts.pendingHoardChoices = [staleChoice, validChoice];
    expect(() => assertBeastLairIntegrity(state)).toThrow(/beast-lair-integrity/);

    const next = processTurn(state, new EventBus());
    const expected = processTurn(baseline, new EventBus());

    expect(next.turn).toBe(state.turn + 1);
    expect(next.civilizations[staleCivId].gold).toBe(expected.civilizations[staleCivId].gold);
    expect(next.beasts?.pendingHoardChoices).toEqual([validChoice]);
    expect(next.beasts?.lairs[staleLairId]).toEqual(expected.beasts?.lairs[staleLairId]);
    assertBeastLairIntegrity(next);
  });

  it('discards an AI hoard choice when hunt cleanup removes its lair in the same round', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Hunt Hoard Test');
    const aiCivId = Object.keys(state.civilizations).find(id => !state.civilizations[id].isHuman)!;
    const crisisId = 'crisis-1791';
    const lairId = 'hunt-lair-crisis-1791';
    const huntEntityId = 'hunt-beast-1791';
    state.beasts = {
      mode: 'wild',
      lairs: {
        [lairId]: {
          id: lairId, beastId: 'emerald_basilisk', position: { q: 10, r: 10 },
          status: 'slain', strength: 0, unitIds: [], slainBy: aiCivId, slainTurn: state.turn,
        },
      },
      sightingsByCiv: {},
      pendingHoardChoices: [{ lairId, civId: aiCivId }],
    };
    state.activeCrises = {
      [crisisId]: {
        id: crisisId, flavorId: 'beast-awakening', archetype: 'hunt',
        targetCivId: state.currentPlayer, cityIds: [], tileKeys: [],
        startedTurn: state.turn, stage: 'menacing', turnsInStage: 0,
        huntEntityId, lastHuntKillerCivId: aiCivId,
      },
    };
    expect(state.civilizations[aiCivId]?.isHuman).toBe(false);
    expect(state.units[huntEntityId]).toBeUndefined();
    assertBeastLairIntegrity(state);

    const next = processTurn(state, new EventBus());

    expect(next.turn).toBe(state.turn + 1);
    expect(next.activeCrises?.[crisisId]).toBeUndefined();
    expect(next.beasts?.lairs[lairId]).toBeUndefined();
    expect(next.beasts?.pendingHoardChoices).toEqual([]);
    assertBeastLairIntegrity(next);
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
