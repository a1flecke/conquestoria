import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { hexKey } from '@/systems/hex-utils';
import { getWonderAtlasEntries } from '@/systems/wonder-atlas-presentation';

function makeAtlasState(): GameState {
  const state = createNewGame(undefined, 'wonder-atlas-presentation-test');
  for (const tile of Object.values(state.map.tiles)) {
    tile.wonder = null;
    tile.owner = null;
  }

  const tile = state.map.tiles[hexKey({ q: 0, r: 0 })];
  tile.wonder = 'great_volcano';
  tile.owner = 'ai-1';
  state.discoveredWonders = {};
  state.wonderDiscoverers = {};
  return state;
}

describe('wonder-atlas-presentation', () => {
  it('omits undiscovered natural wonders without leaking their count or details', () => {
    const state = makeAtlasState();

    const entries = getWonderAtlasEntries(state, 'player');

    expect(entries.filter(entry => entry.kind === 'natural')).toHaveLength(0);
    expect(entries.some(entry => entry.wonderId === 'great_volcano')).toBe(false);
  });

  it('shows discovered natural wonders with safe static details', () => {
    const state = makeAtlasState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const entries = getWonderAtlasEntries(state, 'player');
    const volcano = entries.find(entry => entry.kind === 'natural' && entry.wonderId === 'great_volcano');

    expect(volcano).toMatchObject({
      kind: 'natural',
      visibility: 'discovered',
      name: 'Great Volcano',
      locationLabel: 'Q0, R0',
      canViewOnMap: true,
      coord: { q: 0, r: 0 },
    });
    expect(volcano?.kind).toBe('natural');
    if (volcano?.kind !== 'natural') throw new Error('expected natural wonder entry');
    expect(volcano.effectSummary).toContain('Yields');
  });

  it('scopes natural wonder visibility to the requested viewer', () => {
    const state = makeAtlasState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['ai-1'];

    expect(getWonderAtlasEntries(state, 'player').some(entry => entry.wonderId === 'great_volcano')).toBe(false);
    expect(getWonderAtlasEntries(state, 'ai-1').some(entry => entry.wonderId === 'great_volcano')).toBe(true);
  });

  it('does not expose live hidden tile details for discovered natural wonders', () => {
    const state = makeAtlasState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];
    state.map.tiles[hexKey({ q: 0, r: 0 })].terrain = 'volcanic';
    state.map.tiles[hexKey({ q: 0, r: 0 })].owner = 'ai-1';

    const volcano = getWonderAtlasEntries(state, 'player')
      .find(entry => entry.kind === 'natural' && entry.wonderId === 'great_volcano');

    expect(volcano).toBeTruthy();
    expect('terrain' in (volcano as object)).toBe(false);
    expect('owner' in (volcano as object)).toBe(false);
  });

  it('omits View on map when a discovered wonder has no resolvable coordinate', () => {
    const state = makeAtlasState();
    state.map.tiles[hexKey({ q: 0, r: 0 })].wonder = null;
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const volcano = getWonderAtlasEntries(state, 'player')
      .find(entry => entry.kind === 'natural' && entry.wonderId === 'great_volcano');

    expect(volcano).toMatchObject({
      coord: null,
      canViewOnMap: false,
      locationLabel: 'Location unknown',
    });
  });

  it('includes masked legendary slots without implying buildability', () => {
    const state = makeAtlasState();

    const legendaryEntries = getWonderAtlasEntries(state, 'player')
      .filter(entry => entry.kind === 'legendary');

    expect(legendaryEntries).toHaveLength(getLegendaryWonderDefinitions().length);
    expect(legendaryEntries[0]).toMatchObject({
      kind: 'legendary',
      visibility: 'masked',
      canViewOnMap: false,
      maskedLabel: 'Legendary wonder',
    });
    expect('canStartBuild' in legendaryEntries[0]).toBe(false);
  });
});
