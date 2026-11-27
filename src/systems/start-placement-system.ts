import { fnv1a32 } from './deterministic-hash';
import type {
  GameMap,
  GameState,
  HexCoord,
  HomelandChoice,
  MapScript,
  StartPlacementMode,
  StartPreference,
  Unit,
} from '@/core/types';
import { createVisibilityMap, updateVisibility } from '@/systems/fog-of-war';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { isLegalSpawnTile } from '@/systems/unit-spawn-placement';
import { hexKey } from '@/systems/hex-utils';
import {
  createRng,
  getGeographicStartAnchor,
  getStartPositionDistance,
  MIN_MAJOR_CIV_START_DISTANCE,
  type GeographicMapScript,
} from '@/systems/map-generator';
import { isValidStartTile } from '@/systems/map-validation';
import { createStartQualityIndex } from '@/systems/start-quality';
import { getPolarRowBand } from '@/systems/geo-latitude';
import { selectStartSites, type ScoredSite } from '@/systems/start-site-selection';
import { MIN_CITY_CENTER_DISTANCE } from '@/systems/city-territory-system';
import { LEGACY_START_STYLE_RULES, type StartStyleRules } from '@/systems/start-style';
import { assignStartsByPreference } from '@/systems/start-preferences';

export interface StartAssignment {
  civilizationTypeId: string;
  position: HexCoord;
  historicalAnchor: HexCoord | null;
  usedFallback: boolean;
}

export type StartPlacementResult =
  | {
      ok: true;
      positions: HexCoord[];
      assignments: StartAssignment[];
      minimumDistance: number | null;
      fallbackCivilizationTypeIds: string[];
    }
  | {
      ok: false;
      reason: 'insufficient-separated-sites';
      requested: number;
      available: number;
    };

export interface StartPlacementInput {
  map: GameMap;
  civilizationTypeIds: string[];
  mapScript: MapScript;
  mapSize: 'small' | 'medium' | 'large';
  mode: StartPlacementMode;
  seed: string;
  candidateHexes?: Set<string>;
  /** Start style (design 2026-11-25, B3); absent places starts as before the setting existed. */
  style?: StartStyleRules;
  /** One entry per civilization in `civilizationTypeIds` order. */
  startPreferences?: ReadonlyArray<readonly StartPreference[] | undefined>;
}

function isGeographicMapScript(script: MapScript): script is GeographicMapScript {
  return script === 'earth' || script === 'old-world' || script === 'new-world';
}

function stableHash(value: string): number {
  return fnv1a32(value);
}

/**
 * Every candidate passes the major-civilization start-quality floor (design 2026-11-25, B1), with the real-world
 * polar band on geographic maps. Exact historical anchors are not candidates and are judged separately.
 */
function collectCandidates(input: StartPlacementInput): ScoredSite[] {
  const quality = createStartQualityIndex(input.map, {
    polarRows: isGeographicMapScript(input.mapScript)
      ? getPolarRowBand(input.mapScript, input.map.height)
      : undefined,
  });
  const candidates: ScoredSite[] = [];
  for (const tile of Object.values(input.map.tiles)) {
    if (!isValidStartTile(tile)) continue;
    if (input.candidateHexes && !input.candidateHexes.has(hexKey(tile.coord))) continue;
    if (!quality.passesFloor(tile.coord, 'major')) continue;
    candidates.push({ coord: tile.coord, score: quality.assess(tile.coord).score });
  }
  return candidates;
}

function placementRng(input: StartPlacementInput): () => number {
  return createRng(`${input.seed}-start-placement`);
}

function minimumDistance(positions: HexCoord[], map: GameMap): number | null {
  if (positions.length < 2) return null;
  let result = Infinity;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      result = Math.min(result, getStartPositionDistance(map, positions[i], positions[j]));
    }
  }
  return result;
}

function styleOf(input: StartPlacementInput): StartStyleRules {
  return input.style ?? LEGACY_START_STYLE_RULES;
}

