import { describe, expect, it } from 'vitest';
import { checkDominationVictory } from '@/systems/victory-system';
import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { collectUsedCityNames } from '@/systems/city-name-system';
import { foundCityInState } from '@/systems/city-founding-system';
import { makeLivenessGame, withoutOwnedAssets } from './helpers/civilization-liveness-fixture';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('checkDominationVictory', () => {
  it('does not end a campaign because only the player has founded a city', () => {
    const state = makeLivenessGame();

    expect(checkDominationVictory(state)).toBeNull();
    const result = processTurn(state, new EventBus());
    expect(result.gameOver).toBe(false);
    expect(Object.values(result.units).some(unit =>
      unit.owner === 'ai-1' && unit.type === 'settler')).toBe(true);
  });

  it('does not let a ghost city roster block domination', () => {
    const state = withoutOwnedAssets(makeLivenessGame(), 'ai-1');
    state.civilizations['ai-1'].cities = ['city-ghost'];

    expect(checkDominationVictory(state)).toBe('player');
  });

  it('returns null when 2 major civs each have cities', () => {
    const state = makeLivenessGame();
    const aiSettler = Object.values(state.units).find(unit =>
      unit.owner === 'ai-1' && unit.type === 'settler');
    if (!aiSettler) throw new Error('Fixture requires an AI settler');
    const founded = foundCityInState(state, aiSettler.id, new EventBus()).state;

    expect(checkDominationVictory(founded)).toBeNull();
  });

  it('returns winner id when exactly one major civ has cities', () => {
    const state = withoutOwnedAssets(makeLivenessGame(), 'ai-1');
    expect(checkDominationVictory(state)).toBe('player');
  });

  it('returns the sole surviving settler owner as the winner', () => {
    const state = withoutOwnedAssets(createNewGame('egypt', 'settler-winner'), 'ai-1');

    expect(checkDominationVictory(state)).toBe('player');
  });

  it('returns null when no major civ has cities', () => {
    const withoutPlayer = withoutOwnedAssets(makeLivenessGame(), 'player');
    const state = withoutOwnedAssets(withoutPlayer, 'ai-1');
    expect(checkDominationVictory(state)).toBeNull();
  });

  it('returns null when only one major civ exists (no rival to eliminate)', () => {
    const state = makeLivenessGame();
    delete state.civilizations['ai-1'];
    for (const [unitId, unit] of Object.entries(state.units)) {
      if (unit.owner === 'ai-1') delete state.units[unitId];
    }
    expect(checkDominationVictory(state)).toBeNull();
  });

  it('returns winner id when all 3 civs are present and 2 rivals have no cities', () => {
    const created = createNewGame({
      civType: 'egypt',
      mapSize: 'small',
      opponentCount: 2,
      gameTitle: 'Three rivals',
      seed: 'three-rival-victory',
    });
    const playerSettler = Object.values(created.units).find(unit =>
      unit.owner === 'player' && unit.type === 'settler');
    if (!playerSettler) throw new Error('Fixture requires player settler');
    const playerFounded = foundCityInState(created, playerSettler.id, new EventBus()).state;
    const withoutAiOne = withoutOwnedAssets(playerFounded, 'ai-1');
    const state = withoutOwnedAssets(withoutAiOne, 'ai-2');

    expect(checkDominationVictory(state)).toBe('player');
  });
});

describe('processTurn victory wiring', () => {
  it('sets gameOver and winner when only one civ has cities', () => {
    const state = withoutOwnedAssets(makeLivenessGame(), 'ai-1');

    const bus = new EventBus();
    const result = processTurn(state, bus);

    expect(result.gameOver).toBe(true);
    expect(result.winner).toBe('player');
    expect(result.gameOverReason).toBe('domination');
  });

  it('does NOT set gameOver when both civs have cities', () => {
    const state = createNewGame('egypt', 'test-no-victory-seed');

    const playerSettler = Object.values(state.units).find(
      u => u.owner === 'player' && u.type === 'settler',
    );
    const playerPos = playerSettler?.position ?? { q: 2, r: 2 };
    const playerCity = foundCity('player', playerPos, state.map, mkC(), {
      civType: 'egypt',
      usedNames: collectUsedCityNames(state),
    });
    state.cities[playerCity.id] = playerCity;
    state.civilizations['player']!.cities = [playerCity.id];

    const aiSettler = Object.values(state.units).find(
      u => u.owner === 'ai-1' && u.type === 'settler',
    );
    const aiPos = aiSettler?.position ?? { q: 10, r: 10 };
    const aiCiv = state.civilizations['ai-1'];
    const aiCity = foundCity('ai-1', aiPos, state.map, mkC(), {
      civType: aiCiv?.civType ?? 'generic',
      usedNames: collectUsedCityNames(state),
    });
    state.cities[aiCity.id] = aiCity;
    state.civilizations['ai-1']!.cities = [aiCity.id];

    const bus = new EventBus();
    const result = processTurn(state, bus);

    expect(result.gameOver).toBe(false);
    expect(result.winner).toBeNull();
  });
});
