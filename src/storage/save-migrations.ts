import type { ActiveCrisis, AirBaseRef, CombatRole, GameState, GeneratedGeneralIdentity, HexCoord, LegendaryWonderMilitaryFact, LegendaryWonderTacticalEffectState, TradeRoute, Unit } from '@/core/types';
import { createRng } from '@/systems/map-generator';
import { placeLateResources } from '@/systems/late-resource-placement';
import { createMarketplaceState } from '@/systems/trade-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { createEmptyAutonomyCivState } from '@/core/autonomy-state';
import { hexDistance, wrappedHexDistance, hexKey, hexNeighbors, getWrappedHexNeighbors } from '@/systems/hex-utils';
import { assignNetworkPlan, isAutonomyActivated } from '@/systems/network-plan-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getCrisisFlavor } from '@/systems/crisis-flavor-definitions';
import { resolveWorldAge } from '@/systems/tech-definitions';
import { CIRCULAR_MANUFACTURING_MATERIALS } from '@/systems/national-project-system';
import { appendNotification } from '@/core/notification-log';
import { syncTransportCargoPositions } from '@/systems/transport-system';
import { IMPROVEMENT_BUILD_TURNS } from '@/systems/improvement-system';
import type { ImprovementType } from '@/core/types';
import { normalizeBarbarianCampPressure } from '@/systems/barbarian-pressure';
import { normalizeCrisisForces } from '@/systems/crisis-force-system';
import { normalizeStampedes } from '@/systems/stampede-system';
import { normalizeRogueElephantHosts } from '@/systems/rogue-elephant-host-system';
import { UNIT_ROLE_DEFINITIONS } from '@/systems/combat-role-definitions';

export const CURRENT_SAVE_SCHEMA_VERSION = 23;

export type SaveMigration = (state: GameState) => GameState;

export class UnsupportedSaveSchemaVersionError extends Error {
  constructor(readonly version: number) {
    super(`Save schema version ${version} is newer than this version of Conquestoria.`);
    this.name = 'UnsupportedSaveSchemaVersionError';
  }
}

function stableLegacyGameId(state: GameState): string {
  const tileFingerprint = Object.entries(state.map?.tiles ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tileId, tile]) => [tileId, tile.coord.q, tile.coord.r, tile.terrain, tile.resource ?? ''].join(':'))
    .join('|');
  const source = `${state.currentPlayer}|${state.turn}|${tileFingerprint}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(36)}`;
}

export function remapPersistedTechId(techId: string): string {
  return techId === 'quantum-computing' ? 'cloud-computing' : techId;
}

function remapTechIds(techIds: readonly string[], excluded: ReadonlySet<string> = new Set()): string[] {
  const remapped: string[] = [];
  const seen = new Set(excluded);
  for (const techId of techIds) {
    const mapped = remapPersistedTechId(techId);
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    remapped.push(mapped);
  }
  return remapped;
}

function remapPersistedTechReferences(state: GameState): GameState {
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civilization]) => {
    if (!civilization.techState) return [civId, civilization];
    const completed = remapTechIds(Array.isArray(civilization.techState.completed) ? civilization.techState.completed : []);
    const currentResearch = typeof civilization.techState.currentResearch === 'string'
      ? remapPersistedTechId(civilization.techState.currentResearch)
      : null;
    const currentIsCompleted = currentResearch !== null && completed.includes(currentResearch);
    const excluded = new Set([...completed, ...(currentIsCompleted || !currentResearch ? [] : [currentResearch])]);
    return [civId, {
      ...civilization,
      techState: {
        ...civilization.techState,
        completed,
        currentResearch: currentIsCompleted ? null : currentResearch,
        researchQueue: remapTechIds(Array.isArray(civilization.techState.researchQueue) ? civilization.techState.researchQueue : [], excluded),
        researchProgress: currentIsCompleted ? 0 : (civilization.techState.researchProgress ?? 0),
      },
    }];
  }));

  const opponentAI = state.opponentAI
    ? {
      ...state.opponentAI,
      majorCivs: Object.fromEntries(Object.entries(state.opponentAI.majorCivs).map(([civId, portfolio]) => [civId, {
        ...portfolio,
        researchTargetTechId: portfolio.researchTargetTechId
          ? remapPersistedTechId(portfolio.researchTargetTechId)
          : null,
      }])),
    }
    : undefined;

  const espionage = state.espionage
    ? Object.fromEntries(Object.entries(state.espionage).map(([civId, civState]) => [civId, {
      ...civState,
      spies: Object.fromEntries(Object.entries(civState.spies).map(([spyId, spy]) => [spyId, {
        ...spy,
        ...(spy.stolenTechFrom ? {
          stolenTechFrom: Object.fromEntries(Object.entries(spy.stolenTechFrom).map(([targetCivId, techIds]) => [
            targetCivId,
            remapTechIds(techIds),
          ])),
        } : {}),
      }])),
    }]))
    : undefined;

  return { ...state, civilizations, ...(opponentAI ? { opponentAI } : {}), ...(espionage ? { espionage } : {}) };
}

function migrateToEra13Foundation(state: GameState): GameState {
  const withStableIdentity = state.gameId ? state : { ...state, gameId: stableLegacyGameId(state) };
  return remapPersistedTechReferences(withStableIdentity);
}

