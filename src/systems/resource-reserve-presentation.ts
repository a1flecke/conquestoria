// src/systems/resource-reserve-presentation.ts
// #1506 MR09 task 8: the authoritative read model for hard-material stocks and city queues.
//
// Pure projections, one owner for both surfaces:
//  - Supplies: one row per revealed, counted material good. Stored provenance, capacity, commitments,
//    free stock, incoming claims (not usable stock), current eligible extraction and its storage cap,
//    and any still-restricted migration assistance.
//  - City queue: one row per queue entry, with the full hard recipe. Only the active occurrence may
//    hold a reservation; every tail entry is explicitly "planned, not reserved".
//
// Owner-scoped by construction: every query takes an explicit civ/city id and reads only that civ's
// ledger/sources. Nothing here renders DOM, mutates state, prices an item, or promises a completion
// turn that materials make unbounded.
import type { GameState, ResourceType } from '@/core/types';
import type { TradeGoodId } from '@/core/types/commerce';
import { getCityMaterialProjection } from './city-production-materials';
import { getProductionDecision } from './production-decision';
import { getQueueableProductionForCity } from './city-production-eligibility';
import {
  evaluateMaterialFunding,
  getMaterialRecipe,
  type MaterialFundingRow,
} from './resource-material-costs';
import { countNativeSourcesByGood, getCivMaterialLedger } from './resource-material-state';
import { getFuelRunway } from './resource-fuel-system';
import {
  getCommittedQuantity,
  getFreeQuantity,
  getIncomingQuantity,
  getReserveBalance,
  getStorageHeadroom,
  getStoredQuantity,
} from './resource-reserve-system';
import { getProductionDisplayName, getProductionIconForItem } from './city-production-presentation';
import { RESOURCE_DEFINITIONS } from './resource-definitions';
import { isResourceRevealed } from './resource-source-eligibility';
import {
  DEFAULT_NATIVE_PER_SOURCE_PER_ROUND,
  DEFAULT_STORAGE_PER_GOOD,
  findTradeGood,
  isStoredQuantityGood,
  resourceGoodId,
  type GoodQuantityProfile,
} from './trade-good-definitions';

export interface MaterialGoodPresentation {
  goodId: TradeGoodId;
  name: string;
  icon: string;
  resource: ResourceType | null;
}

/** Name/icon identity for a counted material good. Null for an unknown or non-stock good. */
export function getMaterialGoodPresentation(goodId: TradeGoodId): MaterialGoodPresentation | null {
  const good = findTradeGood(goodId);
  if (!good || !isStoredQuantityGood(good)) return null;
  const resource = good.nativeSource?.kind === 'resource' ? good.nativeSource.resource : null;
  const definition = resource ? RESOURCE_DEFINITIONS.find(candidate => candidate.id === resource) : undefined;
  return { goodId, name: good.name, icon: definition?.icon ?? '📦', resource };
}

function quantityProfile(goodId: TradeGoodId): GoodQuantityProfile | null {
  const good = findTradeGood(goodId);
  if (!good || !isStoredQuantityGood(good)) return null;
  return good.quantity ?? null;
}

export interface ReserveSuppliesRow {
  goodId: TradeGoodId;
  resource: ResourceType;
  name: string;
  icon: string;
  /** Quantity unit for every count in this row. */
  unitLabel: string;
  /** Native/imported provenance of the stored balance. */
  nativeStored: number;
  importedStored: number;
  stored: number;
  capacity: number;
  /** Stock held by this civ's active production occurrences. */
  committed: number;
  /** Stored minus committed: what another occurrence could still reserve. */
  free: number;
  /** Purchased manifests that will consume capacity on arrival; never usable stock yet. */
  incoming: number;
  /** Current eligible, revealed, deduplicated native sources. */
  sources: number;
  /** `sources × nativePerSourcePerRound`; a rate, never a guaranteed allocation while others compete. */
  extractionPerRound: number;
  headroom: number;
  /** True when this round's full extraction cannot fit in the remaining storage. */
  capped: boolean;
  /** Units of this round's extraction that would be lost to the storage cap. */
  cappedQuantity: number;
  /** Stored units above capacity (legacy/corruption), reported rather than silently hidden. */
  overflow: number;
  /** Still-restricted migration assistance reservation amount; not ordinary spendable stock. */
  migrationAssistance: number;
  /** #1512 MR15: real scheduled fuel demand and its runway, when this good is used as fuel. */
  fuelDemandPerRound?: number;
  fuelRunwayRounds?: number | null;
  fuelStatus?: 'no-demand' | 'funded' | 'shortage' | 'delivery-uncertain';
}

