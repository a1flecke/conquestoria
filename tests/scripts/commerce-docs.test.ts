import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #1516 MR19 — durable commerce documentation.
 *
 * The final slice promotes the stable rules and the four extension recipes out of the deleted
 * implementation plan. This pins the recipe owners and the retirement statement so the document
 * cannot drift back into advertising a retired path.
 */

const doc = readFileSync(resolve(__dirname, '../../docs/commerce.md'), 'utf8');

describe('#1516 MR19 — docs/commerce.md', () => {
  it('names all four extension recipes', () => {
    for (const heading of [
      '### Add a natural resource',
      '### Add a non-deposit good',
      '### Add a trading unit',
      '### Add a danger',
    ]) {
      expect(doc).toContain(heading);
    }
  });

  it('names the definition owner and the contract test for each recipe', () => {
    for (const owner of [
      'resource-definitions.ts',
      'trade-good-definitions.ts',
      'unit-definitions.ts',
      'trade-danger-adapters.ts',
    ]) {
      expect(doc).toContain(owner);
    }
    expect(doc).toContain('commerce-extension-contract.test.ts');
  });

  it('states the one supported purchase path and the save-shape rule', () => {
    expect(doc).toContain('no instant purchase');
    expect(doc).toContain('seller offer → quote → load → manifest → home delivery');
    expect(doc).toContain('CURRENT_SAVE_SCHEMA_VERSION');
    expect(doc).toContain('Schema 37');
  });

  it('does not advertise a retired purchase or world-price surface', () => {
    expect(doc).not.toContain('Buy Resource');
    expect(doc).not.toContain('fashion cycle is available');
  });
});
