import type { GameState, HexCoord, Unit } from '@/core/types';
import { appendNotification, createNotificationLog } from '@/core/notification-log';
import { createEmptyPirateState, type PirateFactionState, type PirateHistoryEntry } from '@/core/pirate-state';
import { isMajorCivOwner } from '@/core/owner-kind';
import { calculateCivEconomy } from './economy-system';
import { modifyRelationship } from './diplomacy-system';
import { getWrappedHexNeighbors, hexDistance, hexKey, hexNeighbors, wrappedHexDistance } from './hex-utils';
import { applyRegionalSuppression } from './pirate-ecology';
import { PIRATE_ACTION_RULES, getPirateBounty, getPirateTributeCost } from './pirate-definitions';
import { UNIT_DEFINITIONS } from './unit-system';

export interface PirateActionQuote {
  available: boolean;
  reason: string | null;
  cost: number;
  durationRounds?: number;
}

export type PirateActionEvent =
  | { type: 'tribute-paid'; factionId: string; civId: string; cost: number }
  | { type: 'contract-accepted'; factionId: string; employerId: string; targetId: string; cost: number }
  | { type: 'contract-exposed'; factionId: string; employerId: string; targetId: string }
  | { type: 'enclave-assaulted'; factionId: string; unitId: string; damage: number; counterfireDamage: number }
  | { type: 'faction-destroyed'; factionId: string; destroyedByOwnerId: string | null; bountyAwarded: number };

export interface PirateActionResult {
  success: boolean;
  state: GameState;
  reason: string | null;
  cost?: number;
  damageToHeadquarters?: number;
  counterfireDamage?: number;
  destroyed?: boolean;
  events: PirateActionEvent[];
}

export interface PirateDemandRefreshResult {
  state: GameState;
  created: boolean;
  reminderDue: boolean;
  reason: string | null;
}

export interface PirateContractRaidResult {
  state: GameState;
  exposed: boolean;
  events: PirateActionEvent[];
}

export interface PirateAssaultPreview {
  available: boolean;
  reason: string | null;
  damageToHeadquarters: number;
  counterfireDamage: number;
  integrityAfter: number;
  attackerHealthAfter: number;
  bounty: number;
}

export interface DestroyPirateFactionInput {
  factionId: string;
  destroyedByOwnerId: string | null;
  reason: Extract<PirateHistoryEntry, { kind: 'destroyed' }>['reason'];
  position?: HexCoord;
}

export interface PirateDestructionResult {
  state: GameState;
  destroyed: boolean;
  bountyAwarded: number;
  events: PirateActionEvent[];
}

function failure(state: GameState, reason: string, cost?: number): PirateActionResult {
  return { success: false, state, reason, ...(cost === undefined ? {} : { cost }), events: [] };
}

function distance(state: GameState, a: HexCoord, b: HexCoord): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(a, b, state.map.width)
    : hexDistance(a, b);
}

function neighbors(state: GameState, coord: HexCoord): HexCoord[] {
  return state.map.wrapsHorizontally ? getWrappedHexNeighbors(coord, state.map.width) : hexNeighbors(coord);
}

function isWater(state: GameState, coord: HexCoord): boolean {
  const terrain = state.map.tiles[hexKey(coord)]?.terrain;
  return terrain === 'coast' || terrain === 'ocean';
}

function isCoastalCity(state: GameState, cityId: string): boolean {
  const city = state.cities[cityId];
  return Boolean(city && neighbors(state, city.position).some(coord => isWater(state, coord)));
}

function cloneForNotification(state: GameState): GameState {
  const notificationLog = Object.fromEntries(
    Object.entries(state.notificationLog ?? createNotificationLog()).map(([civId, entries]) => [civId, [...entries]]),
  );
  return { ...state, notificationLog, idCounters: { ...state.idCounters } };
}

function addNotification(
  state: GameState,
  civId: string,
  message: string,
  type: 'info' | 'success' | 'warning',
  review: { kind: 'pirate-faction'; factionId: string } | { kind: 'pirate-history'; historyId: string },
): GameState {
  const next = cloneForNotification(state);
  appendNotification(next, civId, { message, type, turn: state.turn, review });
  return next;
}

