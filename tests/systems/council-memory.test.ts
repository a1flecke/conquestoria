import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import {
  ageCouncilMemoryOutcomes,
  evictObsoleteCouncilMemory,
  formatCouncilMemoryEntry,
  getNextCouncilCallback,
  recordCouncilDisagreement,
  recordCouncilOutcome,
  rememberCouncilDecision,
  shouldEmitCouncilCallback,
} from '@/systems/council-memory';
import { makeCouncilFixture } from '../ui/helpers/council-fixture';

function ensurePlayerCity(state: GameState): string {
  const existing = state.civilizations.player.cities[0];
  if (existing) {
    return existing;
  }
  const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
  if (!settler) {
    throw new Error('expected player settler for council memory fixture');
  }
  const city = foundCity('player', settler.position, state.map);
  state.cities[city.id] = city;
  state.civilizations.player.cities.push(city.id);
  return city.id;
}

describe('council-memory', () => {
  it('stores structured council memory facts instead of rendered summary strings', () => {
    const { state } = makeCouncilFixture();

    const next = rememberCouncilDecision(state, 'player', {
      key: 'expand-west',
      advisor: 'chancellor',
      kind: 'frontier-expansion',
      turn: 40,
      subjects: {
        cityId: 'city-west',
        regionKey: 'frontier-west',
      },
    });

    expect(next.player.entries[0]).toMatchObject({
      key: 'expand-west',
      advisor: 'chancellor',
      kind: 'frontier-expansion',
      subjects: { cityId: 'city-west', regionKey: 'frontier-west' },
    });
    expect('summary' in next.player.entries[0]).toBe(false);
  });

  it('formats recalled council memory from current viewer knowledge instead of persisted prose', () => {
    const { state } = makeCouncilFixture({ metForeignCiv: true, discoveredForeignCity: false });
    state.cities['city-rival'] = {
      ...state.cities['city-rome'],
      id: 'city-rival',
      name: 'Atlantis Harbor',
      owner: 'ai-1',
      position: { q: 9, r: 9 },
    };

    const memory = rememberCouncilDecision(state, 'player', {
      key: 'watch-rival-harbor',
      advisor: 'spymaster',
      kind: 'watch-rival-city',
      turn: 41,
      subjects: {
        civId: 'ai-1',
        cityId: 'city-rival',
      },
    });

    const formatted = formatCouncilMemoryEntry(memory.player.entries[0], state, 'player');
    expect(formatted).not.toContain('city-rival');
    expect(formatted).toContain('an undiscovered foreign city');
  });

  it('preserves council memory through save round-trip without changing viewer-safe formatting rules', () => {
    const { state } = makeCouncilFixture();

    const remembered = rememberCouncilDecision(state, 'player', {
      key: 'build-archive',
      advisor: 'scholar',
      kind: 'wonder-plan',
      turn: 52,
      subjects: {
        wonderId: 'world-archive',
        cityId: 'city-river',
      },
    });

    const roundTrip = JSON.parse(JSON.stringify(remembered)) as GameState['councilMemory'];
    expect(roundTrip?.player.entries[0].subjects.wonderId).toBe('world-archive');
  });

  it('caps callback frequency: at most one callback per entry per 10 turns', () => {
    const { state } = makeCouncilFixture();
    const remembered = rememberCouncilDecision(state, 'player', {
      key: 'fortify-border',
      advisor: 'warchief',
      kind: 'frontier-expansion',
      turn: 20,
      subjects: { regionKey: 'frontier-east' },
    });
    state.councilMemory = remembered;
    state.councilMemory!.player.entries[0].lastCallbackTurn = 25;
    state.turn = 30;

    expect(shouldEmitCouncilCallback(state, 'player')).toBe(false);

    state.turn = 36;
    expect(shouldEmitCouncilCallback(state, 'player')).toBe(true);
  });

  it('caps callback frequency: at most 2 callbacks per era across all entries', () => {
    const { state } = makeCouncilFixture();
    const remembered = rememberCouncilDecision(state, 'player', {
      key: 'build-walls',
      advisor: 'warchief',
      kind: 'city-development',
      turn: 20,
      subjects: { cityId: 'city-center' },
    });
    state.councilMemory = remembered;
    state.councilMemory!.player.entries[0].lastCallbackTurn = 15;
    state.councilMemory!.player.eraCallbackCount = 2;
    state.turn = 40;

    expect(shouldEmitCouncilCallback(state, 'player')).toBe(false);
  });

  it('evicts memory entries for cities that were captured and does not produce callbacks from them', () => {
    const { state } = makeCouncilFixture();
    const cityId = ensurePlayerCity(state);
    const remembered = rememberCouncilDecision(state, 'player', {
      key: 'fortify-rome',
      advisor: 'warchief',
      kind: 'city-development',
      turn: 30,
      subjects: { cityId },
    });
    state.councilMemory = remembered;
    state.cities[cityId].owner = 'ai-1';

    const evicted = evictObsoleteCouncilMemory(state, 'player');
    expect(evicted.player.entries.find(e => e.key === 'fortify-rome')?.outcome).toBe('obsolete');
    expect(shouldEmitCouncilCallback(state, 'player')).toBe(false);
  });

  it('uses current city labels in callbacks even if the city was renamed after the memory was stored', () => {
    const { state } = makeCouncilFixture();
    const cityId = ensurePlayerCity(state);
    const remembered = rememberCouncilDecision(state, 'player', {
      key: 'expand-harbor',
      advisor: 'treasurer',
      kind: 'city-development',
      turn: 35,
      subjects: { cityId },
    });
    state.councilMemory = remembered;
    state.cities[cityId].name = 'New Harbor';

    const formatted = formatCouncilMemoryEntry(remembered.player.entries[0], state, 'player');
    expect(formatted).toContain('New Harbor');
    expect(formatted).not.toContain(cityId);
  });

  it('initializes cleanly from a legacy save that has no councilMemory field', () => {
    const { state } = makeCouncilFixture();
    const legacyState = { ...state };
    delete legacyState.councilMemory;

    const next = rememberCouncilDecision(legacyState, 'player', {
      key: 'first-memory',
      advisor: 'chancellor',
      kind: 'frontier-expansion',
      turn: 1,
      subjects: { regionKey: 'frontier-south' },
    });

    expect(next.player.entries).toHaveLength(1);
    expect(next.player.entries[0].key).toBe('first-memory');
  });

  it('transitions a memory entry from pending to followed when the player acts on the recommendation', () => {
    const { state } = makeCouncilFixture();
    const remembered = rememberCouncilDecision(state, 'player', {
      key: 'build-archive',
      advisor: 'scholar',
      kind: 'wonder-plan',
      turn: 20,
      subjects: { wonderId: 'world-archive', cityId: 'city-river' },
    });
    state.councilMemory = remembered;

    const updated = recordCouncilOutcome(state, 'player', 'build-archive', 'followed');
    expect(updated.player.entries.find(e => e.key === 'build-archive')?.outcome).toBe('followed');
  });

  it('transitions a memory entry to ignored after 15 turns with no matching player action', () => {
    const { state } = makeCouncilFixture();
    const remembered = rememberCouncilDecision(state, 'player', {
      key: 'expand-west',
      advisor: 'chancellor',
      kind: 'frontier-expansion',
      turn: 10,
      subjects: { regionKey: 'frontier-west' },
    });
    state.councilMemory = remembered;
    state.turn = 26;

    const aged = ageCouncilMemoryOutcomes(state, 'player');
    expect(aged.player.entries.find(e => e.key === 'expand-west')?.outcome).toBe('ignored');
  });

  it('produces an "I told you so" callback when a followed recommendation succeeds', () => {
    const { state } = makeCouncilFixture();
    const remembered = rememberCouncilDecision(state, 'player', {
      key: 'build-archive',
      advisor: 'scholar',
      kind: 'wonder-plan',
      turn: 20,
      subjects: { wonderId: 'world-archive', cityId: 'city-river' },
    });
    state.councilMemory = remembered;
    state.councilMemory!.player.entries[0].outcome = 'followed';

    recordCouncilOutcome(state, 'player', 'build-archive', 'succeeded');
    const callback = getNextCouncilCallback(state, 'player');

    expect(callback?.advisor).toBe('scholar');
    expect(callback?.tone).toBe('smug');
  });

  it('produces a resentful callback when an ignored recommendation would have succeeded', () => {
    const { state } = makeCouncilFixture();
    const remembered = rememberCouncilDecision(state, 'player', {
      key: 'fortify-border',
      advisor: 'warchief',
      kind: 'frontier-expansion',
      turn: 10,
      subjects: { regionKey: 'frontier-east' },
    });
    state.councilMemory = remembered;
    state.councilMemory!.player.entries[0].outcome = 'ignored';

    recordCouncilOutcome(state, 'player', 'fortify-border', 'failed');
    const callback = getNextCouncilCallback(state, 'player');

    expect(callback?.advisor).toBe('warchief');
    expect(callback?.tone).toBe('resentful');
  });

  it('records a disagreement when two advisors recommend conflicting actions on the same subject', () => {
    const { state } = makeCouncilFixture();

    const next = recordCouncilDisagreement(state, 'player', {
      key: 'war-vs-trade-rival',
      turn: 30,
      subjects: { civId: 'ai-1' },
      advisorFor: 'warchief',
      advisorAgainst: 'treasurer',
      forAction: 'Declare war on the rival',
      againstAction: 'Open a trade route instead',
    });

    const entry = next.player.entries.find(e => e.key === 'war-vs-trade-rival');
    expect(entry?.kind).toBe('advisor-disagreement');
    expect(entry?.subjects.advisorFor).toBe('warchief');
    expect(entry?.subjects.advisorAgainst).toBe('treasurer');
  });
});
