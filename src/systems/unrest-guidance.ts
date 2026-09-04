import type { GameState, City } from '@/core/types';
import {
  getUnrestPressureBreakdown,
  canGarrisonCity,
  getContagionSpread,
  CONQUEST_UNREST_DURATION,
  type UnrestPressureRow,
} from './faction-system';
import { getAvailableBuildings } from './city-system';
import { getEconomyStatusForCiv, getRushBuyQuote } from './economy-system';
import { getCivHappinessFromResources, getCivAvailableResources } from './resource-acquisition-system';
import { resolveCivilizationEra } from './tech-definitions';
import { UNIT_DEFINITIONS } from './unit-system';
import { hexDistance } from './hex-utils';
import { canConnectCityToCapitalByOwnedRoad, getCitiesConnectedToCapital } from './road-network';
import { getCapitalCityId } from './capital-system';
import { getReservedNationalProjectKeys } from './national-project-system';

// #919 MR3 — "given this city's pressure breakdown, what should the player do?"
// This module is the single source of truth for that answer, and it returns
// STRUCTURED DATA WITH NO DISPLAY STRINGS. The UI layer (src/ui/unrest-guidance-copy.ts)
// owns every player-visible sentence, icon, and screen name. Keeping the split lets the
// same recommendation drive the cities-overview one-liner and the per-city panel
// sub-lines without duplicating eligibility logic.

export type UnrestRecommendationKind =
  | 'build-courthouse' | 'research-magistracy'
  | 'research-military-logistics' | 'connect-city-road-network'
  | 'research-regional-capital' | 'build-regional-capital'
  | 'build-military-administration'
  | 'garrison-unit' | 'train-garrison-unit'
  | 'make-peace' | 'await-conquest-settle' | 'research-constitutional-law'
  | 'fix-economy' | 'counter-espionage' | 'stabilise-contagion-source'
  | 'build-faith-building' | 'acquire-luxury' | 'build-happiness-building'
  | 'appease-or-concede';

export interface UnrestRecommendation {
  kind: UnrestRecommendationKind;
  /** exact pressure-row label this addresses; '' only for the appease-or-concede fallback */
  rowLabel: string;
  /** that row's current contribution (0 for empty-state / fallback recs) */
  amount: number;
  availability: 'now' | 'research-first' | 'blocked';
  params?: Record<string, unknown>;
}

const APPEASE_FALLBACK: UnrestRecommendation = {
  kind: 'appease-or-concede', rowLabel: '', amount: 0, availability: 'now',
};

// --- thin availability wrappers (no reimplementation of existing helpers) ---

function techDone(state: GameState, civId: string, techId: string): boolean {
  return state.civilizations[civId]?.techState.completed.includes(techId) ?? false;
}

// A "spare" military unit = a combat unit of the city's owner that is NOT already
// standing on the city tile (one that is on the tile already IS the garrison).
const CIVILIAN_UNIT_TYPES = new Set(['settler', 'worker', 'missionary']);
const MILITARY_UNIT_TYPES = new Set(
  Object.entries(UNIT_DEFINITIONS)
    .filter(([type, def]) => (def?.strength ?? 0) > 0
      && !CIVILIAN_UNIT_TYPES.has(type)
      && !type.startsWith('spy_')
      && !type.startsWith('beast_'))
    .map(([type]) => type),
);

function hasSpareMilitaryUnit(state: GameState, city: City): boolean {
  return Object.values(state.units).some(u =>
    u.owner === city.owner
    && MILITARY_UNIT_TYPES.has(u.type)
    && hexDistance(u.position, city.position) !== 0);
}

function buildingBuildableHere(buildingId: string, state: GameState, city: City): boolean {
  const civ = state.civilizations[city.owner];
  if (!civ || city.buildings.includes(buildingId)) return false;
  const era = resolveCivilizationEra(civ.techState.completed);
  const resources = getCivAvailableResources(state, city.owner);
  return getAvailableBuildings(city, civ.techState.completed, state.map, resources, era, getReservedNationalProjectKeys(state, city.owner), city.owner, undefined, getCapitalCityId(state, city.owner))
    .some(b => b.id === buildingId);
}

function queuedBuildingCannotBeRushed(buildingId: string, state: GameState, city: City): boolean {
  return city.productionQueue[0] === buildingId
    && !getRushBuyQuote(state, city.owner, city.id).available;
}

function anyHappinessBuildingAvailable(state: GameState, city: City): boolean {
  const civ = state.civilizations[city.owner];
  if (!civ) return false;
  const era = resolveCivilizationEra(civ.techState.completed);
  const resources = getCivAvailableResources(state, city.owner);
  return getAvailableBuildings(city, civ.techState.completed, state.map, resources, era, undefined, city.owner)
    .some(b => (b.happiness ?? 0) > 0);
}

