import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { GameEvents, GameState } from '@/core/types';
import { createSpyFromUnit, embedSpy } from '@/systems/espionage-system';
import { runCounterIntelSweep, SWEEP_DENIAL_MESSAGES } from '@/systems/espionage-turn';
import { getRelationship } from '@/systems/diplomacy-queries';

// A sweep detected enemy spies and nothing happened to them: the detected ids reached only a toast, the
// infiltrator kept working, and its owner was never told. A detected spy is now expelled the way a spy
// caught failing a mission is: sent home on cooldown, with both civilizations' relations worse for it.
function sweepFixture(seed: string, sweeperExperience = 100): { state: GameState; cityId: string } {
  const state = createNewGame(undefined, seed, 'small');
  const cityId = 'city-swept';
  let ownerEsp = { ...state.espionage!.player, maxSpies: 1 };
  ({ state: ownerEsp } = createSpyFromUnit(ownerEsp, 'spy-own', 'player', 'spy_scout', 'seed'));
  ownerEsp = { ...ownerEsp, spies: { 'spy-own': { ...ownerEsp.spies['spy-own'], experience: sweeperExperience } } };
  ownerEsp = embedSpy(ownerEsp, 'spy-own', cityId, { q: 0, r: 0 });
  let enemyEsp = { ...state.espionage!['ai-1'], maxSpies: 1 };
  ({ state: enemyEsp } = createSpyFromUnit(enemyEsp, 'spy-enemy', 'ai-1', 'spy_scout', 'seed2'));
  enemyEsp = {
    ...enemyEsp,
    spies: {
      'spy-enemy': {
        ...enemyEsp.spies['spy-enemy'], status: 'stationed', infiltrationCityId: cityId,
        targetCivId: 'player', targetCityId: cityId, position: { q: 0, r: 0 },
      },
    },
  };
  return { state: { ...state, espionage: { ...state.espionage, player: ownerEsp, 'ai-1': enemyEsp } }, cityId };
}

/** First turn whose sweep detects the infiltrator: detection is a 70% draw at experience 100, seeded by spy and turn. */
function detectingFixture(): { state: GameState; cityId: string } {
  for (let turn = 1; turn <= 30; turn++) {
    const fixture = sweepFixture('sweep-expel');
    fixture.state = { ...fixture.state, turn };
    const result = runCounterIntelSweep(fixture.state, 'player', 'spy-own');
    if (result.ok && result.expelledSpyIds.length > 0) return fixture;
  }
  throw new Error('no seed detected the infiltrator');
}

describe('runCounterIntelSweep', () => {
  it('expels a detected infiltrator: home on cooldown, out of the city', () => {
    const { state } = detectingFixture();

    const result = runCounterIntelSweep(state, 'player', 'spy-own');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expelledSpyIds).toEqual(['spy-enemy']);
    expect(result.state.espionage!['ai-1'].spies['spy-enemy']).toMatchObject({
      status: 'cooldown', cooldownTurns: 5, infiltrationCityId: null, targetCivId: null, targetCityId: null,
    });
    expect(result.state.espionage!.player.spies['spy-own'].lastSweepTurn).toBe(state.turn);
  });

  it('worsens relations both ways, like an expulsion after a failed mission', () => {
    const { state } = detectingFixture();
    const result = runCounterIntelSweep(state, 'player', 'spy-own');
    if (!result.ok) throw new Error('sweep refused');

    expect(getRelationship(result.state.civilizations.player.diplomacy, 'ai-1'))
      .toBeLessThan(getRelationship(state.civilizations.player.diplomacy, 'ai-1'));
    expect(getRelationship(result.state.civilizations['ai-1'].diplomacy, 'player'))
      .toBeLessThan(getRelationship(state.civilizations['ai-1'].diplomacy, 'player'));
  });

  it('tells the expelled spy\'s owner', () => {
    const { state } = detectingFixture();
    const bus = new EventBus();
    const seen: GameEvents['espionage:spy-expelled'][] = [];
    bus.on('espionage:spy-expelled', event => seen.push(event));

    runCounterIntelSweep(state, 'player', 'spy-own', bus);

    expect(seen).toEqual([expect.objectContaining({ civId: 'ai-1', spyId: 'spy-enemy', fromCivId: 'player', cooldownTurns: 5 })]);
  });

  it('leaves the input state untouched', () => {
    const { state } = detectingFixture();
    const before = structuredClone(state);
    runCounterIntelSweep(state, 'player', 'spy-own');
    expect(state).toEqual(before);
  });

  it('refuses a second sweep in the same turn, with copy', () => {
    const { state } = sweepFixture('sweep-twice');
    const first = runCounterIntelSweep(state, 'player', 'spy-own');
    if (!first.ok) throw new Error('first sweep refused');

    const second = runCounterIntelSweep(first.state, 'player', 'spy-own');

    expect(second).toEqual({ ok: false, reason: 'already-swept' });
    expect(SWEEP_DENIAL_MESSAGES['already-swept']).toBeTruthy();
  });

  it('refuses a spy that is not embedded at home', () => {
    const { state } = sweepFixture('sweep-not-embedded');
    expect(runCounterIntelSweep(state, 'player', 'no-such-spy')).toEqual({ ok: false, reason: 'no-spy' });
    expect(runCounterIntelSweep(state, 'ai-1', 'spy-enemy')).toEqual({ ok: false, reason: 'not-embedded' });
  });
});
