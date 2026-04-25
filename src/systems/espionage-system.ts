// src/systems/espionage-system.ts
import type {
  Spy, SpyMission, SpyMissionType, SpyStatus, SpyPromotion,
  EspionageCivState, EspionageState, HexCoord, GameState,
  DiplomacyState, Treaty, UnitType, AdvisorType,
  CivBonusEffect, DetectedSpyThreat, DisguiseType,
  InterrogationRecord, InterrogationIntel, InterrogationIntelType,
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
    maxSpies: 0,
    counterIntelligence: {},
    detectedThreats: {},
    activeInterrogations: {},
    recentDetections: [],
  };
}

// --- Queries ---

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

const SPY_UNIT_TYPES = new Set<UnitType>([
  'spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_hacker',
]);

export function isSpyUnitType(type: UnitType): boolean {
  return SPY_UNIT_TYPES.has(type);
}

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
  return { state, detectedSpyIds: detected };
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
      const spy = gameState.espionage?.[spyingCivId]?.spies[spyId];
      const alreadyStolen = new Set(spy?.stolenTechFrom?.[targetCivId] ?? []);
      const stealable = theyHave.filter(t => !iHave.has(t) && !alreadyStolen.has(t));
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

export function startInterrogation(
  captorEsp: EspionageCivState,
  spyId: string,
  spyOwner: string,
): EspionageCivState {
  const interrogationId = `interro-${spyId}`;
  const record: InterrogationRecord = {
    id: interrogationId,
    spyId,
    spyOwner,
    turnsRemaining: 4,
    extractedIntel: [],
  };
  return {
    ...captorEsp,
    activeInterrogations: {
      ...(captorEsp.activeInterrogations ?? {}),
      [interrogationId]: record,
    },
  };
}

const INTERROGATION_REVEAL_CHANCES: Record<InterrogationIntelType, number> = {
  spy_identity: 0.60,
  city_location: 0.50,
  production_queue: 0.45,
  wonder_in_progress: 0.35,
  map_area: 0.30,
  tech_hint: 0.08,
};

export function processInterrogation(
  captorEsp: EspionageCivState,
  seed: string,
  gameState: GameState,
): { state: EspionageCivState; complete: boolean; newIntel: InterrogationIntel[] } {
  const rng = createRng(seed);
  const records = { ...(captorEsp.activeInterrogations ?? {}) };
  const allNewIntel: InterrogationIntel[] = [];
  let complete = false;

  for (const [id, record] of Object.entries(records)) {
    const newIntel: InterrogationIntel[] = [];

    for (const [intelType, chance] of Object.entries(INTERROGATION_REVEAL_CHANCES) as [InterrogationIntelType, number][]) {
      if (rng() > chance) continue;
      const intel = resolveInterrogationIntel(intelType, record.spyOwner, gameState, rng);
      if (intel) newIntel.push(intel);
    }

    const updatedRecord: InterrogationRecord = {
      ...record,
      turnsRemaining: record.turnsRemaining - 1,
      extractedIntel: [...record.extractedIntel, ...newIntel],
    };
    allNewIntel.push(...newIntel);

    if (updatedRecord.turnsRemaining <= 0) {
      delete records[id];
      complete = true;
    } else {
      records[id] = updatedRecord;
    }
  }

  return {
    state: { ...captorEsp, activeInterrogations: records },
    complete,
    newIntel: allNewIntel,
  };
}