function migrationAssistance(ledger: ReturnType<typeof getCivMaterialLedger>, goodId: TradeGoodId): number {
  return ledger.reservations
    .filter(reservation => reservation.goodId === goodId && reservation.reason === 'migration-grant')
    .reduce((total, reservation) => total + reservation.amount, 0);
}

/**
 * Every revealed counted material good for this civ, in catalog order (stable across viewers and
 * independent of any rival's state). A good with no stock still appears with zeros so the row can
 * explain that access exists but no units have accrued.
 */
export function getReserveSuppliesRows(state: GameState, civId: string): ReserveSuppliesRow[] {
  const civ = state.civilizations[civId];
  if (!civ) return [];
  const ledger = getCivMaterialLedger(state, civId);
  const sourceCounts = countNativeSourcesByGood(state, civId);
  const rows: ReserveSuppliesRow[] = [];

  for (const definition of RESOURCE_DEFINITIONS) {
    const goodId = resourceGoodId(definition.id);
    const good = findTradeGood(goodId);
    if (!good || !isStoredQuantityGood(good) || !good.uses.includes('material')) continue;
    if (!isResourceRevealed(state, civId, definition)) continue;

    const profile = quantityProfile(goodId);
    const capacity = profile?.storageCapacity ?? DEFAULT_STORAGE_PER_GOOD;
    const perSource = profile?.nativePerSourcePerRound ?? DEFAULT_NATIVE_PER_SOURCE_PER_ROUND;
    const balance = getReserveBalance(ledger, goodId);
    const stored = getStoredQuantity(ledger, goodId);
    const sources = sourceCounts[goodId] ?? 0;
    const extractionPerRound = sources * perSource;
    const headroom = getStorageHeadroom(ledger, goodId, capacity);
    const cappedQuantity = Math.max(0, extractionPerRound - headroom);

    const fuel = getFuelRunway(state, civId, goodId);
    rows.push({
      goodId,
      resource: definition.id,
      name: good.name,
      icon: definition.icon,
      unitLabel: 'units',
      nativeStored: balance.native,
      importedStored: balance.imported,
      stored,
      capacity,
      committed: getCommittedQuantity(ledger, goodId),
      free: getFreeQuantity(ledger, goodId),
      incoming: getIncomingQuantity(ledger, goodId),
      sources,
      extractionPerRound,
      headroom,
      capped: cappedQuantity > 0,
      cappedQuantity,
      overflow: Math.max(0, stored - capacity),
      migrationAssistance: migrationAssistance(ledger, goodId),
      ...(fuel.status !== 'no-demand'
        ? {
          fuelDemandPerRound: fuel.demandPerRound,
          fuelRunwayRounds: fuel.runwayRounds,
          fuelStatus: fuel.status,
        }
        : {}),
    });
  }

  return rows;
}

export interface CityMaterialGoodRow {
  goodId: TradeGoodId;
  name: string;
  icon: string;
  required: number;
  /** How much of `required` this entry already holds in a reservation (active only). */
  committed: number;
  /** National free stock, before counting this entry's own reservation. */
  free: number;
  /** Free plus this entry's own committed units: what this item could pay with. */
  available: number;
  missing: number;
}

