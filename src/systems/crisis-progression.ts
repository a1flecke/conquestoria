// #1012: archetype-specific per-turn behavior — "what happens to THIS crisis on THIS
// tick, given its archetype." This is crisis-specific POLICY: outbreak/famine spread and
// remedy resolution, catastrophe blast/recovery, hunt spawn/escalation. The generic
// "iterate active crises, apply a tick, keep or drop the result" loop that CALLS
// `tickCrisisByArchetype` lives in crisis-lifecycle.ts — that seam (dispatch vs. the
// archetype bodies dispatched to) is exactly the boundary #990 will generalize into a
// reusable staged-lifecycle engine, with these archetype bodies becoming crisis's own
// stage handlers rather than the only kind that can exist.
import type { ActiveCrisis, BeastLair, City, GameState, HexCoord } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { resolvePressureSeverityForCiv } from '@/core/opponent-challenge';
import { createPirateFleetNear, pickBanditName } from './threat-pressure-system';
import { getCrisisFlavor, type CrisisFlavor } from './crisis-flavor-definitions';
import { createSimulationRng } from './simulation-rng';
import { hexKey, mapDistance, mapHexesInRange } from './hex-utils';
import { spawnBarbarianCamp } from './barbarian-system';
import { BEAST_DEFINITIONS } from './beast-definitions';
import { BEAST_OWNER, isTerrainPassableForBeast } from './beast-system';
import { createUnit } from './unit-system';
import { buildUnitOccupancy, getUnitIdsAtCoord } from './unit-occupancy';
import { resolveWorldPressureFlags } from './world-pressure-flags';
import { applyInteractionReputation, getCrisisInteractionDefinition } from './crisis-interaction-system';
import { resolveCivDefinition } from './civ-registry';
import { calculateProjectedCityYields } from './city-work-system';
import { resolveCivilizationEra } from './tech-definitions';
import { cureImmunityWindow } from './crisis-effects';

// ── Outbreak resolver ────────────────────────────────────────────────────────

// #919 MR1: drop expired re-infection-immunity entries so curedUntilTurn stays bounded.
function pruneExpiredCureImmunity(crisis: ActiveCrisis, turn: number): ActiveCrisis {
  if (!crisis.curedUntilTurn) return crisis;
  const live = Object.fromEntries(
    Object.entries(crisis.curedUntilTurn).filter(([, until]) => until >= turn),
  );
  return { ...crisis, curedUntilTurn: Object.keys(live).length > 0 ? live : undefined };
}

