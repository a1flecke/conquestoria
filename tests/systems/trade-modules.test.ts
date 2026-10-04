import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as marketplace from '@/systems/marketplace-system';
import * as resources from '@/systems/resource-definitions';
import * as caravan from '@/systems/trade-caravan-system';
import * as economy from '@/systems/trade-route-economy';
import * as lifecycle from '@/systems/trade-route-lifecycle';

/**
 * #1249: trade-system.ts (504 lines, 24 exports, fan-in 22) was split by responsibility and deleted —
 * there is no compatibility barrel. These pins make the public surface explicit: each module's exact
 * runtime export list, so a new export is a deliberate edit here. Dependency direction is pinned by the
 * `trade-*` / `resource-catalog` rules in tests/app/architecture/rules.ts.
 */
const SURFACE: Array<[name: string, module: object, exports: string[]]> = [
  ['marketplace-system', marketplace,
    ['calculatePrice', 'createMarketplaceState', 'detectMonopoly', 'processFashionCycle', 'updatePrices']],
  ['trade-route-economy', economy,
    ['calculateTradeRouteGold', 'getEffectiveGoldPerTurn', 'getRouteCapacity', 'getRouteTechGoldBonus',
      'getTradeUnitTripBonus', 'processTradeRouteIncome']],
  // getRouteDiplomacy is the one new export: establishment and the stale-route scrub now share it.
  ['trade-route-lifecycle', lifecycle,
    ['getRouteDiplomacy', 'removeRouteById', 'removeRouteForUnit', 'scrubEmbargoedRoutes', 'scrubStaleForeignRoutes']],
  ['trade-caravan-system', caravan, ['canEstablishRoute', 'establishRoute', 'resolveFromCity']],
  ['resource-definitions', resources,
    ['BASE_PRICES', 'RESOURCE_DEFINITIONS', 'RESOURCE_ICONS', 'RESOURCE_TECH', 'getResourceEffectLabel']],
];

describe('#1249 — the trade modules keep their audited public surface', () => {
  for (const [name, module, exports] of SURFACE) {
    it(`${name} exports exactly its responsibility`, () => {
      expect(Object.keys(module).sort()).toEqual([...exports].sort());
    });
  }

  it('every pre-split value export is accounted for: 22 originals (24 minus the 2 re-exported types) + getResourceEffectLabel + getRouteDiplomacy', () => {
    const values = SURFACE.flatMap(([, , exports]) => exports);
    expect(new Set(values).size, 'no export is owned by two modules').toBe(values.length);
    expect(values).toHaveLength(24);
  });

  it('helpers that were private before the split stay private', () => {
    expect(caravan).not.toHaveProperty('routesFromCity');
    expect(economy).not.toHaveProperty('TRADE_UNIT_TIER_BONUS');
  });

  it('the compatibility barrel is gone and must not come back', () => {
    expect(existsSync(resolve(__dirname, '../../src/systems/trade-system.ts'))).toBe(false);
  });
});
