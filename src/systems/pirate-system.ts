import type { EventBus } from '@/core/event-bus';
import type { CombatResult, GameState, HexCoord, Unit } from '@/core/types';
import type { PirateFactionState } from '@/core/pirate-state';
import { isMajorCivOwner } from '@/core/owner-kind';
import { canUnitAttackTarget } from './attack-targeting';
import { applyCombatOutcomeToState } from './combat-reward-system';
import { resolveCombat } from './combat-system';
import type { PirateEconomyModifiers } from './economy-system';
import { getWrappedHexNeighbors, hexDistance, hexKey, hexNeighbors, wrappedHexDistance } from './hex-utils';
import {
  applyPlannedRelocation,
  choosePirateIntent,
  derivePirateBlockades,
  derivePirateRaids,
  planFlotillaRelocation,
  type PirateRoundFacts,
} from './pirate-behavior';
import { destroyPirateFaction, recordPirateContractRaid, type PirateActionEvent } from './pirate-actions';
import { PIRATE_NOTORIETY } from './pirate-definitions';
import { processPirateEcology } from './pirate-ecology';
import { getMovementStepCost, moveUnit, resetUnitTurn, UNIT_DEFINITIONS } from './unit-system';

export const PIRATE_ROUND_TRACE = [
  'normalize',
  'relocate',
  'reset-move-attack',
  'record-facts',
  'derive-raids-blockades',
  'apply-economy-modifiers',
  'advance-tier-reinforce',
  'pressure-spawn',
  'refresh-intel-events',
] as const;

export type PirateRoundStep = (typeof PIRATE_ROUND_TRACE)[number];

export interface PirateTransitionEvent {
  type: 'activated' | 'raid' | 'blockade' | 'behavior-changed' | 'relocated' | PirateActionEvent['type'];
  factionId: string;
  civId?: string;
  cityId?: string;
  amount?: number;
}

export interface ProcessPiratesResult {
  state: GameState;
  economyModifiers: PirateEconomyModifiers;
  events: PirateTransitionEvent[];
  facts: PirateRoundFacts;
  trace: PirateRoundStep[];
}

function distance(state: GameState, a: HexCoord, b: HexCoord): number {
  return state.map.wrapsHorizontally ? wrappedHexDistance(a, b, state.map.width) : hexDistance(a, b);
}

function neighbors(state: GameState, coord: HexCoord): HexCoord[] {
  return state.map.wrapsHorizontally ? getWrappedHexNeighbors(coord, state.map.width) : hexNeighbors(coord);
}

function normalizeRoundState(state: GameState): { state: GameState; events: PirateTransitionEvent[] } {
  if (!state.pirates) return { state, events: [] };
  let nextState = state;
  const events: PirateTransitionEvent[] = [];
  for (const faction of Object.values(state.pirates.factions)) {
    if (faction.headquarters.kind === 'deep-sea-flotilla' && !state.units[faction.headquarters.flagshipUnitId]) {
      const result = destroyPirateFaction(nextState, {
        factionId: faction.id, destroyedByOwnerId: null, reason: 'missing-flagship',
      });
      nextState = result.state;
      continue;
    }
    const tributeByCiv = Object.fromEntries(Object.entries(faction.tributeByCiv)
      .filter(([, record]) => record.protectedUntilRound > state.turn));
    const employerAlive = faction.contract && nextState.civilizations[faction.contract.employerId]?.cities.length > 0;
    const targetAlive = faction.contract && nextState.civilizations[faction.contract.targetId]?.cities.length > 0;
    const contract = faction.contract && faction.contract.expiresAfterRound > state.turn && employerAlive && targetAlive
      ? faction.contract
      : null;
    const nextFaction = { ...faction, tributeByCiv, contract };
    nextState = {
      ...nextState,
      pirates: {
        ...nextState.pirates!,
        factions: { ...nextState.pirates!.factions, [faction.id]: nextFaction },
      },
    };
  }
  return { state: nextState, events };
}

function targetPosition(state: GameState, faction: PirateFactionState): HexCoord | null {
  const intent = faction.intent;
  if (!intent) return null;
  if (intent.targetUnitId) return state.units[intent.targetUnitId]?.position ?? null;
  if (intent.targetCityId) return state.cities[intent.targetCityId]?.position ?? null;
  return null;
}

function occupiedKeys(state: GameState, excludingId: string): Set<string> {
  return new Set(Object.values(state.units)
    .filter(unit => unit.id !== excludingId && !unit.transportId)
    .map(unit => hexKey(unit.position)));
}