function resolveInterrogationIntel(
  type: InterrogationIntelType,
  spyOwner: string,
  state: GameState,
  rng: () => number,
): InterrogationIntel | null {
  const spyCiv = state.civilizations?.[spyOwner];
  if (!spyCiv) return null;

  switch (type) {
    case 'spy_identity': {
      const otherSpies = Object.values(state.espionage?.[spyOwner]?.spies ?? {})
        .filter(s => s.status !== 'captured' && s.status !== 'interrogated');
      if (otherSpies.length === 0) return null;
      const spy = otherSpies[Math.floor(rng() * otherSpies.length)];
      return { type, data: { spyId: spy.id, spyName: spy.name, status: spy.status, location: spy.infiltrationCityId ?? null } };
    }
    case 'city_location': {
      const cities = spyCiv.cities.map(id => state.cities?.[id]).filter(Boolean);
      if (cities.length === 0) return null;
      const city = cities[Math.floor(rng() * cities.length)];
      return { type, data: { cityId: city.id, cityName: city.name, position: city.position } };
    }
    case 'production_queue': {
      const cities = spyCiv.cities.map(id => state.cities?.[id]).filter(c => c?.productionQueue.length > 0);
      if (cities.length === 0) return null;
      const city = cities[Math.floor(rng() * cities.length)];
      return { type, data: { cityId: city.id, cityName: city.name, queue: [...city.productionQueue] } };
    }
    case 'wonder_in_progress': {
      const wonderCities = spyCiv.cities.map(id => state.cities?.[id])
        .filter(c => c?.productionQueue[0]?.startsWith('legendary:'));
      if (wonderCities.length === 0) return null;
      const city = wonderCities[Math.floor(rng() * wonderCities.length)];
      return { type, data: { cityId: city.id, wonderId: city.productionQueue[0].replace('legendary:', '') } };
    }
    case 'map_area': {
      const tiles = Object.keys(spyCiv.visibility?.tiles ?? {}).filter(k => spyCiv.visibility.tiles[k] === 'visible');
      if (tiles.length === 0) return null;
      // Fisher-Yates shuffle using seeded rng, then take first 8
      const shuffled = [...tiles];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const sample = shuffled.slice(0, 8).map(k => {
        const [q, r] = k.split(',').map(Number);
        return { q, r };
      });
      return { type, data: { tiles: sample, note: 'Information may be outdated' } };
    }
    case 'tech_hint': {
      const theirTechs = spyCiv.techState.completed;
      if (theirTechs.length === 0) return null;
      const tech = theirTechs[Math.floor(rng() * theirTechs.length)];
      return { type, data: { techId: tech, researchBonus: 0.05 } };
    }
    default: return null;
  }
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
    civState.maxSpies = maxSpies;
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
    let updatedEsp = spyTurnResult.state;
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

          // steal_tech: add the tech to the spying civ and record dedup
          if (evt.missionType === 'steal_tech' && result.stolenTechId) {
            const stolenId = result.stolenTechId as string;
            if (!state.civilizations[civId].techState.completed.includes(stolenId)) {
              state.civilizations[civId].techState.completed.push(stolenId);
              bus.emit('tech:completed', { civId, techId: stolenId });
            }
            const thisSpy = updatedEsp.spies[evt.spyId];
            if (thisSpy?.targetCivId) {
              const prevStolen = thisSpy.stolenTechFrom?.[thisSpy.targetCivId] ?? [];
              updatedEsp = {
                ...updatedEsp,
                spies: {
                  ...updatedEsp.spies,
                  [evt.spyId]: {
                    ...thisSpy,
                    stolenTechFrom: {
                      ...thisSpy.stolenTechFrom,
                      [thisSpy.targetCivId]: [...prevStolen, stolenId],
                    },
                  },
                },
              };
              state.espionage![civId] = updatedEsp;
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
                state = {
                  ...state,
                  cities: { ...state.cities, [spyTarget.targetCityId]: { ...tc, productionProgress } },
                  ...(updatedProjects ? { legendaryWonderProjects: updatedProjects } : {}),
                };
              }
            }
          }

          if (evt.missionType === 'cyber_attack' && result.productionDisabledTurns) {
            const originalSpy = civEspBefore.spies[evt.spyId];
            const targetCity = originalSpy?.targetCityId ? state.cities[originalSpy.targetCityId] : null;
            if (targetCity) {
              state = {
                ...state,
                cities: { ...state.cities, [targetCity.id]: { ...targetCity, productionDisabledTurns: result.productionDisabledTurns as number } },
              };
            }
          }

          if (evt.missionType === 'misinformation_campaign' && result.researchPenaltyTurns && result.researchPenaltyMultiplier !== undefined) {
            const originalSpy = civEspBefore.spies[evt.spyId];
            const targetCiv = originalSpy?.targetCivId ? state.civilizations[originalSpy.targetCivId] : null;
            if (targetCiv) {
              state = {
                ...state,
                civilizations: {
                  ...state.civilizations,
                  [originalSpy!.targetCivId!]: {
                    ...targetCiv,
                    researchPenaltyTurns: result.researchPenaltyTurns as number,
                    researchPenaltyMultiplier: result.researchPenaltyMultiplier as number,
                  },
                },
              };
            }
          }

          // incite_unrest / fund_rebels: inject spyUnrestBonus
          if ((evt.missionType === 'incite_unrest' || evt.missionType === 'fund_rebels' || evt.missionType === 'election_interference') && result.unrestInjected) {
            const spyTarget = updatedEsp.spies[evt.spyId];
            if (spyTarget?.targetCityId) {
              const tc = state.cities[spyTarget.targetCityId];
              if (tc) {
                state = {
                  ...state,
                  cities: { ...state.cities, [spyTarget.targetCityId]: { ...tc, spyUnrestBonus: Math.min(50, tc.spyUnrestBonus + (result.unrestInjected as number)) } },
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
              state = { ...state, units: { ...state.units, [hostileUnit.id]: hostileUnit } };
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

    // Clean up spies targeting destroyed cities (stationed or on_mission)
    for (const spy of Object.values(state.espionage![civId].spies)) {
      if ((spy.status === 'stationed' || spy.status === 'on_mission') && spy.targetCityId) {
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

    // Auto-exfiltrate stationed spies when their infiltration city changes hands or is destroyed.
    // Collect first to avoid mutating while iterating and to guarantee single-fire per turn.
    const toAutoExfil: Array<{ spyId: string; cityId: string }> = [];
    for (const spy of Object.values(state.espionage![civId].spies)) {
      if ((spy.status === 'stationed' || spy.status === 'on_mission') && spy.infiltrationCityId) {
        const infiltCity = state.cities[spy.infiltrationCityId];
        // Trigger when city is gone OR the current owner is no longer the original target civ
        if (!infiltCity || infiltCity.owner !== spy.targetCivId) {
          toAutoExfil.push({ spyId: spy.id, cityId: spy.infiltrationCityId });
        }
      }
    }
    for (const { spyId, cityId } of toAutoExfil) {
      const spy = state.espionage![civId].spies[spyId];
      if (!spy) continue;
      state = {
        ...state,
        espionage: {
          ...state.espionage,
          [civId]: {
            ...state.espionage![civId],
            spies: {
              ...state.espionage![civId].spies,
              [spyId]: { ...spy, status: 'cooldown', cooldownTurns: 5, infiltrationCityId: null, cityVisionTurnsLeft: 0, targetCivId: null },
            },
          },
        },
      };
      bus.emit('espionage:spy-auto-exfiltrated', { civId, spyId, cityId });
    }

    // Passive detection: cooldown spies with infiltrationCityId risk capture based on cooldownMode
    {
      const passiveRng = createRng(`passive-detect-${civId}-${state.turn}`);
      const toCapture: string[] = [];
      for (const spy of Object.values(state.espionage![civId].spies)) {
        if (spy.status !== 'cooldown' || !spy.infiltrationCityId || !spy.targetCivId) continue;
        const ci = state.espionage?.[spy.targetCivId]?.counterIntelligence[spy.infiltrationCityId] ?? 0;
        const baseChance = spy.cooldownMode === 'passive_observe' ? 0.04 : 0.02;
        const detectChance = baseChance + ci * 0.002;
        if (passiveRng() < detectChance) {
          toCapture.push(spy.id);
        }
      }
      for (const spyId of toCapture) {
        const spy = state.espionage![civId].spies[spyId];
        if (!spy) continue;
        const capturedById = spy.targetCivId;
        state = {
          ...state,
          espionage: {
            ...state.espionage,
            [civId]: {
              ...state.espionage![civId],
              spies: {
                ...state.espionage![civId].spies,
                [spyId]: { ...spy, status: 'captured', infiltrationCityId: null, targetCivId: null },
              },
            },
          },
        };
        if (capturedById && state.civilizations[capturedById]) {
          state.civilizations[capturedById].diplomacy = handleSpyCaptured(
            state.civilizations[capturedById].diplomacy, civId, state.turn,
          );
          if (state.civilizations[civId]) {
            state.civilizations[civId].diplomacy = modifyRelationship(
              state.civilizations[civId].diplomacy, capturedById, -10,
            );
          }
          const targetTechs = state.civilizations[capturedById].techState.completed ?? [];
          if (targetTechs.includes('counter-intelligence') || targetTechs.includes('digital-surveillance')) {
            state.espionage = turnCapturedSpy(state.espionage!, capturedById, civId, spyId, state.turn);
            bus.emit('espionage:spy-detected', {
              detectingCivId: capturedById, spyOwner: civId, spyId,
              cityId: spy.infiltrationCityId ?? '',
            });
          }
        }
        bus.emit('espionage:spy-captured', { capturingCivId: capturedById ?? '', spyOwner: civId, spyId });
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
      state = { ...state, espionage: { ...state.espionage!, [civId]: { ...state.espionage![civId], maxSpies } } };
    }
  }

  // Decay spy unrest bonus 5 per turn
  const decayedCities = Object.fromEntries(
    Object.entries(state.cities).map(([cityId, city]) =>
      city.spyUnrestBonus > 0
        ? [cityId, { ...city, spyUnrestBonus: Math.max(0, city.spyUnrestBonus - 5) }]
        : [cityId, city],
    ),
  );
  state = { ...state, cities: decayedCities };

  return state;
}

// ─── Infiltration ────────────────────────────────────────────────────────────

const INFILTRATION_BASE: Partial<Record<UnitType, number>> = {
  spy_scout: 0.55,
  spy_informant: 0.65,
  spy_agent: 0.70,
  spy_operative: 0.75,
  spy_hacker: 0.80,
};

export function getInfiltrationSuccessChance(
  unitType: UnitType,
  experience: number,
  cityCI: number,
): number {
  const base = INFILTRATION_BASE[unitType] ?? 0.50;
  return Math.max(0.10, Math.min(0.90, base + experience * 0.003 - cityCI * 0.004));
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

// Reset the ID counter (for testing)
export function _resetSpyIdCounter(): void {
  nextSpyId = 1;
}