function migrateLateResources(state: GameState): GameState {
  const gameId = state.gameId ?? stableLegacyGameId(state);
  const tiles = Object.fromEntries(Object.entries(state.map?.tiles ?? {}).map(([key, tile]) => [key, { ...tile }]));
  placeLateResources(
    tiles,
    createRng(`${gameId}-late-resources`),
    Object.values(state.cities ?? {}).map(city => city.position),
  );

  const defaults = createMarketplaceState();
  const marketplace = state.marketplace
    ? {
      ...state.marketplace,
      prices: { ...defaults.prices, ...state.marketplace.prices },
      priceHistory: { ...defaults.priceHistory, ...state.marketplace.priceHistory },
      purchasedResources: state.marketplace.purchasedResources ?? [],
    }
    : defaults;

  const cities = Object.fromEntries(Object.entries(state.cities ?? {}).map(([cityId, city]) => {
    const grandfathered = city.productionQueue.filter(item => {
      const building = BUILDINGS[item];
      const unit = TRAINABLE_UNITS.find(candidate => candidate.type === item);
      return (building?.resourceRequired?.length ?? unit?.resourceRequired?.length ?? 0) > 0;
    });
    return [cityId, grandfathered.length > 0
      ? { ...city, legacyResourceGrace: [...new Set([...(city.legacyResourceGrace ?? []), ...grandfathered])] }
      : city];
  }));

  return { ...state, gameId, map: { ...state.map, tiles }, marketplace, cities };
}

function migrateAutonomyNetwork(state: GameState): GameState {
  const autonomyByCiv = Object.fromEntries(Object.keys(state.civilizations ?? {}).map(civId => [
    civId,
    state.autonomyByCiv?.[civId] ?? createEmptyAutonomyCivState(),
  ]));
  let working: GameState = {
    ...state,
    autonomyByCiv,
    networkCivicPressureByCity: state.networkCivicPressureByCity ?? {},
    idCounters: { ...state.idCounters, nextNetworkPlanId: state.idCounters?.nextNetworkPlanId ?? 1 },
  };
  for (const civId of Object.keys(working.civilizations).sort()) {
    if (!isAutonomyActivated(working, civId)) continue;
    const sourceIds = Object.values(working.units)
      .filter(unit => unit.owner === civId && unit.type === 'cyber_unit')
      .map(unit => unit.id)
      .sort();
    for (const sourceUnitId of sourceIds) {
      const source = working.units[sourceUnitId];
      const owner = working.civilizations[civId];
      const target = Object.values(working.cities)
        .filter(city => city.owner !== civId
          && working.civilizations[city.owner]
          && owner.diplomacy.atWarWith.includes(city.owner)
          && hexDistance(source.position, city.position) <= 1)
        .sort((left, right) => left.id.localeCompare(right.id))[0];
      if (!target) continue;
      const assigned = assignNetworkPlan(working, {
        ownerCivId: civId,
        sourceUnitId,
        definitionId: 'exploit',
        target: { kind: 'city', cityId: target.id },
      });
      working = assigned.state;
    }
  }
  return working;
}

function legacyAirBaseCandidates(state: GameState, unit: Unit): AirBaseRef[] {
  const operation = UNIT_DEFINITIONS[unit.type]?.airOperation;
  if (!operation) return [];
  const cityBases = Object.values(state.cities)
    .filter(city => city.owner === unit.owner)
    .filter(city => operation.baseKinds.some(kind => city.buildings.includes(kind)))
    .map(city => ({ kind: 'city' as const, cityId: city.id }));
  const carrierBases = Object.values(state.units)
    .filter(candidate => candidate.owner === unit.owner && candidate.type === 'carrier')
    .filter(() => operation.baseKinds.includes('carrier'))
    .map(candidate => ({ kind: 'carrier' as const, unitId: candidate.id }));
  return [...cityBases, ...carrierBases];
}

function legacyAirBasePosition(state: GameState, base: AirBaseRef) {
  return base.kind === 'city' ? state.cities[base.cityId]?.position : state.units[base.unitId]?.position;
}

function legacyAirBaseCapacity(state: GameState, base: AirBaseRef): number {
  if (base.kind === 'carrier') return state.units[base.unitId]?.type === 'carrier' ? 2 : 0;
  const city = state.cities[base.cityId];
  if (!city) return 0;
  if (city.buildings.includes('airfield')) {
    return Object.entries(state.builtNationalProjects ?? {}).some(([key, project]) => project.civId === city.owner && key === `${city.owner}:air_force_command`) ? 4 : 3;
  }
  if (city.buildings.includes('helicopter_base') || city.buildings.includes('stealth_airbase')) return 2;
  return 0;
}

function isSameLegacyAirBase(left: AirBaseRef | undefined, right: AirBaseRef): boolean {
  if (!left) return false;
  if (left.kind === 'city') return right.kind === 'city' && left.cityId === right.cityId;
  return right.kind === 'carrier' && left.unitId === right.unitId;
}

function migrateLegacyBasedAircraft(state: GameState): GameState {
  const units = { ...state.units };
  const removedIds = new Set<string>();
  const aircraft = Object.values(units)
    .filter(unit => UNIT_DEFINITIONS[unit.type]?.airOperation && !unit.airBase)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const unit of aircraft) {
    const candidates = legacyAirBaseCandidates({ ...state, units }, unit)
      .map(base => ({ base, position: legacyAirBasePosition({ ...state, units }, base) }))
      .filter((entry): entry is { base: AirBaseRef; position: NonNullable<typeof entry.position> } => entry.position !== undefined)
      .filter(({ base }) => Object.values(units).filter(candidate => isSameLegacyAirBase(candidate.airBase, base)).length < legacyAirBaseCapacity({ ...state, units }, base))
      .sort((left, right) => {
        const distance = (entry: typeof left) => state.map.wrapsHorizontally
          ? wrappedHexDistance(unit.position, entry.position, state.map.width)
          : hexDistance(unit.position, entry.position);
        const baseId = (base: AirBaseRef) => base.kind === 'city' ? `city:${base.cityId}` : `carrier:${base.unitId}`;
        return distance(left) - distance(right) || baseId(left.base).localeCompare(baseId(right.base));
      });
    const destination = candidates[0];
    if (!destination) {
      delete units[unit.id];
      removedIds.add(unit.id);
      continue;
    }
    units[unit.id] = { ...unit, airBase: destination.base, position: { ...destination.position } };
  }
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => [
    civId,
    removedIds.size > 0 ? { ...civ, units: civ.units.filter(id => !removedIds.has(id)) } : civ,
  ]));
  return { ...state, units, civilizations, reconReveals: state.reconReveals ?? [] };
}

