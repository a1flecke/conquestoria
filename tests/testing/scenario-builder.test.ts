import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/testing/scenario-builder';
import { ScenarioError, type ScenarioDefinition, type ScenarioStep } from '@/testing/scenario-types';
import { hexKey } from '@/systems/hex-utils';
import { getBlockingMapEntityAt, getMovementRangeDetails } from '@/systems/unit-system';

// playthroughId is deliberately unique per build (see GameState field docs in
// core/types.ts -- it disambiguates separate playthroughs sharing the same
// seed for save-slot bookkeeping) and so must stay excluded here. gameId is
// no longer excluded: it's now a pure function of the seed string, so two
// buildScenario calls with the same seed must produce the same gameId too --
// asserted directly below as a determinism regression, not just tolerated.
function withoutPlaythroughId(state: ReturnType<typeof buildScenario>) {
  const { playthroughId, ...rest } = state;
  return rest;
}

const soloBase: ScenarioDefinition['base'] = {
  kind: 'solo',
  config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'Determinism Check' },
};

describe('buildScenario', () => {
  it('is deterministic for a given seed (excluding playthroughId)', () => {
    const definition: ScenarioDefinition = {
      name: 'determinism-check',
      description: 'test only',
      seed: 'scenario-determinism-check',
      base: soloBase,
      steps: [],
    };
    const first = buildScenario(definition);
    const second = buildScenario(definition);
    expect(withoutPlaythroughId(first)).toEqual(withoutPlaythroughId(second));
    expect(first.gameId).toBe(second.gameId);
  });

  it('derives everything not named in base/steps from createNewGame', () => {
    const definition: ScenarioDefinition = {
      name: 'base-only',
      description: 'test only',
      seed: 'scenario-base-only',
      base: soloBase,
      steps: [],
    };
    const state = buildScenario(definition);
    expect(Object.keys(state.civilizations)).toEqual(['player', 'ai-1']);
    expect(state.civilizations.player.units.length).toBeGreaterThan(0);
    expect(state.map.tiles).toBeDefined();
  });
});