function assignBalancedSites(
  input: StartPlacementInput,
  sites: ScoredSite[],
): StartAssignment[] {
  const anchors = input.civilizationTypeIds.map(civ =>
    isGeographicMapScript(input.mapScript)
      ? getGeographicStartAnchor(input.mapScript, input.mapSize, civ)
      : null,
  );
  const { preferenceWeight } = styleOf(input);
  if (preferenceWeight > 0) {
    // With a start style, preferences join the homeland distance in one assignment (design 2026-11-25, B3).
    const siteIndexOf = assignStartsByPreference({
      map: input.map,
      sites: sites.map(site => site.coord),
      preferences: input.civilizationTypeIds.map((_, index) => input.startPreferences?.[index]),
      weight: preferenceWeight,
      anchors,
    });
    return input.civilizationTypeIds.map((civilizationTypeId, index) => ({
      civilizationTypeId,
      position: { ...sites[siteIndexOf[index]].coord },
      historicalAnchor: anchors[index],
      usedFallback: anchors[index] === null,
    }));
  }
  let bestPositions: HexCoord[] | null = null;
  let bestCost = Infinity;
  let bestTie = Infinity;

  const visit = (remaining: ScoredSite[], assigned: HexCoord[], index: number, cost: number) => {
    if (cost > bestCost) return;
    if (index === anchors.length) {
      const tie = stableHash(`${input.seed}:${assigned.map(hexKey).join('|')}`);
      if (cost < bestCost || (cost === bestCost && tie < bestTie)) {
        bestCost = cost;
        bestTie = tie;
        bestPositions = assigned.map(coord => ({ ...coord }));
      }
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      const site = remaining[i];
      const anchor = anchors[index];
      visit(
        [...remaining.slice(0, i), ...remaining.slice(i + 1)],
        [...assigned, site.coord],
        index + 1,
        cost + (anchor ? getStartPositionDistance(input.map, anchor, site.coord) : 0),
      );
    }
  };
  visit(sites, [], 0, 0);

  return input.civilizationTypeIds.map((civilizationTypeId, index) => ({
    civilizationTypeId,
    position: bestPositions![index],
    historicalAnchor: anchors[index],
    usedFallback: anchors[index] === null,
  }));
}

