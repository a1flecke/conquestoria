import type { AirDefenseCoverageProvider, AirDefenseCoverageResult, AirDefenseProviderDefinition, CombatModifierFact, GameState, Unit } from '@/core/types';
import { getVisibility } from './fog-of-war';
import { hexDistance, wrappedHexDistance } from './hex-utils';

const ANTI_AIR_BATTERY: AirDefenseProviderDefinition = { id: 'anti_air_battery', kind: 'building', radius: 0, defenseModifier: 8, stackingGroup: 'ground-air-defense', label: 'Anti-Air Battery' };
export interface ResolvedAirDefenseProvider extends AirDefenseCoverageProvider {}
interface UnfilteredCoverage { flatDefenseModifier: number; facts: CombatModifierFact[]; providers: ResolvedAirDefenseProvider[]; }
const coverageCache = new WeakMap<GameState, Map<string, UnfilteredCoverage>>();

function distance(state: GameState, left: Unit['position'], right: Unit['position']): number {
  return state.map.wrapsHorizontally ? wrappedHexDistance(left, right, state.map.width) : hexDistance(left, right);
}
function known(state: GameState, provider: ResolvedAirDefenseProvider, viewerId: string): boolean {
  return provider.ownerId === viewerId || getVisibility(state.civilizations[viewerId]?.visibility ?? { tiles: {} }, provider.position) === 'visible';
}
function providersFor(state: GameState, defender: Unit): ResolvedAirDefenseProvider[] {
  return Object.values(state.cities).filter(city => city.owner === defender.owner && city.buildings.includes(ANTI_AIR_BATTERY.id) && distance(state, city.position, defender.position) <= ANTI_AIR_BATTERY.radius).map(city => ({ id: `city:${city.id}:${ANTI_AIR_BATTERY.id}`, label: ANTI_AIR_BATTERY.label, position: { ...city.position }, ownerId: city.owner, radius: 0, defenseModifier: 8, stackingGroup: ANTI_AIR_BATTERY.stackingGroup }));
}
export function selectStrongestAirDefenseProviders(providers: ResolvedAirDefenseProvider[]): UnfilteredCoverage {
  const winners = new Map<string, ResolvedAirDefenseProvider>();
  for (const provider of providers) { const current = winners.get(provider.stackingGroup); if (!current || provider.defenseModifier > current.defenseModifier || (provider.defenseModifier === current.defenseModifier && provider.id.localeCompare(current.id) < 0)) winners.set(provider.stackingGroup, provider); }
  const ids = new Set([...winners.values()].map(provider => provider.id)); const ordered = [...providers].sort((a, b) => a.id.localeCompare(b.id));
  return { flatDefenseModifier: ordered.filter(provider => ids.has(provider.id)).reduce((total, provider) => total + provider.defenseModifier, 0), facts: ordered.map(provider => ({ key: `air-defense:${provider.id}`, label: provider.label, sourceVisibility: 'owner', operation: 'flat', value: provider.defenseModifier, outcome: ids.has(provider.id) ? 'applied' : 'superseded' })), providers: ordered };
}
export function resolveAirDefenseCoverage(state: GameState, defender: Unit, viewerId: string): AirDefenseCoverageResult {
  const key = `${defender.owner}:${defender.position.q},${defender.position.r}`; let cache = coverageCache.get(state); if (!cache) { cache = new Map(); coverageCache.set(state, cache); } let result = cache.get(key); if (!result) { result = selectStrongestAirDefenseProviders(providersFor(state, defender)); cache.set(key, result); }
  const visible = new Set(result.providers.filter(provider => known(state, provider, viewerId)).map(provider => provider.id));
  return { flatDefenseModifier: result.flatDefenseModifier, facts: result.facts.filter(fact => visible.has(fact.key.slice('air-defense:'.length))), providers: result.providers.filter(provider => visible.has(provider.id)).map(provider => ({ ...provider, position: { ...provider.position } })) };
}