// #590 MR3: defensive re-derivation of stored crisis archetype from its flavorId. Not a
// versioned migration (this MR doesn't bump CURRENT_SAVE_SCHEMA_VERSION — the change is
// additive), so it must run unconditionally on every load, not just saves passing
// through the numbered migration loop above. A save written before crop-blight/
// locust-swarm's re-home to 'famine' would have `archetype: 'outbreak'` baked in for
// those flavor ids; recompute from the current flavor roster so stale saves don't
// silently misfire the outbreak-only code paths (remedy wording, AI response filter).
function normalizeCrisisArchetypes(state: GameState): GameState {
  if (!state.activeCrises) return state;
  const activeCrises: Record<string, ActiveCrisis> = {};
  for (const [id, crisis] of Object.entries(state.activeCrises)) {
    const flavor = getCrisisFlavor(crisis.flavorId);
    activeCrises[id] = flavor ? { ...crisis, archetype: flavor.archetype } : crisis;
  }
  return { ...state, activeCrises };
}

// #591 MR4: religions/cityFaith are non-optional on GameState but predate this MR, so
// any save from before it is missing both fields entirely. Defaulted unconditionally
// (not a versioned migration -- additive, no schema bump) alongside the crisis
// normalization above.
function withReligionDefaults(state: GameState): GameState {
  return {
    ...state,
    religions: state.religions ?? {},
    cityFaith: state.cityFaith ?? {},
  };
}

// #888: the #888 fallback-generated-officer registry. Legacy saves have no
// `generatedGenerals` at all (-> {}); a save written by #888 keeps its records
// verbatim (the persisted record is the authoritative identity). This pass only
// drops structurally-malformed entries so a corrupt file can't crash resolution
// or resurrect a garbage identity -- a *used* generated general stays excluded
// from re-draw by its id in `generalHistory` even if its record is dropped here.
// Unconditional + idempotent, same additive-safety rationale as
// withReligionDefaults above; also wired as numbered migration 23 for saves
// that predate the field.
function isPositiveInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidGeneratedGeneral(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const g = value as Record<string, unknown>;
  return typeof g.id === 'string' && g.id.length > 0
    && typeof g.name === 'string' && g.name.length > 0
    && typeof g.era === 'number' && Number.isInteger(g.era) && g.era >= 1 && g.era <= 12
    && Array.isArray(g.civTypeEligibility) && g.civTypeEligibility.every(c => typeof c === 'string')
    && typeof g.descriptor === 'string' && g.descriptor.length > 0
    && typeof g.portraitIcon === 'string' && g.portraitIcon.length > 0
    // command stats must be usable — a NaN/negative range would silently break
    // getEffectiveCommandStats / mapHexesInRange downstream, so drop the record
    // (resolver -> undefined -> safe degrade) rather than pass garbage through.
    && isPositiveInt(g.commandRange)
    && isPositiveInt(g.commandCapacity)
    && isPositiveInt(g.maxCommandCharges)
    && isPositiveInt(g.cooldownTurns)
    && Array.isArray(g.abilityIds) && g.abilityIds.length > 0 && g.abilityIds.every(a => typeof a === 'string');
}

export function normalizeGeneratedGenerals(state: GameState): GameState {
  const raw = state.generatedGenerals;
  if (raw === undefined) return { ...state, generatedGenerals: {} };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...state, generatedGenerals: {} };
  }
  let changed = false;
  const next: Record<string, GeneratedGeneralIdentity> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isValidGeneratedGeneral(value) && (value as { id: string }).id === key) {
      const entry = value as unknown as GeneratedGeneralIdentity;
      next[key] = entry.origin === 'generated' ? entry : { ...entry, origin: 'generated' };
      if (next[key] !== value) changed = true;
    } else {
      changed = true;
    }
  }
  return changed ? { ...state, generatedGenerals: next } : state;
}

// #592 MR5: CityFaith.conversionProgress changed shape from a single
// { toReligionId, points } slot (MR4) to a per-religion { [religionId]: points } map, so
// getCityConversionPoints/applyCityConversionPoints (which index by religionId) would
// silently read 0 for any city with genuine in-flight conversion progress saved under the
// old shape -- not a crash, but a real loss of live game state on load. Detect the old
// shape (a `toReligionId` string field, which no real religionId key would ever collide
// with -- religion ids are always `religion-${civId}`) and convert it to the new map
// in-place. Unconditional (not a versioned migration) for the same additive-safety reason
// as withReligionDefaults above -- pre-MR4 saves have no cityFaith at all and are
// unaffected; only saves written between MR4 and this MR need the conversion.
function normalizeCityFaithConversionProgress(state: GameState): GameState {
  if (!state.cityFaith) return state;
  let changed = false;
  const cityFaith: typeof state.cityFaith = { ...state.cityFaith };
  for (const [cityId, faith] of Object.entries(cityFaith)) {
    const progress = faith?.conversionProgress as Record<string, unknown> | undefined;
    if (
      progress
      && typeof progress === 'object'
      && typeof progress.toReligionId === 'string'
      && typeof progress.points === 'number'
    ) {
      const toReligionId = progress.toReligionId;
      const points = progress.points;
      cityFaith[cityId] = { ...faith, conversionProgress: { [toReligionId]: points } };
      changed = true;
    }
  }
  return changed ? { ...state, cityFaith } : state;
}

