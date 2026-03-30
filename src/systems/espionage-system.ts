// src/systems/espionage-system.ts
import type {
  Spy, SpyMissionType, SpyStatus,
  EspionageCivState, HexCoord,
} from '../core/types';
import { createRng } from './map-generator'; // Reuse existing seeded RNG

const SPY_NAMES = [
  'Shadow', 'Whisper', 'Ghost', 'Cipher', 'Raven',
  'Viper', 'Falcon', 'Wraith', 'Phantom', 'Specter',
  'Dagger', 'Smoke', 'Shade', 'Flicker', 'Ash',
  'Thorn', 'Mist', 'Echo', 'Blade', 'Ember',
];

let nextSpyId = 1;

// --- Mission difficulty config ---

const MISSION_BASE_SUCCESS: Record<SpyMissionType, number> = {
  scout_area: 0.90,
  monitor_troops: 0.85,
  gather_intel: 0.70,
  identify_resources: 0.75,
  monitor_diplomacy: 0.70,
};

const MISSION_DURATIONS: Record<SpyMissionType, number> = {
  scout_area: 1,
  monitor_troops: 2,
  gather_intel: 3,
  identify_resources: 4,
  monitor_diplomacy: 3,
};

// --- State creation ---

export function createEspionageCivState(): EspionageCivState {
  return {
    spies: {},
    maxSpies: 1,
    counterIntelligence: {},
  };
}

// --- Queries ---

export function canRecruitSpy(state: EspionageCivState): boolean {
  const activeSpies = Object.values(state.spies).filter(
    s => s.status !== 'captured',
  ).length;
  return activeSpies < state.maxSpies;
}

export function getSpySuccessChance(
  spyExperience: number,
  counterIntel: number,
  missionType: SpyMissionType,
): number {
  const base = MISSION_BASE_SUCCESS[missionType];
  const expBonus = spyExperience * 0.003;     // +0.3% per XP point, max +30%
  const ciPenalty = counterIntel * 0.004;      // -0.4% per CI point, max -40%
  return Math.max(0.05, Math.min(0.98, base + expBonus - ciPenalty));
}

export function getMissionDuration(missionType: SpyMissionType): number {
  return MISSION_DURATIONS[missionType];
}

// --- Mutations ---

export function recruitSpy(
  state: EspionageCivState,
  owner: string,
  seed: string,
): { state: EspionageCivState; spy: Spy } {
  const rng = createRng(seed);
  const nameIndex = Math.floor(rng() * SPY_NAMES.length);
  const id = `spy-${nextSpyId++}`;

  const spy: Spy = {
    id,
    owner,
    name: `Agent ${SPY_NAMES[nameIndex]}`,
    targetCivId: null,
    targetCityId: null,
    position: null,
    status: 'idle',
    experience: 0,
    currentMission: null,
    cooldownTurns: 0,
  };

  return {
    state: {
      ...state,
      spies: { ...state.spies, [id]: spy },
    },
    spy,
  };
}

export function assignSpy(
  state: EspionageCivState,
  spyId: string,
  targetCivId: string,
  targetCityId: string,
  targetPosition: HexCoord,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status !== 'idle') throw new Error('Spy is not available');

  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'traveling',
        targetCivId,
        targetCityId,
        position: { ...targetPosition },
      },
    },
  };
}

export function assignSpyDefensive(
  state: EspionageCivState,
  spyId: string,
  ownCityId: string,
  cityPosition: HexCoord,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status !== 'idle') throw new Error('Spy is not available');

  const baseCi = 20;
  const expBonus = Math.floor(spy.experience * 0.4); // up to +40 from experience
  const ciScore = Math.min(100, (state.counterIntelligence[ownCityId] ?? 0) + baseCi + expBonus);

  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'stationed',
        targetCivId: null,         // null = defensive assignment
        targetCityId: ownCityId,
        position: { ...cityPosition },
      },
    },
    counterIntelligence: {
      ...state.counterIntelligence,
      [ownCityId]: ciScore,
    },
  };
}

export function recallSpy(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);

  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'idle',
        targetCivId: null,
        targetCityId: null,
        position: null,
        currentMission: null,
      },
    },
  };
}

// Reset the ID counter (for testing)
export function _resetSpyIdCounter(): void {
  nextSpyId = 1;
}
