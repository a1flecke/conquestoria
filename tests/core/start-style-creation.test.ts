/**
 * Start style at game creation (design 2026-11-25, B3): the setting reaches placement, preferences reach the
 * assignment, and a game created without it is unchanged.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, HexCoord, StartStyle } from '@/core/types';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { createStartQualityIndex } from '@/systems/start-quality';
import { describeStartPreferenceFacts } from '@/systems/start-preferences';

const SEEDS = 12;

function solo(seed: string, startStyle?: StartStyle, civType = 'rome'): GameState {
  return createNewGame({
    civType, seed, mapSize: 'large', opponentCount: 6, gameTitle: 'style',
    ...(startStyle ? { settingsOverrides: { startStyle } } : {}),
  });
}

function starts(state: GameState): Array<{ owner: string; civType: string; coord: HexCoord }> {
  return Object.values(state.units)
    .filter(unit => unit.type === 'settler')
    .map(unit => ({ owner: unit.owner, civType: state.civilizations[unit.owner].civType, coord: unit.position }));
}

function spread(state: GameState): number {
  const index = createStartQualityIndex(state.map);
  const scores = starts(state).map(start => index.assess(start.coord).score);
  return Math.max(...scores) - Math.min(...scores);
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

describe('start style at game creation', () => {
  it('is recorded on the game and absent when not chosen', () => {
    expect(solo('style-a', 'wild').settings.startStyle).toBe('wild');
    expect(solo('style-a').settings.startStyle).toBeUndefined();
    const hot = createHotSeatGame({
      playerCount: 3, mapSize: 'medium', settingsOverrides: { startStyle: 'fair' },
      players: [
        { name: 'A', slotId: 'player-1', civType: 'rome', isHuman: true },
        { name: 'B', slotId: 'player-2', civType: 'egypt', isHuman: true },
        { name: 'C', slotId: 'ai-1', civType: 'greece', isHuman: false },
      ],
    }, 'style-hot', 'hot');
    expect(hot.settings.startStyle).toBe('fair');
  });

  it('Fair starts are closest in quality, Wild the furthest apart', () => {
    const measure = (style: StartStyle) => mean(Array.from({ length: SEEDS }, (_, n) => spread(solo(`style-${n}`, style))));
    const fair = measure('fair');
    const varied = measure('varied');
    const wild = measure('wild');
    // Measured on these seeds: about 4.7 / 5.3 / 5.8 score points between the strongest and weakest start.
    expect(fair).toBeLessThan(varied);
    expect(varied).toBeLessThan(wild);
  }, 120_000);

  it('a river people starts by a river more often under Wild than without a style', () => {
    const byRiver = (style?: StartStyle) => Array.from({ length: SEEDS }, (_, n) => solo(`style-${n}`, style, 'egypt'))
      .filter(state => {
        const egypt = starts(state).find(start => start.civType === 'egypt')!;
        return describeStartPreferenceFacts(state.map, egypt.coord).river;
      }).length;
    const plain = byRiver();
    const wild = byRiver('wild');
    // Measured: 2 of 12 without a style, 10 of 12 under Wild.
    expect(wild).toBeGreaterThan(plain);
  }, 120_000);
});
