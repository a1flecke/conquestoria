// src/systems/espionage-system.ts
import type {
  Spy, SpyMission, SpyMissionType, SpyStatus, SpyPromotion,
  EspionageCivState, EspionageState, HexCoord, GameState,
  DiplomacyState, Treaty, UnitType, AdvisorType,
  CivBonusEffect, DetectedSpyThreat,
} from '../core/types';
import type { EventBus } from '../core/event-bus';
import { createRng } from './map-generator'; // Reuse existing seeded RNG
import { hexDistance } from './hex-utils';
import { modifyRelationship } from './diplomacy-system';
import { createUnit } from './unit-system';
import { resolveCivDefinition } from './civ-registry';
import { applySatelliteSurveillance } from './fog-of-war';

const SPY_NAMES = [
  'Shadow', 'Whisper', 'Ghost', 'Cipher', 'Raven',
  'Viper', 'Falcon', 'Wraith', 'Phantom', 'Specter',
  'Dagger', 'Smoke', 'Shade', 'Flicker', 'Ash',
  'Thorn', 'Mist', 'Echo', 'Blade', 'Ember',
];

let nextSpyId = 1;

// --- Mission difficulty config ---

// counter_espionage is passive (assignSpyDefensive) and not a startable mission
const MISSION_BASE_SUCCESS = {
  scout_area: 0.90,
  monitor_troops: 0.85,
  gather_intel: 0.70,
  identify_resources: 0.75,
  monitor_diplomacy: 0.70,
  steal_tech: 0.50,
  sabotage_production: 0.60,
  incite_unrest: 0.55,
  assassinate_advisor: 0.45,
  forge_documents: 0.55,
  fund_rebels: 0.60,
  arms_smuggling: 0.50,
  cyber_attack: 0.45,
  misinformation_campaign: 0.55,
  election_interference: 0.40,
  satellite_surveillance: 0.70,
} as Record<SpyMissionType, number>;

const MISSION_DURATIONS = {
  scout_area: 1,
  monitor_troops: 2,
  gather_intel: 3,
  identify_resources: 4,
  monitor_diplomacy: 3,
  steal_tech: 6,
  sabotage_production: 4,
  incite_unrest: 5,
  assassinate_advisor: 6,
  forge_documents: 5,
  fund_rebels: 6,
  arms_smuggling: 4,
  cyber_attack: 2,
  misinformation_campaign: 3,
  election_interference: 5,
  satellite_surveillance: 1,
} as Record<SpyMissionType, number>;

// --- State creation ---

