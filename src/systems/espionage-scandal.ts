// Shared scandal rule (#442 MR2 expose_scandal, reused by #419 PR 2 "Go public"). A dependency-free leaf: it imports
// only the treaty type, so both the mission resolver and the counter-intelligence ledger can use one definition
// without importing each other or the types barrel.
import type { Treaty } from '@/core/types/diplomacy';

// Bounded per-partner penalty and a cap on affected partners so a maximally-connected civ can't be devastated in one
// action (game-balance.md "never permanently cripple a city/civ from one successful spy action").
export const EXPOSE_SCANDAL_PENALTY = -10;
const EXPOSE_SCANDAL_MAX_PARTNERS = 4;

interface ScandalWorld {
  civilizations: Record<string, { diplomacy: { treaties: Treaty[] } } | undefined>;
}

/**
 * The civs a scandal about `culpritCivId` reaches: its treaty partners (major civs only), minus `excludeCivId` (the
 * exposer), sorted and capped. The one definition shared by the expose_scandal mission and Go public.
 */
export function getScandalPartnerIds(world: ScandalWorld, culpritCivId: string, excludeCivId: string): string[] {
  const culprit = world.civilizations[culpritCivId];
  if (!culprit) return [];
  const partners = new Set<string>();
  for (const treaty of culprit.diplomacy.treaties) {
    const partner = treaty.civA === culpritCivId ? treaty.civB : treaty.civA;
    if (partner === culpritCivId || partner === excludeCivId) continue;
    if (!world.civilizations[partner]) continue; // major civs only
    partners.add(partner);
  }
  return [...partners].sort().slice(0, EXPOSE_SCANDAL_MAX_PARTNERS);
}
