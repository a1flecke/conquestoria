import type { BreakawayMetadata, Civilization, GameState } from '@/core/types';
import { transferLegendaryWondersForCity } from './legendary-wonder-ownership';
import { EventBus } from '@/core/event-bus';
import { isAtWar } from './diplomacy-queries';
import { hexKey, mapDistance } from './hex-utils';
import { settleStrandedUnits } from './unit-spawn-placement';
import { createDiplomacyState } from '@/systems/diplomacy-state';
import { isSpyUnitType } from '@/systems/spy-unit-types';
import { withNewOwner } from './unit-trained-movement-bonus';
import { removeNationalProjectsHostedBy } from './national-project-system';
import { beginCityMaterialOccurrence, releaseCityMaterialCommitment } from './city-production-materials';
import {
  eliminateCivilization,
  emitCivilizationLivenessTransitions,
  reconcileCivilizationLiveness,
} from '@/systems/civilization-elimination-system';

export const BREAKAWAY_ESTABLISHMENT_TURNS = 50;
/** An established breakaway can still be talked back, once relations reach the most that peace alone gives (+30). */
export const REABSORB_RELATIONSHIP_MINIMUM = 30;
export const REABSORB_GOLD_COST = 200;

/**
 * The reunification race. While a city secedes, its will to rejoin grows by `REUNIFICATION_BASE_PER_TURN` each
 * turn of peace, plus `REUNIFICATION_PER_NEIGHBOUR` for each of the origin owner's cities within
 * `REUNIFICATION_NEIGHBOUR_RADIUS` (at most `REUNIFICATION_MAX_NEIGHBOURS`), and falls by `REUNIFICATION_WAR_LOSS` each
 * turn of war. Peace alone reaches only halfway inside the 50-turn window, so a return needs the owner's presence
 * nearby or an offer; a war throws it away.
 */
export const REUNIFICATION_BASE_PER_TURN = 1;
export const REUNIFICATION_PER_NEIGHBOUR = 1;
export const REUNIFICATION_MAX_NEIGHBOURS = 3;
export const REUNIFICATION_NEIGHBOUR_RADIUS = 8;
export const REUNIFICATION_WAR_LOSS = 10;
/** From this level the origin owner may offer to bring the city home early. */
export const REUNIFICATION_OFFER_THRESHOLD = 50;
/** An offer pays for the part of the way the city has not come by itself. */
export const REUNIFICATION_GOLD_PER_POINT = 4;

export interface ReunificationRate {
  perTurn: number;
  nearbyCities: number;
  atWar: boolean;
}

/** How fast a seceding breakaway is moving toward (or away from) rejoining its origin owner. */
export function getReunificationRate(state: GameState, breakawayId: string): ReunificationRate | null {
  const breakaway = state.civilizations[breakawayId];
  const meta = breakaway?.breakaway;
  if (!meta || meta.status !== 'secession') return null;
  const owner = state.civilizations[meta.originOwnerId];
  if (!owner || owner.isEliminated) return null;
  const atWar = isAtWar(owner.diplomacy, breakawayId) || isAtWar(breakaway.diplomacy, owner.id);
  const seat = state.cities[meta.originCityId] ?? breakaway.cities.map(id => state.cities[id]).find(Boolean);
  const nearbyCities = seat
    ? Math.min(REUNIFICATION_MAX_NEIGHBOURS, owner.cities.filter(id => {
      const city = state.cities[id];
      return city?.owner === owner.id && mapDistance(state.map, city.position, seat.position) <= REUNIFICATION_NEIGHBOUR_RADIUS;
    }).length)
    : 0;
  const perTurn = atWar ? -REUNIFICATION_WAR_LOSS : REUNIFICATION_BASE_PER_TURN + nearbyCities * REUNIFICATION_PER_NEIGHBOUR;
  return { perTurn, nearbyCities, atWar };
}

export type ReabsorbDenialReason =
  | 'not-a-breakaway'
  | 'not-origin-owner'
  | 'at-war'
  | 'not-ready'
  | 'relationship-too-low'
  | 'gold-too-low'
  | 'no-city';