export function createEspionageCivState(): EspionageCivState {
  return {
    spies: {},
    maxSpies: 1,
    counterIntelligence: {},
    detectedThreats: {},
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
  promotion?: SpyPromotion,
): number {
  const base = MISSION_BASE_SUCCESS[missionType as keyof typeof MISSION_BASE_SUCCESS] ?? 0.5;
  const expBonus = spyExperience * 0.003;     // +0.3% per XP point, max +30%
  const ciPenalty = counterIntel * 0.004;      // -0.4% per CI point, max -40%

  let promotionBonus = 0;
  if (promotion === 'infiltrator' && INFILTRATOR_MISSIONS.has(missionType)) {
    promotionBonus = 0.10;
  } else if (promotion === 'handler' && HANDLER_MISSIONS.has(missionType)) {
    promotionBonus = 0.10;
  } else if (promotion === 'sentinel') {
    promotionBonus = 0.05;
  }

  return Math.max(0.05, Math.min(0.98, base + expBonus + promotionBonus - ciPenalty));
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
    promotion: undefined,
    promotionAvailable: false,
    feedsFalseIntel: false,
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
const STAGE_3_TECHS = ['spy-networks', 'sabotage'];      // either unlocks stage 3
const STAGE_4_TECHS = ['cryptography', 'counter-intelligence']; // either unlocks stage 4
const STAGE_5_TECHS = ['digital-surveillance', 'cyber-warfare'];

const STAGE_1_MISSIONS: SpyMissionType[] = ['scout_area', 'monitor_troops'];
const STAGE_2_MISSIONS: SpyMissionType[] = ['gather_intel', 'identify_resources', 'monitor_diplomacy'];
const STAGE_3_MISSIONS: SpyMissionType[] = ['steal_tech', 'sabotage_production', 'incite_unrest'];
const STAGE_4_MISSIONS: SpyMissionType[] = ['assassinate_advisor', 'forge_documents', 'fund_rebels', 'arms_smuggling'];
const STAGE_5_MISSIONS: SpyMissionType[] = ['cyber_attack', 'misinformation_campaign', 'election_interference', 'satellite_surveillance'];

export function getAvailableMissions(completedTechs: string[]): SpyMissionType[] {
  const missions: SpyMissionType[] = [];
  if (STAGE_1_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_1_MISSIONS);
  if (STAGE_2_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_2_MISSIONS);
  if (STAGE_3_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_3_MISSIONS);
  if (STAGE_4_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_4_MISSIONS);
  if (STAGE_5_TECHS.some(t => completedTechs.includes(t))) missions.push(...STAGE_5_MISSIONS);
  return missions;
}

export function missionRequiresPlacedSpy(missionType: SpyMissionType): boolean {
  return !['cyber_attack', 'misinformation_campaign', 'satellite_surveillance'].includes(missionType);
}

// --- Mission lifecycle ---

export function startMission(
  state: EspionageCivState,
  spyId: string,
  missionType: SpyMissionType,
  civBonusEffect?: CivBonusEffect,
  targetCivId?: string,
  targetCityId?: string,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (missionRequiresPlacedSpy(missionType)) {
    if (spy.status !== 'stationed') throw new Error('Spy must be stationed to start a mission');
  } else if (!['idle', 'stationed'].includes(spy.status)) {
    throw new Error('Spy must be idle or stationed to start a remote mission');
  }
  const effectiveTargetCivId = targetCivId ?? spy.targetCivId;
  const effectiveTargetCityId = targetCityId ?? spy.targetCityId;
  if (!effectiveTargetCivId || !effectiveTargetCityId) {
    throw new Error('Spy must have a valid target to start a mission');
  }

  let duration = getMissionDuration(missionType);
  if (civBonusEffect?.type === 'espionage_growth') {
    duration = Math.max(1, duration - 1);
  }
  const mission: SpyMission = {
    type: missionType,
    turnsRemaining: duration,
    turnsTotal: duration,
    targetCivId: effectiveTargetCivId,
    targetCityId: effectiveTargetCityId,
  };

  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        targetCivId: effectiveTargetCivId,
        targetCityId: effectiveTargetCityId,
        status: 'on_mission',
        currentMission: mission,
      },
    },
  };
}

// --- Turn events (returned from processSpyTurn for bus emission) ---

export interface SpyTurnEvent {
  type: 'mission_succeeded' | 'mission_failed' | 'spy_expelled' | 'spy_captured' | 'spy_arrived' | 'spy_promoted';
  spyId: string;
  missionType?: SpyMissionType;
  promotion?: SpyPromotion;
  result?: Record<string, unknown>;
}

const PROMOTION_XP_THRESHOLD = 60;

// Mission categories for auto-promotion
const INFILTRATOR_MISSIONS = new Set<SpyMissionType>([
  'steal_tech', 'sabotage_production', 'assassinate_advisor', 'arms_smuggling',
]);
const HANDLER_MISSIONS = new Set<SpyMissionType>([
  'incite_unrest', 'forge_documents', 'fund_rebels', 'monitor_diplomacy',
]);
// Sentinel: everything else (intel, scouting, defensive)

const XP_PER_MISSION = {
  scout_area: 5,
  monitor_troops: 5,
  gather_intel: 10,
  identify_resources: 8,
  monitor_diplomacy: 10,
  steal_tech: 15,
  sabotage_production: 12,
  incite_unrest: 12,
  assassinate_advisor: 18,
  forge_documents: 15,
  fund_rebels: 12,
  arms_smuggling: 12,
  cyber_attack: 16,
  misinformation_campaign: 14,
  election_interference: 16,
  satellite_surveillance: 8,
} as Record<SpyMissionType, number>;

const EXPULSION_COOLDOWN = 5;

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

