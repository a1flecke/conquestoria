// src/core/round-phases/commerce-resources.ts
// #1506 MR09 task 5: domestic extraction and material preparation, once per completed round, before
// any city produces.
//
// Two jobs, both for living major civilizations only, in stable civ order:
//  1. accrue native stock from revealed, usable, deduplicated sources (capped by headroom, inclusive
//     of incoming claims) and mark the round atomically;
//  2. retry funding each city's already-active occurrence, so stock that reaches a full recipe this
//     round lets that city produce this round.
//
// It never accrues for an eliminated civ or a non-major owner, and never seeds or grants: the one-time
// migration owns assistance, this phase owns recurring extraction.
import type { GameState } from '@/core/types';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { accrueNativeStockForCompletedRound } from '@/systems/resource-material-state';
import { syncCityMaterialCommitment } from '@/systems/city-production-materials';
import type { RoundPhase, RoundPhaseContext } from './types';

function runCommerceResources(state: GameState, _context: RoundPhaseContext): GameState {
  let next = state;
  const civIds = Object.keys(state.civilizations).sort();

  for (const civId of civIds) {
    if (!getCivilizationLiveness(state, civId).living) continue;
    next = accrueNativeStockForCompletedRound(next, civId, state.turn);

    const cityIds = [...(next.civilizations[civId].cities ?? [])].sort();
    for (const cityId of cityIds) {
      next = syncCityMaterialCommitment(next, cityId);
    }
  }

  return next;
}

export const commerceResourcesPhase: RoundPhase = { id: 'commerce-resources', run: runCommerceResources };