function tickOutbreakCrisis(
  state: GameState,
  crisis: ActiveCrisis,
  bus: EventBus,
): { crisis: ActiveCrisis | null; state: GameState } {
  const flavor = getCrisisFlavor(crisis.flavorId);
  if (!flavor) return { crisis: null, state };

  let working: ActiveCrisis = { ...crisis, turnsInStage: crisis.turnsInStage + 1 };
  let nextState = state;
  const severity = flavor.severityByChallenge[resolvePressureSeverityForCiv(state, crisis.targetCivId)];

  // #526 MR7 sabotage_relief: an unexpired sabotage pauses remedy completions entirely
  // (spread below is unaffected); clear it once its window passes so remedy resumes.
  if (working.sabotage && working.sabotage.untilTurn <= state.turn) {
    working = { ...working, sabotage: undefined };
  }
  const remedyPaused = working.sabotage !== undefined && working.sabotage.untilTurn > state.turn;

  working = pruneExpiredCureImmunity(working, state.turn); // #919 MR1

  // Remedy completion
  if (working.remedyCompletionByCity && !remedyPaused) {
    const remaining: Record<string, number> = {};
    let cityIds = working.cityIds;
    let quarantinedCityIds = working.quarantinedCityIds;
    const curedUntilTurn: Record<string, number> = { ...(working.curedUntilTurn ?? {}) };
    const civ = nextState.civilizations[working.targetCivId];
    for (const [cityId, completionTurn] of Object.entries(working.remedyCompletionByCity)) {
      if (state.turn >= completionTurn) {
        cityIds = cityIds.filter(id => id !== cityId);
        quarantinedCityIds = quarantinedCityIds?.filter(id => id !== cityId);
        curedUntilTurn[cityId] = state.turn + cureImmunityWindow(civ); // #919 MR1
      } else {
        remaining[cityId] = completionTurn;
      }
    }
    working = { ...working, cityIds, quarantinedCityIds, remedyCompletionByCity: remaining, curedUntilTurn };
  }

  if (working.cityIds.length === 0) {
    bus.emit('crisis:resolved', {
      crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'contained',
    });
    return { crisis: null, state: nextState };
  }

  // Explorer auto-expiry
  if (severity.autoExpireTurns !== null && working.turnsInStage >= severity.autoExpireTurns) {
    bus.emit('crisis:resolved', {
      crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'expired',
    });
    return { crisis: null, state: nextState };
  }

  // Veteran pop loss
  if (severity.popLossEveryNTurnsIgnored !== null &&
      working.turnsInStage % severity.popLossEveryNTurnsIgnored === 0) {
    const cities = { ...nextState.cities };
    for (const cityId of working.cityIds) {
      if (working.quarantinedCityIds?.includes(cityId)) continue;
      if (working.remedyCompletionByCity?.[cityId] !== undefined) continue;
      const city = cities[cityId];
      if (!city) continue;
      cities[cityId] = { ...city, population: Math.max(1, city.population - 1) };
    }
    nextState = { ...nextState, cities };
  }

  // Spread
  const owner = working.targetCivId;
  for (const cityId of [...working.cityIds]) {
    if (working.quarantinedCityIds?.includes(cityId)) continue;
    if (working.remedyCompletionByCity?.[cityId] !== undefined) continue; // #919 MR1: a remedy-underway city no longer spreads
    const city = nextState.cities[cityId];
    if (!city) continue;
    // #982: one draw per (crisis, city) per turn -- the enclosing loop visits
    // each cityId at most once per tick, so no ordinal is needed.
    const rng = createSimulationRng(nextState, { domain: 'crisis-spread', eventId: working.id, targetId: cityId });
    const boost = flavor.spreadBoostPredicate?.(nextState, city) ? 0.15 : 0;
    if (rng() >= 0.20 + boost) continue;
    const candidates = Object.values(nextState.cities)
      .filter(c =>
        c.owner === owner &&
        !working.cityIds.includes(c.id) &&
        !(working.curedUntilTurn?.[c.id] !== undefined && working.curedUntilTurn[c.id] >= nextState.turn)); // #919 MR1
    if (candidates.length === 0) continue;
    const target = candidates.reduce((closest, c) =>
      mapDistance(nextState.map, c.position, city.position) < mapDistance(nextState.map, closest.position, city.position) ? c : closest);
    working = { ...working, cityIds: [...working.cityIds, target.id] };
    bus.emit('crisis:spread', { crisisId: working.id, fromCityId: cityId, toCityId: target.id });
  }

  return { crisis: working, state: nextState };
}

// ── Famine resolver (#590 MR3) ───────────────────────────────────────────────

// Consecutive turns a city's food surplus must stay positive before the famine
// auto-resolves out of that city — independent of remedy/quarantine (issue #590:
// "containment accelerates while the afflicted city's food surplus > 0"). Shorter
// than plague's autoExpireTurns (5) since this is a player-influenceable mechanic
// (farms, granary, aid can all push surplus positive), not a pure timer.
export const FAMINE_CONTAINMENT_SURPLUS_TURNS = 3;

