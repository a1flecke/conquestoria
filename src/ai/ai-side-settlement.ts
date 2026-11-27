/**
 * #1693: sending an idle settler to settle while another plan holds the primary slot.
 *
 * Expansion is a primary-plan objective (#1064), and a civ has one primary plan. A settler is no combat
 * asset, so while a resource, capture or `repel` plan held that slot the settler had nothing to do: the
 * founding step only founds where a settler already stands. ai-3 in `lh-late-era-medium` kept one beside
 * its only city for ~150 rounds, and one small city could not pay for any technology in that time.
 *
 * This picks, from the civilization's own units only, which settler should walk to the site the planner
 * named (`PreparedMajorCivPlan.settlementSite`, drawn from the same fog-bounded candidates as the primary
 * choice). It is pure; basic-ai.ts turns the order into the existing `journey` standing order, and the
 * founding step founds on arrival when `canFoundCityAt` agrees.
 */
import type { HexCoord } from '@/core/types/hex';

export interface SideSettlementWorld {
  civilizations: Record<string, { units: string[] } | undefined>;
  units: Record<string, {
    id: string;
    type: string;
    position: HexCoord;
    transportId?: string;
    automation?: { mode: string; destination?: HexCoord };
  } | undefined>;
}

export interface SideSettlementOrder {
  unitId: string;
  destination: HexCoord;
}

/**
 * One settler at most per round: the site is one site, and the incremental settlement demand keeps a civ to
 * one settler anyway. A settler already on its way somewhere keeps its journey, so a site that shifts with
 * fog never turns it around; one aboard a ship, held by a plan or recovering is left alone.
 */
export function planSideSettlementOrder(
  world: SideSettlementWorld,
  civId: string,
  site: { anchor: HexCoord } | null | undefined,
  busyUnitIds: ReadonlySet<string>,
): SideSettlementOrder | null {
  if (!site) return null;
  const roster = world.civilizations[civId]?.units ?? [];
  const settlers = roster
    .map(id => world.units[id])
    .filter((unit): unit is NonNullable<typeof unit> => unit !== undefined && unit.type === 'settler')
    .sort((left, right) => left.id.localeCompare(right.id));
  if (settlers.some(unit => unit.automation?.mode === 'journey')) return null;
  const settler = settlers.find(unit =>
    !unit.transportId
    && !busyUnitIds.has(unit.id)
    && !unit.automation
    && (unit.position.q !== site.anchor.q || unit.position.r !== site.anchor.r));
  return settler ? { unitId: settler.id, destination: { ...site.anchor } } : null;
}
