// src/systems/soft-material-terms.ts
// #1507 MR10: the one selector for finite, optional soft-material terms.
//
// A soft advantage is never "access = infinite discount". It needs a real free
// stock allotment, or an eligible Circular Manufacturing substitution for the
// one soft material that network supplies. The selector is pure; callers either
// snapshot its result for active work (and reserve the rows) or use it as a
// queued/estimate quote.
import type { GameState } from '@/core/types';
import type { MaterialCostRow, TradeGoodId } from '@/core/types/commerce';
import type { ResourceType } from '@/core/types/resources';
import type { ReserveLedger } from '@/core/types/commerce';
import {
  DEFAULT_SOFT_MATERIAL_COST,
  getResourceAdvantagesForItem,
} from './resource-advantages';
import { getCivAvailableResources } from './resource-acquisition-system';
import { getCivMaterialLedger } from './resource-material-state';
import { getFreeQuantity } from './resource-reserve-system';
import { getCircularManufacturingMaterial } from './national-project-system';
import { aggregateMaterialRows } from './resource-material-costs';
import { findTradeGood, isStoredQuantityGood, resourceGoodId } from './trade-good-definitions';

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

export interface SoftMaterialSelectionOptions {
  availableResources?: ReadonlySet<ResourceType>;
  substitution?: ResourceType;
  ledger?: ReserveLedger;
}

/**
 * Select every eligible soft advantage for one item.
 *
 * - stock is preferred when the full soft allotment is free;
 * - a permitted Circular Manufacturing substitution supplies the term without
 *   creating stock, a hard-material row, or fuel;
 * - an insufficient allotment yields no term (normal-cost production remains);
 * - non-stock access goods (Ivory) keep their explicitly scoped access term.
 */
export function selectSoftMaterialTerms(
  state: GameState,
  civId: string,
  itemId: string,
  options: SoftMaterialSelectionOptions = {},
): SelectedSoftMaterialTerms {
  const availableResources = options.availableResources ?? getCivAvailableResources(state, civId);
  const substitution = options.substitution ?? getCircularManufacturingMaterial(state, civId);
  const ledger = options.ledger ?? getCivMaterialLedger(state, civId);
  const terms: SelectedSoftMaterialTerm[] = [];
  const rows: MaterialCostRow[] = [];

  for (const advantage of getResourceAdvantagesForItem(itemId)) {
    const goodId = resourceGoodId(advantage.resource);
    const good = findTradeGood(goodId);
    const hasLiveAccess = availableResources.has(advantage.resource);
    const allowsSubstitution = advantage.allowMaterialSubstitution !== false
      && substitution === advantage.resource;

    if (hasLiveAccess && (!good || !isStoredQuantityGood(good))) {
      // Continuing-access goods cannot be stockpiled and keep their explicit access term.
      terms.push({ resource: advantage.resource, goodId, discount: advantage.discount, quantity: 0, via: 'access' });
      continue;
    }

    if (hasLiveAccess && good && isStoredQuantityGood(good)) {
      const quantity = advantage.softCost ?? DEFAULT_SOFT_MATERIAL_COST;
      if (getFreeQuantity(ledger, goodId) >= quantity) {
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