export function processSpyTurn(
  state: EspionageCivState,
  seed: string,
  xpMultiplier: number = 1,
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
        const successChance = getSpySuccessChance(updated.experience, counterIntel, mission.type, updated.promotion);
        const roll = rng();

        if (roll < successChance) {
          // Success
          updated.experience = Math.min(100, updated.experience + Math.round(XP_PER_MISSION[mission.type] * xpMultiplier));
          updated.status = 'stationed';
          updated.currentMission = null;
          events.push({
            type: 'mission_succeeded',
            spyId,
            missionType: mission.type,
            result: {},
          });
          const afterPromo = checkAndApplyPromotion(updated, mission.type);
          if (afterPromo.promotion && !updated.promotion) {
            updated = afterPromo;
            events.push({ type: 'spy_promoted', spyId, promotion: afterPromo.promotion });
          }
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
  // steal_tech
  stolenTechId?: string;
  // sabotage_production
  productionLost?: number;       // production progress points destroyed
  productionDisabledTurns?: number;
  // incite_unrest / fund_rebels
  unrestInjected?: number;       // spyUnrestBonus amount added
  stabilityPenaltyTurns?: number;
  // assassinate_advisor
  assassinatedAdvisor?: AdvisorType;
  disabledUntilTurn?: number;
  // forge_documents
  forgeCivA?: string;
  forgeCivB?: string;
  forgeRelationshipPenalty?: number;
  // arms_smuggling
  spawnPosition?: HexCoord;
  researchPenaltyTurns?: number;
  researchPenaltyMultiplier?: number;
  grantTerritoryVision?: boolean;
}

const SCOUT_VISION_RADIUS = 3;
const TROOP_MONITOR_RADIUS = 4;

export function resolveMissionResult(
  missionType: SpyMissionType,
  targetCivId: string,
  targetCityId: string,
  gameState: GameState,
  spyingCivId: string,
  spyId: string,
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

    case 'steal_tech': {
      const targetCiv = gameState.civilizations[targetCivId];
      const myCiv = gameState.civilizations[spyingCivId];
      if (!targetCiv || !myCiv) return {};
      const theyHave = targetCiv.techState.completed;
      const iHave = new Set(myCiv.techState.completed);
      const stealable = theyHave.filter(t => !iHave.has(t));
      if (stealable.length === 0) return {};
      const rng = createRng(`steal-${spyId}-${targetCivId}-${targetCityId}-${gameState.turn}`);
      const idx = Math.floor(rng() * stealable.length);
      return { stolenTechId: stealable[idx] };
    }

    case 'sabotage_production': {
      const targetCity = gameState.cities[targetCityId];
      if (!targetCity || targetCity.productionQueue.length === 0) return {};
      const rng = createRng(`sab-${spyId}-${targetCityId}-${gameState.turn}`);
      const lostTurns = 3 + Math.floor(rng() * 3); // 3-5 turns
      const lostProgress = lostTurns * 5; // ~5 production/turn
      return { productionLost: lostProgress };
    }

    case 'incite_unrest': {
      return { unrestInjected: 25 };
    }

    case 'fund_rebels': {
      const targetCity = gameState.cities[targetCityId];
      if (!targetCity || targetCity.unrestLevel === 0) return {};
      return { unrestInjected: 35 };
    }

    case 'counter_espionage': {
      return {}; // passive — handled by assignSpyDefensive
    }

    case 'assassinate_advisor': {
      const advisorTypes: AdvisorType[] = ['builder', 'explorer', 'chancellor', 'warchief', 'treasurer', 'scholar', 'spymaster'];
      const rng = createRng(`assassin-${spyId}-${targetCivId}-${gameState.turn}`);
      const idx = Math.floor(rng() * advisorTypes.length);
      const assassinatedAdvisor = advisorTypes[idx];
      const disabledUntilTurn = gameState.turn + 10;
      return { assassinatedAdvisor, disabledUntilTurn };
    }

    case 'forge_documents': {
      const allCivIds = Object.keys(gameState.civilizations).filter(
        id => id !== targetCivId && id !== spyingCivId,
      );
      if (allCivIds.length < 1) return {};
      const rng = createRng(`forge-${spyId}-${targetCivId}-${gameState.turn}`);
      const idx = Math.floor(rng() * allCivIds.length);
      return { forgeCivA: targetCivId, forgeCivB: allCivIds[idx], forgeRelationshipPenalty: -25 };
    }

    case 'arms_smuggling': {
      const targetCity = gameState.cities[targetCityId];
      if (!targetCity) return {};
      const rng = createRng(`arms-${spyId}-${targetCityId}-${gameState.turn}`);
      const offsets = [
        { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
        { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
      ];
      const offset = offsets[Math.floor(rng() * offsets.length)];
      const spawnPosition: HexCoord = {
        q: targetCity.position.q + offset.q,
        r: targetCity.position.r + offset.r,
      };
      return { spawnPosition };
    }

    case 'cyber_attack': {
      return { productionDisabledTurns: 3 };
    }

    case 'misinformation_campaign': {
      return { researchPenaltyTurns: 10, researchPenaltyMultiplier: 0.2 };
    }

    case 'election_interference': {
      return { stabilityPenaltyTurns: 15, unrestInjected: 20 };
    }

    case 'satellite_surveillance': {
      return { grantTerritoryVision: true };
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

export function turnCapturedSpy(
  state: EspionageState,
  captorId: string,
  spyOwner: string,
  spyId: string,
  turn: number = 0,
): EspionageState {
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

function pruneDetectedThreats(
  state: EspionageCivState,
  turn: number,
): EspionageCivState {
  const detectedThreats = Object.fromEntries(
    Object.entries(state.detectedThreats ?? {})
      .filter(([, threat]) => threat.expiresOnTurn >= turn),
  );

  if (Object.keys(detectedThreats).length === Object.keys(state.detectedThreats ?? {}).length) {
    return state;
  }

  return {
    ...state,
    detectedThreats,
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
    for (const spy of Object.values(state.espionage![civId].spies)) {
      const captorId = spy.targetCivId;
      const captorTechs = captorId ? state.civilizations[captorId]?.techState.completed ?? [] : [];
      const canTurnCapturedSpy = captorTechs.includes('counter-intelligence') || captorTechs.includes('digital-surveillance');
      if (spy.status === 'captured' && !spy.turnedBy && captorId && canTurnCapturedSpy) {
        state.espionage = turnCapturedSpy(state.espionage!, captorId, civId, spy.id, state.turn);
        bus.emit('espionage:spy-detected', {
          detectingCivId: captorId,
          spyOwner: civId,
          spyId: spy.id,
          cityId: spy.targetCityId ?? '',
        });
      }
    }

    state.espionage![civId] = pruneDetectedThreats(state.espionage![civId], state.turn);
    const civEspBefore: EspionageCivState = state.espionage![civId];
    const civBonus = resolveCivDefinition(state, state.civilizations[civId]?.civType ?? '')?.bonusEffect;
    const xpMultiplier = civBonus?.type === 'espionage_growth' ? 1 + civBonus.experienceBonus : 1;
    const spyTurnResult = processSpyTurn(civEspBefore, `${turnSeed}-${civId}`, xpMultiplier);
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
            ? resolveMissionResult(evt.missionType!, spy.targetCivId, spy.targetCityId, state, civId, evt.spyId)
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

          // steal_tech: add the tech to the spying civ
          if (evt.missionType === 'steal_tech' && result.stolenTechId) {
            const stolenId = result.stolenTechId as string;
            if (!state.civilizations[civId].techState.completed.includes(stolenId)) {
              state.civilizations[civId].techState.completed.push(stolenId);
              bus.emit('tech:completed', { civId, techId: stolenId });
            }
          }

          // sabotage_production: reduce target city's production progress
          if (evt.missionType === 'sabotage_production' && result.productionLost) {
            const spyTarget = updatedEsp.spies[evt.spyId];
            if (spyTarget?.targetCityId) {
              const tc = state.cities[spyTarget.targetCityId];
              if (tc) {
                const productionProgress = Math.max(0, tc.productionProgress - (result.productionLost as number));
                const activeLegendaryWonder = tc.productionQueue[0]?.startsWith('legendary:')
                  ? tc.productionQueue[0].slice('legendary:'.length)
                  : null;
                const updatedProjects = activeLegendaryWonder && state.legendaryWonderProjects
                  ? Object.fromEntries(
                    Object.entries(state.legendaryWonderProjects).map(([projectId, project]) => [
                      projectId,
                      project.cityId === tc.id && project.wonderId === activeLegendaryWonder
                        ? { ...project, investedProduction: productionProgress }
                        : project,
                    ]),
                  )
                  : state.legendaryWonderProjects;
                state.cities[spyTarget.targetCityId] = {
                  ...tc,
                  productionProgress,
                };
                if (updatedProjects) {
                  state.legendaryWonderProjects = updatedProjects;
                }
              }
            }
          }

          if (evt.missionType === 'cyber_attack' && result.productionDisabledTurns) {
            const originalSpy = civEspBefore.spies[evt.spyId];
            const targetCity = originalSpy?.targetCityId ? state.cities[originalSpy.targetCityId] : null;
            if (targetCity) {
              state.cities[targetCity.id] = {
                ...targetCity,
                productionDisabledTurns: result.productionDisabledTurns as number,
              };
            }
          }

          if (evt.missionType === 'misinformation_campaign' && result.researchPenaltyTurns && result.researchPenaltyMultiplier !== undefined) {
            const originalSpy = civEspBefore.spies[evt.spyId];
            const targetCiv = originalSpy?.targetCivId ? state.civilizations[originalSpy.targetCivId] : null;
            if (targetCiv) {
              targetCiv.researchPenaltyTurns = result.researchPenaltyTurns as number;
              targetCiv.researchPenaltyMultiplier = result.researchPenaltyMultiplier as number;
            }
          }

          // incite_unrest / fund_rebels: inject spyUnrestBonus
          if ((evt.missionType === 'incite_unrest' || evt.missionType === 'fund_rebels' || evt.missionType === 'election_interference') && result.unrestInjected) {
            const spyTarget = updatedEsp.spies[evt.spyId];
            if (spyTarget?.targetCityId) {
              const tc = state.cities[spyTarget.targetCityId];
              if (tc) {
                state.cities[spyTarget.targetCityId] = {
                  ...tc,
                  spyUnrestBonus: Math.min(50, tc.spyUnrestBonus + (result.unrestInjected as number)),
                };
              }
            }
          }

          if (evt.missionType === 'satellite_surveillance' && result.grantTerritoryVision) {
            const originalSpy = civEspBefore.spies[evt.spyId];
            const targetCivId = originalSpy?.targetCivId;
            if (targetCivId && state.civilizations[civId]) {
              state.civilizations[civId].satelliteSurveillanceTargets = {
                ...state.civilizations[civId].satelliteSurveillanceTargets,
                [targetCivId]: 3,
              };
              state = applySatelliteSurveillance(state, civId, targetCivId);
            }
          }

          // assassinate_advisor: disable an advisor on the target civ
          if (evt.missionType === 'assassinate_advisor' && result.assassinatedAdvisor && result.disabledUntilTurn) {
            const originalSpy = civEspBefore.spies[evt.spyId];
            const targetCiv = state.civilizations[originalSpy?.targetCivId ?? ''];
            if (targetCiv) {
              targetCiv.advisorDisabledUntil = {
                ...targetCiv.advisorDisabledUntil,
                [result.assassinatedAdvisor as AdvisorType]: result.disabledUntilTurn as number,
              };
              bus.emit('espionage:advisor-assassinated', {
                targetCivId: originalSpy?.targetCivId ?? '',
                advisorType: result.assassinatedAdvisor as AdvisorType,
                disabledUntilTurn: result.disabledUntilTurn as number,
              });
            }
          }

          // forge_documents: apply relationship penalty between two civs
          if (evt.missionType === 'forge_documents' && result.forgeCivA && result.forgeCivB) {
            const penalty = (result.forgeRelationshipPenalty as number) ?? -25;
            const civA = result.forgeCivA as string;
            const civB = result.forgeCivB as string;
            if (state.civilizations[civA]) {
              state.civilizations[civA].diplomacy = modifyRelationship(
                state.civilizations[civA].diplomacy, civB, penalty,
              );
            }
            if (state.civilizations[civB]) {
              state.civilizations[civB].diplomacy = modifyRelationship(
                state.civilizations[civB].diplomacy, civA, penalty,
              );
            }
            bus.emit('espionage:documents-forged', {
              civA, civB, relationshipPenalty: penalty,
            });
          }

          // arms_smuggling: spawn a hostile 'rebels' unit near the target city
          if (evt.missionType === 'arms_smuggling' && result.spawnPosition) {
            const pos = result.spawnPosition as HexCoord;
            const key = `${pos.q},${pos.r}`;
            if (state.map.tiles[key]) {
              const hostileUnit = createUnit('warrior', 'rebels', pos);
              state.units[hostileUnit.id] = hostileUnit;
              bus.emit('unit:created', { unit: hostileUnit });
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

        case 'spy_promoted':
          bus.emit('espionage:spy-promoted', {
            civId, spyId: evt.spyId, promotion: evt.promotion!,
          });
          break;

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
            const targetTechs = state.civilizations[targetCivId].techState.completed ?? [];
            if (targetTechs.includes('counter-intelligence') || targetTechs.includes('digital-surveillance')) {
              state.espionage = turnCapturedSpy(state.espionage!, targetCivId, civId, evt.spyId, state.turn);
              bus.emit('espionage:spy-detected', {
                detectingCivId: targetCivId,
                spyOwner: civId,
                spyId: evt.spyId,
                cityId: originalSpy?.targetCityId ?? '',
              });
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

  // Decay spy unrest bonus 5 per turn
  for (const cityId of Object.keys(state.cities)) {
    const city = state.cities[cityId];
    if (city.spyUnrestBonus > 0) {
      state.cities[cityId] = { ...city, spyUnrestBonus: Math.max(0, city.spyUnrestBonus - 5) };
    }
  }

  return state;
}

// Reset the ID counter (for testing)
export function _resetSpyIdCounter(): void {
  nextSpyId = 1;
}