export interface CityMaterialQueueRow {
  index: number;
  itemId: string;
  name: string;
  icon: string;
  /** Only the head is `active`; every other entry is `planned`. */
  status: 'active' | 'planned';
  /** False for an item id with no recipe and no recognized material-free special. */
  known: boolean;
  /** True when the active occurrence holds reservations for the full recipe. */
  reserved: boolean;
  /** Full recipe available to this entry (own reservation counts; tail rows use free stock). */
  funded: boolean;
  /** Applicable nonmaterial legality for a *new* claim; an active entry is already in the queue. */
  legalNow: boolean;
  fundableNow: boolean;
  rows: CityMaterialGoodRow[];
  committed: number;
  missingQuantity: number;
  locked: boolean;
  /** Ordinary production turns once materials are held; null while waiting, planned, locked or unknown. */
  estimatedTurns: number | null;
  /** Production-only effort after materials are funded; never presented as a delivery promise. */
  productionOnlyTurns: number | null;
}

function ownCommitmentByGood(
  ledger: ReturnType<typeof getCivMaterialLedger>,
  commitment: ReturnType<typeof getCityMaterialProjection>['commitment'],
): Record<string, number> {
  const own: Record<string, number> = {};
  if (!commitment) return own;
  for (const reservationId of commitment.reservationIds) {
    const reservation = ledger.reservations.find(candidate => candidate.id === reservationId);
    if (!reservation) continue;
    own[reservation.goodId] = (own[reservation.goodId] ?? 0) + reservation.amount;
  }
  return own;
}

function toGoodRow(ledger: ReturnType<typeof getCivMaterialLedger>, funding: MaterialFundingRow): CityMaterialGoodRow {
  const presentation = getMaterialGoodPresentation(funding.goodId);
  return {
    goodId: funding.goodId,
    name: presentation?.name ?? funding.goodId,
    icon: presentation?.icon ?? '📦',
    required: funding.required,
    committed: funding.committed,
    free: getFreeQuantity(ledger, funding.goodId),
    available: funding.available,
    missing: funding.missing,
  };
}

/**
 * One row per queue entry for an owned city. The active occurrence's own reservation counts toward
 * its funding; a tail entry never claims stock and is explicitly `planned`. Returns null when the
 * city is missing or belongs to another civilization.
 */
export function getCityMaterialQueueRows(
  state: GameState,
  civId: string,
  cityId: string,
): CityMaterialQueueRow[] | null {
  const city = state.cities[cityId];
  if (!city || city.owner !== civId) return null;

  const ledger = getCivMaterialLedger(state, civId);
  const projection = getCityMaterialProjection(state, cityId);
  const decision = getProductionDecision(state, civId, cityId);
  const queueable = getQueueableProductionForCity(state, cityId);
  const legalIds = new Set<string>([
    ...(queueable?.units.map(unit => unit.type) ?? []),
    ...(queueable?.buildings.map(building => building.id) ?? []),
  ]);

  return city.productionQueue.map((itemId, index) => {
    const isActive = index === 0;
    const lookup = getMaterialRecipe(itemId);
    const special = itemId.startsWith('legendary:');
    const known = lookup.known || special;

    const own = isActive
      ? ownCommitmentByGood(ledger, projection.itemId === itemId ? projection.commitment : null)
      : {};
    const funding = known && lookup.known
      ? evaluateMaterialFunding(ledger, lookup.recipe, own)
      : { rows: [] as MaterialFundingRow[], missingQuantity: 0, funded: known };

    const rows = known && lookup.known
      ? funding.rows.map(row => toGoodRow(ledger, row))
      : [];

    const committed = rows.reduce((total, row) => total + row.committed, 0);
    const reserved = isActive && known && (
      lookup.known
        ? Boolean(projection.itemId === itemId && projection.commitment)
        : false
    );
    const funded = known && (isActive ? projection.funded : funding.funded);
    const legalNow = known && (isActive || special || legalIds.has(itemId));

    return {
      index,
      itemId,
      name: getProductionDisplayName(itemId),
      icon: getProductionIconForItem(itemId),
      status: isActive ? 'active' as const : 'planned' as const,
      known,
      reserved,
      funded,
      legalNow,
      fundableNow: funded && legalNow,
      rows,
      committed,
      missingQuantity: known ? funding.missingQuantity : 0,
      locked: isActive ? decision?.locked ?? false : false,
      estimatedTurns: isActive && funded ? decision?.turnsToComplete ?? null : null,
      productionOnlyTurns: isActive ? decision?.materials.productionOnlyTurns ?? null : null,
    };
  });
}
