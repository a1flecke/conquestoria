import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * #1516 MR19 — the retired market leaves no live consumer.
 *
 * A scoped source scan, not a runtime assertion: the instant purchase executor, its containment copy,
 * and the global world-price/fashion cycle are gone from current code. Only the frozen save-shape
 * fields in `core/types.ts` and the ordered migration steps may still mention them.
 */

const SRC = resolve(__dirname, '../../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const RETIRED_SYMBOLS = [
  'performBuyResourceAccess',
  'getResourcePurchaseDecision',
  'getInstantResourcePurchaseNotice',
  'getResourceAccessCost',
  'RESOURCE_MARKET_REBUILDING_REASON',
  'isInstantResourcePurchaseOpen',
  'processFashionCycle',
  'updatePrices',
  'calculatePrice',
  'detectMonopoly',
];

/** Legacy fields may survive only as the frozen save shape and its ordered migrations. */
const LEGACY_FIELDS = ['prices', 'priceHistory', 'fashionable', 'fashionTurnsLeft', 'purchasedResources'];

function isLegacyOwner(relativePath: string): boolean {
  return relativePath === 'core/types.ts' || relativePath.startsWith('storage/migrations/');
}

describe('#1516 MR19 — the retired market has no live consumer', () => {
  const files = sourceFiles(SRC).map(file => ({ path: file, relative: file.slice(SRC.length + 1) }));

  it('no current source references a retired instant-purchase or world-price symbol', () => {
    const violations = files.flatMap(({ path, relative }) => {
      const text = readFileSync(path, 'utf8');
      return RETIRED_SYMBOLS.filter(symbol => text.includes(symbol)).map(symbol => `${relative}: ${symbol}`);
    });
    expect(violations).toEqual([]);
  });

  it('no runtime file outside the frozen save shape reads a legacy marketplace field', () => {
    const violations = files
      .filter(({ relative }) => !isLegacyOwner(relative))
      .flatMap(({ path, relative }) => {
        const text = readFileSync(path, 'utf8');
        return LEGACY_FIELDS
          .filter(field => new RegExp(`marketplace[^\\n]{0,40}\\.${field}\\b`).test(text))
          .map(field => `${relative}: marketplace.${field}`);
      });
    expect(violations).toEqual([]);
  });

  it('the live marketplace panel advertises no purchase affordance or containment copy', () => {
    const panel = readFileSync(join(SRC, 'ui/marketplace-panel.ts'), 'utf8');
    expect(panel).not.toContain('data-buy-resource-btn');
    expect(panel).not.toContain('resource-imports-rebuilding');
    expect(panel).not.toContain('Buy Resource');
  });
});
