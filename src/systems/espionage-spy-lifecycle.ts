import type {
  DisguiseType,
  EspionageCivState,
  EspionageState,
  HexCoord,
  Spy,
  SpyMissionType,
  SpyPromotion,
  UnitType,
} from '@/core/types';
import { createRng } from './map-generator';
import {
  HANDLER_MISSIONS,
  INFILTRATOR_MISSIONS,
  PROMOTION_XP_THRESHOLD,
  SPY_NAMES,
} from './espionage-catalog';
import { getInfiltrationSuccessChance } from './espionage-probability';
import { setCounterIntelligence } from './espionage-counterintel';

/**
 * Spy lifecycle transitions (#1009): creation, disguise, embed/unembed, recall,
 * cleanup, promotion and infiltration. Each function is a pure
 * `EspionageCivState -> EspionageCivState` (or payload) transition; turn
 * orchestration lives in `espionage-turn.ts`.
 */
export function createSpyFromUnit(
  state: EspionageCivState,
  unitId: string,
  owner: string,
  unitType: UnitType,
  seed: string,
): { state: EspionageCivState; spy: Spy } {
  const rng = createRng(seed);
  const nameIndex = Math.floor(rng() * SPY_NAMES.length);
  const spy: Spy = {
    id: unitId,
    owner,
    name: `Agent ${SPY_NAMES[nameIndex]}`,
    unitType,
    targetCivId: null,
    targetCityId: null,
    position: null,
    status: 'idle',
    experience: 0,
    currentMission: null,
    cooldownTurns: 0,
    promotion: undefined,
    promotionAvailable: false,
    feedsFalseIntel: false,
    disguiseAs: null,
    infiltrationCityId: null,
    cityVisionTurnsLeft: 0,
    stolenTechFrom: {},
  };
  return {
    state: { ...state, spies: { ...state.spies, [unitId]: spy } },
    spy,
  };
}

export function setDisguise(
  state: EspionageCivState,
  spyId: string,
  disguiseAs: DisguiseType | null,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status !== 'idle') throw new Error('Disguise can only be set while spy is on the map (idle)');
  return {
    ...state,
    spies: { ...state.spies, [spyId]: { ...spy, disguiseAs } },
  };
}

export function cleanupDeadSpyUnit(
  espionage: EspionageState,
  owner: string,
  unitId: string,
): EspionageState {
  const civEsp = espionage[owner];
  if (!civEsp?.spies[unitId]) return espionage;
  const { [unitId]: _removed, ...remainingSpies } = civEsp.spies;
  return {
    ...espionage,
    [owner]: { ...civEsp, spies: remainingSpies },
  };
}

export function embedSpy(
  state: EspionageCivState,
  spyId: string,
  cityId: string,
  cityPosition: HexCoord,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'idle') throw new Error('Spy must be idle to embed');
  const baseCi = 15;
  const expBonus = Math.floor(spy.experience * 0.3);
  const newCi = (state.counterIntelligence[cityId] ?? 0) + baseCi + expBonus;
  const withCi = setCounterIntelligence(state, cityId, newCi);
  return {
    ...withCi,
    spies: {
      ...withCi.spies,
      [spyId]: { ...spy, status: 'embedded', targetCityId: cityId, position: { ...cityPosition } },
    },
  };
}

export function unembedSpy(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'embedded') return state;
  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: { ...spy, status: 'cooldown', cooldownTurns: 5, targetCityId: null },
    },
  };
}

export function recallSpy(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status === 'embedded') return state; // embedded spies must use unembedSpy

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

export function checkAndApplyPromotion(
  spy: Spy,
  lastMissionType: SpyMissionType,
): Spy {
  if (spy.promotion !== undefined) return spy;          // already promoted
  if (spy.experience < PROMOTION_XP_THRESHOLD) return spy;

  let promotion: SpyPromotion;
  if (INFILTRATOR_MISSIONS.has(lastMissionType)) {
    promotion = 'infiltrator';
  } else if (HANDLER_MISSIONS.has(lastMissionType)) {
    promotion = 'handler';
  } else {
    promotion = 'sentinel';
  }

  return { ...spy, promotion, promotionAvailable: false };
}

export function verifyAgent(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) return state;

  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        turnedBy: undefined,
        feedsFalseIntel: false,
      },
    },
  };
}

export interface InfiltrationResult {
  civEsp: EspionageCivState;
  removeUnitFromMap: boolean;
  caught: boolean;
  era1ScoutResult?: { tilesToReveal: HexCoord[] };
}

const INFILTRATION_FAIL_COOLDOWN = 3;
const INFILTRATION_CATCH_CHANCE = 0.25;

export function attemptInfiltration(
  state: EspionageCivState,
  spyId: string,
  unitType: UnitType,
  targetCityId: string,
  targetPosition: HexCoord,
  cityCI: number,
  seed: string,
): InfiltrationResult {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'idle') throw new Error(`Spy ${spyId} cannot infiltrate (not idle)`);

  const rng = createRng(seed);
  const chance = getInfiltrationSuccessChance(unitType, spy.experience, cityCI);
  const roll = rng();

  if (roll < chance) {
    const era1 = unitType === 'spy_scout';
    const updatedSpy: Spy = {
      ...spy,
      status: era1 ? 'idle' : 'stationed',
      infiltrationCityId: targetCityId,
      cityVisionTurnsLeft: 5,
      cooldownTurns: 0,
      position: { ...targetPosition },
      experience: Math.min(100, spy.experience + 5),
    };
    return {
      civEsp: { ...state, spies: { ...state.spies, [spyId]: updatedSpy } },
      removeUnitFromMap: !era1,
      caught: false,
      era1ScoutResult: era1 ? { tilesToReveal: [] } : undefined,
    };
  } else {
    const catchRoll = rng();
    const caught = catchRoll < INFILTRATION_CATCH_CHANCE;
    const updatedSpy: Spy = {
      ...spy,
      status: caught ? 'captured' : 'cooldown',
      cooldownTurns: caught ? 0 : INFILTRATION_FAIL_COOLDOWN,
      cooldownMode: caught ? undefined : 'stay_low',
    };
    return {
      civEsp: { ...state, spies: { ...state.spies, [spyId]: updatedSpy } },
      removeUnitFromMap: false,
      caught,
    };
  }
}
