// src/systems/espionage-system.ts
import type {
  Spy, SpyMission, SpyMissionType, SpyStatus,
  EspionageCivState, EspionageState, HexCoord, GameState,
  DiplomacyState, Treaty, UnitType,
} from '../core/types';
import type { EventBus } from '../core/event-bus';
import { createRng } from './map-generator'; // Reuse existing seeded RNG
import { hexDistance } from './hex-utils';
import { modifyRelationship } from './diplomacy-system';

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

// --- Tech gating ---

const STAGE_1_TECHS = ['espionage-scouting'];
const STAGE_2_TECHS = ['espionage-informants'];

const STAGE_1_MISSIONS: SpyMissionType[] = ['scout_area', 'monitor_troops'];
const STAGE_2_MISSIONS: SpyMissionType[] = ['gather_intel', 'identify_resources', 'monitor_diplomacy'];

export function getAvailableMissions(completedTechs: string[]): SpyMissionType[] {
  const missions: SpyMissionType[] = [];
  if (STAGE_1_TECHS.some(t => completedTechs.includes(t))) {
    missions.push(...STAGE_1_MISSIONS);
  }
  if (STAGE_2_TECHS.some(t => completedTechs.includes(t))) {
    missions.push(...STAGE_2_MISSIONS);
  }
  return missions;
}

// --- Mission lifecycle ---

export function startMission(
  state: EspionageCivState,
  spyId: string,
  missionType: SpyMissionType,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status !== 'stationed') throw new Error('Spy must be stationed to start a mission');

  const duration = getMissionDuration(missionType);
  const mission: SpyMission = {
    type: missionType,
    turnsRemaining: duration,
    turnsTotal: duration,
    targetCivId: spy.targetCivId!,
    targetCityId: spy.targetCityId!,
  };

  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'on_mission',
        currentMission: mission,
      },
    },
  };
}

// --- Turn events (returned from processSpyTurn for bus emission) ---

export interface SpyTurnEvent {
  type: 'mission_succeeded' | 'mission_failed' | 'spy_expelled' | 'spy_captured' | 'spy_arrived';
  spyId: string;
  missionType?: SpyMissionType;
  result?: Record<string, unknown>;
}

const XP_PER_MISSION: Record<SpyMissionType, number> = {
  scout_area: 5,
  monitor_troops: 5,
  gather_intel: 10,
  identify_resources: 8,
  monitor_diplomacy: 10,
};

const EXPULSION_COOLDOWN = 5;

export function processSpyTurn(
  state: EspionageCivState,
  seed: string,
): { state: EspionageCivState; events: SpyTurnEvent[] } {
  const rng = createRng(seed);
  let newState = { ...state, spies: { ...state.spies } };
  const events: SpyTurnEvent[] = [];

  for (const [spyId, spy] of Object.entries(newState.spies)) {
    let updated = { ...spy };

    if (updated.status === 'captured') {
      newState.spies[spyId] = updated;
      continue;
    }

    if (updated.status === 'cooldown') {
      updated.cooldownTurns -= 1;
      if (updated.cooldownTurns <= 0) {
        updated.status = 'idle';
        updated.cooldownTurns = 0;
      }
      newState.spies[spyId] = updated;
      continue;
    }

    if (updated.status === 'traveling') {
      updated.status = 'stationed';
      events.push({ type: 'spy_arrived', spyId });
      newState.spies[spyId] = updated;
      continue;
    }

    if (updated.status === 'on_mission' && updated.currentMission) {
      const mission = { ...updated.currentMission };
      mission.turnsRemaining -= 1;

      if (mission.turnsRemaining <= 0) {
        // Resolve mission
        const counterIntel = newState.counterIntelligence[mission.targetCityId] ?? 0;
        const successChance = getSpySuccessChance(updated.experience, counterIntel, mission.type);
        const roll = rng();

        if (roll < successChance) {
          // Success
          updated.experience = Math.min(100, updated.experience + XP_PER_MISSION[mission.type]);
          updated.status = 'stationed';
          updated.currentMission = null;
          events.push({
            type: 'mission_succeeded',
            spyId,
            missionType: mission.type,
            result: {},
          });
        } else {
          // Failure — determine expulsion vs capture
          const captureRoll = rng();
          if (captureRoll < 0.3) {
            // Captured
            updated.status = 'captured';
            updated.currentMission = null;
            events.push({ type: 'spy_captured', spyId, missionType: mission.type });
          } else {
            // Expelled
            updated.status = 'cooldown';
            updated.cooldownTurns = EXPULSION_COOLDOWN;
            updated.targetCivId = null;
            updated.targetCityId = null;
            updated.position = null;
            updated.currentMission = null;
            events.push({ type: 'spy_expelled', spyId, missionType: mission.type });
          }
        }
      } else {
        updated.currentMission = mission;
      }

      newState.spies[spyId] = updated;
      continue;
    }

    newState.spies[spyId] = updated;
  }

  return { state: newState, events };
}

