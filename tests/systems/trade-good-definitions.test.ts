import { describe, expect, it } from 'vitest';
import {
  RESOURCE_BACKED_GOODS,
  buildResourceBackedGoods,
  findTradeGood,
  isStoredQuantityGood,
  resourceGoodId,
  validateTradeGoodDefinitions,
  type TradeGoodDefinition,
} from '@/systems/trade-good-definitions';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';

/**
 * #1505 MR08: resource-backed goods are derived, never a second catalog, and the ledger arithmetic is
 * generic over an opaque good id — including a test-defined non-deposit good (no manufacturing ships).
 */

const QUANTITATIVE_RESOURCES = RESOURCE_DEFINITIONS.filter(definition => (definition.economicRoles?.length ?? 0) > 0);

describe('#1505 MR08 — the trade-good catalog', () => {
  it('derives one good per resource with a stable opaque id', () => {
    expect(RESOURCE_BACKED_GOODS).toHaveLength(RESOURCE_DEFINITIONS.length);
    expect(resourceGoodId('iron')).toBe('resource:iron');
    expect(findTradeGood('resource:iron')?.name).toBe('Iron');
    expect(findTradeGood('resource:not-a-resource')).toBeNull();
  });

  it('classifies every quantitative resource as stored quantity, and every luxury as access', () => {
    expect(QUANTITATIVE_RESOURCES.length).toBeGreaterThan(0);
    for (const resource of QUANTITATIVE_RESOURCES) {
      const good = findTradeGood(resourceGoodId(resource.id))!;
      expect(good.settlement, `${resource.id}`).toBe('stored-quantity');
      expect(isStoredQuantityGood(good)).toBe(true);
      expect(good.uses.some(use => use === 'material' || use === 'fuel')).toBe(true);
    }
    for (const resource of RESOURCE_DEFINITIONS.filter(candidate => candidate.type === 'luxury')) {
      const good = findTradeGood(resourceGoodId(resource.id))!;
      expect(good.settlement, `${resource.id}`).toBe('continuing-access');
      expect(good.uses).toContain('access');
    }
  });

  it('keeps cattle and salt non-quantitative (the plan’s explicit exception)', () => {
    for (const id of ['cattle', 'salt'] as const) {
      const good = findTradeGood(resourceGoodId(id))!;
      expect(good.settlement, id).toBe('continuing-access');
      expect(good.uses).not.toContain('material');
      expect(good.uses).not.toContain('fuel');
    }
  });

  it('the shipped catalog validates with no errors', () => {
    expect(validateTradeGoodDefinitions(RESOURCE_BACKED_GOODS)).toEqual([]);
  });

  it('rejects dangling sources, duplicate ids, unusable settlement and missing uses', () => {
    const valid: TradeGoodDefinition = {
      id: 'resource:iron', name: 'Iron', nativeSource: { kind: 'resource', resource: 'iron' },
      settlement: 'stored-quantity', uses: ['material'], cargoSpacePerUnit: 1,
    };
    expect(validateTradeGoodDefinitions([valid])).toEqual([]);

    const errors = validateTradeGoodDefinitions([
      valid,
      { ...valid },                                                        // duplicate id
      { ...valid, id: 'bad:source', nativeSource: { kind: 'resource', resource: 'unobtainium' as never } },
      { ...valid, id: 'bad:cargo', cargoSpacePerUnit: 0 },
      { ...valid, id: 'bad:uses', uses: [] },
      { ...valid, id: 'bad:stock', uses: ['access'], settlement: 'stored-quantity' },
      { ...valid, id: 'bad:nosource', nativeSource: null },
    ]);
    expect(errors.some(error => error.includes('duplicate good id'))).toBe(true);
    expect(errors.some(error => error.includes('unknown resource'))).toBe(true);
    expect(errors.some(error => error.includes('cargoSpacePerUnit'))).toBe(true);
    expect(errors.some(error => error.includes('no implemented use'))).toBe(true);
    expect(errors.some(error => error.includes('material or fuel use'))).toBe(true);
    expect(errors.some(error => error.includes('no native source or producer'))).toBe(true);
  });

  it('supports a test-defined non-deposit good through a registered producer', () => {
    const fixture: TradeGoodDefinition = {
      id: 'fixture:toolworks', name: 'Tools', nativeSource: { kind: 'producer', producerId: 'test:toolworks' },
      settlement: 'stored-quantity', uses: ['material'], cargoSpacePerUnit: 2,
    };
    const context = {
      knownResources: new Set(RESOURCE_DEFINITIONS.map(definition => definition.id)),
      knownProducers: new Set(['test:toolworks']),
    };

    expect(validateTradeGoodDefinitions([fixture], context)).toEqual([]);
    expect(findTradeGood('fixture:toolworks', [fixture])?.cargoSpacePerUnit).toBe(2);
    // Nothing in the shipped pipeline knows this id, and it still works: no prefix parsing anywhere.
    expect(findTradeGood('fixture:toolworks')).toBeNull();
  });

  it('builds the same goods from an explicit catalog (composition is data, not a module side effect)', () => {
    const onlyIron = buildResourceBackedGoods(RESOURCE_DEFINITIONS.filter(definition => definition.id === 'iron'));
    expect(onlyIron).toHaveLength(1);
    expect(onlyIron[0].nativeSource).toEqual({ kind: 'resource', resource: 'iron' });
  });
});
