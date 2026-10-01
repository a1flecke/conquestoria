import type { EventBus } from '@/core/event-bus';
import type { GameState, TradeRoute, Unit } from '@/core/types';
import { cleanupDeadSpyUnit } from '@/systems/espionage-spy-lifecycle';

/**
 * #1198 — the one transition that takes a unit out of `GameState`.
 *
 * Removing a unit is a multi-index write: the unit table, the owner's roster (major `civilizations[].units`
 * OR minor `minorCivs[].units`), a surviving transport's cargo manifest, the cargo a removed transport
 * carries, the aircraft based on a removed carrier, the espionage record of a dead spy, and the trade route a
 * removed caravan was running. Before this module each removal site remembered its own subset (two helpers
 * disagreed and fifteen sites hand-rolled `delete units[id]`). Now nothing outside this file deletes a unit:
 * `scripts/check-src-rule-violations.sh` rejects a raw `units` delete/rest-destructure elsewhere.
 *
 * What is deliberately NOT here:
 * - Civilization liveness. Whether the owner is now eliminated depends on other writes the caller may still be
 *   making (a founded city, a captured one), so reconciliation stays with the orchestrator that owns the whole
 *   transition (`reconcileCivilizationLiveness`).
 * - Great General career ledgers (`civ.generalHistory` intentionally outlives its unit) and the position-based
 *   escort rule (a combat consequence, owned by `applyCombatOutcomeToState`).
 * - Indexes that already self-prune against `state.units` every round: `barbarianHomeCampByUnitId`,
 *   `pirates.factions[].shipIds`, crisis-force `unitIds`, `opponentAI` assignment lists.
 *
 * `unit.owner` is authoritative (#1020). Rosterless owners (barbarians, pirates, beasts, crisis forces) have no
 * roster to scrub and stay rosterless.
 */

/**
 * Why the unit left play. Only two things genuinely vary by reason:
 * - a spy that is `consumed` (embedded or infiltrating) keeps its espionage record, because the record IS the
 *   spy now; every other reason ends it;
 * - the `trade:route-ended` reason a removed caravan's route is closed with.
 */
export type UnitRemovalReason =
  /** Killed: combat, counter-fire, flak, assault repelled. */
  | 'destroyed'
  /** The player deleted it. */
  | 'disbanded'
  /** Its owner, or the world threat that owned it, ceased to exist. */
  | 'eliminated'
  /** Spent by design: founded a city, built an outpost, preached its last charge, retired, or a spy went off-map (embedded, stationed or caught — its record stays). */
  | 'consumed'
  /** A caravan completed its final trip. */
  | 'trips-exhausted';

export interface UnitRemovalSlice {
  units: Record<string, Unit>;
  civilizations: GameState['civilizations'];
  minorCivs: GameState['minorCivs'];
  espionage?: GameState['espionage'];
  marketplace?: GameState['marketplace'];
}

export interface EndedTradeRoute {
  routeId: string;
  fromCityId: string;
  toCityId: string;
  reason: 'unit-died' | 'unit-disbanded' | 'trips-exhausted';
}

export interface UnitRemovalResult<S> {
  slice: S;
  /** Pre-removal snapshots of every unit that left (requested ids plus their cascade), sorted by id. */
  removed: Unit[];
  /** Trade routes closed because their runner left, for the caller to announce. */
  endedRoutes: EndedTradeRoute[];
}

function routeEndReason(reason: UnitRemovalReason): EndedTradeRoute['reason'] {
  if (reason === 'disbanded') return 'unit-disbanded';
  if (reason === 'trips-exhausted') return 'trips-exhausted';
  return 'unit-died';
}

/**
 * Requested ids plus everything that cannot outlive them: the cargo of a removed transport (by either
 * direction of the link) and the aircraft based on a removed carrier, to any depth.
 */
function collectRemovalClosure(units: Record<string, Unit>, requested: readonly string[]): Set<string> {
  const dependents = new Map<string, string[]>();
  const addDependent = (parentId: string, childId: string): void => {
    const list = dependents.get(parentId);
    if (list) list.push(childId);
    else dependents.set(parentId, [childId]);
  };
  for (const unit of Object.values(units)) {
    if (unit.transportId) addDependent(unit.transportId, unit.id);
    if (unit.airBase?.kind === 'carrier') addDependent(unit.airBase.unitId, unit.id);
  }

  const removedIds = new Set<string>();
  const queue = [...requested];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (removedIds.has(id) || !units[id]) continue;
    removedIds.add(id);
    for (const cargoId of units[id].cargoUnitIds ?? []) queue.push(cargoId);
    for (const dependentId of dependents.get(id) ?? []) queue.push(dependentId);
  }
  return removedIds;
}