function activeTribute(faction: PirateFactionState, civId: string, round: number): boolean {
  return (faction.tributeByCiv[civId]?.protectedUntilRound ?? 0) > round;
}

export function getPirateTributeQuote(state: GameState, factionId: string, civId: string): PirateActionQuote {
  const faction = state.pirates?.factions[factionId];
  const civ = state.civilizations[civId];
  const cost = faction ? getPirateTributeCost(faction.behavior, faction.maritimeStage) : 0;
  if (!faction) return { available: false, reason: 'Pirate faction no longer exists.', cost };
  if (!civ) return { available: false, reason: 'Civilization no longer exists.', cost };
  if (faction.contract) return { available: false, reason: 'This faction is already under contract.', cost };
  if (activeTribute(faction, civId, state.turn)) return { available: false, reason: 'Tribute protection is already active.', cost };
  if (!faction.demandByCiv[civId]) return { available: false, reason: 'This faction has not demanded tribute.', cost };
  if (civ.gold < cost) return { available: false, reason: `Requires ${cost} gold without creating debt.`, cost };
  return { available: true, reason: null, cost, durationRounds: PIRATE_ACTION_RULES.tributeDurationRounds };
}

export function payPirateTribute(state: GameState, factionId: string, civId: string): PirateActionResult {
  const quote = getPirateTributeQuote(state, factionId, civId);
  if (!quote.available) return failure(state, quote.reason ?? 'Tribute is unavailable.', quote.cost);
  const pirates = state.pirates!;
  const faction = pirates.factions[factionId];
  const civ = state.civilizations[civId];
  const demandByCiv = { ...faction.demandByCiv };
  delete demandByCiv[civId];
  const intent = faction.intent?.targetCivId === civId ? null : faction.intent;
  const nextFaction: PirateFactionState = {
    ...faction,
    demandByCiv,
    intent,
    tributeByCiv: {
      ...faction.tributeByCiv,
      [civId]: { paidRound: state.turn, protectedUntilRound: state.turn + PIRATE_ACTION_RULES.tributeDurationRounds },
    },
  };
  return {
    success: true,
    state: {
      ...state,
      civilizations: { ...state.civilizations, [civId]: { ...civ, gold: civ.gold - quote.cost } },
      pirates: { ...pirates, factions: { ...pirates.factions, [factionId]: nextFaction } },
    },
    reason: null,
    cost: quote.cost,
    events: [{ type: 'tribute-paid', factionId, civId, cost: quote.cost }],
  };
}

export function breakPirateTributeOnAttack(state: GameState, factionId: string, attackerOwnerId: string): GameState {
  const faction = state.pirates?.factions[factionId];
  if (!faction?.tributeByCiv[attackerOwnerId]) return state;
  const tributeByCiv = { ...faction.tributeByCiv };
  delete tributeByCiv[attackerOwnerId];
  return {
    ...state,
    pirates: {
      ...state.pirates!,
      factions: { ...state.pirates!.factions, [factionId]: { ...faction, tributeByCiv } },
    },
  };
}

export function refreshPirateTributeDemand(
  state: GameState,
  factionId: string,
  civId: string,
): PirateDemandRefreshResult {
  const faction = state.pirates?.factions[factionId];
  if (!faction || !state.civilizations[civId]) {
    return { state, created: false, reminderDue: false, reason: 'Faction or civilization is unavailable.' };
  }
  if (faction.contract || activeTribute(faction, civId, state.turn)) {
    return { state, created: false, reminderDue: false, reason: 'Tribute cannot be demanded now.' };
  }
  const existing = faction.demandByCiv[civId];
  if (!existing && calculateCivEconomy(state, civId).netGoldPerTurn <= 0) {
    return { state, created: false, reminderDue: false, reason: 'Projected income is not positive.' };
  }
  const lastReminder = existing?.lastReminderRound ?? existing?.demandedRound;
  if (existing && lastReminder !== undefined && state.turn - lastReminder < PIRATE_ACTION_RULES.demandReminderRounds) {
    return { state, created: false, reminderDue: false, reason: null };
  }
  const record = existing
    ? { ...existing, lastReminderRound: state.turn }
    : {
        demandedRound: state.turn,
        lastReminderRound: state.turn,
        quotedCost: getPirateTributeCost(faction.behavior, faction.maritimeStage),
      };
  return {
    state: {
      ...state,
      pirates: {
        ...state.pirates!,
        factions: {
          ...state.pirates!.factions,
          [factionId]: { ...faction, demandByCiv: { ...faction.demandByCiv, [civId]: record } },
        },
      },
    },
    created: !existing,
    reminderDue: true,
    reason: null,
  };
}

