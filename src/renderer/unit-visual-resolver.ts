import type { GameState, Unit } from '@/core/types';

export type UnitOwnerRole = 'major' | 'minor' | 'barbarian';
export type UnitRoleMarker = 'chevron' | 'diamond' | null;
export type UnitMotionState = 'idle' | 'move-a' | 'move-b';

const FALLBACK_ICONS: Record<string, string> = {
  settler: '🏕️',
  worker: '👷',
  scout: '🔭',
  warrior: '⚔️',
  archer: '🏹',
  swordsman: '🗡️',
  pikeman: '🔱',
  musketeer: '🔫',
  galley: '⛵',
  trireme: '🚢',
  spy_scout: '🕵️',
  spy_informant: '🕵️',
  spy_agent: '🕵️',
  spy_operative: '🕵️',
  spy_hacker: '💻',
  scout_hound: '🐕',
  shadow_warden: '🦅',
  war_hound: '🐺',
};

export interface UnitVisual {
  role: UnitOwnerRole;
  roleMarker: UnitRoleMarker;
  color: string;
  fallbackIcon: string;
  spriteOwnerId: string;
  motion: UnitMotionState;
}

function getRole(unit: Unit): UnitOwnerRole {
  if (unit.owner === 'barbarian') return 'barbarian';
  if (unit.owner.startsWith('mc-')) return 'minor';
  return 'major';
}

export function resolveUnitVisual(
  state: GameState,
  unit: Unit,
  colorLookup: Record<string, string> = {},
  motion: UnitMotionState = 'idle',
): UnitVisual {
  const role = getRole(unit);
  const color = colorLookup[unit.owner]
    ?? state.civilizations?.[unit.owner]?.color
    ?? (role === 'barbarian' ? '#8b4513' : '#888');
  return {
    role,
    roleMarker: role === 'barbarian' ? 'chevron' : role === 'minor' ? 'diamond' : null,
    color,
    fallbackIcon: FALLBACK_ICONS[unit.type] ?? '?',
    spriteOwnerId: unit.owner,
    motion,
  };
}