function migrateDualEraWorldAge(state: GameState): GameState {
  const withAircraft = migrateLegacyBasedAircraft(state);
  return { ...withAircraft, era: resolveWorldAge(withAircraft.civilizations) };
}

function migrateBarbarianCampPressure(state: GameState): GameState {
  return normalizeBarbarianCampPressure({ ...state, barbarianCampPressure: state.barbarianCampPressure ?? {} });
}

function migrateAutonomyNetworkPostures(state: GameState): GameState {
  const autonomyByCiv = Object.fromEntries(Object.keys(state.civilizations ?? {}).map(civId => {
    const autonomy = state.autonomyByCiv?.[civId] ?? createEmptyAutonomyCivState();
    return [civId,
    {
      ...autonomy,
      plans: Object.fromEntries(Object.entries(autonomy.plans ?? {}).map(([planId, plan]) => [planId, {
        ...plan,
        source: plan.source ?? (plan.sourceUnitId ? { kind: 'unit' as const, unitId: plan.sourceUnitId } : undefined),
        linkedUnitIds: plan.linkedUnitIds ?? [],
        linkedCityIds: plan.linkedCityIds ?? [],
        surgeResolutionTurn: plan.surgeResolutionTurn ?? null,
      }])),
      posture: autonomy.posture ?? 'integrated',
      pendingPosture: autonomy.pendingPosture ?? null,
      surgeRecoveryUntilTurn: autonomy.surgeRecoveryUntilTurn ?? null,
      surgeCooldownUntilTurn: autonomy.surgeCooldownUntilTurn ?? null,
      postureChangedTurn: autonomy.postureChangedTurn ?? null,
    }];
  }));
  return { ...state, autonomyByCiv };
}

/** Schema 7: persist only valid, actually-built Circular Manufacturing choices. */
function migrateCircularManufacturingChoices(state: GameState): GameState {
  const nationalProjectChoices: NonNullable<GameState['nationalProjectChoices']> = {};
  for (const [key, value] of Object.entries(state.nationalProjectChoices ?? {})) {
    if (!state.builtNationalProjects?.[key]) continue;
    if (!CIRCULAR_MANUFACTURING_MATERIALS.includes(value as typeof CIRCULAR_MANUFACTURING_MATERIALS[number])) continue;
    nationalProjectChoices[key] = value as typeof CIRCULAR_MANUFACTURING_MATERIALS[number];
  }
  return { ...state, nationalProjectChoices };
}

function migrateCombatNotificationDetails(state: GameState): GameState {
  return state;
}

function migrateRetimedCavalry(state: GameState): GameState {
  const cities = Object.fromEntries(Object.entries(state.cities ?? {}).map(([cityId, city]) => {
    const existingGrace = Array.isArray(city.legacyTechGrace)
      ? city.legacyTechGrace.filter(item => item === 'cavalry')
      : [];
    const queuedCavalry = city.productionQueue.filter(item => item === 'cavalry');
    const legacyTechGrace = [...existingGrace, ...queuedCavalry];
    if (legacyTechGrace.length === 0) return [cityId, city];
    return [cityId, {
      ...city,
      legacyTechGrace,
    }];
  }));
  return { ...state, cities };
}

function migrateRetimedKnight(state: GameState): GameState {
  const cities = Object.fromEntries(Object.entries(state.cities ?? {}).map(([cityId, city]) => {
    const existingGrace = Array.isArray(city.legacyTechGrace)
      ? city.legacyTechGrace.filter(item => item === 'cavalry' || item === 'knight')
      : [];
    const queuedKnights = city.productionQueue.filter(item => item === 'knight');
    const legacyTechGrace = [...existingGrace, ...queuedKnights];
    if (legacyTechGrace.length === 0) return [cityId, city];
    return [cityId, { ...city, legacyTechGrace }];
  }));
  return { ...state, cities };
}

function normalizeLegacyTechGrace(state: GameState): GameState {
  const cities = Object.fromEntries(Object.entries(state.cities ?? {}).map(([cityId, city]) => {
    if (city.legacyTechGrace === undefined) return [cityId, city];
    const legacyTechGrace = Array.isArray(city.legacyTechGrace)
      ? city.legacyTechGrace.filter(item => item === 'cavalry' || item === 'knight')
      : [];
    if (legacyTechGrace.length > 0) return [cityId, { ...city, legacyTechGrace }];
    const { legacyTechGrace: _invalidGrace, ...withoutLegacyTechGrace } = city;
    return [cityId, withoutLegacyTechGrace];
  }));
  return { ...state, cities };
}

/**
 * BFS outward from `start` over ocean/coast tiles only, returning the nearest coast tile not in
 * `occupied`. Deterministic (neighbors visited in sorted hexKey order) so migration output
 * doesn't depend on map object iteration order. Returns null if the connected water body has no
 * free coast tile at all (only possible on a pathological all-ocean or fully-occupied map).
 */