// --- table-driven resolvers: one entry per pressure-row family (mirrors NP_PRODUCTION_DISCOUNTS) ---

interface GuidanceResolver {
  matchesRow(label: string): boolean;
  // A row may map to more than one recommendation (e.g. a primary "do this now" lever
  // plus a secondary "and research this later" note). Order matters: the first entry is
  // the one getTopUnrestLever prefers when several are `now`.
  resolve(ctx: { city: City; state: GameState; row: UnrestPressureRow }):
    UnrestRecommendation | UnrestRecommendation[] | null;
}

const SPRAWL_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Empire overextension' || label === 'Distance from capital',
  resolve: ({ city, state, row }) => {
    const base = { rowLabel: row.label, amount: row.amount };
    const completed = state.civilizations[city.owner]?.techState.completed ?? [];
    if (row.label === 'Distance from capital' && !completed.includes('political-philosophy')
      && completed.includes('civil-service') && completed.includes('philosophy')) {
      return { ...base, kind: 'research-regional-capital', availability: 'research-first', params: { techId: 'political-philosophy' } };
    }
    if (row.label === 'Distance from capital' && buildingBuildableHere('regional_capital', state, city)) {
      return { ...base, kind: 'build-regional-capital', availability: 'now' };
    }
    if (row.label === 'Distance from capital' && !completed.includes('military-logistics')
      && completed.includes('road-building') && completed.includes('tactics')) {
      return { ...base, kind: 'research-military-logistics', availability: 'research-first', params: { techId: 'military-logistics' } };
    }
    if (row.label === 'Distance from capital' && completed.includes('military-logistics')
      && !getCitiesConnectedToCapital(state, city.owner, 'owned-road').has(city.id)
      && canConnectCityToCapitalByOwnedRoad(state, city.owner, city.id)) {
      return { ...base, kind: 'connect-city-road-network', availability: 'now' };
    }
    if (buildingBuildableHere('courthouse', state, city)) {
      return { ...base, kind: 'build-courthouse', availability: 'now' };
    }
    if (!city.buildings.includes('courthouse')
      && techDone(state, city.owner, 'code-of-laws')
      && !techDone(state, city.owner, 'magistracy')) {
      return { ...base, kind: 'research-magistracy', availability: 'research-first', params: { techId: 'magistracy' } };
    }
    if (hasSpareMilitaryUnit(state, city)) {
      return { ...base, kind: 'garrison-unit', availability: 'now' };
    }
    return { ...base, kind: 'train-garrison-unit', availability: 'now' };
  },
};

const WAR_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'War weariness',
  resolve: ({ city, state, row }) => {
    const base = { rowLabel: row.label, amount: row.amount };
    const makePeace: UnrestRecommendation = {
      ...base,
      kind: 'make-peace',
      availability: 'now',
      params: { warCivIds: [...(state.civilizations[city.owner]?.diplomacy.atWarWith ?? [])] },
    };
    if (!buildingBuildableHere('military-administration', state, city)) return makePeace;
    const build: UnrestRecommendation = {
      ...base,
      kind: 'build-military-administration',
      availability: 'now',
    };
    return queuedBuildingCannotBeRushed('military-administration', state, city)
      ? [build, makePeace]
      : build;
  },
};

const CONQUEST_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Recent conquest',
  resolve: ({ city, state, row }) => {
    const turnsLeft = city.conquestTurn !== undefined
      ? Math.max(0, CONQUEST_UNREST_DURATION - (state.turn - city.conquestTurn))
      : 0;
    const base = { rowLabel: row.label, amount: row.amount };
    // Primary: the only thing a player can actually do right now is wait it out
    // (a garrison blunts contagion spread from it, nothing more).
    const awaitSettlement: UnrestRecommendation = {
      ...base,
      kind: 'await-conquest-settle',
      availability: 'now',
      params: { turnsLeft, canGarrison: canGarrisonCity(city.id, state) },
    };
    const administrationBuildable = buildingBuildableHere('military-administration', state, city);
    const recs: UnrestRecommendation[] = administrationBuildable
      ? [
          { ...base, kind: 'build-military-administration', availability: 'now' },
          ...(queuedBuildingCannotBeRushed('military-administration', state, city) ? [awaitSettlement] : []),
        ]
      : [awaitSettlement];
    // Constitutional Law is a truthful fallback while the local relief building is
    // unavailable. Once it is buildable, keep the actionable recommendation focused.
    if (!administrationBuildable
      && !techDone(state, city.owner, 'constitutional-law')) {
      recs.push({ ...base, kind: 'research-constitutional-law', availability: 'research-first', params: { techId: 'constitutional-law' } });
    }
    return recs;
  },
};