function hasEarnedTargetSighting(state: GameState, employerId: string, targetId: string): boolean {
  const employer = state.civilizations[employerId];
  if (!employer || !(targetId in employer.diplomacy.relationships)) return false;
  const visibility = employer.visibility;
  const knownCoastalCity = Object.values(state.cities).some(city => {
    if (city.owner !== targetId || !isCoastalCity(state, city.id)) return false;
    const tileState = visibility.tiles[hexKey(city.position)] ?? 'unexplored';
    return tileState !== 'unexplored'
      || visibility.lastSeen?.[hexKey(city.position)]?.city?.owner === targetId;
  });
  if (knownCoastalCity) return true;
  return Object.values(state.units).some(unit =>
    unit.owner === targetId
    && UNIT_DEFINITIONS[unit.type]?.domain === 'naval'
    && visibility.tiles[hexKey(unit.position)] === 'visible',
  );
}

export function getPirateContractQuote(
  state: GameState,
  factionId: string,
  employerId: string,
  targetId: string,
): PirateActionQuote {
  const faction = state.pirates?.factions[factionId];
  const cost = faction
    ? getPirateTributeCost(faction.behavior, faction.maritimeStage) * PIRATE_ACTION_RULES.contractCostMultiplier
    : 0;
  const unavailable = (reason: string): PirateActionQuote => ({ available: false, reason, cost, durationRounds: PIRATE_ACTION_RULES.contractDurationRounds });
  if (!faction) return unavailable('Pirate faction no longer exists.');
  if (faction.maritimeStage !== 5 || faction.headquarters.kind !== 'deep-sea-flotilla') {
    return unavailable('Only final-era deep-sea flotillas can be hired.');
  }
  if (faction.contract) return unavailable('This flotilla is already under contract.');
  if (Object.values(faction.tributeByCiv).some(record => record.protectedUntilRound > state.turn)) {
    return unavailable('Active tribute protection prevents hiring this faction.');
  }
  const employer = state.civilizations[employerId];
  const target = state.civilizations[targetId];
  if (!employer || !target || employerId === targetId) return unavailable('Select another living major civilization.');
  if (!target.cities.some(cityId => state.cities[cityId]?.owner === targetId)) return unavailable('The selected rival has been eliminated.');
  if (!hasEarnedTargetSighting(state, employerId, targetId)) return unavailable('No known coastal city or naval unit for that rival.');
  if (employer.gold < cost) return unavailable(`Requires ${cost} gold without creating debt.`);
  return { available: true, reason: null, cost, durationRounds: PIRATE_ACTION_RULES.contractDurationRounds };
}

export function hirePirateFlotilla(
  state: GameState,
  factionId: string,
  employerId: string,
  targetId: string,
): PirateActionResult {
  const quote = getPirateContractQuote(state, factionId, employerId, targetId);
  if (!quote.available) return failure(state, quote.reason ?? 'Contract is unavailable.', quote.cost);
  const pirates = state.pirates!;
  const faction = pirates.factions[factionId];
  const employer = state.civilizations[employerId];
  const contract = {
    employerId,
    targetId,
    startedRound: state.turn,
    expiresAfterRound: state.turn + PIRATE_ACTION_RULES.contractDurationRounds,
    successfulRaidCount: 0,
    exposed: false,
    exposureResolvedRaidKeys: [],
  };
  return {
    success: true,
    state: {
      ...state,
      civilizations: { ...state.civilizations, [employerId]: { ...employer, gold: employer.gold - quote.cost } },
      pirates: { ...pirates, factions: { ...pirates.factions, [factionId]: { ...faction, contract, intent: null } } },
    },
    reason: null,
    cost: quote.cost,
    events: [{ type: 'contract-accepted', factionId, employerId, targetId, cost: quote.cost }],
  };
}

