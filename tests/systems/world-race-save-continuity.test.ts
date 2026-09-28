import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';
import { foundCity } from '@/systems/city-system';
import { getWorldRacePresentationForViewer } from '@/systems/world-race-presentation';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';

function ensureCity(state: ReturnType<typeof createNewGame>, civId: string): string {
  const civ = state.civilizations[civId]!;
  const existing = civ.cities[0];
  if (existing) return existing;
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  const city = foundCity(civId, settler.position, state.map, state.idCounters);
  state.cities[city.id] = city;
  civ.cities.push(city.id);
  return city.id;
}

const LAUNCH = 'first_satellite_launch';
const COMPONENT = 'space_program_initiative';

/**
 * #992 — a save predating the world-race framework simply lacks `state.worldRaces` and
 * the `worldRaceProgress` field on an intel report; both are computed lazily by
 * `processWorldRacesTurn`/`gather_intel`, so there is nothing for a load-time normalizer
 * to backfill (see .claude/rules/game-systems.md's "additive without migration" contract).
 * This proves the in-progress shape that DOES exist round-trips through a real
 * serialize/parse boundary unchanged, and that processing a turn afterward matches an
 * uninterrupted run byte-for-byte (Deterministic Simulation Contract clause 2).
 */
describe('world race save/reload continuity (#992)', () => {
  it('preserves an in-progress race (winner recorded, a rival still mid-launch) through serialize/parse', () => {
    const state = createNewGame('rome', 'world-race-save-continuity');
    const civId = 'player';
    const rivalId = 'ai-1';
    state.civilizations[civId]!.techState.completed = ['space-exploration'];
    state.civilizations[rivalId]!.techState.completed = ['space-exploration'];

    const cityId = ensureCity(state, civId);
    const rivalCityId = ensureCity(state, rivalId);

    state.cities[cityId]!.buildings = [...state.cities[cityId]!.buildings, LAUNCH];
    state.cities[rivalCityId]!.productionQueue = [LAUNCH];
    state.cities[rivalCityId]!.productionProgress = 42;

    state.builtNationalProjects = {
      [`${civId}:${LAUNCH}`]: { civId, cityId, eraBuilt: 11 },
    };
    state.worldRaces = {
      'first-satellite': { kind: 'first-satellite', announcedUnlocked: true, announcedLaunchBegun: true, winnerCivId: civId, completedTurn: state.turn },
    };
    state.espionage![civId] = {
      ...(state.espionage![civId] ?? { spies: {} }),
      intelReports: {
        [rivalId]: { turn: state.turn, worldRaceProgress: { 'first-satellite': { componentBuilt: true, launchQueued: true, launchProgress: 42, launchCost: 380 } } },
      },
    } as never;

    const serialized = serializeSaveFile(state);
    const parsed = parseSaveFile(serialized);
    if (parsed.status !== 'success') throw new Error(`expected successful parse, got: ${parsed.message}`);
    const loaded = parsed.state;

    expect(loaded.worldRaces).toEqual(state.worldRaces);
    expect(loaded.builtNationalProjects).toEqual(state.builtNationalProjects);

    const beforePresentation = getWorldRacePresentationForViewer(state, civId, 'first-satellite');
    const afterPresentation = getWorldRacePresentationForViewer(loaded, civId, 'first-satellite');
    expect(afterPresentation).toEqual(beforePresentation);

    // Processing a turn from the loaded save matches processing the same turn on the
    // never-serialized original — a save/reload must not move the trajectory.
    const continuedFromLive = processTurn(state, new EventBus());
    const continuedFromLoad = processTurn(loaded, new EventBus());
    assertSimulationEquivalent(continuedFromLive, continuedFromLoad, 'live vs. save/reload');
  });

  it('a save with no world-race state at all (predates the feature) loads and processes a turn with nothing to repair', () => {
    const state = createNewGame('rome', 'world-race-save-continuity-absent');
    expect(state.worldRaces).toBeUndefined();

    const serialized = serializeSaveFile(state);
    const parsed = parseSaveFile(serialized);
    if (parsed.status !== 'success') throw new Error(`expected successful parse, got: ${parsed.message}`);
    const loaded = parsed.state;
    expect(loaded.worldRaces).toBeUndefined();

    const continuedFromLive = processTurn(state, new EventBus());
    const continuedFromLoad = processTurn(loaded, new EventBus());
    assertSimulationEquivalent(continuedFromLive, continuedFromLoad, 'live vs. save/reload, no prior race state');
  });
});
