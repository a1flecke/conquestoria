import { describe, expect, it } from 'vitest';
import type { GameMap, HexTile, MapScript } from '@/core/types';
import { createHotSeatGame, createNewGame, MAP_DIMENSIONS } from '@/core/game-state';
import { cityDistance, isCityCenterTerrain, MIN_CITY_CENTER_DISTANCE } from '@/systems/city-territory-system';
import { findStartPositions, MIN_MAJOR_CIV_START_DISTANCE, getStartPositionDistance } from '@/systems/map-generator';
import { placeCivilizationStarts } from '@/systems/start-placement-system';
import { createStartViabilityIndex } from '@/systems/start-viability';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';
import { initializeScenario } from '../simulation/ai-playability-fixture';
import { hexKey, getWrappedHexNeighbors } from '@/systems/hex-utils';

const TERRAIN: Record<string, HexTile['terrain']> = {
  '~': 'ocean', c: 'coast', g: 'grassland', m: 'mountain',
};

/** Rows are r = 0..; columns are q. '~' ocean, 'c' coast, 'g' grassland, 'm' mountain. */
function mapFrom(rows: string[], wrapsHorizontally: boolean): GameMap {
  const width = rows[0].length;
  const tiles: GameMap['tiles'] = {};
  rows.forEach((row, r) => {
    expect(row.length).toBe(width);
    [...row].forEach((ch, q) => {
      tiles[`${q},${r}`] = {
        coord: { q, r },
        terrain: TERRAIN[ch],
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    });
  });
  return { width, height: rows.length, wrapsHorizontally, tiles, rivers: [] };
}

describe('start viability contract (#1453)', () => {
  it('rejects an interior start on a tiny island (no legal second site, no coast)', () => {
    // A 7-tile hex flower; (4,2) has all six neighbours on land.
    const map = mapFrom([
      '~~~~~~~~~~~~~~',
      '~~~~gg~~~~~~~~',
      '~~~ggg~~~~~~~~',
      '~~~gg~~~~~~~~~',
      '~~~~~~~~~~~~~~',
    ], false);
    const result = createStartViabilityIndex(map).assess({ q: 4, r: 2 });
    expect(result).toMatchObject({ viable: false, route: 'none', coastal: false, landmassTiles: 7 });
  });

  it('a coastal tile on that island is viable only if another landmass offers a legal site on the same sea', () => {
    const lonely = mapFrom([
      '~~~~~~~~~~~~~~',
      '~~~~gg~~~~~~~~',
      '~~~ggg~~~~~~~~',
      '~~~gg~~~~~~~~~',
      '~~~~~~~~~~~~~~',
    ], false);
    expect(createStartViabilityIndex(lonely).assess({ q: 4, r: 1 })).toMatchObject({ viable: false, coastal: true });

    const withNeighbour = mapFrom([
      '~~~~~~~~~~~~~~',
      '~~~~gg~~~~~~~~',
      '~~~ggg~~gggg~~',
      '~~~gg~~~~~~~~~',
      '~~~~~~~~~~~~~~',
    ], false);
    expect(createStartViabilityIndex(withNeighbour).assess({ q: 4, r: 1 }))
      .toMatchObject({ viable: true, route: 'sea', coastal: true });
    // The interior tile still has no ships to build, however near the neighbour is.
    expect(createStartViabilityIndex(withNeighbour).isViable({ q: 4, r: 2 })).toBe(false);
  });

  it('honours MIN_CITY_CENTER_DISTANCE exactly: a site 3 hexes away does not count, 4 does', () => {
    expect(MIN_CITY_CENTER_DISTANCE).toBe(4);
    const strip = mapFrom(['~~~~~~~~~~~~', '~gggggggg~~~', '~~~~~~~~~~~~'], false);
    const index = createStartViabilityIndex(strip);
    // 8-tile strip q1..q8. q4 sees q1 (3) and q8 (4) -> viable; q5 sees q1 (4) -> viable;
    // a 7-tile strip's middle sees neither end at distance 4.
    expect(index.isViable({ q: 4, r: 1 })).toBe(true);
    const short = mapFrom(['~~~~~~~~~~~~', '~ggggggg~~~~', '~~~~~~~~~~~~'], false);
    const shortIndex = createStartViabilityIndex(short);
    expect(shortIndex.isViable({ q: 4, r: 1 })).toBe(false); // ends are at distance 3
    expect(shortIndex.isViable({ q: 1, r: 1 })).toBe(true); // q5 is at distance 4
    expect(shortIndex.countLandExpansionSites({ q: 1, r: 1 })).toBe(3); // q5, q6, q7
  });

  it('does not decide by landmass size: a large landmass with no legal second site is not viable', () => {
    // 27 land tiles, but the only city-centre terrain within reach is the start
    // itself; everything else is mountain (walkable, never a city centre).
    const rows = [
      '~~~~~~~~~~~~',
      '~mmmmmmmmm~~',
      '~mmmmgmmmm~~',
      '~mmmmmmmmm~~',
      '~~~~~~~~~~~~',
    ];
    const index = createStartViabilityIndex(mapFrom(rows, false));
    const result = index.assess({ q: 5, r: 2 });
    expect(result.landmassTiles).toBe(27);
    expect(result).toMatchObject({ viable: false, route: 'none', coastal: false });
    // One legal site exactly 4 away makes the very same landmass viable.
    const withSite = rows.map((row, r) => (r === 2 ? '~mmmmgmmmgm~' : row));
    expect(createStartViabilityIndex(mapFrom(withSite, false)).assess({ q: 5, r: 2 }))
      .toMatchObject({ viable: true, route: 'land' });
    // At distance 3 it still does not.
    const tooClose = rows.map((row, r) => (r === 2 ? '~mmmmgmmgmm~' : row));
    expect(createStartViabilityIndex(mapFrom(tooClose, false)).isViable({ q: 5, r: 2 })).toBe(false);
  });

  it('treats a coast tile as a barrier: land split by a strait is reached by sea or not at all', () => {
    const split = mapFrom(['~~~~~~~~~~~', '~ggcgggggg~', '~~~~~~~~~~~'], false);
    expect(createStartViabilityIndex(split).assess({ q: 1, r: 1 }))
      .toMatchObject({ viable: true, route: 'sea', landmassTiles: 2 });
  });

  describe('horizontal wrapping', () => {
    const rows = ['~~~~~~~~~~', 'gg~~~~gggg', '~~~~~~~~~~'];

    it('joins landmasses and measures distance across the seam', () => {
      const wrapped = createStartViabilityIndex(mapFrom(rows, true));
      // q9..q6 reaches q1 through the seam; q6 is wrapped-distance 4 from q0.
      expect(wrapped.assess({ q: 0, r: 1 })).toMatchObject({ viable: true, route: 'land', landmassTiles: 6 });
      // q7, q8, q9 are 3, 2, 1 away across the seam and must not count.
      expect(wrapped.countLandExpansionSites({ q: 0, r: 1 })).toBe(1);
    });

    it('without wrapping the same tiles are two islands reachable only by sea', () => {
      const flat = createStartViabilityIndex(mapFrom(rows, false));
      expect(flat.assess({ q: 0, r: 1 })).toMatchObject({ viable: true, route: 'sea', landmassTiles: 2 });
      expect(flat.countLandExpansionSites({ q: 0, r: 1 })).toBe(0);
    });
  });

  it('agrees with a brute-force oracle built from the canonical founding rules on generated maps', () => {
    for (const seed of ['oracle-a', 'oracle-b', 'oracle-c']) {
      const state = createNewGame({
        civType: 'rome', seed, mapSize: 'small', opponentCount: 2, gameTitle: seed, mapScript: 'procedural',
      });
      const map = state.map;
      const index = createStartViabilityIndex(map);
      const land = Object.values(map.tiles).filter(t => t.terrain !== 'ocean' && t.terrain !== 'coast');
      for (const tile of land) {
        // Oracle: flood from the tile over non-water hexes, then test every
        // member with the real rule and the real metric.
        const seen = new Set([hexKey(tile.coord)]);
        const stack = [tile.coord];
        while (stack.length) {
          const cur = stack.pop()!;
          for (const next of getWrappedHexNeighbors(cur, map.width)) {
            const nt = map.tiles[hexKey(next)];
            if (!nt || nt.terrain === 'ocean' || nt.terrain === 'coast' || seen.has(hexKey(next))) continue;
            seen.add(hexKey(next));
            stack.push(next);
          }
        }
        const expected = [...seen].filter(key => {
          const member = map.tiles[key]!;
          return isCityCenterTerrain(member.terrain)
            && cityDistance(tile.coord, member.coord, map) >= MIN_CITY_CENTER_DISTANCE;
        }).length;
        expect(index.countLandExpansionSites(tile.coord)).toBe(expected);
        if (expected > 0) expect(index.assess(tile.coord).route).toBe('land');
      }
    }
  });
});

describe('placement never offers an unviable start (#1453)', () => {
  // A 19-tile island whose centre is interior (no coast, no second site) next
  // to a large strip. Scan order puts the trap first, so a placer that does not
  // check viability hands the trap to the first civilization.
  const rows = [
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~ggg~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~gggg~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~ggggg~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~gggg~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~ggg~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ];
  const trapCenter = { q: 6, r: 7 };

  function trapMap(): GameMap {
    const map = mapFrom(rows, false);
    // A big grass block far from the trap, where every tile is a good start.
    for (let r = 5; r <= 12; r++) {
      for (let q = 16; q <= 29; q++) map.tiles[`${q},${r}`]!.terrain = 'grassland';
    }
    return map;
  }

  it('the trap centre really is unviable and a block tile really is viable', () => {
    const index = createStartViabilityIndex(trapMap());
    expect(index.assess(trapCenter)).toMatchObject({ viable: false, route: 'none', coastal: false });
    expect(index.isViable({ q: 22, r: 8 })).toBe(true);
  });

  it('findStartPositions skips the trap even when it is the first candidate in scan order', () => {
    const map = trapMap();
    const candidates = new Set([hexKey(trapCenter), '18,8', '28,8']);
    const positions = findStartPositions(map, ['a', 'b'], 'procedural', 'small', candidates);
    expect(positions.map(hexKey)).not.toContain(hexKey(trapCenter));
    const index = createStartViabilityIndex(map);
    expect(positions.every(position => index.isViable(position))).toBe(true);
  });

  it('placeCivilizationStarts (balanced) skips the trap', () => {
    const map = trapMap();
    const result = placeCivilizationStarts({
      map,
      civilizationTypeIds: ['a', 'b'],
      mapScript: 'procedural',
      mapSize: 'small',
      mode: 'balanced',
      seed: 'trap',
      candidateHexes: new Set([hexKey(trapCenter), '18,8', '28,8']),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.positions.map(hexKey)).not.toContain(hexKey(trapCenter));
  });

  it('fails explicitly instead of settling for the trap when it is the only candidate', () => {
    const map = trapMap();
    const only = new Set([hexKey(trapCenter)]);
    // One civ, one candidate, and that candidate is a trap: no start exists.
    expect(() => findStartPositions(map, ['a'], 'procedural', 'small', only)).toThrow(/Could not place/);
    expect(placeCivilizationStarts({
      map, civilizationTypeIds: ['a'], mapScript: 'procedural', mapSize: 'small',
      mode: 'balanced', seed: 'trap', candidateHexes: only,
    })).toEqual({ ok: false, reason: 'insufficient-separated-sites', requested: 1, available: 0 });
  });

  it('several civilizations competing for the viable sites each get a distinct, separated, viable start', () => {
    const map = trapMap();
    const positions = findStartPositions(map, ['a', 'b'], 'procedural', 'small');
    const index = createStartViabilityIndex(map);
    expect(new Set(positions.map(hexKey)).size).toBe(2);
    expect(getStartPositionDistance(map, positions[0], positions[1])).toBeGreaterThanOrEqual(MIN_MAJOR_CIV_START_DISTANCE);
    expect(positions.every(position => index.isViable(position))).toBe(true);
  });
});

describe('the original unrecoverable start from #1453', () => {
  // On unmodified main this seed (the original long-horizon `lh-late-era-medium`
  // world, medium map, four majors) put ai-3 at (36,32) on a 14-tile landmass:
  // no legal second site, and a start that is not coastal.
  const config = {
    civType: 'rome', seed: 'lh-late-era-medium', mapSize: 'medium' as const,
    opponentCount: 3, gameTitle: 'lh-late-era-medium', mapScript: 'balanced' as const,
  };
  const BAD_START = { q: 36, r: 32 };

  it('the historical bad site is still unviable on the map, so the regression is meaningful', () => {
    const state = createNewGame(config);
    const bad = createStartViabilityIndex(state.map).assess(BAD_START);
    expect(bad).toMatchObject({ viable: false, route: 'none', coastal: false, landmassTiles: 14 });
  });

  it('every major civilization now starts with a legal path to expand', () => {
    const state = createNewGame(config);
    const index = createStartViabilityIndex(state.map);
    const starts = Object.values(state.civilizations).map(civ => {
      const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
      return { civ: civ.id, position: settler.position };
    });
    expect(starts).toHaveLength(4);
    for (const { civ, position } of starts) {
      expect(index.isViable(position), `${civ} at ${hexKey(position)}`).toBe(true);
      expect(hexKey(position)).not.toBe(hexKey(BAD_START));
    }
  });

  it('holds through the long-horizon setup path (AI founding via the real founding rules)', () => {
    const founded = initializeScenario({
      seed: 'lh-late-era-medium', challenge: 'standard', turns: 1, mapSize: 'medium',
      humanCount: 1, aiCount: 3, personalitySet: ['aggressive', 'trader', 'diplomatic'],
    } as never);
    const index = createStartViabilityIndex(founded.map);
    for (const city of Object.values(founded.cities)) {
      expect(index.isViable(city.position), city.owner).toBe(true);
    }
  });

  it('does not disturb the #1107 recoverable fixture seed', () => {
    const state = createNewGame({ ...config, seed: 'lh-1107-search-0', gameTitle: 'x' });
    const positions = Object.values(state.civilizations).map(civ =>
      hexKey(state.units[civ.units.find(id => state.units[id]?.type === 'settler')!]!.position));
    expect(positions).toEqual(['0,4', '7,40', '22,10', '35,32']);
  });
});

describe('determinism, save/reload and variety (#1453)', () => {
  const settlerPositions = (state: ReturnType<typeof createNewGame>): string[] =>
    Object.values(state.civilizations).map(civ =>
      hexKey(state.units[civ.units.find(id => state.units[id]?.type === 'settler')!]!.position));

  it('the same input produces identical terrain and starts', () => {
    const make = () => createNewGame({
      civType: 'rome', seed: 'repeat-1453', mapSize: 'medium', opponentCount: 3,
      gameTitle: 't', mapScript: 'procedural',
    });
    const a = make();
    const b = make();
    expect(settlerPositions(a)).toEqual(settlerPositions(b));
    expect(JSON.stringify(a.map.tiles)).toBe(JSON.stringify(b.map.tiles));
  });

  it('different seeds still spread civilizations to different places', () => {
    const layouts = new Set(
      Array.from({ length: 12 }, (_, i) =>
        settlerPositions(createNewGame({
          civType: 'rome', seed: `variety-${i}`, mapSize: 'medium', opponentCount: 3,
          gameTitle: 't', mapScript: 'balanced',
        })).join('|')),
    );
    expect(layouts.size).toBeGreaterThanOrEqual(10);
  });

  it('save/reload leaves the generated map and every start untouched', () => {
    const state = createNewGame({
      civType: 'rome', seed: 'lh-late-era-medium', mapSize: 'medium', opponentCount: 3,
      gameTitle: 't', mapScript: 'balanced',
    });
    const reloaded = normalizeLoadedStateForTest(JSON.parse(JSON.stringify(state)));
    expect(settlerPositions(reloaded)).toEqual(settlerPositions(state));
    expect(reloaded.map.width).toBe(state.map.width);
    expect(Object.keys(reloaded.map.tiles).length).toBe(Object.keys(state.map.tiles).length);
    for (const key of Object.keys(state.map.tiles)) {
      expect(reloaded.map.tiles[key]!.terrain).toBe(state.map.tiles[key]!.terrain);
    }
  });
});

describe('every generator path honours the contract (#1453)', () => {
  const SCRIPTS: MapScript[] = ['procedural', 'balanced', 'single-continent'];
  const SEEDS = Array.from({ length: 10 }, (_, i) => `contract-${i}`);

  for (const mapScript of SCRIPTS) {
    for (const mapSize of ['small', 'medium', 'large'] as const) {
      it(`${mapScript} / ${mapSize}: solo starts at the supported maximum are viable and separated`, () => {
        const opponentCount = MAP_DIMENSIONS[mapSize].maxPlayers - 1;
        for (const seed of SEEDS) {
          let state;
          try {
            state = createNewGame({ civType: 'rome', seed, mapSize, opponentCount, gameTitle: seed, mapScript });
          } catch (error) {
            // Pre-existing explicit failure (too few separated sites on a tiny
            // single-continent). Never an invalid start.
            expect(String(error)).toMatch(/Could not place/);
            continue;
          }
          const index = createStartViabilityIndex(state.map);
          const positions = Object.values(state.civilizations).map(civ =>
            state.units[civ.units.find(id => state.units[id]?.type === 'settler')!]!.position);
          positions.forEach(position => expect(index.isViable(position), `${seed} ${hexKey(position)}`).toBe(true));
          for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
              expect(getStartPositionDistance(state.map, positions[i], positions[j]))
                .toBeGreaterThanOrEqual(MIN_MAJOR_CIV_START_DISTANCE);
            }
          }
        }
      });
    }
  }

  it('hot seat setup (human and AI majors) uses the same contract', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const state = createHotSeatGame({
        playerCount: 4, mapSize: 'medium', mapScript: 'balanced',
        players: [
          { name: 'A', slotId: 'player-1', civType: 'rome', isHuman: true },
          { name: 'B', slotId: 'player-2', civType: 'greece', isHuman: true },
          { name: 'C', slotId: 'ai-1', civType: 'china', isHuman: false },
          { name: 'D', slotId: 'ai-2', civType: 'egypt', isHuman: false },
        ],
      }, seed, seed);
      const index = createStartViabilityIndex(state.map);
      for (const civ of Object.values(state.civilizations)) {
        const settler = state.units[civ.units.find(id => state.units[id]?.type === 'settler')!]!;
        expect(index.isViable(settler.position), `${seed} ${civ.id}`).toBe(true);
      }
    }
  });

  it('geographic balanced placement keeps historical islands viable (Britain/Japan style coastal starts)', () => {
    for (const mapScript of ['earth', 'old-world', 'new-world'] as const) {
      const state = createNewGame({
        civType: 'england', seed: `geo-${mapScript}`, mapSize: 'medium', opponentCount: 3,
        gameTitle: 't', mapScript,
      });
      const index = createStartViabilityIndex(state.map);
      for (const civ of Object.values(state.civilizations)) {
        const settler = state.units[civ.units.find(id => state.units[id]?.type === 'settler')!]!;
        expect(index.isViable(settler.position), `${mapScript} ${civ.id}`).toBe(true);
      }
    }
  });
});