function deterministicRoll(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  hash += 0x6D2B79F5;
  let value = hash;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}

export function recordPirateContractRaid(
  state: GameState,
  factionId: string,
  raidKey: string,
): PirateContractRaidResult {
  const faction = state.pirates?.factions[factionId];
  const contract = faction?.contract;
  if (!faction || !contract || contract.exposureResolvedRaidKeys.includes(raidKey)) {
    return { state, exposed: false, events: [] };
  }
  const exposed = !contract.exposed && deterministicRoll(`${state.gameId}:${state.turn}:${factionId}:${raidKey}`)
    < PIRATE_ACTION_RULES.contractExposureChance;
  const nextContract = {
    ...contract,
    successfulRaidCount: contract.successfulRaidCount + 1,
    exposed: contract.exposed || exposed,
    exposureResolvedRaidKeys: [...contract.exposureResolvedRaidKeys, raidKey],
  };
  let nextState: GameState = {
    ...state,
    pirates: {
      ...state.pirates!,
      factions: { ...state.pirates!.factions, [factionId]: { ...faction, contract: nextContract } },
    },
  };
  if (!exposed) return { state: nextState, exposed: false, events: [] };
  const target = nextState.civilizations[contract.targetId];
  if (target) {
    const relationship = modifyRelationship(
      target.diplomacy,
      contract.employerId,
      PIRATE_ACTION_RULES.contractExposureRelationshipPenalty,
    );
    nextState = {
      ...nextState,
      civilizations: {
        ...nextState.civilizations,
        [contract.targetId]: {
          ...target,
          diplomacy: {
            ...relationship,
            events: [...relationship.events, {
              type: 'pirate_contract_exposed', turn: state.turn,
              otherCiv: contract.employerId, weight: PIRATE_ACTION_RULES.contractExposureRelationshipPenalty,
            }],
          },
        },
      },
    };
  }
  nextState = addNotification(
    nextState,
    contract.targetId,
    `${faction.name}'s employer has been exposed as ${nextState.civilizations[contract.employerId]?.name ?? contract.employerId}.`,
    'warning',
    { kind: 'pirate-faction', factionId },
  );
  nextState = addNotification(
    nextState,
    contract.employerId,
    `Your contract with ${faction.name} has been exposed.`,
    'warning',
    { kind: 'pirate-faction', factionId },
  );
  return {
    state: nextState,
    exposed: true,
    events: [{ type: 'contract-exposed', factionId, employerId: contract.employerId, targetId: contract.targetId }],
  };
}

function assaultUnavailable(reason: string): PirateAssaultPreview {
  return {
    available: false, reason, damageToHeadquarters: 0, counterfireDamage: 0,
    integrityAfter: 0, attackerHealthAfter: 0, bounty: 0,
  };
}

function isExposedEnclave(state: GameState, faction: PirateFactionState): boolean {
  if (faction.headquarters.kind !== 'coastal-enclave') return false;
  const enclavePosition = faction.headquarters.position;
  return !faction.shipIds.some(unitId => {
    const unit = state.units[unitId];
    return unit && unit.health > 0 && !unit.transportId
      && distance(state, unit.position, enclavePosition) <= 1;
  });
}

