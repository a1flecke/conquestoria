import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { migrateRetiredMarketAccess } from '@/storage/migrations/steps/retired-market-access';
import { getLuxuryCoverage } from '@/systems/luxury-service-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import { getReserveBalance } from '@/systems/resource-reserve-system';

/**
 * #1516 MR19 — the retired instant market's saved access list is consumed once.
 *
 * A pre-containment save could carry purchased access. Schema 36 already funded any active work that
 * access entitled, so this step preserves only what the entry still means: luxury access becomes
 * delivered coverage at its recorded expiry, a strategic entry is dropped without fabricating stock,
 * and the list is cleared.
 */

const SILK = resourceGoodId('silk');
const IRON = resourceGoodId('iron');

function world(entries: NonNullable<GameState['marketplace']>['purchasedResources']): GameState {
  return {
    turn: 10,
    cities: {},
    civilizations: {
      player: { id: 'player', cities: [], units: [] },
      other: { id: 'other', cities: [], units: [] },
    },
    units: {},
    map: { width: 4, height: 4, tiles: {}, wrapsHorizontally: false, rivers: [] },
    marketplace: { tradeRoutes: [], purchasedResources: entries },
    materialReservesByCiv: {
      player: { balances: {}, reservations: [], incoming: [] },
    },
  } as unknown as GameState;
}

describe('#1516 MR19 — retired market access migration', () => {
  it('turns a live luxury entry into delivered coverage at its recorded expiry', () => {
    const migrated = migrateRetiredMarketAccess(world([
      { civId: 'player', resource: 'silk', expiresOnTurn: 15 },
    ]));
    expect(getLuxuryCoverage(migrated, 'player', SILK)).toEqual({
      goodId: SILK,
      expiresOnTurn: 15,
      supplierCivIds: [],
    });
    expect(migrated.marketplace!.purchasedResources).toEqual([]);
  });

  it('drops a strategic entry without inventing stock or gold', () => {
    const migrated = migrateRetiredMarketAccess(world([
      { civId: 'player', resource: 'iron', expiresOnTurn: 15 },
    ]));
    expect(getReserveBalance(migrated.materialReservesByCiv!.player!, IRON).native).toBe(0);
    expect(getReserveBalance(migrated.materialReservesByCiv!.player!, IRON).imported).toBe(0);
    expect(migrated.marketplace!.purchasedResources).toEqual([]);
  });

  it('ignores an entry that already expired and never extends a recorded expiry', () => {
    const expired = migrateRetiredMarketAccess(world([
      { civId: 'player', resource: 'silk', expiresOnTurn: 10 },
    ]));
    expect(getLuxuryCoverage(expired, 'player', SILK)).toBeUndefined();

    const later = migrateRetiredMarketAccess(world([
      { civId: 'player', resource: 'silk', expiresOnTurn: 12 },
      { civId: 'player', resource: 'silk', expiresOnTurn: 15 },
    ]));
    expect(getLuxuryCoverage(later, 'player', SILK)?.expiresOnTurn).toBe(15);
  });

  it('is idempotent and leaves a state without the field untouched', () => {
    const state = world([]);
    expect(migrateRetiredMarketAccess(state)).toBe(state);

    const once = migrateRetiredMarketAccess(world([
      { civId: 'player', resource: 'silk', expiresOnTurn: 15 },
    ]));
    const twice = migrateRetiredMarketAccess(once);
    expect(twice).toEqual(once);
  });
});
