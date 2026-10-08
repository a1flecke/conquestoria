import type { DetectedSpyThreat, EspionageCivState, EspionageState, GameState } from '@/core/types';
import type { DiplomacyState } from '@/core/types/diplomacy';
import { modifyRelationship } from './diplomacy-state';
import { createRng } from './map-generator';

/**
 * Counterintelligence and capture consequences (#1009): sweeps, CI scores, CI
 * buildings, capture/expel/execute transitions, spy turning, and the bilateral
 * diplomatic-history penalties a caught or expelled spy records.
 *
 * The diplomacy helpers here go through the narrow `diplomacy-state` module,
 * never the diplomacy kitchen sink (#1011).
 */
export function attemptSweep(
  state: EspionageCivState,
  spyId: string,
  seed: string,
  gameState: GameState,
): { state: EspionageCivState; detectedSpyIds: string[] } {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return { state, detectedSpyIds: [] };
  const rng = createRng(seed);
  const detected: string[] = [];
  const baseSweepChance = 0.40 + spy.experience * 0.003;
  for (const [otherId, otherEsp] of Object.entries(gameState.espionage ?? {})) {
    if (otherId === spy.owner) continue;
    for (const enemySpy of Object.values(otherEsp.spies)) {
      if (enemySpy.infiltrationCityId !== spy.targetCityId) continue;
      if (rng() < baseSweepChance) detected.push(enemySpy.id);
    }
  }
  const updatedState = {
    ...state,
    spies: { ...state.spies, [spyId]: { ...spy, lastSweepTurn: gameState.turn } },
  };
  return { state: updatedState, detectedSpyIds: detected };
}

// --- Diplomatic consequences ---

const EXPULSION_RELATIONSHIP_PENALTY = -15;
const CAPTURE_RELATIONSHIP_PENALTY = -40;

export function handleSpyExpelled(
  dipState: DiplomacyState,
  spyOwnerCivId: string,
  turn: number,
): DiplomacyState {
  let updated = modifyRelationship(dipState, spyOwnerCivId, EXPULSION_RELATIONSHIP_PENALTY);
  updated = {
    ...updated,
    events: [...updated.events, {
      type: 'spy_expelled',
      turn,
      otherCiv: spyOwnerCivId,
      weight: 1,
    }],
  };
  return updated;
}

export function handleSpyCaptured(
  dipState: DiplomacyState,
  spyOwnerCivId: string,
  turn: number,
): DiplomacyState {
  let updated = modifyRelationship(dipState, spyOwnerCivId, CAPTURE_RELATIONSHIP_PENALTY);
  updated = {
    ...updated,
    events: [...updated.events, {
      type: 'spy_captured',
      turn,
      otherCiv: spyOwnerCivId,
      weight: 1,
    }],
  };
  return updated;
}

export function setCounterIntelligence(
  state: EspionageCivState,
  cityId: string,
  score: number,
): EspionageCivState {
  return {
    ...state,
    counterIntelligence: {
      ...state.counterIntelligence,
      [cityId]: Math.max(0, Math.min(100, score)),
    },
  };
}

export function applyBuildingCI(
  cityId: string,
  city: { buildings: string[] },
  civEsp: EspionageCivState,
  completedTechs: string[],
): EspionageCivState {
  let ciBonus = 0;
  if (city.buildings.includes('intelligence-agency')) {
    const faded = completedTechs.includes('digital-surveillance');
    ciBonus += faded ? 10 : 20;
  }
  if (city.buildings.includes('security-bureau')) {
    const faded = completedTechs.includes('signals-intelligence');
    ciBonus += faded ? 15 : 30;
  }
  if (ciBonus === 0) return civEsp;
  const current = civEsp.counterIntelligence[cityId] ?? 0;
  return setCounterIntelligence(civEsp, cityId, current + ciBonus);
}

export function getSpyCaptureRelationshipPenalty(distanceToNearestCity: number): number {
  if (distanceToNearestCity > 5) return 0;
  if (distanceToNearestCity > 1) return -10;
  if (distanceToNearestCity === 1) return -25;
  return -50; // inside city (distance 0)
}

export function expelSpy(
  state: EspionageCivState,
  spyId: string,
  cooldownTurns: number = 15,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) return state;
  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'cooldown',
        cooldownTurns,
        infiltrationCityId: null,
        cityVisionTurnsLeft: 0,
        targetCivId: null,
        targetCityId: null,
        position: null,
        currentMission: null,
        stolenTechFrom: {},
        disguiseAs: null,
      },
    },
  };
}

export function executeSpy(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const { [spyId]: _removed, ...remainingSpies } = state.spies;
  return { ...state, spies: remainingSpies };
}

/**
 * Required, named roles for turning a captured spy (#1022). `captorId` and
 * `spyOwner` are both bare ids and semantically opposite, so a positional call
 * could transpose them and silently hand the spy to the wrong civilization.
 */
export interface TurnCapturedSpyCommand {
  /** The civ that holds the captured spy and turns it. */
  captorId: string;
  /** The civ the spy originally belonged to. */
  spyOwner: string;
  spyId: string;
  /** Absolute turn the turning happens on; defaults to 0 to preserve the old optional argument. */
  turn?: number;
}

export function turnCapturedSpy(
  state: EspionageState,
  command: TurnCapturedSpyCommand,
): EspionageState {
  const { captorId, spyOwner, spyId, turn = 0 } = command;
  const ownerState = state[spyOwner];
  const spy = ownerState?.spies[spyId];
  if (!ownerState || !spy) return state;
  const captorState = state[captorId];
  const detectedThreats = captorState?.detectedThreats ?? {};
  const updatedThreats = spy.targetCityId
    ? {
      ...detectedThreats,
      [spyId]: {
        cityId: spy.targetCityId,
        foreignCivId: spyOwner,
        detectedTurn: turn,
        expiresOnTurn: turn + 5,
      } satisfies DetectedSpyThreat,
    }
    : detectedThreats;

  return {
    ...state,
    [spyOwner]: {
      ...ownerState,
      spies: {
        ...ownerState.spies,
        [spyId]: {
          ...spy,
          status: 'stationed',
          currentMission: null,
          cooldownTurns: 0,
          turnedBy: captorId,
          feedsFalseIntel: true,
        },
      },
    },
    ...(captorState
      ? {
        [captorId]: {
          ...captorState,
          detectedThreats: updatedThreats,
        },
      }
      : {}),
  };
}