export function getEnclaveAssaultPreview(state: GameState, factionId: string, unitId: string): PirateAssaultPreview {
  const faction = state.pirates?.factions[factionId];
  const unit = state.units[unitId];
  if (!faction) return assaultUnavailable('Pirate faction no longer exists.');
  if (faction.headquarters.kind !== 'coastal-enclave') return assaultUnavailable('This faction has no coastal enclave.');
  if (!isExposedEnclave(state, faction)) return assaultUnavailable('Clear the enclave defenders first.');
  if (!unit || !state.civilizations[unit.owner] || !isMajorCivOwner(unit.owner)) return assaultUnavailable('Select a major-civilization naval unit.');
  const definition = UNIT_DEFINITIONS[unit.type];
  if (definition?.domain !== 'naval' || definition.strength <= 0) return assaultUnavailable('A combat-capable naval unit is required.');
  if (unit.transportId || !isWater(state, unit.position) || distance(state, unit.position, faction.headquarters.position) !== 1) {
    return assaultUnavailable('The naval unit must be on adjacent water.');
  }
  if (unit.hasActed) return assaultUnavailable('The naval unit has already spent its action.');
  const profile = PIRATE_ACTION_RULES.enclaveAssault;
  const rawDamage = Math.min(profile.maximumDamage, profile.baseDamage + Math.floor(definition.strength / profile.strengthDivisor));
  const damageToHeadquarters = Math.min(faction.headquarters.integrity, rawDamage);
  const counterfireDamage = profile.counterfireByBehavior[faction.behavior];
  return {
    available: true,
    reason: null,
    damageToHeadquarters,
    counterfireDamage,
    integrityAfter: Math.max(0, faction.headquarters.integrity - damageToHeadquarters),
    attackerHealthAfter: Math.max(0, unit.health - counterfireDamage),
    bounty: getPirateBounty(faction.behavior, faction.maritimeStage),
  };
}

function removeUnits(state: GameState, unitIds: Set<string>): GameState {
  const expanded = new Set(unitIds);
  for (const unitId of unitIds) {
    for (const cargoId of state.units[unitId]?.cargoUnitIds ?? []) expanded.add(cargoId);
  }
  const units = Object.fromEntries(Object.entries(state.units).filter(([unitId, unit]) =>
    !expanded.has(unitId) && !(unit.transportId && expanded.has(unit.transportId)),
  ));
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => [civId, {
    ...civ,
    units: civ.units.filter(unitId => !expanded.has(unitId)),
  }]));
  return { ...state, units, civilizations };
}

export function destroyPirateFaction(state: GameState, input: DestroyPirateFactionInput): PirateDestructionResult {
  const pirates = state.pirates ?? createEmptyPirateState();
  const faction = pirates.factions[input.factionId];
  if (!faction || pirates.history.some(entry => entry.kind === 'destroyed' && entry.factionId === input.factionId)) {
    return { state, destroyed: false, bountyAwarded: 0, events: [] };
  }
  const headquartersPosition = input.position ?? (faction.headquarters.kind === 'coastal-enclave'
    ? faction.headquarters.position
    : state.units[faction.headquarters.flagshipUnitId]?.position);
  const majorDestroyer = input.destroyedByOwnerId
    && isMajorCivOwner(input.destroyedByOwnerId)
    && state.civilizations[input.destroyedByOwnerId]
    ? input.destroyedByOwnerId
    : null;
  const bountyAwarded = majorDestroyer ? getPirateBounty(faction.behavior, faction.maritimeStage) : 0;
  const historyId = `pirate-history-destroyed-${faction.id}`;
  const destroyedEntry: PirateHistoryEntry = {
    id: historyId,
    kind: 'destroyed',
    factionId: faction.id,
    factionName: faction.name,
    round: state.turn,
    headquartersKind: faction.headquarters.kind,
    ...(headquartersPosition ? { lastKnownPosition: headquartersPosition } : {}),
    destroyedByOwnerId: majorDestroyer,
    bountyAwarded,
    reason: input.reason,
  };
  const contractEntry: PirateHistoryEntry[] = faction.contract ? [{
    id: `pirate-history-contract-${faction.id}-${faction.contract.startedRound}`,
    kind: 'contract-resolved',
    factionId: faction.id,
    factionName: faction.name,
    round: state.turn,
    employerId: faction.contract.employerId,
    targetId: faction.contract.targetId,
    exposed: faction.contract.exposed,
    successfulRaidCount: faction.contract.successfulRaidCount,
    outcome: 'faction-destroyed',
  }] : [];
  const knownViewers = new Set([
    ...Object.entries(pirates.intelByCiv)
      .filter(([, intel]) => Boolean(intel[faction.id]))
      .map(([civId]) => civId),
    ...(majorDestroyer ? [majorDestroyer] : []),
  ]);
  const factions = { ...pirates.factions };
  delete factions[faction.id];
  const intelByCiv = Object.fromEntries(Object.entries(pirates.intelByCiv).map(([civId, intel]) => {
    const nextIntel = { ...intel };
    delete nextIntel[faction.id];
    return [civId, nextIntel];
  }));
  const unitIds = new Set(faction.shipIds);
  if (faction.headquarters.kind === 'deep-sea-flotilla') unitIds.add(faction.headquarters.flagshipUnitId);
  let nextState = removeUnits(state, unitIds);
  nextState = {
    ...nextState,
    civilizations: majorDestroyer ? {
      ...nextState.civilizations,
      [majorDestroyer]: {
        ...nextState.civilizations[majorDestroyer],
        gold: nextState.civilizations[majorDestroyer].gold + bountyAwarded,
      },
    } : nextState.civilizations,
    pirates: { ...pirates, factions, intelByCiv, history: [...pirates.history, ...contractEntry, destroyedEntry] },
  };
  if (headquartersPosition) nextState = applyRegionalSuppression(nextState, headquartersPosition, state.turn);
  for (const civId of knownViewers) {
    nextState = addNotification(
      nextState,
      civId,
      `${faction.name} has been destroyed${bountyAwarded > 0 && civId === majorDestroyer ? `; bounty: ${bountyAwarded} gold.` : '.'}`,
      'success',
      { kind: 'pirate-history', historyId },
    );
  }
  return {
    state: nextState,
    destroyed: true,
    bountyAwarded,
    events: [{ type: 'faction-destroyed', factionId: faction.id, destroyedByOwnerId: majorDestroyer, bountyAwarded }],
  };
}