export const REABSORB_DENIAL_MESSAGES: Record<ReabsorbDenialReason, string> = {
  'not-a-breakaway': 'This civilization did not break away from you.',
  'not-origin-owner': 'Only the empire it broke away from can bring it back.',
  'at-war': 'Make peace first: a city at war with you will not rejoin you.',
  'not-ready': `Its people are not ready to talk yet. Reunification must reach ${REUNIFICATION_OFFER_THRESHOLD}%.`,
  'relationship-too-low': `Relations must reach ${REABSORB_RELATIONSHIP_MINIMUM} before an established breakaway will rejoin.`,
  'gold-too-low': 'You cannot afford the offer.',
  'no-city': 'The breakaway holds no city.',
};

export type ReabsorbQuote =
  | { ok: true; cost: number }
  | { ok: false; reason: ReabsorbDenialReason; cost?: number };

/**
 * The one legality and price of bringing a breakaway home by offer, read by the diplomacy panel, the AI and the
 * executor. A seceding city that is at least halfway to rejoining costs `REUNIFICATION_GOLD_PER_POINT` per point it
 * still lacks; an established one needs relations of `REABSORB_RELATIONSHIP_MINIMUM` and `REABSORB_GOLD_COST`.
 */
export function getReabsorbQuote(state: GameState, ownerId: string, breakawayId: string): ReabsorbQuote {
  const owner = state.civilizations[ownerId];
  const breakaway = state.civilizations[breakawayId];
  const meta = breakaway?.breakaway;
  if (!owner || !meta) return { ok: false, reason: 'not-a-breakaway' };
  if (meta.originOwnerId !== ownerId) return { ok: false, reason: 'not-origin-owner' };
  if (!Object.values(state.cities).some(city => city.owner === breakawayId)) return { ok: false, reason: 'no-city' };
  if (isAtWar(owner.diplomacy, breakawayId)) return { ok: false, reason: 'at-war' };
  let cost: number;
  if (meta.status === 'secession') {
    const meter = meta.reunification ?? 0;
    if (meter < REUNIFICATION_OFFER_THRESHOLD) return { ok: false, reason: 'not-ready' };
    cost = Math.max(0, Math.ceil(100 - meter)) * REUNIFICATION_GOLD_PER_POINT;
  } else {
    if ((owner.diplomacy.relationships[breakawayId] ?? 0) < REABSORB_RELATIONSHIP_MINIMUM) {
      return { ok: false, reason: 'relationship-too-low' };
    }
    cost = REABSORB_GOLD_COST;
  }
  if (owner.gold < cost) return { ok: false, reason: 'gold-too-low', cost };
  return { ok: true, cost };
}

export function isBreakawayCiv(civ: Civilization): boolean {
  return civ.breakaway !== undefined;
}

/**
 * The old owner's units that stayed loyal (its spies) are left where they stood while the units around them and the
 * city changed hands. One standing on the city, or sharing a tile with a unit that seceded, is stranded (#1698
 * sweep): it steps out by the shared rule (`findStrandedUnitExit`), else stays. Nothing is deleted.
 */
function moveStrandedLoyalUnitsOut(state: GameState, territoryKeys: ReadonlySet<string>, ownerId: string): GameState {
  const loyal = Object.values(state.units)
    .filter(unit => unit.owner === ownerId && territoryKeys.has(hexKey(unit.position)))
    .map(unit => unit.id);
  return settleStrandedUnits(state, loyal);
}

