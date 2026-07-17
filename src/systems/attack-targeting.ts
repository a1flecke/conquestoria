import type { GameMap, GameState, HexCoord, Unit, UnitAttackProfile, UnitType } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { hexDistance, hexKey, hexesInRange, getWrappedHexesInRange, wrappedHexDistance } from '@/systems/hex-utils';
import { selectDefenderForAttack } from '@/systems/combat-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { isBeastConcealedFrom, canUnitAttackBeast } from '@/systems/beast-system';
import { isPirateOwner } from '@/core/owner-kind';
import { isBasedAirUnit } from './air-operations-system';
import { isHostileOwnerTo } from './owner-hostility';

export type AttackTargetFailure =
  | 'missing-attacker'
  | 'no-combat-strength'
  | 'out-of-range'
  | 'not-visible'
  | 'no-target'
  | 'friendly-target'
  | 'not-hostile'
  | 'unsupported-target';

export type AttackTargetResult =
  | { ok: true; targetType: 'unit'; targetUnitId: string; coord: HexCoord; range: number }
  | { ok: true; targetType: 'city'; cityId: string; coord: HexCoord; range: number }
  | { ok: false; reason: AttackTargetFailure };

export interface AttackTargetOptions {
  viewerId?: string;
  requireVisibility?: boolean;
}

export interface AttackTarget {
  coord: HexCoord;
  result: Extract<AttackTargetResult, { ok: true }>;
}

const DEFAULT_ATTACK_PROFILE: UnitAttackProfile = { kind: 'melee', range: 1, targets: ['unit', 'city'] };

export function getUnitAttackProfile(type: UnitType): UnitAttackProfile {
  return UNIT_DEFINITIONS[type].attackProfile ?? DEFAULT_ATTACK_PROFILE;
}

function distanceForMap(map: GameMap, from: HexCoord, to: HexCoord): number {
  return map.wrapsHorizontally
    ? wrappedHexDistance(from, to, map.width)
    : hexDistance(from, to);
}

function isVisibleToViewer(state: GameState, viewerId: string | undefined, coord: HexCoord): boolean {
  if (!viewerId) return true;
  const visibility = state.civilizations[viewerId]?.visibility;
  if (!visibility) return false;
  return getVisibility(visibility, coord) === 'visible';
}

function canAttackOwner(state: GameState, attackerOwner: string, targetOwner: string): boolean {
  return isHostileOwnerTo(state, attackerOwner, targetOwner);
}

function unitAt(state: GameState, attacker: Unit, coord: HexCoord): [string, Unit] | null {
  const targetKey = hexKey(coord);
  const defenders = Object.values(state.units).filter(unit =>
    unit.id !== attacker.id && !isBasedAirUnit(unit) && hexKey(unit.position) === targetKey,
  );
  const defender = selectDefenderForAttack(defenders, state.map);
  return defender ? [defender.id, defender] : null;
}

function cityAt(state: GameState, attacker: Unit, coord: HexCoord): [string, { owner: string; position: HexCoord }] | null {
  const targetKey = hexKey(coord);
  const entry = Object.entries(state.cities).find(([, city]) =>
    city.owner !== attacker.owner && hexKey(city.position) === targetKey,
  );
  return entry ? [entry[0], entry[1]] : null;
}

export function canAttackByProfileOnMap(attacker: Unit, target: Unit, map: GameMap): boolean {
  const profile = getUnitAttackProfile(attacker.type);
  const range = distanceForMap(map, attacker.position, target.position);
  return UNIT_DEFINITIONS[attacker.type].strength > 0
    && profile.targets.includes('unit')
    && range > 0
    && range <= profile.range;
}

export function canUnitAttackTarget(
  state: GameState,
  attacker: Unit | undefined,
  coord: HexCoord,
  options: AttackTargetOptions = {},
): AttackTargetResult {
  if (!attacker) return { ok: false, reason: 'missing-attacker' };
  if (UNIT_DEFINITIONS[attacker.type].strength <= 0) return { ok: false, reason: 'no-combat-strength' };

  const profile = getUnitAttackProfile(attacker.type);
  const range = distanceForMap(state.map, attacker.position, coord);
  if (range > profile.range || range === 0) return { ok: false, reason: 'out-of-range' };

  const requireVisibility = options.requireVisibility ?? Boolean(options.viewerId);
  if (requireVisibility && !isVisibleToViewer(state, options.viewerId, coord)) {
    return { ok: false, reason: 'not-visible' };
  }

  const targetUnit = unitAt(state, attacker, coord);
  if (targetUnit) {
    if (targetUnit[1].owner === attacker.owner) return { ok: false, reason: 'friendly-target' };
    const attackerOwnerUnits = Object.values(state.units).filter(u => u.owner === attacker.owner && !u.transportId);
    if (isBeastConcealedFrom(targetUnit[1], state.map, attackerOwnerUnits)) return { ok: false, reason: 'not-visible' };
    if (!canUnitAttackBeast(attacker, targetUnit[1]).allowed) return { ok: false, reason: 'unsupported-target' };
    if (!canAttackOwner(state, attacker.owner, targetUnit[1].owner)) return { ok: false, reason: 'not-hostile' };
    if (!profile.targets.includes('unit')) return { ok: false, reason: 'unsupported-target' };
    // Stealth bomber: cannot be targeted by ranged attacks unless an enemy signals_hub is within 2 hexes
    if (targetUnit[1].type === 'stealth_bomber' && profile.range > 1) {
      const hubNearby = Object.values(state.cities).some(city => {
        if (city.owner === targetUnit[1].owner) return false;
        if (!city.buildings.includes('signals_hub')) return false;
        return hexDistance(city.position, targetUnit[1].position) <= 2;
      });
      if (!hubNearby) return { ok: false, reason: 'unsupported-target' };
    }
    return { ok: true, targetType: 'unit', targetUnitId: targetUnit[0], coord, range };
  }

  const targetCity = cityAt(state, attacker, coord);
  if (targetCity) {
    if (isPirateOwner(attacker.owner)) return { ok: false, reason: 'unsupported-target' };
    if (!canAttackOwner(state, attacker.owner, targetCity[1].owner)) return { ok: false, reason: 'not-hostile' };
    if (!profile.targets.includes('city')) return { ok: false, reason: 'unsupported-target' };
    return { ok: true, targetType: 'city', cityId: targetCity[0], coord, range };
  }

  return { ok: false, reason: 'no-target' };
}

export function getAttackTargets(
  state: GameState,
  attacker: Unit,
  options: AttackTargetOptions = {},
): AttackTarget[] {
  // A unit that has already acted cannot attack again this turn.
  if (attacker.hasActed) return [];

  const profile = getUnitAttackProfile(attacker.type);
  const candidates = state.map.wrapsHorizontally
    ? getWrappedHexesInRange(attacker.position, profile.range, state.map.width)
    : hexesInRange(attacker.position, profile.range);

  return candidates
    .filter(coord => hexKey(coord) !== hexKey(attacker.position))
    .map(coord => ({ coord, result: canUnitAttackTarget(state, attacker, coord, options) }))
    .filter((target): target is AttackTarget => target.result.ok);
}
