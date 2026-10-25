import type { ResourceType } from './resources';

/**
 * Stable, opaque commerce identifier (#1505 MR08). Never parse it — resolve the definition through
 * the trade-good catalog. Declared here so a persisted/leaf shape can name a good without importing
 * the runtime catalog; `src/systems/trade-good-definitions.ts` re-exports it type-only.
 */
export type TradeGoodId = string;

/**
 * One hard-material requirement row (#1506 MR09).
 *
 * The editable authority is each `Building`/`TrainableUnitEntry`'s `materialCosts`; the legacy
 * `resourceRequired` list is a derived projection while the remaining consumers migrate. A row must
 * name a known stored-quantity good with a `material` use and a positive safe-integer quantity.
 */
export interface MaterialCostRow {
  goodId: TradeGoodId;
  quantity: number;
}

/** Native/imported provenance split of stored stock or of a reservation. */
export interface ReserveBalance {
  native: number;
  imported: number;
}

/** The provenance split a reservation has locked. */
export interface ReserveAllocation {
  native: number;
  imported: number;
}

/** The production consumer a commitment belongs to (#1506 MR09). */
export interface ProductionMaterialRef {
  ownerCivId: string;
  cityId: string;
  /** Advances whenever the city's active occurrence changes, including identical adjacent units. */
  occurrence: number;
  itemId: string;
}

export type ReservationReason = 'active-production' | 'migration-grant' | 'protected-reserve';

export interface ReserveReservation {
  id: string;
  goodId: TradeGoodId;
  ownerCivId: string;
  amount: number;
  reason: ReservationReason;
  /** Locked at reservation time: free imported first, then free native. */
  allocation: ReserveAllocation;
  /** Required for `active-production` and `migration-grant`. */
  consumer?: ProductionMaterialRef;
  /**
   * The restricted transition-assistance portion of `allocation.imported` (#1506 MR09). Only the
   * historical migration may create it; it is consumed first and expires on release.
   */
  migrationGrantImported?: number;
}

/** A purchased manifest that will occupy storage on arrival. It is not usable stock yet. */
export interface IncomingClaim {
  id: string;
  goodId: TradeGoodId;
  ownerCivId: string;
  amount: number;
  routeId?: string;
}

export interface ReserveLedger {
  balances: Readonly<Record<TradeGoodId, ReserveBalance>>;
  reservations: readonly ReserveReservation[];
  incoming: readonly IncomingClaim[];
  /** #1506 MR09: the turn this civ last accrued native stock; prevents replaying the phase. */
  lastAccruedTurn?: number;
}

/** One active production item's snapshot of hard terms and the reservations that hold them. */
export interface ActiveMaterialCommitment {
  ref: ProductionMaterialRef;
  recipe: readonly MaterialCostRow[];
  /** Optional finite soft-material rows reserved alongside the hard recipe (#1507 MR10). */
  softRows?: readonly MaterialCostRow[];
  reservationIds: readonly string[];
}

/** Frozen optional soft-discount terms for the active occurrence (#1507 MR10). */
export interface ActiveSoftMaterialTerms {
  itemId: string;
  occurrence: number;
  /** Combined multiplier after the shared floor; 1 means no soft term. */
  multiplier: number;
  /** Stock rows actually reserved for this occurrence. */
  rows: readonly MaterialCostRow[];
  /** Circular Manufacturing advantages used without stock. */
  substitutions: readonly ResourceType[];
}

/** Per-city occurrence identity for material commitments (#1506 MR09). */
export interface CityProductionMaterials {
  /** Advances for every successful queue edit. */
  queueRevision: number;
  /** Advances when the active occurrence changes — not on tail edits. */
  activeOccurrence: number;
  commitment: ActiveMaterialCommitment | null;
  /** Frozen soft terms for the active item; absent means no frozen term (old saves included). */
  softTerms?: ActiveSoftMaterialTerms | null;
}

/**
 * Neutral bookkeeping for a city that has never held a material commitment. A pure literal with no
 * imports, so city creation and save migration share one starting state without a core → system edge.
 */
export function createNeutralCityProductionMaterials(): CityProductionMaterials {
  return { queueRevision: 0, activeOccurrence: 0, commitment: null, softTerms: null };
}