function nearestCoastTile(map: GameState['map'], start: HexCoord, occupied: ReadonlySet<string>): HexCoord | null {
  const visited = new Set<string>([hexKey(start)]);
  let frontier: HexCoord[] = [start];
  while (frontier.length > 0) {
    const next: HexCoord[] = [];
    for (const coord of frontier) {
      const neighbors = map.wrapsHorizontally
        ? getWrappedHexNeighbors(coord, map.width)
        : hexNeighbors(coord);
      const sorted = [...neighbors].sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
      for (const neighbor of sorted) {
        const key = hexKey(neighbor);
        if (visited.has(key)) continue;
        visited.add(key);
        const tile = map.tiles[key];
        if (!tile || (tile.terrain !== 'ocean' && tile.terrain !== 'coast')) continue;
        if (tile.terrain === 'coast' && !occupied.has(key)) return neighbor;
        if (tile.terrain === 'ocean' || tile.terrain === 'coast') next.push(neighbor);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * #751: coastal-only hulls (Galley, Transport, and their pirate equivalents) used to be able to
 * enter ocean tiles due to the bug this MR fixes. Any existing save may have one of those units
 * sitting on `ocean` right now, which is no longer a legal position for its hull. Relocate to
 * the nearest coast tile (deterministic BFS); if no coast is reachable at all (pathological
 * landlocked-ocean map), remove the unit rather than leave it permanently stranded and
 * unselectable — mirrors the deletion fallback in migrateLegacyBasedAircraft above.
 *
 * Per game-systems.md's spawn-occupancy rule (never stack units placed onto the map, even
 * though this relocates rather than spawns, the same hazard applies): each stranded unit's
 * destination is added to `occupied` immediately after being claimed, so two different stranded
 * units — potentially different owners — can never be relocated onto the same tile, and a
 * destination already held by a unit that isn't itself being relocated away is never chosen.
 */
function migrateCoastalHullsOffOcean(state: GameState): GameState {
  const units = { ...state.units };
  const removedIds = new Set<string>();
  const relocatedIds: string[] = [];

  const strandedIds = Object.values(state.units)
    .filter(unit => {
      const def = UNIT_DEFINITIONS[unit.type];
      if (!def || def.domain !== 'naval' || def.waterAccess === 'ocean') return false;
      const tile = state.map.tiles[hexKey(unit.position)];
      return tile?.terrain === 'ocean';
    })
    .map(unit => unit.id)
    .sort();
  const strandedIdSet = new Set(strandedIds);

  const occupied = new Set(
    Object.values(state.units)
      .filter(unit => !strandedIdSet.has(unit.id))
      .map(unit => hexKey(unit.position)),
  );

  for (const unitId of strandedIds) {
    const unit = units[unitId];
    if (!unit) continue;
    const destination = nearestCoastTile(state.map, unit.position, occupied);
    if (!destination) {
      delete units[unitId];
      removedIds.add(unitId);
      continue;
    }
    occupied.add(hexKey(destination));
    units[unitId] = { ...unit, position: { ...destination } };
    relocatedIds.push(unitId);
  }

  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => [
    civId,
    removedIds.size > 0 ? { ...civ, units: civ.units.filter(id => !removedIds.has(id)) } : civ,
  ]));

  let working: GameState = { ...state, units, civilizations };
  for (const unitId of relocatedIds) {
    working = syncTransportCargoPositions(working, unitId);
    const unit = working.units[unitId]!;
    const name = UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
    appendNotification(working, unit.owner, {
      message: `Your ${name} couldn't survive the open ocean and put in near shore.`,
      type: 'warning',
      turn: working.turn,
    });
  }
  return working;
}

// #678: Biplane moved from Air Superiority to Aviation. Existing queued Biplanes were
// legal under the old roster, so retain the player's queue position by replacing only
// entries that the new obsolescence rule makes illegal. This is deliberately
// unconditional and idempotent: current-schema saves also need the repair.
function normalizeRetimedBiplaneQueues(state: GameState): GameState {
  let changed = false;
  const cities = Object.fromEntries(Object.entries(state.cities).map(([cityId, city]) => {
    const completed = state.civilizations[city.owner]?.techState.completed ?? [];
    if (!completed.includes('air-superiority') || !city.productionQueue.includes('biplane')) return [cityId, city];
    changed = true;
    const replacement = completed.includes('jet-aviation') ? 'jet_fighter' : 'wwii_fighter';
    return [cityId, { ...city, productionQueue: city.productionQueue.map(item => item === 'biplane' ? replacement : item) }];
  }));
  return changed ? { ...state, cities } : state;
}

// #787 phase 1: the 18 versioned fixups that used to live in main.ts's
// migrateLegacySave() -- 124 lines of in-place mutation on module-scope
// gameState, never exported, never tested, and reachable only by entering a
// campaign. Two of its behaviours are load-bearing and preserved here:
//
//  - EVERY fixup defaults rather than overwrites. migrateLegacySave ran on every
//    campaign entry, so nearly every real v11 save already carries these fields;
//    a clobbering migration would wipe live player data. Enforced by the
//    idempotency case in tests/storage/save-migrations-v12.test.ts.
//  - Ordering: discoveredSites is rebuilt from wonderDiscoverers, and the trade
//    route reshape reads marketplace, so those defaults are applied first.
//
// The four *derived* fixups (refreshKnownCivilizations, reconstructLastSeenFromMap,
// clearStaleSoloPendingEvents) are not here -- they recompute state from the map
// and civ roster on every load, so they belong in normalizeLoadedState. The
// councilTalkLevel fixup is not here either: it reads IndexedDB user settings,
// not save data, so it cannot be a deterministic (state) => GameState. It lives
// in src/storage/settings-merge.ts.

const ALL_TECH_TRACKS = [
  'military', 'economy', 'science', 'civics', 'exploration',
  'agriculture', 'medicine', 'philosophy', 'arts', 'maritime',
  'metallurgy', 'construction', 'communication', 'espionage', 'spirituality',
] as const;

const ALL_ADVISORS = [
  'builder', 'explorer', 'chancellor', 'warchief',
  'treasurer', 'scholar', 'spymaster', 'artisan',
] as const;

/** A trade route as written by builds predating the id/goldPerTrip reshape. */
interface LegacyTradeRoute {
  id?: string;
  goldPerTrip?: number;
  turnsPerTrip?: number;
  goldPerTurn?: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `key in value`, deliberately returning a plain boolean rather than a type
 * predicate.
 *
 * Tile.wonder and Unit.isResting are declared REQUIRED in core/types.ts, so a
 * direct `'wonder' in tile` narrows the false branch to `never` and the
 * subsequent spread stops compiling. That narrowing is wrong here by
 * construction: the entire premise of a migration is that an old save really is
 * missing a field the current type says is mandatory. Routing the check through
 * an untyped record view keeps the runtime semantics of `in` (which is what
 * main.ts's migrateLegacySave used) without letting the compiler assume the
 * absent case is impossible.
 */
function hasField(value: object, key: string): boolean {
  return key in (value as Record<string, unknown>);
}

function migrateLegacyMainFixups(state: GameState): GameState {
  const next: GameState = { ...state };

  // Every field below is guarded. migrateLegacySave only ever ran on fully
  // loaded campaign saves, but a migration runs on anything -- including the
  // deliberately malformed fixture in save-migrations.test.ts ("leaves a
  // malformed legacy civilization for later state normalization"), which has a
  // civ with no techState and no settings/map/units at all. Migrations must
  // tolerate that shape and leave it for normalizeLoadedState.

  // --- Civilizations: civType, lastCombatTurnByLandmass, diplomacy, tracks ---
  const civIds = Object.keys(next.civilizations ?? {});
  next.civilizations = Object.fromEntries(
    Object.entries(next.civilizations ?? {}).map(([civId, civ]) => {
      if (!isObject(civ)) return [civId, civ];
      const migrated = { ...civ };
      migrated.civType ??= 'generic';
      migrated.knownCivilizations ??= [];
      migrated.lastCombatTurnByLandmass ??= {};
      // createDiplomacyState rather than the object literal main.ts used: that
      // literal omitted treacheryScore/vassalage and only compiled behind an
      // `as any`. The canonical constructor yields a complete DiplomacyState.
      migrated.diplomacy ??= createDiplomacyState(civIds, civId, 0);
      if (isObject(migrated.techState)) {
        const trackPriorities = { ...(migrated.techState.trackPriorities ?? {}) } as Record<string, string>;
        for (const track of ALL_TECH_TRACKS) {
          trackPriorities[track] ??= 'medium';
        }
        migrated.techState = {
          ...migrated.techState,
          trackPriorities: trackPriorities as typeof migrated.techState.trackPriorities,
        };
      }
      return [civId, migrated];
    }),
  );

  // --- Settings: advisor roster (M3b added treasurer/scholar, M4a spymaster) ---
  if (isObject(next.settings)) {
    const advisorsEnabled = { ...(next.settings.advisorsEnabled ?? {}) } as Record<string, boolean>;
    for (const advisor of ALL_ADVISORS) {
      advisorsEnabled[advisor] ??= true;
    }
    next.settings = {
      ...next.settings,
      advisorsEnabled: advisorsEnabled as NonNullable<GameState['settings']['advisorsEnabled']>,
    };
  }

  // --- Optional containers ---
  next.pendingEvents ??= {};
  next.tribalVillages ??= {};
  next.discoveredWonders ??= {};
  next.wonderDiscoverers ??= {};
  next.legendaryWonderIntel ??= {};
  next.minorCivs ??= {};
  next.resurgentCampCooldownByCivLandmass ??= {};

  // --- Legendary wonder history (reads wonderDiscoverers, so it runs after) ---
  const history = { ...(next.legendaryWonderHistory ?? { destroyedStrongholds: [], discoveredSites: [] }) };
  history.networkPlanResolutions ??= [];
  if (!history.discoveredSites) {
    const discoveredSites: NonNullable<GameState['legendaryWonderHistory']>['discoveredSites'] = [];
    for (const [wonderId, discoverers] of Object.entries(next.wonderDiscoverers ?? {})) {
      const wonderTile = Object.values(next.map?.tiles ?? {}).find(tile => tile.wonder === wonderId);
      for (const civId of discoverers) {
        if (discoveredSites.some(record => record.civId === civId && record.siteId === wonderId)) continue;
        discoveredSites.push({
          civId,
          siteId: wonderId,
          siteType: 'natural-wonder',
          position: wonderTile?.coord ?? { q: 0, r: 0 },
          turn: next.turn,
        });
      }
    }
    history.discoveredSites = discoveredSites;
  }
  next.legendaryWonderHistory = history;

  // --- Tile.wonder and Unit.isResting backfills ---
  const tiles = next.map?.tiles;
  if (tiles) {
    next.map = {
      ...next.map,
      tiles: Object.fromEntries(
        Object.entries(tiles).map(([key, tile]) => (
          hasField(tile, 'wonder') ? [key, tile] : [key, { ...tile, wonder: null }]
        )),
      ),
    };
  }
  const units = next.units;
  if (units) {
    next.units = Object.fromEntries(
      Object.entries(units).map(([unitId, unit]) => (
        hasField(unit, 'isResting') ? [unitId, unit] : [unitId, { ...unit, isResting: false }]
      )),
    );
  }

  // --- Marketplace, then the TradeRoute reshape that reads it ---
  const marketplace = isObject(next.marketplace) ? next.marketplace : createMarketplaceState();
  let legacyRouteN = 1;
  next.marketplace = {
    ...marketplace,
    tradeRoutes: (Array.isArray(marketplace.tradeRoutes) ? marketplace.tradeRoutes : []).map(route => {
      if (!isObject(route)) return route;
      const legacy = route as TradeRoute & LegacyTradeRoute;
      if (legacy.id && legacy.goldPerTrip && legacy.turnsPerTrip) {
        legacyRouteN += 1;
        return legacy;
      }
      const turnsPerTrip = legacy.turnsPerTrip ?? 3;
      const { goldPerTurn, ...rest } = legacy;
      return {
        ...rest,
        id: legacy.id ?? `route-legacy-${legacyRouteN++}`,
        turnsPerTrip,
        goldPerTrip: legacy.goldPerTrip ?? (goldPerTurn ?? 2) * turnsPerTrip,
      };
    }),
  };

  // --- Beasts: flag legacy saves so processTurn places lairs on the FIRST tick
  // after load, deferring the paw markers until the player has taken an action.
  next.beasts ??= { mode: 'wild', lairs: {}, sightingsByCiv: {}, migrationPending: true };

  return next;
}

const MILITARY_ROLES = new Set(Object.values(UNIT_ROLE_DEFINITIONS).map(definition => definition.primaryRole));

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTurn(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isMilitaryQuestFact(value: unknown): value is LegendaryWonderMilitaryFact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fact = value as Record<string, unknown>;
  if (!isNonEmptyString(fact.id) || !isNonEmptyString(fact.civId) || !isTurn(fact.turn)) return false;
  switch (fact.kind) {
    case 'surviving-combat-win':
      return isNonEmptyString(fact.unitId) && typeof fact.role === 'string' && MILITARY_ROLES.has(fact.role as never);
    case 'fort-completed':
      return isNonEmptyString(fact.cityId)
        && Boolean(fact.position && typeof fact.position === 'object'
          && Number.isInteger((fact.position as Record<string, unknown>).q)
          && Number.isInteger((fact.position as Record<string, unknown>).r));
    case 'fortification-repel':
      return isNonEmptyString(fact.unitId) && (fact.tier === 'fort' || fact.tier === 'citadel');
    case 'successful-interception':
      return isNonEmptyString(fact.interceptorId);
    default:
      return false;
  }
}

export function normalizeLegendaryWonderMilitaryFacts(state: GameState): GameState {
  const history = state.legendaryWonderHistory;
  const rawFacts: unknown[] = Array.isArray(history?.militaryFacts) ? history.militaryFacts : [];
  const seen = new Set<string>();
  const militaryFacts = rawFacts.filter(isMilitaryQuestFact).filter(fact => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  });
  const unchanged = Array.isArray(history?.militaryFacts)
    && history!.militaryFacts!.length === militaryFacts.length
    && history!.militaryFacts!.every((fact, index) => fact === militaryFacts[index]);
  if (unchanged) return state;
  return {
    ...state,
    legendaryWonderHistory: {
      destroyedStrongholds: history?.destroyedStrongholds ?? [],
      discoveredSites: history?.discoveredSites ?? [],
      ...(history?.networkPlanResolutions ? { networkPlanResolutions: history.networkPlanResolutions } : {}),
      militaryFacts,
    },
  };
}

function normalizeTacticalGrantedRoles(value: unknown): CombatRole[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<CombatRole>();
  return value.filter((role): role is CombatRole =>
    typeof role === 'string' && MILITARY_ROLES.has(role as never) && !seen.has(role as CombatRole) && Boolean(seen.add(role as CombatRole)),
  );
}

export function normalizeLegendaryWonderTacticalEffects(state: GameState): GameState {
  const raw = state.legendaryWonderTacticalEffects as unknown;
  const candidate = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const validCivIds = new Set(Object.keys(state.civilizations));
  const rawGrants = candidate.trainingGrantsByCiv && typeof candidate.trainingGrantsByCiv === 'object' && !Array.isArray(candidate.trainingGrantsByCiv)
    ? candidate.trainingGrantsByCiv as Record<string, unknown>
    : {};
  const trainingGrantsByCiv: LegendaryWonderTacticalEffectState['trainingGrantsByCiv'] = {};
  for (const [civId, value] of Object.entries(rawGrants)) {
    if (!validCivIds.has(civId) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (!Number.isInteger(record.era) || Number(record.era) < 1) continue;
    const grantedRoles = normalizeTacticalGrantedRoles(record.grantedRoles);
    if (grantedRoles.length === 0) continue;
    trainingGrantsByCiv[civId] = { era: Number(record.era), grantedRoles };
  }
  const rawClaims = candidate.interceptionClaimTurnByCiv && typeof candidate.interceptionClaimTurnByCiv === 'object' && !Array.isArray(candidate.interceptionClaimTurnByCiv)
    ? candidate.interceptionClaimTurnByCiv as Record<string, unknown>
    : {};
  const interceptionClaimTurnByCiv: Record<string, number> = {};
  for (const [civId, turn] of Object.entries(rawClaims)) {
    if (validCivIds.has(civId) && isTurn(turn)) interceptionClaimTurnByCiv[civId] = turn;
  }
  const legendaryWonderTacticalEffects = { trainingGrantsByCiv, interceptionClaimTurnByCiv };
  const previous = state.legendaryWonderTacticalEffects;
  if (JSON.stringify(previous) === JSON.stringify(legendaryWonderTacticalEffects)) return state;
  return { ...state, legendaryWonderTacticalEffects };
}

export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: migrateToEra13Foundation,
  2: migrateLateResources,
  3: migrateAutonomyNetwork,
  4: migrateLegacyBasedAircraft,
  5: migrateDualEraWorldAge,
  6: migrateAutonomyNetworkPostures,
  7: migrateCircularManufacturingChoices,
  8: migrateCombatNotificationDetails,
  9: migrateCoastalHullsOffOcean,
  10: migrateRetimedCavalry,
  11: migrateRetimedKnight,
  12: migrateLegacyMainFixups,
  13: normalizeCoastalBatteryCounterfireTurns,
  14: migrateBarbarianCampPressure,
  15: state => normalizeCrisisForces({ ...state, crisisForces: state.crisisForces ?? {} }),
  16: state => normalizeCrisisForces(state),
  17: state => normalizeStampedes(normalizeCrisisForces({ ...state, stampedes: state.stampedes ?? {} })),
  18: state => normalizeRogueElephantHosts(normalizeStampedes(normalizeCrisisForces({ ...state, rogueElephantHosts: state.rogueElephantHosts ?? {} }))),
  19: state => normalizeRogueElephantHosts(normalizeCrisisForces(state)),
  // #545 MR4: strategicStrikesReceivedFrom is a new required DiplomacyState
  // field -- default every civ's diplomacy state to [] rather than leaving it
  // undefined on old saves.
  20: state => ({
    ...state,
    civilizations: Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => [
      civId,
      {
        ...civ,
        diplomacy: {
          ...civ.diplomacy,
          strategicStrikesReceivedFrom: civ.diplomacy.strategicStrikesReceivedFrom ?? [],
        },
      },
    ])),
  }),
  21: normalizeLegendaryWonderMilitaryFacts,
  22: normalizeLegendaryWonderTacticalEffects,
  // #888: default the fallback-generated-officer registry to {} on saves that
  // predate it, and scrub any malformed entries (see normalizeGeneratedGenerals).
  23: normalizeGeneratedGenerals,
};