export function createBreakawayFromCity(
  stateBefore: GameState,
  cityId: string,
  bus: EventBus,
): GameState {
  // #1506 MR09: the city leaves its owner's control, so its material commitment is released against the
  // old owner's ledger first; the breakaway then funds the inherited work from its own (empty) ledger.
  const state = releaseCityMaterialCommitment(stateBefore, cityId);
  const city = state.cities[cityId];
  if (!city) {
    throw new Error(`Cannot create breakaway from missing city ${cityId}`);
  }

  const previousOwner = state.civilizations[city.owner];
  if (!previousOwner) {
    throw new Error(`Cannot create breakaway from missing owner ${city.owner}`);
  }

  const breakawayId = `breakaway-${cityId}`;
  const metadata: BreakawayMetadata = {
    originOwnerId: previousOwner.id,
    originCityId: cityId,
    startedTurn: state.turn,
    establishesOnTurn: state.turn + BREAKAWAY_ESTABLISHMENT_TURNS,
    status: 'secession',
  };

  const cityTerritory = new Set(city.ownedTiles.map(coord => `${coord.q},${coord.r}`));
  // A spy is its owner's agent, not part of the local garrison: it stays loyal (its espionage
  // record lives with the old owner, so a seceded spy unit would be a phantom that still fills a
  // spy slot), and one standing on the seceding city steps out, since a spy never stands on a city
  // its owner does not hold.
  const transferredUnitIds = Object.values(state.units)
    .filter(unit => unit.owner === previousOwner.id
      && !isSpyUnitType(unit.type)
      && cityTerritory.has(`${unit.position.q},${unit.position.r}`))
    .map(unit => unit.id);

  const updatedCity = {
    ...city,
    owner: breakawayId,
    unrestLevel: 0 as const,
    unrestTurns: 0,
  };

  const updatedMapTiles = { ...state.map.tiles };
  for (const coord of city.ownedTiles) {
    const key = `${coord.q},${coord.r}`;
    const tile = updatedMapTiles[key];
    if (tile) {
      updatedMapTiles[key] = {
        ...tile,
        owner: breakawayId,
      };
    }
  }

  // The new civilization meets only the living: an eliminated civ is never re-seeded a relationship
  // (#1001), and every living civ gets an entry for the newcomer (Diplomacy Lifecycle).
  const livingCivIds = Object.keys(state.civilizations).filter(id => !state.civilizations[id]!.isEliminated);
  const newCivIds = [...livingCivIds, breakawayId];
  const breakawayCiv: Civilization = {
    id: breakawayId,
    name: `${city.name} Secession`,
    color: '#c2410c',
    isHuman: false,
    civType: 'generic',
    cities: [cityId],
    units: transferredUnitIds,
    techState: {
      ...previousOwner.techState,
      completed: [...previousOwner.techState.completed],
      trackPriorities: { ...previousOwner.techState.trackPriorities },
    },
    gold: 0,
    visibility: { tiles: { ...previousOwner.visibility.tiles }, lastSeen: { ...(previousOwner.visibility.lastSeen ?? {}) } },
    score: 0,
    diplomacy: createDiplomacyState(newCivIds, breakawayId),
    breakaway: metadata,
  };

  breakawayCiv.diplomacy.relationships[previousOwner.id] = -80;

  const updatedCivilizations = { ...state.civilizations };
  for (const civId of livingCivIds) {
    const civ = updatedCivilizations[civId]!;
    if (civId === previousOwner.id || civ.diplomacy.relationships[breakawayId] !== undefined) continue;
    updatedCivilizations[civId] = {
      ...civ,
      diplomacy: { ...civ.diplomacy, relationships: { ...civ.diplomacy.relationships, [breakawayId]: 0 } },
    };
  }
  updatedCivilizations[previousOwner.id] = {
    ...previousOwner,
    cities: previousOwner.cities.filter(id => id !== cityId),
    units: previousOwner.units.filter(id => !transferredUnitIds.includes(id)),
    diplomacy: {
      ...previousOwner.diplomacy,
      relationships: {
        ...previousOwner.diplomacy.relationships,
        [breakawayId]: -80,
      },
    },
  };
  updatedCivilizations[breakawayId] = breakawayCiv;

  // Each unit takes the breakaway's own bonuses, so they are computed once its record exists.
  const withBreakaway: GameState = { ...state, civilizations: updatedCivilizations };
  const updatedUnits = { ...state.units };
  for (const unitId of transferredUnitIds) {
    updatedUnits[unitId] = withNewOwner(withBreakaway, updatedUnits[unitId]!, breakawayId);
  }

  const nextState: GameState = {
    ...state,
    units: updatedUnits,
    map: {
      ...state.map,
      tiles: updatedMapTiles,
    },
    cities: {
      ...state.cities,
      [cityId]: updatedCity,
    },
    civilizations: updatedCivilizations,
  };

  bus.emit('faction:breakaway-started', {
    cityId,
    oldOwner: previousOwner.id,
    breakawayId,
  });

  // The city's national projects leave the old owner with it, exactly as on a capture.
  const withLoyalSpiesOut = moveStrandedLoyalUnitsOut(
    removeNationalProjectsHostedBy(transferLegendaryWondersForCity(beginCityMaterialOccurrence(nextState, cityId), cityId, breakawayId), cityId),
    new Set([...cityTerritory, hexKey(city.position)]),
    previousOwner.id,
  );
  const liveness = reconcileCivilizationLiveness(state, withLoyalSpiesOut);
  emitCivilizationLivenessTransitions(liveness, bus);
  return liveness.state;
}

