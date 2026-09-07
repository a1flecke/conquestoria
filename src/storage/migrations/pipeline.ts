import type { CompatibilityNormalizer, CorruptionRepair } from './types';
import { COMPATIBILITY_NORMALIZERS } from './compatibility';
import { CORRUPTION_REPAIRS } from './repair';

/**
 * #1023 — the unconditional pass order.
 *
 * The three registries answer "what kind of mechanism is this, and why is it
 * admissible?". They deliberately do NOT answer "in what order do the
 * unconditional ones run", because that order predates the refactor and was
 * never proven to be free: several passes read fields an earlier pass defaults
 * (religion defaults before the city-faith conversion; the generated-officer
 * registry before the career ledger that references it).
 *
 * So the sequence below is the legacy tail order, verbatim, rather than
 * "all normalizers then all repairs". Regrouping would be a behaviour change
 * dressed as a refactor. `save-migration-registries.test.ts` asserts this list
 * is exactly the union of both registries, so an entry cannot be added to a
 * registry and silently never run — or run twice.
 */
const UNCONDITIONAL_ORDER: readonly string[] = [
  'missing-game-identity',                  // repair
  'autonomy-network-postures',              // compatibility
  'circular-manufacturing-choices',         // compatibility
  'legacy-tech-grace',                      // repair
  'crisis-archetypes',                      // compatibility
  'religion-defaults',                      // compatibility
  'generated-generals',                     // repair
  'general-career-ledger',                  // repair
  'vassalage',                              // repair
  'city-faith-conversion-progress',         // compatibility
  'retimed-biplane-queues',                 // compatibility
  'coastal-battery-counterfire-turns',      // repair
  'improvement-values',                     // repair
  'barbarian-camp-pressure',                // compatibility
  'legendary-wonder-military-facts',        // repair
  'legendary-wonder-tactical-effects',      // repair
];

export type UnconditionalPass =
  | (CompatibilityNormalizer & { kind: 'compatibility' })
  | (CorruptionRepair & { kind: 'repair' });

const BY_ID = new Map<string, UnconditionalPass>([
  ...COMPATIBILITY_NORMALIZERS.map(entry => [entry.id, { ...entry, kind: 'compatibility' as const }] as const),
  ...CORRUPTION_REPAIRS.map(entry => [entry.id, { ...entry, kind: 'repair' as const }] as const),
]);

/** Every unconditional pass, in the order a load applies them. */
export const UNCONDITIONAL_PASSES: readonly UnconditionalPass[] = UNCONDITIONAL_ORDER.map(id => {
  const entry = BY_ID.get(id);
  if (!entry) {
    throw new Error(
      `Unconditional pass "${id}" is listed in the pipeline order but is in neither `
      + 'COMPATIBILITY_NORMALIZERS nor CORRUPTION_REPAIRS.',
    );
  }
  return entry;
});
