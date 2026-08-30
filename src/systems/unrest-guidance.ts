import type { GameState, City } from '@/core/types';
import {
  getUnrestPressureBreakdown,
  canGarrisonCity,
  getContagionSpread,
  CONQUEST_UNREST_DURATION,
  type UnrestPressureRow,
} from './faction-system';
import { getAvailableBuildings } from './city-system';
import { getEconomyStatusForCiv } from './economy-system';
import { getCivHappinessFromResources, getCivAvailableResources } from './resource-acquisition-system';
import { resolveCivilizationEra } from './tech-definitions';
import { UNIT_DEFINITIONS } from './unit-system';
import { hexDistance } from './hex-utils';

// #919 MR3 — "given this city's pressure breakdown, what should the player do?"
// This module is the single source of truth for that answer, and it returns
// STRUCTURED DATA WITH NO DISPLAY STRINGS. The UI layer (src/ui/unrest-guidance-copy.ts)
// owns every player-visible sentence, icon, and screen name. Keeping the split lets the
// same recommendation drive the cities-overview one-liner and the per-city panel
// sub-lines without duplicating eligibility logic.

export type UnrestRecommendationKind =
  | 'build-courthouse' | 'research-magistracy'
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

function courthouseBuildableHere(state: GameState, city: City): boolean {
  const civ = state.civilizations[city.owner];
  if (!civ || city.buildings.includes('courthouse')) return false;
  const era = resolveCivilizationEra(civ.techState.completed);
  const resources = getCivAvailableResources(state, city.owner);
  return getAvailableBuildings(city, civ.techState.completed, state.map, resources, era, undefined, city.owner)
    .some(b => b.id === 'courthouse');
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
  resolve(ctx: { city: City; state: GameState; row: UnrestPressureRow }): UnrestRecommendation | null;
}

const SPRAWL_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Empire overextension' || label === 'Distance from capital',
  resolve: ({ city, state, row }) => {
    const base = { rowLabel: row.label, amount: row.amount };
    if (courthouseBuildableHere(state, city)) {
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
  resolve: ({ city, state, row }) => ({
    rowLabel: row.label, amount: row.amount, kind: 'make-peace', availability: 'now',
    params: { warCivIds: [...(state.civilizations[city.owner]?.diplomacy.atWarWith ?? [])] },
  }),
};

const CONQUEST_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Recent conquest',
  resolve: ({ city, state, row }) => {
    const turnsLeft = city.conquestTurn !== undefined
      ? Math.max(0, CONQUEST_UNREST_DURATION - (state.turn - city.conquestTurn))
      : 0;
    const canGarrison = canGarrisonCity(city.id, state);
    if (!techDone(state, city.owner, 'constitutional-law')) {
      return {
        rowLabel: row.label, amount: row.amount, kind: 'research-constitutional-law',
        availability: 'research-first', params: { turnsLeft, canGarrison, techId: 'constitutional-law' },
      };
    }
    return {
      rowLabel: row.label, amount: row.amount, kind: 'await-conquest-settle',
      availability: 'now', params: { turnsLeft, canGarrison },
    };
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

function resolveRow(city: City, state: GameState, row: UnrestPressureRow): UnrestRecommendation | null {
  for (const resolver of UNREST_GUIDANCE_RESOLVERS) {
    if (resolver.matchesRow(row.label)) return resolver.resolve({ city, state, row });
  }
  return null;
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

export function getUnrestRecommendations(cityId: string, state: GameState): UnrestRecommendation[] {
  const city = state.cities[cityId];
  if (!city) return [];
  const recs: UnrestRecommendation[] = [];
  for (const row of positivePressureRows(cityId, state)) {
    const rec = resolveRow(city, state, row);
    if (rec) recs.push(rec);
  }
  recs.push(...emptyStateRecommendations(city, state));
  if (recs.length === 0) recs.push({ ...APPEASE_FALLBACK });
  return recs;
}

export function getTopUnrestLever(cityId: string, state: GameState): UnrestRecommendation | null {
  const city = state.cities[cityId];
  if (!city) return null;
  const rows = positivePressureRows(cityId, state);
  if (rows.length === 0) return { ...APPEASE_FALLBACK };
  const resolved = rows
    .map(row => resolveRow(city, state, row))
    .filter((r): r is UnrestRecommendation => r != null);
  return resolved.find(r => r.availability === 'now') ?? resolved[0] ?? { ...APPEASE_FALLBACK };
}
