// src/systems/trade-good-definitions.ts
// #1505 MR08: what commerce can carry, composed once from the catalog that already owns the facts.
//
// A *resource* is something the world/acquisition system recognizes; a *good* is something commerce
// can offer, carry, deliver or consume. MR08 does not ship a manufacturing feature — it establishes
// the composition and the stable identifiers so MR09+ can add consumers without a second catalog:
//
//  - Resource-backed goods are *derived* from `RESOURCE_DEFINITIONS`, so a good can never duplicate a
//    resource's name, reveal technology, improvement rule or economic roles.
//  - A non-deposit good (made by a process rather than a map tile) names a registered producer instead
//    of a resource. MR08 ships none; tests register a fixture through validation so the ledger
//    arithmetic is proved generic without inventing gameplay.
//  - Good IDs are stable and opaque. Nothing may parse an ID to learn semantics; the definition is the
//    only authority, resolved through `findTradeGood`.
import type { ResourceType } from '@/core/types';
import {
  RESOURCE_DEFINITIONS,
  type ResourceDefinition,
  type ResourceEconomicRole,
} from './resource-definitions';

/** Stable, opaque commerce identifier. Never parse it — look the definition up. */
export type TradeGoodId = string;

/** How a good's delivered quantity settles. An unknown kind must never fall through as stock. */
export type GoodSettlementKind = 'stored-quantity' | 'continuing-access';

/** Where legitimate native stock comes from. */
export type TradeGoodNativeSource =
  | { kind: 'resource'; resource: ResourceType }
  | { kind: 'producer'; producerId: string };

export type GoodUse = ResourceEconomicRole | 'access';

export interface TradeGoodDefinition {
  id: TradeGoodId;
  name: string;
  /** Native source/producer, or null for a definition that must not be offered (validation rejects it). */
  nativeSource: TradeGoodNativeSource | null;
  settlement: GoodSettlementKind;
  /** Every use this good has. A stored good with no use must not be offered. */
  uses: readonly GoodUse[];
  /** Integer cargo space per unit (or per service bundle). */
  cargoSpacePerUnit: number;
}

/** The stable ID for a resource-backed good. Built here and nowhere else. */
export function resourceGoodId(resource: ResourceType): TradeGoodId {
  return `resource:${resource}`;
}

function usesForResource(definition: ResourceDefinition): GoodUse[] {
  const roles: GoodUse[] = [...(definition.economicRoles ?? [])];
  // A resource with no quantitative role is delivered/worked *access* (luxury happiness, cattle food,
  // salt gold) — that is its one implemented use, and the reason it is not a counted stock.
  if (roles.length === 0) roles.push('access');
  return roles;
}

function settlementForResource(definition: ResourceDefinition): GoodSettlementKind {
  // A good is a counted stock only when it has a quantitative role. Everything else settles as
  // continuing access, which is the only other kind this project implements.
  return (definition.economicRoles?.length ?? 0) > 0 ? 'stored-quantity' : 'continuing-access';
}

/** Compose the resource-backed half of the catalog from the resource catalog itself. */
export function buildResourceBackedGoods(
  definitions: readonly ResourceDefinition[] = RESOURCE_DEFINITIONS,
): TradeGoodDefinition[] {
  return definitions.map(definition => ({
    id: resourceGoodId(definition.id),
    name: definition.name,
    nativeSource: { kind: 'resource', resource: definition.id },
    settlement: settlementForResource(definition),
    uses: usesForResource(definition),
    cargoSpacePerUnit: 1,
  }));
}

export const RESOURCE_BACKED_GOODS: readonly TradeGoodDefinition[] = buildResourceBackedGoods();

/** Look up a good by its stable ID. Returns null for an unknown ID (never a guessed definition). */
export function findTradeGood(
  id: TradeGoodId,
  definitions: readonly TradeGoodDefinition[] = RESOURCE_BACKED_GOODS,
): TradeGoodDefinition | null {
  return definitions.find(candidate => candidate.id === id) ?? null;
}

export function isStoredQuantityGood(
  definition: TradeGoodDefinition,
): definition is TradeGoodDefinition & { settlement: 'stored-quantity' } {
  return definition.settlement === 'stored-quantity';
}

export interface TradeGoodCatalogContext {
  /** Resources the world catalog knows about — used to reject a dangling resource source. */
  knownResources: ReadonlySet<ResourceType>;
  /** Producers a non-deposit good may name. Empty by default: MR08 ships no manufacturing. */
  knownProducers: ReadonlySet<string>;
}

export const DEFAULT_TRADE_GOOD_CONTEXT: TradeGoodCatalogContext = {
  knownResources: new Set(RESOURCE_DEFINITIONS.map(definition => definition.id)),
  knownProducers: new Set<string>(),
};

/**
 * Validate a whole catalog (built-in plus any fixture). Returns human-readable errors; an empty list
 * means the catalog is coherent. The checks are the ones the ledger depends on: unique ids, a real
 * source or producer, an implemented settlement kind, a unit cargo cost, and a real use.
 */
export function validateTradeGoodDefinitions(
  definitions: readonly TradeGoodDefinition[],
  context: TradeGoodCatalogContext = DEFAULT_TRADE_GOOD_CONTEXT,
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const definition of definitions) {
    const label = definition.id || '<missing id>';
    if (!definition.id) errors.push('a good must have a stable id');
    if (seen.has(definition.id)) errors.push(`${label}: duplicate good id`);
    seen.add(definition.id);
    if (!definition.name.trim()) errors.push(`${label}: missing display name`);

    if (!definition.nativeSource) {
      errors.push(`${label}: no native source or producer — an unused good must not be offered`);
    } else if (definition.nativeSource.kind === 'resource') {
      if (!context.knownResources.has(definition.nativeSource.resource)) {
        errors.push(`${label}: native source references unknown resource ${definition.nativeSource.resource}`);
      }
    } else if (!context.knownProducers.has(definition.nativeSource.producerId)) {
      errors.push(`${label}: native producer ${definition.nativeSource.producerId} is not registered`);
    }

    if (definition.settlement !== 'stored-quantity' && definition.settlement !== 'continuing-access') {
      errors.push(`${label}: unsupported settlement kind ${String(definition.settlement)}`);
    }
    if (!Number.isInteger(definition.cargoSpacePerUnit) || definition.cargoSpacePerUnit <= 0) {
      errors.push(`${label}: cargoSpacePerUnit must be a positive integer`);
    }
    if (definition.uses.length === 0) {
      errors.push(`${label}: no implemented use`);
    }

    // A counted stock with no quantitative use would be a stockpile nothing can spend.
    if (definition.settlement === 'stored-quantity' && !definition.uses.some(use => use !== 'access')) {
      errors.push(`${label}: a stored-quantity good needs a material or fuel use`);
    }
  }

  return errors;
}