export function processBreakawayTurn(state: GameState, bus: EventBus): GameState {
  let next = state;
  for (const civId of Object.keys(state.civilizations).sort()) {
    const civ = next.civilizations[civId];
    if (!civ?.breakaway || civ.breakaway.status !== 'secession') continue;
    const meta = civ.breakaway;

    const rate = getReunificationRate(next, civId);
    const before = meta.reunification ?? 0;
    const reunification = rate ? Math.max(0, Math.min(100, before + rate.perTurn)) : before;
    next = withBreakaway(next, civId, { ...meta, reunification });

    if (reunification >= 100) {
      // The city votes to come home: the same transfer as an offer, at no cost.
      next = reunifyBreakaway(next, meta.originOwnerId, civId, 0, bus);
      bus.emit('faction:breakaway-reabsorbed', { civId, ownerId: meta.originOwnerId, cityId: meta.originCityId, how: 'vote' });
      continue;
    }
    if (before < REUNIFICATION_OFFER_THRESHOLD && reunification >= REUNIFICATION_OFFER_THRESHOLD) {
      const quote = getReabsorbQuote(next, meta.originOwnerId, civId);
      const offerCost = quote.cost ?? Math.ceil(100 - reunification) * REUNIFICATION_GOLD_PER_POINT;
      bus.emit('faction:reunification-ready', { breakawayId: civId, originOwnerId: meta.originOwnerId, cityId: meta.originCityId, offerCost });
    }

    if (next.turn < meta.establishesOnTurn) {
      bus.emit('faction:critical-status', {
        cityId: meta.originCityId,
        owner: meta.originOwnerId,
        status: 'breakaway',
        breakawayId: civId,
      });
      continue;
    }

    next = withBreakaway(next, civId, { ...next.civilizations[civId]!.breakaway!, status: 'established' });
    bus.emit('faction:breakaway-established', {
      civId,
      originOwnerId: meta.originOwnerId,
    });
  }
  return next;
}

function withBreakaway(state: GameState, civId: string, breakaway: BreakawayMetadata): GameState {
  return { ...state, civilizations: { ...state.civilizations, [civId]: { ...state.civilizations[civId]!, breakaway } } };
}

/** Bring a breakaway home on an offer (`getReabsorbQuote` decides whether, and for how much). */
export function tryReabsorbBreakaway(
  stateBefore: GameState,
  ownerId: string,
  breakawayId: string,
  bus?: EventBus,
): GameState {
  const quote = getReabsorbQuote(stateBefore, ownerId, breakawayId);
  if (!quote.ok) throw new Error(REABSORB_DENIAL_MESSAGES[quote.reason]);
  return reunifyBreakaway(stateBefore, ownerId, breakawayId, quote.cost, bus);
}