function scrubRosters<R extends { units: string[] }>(
  rosters: Record<string, R>,
  removedIds: ReadonlySet<string>,
): Record<string, R> {
  let next: Record<string, R> | undefined;
  for (const [ownerId, owner] of Object.entries(rosters)) {
    if (!owner.units.some(id => removedIds.has(id))) continue;
    next ??= { ...rosters };
    next[ownerId] = { ...owner, units: owner.units.filter(id => !removedIds.has(id)) };
  }
  return next ?? rosters;
}

/** Removes `unitIds` (and the units that cannot outlive them) from a slice of state. */
export function removeUnitsFromSlice<S extends UnitRemovalSlice>(
  slice: S,
  unitIds: Iterable<string>,
  reason: UnitRemovalReason,
): UnitRemovalResult<S> {
  const requested = [...new Set(unitIds)].filter(id => slice.units[id]);
  if (requested.length === 0) return { slice, removed: [], endedRoutes: [] };

  const removedIds = collectRemovalClosure(slice.units, requested);
  const removed = [...removedIds].sort().map(id => slice.units[id]);

  const units: Record<string, Unit> = { ...slice.units };
  for (const id of removedIds) delete units[id];
  // A removed unit that was cargo of a SURVIVING transport must leave its manifest too.
  for (const unit of Object.values(units)) {
    if (unit.cargoUnitIds?.some(cargoId => removedIds.has(cargoId))) {
      units[unit.id] = { ...unit, cargoUnitIds: unit.cargoUnitIds.filter(cargoId => !removedIds.has(cargoId)) };
    }
  }

  // Partial states (fixtures, legacy saves) may lack a roster table; never invent one.
  const civilizations = slice.civilizations ? scrubRosters(slice.civilizations, removedIds) : slice.civilizations;
  const minorCivs = slice.minorCivs ? scrubRosters(slice.minorCivs, removedIds) : slice.minorCivs;

  let espionage = slice.espionage;
  if (espionage && reason !== 'consumed') {
    for (const unit of removed) espionage = cleanupDeadSpyUnit(espionage, unit.owner, unit.id);
  }

  let marketplace = slice.marketplace;
  const endedRoutes: EndedTradeRoute[] = [];
  const routeIds = new Set(removed.flatMap(unit => (unit.committedToRouteId ? [unit.committedToRouteId] : [])));
  if (marketplace && routeIds.size > 0) {
    const ended: TradeRoute[] = marketplace.tradeRoutes.filter(route => routeIds.has(route.id));
    if (ended.length > 0) {
      marketplace = { ...marketplace, tradeRoutes: marketplace.tradeRoutes.filter(route => !routeIds.has(route.id)) };
      for (const route of ended) {
        endedRoutes.push({ routeId: route.id, fromCityId: route.fromCityId, toCityId: route.toCityId, reason: routeEndReason(reason) });
      }
    }
  }

  const next: S = { ...slice, units, civilizations, minorCivs };
  if (espionage !== slice.espionage) next.espionage = espionage;
  if (marketplace !== slice.marketplace) next.marketplace = marketplace;
  return { slice: next, removed, endedRoutes };
}

export interface RemoveUnitsOptions {
  reason: UnitRemovalReason;
  /** Present for a real execution: announces `trade:route-ended` for each route a removed caravan was running. */
  bus?: EventBus;
}

export function emitEndedTradeRoutes(bus: EventBus | undefined, endedRoutes: readonly EndedTradeRoute[]): void {
  for (const route of endedRoutes) bus?.emit('trade:route-ended', route);
}

/** The state-level entry point. Returns the new state plus what left, so callers announce from data. */
export function removeUnits(
  state: GameState,
  unitIds: Iterable<string>,
  options: RemoveUnitsOptions,
): { state: GameState; removed: Unit[]; endedRoutes: EndedTradeRoute[] } {
  const result = removeUnitsFromSlice(state, unitIds, options.reason);
  emitEndedTradeRoutes(options.bus, result.endedRoutes);
  return { state: result.slice, removed: result.removed, endedRoutes: result.endedRoutes };
}