function placeHistorical(
  input: StartPlacementInput,
  candidates: ScoredSite[],
): StartPlacementResult {
  // A homeland is kept when a city can stand on it and it is at least the capital-founding distance from every
  // homeland already kept (in roster order); otherwise that civilization is placed by the shared selection below,
  // so every civilization can found its capital where it starts (design 2026-11-25, B4).
  const kept: HexCoord[] = [];
  const positions: Array<HexCoord | null> = input.civilizationTypeIds.map(civ => {
    const anchor = isGeographicMapScript(input.mapScript)
      ? getGeographicStartAnchor(input.mapScript, input.mapSize, civ)
      : null;
    if (!anchor || !isValidStartTile(input.map.tiles[hexKey(anchor)])) return null;
    if (kept.some(other => getStartPositionDistance(input.map, anchor, other) < MIN_CITY_CENTER_DISTANCE)) return null;
    kept.push(anchor);
    return anchor;
  });
  const fallbackIndices = positions.flatMap((position, index) => (position === null ? [index] : []));
  const anchors = positions.filter((coord): coord is HexCoord => coord !== null);

  if (fallbackIndices.length > 0) {
    // A civilization without a usable homeland is placed by the shared selection: livable land, spaced from the
    // other fallbacks, and never closer to a homeland than a capital may be founded (design 2026-11-25, B2).
    // True Start promises homelands, not spacing: fallbacks prefer the usual separation from each other and accept
    // the capital-founding distance when a crowded map cannot hold more.
    const anchorKeys = new Set(anchors.map(hexKey));
    const select = (minSeparation: number) => selectStartSites({
      map: input.map,
      candidates: candidates.filter(candidate => !anchorKeys.has(hexKey(candidate.coord))),
      count: fallbackIndices.length,
      fixed: anchors,
      minSeparation,
      minFromFixed: MIN_CITY_CENTER_DISTANCE,
      band: styleOf(input).band,
      pickNoise: styleOf(input).pickNoise,
      preferEven: styleOf(input).preferEven,
      rng: placementRng(input),
    });
    const spaced = select(MIN_MAJOR_CIV_START_DISTANCE);
    const selection = spaced.ok ? spaced : select(MIN_CITY_CENTER_DISTANCE);
    if (!selection.ok) {
      return {
        ok: false,
        reason: 'insufficient-separated-sites',
        requested: input.civilizationTypeIds.length,
        available: anchors.length + selection.maximumPlaced,
      };
    }
    fallbackIndices.forEach((civIndex, siteIndex) => {
      positions[civIndex] = { ...selection.sites[siteIndex].coord };
    });
  }

  const fallbackCivilizationTypeIds = fallbackIndices.map(index => input.civilizationTypeIds[index]);
  const resolved = positions as HexCoord[];
  return {
    ok: true,
    positions: resolved,
    assignments: input.civilizationTypeIds.map((civilizationTypeId, index) => ({
      civilizationTypeId,
      position: resolved[index],
      historicalAnchor: isGeographicMapScript(input.mapScript)
        ? getGeographicStartAnchor(input.mapScript, input.mapSize, civilizationTypeId)
        : null,
      usedFallback: fallbackCivilizationTypeIds.includes(civilizationTypeId),
    })),
    minimumDistance: minimumDistance(resolved, input.map),
    fallbackCivilizationTypeIds,
  };
}

export function placeCivilizationStarts(input: StartPlacementInput): StartPlacementResult {
  const candidates = collectCandidates(input);
  if (input.mode === 'historical' && isGeographicMapScript(input.mapScript)) {
    return placeHistorical(input, candidates);
  }
  const selection = selectStartSites({
    map: input.map,
    candidates,
    count: input.civilizationTypeIds.length,
    minSeparation: MIN_MAJOR_CIV_START_DISTANCE,
    minFromFixed: MIN_MAJOR_CIV_START_DISTANCE,
    band: styleOf(input).band,
      pickNoise: styleOf(input).pickNoise,
      preferEven: styleOf(input).preferEven,
    rng: placementRng(input),
  });
  if (!selection.ok) {
    return {
      ok: false,
      reason: 'insufficient-separated-sites',
      requested: input.civilizationTypeIds.length,
      available: selection.maximumPlaced,
    };
  }
  const assignments = assignBalancedSites(input, selection.sites);
  const positions = assignments.map(assignment => assignment.position);
  return {
    ok: true,
    positions,
    assignments,
    minimumDistance: minimumDistance(positions, input.map),
    fallbackCivilizationTypeIds: assignments
      .filter(assignment => assignment.usedFallback)
      .map(assignment => assignment.civilizationTypeId),
  };
}

/**
 * How many separated, livable starts a map holds, up to `maxPlayers` (design 2026-11-25, B2): the selection run with
 * every floor-passing candidate and no quality band. Terrain is fixed for real-world maps, so the answer is a
 * property of the map, committed in `geo-start-capacity-data.ts` and read by the setup screens.
 */
export function computeGeographicStartCapacity(
  map: GameMap,
  mapScript: GeographicMapScript,
  mapSize: 'small' | 'medium' | 'large',
  maxPlayers: number,
): number {
  const input: StartPlacementInput = {
    map, civilizationTypeIds: [], mapScript, mapSize, mode: 'balanced', seed: 'capacity',
  };
  const selection = selectStartSites({
    map,
    candidates: collectCandidates(input),
    count: maxPlayers,
    minSeparation: MIN_MAJOR_CIV_START_DISTANCE,
    minFromFixed: MIN_MAJOR_CIV_START_DISTANCE,
    band: 1,
    rng: placementRng(input),
  });
  return selection.ok ? maxPlayers : selection.maximumPlaced;
}

