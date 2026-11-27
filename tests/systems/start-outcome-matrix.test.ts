/**
 * Start outcome matrix (design 2026-11-25, B7): every map script x size x placement mode, solo and hot seat, plus each
 * start style (Fair / Varied / Wild) on a generated, a single-continent and two real-world maps, fixed seeds. Every major-civilization start must pass the `major` start-quality floor (with the real-world polar band on
 * geographic maps), every city-state the `city-state` floor, and any two major starts must be at least
 * MIN_CITY_CENTER_DISTANCE apart so every civilization can found its capital.
 *
 * A two-way ratchet: a violation not listed in KNOWN_START_VIOLATIONS fails (a new bad start can never land), and a
 * listed violation that no longer reproduces fails too (delete its entry). The list starts with what placement did
 * before the start-quality work and must end empty.
 *
 * Runtime ~45 s on the dev host: intensive local selection (SLOW_TEST_FILES), one CI shard.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { GameSettings, GameState, HexCoord, MapScript, StartPlacementMode, StartStyle } from '@/core/types';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { isGeographicMapScript } from '@/systems/geo-map-data';
import { getPolarRowBand } from '@/systems/geo-latitude';
import { createStartQualityIndex } from '@/systems/start-quality';
import { getStartPositionDistance } from '@/systems/map-generator';
import { MIN_CITY_CENTER_DISTANCE } from '@/systems/city-territory-system';
import { hexKey } from '@/systems/hex-utils';
import { getMaxCivilizationsForSetup } from '@/systems/geo-start-capacity';
import { preloadGeoMapData } from '../helpers/geo-map-data';
import { KNOWN_START_VIOLATIONS, startViolationKey } from './start-outcome-known-violations';

type Size = 'small' | 'medium' | 'large';
interface MatrixConfig {
  mapScript: MapScript;
  mapSize: Size;
  startPlacementMode?: StartPlacementMode;
  hotSeat?: boolean;
  homelandPicker?: boolean;
  startStyle?: StartStyle;
}

const SEEDS = 8;
const CONFIGS: MatrixConfig[] = [];
for (const mapScript of ['procedural', 'balanced', 'single-continent'] as const) {
  for (const mapSize of ['small', 'medium', 'large'] as const) CONFIGS.push({ mapScript, mapSize });
}
for (const mapScript of ['earth', 'old-world', 'new-world'] as const) {
  for (const mapSize of ['small', 'medium', 'large'] as const) {
    for (const startPlacementMode of ['balanced', 'historical'] as const) CONFIGS.push({ mapScript, mapSize, startPlacementMode });
  }
}
CONFIGS.push({ mapScript: 'balanced', mapSize: 'medium', hotSeat: true });
CONFIGS.push({ mapScript: 'earth', mapSize: 'large', startPlacementMode: 'balanced', hotSeat: true });
// Homeland choice (Phase C): every reserved option is a start, so each must pass the same minimum.
CONFIGS.push({ mapScript: 'balanced', mapSize: 'medium', homelandPicker: true });
CONFIGS.push({ mapScript: 'earth', mapSize: 'large', startPlacementMode: 'balanced', homelandPicker: true });
CONFIGS.push({ mapScript: 'balanced', mapSize: 'large', hotSeat: true, homelandPicker: true });
CONFIGS.push({ mapScript: 'earth', mapSize: 'large', startPlacementMode: 'balanced', hotSeat: true, homelandPicker: true });
// Start style (design 2026-11-25, B3): the floor and distance rules are identical in every style.
for (const startStyle of ['fair', 'varied', 'wild'] as const) {
  CONFIGS.push({ mapScript: 'procedural', mapSize: 'large', startStyle });
  CONFIGS.push({ mapScript: 'single-continent', mapSize: 'medium', startStyle });
  CONFIGS.push({ mapScript: 'earth', mapSize: 'large', startPlacementMode: 'balanced', startStyle });
  CONFIGS.push({ mapScript: 'old-world', mapSize: 'medium', startPlacementMode: 'historical', startStyle });
}
CONFIGS.push({ mapScript: 'balanced', mapSize: 'medium', hotSeat: true, homelandPicker: true, startStyle: 'fair' });
CONFIGS.push({ mapScript: 'earth', mapSize: 'large', startPlacementMode: 'balanced', homelandPicker: true, startStyle: 'wild' });

export function configLabel(config: MatrixConfig): string {
  return `${config.startStyle ? `${config.startStyle}:` : ''}${config.homelandPicker ? 'homeland:' : ''}${config.hotSeat ? 'hotseat:' : ''}${config.mapScript}/${config.mapSize}/${config.startPlacementMode ?? '-'}`;
}

function civilizationsOffered(config: MatrixConfig): number {
  return getMaxCivilizationsForSetup(config.mapScript, config.mapSize, config.startPlacementMode ?? 'balanced');
}

/** Setup offers Anywhere placement only where two separated starts fit (a solo game needs one opponent). */
function offered(config: MatrixConfig): boolean {
  return civilizationsOffered(config) >= (config.hotSeat ? 3 : 2);
}

function overrides(config: MatrixConfig): { settingsOverrides?: Partial<GameSettings> } {
  const settingsOverrides: Partial<GameSettings> = {
    ...(config.homelandPicker ? { homelandPicker: 'on' as const } : {}),
    ...(config.startStyle ? { startStyle: config.startStyle } : {}),
  };
  return Object.keys(settingsOverrides).length > 0 ? { settingsOverrides } : {};
}