function tickFamineCrisis(
  state: GameState,
  crisis: ActiveCrisis,
  bus: EventBus,
): { crisis: ActiveCrisis | null; state: GameState } {
  const flavor = getCrisisFlavor(crisis.flavorId);
  if (!flavor) return { crisis: null, state };

  let working: ActiveCrisis = { ...crisis, turnsInStage: crisis.turnsInStage + 1 };
  let nextState = state;
  const severity = flavor.severityByChallenge[resolvePressureSeverityForCiv(state, crisis.targetCivId)];

  if (working.sabotage && working.sabotage.untilTurn <= state.turn) {
    working = { ...working, sabotage: undefined };
  }
  const remedyPaused = working.sabotage !== undefined && working.sabotage.untilTurn > state.turn;

  working = pruneExpiredCureImmunity(working, state.turn); // #919 MR1

  // Remedy completion — identical shape to tickOutbreakCrisis, plus clearing any
  // surplus-streak bookkeeping for a city that just left via remedy.
  if (working.remedyCompletionByCity && !remedyPaused) {
    const remaining: Record<string, number> = {};
    let cityIds = working.cityIds;
    let quarantinedCityIds = working.quarantinedCityIds;
    let surplusStreak = working.famineSurplusStreakByCity;
    const curedUntilTurn: Record<string, number> = { ...(working.curedUntilTurn ?? {}) };
    const civ = nextState.civilizations[working.targetCivId];
    for (const [cityId, completionTurn] of Object.entries(working.remedyCompletionByCity)) {
      if (state.turn >= completionTurn) {
        cityIds = cityIds.filter(id => id !== cityId);
        quarantinedCityIds = quarantinedCityIds?.filter(id => id !== cityId);
        curedUntilTurn[cityId] = state.turn + cureImmunityWindow(civ); // #919 MR1
        if (surplusStreak && cityId in surplusStreak) {
          const { [cityId]: _removed, ...rest } = surplusStreak;
          surplusStreak = rest;
        }
      } else {
        remaining[cityId] = completionTurn;
      }
    }
    working = { ...working, cityIds, quarantinedCityIds, remedyCompletionByCity: remaining, famineSurplusStreakByCity: surplusStreak, curedUntilTurn };
  }

  if (working.cityIds.length === 0) {
    bus.emit('crisis:resolved', {
      crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'contained',
    });
    return { crisis: null, state: nextState };
  }

  // Explorer auto-expiry — identical to tickOutbreakCrisis.
  if (severity.autoExpireTurns !== null && working.turnsInStage >= severity.autoExpireTurns) {
    bus.emit('crisis:resolved', {
      crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'expired',
    });
    return { crisis: null, state: nextState };
  }

  // Veteran pop loss — epidemic-control (era 6 tech) halves the effective interval.
  // Scoped to famine only: the tech's promise text says "population loss from famine",
  // never disease — plague/red-tide (still outbreak) are intentionally unaffected.
  if (severity.popLossEveryNTurnsIgnored !== null) {
    const targetCiv = nextState.civilizations[working.targetCivId];
    const hasEpidemicControl = targetCiv?.techState.completed.includes('epidemic-control') ?? false;
    const effectiveInterval = hasEpidemicControl
      ? severity.popLossEveryNTurnsIgnored * 2
      : severity.popLossEveryNTurnsIgnored;
    if (working.turnsInStage % effectiveInterval === 0) {
      const cities = { ...nextState.cities };
      for (const cityId of working.cityIds) {
        if (working.quarantinedCityIds?.includes(cityId)) continue;
        if (working.remedyCompletionByCity?.[cityId] !== undefined) continue;
        const city = cities[cityId];
        if (!city) continue;
        cities[cityId] = { ...city, population: Math.max(1, city.population - 1) };
      }
      nextState = { ...nextState, cities };
    }
  }

  // Spread — identical shape to tickOutbreakCrisis.
  const owner = working.targetCivId;
  for (const cityId of [...working.cityIds]) {
    if (working.quarantinedCityIds?.includes(cityId)) continue;
    if (working.remedyCompletionByCity?.[cityId] !== undefined) continue; // #919 MR1: parity with tickOutbreakCrisis
    const city = nextState.cities[cityId];
    if (!city) continue;
    // #982: same domain tag as tickOutbreakCrisis's identical spread roll --
    // safe because the two never tick the same crisis instance (each crisis
    // flavor has exactly one active-stage ticker), so `working.id` never
    // collides between them.
    const rng = createSimulationRng(nextState, { domain: 'crisis-spread', eventId: working.id, targetId: cityId });
    const boost = flavor.spreadBoostPredicate?.(nextState, city) ? 0.15 : 0;
    if (rng() >= 0.20 + boost) continue;
    const candidates = Object.values(nextState.cities)
      .filter(c =>
        c.owner === owner &&
        !working.cityIds.includes(c.id) &&
        !(working.curedUntilTurn?.[c.id] !== undefined && working.curedUntilTurn[c.id] >= nextState.turn)); // #919 MR1
    if (candidates.length === 0) continue;
    const target = candidates.reduce((closest, c) =>
      mapDistance(nextState.map, c.position, city.position) < mapDistance(nextState.map, closest.position, city.position) ? c : closest);
    working = { ...working, cityIds: [...working.cityIds, target.id] };
    bus.emit('crisis:spread', { crisisId: working.id, fromCityId: cityId, toCityId: target.id });
  }

  // Passive auto-contain: consecutive turns of positive food surplus resolve a city
  // out of the crisis on its own, independent of remedy/quarantine (issue #590). Not
  // blocked by quarantine — quarantine's job is stopping SPREAD, not the afflicted
  // city's own recovery.
  const civ = nextState.civilizations[owner];
  const bonusEffect = civ ? resolveCivDefinition(nextState, civ.civType)?.bonusEffect : undefined;
  const nextSurplusStreak: Record<string, number> = { ...(working.famineSurplusStreakByCity ?? {}) };
  let remainingCityIds = working.cityIds;
  for (const cityId of working.cityIds) {
    const city = nextState.cities[cityId];
    if (!city) continue;
    const projectedYields = calculateProjectedCityYields(nextState, cityId, bonusEffect);
    const surplus = projectedYields.food - city.population;
    if (surplus > 0) {
      const streak = (nextSurplusStreak[cityId] ?? 0) + 1;
      if (streak >= FAMINE_CONTAINMENT_SURPLUS_TURNS) {
        remainingCityIds = remainingCityIds.filter(id => id !== cityId);
        delete nextSurplusStreak[cityId];
      } else {
        nextSurplusStreak[cityId] = streak;
      }
    } else {
      delete nextSurplusStreak[cityId];
    }
  }
  working = {
    ...working,
    cityIds: remainingCityIds,
    quarantinedCityIds: working.quarantinedCityIds?.filter(id => remainingCityIds.includes(id)),
    famineSurplusStreakByCity: Object.keys(nextSurplusStreak).length > 0 ? nextSurplusStreak : undefined,
  };

  if (working.cityIds.length === 0) {
    bus.emit('crisis:resolved', {
      crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'contained',
    });
    return { crisis: null, state: nextState };
  }

  return { crisis: working, state: nextState };
}