const ECONOMY_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Economic strain',
  resolve: ({ city, state, row }) => ({
    rowLabel: row.label, amount: row.amount, kind: 'fix-economy', availability: 'now',
    params: { unpaidMaintenance: getEconomyStatusForCiv(state, city.owner).unpaidMaintenance },
  }),
};

const ESPIONAGE_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Enemy espionage',
  resolve: ({ row }) => ({
    rowLabel: row.label, amount: row.amount, kind: 'counter-espionage', availability: 'now',
  }),
};

const CONTAGION_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Uprising contagion',
  resolve: ({ city, state, row }) => ({
    rowLabel: row.label, amount: row.amount, kind: 'stabilise-contagion-source', availability: 'now',
    params: { sourceCityId: getContagionSpread(city.id, state).nearestCityId ?? undefined },
  }),
};

const FAITH_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Foreign faith pressure',
  resolve: ({ city, state, row }) => {
    const canBuild = techDone(state, city.owner, 'philosophy');
    return {
      rowLabel: row.label, amount: row.amount, kind: 'build-faith-building',
      availability: canBuild ? 'now' : 'blocked',
      params: canBuild ? undefined : { needsTech: 'philosophy' },
    };
  },
};

const UNREST_GUIDANCE_RESOLVERS: GuidanceResolver[] = [
  SPRAWL_RESOLVER, WAR_RESOLVER, CONQUEST_RESOLVER, ECONOMY_RESOLVER,
  ESPIONAGE_RESOLVER, CONTAGION_RESOLVER, FAITH_RESOLVER,
];

function resolveRow(city: City, state: GameState, row: UnrestPressureRow): UnrestRecommendation[] {
  for (const resolver of UNREST_GUIDANCE_RESOLVERS) {
    if (!resolver.matchesRow(row.label)) continue;
    const result = resolver.resolve({ city, state, row });
    return result == null ? [] : Array.isArray(result) ? result : [result];
  }
  return [];
}

// Opportunities keyed to empire state rather than a specific pressure row: acquire a
// luxury (none owned) and build a happiness building (its tech exists, none built).
// The happiness-building rec is NEVER emitted before that tech exists — this is what
// kills the Era-2 "build happiness improvements" dead promise.
function emptyStateRecommendations(city: City, state: GameState): UnrestRecommendation[] {
  const out: UnrestRecommendation[] = [];
  if (getCivHappinessFromResources(state, city.owner) === 0) {
    out.push({ kind: 'acquire-luxury', rowLabel: '', amount: 0, availability: 'now' });
  }
  if (anyHappinessBuildingAvailable(state, city)) {
    out.push({ kind: 'build-happiness-building', rowLabel: '', amount: 0, availability: 'now' });
  }
  return out;
}

function positivePressureRows(cityId: string, state: GameState): UnrestPressureRow[] {
  const city = state.cities[cityId];
  if (!city) return [];
  return getUnrestPressureBreakdown(cityId, state, getCivHappinessFromResources(state, city.owner))
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

// First-wins dedupe by `kind`: two pressure rows in the same family (e.g. Empire
// overextension AND Distance from capital) resolve to the same lever, and the player
// only needs to be told "build a Courthouse" once. Rows are amount-sorted, so the kept
// entry is the one attached to the more impactful row.
function dedupeByKind(recs: UnrestRecommendation[]): UnrestRecommendation[] {
  const seen = new Set<UnrestRecommendationKind>();
  return recs.filter(rec => (seen.has(rec.kind) ? false : (seen.add(rec.kind), true)));
}

export function getUnrestRecommendations(cityId: string, state: GameState): UnrestRecommendation[] {
  const city = state.cities[cityId];
  if (!city) return [];
  const recs = positivePressureRows(cityId, state).flatMap(row => resolveRow(city, state, row));
  recs.push(...emptyStateRecommendations(city, state));
  const deduped = dedupeByKind(recs);
  return deduped.length === 0 ? [{ ...APPEASE_FALLBACK }] : deduped;
}

export function getTopUnrestLever(cityId: string, state: GameState): UnrestRecommendation | null {
  const city = state.cities[cityId];
  if (!city) return null;
  const rows = positivePressureRows(cityId, state);
  if (rows.length === 0) return { ...APPEASE_FALLBACK };
  const resolved = rows.flatMap(row => resolveRow(city, state, row));
  return resolved.find(r => r.availability === 'now') ?? resolved[0] ?? { ...APPEASE_FALLBACK };
}