function moveOneStepToward(state: GameState, unit: Unit, target: HexCoord): { state: GameState; path: HexCoord[] } {
  const occupied = occupiedKeys(state, unit.id);
  const candidates = neighbors(state, unit.position)
    .filter(coord => !occupied.has(hexKey(coord)))
    .filter(coord => {
      const terrain = state.map.tiles[hexKey(coord)]?.terrain;
      return terrain === 'coast' || terrain === 'ocean';
    })
    .map(coord => ({ coord, cost: getMovementStepCost(unit, state.map, unit.position, coord) }))
    .filter(candidate => Number.isFinite(candidate.cost) && candidate.cost <= unit.movementPointsLeft)
    .sort((a, b) => distance(state, a.coord, target) - distance(state, b.coord, target)
      || a.coord.q - b.coord.q || a.coord.r - b.coord.r);
  const next = candidates[0];
  if (!next || distance(state, next.coord, target) >= distance(state, unit.position, target)) return { state, path: [] };
  return {
    state: { ...state, units: { ...state.units, [unit.id]: moveUnit(unit, next.coord, next.cost) } },
    path: [next.coord],
  };
}

function attackTarget(
  state: GameState,
  attacker: Unit,
  targetUnitId: string | undefined,
): { state: GameState; result: CombatResult | null; transportKill: PirateRoundFacts['transportKills'][number] | null; events: PirateActionEvent[] } {
  const defender = targetUnitId ? state.units[targetUnitId] : undefined;
  if (!defender || !isMajorCivOwner(defender.owner)) return { state, result: null, transportKill: null, events: [] };
  if (!canUnitAttackTarget(state, attacker, defender.position, { requireVisibility: false }).ok) {
    return { state, result: null, transportKill: null, events: [] };
  }
  const seed = Math.max(1, state.turn * 7919 + attacker.id.length * 97 + defender.id.length);
  const result = resolveCombat(attacker, defender, state.map, seed, undefined, state.era);
  const applied = applyCombatOutcomeToState(state, result, seed);
  const transportKill = !result.defenderSurvived && UNIT_DEFINITIONS[defender.type]?.cargoCapacity !== undefined
    ? { factionId: attacker.owner as `pirate-${number}`, victimCivId: defender.owner, unitId: defender.id }
    : null;
  return { state: applied.state, result, transportKill, events: applied.pirateEvents };
}

function processMovementAndCombat(state: GameState, relocated: Set<string>): {
  state: GameState;
  facts: PirateRoundFacts;
  events: PirateActionEvent[];
} {
  let nextState = state;
  const facts: PirateRoundFacts = { movements: [], attacks: [], transportKills: [] };
  const events: PirateActionEvent[] = [];
  for (const factionId of Object.keys(state.pirates?.factions ?? {}).sort()) {
    let faction = nextState.pirates?.factions[factionId];
    if (!faction) continue;
    const intent = choosePirateIntent(nextState, factionId);
    faction = { ...faction, intent };
    nextState = {
      ...nextState,
      pirates: { ...nextState.pirates!, factions: { ...nextState.pirates!.factions, [factionId]: faction } },
    };
    const target = targetPosition(nextState, faction);
    for (const unitId of [...faction.shipIds].sort()) {
      let unit = nextState.units[unitId];
      if (!unit || relocated.has(unitId)) continue;
      unit = resetUnitTurn(unit);
      nextState = { ...nextState, units: { ...nextState.units, [unitId]: unit } };
      let attack = attackTarget(nextState, unit, intent?.targetUnitId);
      if (attack.result) {
        nextState = attack.state;
        facts.attacks.push(attack.result);
        if (attack.transportKill) facts.transportKills.push(attack.transportKill);
        events.push(...attack.events);
        continue;
      }
      if (target) {
        const from = unit.position;
        const moved = moveOneStepToward(nextState, unit, target);
        nextState = moved.state;
        if (moved.path.length > 0) facts.movements.push({ unitId, from, to: moved.path.at(-1)!, path: moved.path });
      }
      unit = nextState.units[unitId];
      attack = unit ? attackTarget(nextState, unit, intent?.targetUnitId) : attack;
      if (attack.result) {
        nextState = attack.state;
        facts.attacks.push(attack.result);
        if (attack.transportKill) facts.transportKills.push(attack.transportKill);
        events.push(...attack.events);
      }
    }
  }
  return { state: nextState, facts, events };
}

