import type {
  GameMap,
  HexCoord,
  MapScript,
  StartPlacementMode,
} from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import {
  getGeographicStartAnchor,
  getStartPositionDistance,
  MIN_MAJOR_CIV_START_DISTANCE,
  type GeographicMapScript,
} from '@/systems/map-generator';
import { isValidStartTile } from '@/systems/map-validation';

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
}

interface Candidate {
  coord: HexCoord;
  quality: number;
  tieRank: number;
}

function isGeographicMapScript(script: MapScript): script is GeographicMapScript {
  return script === 'earth' || script === 'old-world' || script === 'new-world';
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function candidateQuality(map: GameMap, coord: HexCoord): number {
  let workable = 0;
  let fertility = 0;
  for (const tile of Object.values(map.tiles)) {
    if (getStartPositionDistance(map, coord, tile.coord) > 2) continue;
    if (!isValidStartTile(tile)) continue;
    workable++;
    if (tile.terrain === 'grassland' || tile.terrain === 'forest' || tile.terrain === 'jungle') {
      fertility += 2;
    } else {
      fertility += 1;
    }
  }
  return workable * 10 + fertility;
}

function collectCandidates(input: StartPlacementInput): Candidate[] {
  const valid = Object.values(input.map.tiles)
    .filter(tile => isValidStartTile(tile))
    .filter(tile => !input.candidateHexes || input.candidateHexes.has(hexKey(tile.coord)))
    .map(tile => ({
      coord: tile.coord,
      quality: candidateQuality(input.map, tile.coord),
      tieRank: stableHash(`${input.seed}:${hexKey(tile.coord)}`),
    }));
  const preferred = valid.filter(candidate =>
    candidate.coord.r > 3
    && candidate.coord.r < input.map.height - 4
    && candidate.quality >= 70,
  );
  return (preferred.length >= input.civilizationTypeIds.length ? preferred : valid)
    .sort((a, b) =>
      b.quality - a.quality
      || a.tieRank - b.tieRank
      || a.coord.r - b.coord.r
      || a.coord.q - b.coord.q,
    );
}

function compareSolutions(a: Candidate[], b: Candidate[], map: GameMap): number {
  const aMinimum = minimumDistance(a.map(candidate => candidate.coord), map) ?? Infinity;
  const bMinimum = minimumDistance(b.map(candidate => candidate.coord), map) ?? Infinity;
  if (aMinimum !== bMinimum) return aMinimum - bMinimum;
  const aWeakest = Math.min(...a.map(candidate => candidate.quality));
  const bWeakest = Math.min(...b.map(candidate => candidate.quality));
  if (aWeakest !== bWeakest) return aWeakest - bWeakest;
  return a.reduce((sum, candidate) => sum + candidate.quality, 0)
    - b.reduce((sum, candidate) => sum + candidate.quality, 0);
}

function selectBalancedSites(
  map: GameMap,
  candidates: Candidate[],
  count: number,
): { sites: Candidate[] | null; maximumPlaced: number } {
  if (count === 0) return { sites: [], maximumPlaced: 0 };
  let best: Candidate[] | null = null;
  let maximumPlaced = 0;
  const firstChoices = candidates.slice(0, Math.min(candidates.length, 128));

  for (const first of firstChoices) {
    const selected = [first];
    while (selected.length < count) {
      const remaining = candidates
        .filter(candidate => !selected.includes(candidate))
        .map(candidate => ({
          candidate,
          distance: Math.min(...selected.map(existing =>
            getStartPositionDistance(map, candidate.coord, existing.coord),
          )),
        }))
        .filter(entry => entry.distance >= MIN_MAJOR_CIV_START_DISTANCE)
        .sort((a, b) =>
          b.distance - a.distance
          || b.candidate.quality - a.candidate.quality
          || a.candidate.tieRank - b.candidate.tieRank,
        );
      if (!remaining[0]) break;
      selected.push(remaining[0].candidate);
    }
    maximumPlaced = Math.max(maximumPlaced, selected.length);
    if (selected.length === count && (!best || compareSolutions(selected, best, map) > 0)) {
      best = selected;
    }
  }
  return { sites: best, maximumPlaced };
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

function assignBalancedSites(
  input: StartPlacementInput,
  sites: Candidate[],
): StartAssignment[] {
  const anchors = input.civilizationTypeIds.map(civ =>
    isGeographicMapScript(input.mapScript)
      ? getGeographicStartAnchor(input.mapScript, input.mapSize, civ)
      : null,
  );
  let bestPositions: HexCoord[] | null = null;
  let bestCost = Infinity;
  let bestTie = Infinity;

  const visit = (remaining: Candidate[], assigned: HexCoord[], index: number, cost: number) => {
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
  candidates: Candidate[],
): StartPlacementResult {
  const positions: Array<HexCoord | null> = input.civilizationTypeIds.map(civ =>
    isGeographicMapScript(input.mapScript)
      ? getGeographicStartAnchor(input.mapScript, input.mapSize, civ)
      : null,
  );
  const fallbackCivilizationTypeIds: string[] = [];
  const used = new Set(
    positions.filter((coord): coord is HexCoord => coord !== null).map(hexKey),
  );

  for (let index = 0; index < positions.length; index++) {
    const exact = positions[index];
    if (exact && input.map.tiles[hexKey(exact)] && isValidStartTile(input.map.tiles[hexKey(exact)])) {
      continue;
    }
    const placed = positions.filter((coord): coord is HexCoord => coord !== null);
    const fallback = candidates
      .filter(candidate => !used.has(hexKey(candidate.coord)))
      .map(candidate => ({
        candidate,
        distance: placed.length === 0
          ? Infinity
          : Math.min(...placed.map(coord =>
            getStartPositionDistance(input.map, candidate.coord, coord),
          )),
      }))
      .sort((a, b) =>
        b.distance - a.distance
        || b.candidate.quality - a.candidate.quality
        || a.candidate.tieRank - b.candidate.tieRank,
      )[0]?.candidate;
    if (!fallback) {
      return {
        ok: false,
        reason: 'insufficient-separated-sites',
        requested: input.civilizationTypeIds.length,
        available: used.size,
      };
    }
    positions[index] = fallback.coord;
    used.add(hexKey(fallback.coord));
    fallbackCivilizationTypeIds.push(input.civilizationTypeIds[index]);
  }

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
  const selection = selectBalancedSites(
    input.map,
    candidates,
    input.civilizationTypeIds.length,
  );
  if (!selection.sites) {
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