// ── Catastrophe resolver ─────────────────────────────────────────────────────

const CATASTROPHE_RECOVERY_WINDOW_TURNS = 5;

function applyCatastropheShock(
  state: GameState,
  crisis: ActiveCrisis,
  bus: EventBus,
): { crisis: ActiveCrisis | null; state: GameState } {
  const flavor = getCrisisFlavor(crisis.flavorId);
  const params = flavor?.catastrophe;
  const targetCity = state.cities[crisis.cityIds[0]];
  if (!flavor || !params || !targetCity) {
    bus.emit('crisis:resolved', { crisisId: crisis.id, flavorId: crisis.flavorId, civId: crisis.targetCivId, outcome: 'abandoned' });
    return { crisis: null, state };
  }

  const owner = crisis.targetCivId;
  const epicenterCandidates = mapHexesInRange(state.map, targetCity.position, params.blastRadius)
    .filter(coord => state.map.tiles[hexKey(coord)]?.owner === owner);
  if (epicenterCandidates.length === 0) {
    // No owned tile to strike (shouldn't happen — the target city's own tile is always
    // owned by its civ — but never silently transition to 'recovery' with empty
    // tileKeys: the next tick's "every tile cleared" check is vacuously true on an
    // empty array and would wrongly resolve 'recovered' with a bonus for a crisis
    // that never actually devastated anything.
    bus.emit('crisis:resolved', { crisisId: crisis.id, flavorId: crisis.flavorId, civId: crisis.targetCivId, outcome: 'abandoned' });
    return { crisis: null, state };
  }

  // #982: one epicenter roll per crisis instance per onset tick.
  const rng = createSimulationRng(state, { domain: 'crisis-epicenter', eventId: crisis.id });
  const epicenter = epicenterCandidates[Math.floor(rng() * epicenterCandidates.length)];
  const epicenterKey = hexKey(epicenter);

  const devastationTurns = params.devastationTurnsByChallenge[resolvePressureSeverityForCiv(state, owner)];
  const devastatedUntilTurn = state.turn + devastationTurns;
  const affectedKeys = mapHexesInRange(state.map, epicenter, params.blastRadius)
    .map(hexKey)
    .filter(key => {
      const t = state.map.tiles[key];
      if (!t || t.owner !== owner) return false;
      // A tile's devastatedUntilTurn is a single value, not a per-crisis list — if two
      // overlapping catastrophes both claimed it, the second shock would silently
      // overwrite the first crisis's timer and corrupt its own resolution bookkeeping
      // (it would keep waiting on a devastatedUntilTurn it no longer owns). Never
      // re-claim a tile another still-active catastrophe already devastated.
      if (t.devastatedUntilTurn !== undefined && t.devastatedUntilTurn > state.turn) return false;
      return true;
    });
  if (affectedKeys.length === 0) {
    // Every candidate tile in blast radius is already claimed by another active
    // catastrophe — nothing new for this crisis to do.
    bus.emit('crisis:resolved', { crisisId: crisis.id, flavorId: crisis.flavorId, civId: crisis.targetCivId, outcome: 'abandoned' });
    return { crisis: null, state };
  }

  const isVeteran = resolvePressureSeverityForCiv(state, owner) === 'veteran';
  const destroysImprovement = params.destroysEpicenterImprovement && isVeteran && resolveCivilizationEra(state.civilizations[owner]?.techState.completed ?? []) >= 3;

  const tiles = { ...state.map.tiles };
  for (const key of affectedKeys) {
    const tile = tiles[key];
    tiles[key] = {
      ...tile,
      devastatedUntilTurn,
      ...(destroysImprovement && key === epicenterKey ? { improvement: 'none' as const } : {}),
    };
  }

  const nextState: GameState = { ...state, map: { ...state.map, tiles } };
  const updated: ActiveCrisis = { ...crisis, stage: 'recovery', tileKeys: affectedKeys };
  bus.emit('crisis:escalated', { crisisId: crisis.id, stage: 'recovery' });
  return { crisis: updated, state: nextState };
}

