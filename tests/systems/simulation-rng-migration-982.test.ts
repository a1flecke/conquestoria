/**
 * #982 — determinism-matrix regression for the converted simulation RNG call sites.
 *
 * `tests/systems/simulation-rng.test.ts` (#1021) already covers `createSimulationRng`
 * itself in the abstract (the factory's own key-shape and hashing properties). This
 * file instead exercises REAL production call sites converted by #982, proving the
 * actual collision bugs are fixed end-to-end, not just that the factory works in
 * isolation:
 *
 *  - same (gameId, turn, actor/target identity) -> identical draw (reproduction)
 *  - different gameId (different campaign) at the same turn -> different draw
 *    (the exact cross-campaign collision #982's own inventory catalogued)
 *  - different actor/target identity at the same turn -> independent draws
 *    (the exact cross-entity collision #982's own inventory catalogued)
 *  - a save/reload round-trip (plain JSON clone, matching how saves serialize)
 *    reproduces the same subsequent draw, since every input is a persisted field
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { computeCyberDrainRoll } from '@/systems/cyber-warfare-system';
import { resolveMissionResult } from '@/systems/espionage-missions';
import { placeMinorCivs } from '@/systems/minor-civ-system';
import { createSimulationRng, type SimulationDomainKey } from '@/systems/simulation-rng';
import { completeUnitProduction } from '@/systems/unit-production-completion';
import { processDetection } from '@/systems/detection-system';

function makeState(seed: string, turn = 1): GameState {
  const state = createNewGame(undefined, seed, 'small');
  state.turn = turn;
  return state;
}

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

describe('#982 — determinism matrix for converted call sites', () => {
  describe('computeCyberDrainRoll (cyber-warfare-system.ts)', () => {
    it('reproduces identically for the same gameId/turn/city/unit', () => {
      const state = makeState('cyber-a', 5);
      const first = computeCyberDrainRoll(state, 'city-1', 'unit-1');
      const second = computeCyberDrainRoll(state, 'city-1', 'unit-1');
      expect(second).toBe(first);
    });

    it('diverges across two different campaigns at the same turn (the #982 cross-campaign bug)', () => {
      const a = makeState('cyber-campaign-a', 5);
      const b = makeState('cyber-campaign-b', 5);
      expect(computeCyberDrainRoll(a, 'city-1', 'unit-1'))
        .not.toBe(computeCyberDrainRoll(b, 'city-1', 'unit-1'));
    });

    it('gives independent draws to two different city/unit pairs on the same turn (the #982 cross-entity bug)', () => {
      const state = makeState('cyber-b', 5);
      const rolls = new Set([
        computeCyberDrainRoll(state, 'city-1', 'unit-1'),
        computeCyberDrainRoll(state, 'city-1', 'unit-2'),
        computeCyberDrainRoll(state, 'city-2', 'unit-1'),
        computeCyberDrainRoll(state, 'city-2', 'unit-2'),
      ]);
      // Not a strict uniqueness guarantee (floats could coincide in principle), but a
      // shared under-keyed seed made every pair on the pre-#982 formula IDENTICAL --
      // 4 distinct values here is the actual regression signal.
      expect(rolls.size).toBe(4);
    });

    it('reproduces the same draw across a save/reload round trip', () => {
      const state = makeState('cyber-c', 7);
      const before = computeCyberDrainRoll(state, 'city-9', 'unit-9');
      const reloaded = roundTrip(state);
      const after = computeCyberDrainRoll(reloaded, 'city-9', 'unit-9');
      expect(after).toBe(before);
    });
  });

  describe('placeMinorCivs (minor-civ-system.ts)', () => {
    it('reproduces identically for the same gameId', () => {
      const state = makeState('minor-civ-placement-a');
      const first = placeMinorCivs(structuredClone(state), 'small');
      const second = placeMinorCivs(structuredClone(state), 'small');
      expect(Object.keys(first.minorCivs).sort()).toEqual(Object.keys(second.minorCivs).sort());
      expect(Object.values(first.cities).map(c => c.position))
        .toEqual(Object.values(second.cities).map(c => c.position));
    });

    it('diverges across two different campaign seeds (the #982 cross-campaign bug)', () => {
      const a = placeMinorCivs(makeState('minor-civ-campaign-a'), 'small');
      const b = placeMinorCivs(makeState('minor-civ-campaign-b'), 'small');
      // Two independently seeded campaigns landing on the exact same minor-civ
      // roster AND positions would be the signature of a shared, under-keyed seed.
      const same = Object.keys(a.minorCivs).sort().join(',') === Object.keys(b.minorCivs).sort().join(',')
        && Object.values(a.cities).map(c => `${c.position.q},${c.position.r}`).join('|')
          === Object.values(b.cities).map(c => `${c.position.q},${c.position.r}`).join('|');
      expect(same).toBe(false);
    });

    it('reproduces the same placement across a save/reload round trip', () => {
      const state = makeState('minor-civ-reload');
      const before = placeMinorCivs(roundTrip(structuredClone(state)), 'small');
      const after = placeMinorCivs(roundTrip(structuredClone(state)), 'small');
      expect(Object.values(before.cities).map(c => c.position))
        .toEqual(Object.values(after.cities).map(c => c.position));
    });
  });

  describe('createSimulationRng wiring shape (spot-checks the domain keys #982 introduced)', () => {
    const cases: Array<{ label: string } & SimulationDomainKey> = [
      { label: 'crisis-flavor-select', domain: 'crisis-flavor-select', actorId: 'civ-1' },
      { label: 'crisis-spread', domain: 'crisis-spread', eventId: 'crisis-1', targetId: 'city-1' },
      { label: 'religion-founding', domain: 'religion-founding', actorId: 'civ-1' },
      { label: 'threat-pressure-land-spawn', domain: 'threat-pressure-land-spawn', actorId: 'civ-1', targetId: 'landmass-1' },
      { label: 'threat-pressure-pirate-spawn', domain: 'threat-pressure-pirate-spawn', actorId: 'civ-1', targetId: 'landmass-1' },
      { label: 'city-counter-fire', domain: 'city-counter-fire', actorId: 'unit-1', targetId: 'city-1' },
      { label: 'city-assault-counter-fire', domain: 'city-assault-counter-fire', actorId: 'unit-1', targetId: 'city-1' },
      { label: 'city-assault-resolve', domain: 'city-assault-resolve', actorId: 'unit-1', targetId: 'city-1' },
      { label: 'village-visit', domain: 'village-visit', actorId: 'unit-1', targetId: 'village-1' },
      { label: 'minor-civ-quest-generate', domain: 'minor-civ-quest-generate', actorId: 'civ-1', targetId: 'mc-1' },
      { label: 'minor-civ-scuffle-trigger', domain: 'minor-civ-scuffle-trigger', actorId: 'mc-1' },
      { label: 'marketplace-fashion-cycle', domain: 'marketplace-fashion-cycle', eventId: 'fashion-cycle' },
      { label: 'beast-tick', domain: 'beast-tick', eventId: 'beast-tick' },
      { label: 'barbarian-tick', domain: 'barbarian-tick', eventId: 'barbarian-tick' },
      { label: 'ai-strategic-launch', domain: 'ai-strategic-launch', actorId: 'ai-1' },
      { label: 'ai-capture', domain: 'ai-capture', actorId: 'ai-1' },
      { label: 'wonder-eruption', domain: 'wonder-eruption', eventId: 'wonders-market' },
      { label: 'spy-detection', domain: 'spy-detection', eventId: 'detection-turn' },
      { label: 'espionage-steal-tech', domain: 'espionage-steal-tech', actorId: 'spy-1', targetId: 'ai-1/city-1' },
      { label: 'espionage-sabotage-production', domain: 'espionage-sabotage-production', actorId: 'spy-1', targetId: 'city-1' },
      { label: 'espionage-assassinate-advisor', domain: 'espionage-assassinate-advisor', actorId: 'spy-1', targetId: 'ai-1' },
      { label: 'espionage-forge-documents', domain: 'espionage-forge-documents', actorId: 'spy-1', targetId: 'ai-1' },
      { label: 'espionage-arms-smuggling', domain: 'espionage-arms-smuggling', actorId: 'spy-1', targetId: 'city-1' },
      { label: 'sabotage-relief-detect', domain: 'sabotage-relief-detect', actorId: 'spy-1', eventId: 'crisis-1' },
      { label: 'spy-passive-detect', domain: 'spy-passive-detect', actorId: 'player' },
      { label: 'revolt-spawn', domain: 'revolt-spawn', targetId: 'city-1' },
    ];

    for (const { label, ...key } of cases) {
      it(`${label}: same inputs reproduce, different gameId diverges, different actor/target diverges`, () => {
        const a = makeState(`wiring-${label}-a`, 12);
        const b = makeState(`wiring-${label}-b`, 12);

        expect(createSimulationRng(a, key)()).toBe(createSimulationRng(a, key)());
        expect(createSimulationRng(a, key)()).not.toBe(createSimulationRng(b, key)());

        if (key.actorId) {
          const otherActor = { ...key, actorId: `${key.actorId}-other` };
          expect(createSimulationRng(a, key)()).not.toBe(createSimulationRng(a, otherActor)());
        }
        if (key.targetId) {
          const otherTarget = { ...key, targetId: `${key.targetId}-other` };
          expect(createSimulationRng(a, key)()).not.toBe(createSimulationRng(a, otherTarget)());
        }
      });
    }
  });

  describe('#1830 — espionage, detection, and spy recruitment diverge across gameIds at the same turn', () => {
    it('resolveMissionResult (assassinate_advisor) reproduces per gameId and diverges across campaigns', () => {
      const base = makeState('esp-assassin-base', 10);
      const first = resolveMissionResult('assassinate_advisor', 'ai-1', 'city-1', base, 'player', 'spy-1');
      const repeat = resolveMissionResult('assassinate_advisor', 'ai-1', 'city-1', base, 'player', 'spy-1');
      expect(repeat).toEqual(first);

      const distinctAdvisors = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const variant = { ...base, gameId: `campaign-assassin-${i}` };
        const res = resolveMissionResult('assassinate_advisor', 'ai-1', 'city-1', variant, 'player', 'spy-1');
        if (res.assassinatedAdvisor) distinctAdvisors.add(res.assassinatedAdvisor);
      }
      expect(distinctAdvisors.size).toBeGreaterThan(1);
    });

    it('resolveMissionResult (steal_tech) diverges across campaigns with identical tech lists', () => {
      const base = makeState('esp-steal-base', 10);
      base.civilizations['ai-1'].techState.completed = [
        'writing', 'archery', 'currency', 'engineering', 'philosophy', 'astronomy',
      ];
      base.civilizations.player.techState.completed = [];

      const distinctTechs = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const variant = { ...base, gameId: `campaign-steal-${i}` };
        const res = resolveMissionResult('steal_tech', 'ai-1', 'city-1', variant, 'player', 'spy-1');
        if (res.stolenTechId) distinctTechs.add(res.stolenTechId);
      }
      expect(distinctTechs.size).toBeGreaterThan(1);
    });

    it('completeUnitProduction gives spies campaign-keyed names rather than identical names per turn', () => {
      const base = makeState('spy-name-base', 6);
      const pos = base.units[base.civilizations.player.units[0]!]!.position;
      base.units = {};
      base.civilizations.player.units = [];
      const cap = foundCity('player', pos, base.map, base.idCounters);
      base.cities[cap.id] = cap;
      base.civilizations.player.cities = [cap.id];

      const names = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const variant = structuredClone(base);
        variant.gameId = `campaign-spy-${i}`;
        const result = completeUnitProduction(variant, {
          civId: 'player',
          cityId: cap.id,
          unitType: 'spy_scout',
        });
        expect(result.ok).toBe(true);
        if (result.ok && result.spy) names.add(result.spy.name);
      }
      expect(names.size).toBeGreaterThan(1);
    });

    it('processDetection varies detection outcomes across campaigns at the same turn', () => {
      const base = makeState('detect-base', 8);
      const tile = Object.values(base.map.tiles).find(t => t.terrain === 'plains' || t.terrain === 'grassland')!;
      const pos = tile.coord;
      base.units = {
        'spy-1': {
          id: 'spy-1',
          type: 'spy_scout',
          owner: 'player',
          position: pos,
          health: 100,
          movementPointsLeft: 2,
          hasMoved: false,
          hasActed: false,
          isResting: false,
          experience: 0,
        },
        'hound-1': {
          id: 'hound-1',
          type: 'scout_hound',
          owner: 'ai-1',
          position: pos,
          health: 100,
          movementPointsLeft: 2,
          hasMoved: false,
          hasActed: false,
          isResting: false,
          experience: 0,
        },
      };
      base.espionage = {
        ...base.espionage,
        player: {
          ...base.espionage!.player,
          spies: {
            'spy-1': {
              id: 'spy-1',
              owner: 'player',
              name: 'Agent Test',
              unitType: 'spy_scout',
              targetCivId: null,
              targetCityId: null,
              status: 'idle',
              position: pos,
              currentMission: null,
              experience: 0,
              promotion: undefined,
              promotionAvailable: false,
              cooldownTurns: 0,
            },
          },
        },
        'ai-1': {
          ...base.espionage!['ai-1'],
          recentDetections: [],
        },
      };

      const outcomes = new Set<number>();
      for (let i = 0; i < 30; i++) {
        const variant = { ...base, gameId: `campaign-detect-${i}` };
        const next = processDetection(variant, new EventBus());
        outcomes.add(next.espionage!['ai-1'].recentDetections?.length ?? 0);
      }
      expect(outcomes.size).toBe(2);
    });
  });
});