/**
 * Persisted commerce state (#1499 MR02, `src/core/types/commerce.ts`).
 *
 * Declared in this leaf rather than the `src/core/types.ts` compatibility barrel, which is
 * shrink-only (#1361).
 *
 * Both lists are plain data:
 * - `resourceExportGrants` are directional seller→buyer grants of one strategic resource. MR02 adds
 *   only the data model and its writers/queries; the player controls ship with cargo purchases in
 *   MR12, so nothing here is advertised in the UI yet.
 * - `routeAllowances` are the recorded route-only transition allowances for trade assignments that
 *   predate the permission model. Each covers exactly one route id and expires at a recorded turn
 *   boundary; it authorizes neither a new assignment nor a resource purchase.
 */
export interface CommerceResourceExportGrant {
  /** The civilization that may export the resource. */
  grantorCivId: string;
  /** The civilization allowed to receive it. */
  granteeCivId: string;
  resource: ResourceType;
}

export interface CommerceRouteAllowance {
  /** The single route this allowance covers. A different route id is never covered. */
  routeId: string;
  /** The route owner the allowance was recorded for (hot-seat safe). */
  civId: string;
  grantedOnTurn: number;
  /** The allowance stops granting commerce once `state.turn >= expiresOnTurn`. */
  expiresOnTurn: number;
}

/**
 * #1508 MR11: a good-keyed seller policy. It is deliberately not a `ResourceType` grant: offers and
 * policies must work for a producer-backed good that never came from a map deposit. A policy with no
 * partners offers nothing; the protected reserve is counted before exportable surplus is derived.
 */
export interface CommerceResourcePolicy {
  civId: string;
  goodId: TradeGoodId;
  /** Native units withheld from export after active domestic commitments. */
  protectedReserve: number;
  /** Civilizations explicitly allowed to receive this good from `civId`. */
  partnerCivIds: readonly string[];
  /** Optional per-unit tariff, itemized separately from the seller's unit price. */
  tariffPerUnit?: number;
  /** Required when `tariffPerUnit` is positive. */
  tariffRecipientCivId?: string;
}

export type MarketPriceBand = 'abundant' | 'normal' | 'tight' | 'capped';

/**
 * One public posted-price offer in a round snapshot. It contains only what an eligible buyer may
 * see: the supplier, good, band, price, itemized tariff and available units. It never carries hidden
 * supply or a private buyer term.
 */
export interface CommerceMarketOffer {
  offerId: string;
  supplierCivId: string;
  goodId: TradeGoodId;
  turn: number;
  band: MarketPriceBand;
  /** Seller's unit price before the itemized tariff. */
  unitPrice: number;
  available: number;
  tariffPerUnit: number;
  tariffRecipientCivId?: string;
  eligibleBuyerCivIds: readonly string[];
}

export interface MarketProcurementPolicy {
  /** Inclusive maximum total unit cost (seller price + tariff). */
  maxUnitPrice: number;
  /** Gold that must remain after the purchase. */
  treasuryFloor: number;
}

/**
 * Persisted once-per-round market snapshot (#1508 MR11). `serviceCursorByOffer` is retained across
 * rounds so a scarce unit rotates between eligible buyers instead of starving the higher id.
 */
export interface CommerceMarketState {
  turn: number;
  offers: readonly CommerceMarketOffer[];
  serviceCursorByOffer: Readonly<Record<string, number>>;
  servedByOffer?: Readonly<Record<string, readonly string[]>>;
  procurementByCiv?: Readonly<Record<string, MarketProcurementPolicy>>;
}

export interface CommercePermissionsState {
  resourceExportGrants: CommerceResourceExportGrant[];
  routeAllowances: CommerceRouteAllowance[];
  /** #1508 MR11: good-keyed seller policies. Absent on older saves. */
  resourcePolicies?: CommerceResourcePolicy[];
}

/**
 * Why a trade route's service is interrupted (#1503 MR06). Declared in this leaf rather than the
 * shrink-only barrel (#1361):
 *
 * - `blocked` is a physical obstruction on the committed path;
 * - `blockaded` is a canonical blockade of an endpoint city.
 *
 * Both are derived from authoritative world facts — neither is a random loss. The value is recorded
 * on the route (`TradeRoute.notifiedInterruption`) so a stationary obstruction is announced once.
 */
export type TradeRouteInterruptionReason = 'blocked' | 'blockaded';

/**
 * What a trade route is *for* (#1504 MR07). Declared in this leaf rather than the shrink-only barrel
 * (#1361). The definition-driven catalog that names each mode's recipient and requirement lives in
 * `src/systems/trade-route-modes.ts`; this is only the stable identifier persisted on the route.
 *
 * A route from before modes shipped has no `mode` and runs `commerce` (the pre-MR07 behavior), so an
 * old save needs no migration.
 */
export type TradeRouteModeId = 'commerce' | 'domestic-food' | 'domestic-production' | 'research-exchange';
