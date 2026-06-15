import type { GameState, HexCoord, Unit, VisibilityMap } from '@/core/types';
import { PIRATE_OWNER } from '@/systems/threat-pressure-system';
import { selectDefenderForAttack } from '@/systems/combat-system';
import { isForestConcealedUnit } from '@/systems/fog-of-war';
import { getVisibleUnitsForPlayer } from '@/systems/espionage-stealth';
import { getVisibility } from '@/systems/fog-of-war';
import { sortUnitsForStackPicker } from '@/systems/unit-occupancy';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { civTypeToFaction } from './civilization-visual-family';
import { resolveUnitVisual, type UnitRoleMarker } from './unit-visual-resolver';

export const UNIT_DISPLAY_SIZE_FACTOR = 0.9;

export interface UnitLayoutMetrics {
  displaySize: number;
  halfDisplaySize: number;
  depthOffsets: Array<{ x: number; y: number }>;
  countBadge: { x: number; y: number; radius: number };
  roleMarker: { x: number; y: number };
  healthBar: { x: number; y: number; width: number; height: number };
  fortifiedBadge: { x: number; y: number; radius: number };
}

export interface UnitMapPresentation {
  memberIds: string[];
  members: Unit[];
  leadUnitId: string;
  leadUnit: Unit;
  coord: HexCoord;
  stackCount: number;
  faction: string;
  damage: number;
  isSelected: boolean;
  roleMarker: UnitRoleMarker;
  anchorOffsetFactor: { x: number; y: number };
}

function getOwnerGroupOffsetFactor(index: number, count: number): { x: number; y: number } {
  if (count <= 1) return { x: 0, y: 0 };
  if (count === 2) {
    return index === 0 ? { x: -0.2, y: 0.08 } : { x: 0.2, y: -0.08 };
  }
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
  return { x: Math.cos(angle) * 0.2, y: Math.sin(angle) * 0.2 };
}

export function applyUnitAnchorOffset(
  anchor: { x: number; y: number },
  hexSize: number,
  factor: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  return {
    x: anchor.x + factor.x * hexSize,
    y: anchor.y + factor.y * hexSize,
  };
}

export function getUnitLayoutMetrics(hexSize: number): UnitLayoutMetrics {
  const displaySize = hexSize * UNIT_DISPLAY_SIZE_FACTOR;
  return {
    displaySize,
    halfDisplaySize: displaySize / 2,
    depthOffsets: [
      { x: -displaySize * 0.12, y: -displaySize * 0.08 },
      { x: displaySize * 0.12, y: displaySize * 0.08 },
    ],
    countBadge: { x: displaySize * 0.38, y: -displaySize * 0.38, radius: displaySize * 0.16 },
    roleMarker: { x: displaySize * 0.28, y: -displaySize * 0.3 },
    healthBar: {
      x: -displaySize * 0.21,
      y: displaySize * 0.28,
      width: displaySize * 0.42,
      height: displaySize * 0.06,
    },
    fortifiedBadge: { x: -displaySize * 0.34, y: -displaySize * 0.34, radius: displaySize * 0.16 },
  };
}

function chooseLead(state: GameState, viewerId: string, stack: Unit[], selectedUnitId: string | null): Unit {
  if (stack.every(unit => unit.owner === viewerId)) {
    const selected = selectedUnitId ? stack.find(unit => unit.id === selectedUnitId) : undefined;
    return selected ?? sortUnitsForStackPicker(stack)[0];
  }

  const owner = stack[0]?.owner;
  const viewerDiplomacy = state.civilizations[viewerId]?.diplomacy;
  const hostile = owner === 'barbarian'
    || owner === 'beasts'
    || owner === 'rebels'
    || owner === PIRATE_OWNER
    || Boolean(owner && viewerDiplomacy?.atWarWith?.includes(owner));
  if (hostile) return selectDefenderForAttack(stack, state.map) ?? stack[0];
  return [...stack].sort((a, b) => a.id.localeCompare(b.id))[0];
}

function getFaction(state: GameState, ownerId: string): string {
  const civilization = state.civilizations?.[ownerId];
  return civilization ? civTypeToFaction(civilization.civType) : ownerId;
}

function getDamage(unit: Unit): number {
  const strength = UNIT_DEFINITIONS[unit.type]?.strength ?? 0;
  if (strength === 0 || unit.health >= 76) return 0;
  if (unit.health >= 51) return 1;
  if (unit.health >= 26) return 2;
  return 3;
}

export function buildUnitMapPresentations(
  state: GameState,
  viewerId: string,
  viewerVisibility: VisibilityMap,
  movingUnitIds: ReadonlySet<string>,
  selectedUnitId: string | null,
): UnitMapPresentation[] {
  const visible = Object.values(getVisibleUnitsForPlayer(state.units, state, viewerId)).filter(unit =>
    !movingUnitIds.has(unit.id)
    && !unit.transportId
    && getVisibility(viewerVisibility, unit.position) === 'visible'
    && !isForestConcealedUnit(state, viewerId, unit),
  );
  const groups = new Map<string, Unit[]>();
  for (const unit of visible) {
    const key = `${unit.position.q},${unit.position.r}`;
    const group = groups.get(key) ?? [];
    group.push(unit);
    groups.set(key, group);
  }

  return [...groups.values()].flatMap(coLocatedUnits => {
    const ownerGroups = new Map<string, Unit[]>();
    for (const unit of coLocatedUnits) {
      const ownerGroup = ownerGroups.get(unit.owner) ?? [];
      ownerGroup.push(unit);
      ownerGroups.set(unit.owner, ownerGroup);
    }
    const owners = [...ownerGroups.keys()].sort((a, b) => {
      if (a === viewerId) return -1;
      if (b === viewerId) return 1;
      return a.localeCompare(b);
    });

    return owners.map((owner, ownerIndex) => {
      const members = [...ownerGroups.get(owner)!].sort((a, b) => a.id.localeCompare(b.id));
      const leadUnit = chooseLead(state, viewerId, members, selectedUnitId);
      return {
        memberIds: members.map(unit => unit.id),
        members,
        leadUnitId: leadUnit.id,
        leadUnit,
        coord: { ...leadUnit.position },
        stackCount: members.length,
        faction: getFaction(state, leadUnit.owner),
        damage: getDamage(leadUnit),
        isSelected: leadUnit.id === selectedUnitId,
        roleMarker: resolveUnitVisual(state, leadUnit, undefined, 'idle').roleMarker,
        anchorOffsetFactor: getOwnerGroupOffsetFactor(ownerIndex, owners.length),
      };
    });
  });
}