function tickCatastropheCrisis(
  state: GameState,
  crisis: ActiveCrisis,
  bus: EventBus,
): { crisis: ActiveCrisis | null; state: GameState } {
  const flavor = getCrisisFlavor(crisis.flavorId);
  if (!flavor?.catastrophe) return { crisis: null, state };

  let working: ActiveCrisis = { ...crisis, turnsInStage: crisis.turnsInStage + 1 };
  let nextState = state;

  if (working.stage === 'active') {
    const shocked = applyCatastropheShock(nextState, working, bus);
    nextState = shocked.state;
    if (!shocked.crisis) return { crisis: null, state: nextState };
    working = shocked.crisis;
    return { crisis: working, state: nextState };
  }

  const tiles = working.tileKeys.map(key => nextState.map.tiles[key]).filter((t): t is NonNullable<typeof t> => !!t);
  const stillDevastated = tiles.some(t => t.devastatedUntilTurn !== undefined && t.devastatedUntilTurn > nextState.turn);
  if (stillDevastated) return { crisis: working, state: nextState };

  // Every tile has cleared, either by active restoration (devastatedUntilTurn cleared to
  // undefined before its natural expiry) or by the timer simply passing. Only the former,
  // completed within the recovery window, earns the resilience bonus.
  const allActivelyRestored = tiles.every(t => t.devastatedUntilTurn === undefined);
  const withinWindow = nextState.turn <= working.startedTurn + CATASTROPHE_RECOVERY_WINDOW_TURNS;
  const challenge = resolvePressureSeverityForCiv(nextState, working.targetCivId);

  if (allActivelyRestored && withinWindow) {
    const cities = { ...nextState.cities };
    for (const cityId of working.cityIds) {
      const city = cities[cityId];
      if (city) cities[cityId] = { ...city, resilienceBonusUntilTurn: nextState.turn + CATASTROPHE_RECOVERY_WINDOW_TURNS };
    }
    nextState = { ...nextState, cities };
    bus.emit('crisis:resolved', { crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'recovered' });
    return { crisis: null, state: nextState };
  }

  const outcome = challenge === 'explorer' ? 'recovered' : 'expired';
  bus.emit('crisis:resolved', { crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome });
  return { crisis: null, state: nextState };
}