/** The transfer itself: every city, unit and tile of the breakaway returns to its origin owner, who pays `cost`. */
function reunifyBreakaway(
  stateBefore: GameState,
  ownerId: string,
  breakawayId: string,
  cost: number,
  bus?: EventBus,
): GameState {
  const owner = stateBefore.civilizations[ownerId]!;
  const breakaway = stateBefore.civilizations[breakawayId]!;
  // #1506 MR09: each city leaves the breakaway's control, so its material commitment is released against
  // the breakaway's ledger first; the origin owner funds the inherited work from its own ledger below.
  let state = stateBefore;
  for (const city of Object.values(stateBefore.cities)) {
    if (city.owner === breakawayId) state = releaseCityMaterialCommitment(state, city.id);
  }
  const transferredCities = Object.values(state.cities)
    .filter(city => city.owner === breakawayId);
  const transferredCityIds = transferredCities.map(city => city.id);

  const updatedCivilizations = { ...state.civilizations };
  const transferredUnitIds = Object.values(state.units)
    .filter(unit => unit.owner === breakawayId)
    .map(unit => unit.id);
  updatedCivilizations[ownerId] = {
    ...owner,
    gold: owner.gold - cost,
    cities: [...owner.cities, ...transferredCityIds.filter(cityId => !owner.cities.includes(cityId))],
    units: [...owner.units, ...transferredUnitIds.filter(unitId => !owner.units.includes(unitId))],
  };
  // The breakaway keeps its record until the teardown below has scrubbed it from everyone else.
  updatedCivilizations[breakawayId] = { ...breakaway, cities: [], units: [] };

  const updatedUnits = { ...state.units };
  for (const unitId of transferredUnitIds) {
    updatedUnits[unitId] = withNewOwner(state, updatedUnits[unitId]!, ownerId);
  }

  const updatedMapTiles = { ...state.map.tiles };
  for (const [key, tile] of Object.entries(updatedMapTiles)) {
    if (tile.owner === breakawayId) updatedMapTiles[key] = { ...tile, owner: ownerId };
  }

  const nextState: GameState = {
    ...state,
    units: updatedUnits,
    map: {
      ...state.map,
      tiles: updatedMapTiles,
    },
    cities: {
      ...state.cities,
      ...Object.fromEntries(transferredCities.map(city => [city.id, {
        ...city,
        owner: ownerId,
        unrestLevel: 0,
        unrestTurns: 0,
      }])),
    },
    civilizations: updatedCivilizations,
  };
  // Removing a civilization must scrub it from every other civ's relationships, wars, treaties,
  // vassalage, embargoes, leagues, pending requests, espionage and AI plans in the same operation
  // (Diplomacy Lifecycle). That is exactly the elimination teardown; the breakaway now holds
  // nothing, so it removes nothing else. Its record is then dropped, as reabsorption always did,
  // and no elimination is announced: a reabsorption is not a defeat.
  const funded = transferredCityIds.reduce((acc, id) => beginCityMaterialOccurrence(acc, id), nextState);
  const tornDown = eliminateCivilization(funded, breakawayId, ownerId).state;
  const { [breakawayId]: _reabsorbed, ...remainingCivilizations } = tornDown.civilizations;
  // The cities and units changed hands where they stood: anything now on a tile it may not hold (another civ's unit
  // inside a rejoined city, a returning unit stacked with someone else's) steps out by the shared rule.
  const cityKeys = new Set(transferredCities.map(city => hexKey(city.position)));
  const toSettle = [
    ...transferredUnitIds,
    ...Object.values(tornDown.units).filter(unit => cityKeys.has(hexKey(unit.position))).map(unit => unit.id),
  ];
  const withoutBreakaway = settleStrandedUnits({ ...tornDown, civilizations: remainingCivilizations }, toSettle);
  const liveness = reconcileCivilizationLiveness(state, withoutBreakaway);
  if (bus) emitCivilizationLivenessTransitions(liveness, bus);
  return liveness.state;
}

export function reconquerBreakawayCity(
  state: GameState,
  ownerId: string,
  breakawayId: string,
  cityId: string,
): GameState {
  const owner = state.civilizations[ownerId];
  const breakaway = state.civilizations[breakawayId];
  const city = state.cities[cityId];
  if (!owner || !breakaway?.breakaway || !city) {
    throw new Error('Cannot reconquer missing breakaway state');
  }

  const updatedCity = {
    ...city,
    owner: ownerId,
    unrestLevel: 1 as const,
    unrestTurns: 0,
  };

  const updatedMapTiles = { ...state.map.tiles };
  for (const coord of city.ownedTiles) {
    const key = `${coord.q},${coord.r}`;
    const tile = updatedMapTiles[key];
    if (tile) {
      updatedMapTiles[key] = {
        ...tile,
        owner: ownerId,
      };
    }
  }

  return {
    ...state,
    map: {
      ...state.map,
      tiles: updatedMapTiles,
    },
    cities: {
      ...state.cities,
      [cityId]: updatedCity,
    },
    civilizations: {
      ...state.civilizations,
      [ownerId]: {
        ...owner,
        cities: owner.cities.includes(cityId) ? owner.cities : [...owner.cities, cityId],
      },
      [breakawayId]: {
        ...breakaway,
        cities: breakaway.cities.filter(id => id !== cityId),
      },
    },
  };
}