export type ConfirmHomelandDenial = 'not-active' | 'bad-index' | 'occupied';

export const CONFIRM_HOMELAND_MESSAGES: Record<ConfirmHomelandDenial, string> = {
  'not-active': 'The choice of homeland is over: it is only open on the first turn, before your first city.',
  'bad-index': 'That is not one of the homelands you were offered.',
  occupied: 'Another civilization stands there, so that homeland cannot be taken.',
};

export type ConfirmHomelandResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: ConfirmHomelandDenial; message: string };

function deny(reason: ConfirmHomelandDenial): ConfirmHomelandResult {
  return { ok: false, reason, message: CONFIRM_HOMELAND_MESSAGES[reason] };
}

function startersOf(state: GameState, civId: string): { settler: Unit; warrior: Unit } | null {
  const units = (state.civilizations[civId]?.units ?? [])
    .map(id => state.units[id])
    .filter((unit): unit is Unit => unit != null);
  const settler = units.find(unit => unit.type === 'settler');
  const warrior = units.find(unit => unit.type === 'warrior');
  return settler && warrior ? { settler, warrior } : null;
}

/**
 * The turn-1 homeland choice a civilization may still make, or null. It is derived, not stored as a phase: it is live
 * only on turn 1, while the civilization has no city, and its settler and warrior still stand together on the selected
 * option. Anything else (a moved unit, a founded city, a later turn, an AI civilization) makes it inert, so a stale
 * record in a save can never reopen a choice.
 */
export function getActiveHomelandChoice(state: GameState, civId: string): HomelandChoice | null {
  const civ = state.civilizations[civId];
  const choice = civ?.homelandChoice;
  if (!civ || !choice || choice.options.length < 2 || state.turn !== 1) return null;
  if (civ.cities.some(cityId => state.cities[cityId]?.owner === civId)) return null;
  const starters = startersOf(state, civId);
  const here = choice.options[choice.selected]?.coord;
  if (!starters || !here) return null;
  const standing = (unit: Unit) => unit.position.q === here.q && unit.position.r === here.r;
  return standing(starters.settler) && standing(starters.warrior) ? choice : null;
}

/**
 * Settle on one of the offered homelands: the settler and warrior move there, what the civilization sees is recomputed
 * as if the game had started on it, and the choice records the selection. Returns a new state; the input is untouched.
 */
export function confirmHomeland(state: GameState, civId: string, index: number): ConfirmHomelandResult {
  const choice = getActiveHomelandChoice(state, civId);
  if (!choice) return deny('not-active');
  if (!Number.isInteger(index) || index < 0 || index >= choice.options.length) return deny('bad-index');
  const starters = startersOf(state, civId)!;
  const target = choice.options[index].coord;
  if (index !== choice.selected) {
    for (const unit of [starters.settler, starters.warrior]) {
      if (!isLegalSpawnTile(state, { ownerId: civId, unitType: unit.type, stacking: 'same-owner' }, target)) return deny('occupied');
    }
  }

  const move = (unit: Unit): Unit => ({ ...unit, position: { q: target.q, r: target.r } });
  const units = {
    ...state.units,
    [starters.settler.id]: move(starters.settler),
    [starters.warrior.id]: move(starters.warrior),
  };
  const civ = state.civilizations[civId];
  const civUnits = civ.units.map(id => units[id]).filter((unit): unit is Unit => unit != null);
  const visibility = updateVisibility(createVisibilityMap(), civUnits, state.map).visibility;
  let next: GameState = {
    ...state,
    units,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, visibility, homelandChoice: { ...choice, selected: index } },
    },
  };
  next = refreshLastSeenPresentationsForCiv(next, civId);
  return { ok: true, state: next };
}