// ── Hunt resolver ────────────────────────────────────────────────────────────

const HUNT_ESCALATION_TURNS = 5;

// 3-5 tiles from the target city, in unclaimed wilderness (not just "not the target's
// own territory" — a rival civ's nearby garrison could otherwise kill the foe before the
// target player gets a turn, handing them the reward and defeating the "go fight it"
// loop for the player the hunt was actually scheduled for), on terrain the foe can
// actually occupy, and never stacking on another unit — same spawn-occupancy contract
// as every other entity-spawn path in the game.
function findHuntSpawnHex(
  state: GameState,
  targetCity: City,
  isPassable: (terrain: string) => boolean,
  rng: () => number,
): HexCoord | null {
  const occupancy = buildUnitOccupancy(state.units);
  const candidates = mapHexesInRange(state.map, targetCity.position, 5)
    .filter(coord => mapDistance(state.map, coord, targetCity.position) >= 3)
    .filter(coord => {
      const tile = state.map.tiles[hexKey(coord)];
      if (!tile) return false;
      if (tile.owner !== null) return false;
      if (!isPassable(tile.terrain)) return false;
      return getUnitIdsAtCoord(occupancy, coord).length === 0;
    });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

function spawnBeastHunt(
  state: GameState,
  crisis: ActiveCrisis,
  targetCity: City,
  rng: () => number,
): { crisis: ActiveCrisis | null; state: GameState } {
  const targetEra = resolveCivilizationEra(state.civilizations[crisis.targetCivId]?.techState.completed ?? []);
  const eligible = Object.values(BEAST_DEFINITIONS).filter(d => d.awakenEra <= targetEra);
  if (eligible.length === 0) return { crisis: null, state };
  const def = eligible[Math.floor(rng() * eligible.length)];

  const spawnHex = findHuntSpawnHex(
    state, targetCity,
    terrain => isTerrainPassableForBeast(def.unitType, terrain), rng,
  );
  if (!spawnHex) return { crisis: null, state };

  const beastUnit = createUnit(def.unitType, BEAST_OWNER, spawnHex, state.idCounters);
  const lairId = `hunt-lair-${crisis.id}`;
  const lair: BeastLair = {
    id: lairId, beastId: def.id, position: { ...spawnHex }, status: 'awake',
    strength: 0, awakenedTurn: state.turn, unitIds: [beastUnit.id],
  };
  const existingBeasts = state.beasts ?? { mode: 'wild' as const, lairs: {}, sightingsByCiv: {} };

  const nextState: GameState = {
    ...state,
    units: { ...state.units, [beastUnit.id]: beastUnit },
    beasts: { ...existingBeasts, lairs: { ...existingBeasts.lairs, [lairId]: lair } },
  };
  return {
    crisis: { ...crisis, stage: 'menacing', huntEntityId: beastUnit.id, foeName: def.name },
    state: nextState,
  };
}

function spawnBarbarianHunt(
  state: GameState,
  crisis: ActiveCrisis,
  rng: () => number,
): { crisis: ActiveCrisis | null; state: GameState } {
  const civ = state.civilizations[crisis.targetCivId];
  const cityPositions = Object.values(state.cities).map(c => c.position);
  const existingCamps = Object.values(state.barbarianCamps);
  // spawnBarbarianCamp (barbarian-system.ts) still takes a raw int seed --
  // derived from the canonical stream here rather than refactoring its
  // signature, since #982 only requires the *root* seed to be gameId-rooted,
  // not every downstream consumer's parameter shape.
  const seed = Math.floor(rng() * 2147483647);
  const occupiedHexKeys = new Set(Object.keys(buildUnitOccupancy(state.units).unitIdsByHex));
  const camp = spawnBarbarianCamp(state.map, cityPositions, existingCamps, seed, state.idCounters, occupiedHexKeys);
  if (!camp) return { crisis: null, state };

  const foeName = pickBanditName(civ?.civType ?? 'generic', rng);
  const namedCamp = { ...camp, banditLordName: foeName };
  const nextState: GameState = {
    ...state,
    barbarianCamps: { ...state.barbarianCamps, [namedCamp.id]: namedCamp },
  };
  return {
    crisis: { ...crisis, stage: 'menacing', huntEntityId: namedCamp.id, foeName },
    state: nextState,
  };
}

function spawnPirateHunt(
  state: GameState,
  crisis: ActiveCrisis,
  targetCity: City,
  rng: () => number,
): { crisis: ActiveCrisis | null; state: GameState } {
  const civ = state.civilizations[crisis.targetCivId];
  const landmassId = state.map.tiles[hexKey(targetCity.position)]?.regionKey;
  if (!landmassId) return { crisis: null, state };
  const { state: nextState, fleetId } = createPirateFleetNear(state, crisis.targetCivId, landmassId, targetCity, rng);
  if (!fleetId) return { crisis: null, state };

  const foeName = pickBanditName(civ?.civType ?? 'generic', rng);
  return {
    crisis: { ...crisis, stage: 'menacing', huntEntityId: fleetId, foeName },
    state: nextState,
  };
}

function huntEntityExists(state: GameState, crisis: ActiveCrisis, flavor: CrisisFlavor): boolean {
  const entityId = crisis.huntEntityId;
  if (!entityId) return false;
  switch (flavor.hunt?.spawnKind) {
    case 'beast': return !!state.units[entityId];
    case 'barbarian-camp': return !!state.barbarianCamps[entityId];
    case 'pirate': {
      // huntEntityId stores the fleetId, but nothing in the pirate system currently
      // prunes state.pirateFleets when the fleet's ship dies in combat — checking the
      // fleet record would make this hunt un-resolvable forever. The underlying unit
      // IS reliably removed from state.units by every combat path (shared
      // applyCombatOutcomeToState), so key existence off that instead.
      const fleet = state.pirateFleets?.[entityId];
      return !!fleet && !!state.units[fleet.unitId];
    }
    default: return false;
  }
}

function tickHuntCrisis(
  state: GameState,
  crisis: ActiveCrisis,
  bus: EventBus,
): { crisis: ActiveCrisis | null; state: GameState } {
  const flavor = getCrisisFlavor(crisis.flavorId);
  if (!flavor?.hunt) return { crisis: null, state };

  let working: ActiveCrisis = { ...crisis, turnsInStage: crisis.turnsInStage + 1 };
  let nextState = state;

  if (working.stage === 'active') {
    const targetCity = state.cities[working.cityIds[0]];
    if (!targetCity) {
      bus.emit('crisis:resolved', { crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'abandoned' });
      return { crisis: null, state: nextState };
    }
    // #982: one hunt-spawn roll per crisis instance per active-stage tick.
    const rng = createSimulationRng(state, { domain: 'crisis-hunt-spawn', eventId: working.id });
    const spawned = flavor.hunt.spawnKind === 'beast'
      ? spawnBeastHunt(nextState, working, targetCity, rng)
      : flavor.hunt.spawnKind === 'barbarian-camp'
        ? spawnBarbarianHunt(nextState, working, rng)
        : spawnPirateHunt(nextState, working, targetCity, rng);
    nextState = spawned.state;
    if (!spawned.crisis) {
      // No legal spawn hex / no candidate — nothing for this hunt to menace with.
      bus.emit('crisis:resolved', { crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'abandoned' });
      return { crisis: null, state: nextState };
    }
    bus.emit('crisis:escalated', {
      crisisId: spawned.crisis.id, stage: 'menacing',
      civId: spawned.crisis.targetCivId, foeName: spawned.crisis.foeName,
    });
    return { crisis: spawned.crisis, state: nextState };
  }

  if (huntEntityExists(nextState, working, flavor)) {
    const challenge = resolvePressureSeverityForCiv(nextState, working.targetCivId);
    if (challenge === 'veteran' && working.stage === 'menacing' && working.turnsInStage >= HUNT_ESCALATION_TURNS) {
      working = { ...working, stage: 'assaulting' };
      bus.emit('crisis:escalated', {
        crisisId: working.id, stage: 'assaulting',
        civId: working.targetCivId, foeName: working.foeName,
      });
    }
    return { crisis: working, state: nextState };
  }

  // The foe is gone — resolve 'hunted' regardless of who claimed the kill. The
  // beast-slayer's feast (feastUntilTurn on the killer civ) is applied by whichever
  // combat/camp-destruction path recorded lastHuntKillerCivId on this crisis; if none
  // did (e.g. the entity was removed by some other path), fall back to the target civ
  // per the plan's "fall back to the target civ if unattributed" rule.
  const killerCivId = working.lastHuntKillerCivId ?? working.targetCivId;
  const killerCiv = nextState.civilizations[killerCivId];
  if (killerCiv) {
    nextState = {
      ...nextState,
      civilizations: {
        ...nextState.civilizations,
        [killerCivId]: { ...killerCiv, feastUntilTurn: nextState.turn + 5 },
      },
    };
  }
  // Hunt-their-foe (#526 MR6): killerCivId is only ever recorded as a real major-civ id
  // (hunt-crisis-linkage.ts's isMajorCivOwner check), so "differs from the target" alone
  // identifies a genuine third-civ kill -- no separate humanity/major-civ check needed.
  // Dark until aiCrisisInteractions leaves 'off' (MR6's own rollout flag).
  if (
    killerCivId !== working.targetCivId
    && resolveWorldPressureFlags(nextState.settings).aiCrisisInteractions !== 'off'
  ) {
    nextState = applyInteractionReputation(
      nextState, killerCivId, working.targetCivId, getCrisisInteractionDefinition('hunt_their_foe')!,
    );
    bus.emit('crisis:foe-hunted-by-ally', {
      crisisId: working.id, killerCivId, targetCivId: working.targetCivId, foeName: working.foeName,
    });
  }
  if (flavor.hunt.spawnKind === 'beast' && nextState.beasts) {
    // The ephemeral hunt lair (registered only so recordBeastSlain's hoard-gold path
    // fires normally) has no map-generation meaning once the hunt is over — unlike an
    // organic lair, its position is an arbitrary frontier spawn point, not a discovered
    // landmark. Leaving it in state.beasts.lairs forever would both bloat the save and
    // permanently clutter the map with a 🏆 marker (render-loop.ts draws one for every
    // 'slain'/'claimed' lair) at that arbitrary spot — and since hunts can recur every
    // 5-12 turns per human for the rest of the game, that accumulation is unbounded.
    const { [`hunt-lair-${working.id}`]: _removedLair, ...lairs } = nextState.beasts.lairs;
    nextState = { ...nextState, beasts: { ...nextState.beasts, lairs } };
  }
  bus.emit('crisis:resolved', {
    crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'hunted',
    foeName: working.foeName, killerCivId,
  });
  return { crisis: null, state: nextState };
}

// Archetype-specific tick dispatch. MR3 (hunt) and beyond add a case here —
// keep this the single dispatch point rather than branching inline elsewhere.
// This is the exact seam #990 generalizes: crisis-lifecycle.ts's processCrisisTurn
// calls this function generically ("tick whichever archetype this instance is"); a
// generalized chain engine would call an equivalent per-chain-kind stage handler here
// instead of switching on `archetype`.
export function tickCrisisByArchetype(
  state: GameState,
  crisis: ActiveCrisis,
  bus: EventBus,
): { crisis: ActiveCrisis | null; state: GameState } {
  switch (crisis.archetype) {
    case 'outbreak':
      return tickOutbreakCrisis(state, crisis, bus);
    case 'catastrophe':
      return tickCatastropheCrisis(state, crisis, bus);
    case 'hunt':
      return tickHuntCrisis(state, crisis, bus);
    case 'famine':
      return tickFamineCrisis(state, crisis, bus);
    default:
      // Not yet implemented (MR4's uprising lives in faction-system.ts, not here) —
      // leave untouched rather than silently dropping or mutating a crisis type this
      // resolver doesn't know.
      return { crisis, state };
  }
}
