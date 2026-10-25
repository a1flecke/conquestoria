// src/systems/soft-material-terms.ts
// #1507 MR10: state adapter for finite, optional soft-material terms.
//
// The pure selector lives in `resource-advantages.ts` so the canonical pricing core can use it
// without importing the national-project/city graph (which would create a runtime cycle). This
// adapter only supplies the owning civ's live inputs.
import type { GameState } from '@/core/types';
import type { ResourceType } from '@/core/types/resources';
import type { ReserveLedger } from '@/core/types/commerce';
import {
  selectSoftMaterialTermsFromInputs,
  type SelectedSoftMaterialTerm,
  type SelectedSoftMaterialTerms,
} from './resource-advantages';
import { getCivAvailableResources } from './resource-acquisition-system';
import { getCivMaterialLedger } from './resource-material-state';
import { getCircularManufacturingMaterial } from './national-project-system';

export type { SelectedSoftMaterialTerm, SelectedSoftMaterialTerms };

export interface SoftMaterialSelectionOptions {
  availableResources?: ReadonlySet<ResourceType>;
  substitution?: ResourceType;
  ledger?: ReserveLedger;
}

/**
 * Select every eligible soft advantage for one item from the owning civ's live state.
 *
 * - stock is preferred when the full soft allotment is free;
 * - a permitted Circular Manufacturing substitution supplies the term without creating stock,
 *   a hard-material row, or fuel;
 * - an insufficient allotment yields no term (normal-cost production remains);
 * - non-stock access goods (Ivory) keep their explicitly scoped access term.
 */
export function selectSoftMaterialTerms(
  state: GameState,
  civId: string,
  itemId: string,
  options: SoftMaterialSelectionOptions = {},
): SelectedSoftMaterialTerms {
  return selectSoftMaterialTermsFromInputs(itemId, {
    availableResources: options.availableResources ?? getCivAvailableResources(state, civId),
    substitution: options.substitution ?? getCircularManufacturingMaterial(state, civId),
    ledger: options.ledger ?? getCivMaterialLedger(state, civId),
  });
}
