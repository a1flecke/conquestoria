import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameEvents, GameState } from '@/core/types';
import { buildWonderDiscoveryRevealItem } from '@/systems/wonder-discovery-reveal';
import { hexKey } from '@/systems/hex-utils';

function makeState(): GameState {
  const state = createNewGame(undefined, 'wonder-discovery-reveal-test');
  for (const tile of Object.values(state.map.tiles)) {
    tile.wonder = null;
    tile.owner = null;
  }
  state.map.tiles[hexKey({ q: 2, r: 3 })].wonder = 'great_volcano';
  state.discoveredWonders = { great_volcano: 'ai-1' };
  state.wonderDiscoverers = { great_volcano: ['ai-1', 'player'] };
  return state;
}

function event(overrides: Partial<GameEvents['wonder:discovered']> = {}): GameEvents['wonder:discovered'] {
  return {
    civId: 'player',
    wonderId: 'great_volcano',
    position: { q: 2, r: 3 },
    isFirstDiscoverer: false,
    ...overrides,
  };
}

describe('wonder-discovery-reveal', () => {
  it('builds a reveal item for the active human viewer using the event coordinate', () => {
    const state = makeState();

    const item = buildWonderDiscoveryRevealItem(state, 'player', event());

    expect(item).toMatchObject({
      title: 'Natural Wonder Discovered',
      wonderId: 'great_volcano',
      civId: 'player',
      coord: { q: 2, r: 3 },
      name: 'Great Volcano',
      motionAssetId: null,
    });
    expect(item?.effectSummary).toContain('Yields');
    expect(item?.rewardSummary).toBe('+30 Science discovery reward');
    expect(item?.visual.mapLandmark).toBe('volcano');
    expect(item?.videoPreview).toMatchObject({
      id: 'video-great-volcano-tonga-eruption',
      wonderId: 'great_volcano',
      surface: 'natural-reveal',
      audio: 'silent',
    });
  });

  it('does not require first-ever world discovery for a human civ reveal', () => {
    const state = makeState();

    const item = buildWonderDiscoveryRevealItem(state, 'player', event({ isFirstDiscoverer: false }));

    expect(item?.wonderId).toBe('great_volcano');
  });

  it('returns null for AI discoveries and wrong active viewers', () => {
    const state = makeState();

    expect(buildWonderDiscoveryRevealItem(state, 'ai-1', event({ civId: 'ai-1' }))).toBeNull();
    expect(buildWonderDiscoveryRevealItem(state, 'player-2', event({ civId: 'player' }))).toBeNull();
  });

  it('does not invent video previews for unsupported natural reveal wonders', () => {
    const state = makeState();
    state.map.tiles[hexKey({ q: 1, r: 0 })].wonder = 'crystal_caverns';
    state.wonderDiscoverers.crystal_caverns = ['player'];

    const item = buildWonderDiscoveryRevealItem(
      state,
      'player',
      event({ wonderId: 'crystal_caverns', position: { q: 1, r: 0 } }),
    );

    expect(item?.wonderId).toBe('crystal_caverns');
    expect(item?.videoPreview).toBeUndefined();
  });

  it('includes a Stage 3B silent natural reveal video preview', () => {
    const state = makeState();
    state.map.tiles[hexKey({ q: 1, r: 0 })].wonder = 'coral_reef';
    state.wonderDiscoverers.coral_reef = ['player'];

    const item = buildWonderDiscoveryRevealItem(
      state,
      'player',
      event({ wonderId: 'coral_reef', position: { q: 1, r: 0 } }),
    );

    expect(item?.videoPreview).toMatchObject({
      id: 'video-coral-reef-art-park',
      wonderId: 'coral_reef',
      surface: 'natural-reveal',
      audio: 'silent',
    });
  });

  it('allows separate human civs to receive their own reveal on their own turn', () => {
    const state = makeState();
    state.civilizations['player-2'] = { ...state.civilizations.player, id: 'player-2', name: 'Second Human', isHuman: true };
    state.currentPlayer = 'player-2';
    state.wonderDiscoverers.great_volcano.push('player-2');

    const item = buildWonderDiscoveryRevealItem(state, 'player-2', event({ civId: 'player-2' }));

    expect(item?.civId).toBe('player-2');
  });

  it('does not expose hidden live tile details', () => {
    const state = makeState();
    state.map.tiles[hexKey({ q: 2, r: 3 })].terrain = 'volcanic';
    state.map.tiles[hexKey({ q: 2, r: 3 })].owner = 'ai-1';

    const item = buildWonderDiscoveryRevealItem(state, 'player', event());

    expect(item).toBeTruthy();
    expect('terrain' in (item as object)).toBe(false);
    expect('owner' in (item as object)).toBe(false);
  });

  it('returns null when the viewer has not earned Atlas visibility for the wonder', () => {
    const state = makeState();
    state.wonderDiscoverers.great_volcano = ['ai-1'];

    expect(buildWonderDiscoveryRevealItem(state, 'player', event())).toBeNull();
  });

  it('uses description fallback when revealLine metadata is absent', () => {
    const item = buildWonderDiscoveryRevealItem(makeState(), 'player', event());

    expect(item?.revealLine).toBe('A massive volcano that occasionally erupts, destroying nearby improvements.');
  });

  it('returns null for unknown wonders or unusable event coordinates', () => {
    const state = makeState();

    expect(buildWonderDiscoveryRevealItem(state, 'player', event({ wonderId: 'missing_wonder' }))).toBeNull();
    expect(buildWonderDiscoveryRevealItem(state, 'player', event({ position: { q: Number.NaN, r: 0 } }))).toBeNull();
  });
});