function advanceBehavior(state: GameState, raidFactionIds: Set<string>): {
  state: GameState;
  events: PirateTransitionEvent[];
} {
  if (!state.pirates) return { state, events: [] };
  const factions = { ...state.pirates.factions };
  const events: PirateTransitionEvent[] = [];
  for (const faction of Object.values(factions)) {
    const survival = state.turn > faction.spawnedRound
      && (state.turn - faction.spawnedRound) % PIRATE_NOTORIETY.survivalInterval === 0 ? 1 : 0;
    const notoriety = faction.notoriety + survival + (raidFactionIds.has(faction.id) ? 1 : 0);
    const behavior = notoriety >= PIRATE_NOTORIETY.blockading
      ? 'blockading' as const
      : notoriety >= PIRATE_NOTORIETY.raiding ? 'raiding' as const : 'patrolling' as const;
    factions[faction.id] = { ...faction, notoriety, behavior };
    if (behavior !== faction.behavior) events.push({ type: 'behavior-changed', factionId: faction.id });
  }
  return { state: { ...state, pirates: { ...state.pirates, factions } }, events };
}

export function processPiratesForCompletedRound(state: GameState, bus: EventBus): ProcessPiratesResult {
  const trace = [...PIRATE_ROUND_TRACE];
  const wasActivated = state.pirates?.activatedTurn !== null;
  let normalized = normalizeRoundState(state);
  let nextState = normalized.state;
  const events: PirateTransitionEvent[] = [...normalized.events];
  const relocated = new Set<string>();
  const relocationFacts: PirateRoundFacts['movements'] = [];
  for (const factionId of Object.keys(nextState.pirates?.factions ?? {}).sort()) {
    const faction = nextState.pirates!.factions[factionId];
    if (faction.headquarters.kind !== 'deep-sea-flotilla') continue;
    if (!faction.headquarters.relocation.planned) {
      const plan = planFlotillaRelocation(nextState, factionId);
      if (plan) {
        nextState = {
          ...nextState,
          pirates: {
            ...nextState.pirates!,
            factions: {
              ...nextState.pirates!.factions,
              [factionId]: { ...faction, headquarters: { ...faction.headquarters, relocation: { ...faction.headquarters.relocation, planned: plan } } },
            },
          },
        };
      }
    }
    const result = applyPlannedRelocation(nextState, factionId);
    nextState = result.state;
    for (const movement of result.facts.movements) {
      relocated.add(movement.unitId);
      relocationFacts.push(movement);
    }
    if (result.facts.relocation.status === 'moved') events.push({ type: 'relocated', factionId });
  }
  const processed = processMovementAndCombat(nextState, relocated);
  nextState = processed.state;
  const facts: PirateRoundFacts = {
    movements: [...relocationFacts, ...processed.facts.movements],
    attacks: processed.facts.attacks,
    transportKills: processed.facts.transportKills,
  };
  events.push(...processed.events.map(event => ({ type: event.type, factionId: event.factionId })));
  const raids = derivePirateRaids(nextState, facts);
  const blockades = derivePirateBlockades(nextState);
  const economyModifiers: PirateEconomyModifiers = { plunderByCiv: {}, blockadedCityIds: [] };
  for (const raid of raids) {
    economyModifiers.plunderByCiv[raid.victimCivId] = (economyModifiers.plunderByCiv[raid.victimCivId] ?? 0) + raid.amount;
    events.push({ type: 'raid', factionId: raid.factionId, civId: raid.victimCivId, amount: raid.amount });
    const exposure = recordPirateContractRaid(nextState, raid.factionId, `${state.turn}:${raid.cityId ?? raid.transportUnitId}`);
    nextState = exposure.state;
    events.push(...exposure.events.map(event => ({ type: event.type, factionId: event.factionId })));
  }
  for (const blockade of blockades) {
    economyModifiers.blockadedCityIds.push(blockade.cityId);
    events.push({ type: 'blockade', factionId: blockade.factionId, civId: blockade.victimCivId, cityId: blockade.cityId });
  }
  const advanced = advanceBehavior(nextState, new Set(raids.map(raid => raid.factionId)));
  nextState = advanced.state;
  events.push(...advanced.events);
  nextState = processPirateEcology(nextState, bus, state.gameId ?? 'pirates');
  if (!wasActivated && nextState.pirates?.activatedTurn !== null) events.push({ type: 'activated', factionId: '' });
  return { state: nextState, economyModifiers, events, facts, trace };
}
