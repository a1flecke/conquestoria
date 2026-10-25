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
import type { MaterialCostRow, TradeGoodId } from '@/core/types/commerce';
import {
  RESOURCE_DEFINITIONS,
  type ResourceDefinition,
  type ResourceEconomicRole,
} from './resource-definitions';

/** Stable, opaque commerce identifier. Never parse it — look the definition up. */
export type { TradeGoodId } from '@/core/types/commerce';

/** How a good's delivered quantity settles. An unknown kind must never fall through as stock. */
export type GoodSettlementKind = 'stored-quantity' | 'continuing-access';

/** Where legitimate native stock comes from. */
export type TradeGoodNativeSource =
  | { kind: 'resource'; resource: ResourceType }
  | { kind: 'producer'; producerId: string };

export type GoodUse = ResourceEconomicRole | 'access';

/**
 * #1506 MR09: the pure quantity calibration for a counted good. One shared default set; a genuine
 * non-deposit fixture may provide its own profile instead of inheriting the resource calibration.
 */
export interface GoodQuantityProfile {
  /** Units a standard hard recipe row requires for this good. */
  standardRecipeQuantity: number;
  /** Maximum storable units of this good. */
  storageCapacity: number;
  /** Native units a civilization gains per owned source per completed round. */
  nativePerSourcePerRound: number;
}

/** Shared calibration defaults (parent §3.1). UI/AI/migration read these, never a local copy. */
export const STANDARD_HARD_RECIPE_QUANTITY = 10;
export const DEFAULT_STORAGE_PER_GOOD = 40;
export const DEFAULT_NATIVE_PER_SOURCE_PER_ROUND = 2;

export function standardQuantityProfile(): GoodQuantityProfile {
  return {
    standardRecipeQuantity: STANDARD_HARD_RECIPE_QUANTITY,
    storageCapacity: DEFAULT_STORAGE_PER_GOOD,
    nativePerSourcePerRound: DEFAULT_NATIVE_PER_SOURCE_PER_ROUND,
  };
}

export interface TradeGoodDefinition {
  id: TradeGoodId;
  name: string;
  /** Native source/producer, or null for a definition that must not be offered (validation rejects it). */
  nativeSource: TradeGoodNativeSource | null;
  settlement: GoodSettlementKind;
  /** Every use this good has. A stored good with no use must not be offered. */
  uses: readonly GoodUse[];
  /** Posted-price base before a market band; always the definition's value, never a world-price mirror. */
  basePrice: number;
  /** Integer cargo space per unit (or per service bundle). */
  cargoSpacePerUnit: number;
  /** Present exactly for a `stored-quantity` good: the quantity calibration it settles against. */
  quantity?: GoodQuantityProfile;
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
  return definitions.map(definition => {
    const settlement = settlementForResource(definition);
    return {
      id: resourceGoodId(definition.id),
      name: definition.name,
      nativeSource: { kind: 'resource', resource: definition.id },
      settlement,
      uses: usesForResource(definition),
      basePrice: definition.basePrice,
      cargoSpacePerUnit: 1,
      ...(settlement === 'stored-quantity' ? { quantity: standardQuantityProfile() } : {}),
    };
  });
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

/**
 * #1506 MR09: project a material recipe's goods back to the map resources it names. This is the one
 * bridge between the editable `materialCosts` authority and the legacy `resourceRequired` list, so
 * the two can never drift. A non-deposit good contributes no entry.
 */
export function resourcesForMaterialCosts(
  rows: readonly MaterialCostRow[],
  definitions: readonly TradeGoodDefinition[] = RESOURCE_BACKED_GOODS,
): ResourceType[] {
  const resources: ResourceType[] = [];
  for (const row of rows) {
    const nativeSource = findTradeGood(row.goodId, definitions)?.nativeSource;
    if (nativeSource?.kind === 'resource' && !resources.includes(nativeSource.resource)) {
      resources.push(nativeSource.resource);
    }
  }
  return resources;
}

/** Derive the transitional `resourceRequired` projection for a catalog entry. */
export function withDerivedResourceRequired<
  T extends { materialCosts?: readonly MaterialCostRow[]; resourceRequired?: ResourceType[] },
>(entry: T): T {
  if (!entry.materialCosts) return entry;
  return { ...entry, resourceRequired: resourcesForMaterialCosts(entry.materialCosts) };
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
    if (!Number.isSafeInteger(definition.basePrice) || definition.basePrice <= 0) {
      errors.push(`${label}: basePrice must be a positive safe integer`);
    }
    if (definition.uses.length === 0) {
      errors.push(`${label}: no implemented use`);
    }

    if (definition.settlement === 'stored-quantity') {
      if (!definition.quantity) {
        errors.push(`${label}: a stored-quantity good needs a quantity profile`);
      } else {
        for (const field of ['standardRecipeQuantity', 'storageCapacity', 'nativePerSourcePerRound'] as const) {
          const value = definition.quantity[field];
          if (!Number.isSafeInteger(value) || value <= 0) {
            errors.push(`${label}: quantity.${field} must be a positive safe integer`);
          }
        }
      }
    } else if (definition.quantity) {
      errors.push(`${label}: a continuing-access good must not carry a quantity profile`);
    }

    // A counted stock with no quantitative use would be a stockpile nothing can spend.
    if (definition.settlement === 'stored-quantity' && !definition.uses.some(use => use !== 'access')) {
      errors.push(`${label}: a stored-quantity good needs a material or fuel use`);
    }
  }

  return errors;
}
