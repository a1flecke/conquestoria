import type { AirDefenseCoverageProvider, AirDefenseCoverageResult, CombatModifierFact, GameState, Unit } from '@/core/types';
import { getVisibility } from './fog-of-war';
import { hexDistance, wrappedHexDistance } from './hex-utils';
import { BUILDINGS } from './city-system';
import { UNIT_DEFINITIONS } from './unit-system';

export interface ResolvedAirDefenseProvider extends AirDefenseCoverageProvider {}
interface UnfilteredCoverage { flatDefenseModifier: number; facts: CombatModifierFact[]; providers: ResolvedAirDefenseProvider[]; }
interface CoverageCache { revision: string; values: Map<string, UnfilteredCoverage>; }
const coverageCache = new WeakMap<GameState, CoverageCache>();

function coverageRevision(state: GameState): string {
  const cities = Object.values(state.cities).map(city => `${city.id}:${city.owner}:${city.position.q},${city.position.r}:${[...city.buildings].sort().join(',')}`).sort();
  const units = Object.values(state.units).map(unit => `${unit.id}:${unit.owner}:${unit.type}:${unit.position.q},${unit.position.r}:${unit.transportId ?? ''}`).sort();
  return `${state.map.width}:${state.map.wrapsHorizontally}:${cities.join('|')}:${units.join('|')}`;
}

function distance(state: GameState, left: Unit['position'], right: Unit['position']): number {
  return state.map.wrapsHorizontally ? wrappedHexDistance(left, right, state.map.width) : hexDistance(left, right);
}
function known(state: GameState, provider: ResolvedAirDefenseProvider, viewerId: string): boolean {
  return provider.ownerId === viewerId || getVisibility(state.civilizations[viewerId]?.visibility ?? { tiles: {} }, provider.position) === 'visible';
}
function providersForOwner(state: GameState, ownerId: string): ResolvedAirDefenseProvider[] {
  const cityProviders = Object.values(state.cities).flatMap(city => {
    if (city.owner !== ownerId) return [];
    // Render/presentation fixtures may deliberately use partial city records. A missing
    // completed-building list cannot supply a provider, and must not break rendering.
    const buildingIds = city.buildings ?? [];
    return buildingIds.flatMap(buildingId => {
    const building = BUILDINGS[buildingId]; const capability = building?.airDefenseProvider;
    const requirementsMet = capability?.requiresCompletedBuildingIds?.every(id => buildingIds.includes(id)) ?? true;
    return capability && requirementsMet ? [{ id: `city:${city.id}:${building.id}`, label: building.name, position: { ...city.position }, ownerId, ...capability }] : [];
    });
  });
  const unitProviders = Object.values(state.units).flatMap(unit => {
    const capability = UNIT_DEFINITIONS[unit.type].airDefenseProvider;
    return unit.owner === ownerId && !unit.transportId && capability ? [{ id: `unit:${unit.id}:${unit.type}`, label: UNIT_DEFINITIONS[unit.type].name, position: { ...unit.position }, ownerId, ...capability }] : [];
  });
  return [...cityProviders, ...unitProviders];
}
/**
 * Whether a civ currently has at least one built AA-providing building or unit anywhere
 * on the map. Deliberately stricter than a tech-unlock check: researching `air-superiority`
 * alone does not count until the civ actually places a battery or Mobile AA, so the overlay
 * toggle stays hidden through the (potentially long) gap between unlocking and building one.
 */
export function civHasAirDefenseCoverage(state: GameState, civId: string): boolean {
  return providersForOwner(state, civId).length > 0;
}
function providersFor(state: GameState, defender: Unit): ResolvedAirDefenseProvider[] {
  const defenderDomain = UNIT_DEFINITIONS[defender.type].domain ?? 'land';
  return providersForOwner(state, defender.owner).filter(provider =>
    distance(state, provider.position, defender.position) <= provider.radius
      && (provider.protectedDomains === undefined || provider.protectedDomains.includes(defenderDomain)));
}
export function getKnownAirDefenseProviders(state: GameState, viewerId: string): ResolvedAirDefenseProvider[] {
  return Object.keys(state.civilizations).flatMap(ownerId => providersForOwner(state, ownerId))
    .filter(provider => known(state, provider, viewerId))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(provider => ({ ...provider, position: { ...provider.position } }));
}
export function selectStrongestAirDefenseProviders(providers: ResolvedAirDefenseProvider[]): UnfilteredCoverage {
  const winners = new Map<string, ResolvedAirDefenseProvider>();
  for (const provider of providers) { const current = winners.get(provider.stackingGroup); if (!current || provider.defenseModifier > current.defenseModifier || (provider.defenseModifier === current.defenseModifier && provider.id.localeCompare(current.id) < 0)) winners.set(provider.stackingGroup, provider); }
  const ids = new Set([...winners.values()].map(provider => provider.id)); const ordered = [...providers].sort((a, b) => a.id.localeCompare(b.id));
  return { flatDefenseModifier: ordered.filter(provider => ids.has(provider.id)).reduce((total, provider) => total + provider.defenseModifier, 0), facts: ordered.map(provider => ({ key: `air-defense:${provider.id}`, label: provider.label, sourceVisibility: 'owner', operation: 'flat', value: provider.defenseModifier, outcome: ids.has(provider.id) ? 'applied' : 'superseded' })), providers: ordered };
}
export function resolveAirDefenseCoverage(state: GameState, defender: Unit, viewerId: string): AirDefenseCoverageResult {
  const key = `${defender.owner}:${defender.position.q},${defender.position.r}:${UNIT_DEFINITIONS[defender.type].domain ?? 'land'}`;
  const revision = coverageRevision(state); let cache = coverageCache.get(state);
  if (!cache || cache.revision !== revision) { cache = { revision, values: new Map() }; coverageCache.set(state, cache); }
  let result = cache.values.get(key); if (!result) { result = selectStrongestAirDefenseProviders(providersFor(state, defender)); cache.values.set(key, result); }
  const visible = new Set(result.providers.filter(provider => known(state, provider, viewerId)).map(provider => provider.id));
  return { flatDefenseModifier: result.flatDefenseModifier, facts: result.facts.filter(fact => visible.has(fact.key.slice('air-defense:'.length))), providers: result.providers.filter(provider => visible.has(provider.id)).map(provider => ({ ...provider, position: { ...provider.position } })) };
}