function readSchemaVersion(raw: Record<string, unknown>): number {
  const version = raw.saveSchemaVersion;
  if (version === undefined) return 0;
  if (!Number.isInteger(version) || Number(version) < 0) {
    throw new TypeError('Save schema version must be a non-negative integer.');
  }
  return Number(version);
}

/** Additive validation for serialized tile improvements; safe for every schema version. */
export function normalizeImprovementValues(state: GameState): GameState {
  const tiles = state.map?.tiles;
  if (!tiles) return state;
  let changed = false;
  const nextTiles = { ...tiles };
  for (const [key, tile] of Object.entries(tiles)) {
    const improvement = tile.improvement;
    const valid = typeof improvement === 'string' && improvement in IMPROVEMENT_BUILD_TURNS;
    const normalized = valid ? improvement as ImprovementType : 'none';
    const maxTurns = IMPROVEMENT_BUILD_TURNS[normalized];
    const turns = Number.isInteger(tile.improvementTurnsLeft) && tile.improvementTurnsLeft >= 0
      ? Math.min(tile.improvementTurnsLeft, maxTurns) : 0;
    if (normalized !== improvement || turns !== tile.improvementTurnsLeft) {
      nextTiles[key] = { ...tile, improvement: normalized, improvementTurnsLeft: turns };
      changed = true;
    }
  }
  return changed ? { ...state, map: { ...state.map, tiles: nextTiles } } : state;
}

