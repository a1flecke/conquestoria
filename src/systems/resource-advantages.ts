import type { ResourceType } from '@/core/types';
import type { MaterialCostRow, ReserveLedger } from '@/core/types/commerce';
import { getFreeQuantity } from './resource-reserve-system';
import { aggregateMaterialRows } from './resource-material-costs';
import { findTradeGood, isStoredQuantityGood, resourceGoodId, type TradeGoodId } from './trade-good-definitions';

export interface ResourceAdvantageDefinition {
  resource: ResourceType;
  discount: number;
  itemIds: readonly string[];
  /** Optional finite units of this counted good consumed for the discount. */
  softCost?: number;
  /** Defaults to true for Circular Manufacturing's strategic material substitution. */
  allowMaterialSubstitution?: boolean;
}

/** Shared finite soft-material allotment (half the standard hard recipe). */
export const DEFAULT_SOFT_MATERIAL_COST = 5;

export const RESOURCE_ADVANTAGES: readonly ResourceAdvantageDefinition[] = [
  { resource: 'coal', discount: 0.20, itemIds: ['factory', 'steamship', 'ironclad'] },
  { resource: 'oil', discount: 0.15, itemIds: ['tank', 'biplane', 'bomber', 'carrier', 'attack_helicopter'] },
  { resource: 'aluminum', discount: 0.15, itemIds: ['jet_fighter', 'stealth_bomber', 'combat_drone'] },
  { resource: 'rare-earth-elements', discount: 0.15, itemIds: ['combat_drone', 'drone_controller', 'autonomous_frigate', 'electronic_warfare_array', 'network_operations_center'] },
  { resource: 'battery-minerals', discount: 0.15, itemIds: ['combat_drone', 'exosuit_infantry', 'smart_grid', 'drone_fabricator', 'circular_fabricator'] },
  { resource: 'ivory', discount: 0.15, itemIds: ['war_elephant'], allowMaterialSubstitution: false },
];

export function getResourceAdvantagesForItem(itemId: string): readonly ResourceAdvantageDefinition[] {
  return RESOURCE_ADVANTAGES.filter(advantage => advantage.itemIds.includes(itemId));
}

/** Shared soft-material cost multiplier. Hard requirements remain catalog eligibility. */
export function getResourceAdvantageMultiplier(
  itemId: string,
  availableResources: ReadonlySet<ResourceType>,
  materialSubstitution?: ResourceType,
): number {
  let multiplier = 1;
  for (const advantage of RESOURCE_ADVANTAGES) {
    const hasLiveResource = availableResources.has(advantage.resource);
    const hasEligibleSubstitution = advantage.allowMaterialSubstitution !== false
      && materialSubstitution === advantage.resource;
    if ((hasLiveResource || hasEligibleSubstitution) && advantage.itemIds.includes(itemId)) {
      multiplier *= 1 - advantage.discount;
    }
  }
  return Math.max(0.75, multiplier);
}

export interface SelectedSoftMaterialTerm {
  resource: ResourceType;
  goodId: TradeGoodId;
  discount: number;
  /** Stock units this term consumes; 0 for an access or substitution term. */
  quantity: number;
  via: 'stock' | 'substitution' | 'access';
}

export interface SelectedSoftMaterialTerms {
  /** Combined multiplier for every selected term, floored at the shared 0.75 cap. */
  multiplier: number;
  /** Stock rows to reserve/consume; empty for substitution/access terms. */
  rows: readonly MaterialCostRow[];
  /** Circular Manufacturing advantages used without stock. */
  substitutions: readonly ResourceType[];
  terms: readonly SelectedSoftMaterialTerm[];
}

export interface SoftMaterialSelectionInputs {
  availableResources: ReadonlySet<ResourceType>;
  substitution?: ResourceType;
  ledger: ReserveLedger;
}

/**
 * Pure finite selector. It lives in this leaf (rather than the state wrapper) so the canonical
 * pricing core can use it without importing the national-project/city graph and creating a cycle.
 */
export function selectSoftMaterialTermsFromInputs(
  itemId: string,
  inputs: SoftMaterialSelectionInputs,
): SelectedSoftMaterialTerms {
  const terms: SelectedSoftMaterialTerm[] = [];
  const rows: MaterialCostRow[] = [];

  for (const advantage of getResourceAdvantagesForItem(itemId)) {
    const goodId = resourceGoodId(advantage.resource);
    const good = findTradeGood(goodId);
    const hasLiveAccess = inputs.availableResources.has(advantage.resource);
    const allowsSubstitution = advantage.allowMaterialSubstitution !== false
      && inputs.substitution === advantage.resource;

    if (hasLiveAccess && (!good || !isStoredQuantityGood(good))) {
      // Continuing-access goods cannot be stockpiled and keep their explicit access term.
      terms.push({ resource: advantage.resource, goodId, discount: advantage.discount, quantity: 0, via: 'access' });
      continue;
    }

    if (hasLiveAccess && good && isStoredQuantityGood(good)) {
      const quantity = advantage.softCost ?? DEFAULT_SOFT_MATERIAL_COST;
      if (getFreeQuantity(inputs.ledger, goodId) >= quantity) {
        terms.push({ resource: advantage.resource, goodId, discount: advantage.discount, quantity, via: 'stock' });
        rows.push({ goodId, quantity });
        continue;
      }
    }

    if (allowsSubstitution) {
      terms.push({ resource: advantage.resource, goodId, discount: advantage.discount, quantity: 0, via: 'substitution' });
    }
  }

  if (terms.length === 0) {
    return { multiplier: 1, rows: [], substitutions: [], terms: [] };
  }

  const multiplier = Math.max(
    0.75,
    terms.reduce((product, term) => product * (1 - term.discount), 1),
  );
  return {
    multiplier,
    rows: aggregateMaterialRows(rows),
    substitutions: terms.filter(term => term.via === 'substitution').map(term => term.resource),
    terms,
  };
}