function create(config: MatrixConfig, seed: string): GameState {
  if (config.hotSeat) {
    return createHotSeatGame({
      playerCount: 4,
      mapSize: config.mapSize,
      mapScript: config.mapScript,
      startPlacementMode: config.startPlacementMode,
      ...overrides(config),
      players: [
        { name: 'A', slotId: 'player-1', civType: 'rome', isHuman: true },
        { name: 'B', slotId: 'player-2', civType: 'egypt', isHuman: true },
        { name: 'C', slotId: 'ai-1', civType: 'greece', isHuman: false },
        { name: 'D', slotId: 'ai-2', civType: 'china', isHuman: false },
      ],
    }, seed, 'matrix');
  }
  return createNewGame({
    civType: 'rome',
    seed,
    mapSize: config.mapSize,
    // As many civilizations as the setup screen offers for this map (capped at real-world map capacity).
    opponentCount: civilizationsOffered(config) - 1,
    mapScript: config.mapScript,
    startPlacementMode: config.startPlacementMode,
    gameTitle: 'matrix',
    ...overrides(config),
  });
}

function majorStarts(state: GameState): Array<{ owner: string; coord: HexCoord }> {
  return Object.values(state.units)
    .filter(unit => unit.type === 'settler')
    .map(unit => ({ owner: unit.owner, coord: unit.position }));
}

interface Observation { key: string; example: string }

function observe(config: MatrixConfig, seed: string): Observation[] {
  const state = create(config, seed);
  const polarRows = isGeographicMapScript(config.mapScript)
    ? getPolarRowBand(config.mapScript, state.map.height)
    : undefined;
  const index = createStartQualityIndex(state.map, { polarRows });
  const label = configLabel(config);
  const found: Observation[] = [];
  const starts = majorStarts(state);
  for (const start of starts) {
    for (const failure of index.floorFailures(start.coord, 'major')) {
      found.push({ key: startViolationKey({ config: label, owner: 'major', failure }), example: `${seed} ${start.owner}@${hexKey(start.coord)}` });
    }
  }
  // Every reserved homeland option is a start a human may pick: it passes the same minimum, and a capital apart from
  // every other civilization's start and every other civilization's options.
  const optionsByCiv = Object.entries(state.civilizations)
    .map(([civId, civ]) => ({ civId, coords: civ.homelandChoice?.options.map(option => option.coord) ?? [] }));
  if (config.homelandPicker && !optionsByCiv.some(entry => entry.coords.length > 1)) {
    found.push({ key: startViolationKey({ config: label, owner: 'major', failure: 'land-r2' }), example: `${seed} no homeland options were reserved` });
  }
  for (const { civId, coords } of optionsByCiv) {
    for (const coord of coords) {
      for (const failure of index.floorFailures(coord, 'major')) {
        found.push({ key: startViolationKey({ config: label, owner: 'major', failure }), example: `${seed} ${civId} option ${hexKey(coord)}` });
      }
      const rivals = [
        ...starts.filter(start => start.owner !== civId).map(start => start.coord),
        ...optionsByCiv.filter(entry => entry.civId !== civId).flatMap(entry => entry.coords),
      ];
      if (rivals.some(rival => getStartPositionDistance(state.map, coord, rival) < MIN_CITY_CENTER_DISTANCE)) {
        found.push({ key: startViolationKey({ config: label, owner: 'major', failure: 'capital-distance' }), example: `${seed} ${civId} option ${hexKey(coord)}` });
      }
    }
  }
  for (const city of Object.values(state.cities)) {
    for (const failure of index.floorFailures(city.position, 'city-state')) {
      found.push({ key: startViolationKey({ config: label, owner: 'city-state', failure }), example: `${seed} ${city.name}@${hexKey(city.position)}` });
    }
  }
  for (let i = 0; i < starts.length; i++) {
    for (let j = i + 1; j < starts.length; j++) {
      if (getStartPositionDistance(state.map, starts[i].coord, starts[j].coord) < MIN_CITY_CENTER_DISTANCE) {
        found.push({ key: startViolationKey({ config: label, owner: 'major', failure: 'capital-distance' }), example: `${seed} ${starts[i].owner}/${starts[j].owner}` });
      }
    }
  }
  return found;
}

describe('start outcome matrix (design 2026-11-25, B7)', () => {
  beforeAll(async () => { await preloadGeoMapData(); });

  it('places no start below its floor beyond the known, shrinking list', () => {
    const seen = new Map<string, string>();
    for (const config of CONFIGS.filter(offered)) {
      for (let n = 0; n < SEEDS; n++) {
        for (const { key, example } of observe(config, `matrix-${n}`)) {
          if (!seen.has(key)) seen.set(key, example);
        }
      }
    }
    if (process.env.START_MATRIX_REPORT) {
      // Diagnostic only: writes what placement produces today, for updating the list by hand.
      mkdirSync('.verification', { recursive: true });
      writeFileSync('.verification/start-outcome-matrix.txt', [...seen].map(([key, example]) => `${key}  ${example}`).sort().join('\n'));
    }
    const known = new Set(KNOWN_START_VIOLATIONS.map(startViolationKey));
    const unexpected = [...seen].filter(([key]) => !known.has(key)).map(([key, example]) => `${key} (e.g. ${example})`);
    const stale = [...known].filter(key => !seen.has(key));
    expect(unexpected, 'new start violations').toEqual([]);
    expect(stale, 'known violations that no longer reproduce: delete these entries').toEqual([]);
  }, 600_000);

  it('creates the same hot-seat starts twice from one seed', () => {
    const config = CONFIGS.find(c => c.hotSeat)!;
    const coords = (state: GameState) => majorStarts(state).map(s => `${s.owner}@${hexKey(s.coord)}`).sort();
    expect(coords(create(config, 'matrix-det'))).toEqual(coords(create(config, 'matrix-det')));
  });
});
