import type { GameState, HexCoord } from '@/core/types';
import { getUnitAttackProfile } from '@/systems/attack-targeting';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { buildUnitOccupancy, getStackRelationship } from '@/systems/unit-occupancy';
import { getMovementRange, getBlockingMapEntityKeys, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getEmbarkedAssaultTarget } from '@/systems/transport-system';
import { hasAllianceTreaty } from '@/systems/diplomacy-system';

export type SelectedUnitTapIntent =
  | { kind: 'move' }
  | { kind: 'assault-city'; cityId: string; embarkedAssault?: boolean }
  | { kind: 'assault-minor-civ'; cityId: string; minorCivId: string }
  | { kind: 'confirm-war-minor-civ'; cityId: string; minorCivId: string }
  | { kind: 'confirm-war-city'; cityId: string; defenderId: string }
  | { kind: 'assault-camp'; campId: string };

function canEnterForeignCityPeacefully(state: GameState, owner: string, targetOwner: string): boolean {
  return hasAllianceTreaty(state, owner, targetOwner);
}

function canReachCityAssault(state: GameState, unitId: string, targetCoord: HexCoord): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  const profile = getUnitAttackProfile(unit.type);
  if (!profile.targets.includes('city')) return false;
  const distance = state.map.wrapsHorizontally
    ? wrappedHexDistance(unit.position, targetCoord, state.map.width)
    : hexDistance(unit.position, targetCoord);
  return distance > 0 && distance <= profile.range;
}

// #845: camps aren't part of attack-targeting.ts's target/profile system (they have no
// defender to fight when undefended -- see beginPlayerCampAssault), so this doesn't reuse
// canReachCityAssault's profile.targets gate. Any strength-capable land unit that is
// literally adjacent can assault a camp, mirroring how any land combat unit can already
// destroy one by killing its garrison.
function canReachCampAssault(state: GameState, unitId: string, targetCoord: HexCoord): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  const definition = UNIT_DEFINITIONS[unit.type];
  if (definition.strength <= 0 || (definition.domain ?? 'land') !== 'land') return false;
  const distance = state.map.wrapsHorizontally
    ? wrappedHexDistance(unit.position, targetCoord, state.map.width)
    : hexDistance(unit.position, targetCoord);
  return distance === 1;
}

export function resolveSelectedUnitTapIntent(
  state: GameState,
  unitId: string,
  targetCoord: HexCoord,
  movementRangeOverride?: readonly HexCoord[],
): SelectedUnitTapIntent {
  const unit = state.units[unitId];
  if (!unit) return { kind: 'move' };

  const movementRange = movementRangeOverride ?? (() => {
    const occupancy = buildUnitOccupancy(state.units);
    const civ = state.civilizations[unit.owner];
    const hostileOwners = new Set<string>(['barbarian', ...(civ?.diplomacy?.atWarWith ?? [])]);
    for (const [mcId, mc] of Object.entries(state.minorCivs)) {
      if (mc.diplomacy?.atWarWith?.includes(unit.owner)) {
        hostileOwners.add(mcId);
      }
    }
    return getMovementRange(
      unit,
      state.map,
      occupancy.unitIdsByHex,
      occupancy.ownersByUnitId,
      hostileOwners,
      { completedTechs: civ?.techState.completed ?? [] },
      getBlockingMapEntityKeys(state, unit),
    );
  })();

  const targetKey = hexKey(targetCoord);
  const embarkedTarget = unit.transportId
    ? getEmbarkedAssaultTarget(state, unitId, targetCoord)
    : undefined;
  const isEmbarkedCityAssault = embarkedTarget?.ok && embarkedTarget.targetType === 'city';
  if (!isEmbarkedCityAssault && !movementRange.some(coord => hexKey(coord) === targetKey)) {
    return { kind: 'move' };
  }

  const occupancy = buildUnitOccupancy(state.units);
  const relationship = getStackRelationship(occupancy, unit, targetCoord);
  if (!isEmbarkedCityAssault && relationship.hasHostileBlocker) {
    return { kind: 'move' };
  }

  const campAtTarget = Object.values(state.barbarianCamps ?? {}).find(camp => hexKey(camp.position) === targetKey);
  if (campAtTarget && unit.owner !== 'barbarian') {
    return canReachCampAssault(state, unitId, targetCoord)
      ? { kind: 'assault-camp', campId: campAtTarget.id }
      : { kind: 'move' };
  }

  const cityAtTarget = Object.values(state.cities).find(city =>
    hexKey(city.position) === targetKey
    && city.owner !== state.currentPlayer,
  );
  if (!cityAtTarget) {
    return { kind: 'move' };
  }

  if (!isEmbarkedCityAssault && !canReachCityAssault(state, unitId, targetCoord)) {
    return { kind: 'move' };
  }

  if (cityAtTarget.owner.startsWith('mc-')) {
    if (!(state.civilizations[unit.owner]?.diplomacy.atWarWith.includes(cityAtTarget.owner) ?? false)) {
      return { kind: 'confirm-war-minor-civ', cityId: cityAtTarget.id, minorCivId: cityAtTarget.owner };
    }
    return { kind: 'assault-minor-civ', cityId: cityAtTarget.id, minorCivId: cityAtTarget.owner };
  }

  if (canEnterForeignCityPeacefully(state, unit.owner, cityAtTarget.owner)) {
    return { kind: 'move' };
  }

  if (!(state.civilizations[unit.owner]?.diplomacy.atWarWith.includes(cityAtTarget.owner) ?? false)) {
    return { kind: 'confirm-war-city', cityId: cityAtTarget.id, defenderId: cityAtTarget.owner };
  }

  return isEmbarkedCityAssault
    ? { kind: 'assault-city', cityId: cityAtTarget.id, embarkedAssault: true }
    : { kind: 'assault-city', cityId: cityAtTarget.id };
}