describe('unit step', () => {
  it('places a canonical unit via createUnit, then layers overrides on top', () => {
    const definition: ScenarioDefinition = {
      name: 'unit-step-check',
      description: 'test only',
      seed: 'scenario-unit-step-check',
      base: soloBase,
      steps: [
        { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
        { kind: 'unit', civId: 'player', type: 'scout', position: { q: 0, r: 0 }, overrides: { health: 40 } },
      ],
    };
    const state = buildScenario(definition);
    const scout = Object.values(state.units).find(u => u.type === 'scout' && u.owner === 'player');
    expect(scout).toBeDefined();
    expect(scout!.movementPointsLeft).toBe(3); // UNIT_DEFINITIONS.scout.movementPoints -- proves createUnit ran
    expect(scout!.health).toBe(40); // proves the override layered on top
    expect(state.civilizations.player.units).toContain(scout!.id);
  });

  it('works identically for an AI-owned civId', () => {
    const definition: ScenarioDefinition = {
      name: 'unit-step-ai-check',
      description: 'test only',
      seed: 'scenario-unit-step-ai-check',
      base: soloBase,
      steps: [
        { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
        { kind: 'unit', civId: 'ai-1', type: 'warrior', position: { q: 0, r: 0 } },
      ],
    };
    const state = buildScenario(definition);
    const warrior = Object.values(state.units).find(u => u.type === 'warrior' && u.owner === 'ai-1');
    expect(warrior).toBeDefined();
    expect(state.civilizations['ai-1'].units).toContain(warrior!.id);
  });

  it('throws ScenarioError on an invalid coordinate', () => {
    const definition: ScenarioDefinition = {
      name: 'unit-step-bad-coord',
      description: 'test only',
      seed: 'scenario-unit-step-bad-coord',
      base: soloBase,
      steps: [{ kind: 'unit', civId: 'player', type: 'scout', position: { q: 99999, r: 99999 } }],
    };
    expect(() => buildScenario(definition)).toThrow(ScenarioError);
  });

  it('throws ScenarioError on an unknown civId', () => {
    const definition: ScenarioDefinition = {
      name: 'unit-step-bad-civ',
      description: 'test only',
      seed: 'scenario-unit-step-bad-civ',
      base: soloBase,
      steps: [
        { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
        { kind: 'unit', civId: 'nonexistent', type: 'scout', position: { q: 0, r: 0 } },
      ],
    };
    expect(() => buildScenario(definition)).toThrow(ScenarioError);
  });

  it('rejects placing a unit on an already-occupied tile unless unsafe: true', () => {
    const stepsBase: ScenarioStep[] = [
      { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
      { kind: 'unit', civId: 'player', type: 'scout', position: { q: 0, r: 0 } },
      { kind: 'unit', civId: 'ai-1', type: 'warrior', position: { q: 0, r: 0 } },
    ];
    const blocked: ScenarioDefinition = {
      name: 'unit-step-occupied', description: 'test only', seed: 'scenario-unit-step-occupied',
      base: soloBase, steps: stepsBase,
    };
    expect(() => buildScenario(blocked)).toThrow(ScenarioError);

    const allowed: ScenarioDefinition = {
      ...blocked,
      name: 'unit-step-occupied-unsafe',
      steps: [...stepsBase.slice(0, 2), { ...stepsBase[2], unsafe: true } as ScenarioStep],
    };
    expect(() => buildScenario(allowed)).not.toThrow();
  });
});

describe('city step', () => {
  it('founds a canonical city via foundCity and claims nearby territory', () => {
    const definition: ScenarioDefinition = {
      name: 'city-step-check',
      description: 'test only',
      seed: 'scenario-city-step-check',
      base: soloBase,
      steps: [
        { kind: 'terrain', position: { q: 2, r: 0 }, terrain: 'plains' },
        { kind: 'terrain', position: { q: 1, r: 0 }, terrain: 'plains' },
        { kind: 'city', civId: 'ai-1', position: { q: 2, r: 0 } },
      ],
    };
    const state = buildScenario(definition);
    const city = Object.values(state.cities).find(c => hexKey(c.position) === hexKey({ q: 2, r: 0 }));
    expect(city).toBeDefined();
    expect(city!.owner).toBe('ai-1');
    expect(city!.name.length).toBeGreaterThan(0); // proves foundCity's naming ran, not a hand literal
    expect(state.civilizations['ai-1'].cities).toContain(city!.id);
    // city has no garrison unit
    expect(Object.values(state.units).some(u => hexKey(u.position) === hexKey(city!.position))).toBe(false);
    expect(state.map.tiles[hexKey({ q: 1, r: 0 })].owner).toBe('ai-1'); // territory recalculated
  });

  it('rejects founding on an already-occupied tile unless unsafe: true', () => {
    const steps: ScenarioStep[] = [
      { kind: 'terrain', position: { q: 2, r: 0 }, terrain: 'plains' },
      { kind: 'city', civId: 'ai-1', position: { q: 2, r: 0 } },
      { kind: 'city', civId: 'player', position: { q: 2, r: 0 } },
    ];
    const blocked: ScenarioDefinition = {
      name: 'city-step-occupied', description: 'test only', seed: 'scenario-city-step-occupied',
      base: soloBase, steps,
    };
    expect(() => buildScenario(blocked)).toThrow(ScenarioError);
  });

  it('throws ScenarioError on an invalid coordinate', () => {
    const definition: ScenarioDefinition = {
      name: 'city-step-bad-coord',
      description: 'test only',
      seed: 'scenario-city-step-bad-coord',
      base: soloBase,
      steps: [{ kind: 'city', civId: 'ai-1', position: { q: 99999, r: 99999 } }],
    };
    expect(() => buildScenario(definition)).toThrow(ScenarioError);
  });

  it('throws ScenarioError on an unknown civId', () => {
    const definition: ScenarioDefinition = {
      name: 'city-step-bad-civ',
      description: 'test only',
      seed: 'scenario-city-step-bad-civ',
      base: soloBase,
      steps: [
        { kind: 'terrain', position: { q: 2, r: 0 }, terrain: 'plains' },
        { kind: 'city', civId: 'nonexistent', position: { q: 2, r: 0 } },
      ],
    };
    expect(() => buildScenario(definition)).toThrow(ScenarioError);
  });
});

describe('camp step', () => {
  it('places a barbarian camp that getBlockingMapEntityAt recognizes', () => {
    const definition: ScenarioDefinition = {
      name: 'camp-step-check',
      description: 'test only',
      seed: 'scenario-camp-step-check',
      base: soloBase,
      steps: [
        { kind: 'terrain', position: { q: 5, r: 5 }, terrain: 'plains' },
        { kind: 'terrain', position: { q: 6, r: 5 }, terrain: 'plains' },
        { kind: 'unit', civId: 'player', type: 'warrior', position: { q: 5, r: 5 } },
        { kind: 'camp', position: { q: 6, r: 5 } },
      ],
    };
    const state = buildScenario(definition);
    const camp = Object.values(state.barbarianCamps).find(c => hexKey(c.position) === hexKey({ q: 6, r: 5 }));
    expect(camp).toBeDefined();
    const mover = Object.values(state.units).find(u => u.owner === 'player');
    const blocking = getBlockingMapEntityAt(state, mover!, { q: 6, r: 5 });
    expect(blocking).toEqual({ reason: 'barbarian-camp', entityId: camp!.id });
  });

  it('throws ScenarioError on an invalid coordinate', () => {
    const definition: ScenarioDefinition = {
      name: 'camp-step-bad-coord',
      description: 'test only',
      seed: 'scenario-camp-step-bad-coord',
      base: soloBase,
      steps: [{ kind: 'camp', position: { q: 99999, r: 99999 } }],
    };
    expect(() => buildScenario(definition)).toThrow(ScenarioError);
  });

  it('rejects placing a camp on an already-occupied tile unless unsafe: true', () => {
    const stepsBase: ScenarioStep[] = [
      { kind: 'terrain', position: { q: 6, r: 5 }, terrain: 'plains' },
      { kind: 'camp', position: { q: 6, r: 5 } },
      { kind: 'camp', position: { q: 6, r: 5 } },
    ];
    const blocked: ScenarioDefinition = {
      name: 'camp-step-occupied', description: 'test only', seed: 'scenario-camp-step-occupied',
      base: soloBase, steps: stepsBase,
    };
    expect(() => buildScenario(blocked)).toThrow(ScenarioError);

    const allowed: ScenarioDefinition = {
      ...blocked,
      name: 'camp-step-occupied-unsafe',
      steps: [...stepsBase.slice(0, 2), { ...stepsBase[2], unsafe: true } as ScenarioStep],
    };
    expect(() => buildScenario(allowed)).not.toThrow();
    const camps = buildScenario(allowed).barbarianCamps;
    // createNewGame also seeds its own base camps elsewhere on the map, so
    // this counts only camps at the contested tile, not the total.
    const campsAtTile = Object.values(camps).filter(c => hexKey(c.position) === hexKey({ q: 6, r: 5 }));
    expect(campsAtTile.length).toBe(2); // both camps coexist on the same tile
  });
});

describe('tech step', () => {
  it('marks the named techs completed for the civ', () => {
    const definition: ScenarioDefinition = {
      name: 'tech-step-check',
      description: 'test only',
      seed: 'scenario-tech-step-check',
      base: soloBase,
      steps: [{ kind: 'tech', civId: 'player', techIds: ['pottery', 'bronze-working'] }],
    };
    const state = buildScenario(definition);
    expect(state.civilizations.player.techState.completed).toEqual(
      expect.arrayContaining(['pottery', 'bronze-working']),
    );
  });

  it('throws ScenarioError on an unknown tech id', () => {
    const definition: ScenarioDefinition = {
      name: 'tech-step-bad-id',
      description: 'test only',
      seed: 'scenario-tech-step-bad-id',
      base: soloBase,
      steps: [{ kind: 'tech', civId: 'player', techIds: ['not-a-real-tech'] }],
    };
    expect(() => buildScenario(definition)).toThrow(ScenarioError);
  });
});

describe('diplomacy step', () => {
  it('declares war bilaterally', () => {
    const definition: ScenarioDefinition = {
      name: 'diplomacy-step-check',
      description: 'test only',
      seed: 'scenario-diplomacy-step-check',
      base: soloBase,
      steps: [{ kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'war' }],
    };
    const state = buildScenario(definition);
    expect(state.civilizations.player.diplomacy.atWarWith).toContain('ai-1');
    expect(state.civilizations['ai-1'].diplomacy.atWarWith).toContain('player');
  });

  it('makes peace bilaterally after a war step', () => {
    const definition: ScenarioDefinition = {
      name: 'diplomacy-step-peace-check',
      description: 'test only',
      seed: 'scenario-diplomacy-step-peace-check',
      base: soloBase,
      steps: [
        { kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'war' },
        { kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'peace' },
      ],
    };
    const state = buildScenario(definition);
    expect(state.civilizations.player.diplomacy.atWarWith).not.toContain('ai-1');
    expect(state.civilizations['ai-1'].diplomacy.atWarWith).not.toContain('player');
  });

  it('signs an alliance treaty bilaterally', () => {
    const definition: ScenarioDefinition = {
      name: 'diplomacy-step-alliance-check',
      description: 'test only',
      seed: 'scenario-diplomacy-step-alliance-check',
      base: soloBase,
      steps: [{ kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'alliance' }],
    };
    const state = buildScenario(definition);
    const playerTreaty = state.civilizations.player.diplomacy.treaties.find(
      t => t.type === 'alliance' && t.civA === 'player' && t.civB === 'ai-1',
    );
    const aiTreaty = state.civilizations['ai-1'].diplomacy.treaties.find(
      t => t.type === 'alliance' && t.civA === 'ai-1' && t.civB === 'player',
    );
    expect(playerTreaty).toBeDefined();
    expect(aiTreaty).toBeDefined();
  });

  it('throws ScenarioError on an unknown civId', () => {
    const definition: ScenarioDefinition = {
      name: 'diplomacy-step-bad-civ',
      description: 'test only',
      seed: 'scenario-diplomacy-step-bad-civ',
      base: soloBase,
      steps: [{ kind: 'diplomacy', civA: 'player', civB: 'nonexistent', status: 'war' }],
    };
    expect(() => buildScenario(definition)).toThrow(ScenarioError);
  });
});

describe('gold step', () => {
  it('adds gold to the civ', () => {
    const definition: ScenarioDefinition = {
      name: 'gold-step-check',
      description: 'test only',
      seed: 'scenario-gold-step-check',
      base: soloBase,
      steps: [{ kind: 'gold', civId: 'player', amount: 250 }],
    };
    const state = buildScenario(definition);
    expect(state.civilizations.player.gold).toBe(250);
  });

  it('throws ScenarioError on an unknown civId', () => {
    const definition: ScenarioDefinition = {
      name: 'gold-step-bad-civ',
      description: 'test only',
      seed: 'scenario-gold-step-bad-civ',
      base: soloBase,
      steps: [{ kind: 'gold', civId: 'nonexistent', amount: 100 }],
    };
    expect(() => buildScenario(definition)).toThrow(ScenarioError);
  });
});

describe('hot-seat base', () => {
  it('builds a hot-seat state with correct per-slot visibility', () => {
    const definition: ScenarioDefinition = {
      name: 'hot-seat-check',
      description: 'test only',
      seed: 'scenario-hot-seat-check',
      base: {
        kind: 'hotSeat',
        config: {
          playerCount: 2,
          mapSize: 'small',
          players: [
            { name: 'Alice', slotId: 'player-1', civType: 'generic', isHuman: true },
            { name: 'Bob', slotId: 'player-2', civType: 'generic', isHuman: true },
          ],
        },
      },
      steps: [
        { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
        { kind: 'unit', civId: 'player-1', type: 'scout', position: { q: 0, r: 0 } },
      ],
    };
    const state = buildScenario(definition);
    expect(state.hotSeat).toBeDefined();
    const scout = Object.values(state.units).find(u => u.type === 'scout' && u.owner === 'player-1');
    expect(scout).toBeDefined();
    expect(state.civilizations['player-1'].visibility.tiles[hexKey({ q: 0, r: 0 })]).toBe('visible');
  });
});