// --- Mission result resolution ---

export interface MissionResult {
  // gather_intel
  techProgress?: { completed: string[]; currentResearch: string | null; researchProgress: number };
  treasury?: number;
  treaties?: Treaty[];
  // identify_resources
  resources?: string[];
  // monitor_diplomacy
  relationships?: Record<string, number>;
  tradePartners?: string[];
  // scout_area
  tilesToReveal?: HexCoord[];
  // monitor_troops
  nearbyUnits?: Array<{ type: UnitType; position: HexCoord; health: number }>;
}

const SCOUT_VISION_RADIUS = 3;
const TROOP_MONITOR_RADIUS = 4;

export function resolveMissionResult(
  missionType: SpyMissionType,
  targetCivId: string,
  targetCityId: string,
  gameState: GameState,
): MissionResult {
  const targetCiv = gameState.civilizations[targetCivId];
  const targetCity = gameState.cities[targetCityId];

  switch (missionType) {
    case 'gather_intel': {
      return {
        techProgress: targetCiv ? {
          completed: [...targetCiv.techState.completed],
          currentResearch: targetCiv.techState.currentResearch,
          researchProgress: targetCiv.techState.researchProgress,
        } : undefined,
        treasury: targetCiv?.gold,
        treaties: targetCiv?.diplomacy.treaties
          ? [...targetCiv.diplomacy.treaties]
          : [],
      };
    }

    case 'identify_resources': {
      if (!targetCity) return {};
      const resources: string[] = [];
      for (const tileCoord of targetCity.ownedTiles) {
        const key = `${tileCoord.q},${tileCoord.r}`;
        const tile = gameState.map.tiles[key];
        if (tile?.resource && !resources.includes(tile.resource)) {
          resources.push(tile.resource);
        }
      }
      return { resources };
    }

    case 'monitor_diplomacy': {
      if (!targetCiv) return {};
      const relationships = { ...targetCiv.diplomacy.relationships };
      const tradePartners = targetCiv.diplomacy.treaties
        .filter(t => t.type === 'trade_agreement')
        .map(t => t.civA === targetCivId ? t.civB : t.civA);
      return { relationships, tradePartners };
    }

    case 'scout_area': {
      if (!targetCity) return {};
      const tilesToReveal: HexCoord[] = [];
      for (const key of Object.keys(gameState.map.tiles)) {
        const [q, r] = key.split(',').map(Number);
        if (hexDistance({ q, r }, targetCity.position) <= SCOUT_VISION_RADIUS) {
          tilesToReveal.push({ q, r });
        }
      }
      return { tilesToReveal };
    }

    case 'monitor_troops': {
      if (!targetCity) return {};
      const nearbyUnits: Array<{ type: UnitType; position: HexCoord; health: number }> = [];
      for (const unit of Object.values(gameState.units)) {
        if (unit.owner === targetCivId &&
            hexDistance(unit.position, targetCity.position) <= TROOP_MONITOR_RADIUS) {
          nearbyUnits.push({
            type: unit.type,
            position: { ...unit.position },
            health: unit.health,
          });
        }
      }
      return { nearbyUnits };
    }

    default:
      return {};
  }
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

// --- Top-level turn integration ---

const ESPIONAGE_TECH_MAX_SPIES: Record<string, number> = {
  'espionage-scouting': 1,
  'espionage-informants': 2,
  'spy-networks': 3,
  'cryptography': 4,
  'counter-intelligence': 5,
};

export function initializeEspionage(state: GameState): EspionageState {
  const espionage: EspionageState = {};
  for (const civId of Object.keys(state.civilizations)) {
    const civState = createEspionageCivState();
    // Calculate max spies based on completed espionage techs
    let maxSpies = 0;
    for (const [techId, spyCount] of Object.entries(ESPIONAGE_TECH_MAX_SPIES)) {
      if (state.civilizations[civId].techState.completed.includes(techId)) {
        maxSpies = Math.max(maxSpies, spyCount);
      }
    }
    civState.maxSpies = Math.max(1, maxSpies);
    espionage[civId] = civState;
  }
  return espionage;
}

export function processEspionageTurn(state: GameState, bus: EventBus): GameState {
  if (!state.espionage) return state;

  const turnSeed = `esp-turn-${state.turn}`;

  for (const civId of Object.keys(state.espionage!)) {
    const civEspBefore: EspionageCivState = state.espionage![civId];
    const spyTurnResult = processSpyTurn(civEspBefore, `${turnSeed}-${civId}`);
    const updatedEsp = spyTurnResult.state;
    const events = spyTurnResult.events;
    state.espionage![civId] = updatedEsp;

    // Process events — emit bus events and apply diplomatic consequences
    for (const evt of events) {
      const spy = updatedEsp.spies[evt.spyId];

      switch (evt.type) {
        case 'spy_arrived':
          bus.emit('espionage:spy-arrived', {
            civId, spyId: evt.spyId, targetCityId: spy?.targetCityId ?? '',
          });
          break;

        case 'mission_succeeded': {
          const result = spy?.targetCivId && spy?.targetCityId
            ? resolveMissionResult(evt.missionType!, spy.targetCivId, spy.targetCityId, state)
            : {};

          bus.emit('espionage:mission-succeeded', {
            civId, spyId: evt.spyId, missionType: evt.missionType!,
            result: result as Record<string, unknown>,
          });

          // Apply scout_area results — reveal tiles for spying civ
          if (evt.missionType === 'scout_area' && result.tilesToReveal) {
            for (const coord of result.tilesToReveal) {
              const key = `${coord.q},${coord.r}`;
              if (state.civilizations[civId]?.visibility?.tiles) {
                state.civilizations[civId].visibility.tiles[key] = 'visible';
              }
            }
          }
          break;
        }

        case 'mission_failed':
          bus.emit('espionage:mission-failed', {
            civId, spyId: evt.spyId, missionType: evt.missionType!,
          });
          break;

        case 'spy_expelled': {
          // Note: spy has already been reset by processSpyTurn, so targetCivId is null
          // We need to look at the mission's targetCivId from the event context
          // The spy's original target is in the mission that was active before processing
          const originalSpy = civEspBefore.spies[evt.spyId]; // pre-update spy
          const targetCivId = originalSpy?.targetCivId;
          if (targetCivId && state.civilizations[targetCivId]) {
            // Bilateral update: target civ's view of spy owner
            state.civilizations[targetCivId].diplomacy = handleSpyExpelled(
              state.civilizations[targetCivId].diplomacy, civId, state.turn,
            );
            // Bilateral update: spy owner's view of target civ
            if (state.civilizations[civId]) {
              state.civilizations[civId].diplomacy = modifyRelationship(
                state.civilizations[civId].diplomacy, targetCivId, -5,
              );
            }
          }
          bus.emit('espionage:spy-expelled', {
            civId, spyId: evt.spyId, fromCivId: targetCivId ?? '',
          });
          break;
        }

        case 'spy_captured': {
          const originalSpy = civEspBefore.spies[evt.spyId]; // pre-update spy
          const targetCivId = originalSpy?.targetCivId;
          if (targetCivId && state.civilizations[targetCivId]) {
            // Bilateral update: target civ's view of spy owner
            state.civilizations[targetCivId].diplomacy = handleSpyCaptured(
              state.civilizations[targetCivId].diplomacy, civId, state.turn,
            );
            // Bilateral update: spy owner's view of target civ
            if (state.civilizations[civId]) {
              state.civilizations[civId].diplomacy = modifyRelationship(
                state.civilizations[civId].diplomacy, targetCivId, -10,
              );
            }
          }
          bus.emit('espionage:spy-captured', {
            capturingCivId: targetCivId ?? '', spyOwner: civId, spyId: evt.spyId,
          });
          break;
        }
      }
    }

    // Clean up spies targeting destroyed cities (traveling or on_mission)
    for (const spy of Object.values(state.espionage![civId].spies)) {
      if ((spy.status === 'traveling' || spy.status === 'on_mission') && spy.targetCityId) {
        const targetCity = state.cities[spy.targetCityId];
        if (!targetCity) {
          state.espionage![civId].spies[spy.id] = {
            ...spy,
            status: 'idle',
            targetCivId: null,
            targetCityId: null,
            position: null,
            currentMission: null,
          };
          bus.emit('espionage:spy-recalled', {
            civId, spyId: spy.id, reason: 'city_destroyed',
          });
        }
      }
    }

    // Passive spy abilities: stationed spies passively reveal fog and report troops
    for (const spy of Object.values(state.espionage![civId].spies)) {
      if (spy.status === 'stationed' && spy.targetCivId && spy.targetCityId) {
        const targetCity = state.cities[spy.targetCityId];
        if (!targetCity) {
          // City was destroyed/captured — recall spy to idle
          state.espionage![civId].spies[spy.id] = {
            ...spy,
            status: 'idle',
            targetCivId: null,
            targetCityId: null,
            position: null,
            currentMission: null,
          };
          bus.emit('espionage:spy-recalled', {
            civId, spyId: spy.id, reason: 'city_destroyed',
          });
          continue;
        }

        // Passive fog reveal around stationed city
        const revealRadius = 3;
        for (const key of Object.keys(state.map.tiles)) {
          const [q, r] = key.split(',').map(Number);
          if (hexDistance({ q, r }, targetCity.position) <= revealRadius) {
            if (state.civilizations[civId]?.visibility?.tiles) {
              state.civilizations[civId].visibility.tiles[key] = 'visible';
            }
          }
        }

        // Passive troop monitoring — emit event with units near city
        const nearbyUnits: Array<{ type: string; position: HexCoord }> = [];
        for (const unit of Object.values(state.units)) {
          if (unit.owner === spy.targetCivId &&
              hexDistance(unit.position, targetCity.position) <= 4) {
            nearbyUnits.push({ type: unit.type, position: unit.position });
          }
        }
        if (nearbyUnits.length > 0) {
          bus.emit('espionage:mission-succeeded', {
            civId, spyId: spy.id, missionType: 'monitor_troops' as SpyMissionType,
            result: { nearbyUnits, passive: true } as Record<string, unknown>,
          });
        }
      }
    }

    // Update maxSpies based on current tech
    let maxSpies = 0;
    const civ = state.civilizations[civId];
    if (civ) {
      for (const [techId, spyCount] of Object.entries(ESPIONAGE_TECH_MAX_SPIES)) {
        if (civ.techState.completed.includes(techId)) {
          maxSpies = Math.max(maxSpies, spyCount);
        }
      }
      state.espionage![civId].maxSpies = Math.max(1, maxSpies);
    }
  }

  return state;
}

// Reset the ID counter (for testing)
export function _resetSpyIdCounter(): void {
  nextSpyId = 1;
}
