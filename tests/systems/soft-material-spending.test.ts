import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { selectSoftMaterialTerms } from '@/systems/soft-material-terms';
import { resourceGoodId } from '@/systems/trade-good-definitions';

/**
 * #1507 MR10 — finite soft-material terms.
 *
 * A soft advantage is optional: it needs a real, finite stock allotment (or an
 * eligible Circular Manufacturing substitution), and one unit can never unlock
 * an unlimited number of discounts. Normal-cost production remains available.
 */

const coal = resourceGoodId('coal');

function state(options: {
  techs?: string[];
  coalStock?: number;
  coalAccess?: boolean;
  circular?: boolean;
  circularChoice?: string;
} = {}): GameState {
  const techs = options.techs ?? ['steam-power'];
  return {
    currentPlayer: 'player',
    turn: 10,
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    cities: {},
    units: {},
    marketplace: {
      prices: {},
      priceHistory: {},
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [],
      purchasedResources: options.coalAccess
        ? [{ civId: 'player', resource: 'coal', expiresOnTurn: 30 }]
        : [],
    },
    civilizations: {
      player: {
        id: 'player',
        cities: [],
        units: [],
        isHuman: true,
        civType: 'generic',
        techState: { completed: techs, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        gold: 100,
        diplomacy: { atWarWith: [] },
      },
    },
    materialReservesByCiv: {
      player: {
        balances: options.coalStock ? { [coal]: { native: options.coalStock, imported: 0 } } : {},
        reservations: [],
        incoming: [],
        lastAccruedTurn: -1,
      },
    },
    ...(options.circular
      ? {
        builtNationalProjects: { 'player:circular_manufacturing_network': { civId: 'player', cityId: 'c', eraBuilt: 1 } },
        nationalProjectChoices: { 'player:circular_manufacturing_network': options.circularChoice ?? 'aluminum' },
      }
      : {}),
  } as unknown as GameState;
}

describe('#1507 MR10 — finite soft-material selection', () => {
  it('selects a five-unit coal term when the stock and access are real', () => {
    const selected = selectSoftMaterialTerms(state({ coalStock: 5, coalAccess: true }), 'player', 'factory');
    expect(selected).toMatchObject({
      multiplier: 0.8,
      rows: [{ goodId: coal, quantity: 5 }],
      substitutions: [],
    });
  });

  it('does not grant the discount with less than a full soft allotment', () => {
    const selected = selectSoftMaterialTerms(state({ coalStock: 4, coalAccess: true }), 'player', 'factory');
    expect(selected).toMatchObject({ multiplier: 1, rows: [], substitutions: [] });
  });

  it('leaves normal-cost production available without any coal', () => {
    const selected = selectSoftMaterialTerms(state({ coalStock: 0, coalAccess: false }), 'player', 'factory');
    expect(selected.multiplier).toBe(1);
    expect(selected.rows).toEqual([]);
  });

  it('uses Circular Manufacturing as a substitution without creating stock or a hard recipe row', () => {
    const selected = selectSoftMaterialTerms(
      state({ techs: [], circular: true, circularChoice: 'aluminum' }),
      'player',
      'jet_fighter',
    );
    expect(selected).toMatchObject({
      multiplier: 0.85,
      rows: [],
      substitutions: ['aluminum'],
    });
  });

  it('never lets the substitution satisfy a hard uranium weapon', () => {
    const selected = selectSoftMaterialTerms(
      state({ techs: ['nuclear-submarines'], circular: true, circularChoice: 'aluminum' }),
      'player',
      'missile_submarine',
    );
    expect(selected).toMatchObject({ multiplier: 1, rows: [], substitutions: [] });
  });

  it('prefers finite stock over substitution when both are available', () => {
    const selected = selectSoftMaterialTerms(
      state({ techs: ['steam-power'], coalStock: 5, coalAccess: true }),
      'player',
      'factory',
    );
    expect(selected.substitutions).toEqual([]);
    expect(selected.rows).toEqual([{ goodId: coal, quantity: 5 }]);
  });
});