/** Retains valid per-city Battery turn markers while removing malformed save data. */
export function normalizeCoastalBatteryCounterfireTurns(state: GameState): GameState {
  let changed = false;
  const cities = { ...state.cities };
  for (const [cityId, city] of Object.entries(state.cities)) {
    const marker = city.coastalBatteryCounterfireTurn;
    if (marker === undefined || (Number.isFinite(marker) && Number.isInteger(marker))) continue;
    const { coastalBatteryCounterfireTurn: _invalidMarker, ...normalizedCity } = city;
    cities[cityId] = normalizedCity;
    changed = true;
  }
  return changed ? { ...state, cities } : state;
}

export function migrateSaveToCurrent(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Save data must be an object.');
  }

  const sourceVersion = readSchemaVersion(raw as Record<string, unknown>);
  if (sourceVersion > CURRENT_SAVE_SCHEMA_VERSION) {
    throw new UnsupportedSaveSchemaVersionError(sourceVersion);
  }

  let state = structuredClone(raw) as GameState;
  for (let version = sourceVersion + 1; version <= CURRENT_SAVE_SCHEMA_VERSION; version += 1) {
    const migration = SAVE_MIGRATIONS[version];
    if (!migration) {
      throw new Error(`Missing save migration for schema version ${version}.`);
    }
    state = { ...migration(state), saveSchemaVersion: version };
  }
  const migrated = state.gameId ? state : migrateToEra13Foundation(state);
  const postures = migrateAutonomyNetworkPostures(migrated);
  const manufacturing = migrateCircularManufacturingChoices(postures);
  const techGrace = normalizeLegacyTechGrace(manufacturing);
  const crises = normalizeCrisisArchetypes(techGrace);
  const religions = withReligionDefaults(crises);
  const generatedGenerals = normalizeGeneratedGenerals(religions);
  return normalizeLegendaryWonderTacticalEffects(normalizeLegendaryWonderMilitaryFacts(normalizeBarbarianCampPressure(normalizeImprovementValues(normalizeCoastalBatteryCounterfireTurns(
    normalizeRetimedBiplaneQueues(normalizeCityFaithConversionProgress(generatedGenerals)),
  )))));
}