export function assaultPirateEnclave(state: GameState, factionId: string, unitId: string): PirateActionResult {
  const preview = getEnclaveAssaultPreview(state, factionId, unitId);
  if (!preview.available) return failure(state, preview.reason ?? 'Enclave assault is unavailable.');
  const faction = state.pirates!.factions[factionId];
  const headquarters = faction.headquarters;
  if (headquarters.kind !== 'coastal-enclave') return failure(state, 'This faction has no coastal enclave.');
  const attacker = state.units[unitId];
  const attackerHealth = Math.max(0, attacker.health - preview.counterfireDamage);
  const units = { ...state.units };
  const civilizations = { ...state.civilizations };
  if (attackerHealth > 0) {
    units[unitId] = { ...attacker, health: attackerHealth, movementPointsLeft: 0, hasMoved: true, hasActed: true };
  } else {
    delete units[unitId];
    civilizations[attacker.owner] = {
      ...civilizations[attacker.owner],
      units: civilizations[attacker.owner].units.filter(id => id !== unitId),
    };
  }
  const nextHeadquarters = { ...headquarters, integrity: preview.integrityAfter };
  let nextState: GameState = {
    ...state,
    units,
    civilizations,
    pirates: {
      ...state.pirates!,
      factions: {
        ...state.pirates!.factions,
        [factionId]: { ...faction, headquarters: nextHeadquarters },
      },
    },
  };
  const assaultEvent: PirateActionEvent = {
    type: 'enclave-assaulted', factionId, unitId,
    damage: preview.damageToHeadquarters, counterfireDamage: preview.counterfireDamage,
  };
  if (preview.integrityAfter > 0) {
    return {
      success: true, state: nextState, reason: null,
      damageToHeadquarters: preview.damageToHeadquarters,
      counterfireDamage: preview.counterfireDamage,
      destroyed: false,
      events: [assaultEvent],
    };
  }
  const destruction = destroyPirateFaction(nextState, {
    factionId,
    destroyedByOwnerId: attacker.owner,
    reason: 'enclave-assault',
    position: headquarters.position,
  });
  nextState = destruction.state;
  return {
    success: true, state: nextState, reason: null,
    damageToHeadquarters: preview.damageToHeadquarters,
    counterfireDamage: preview.counterfireDamage,
    destroyed: destruction.destroyed,
    events: [assaultEvent, ...destruction.events],
  };
}
