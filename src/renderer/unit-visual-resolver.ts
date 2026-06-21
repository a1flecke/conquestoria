import type { GameState, Unit, UnitType } from '@/core/types';
import { classifyOwner, type OwnerKind } from '@/core/owner-kind';

export type UnitOwnerRole = OwnerKind;
export type UnitRoleMarker = 'chevron' | 'diamond' | null;
export type UnitMotionState = 'idle' | 'move-a' | 'move-b';

const FALLBACK_ICONS: Record<UnitType, string> = {
  settler: '🏕️',
  worker: '👷',
  scout: '🔭',
  warrior: '⚔️',
  archer: '🏹',
  swordsman: '🗡️',
  pikeman: '🔱',
  musketeer: '🔫',
  // S4b units
  axeman: '🪓',
  spearman: '🏹',
  horseman: '🐴',
  cavalry: '⚔️',
  knight: '🛡️',
  crossbowman: '🏹',
  catapult: '💥',
  ballista: '🎯',
  cannon:   '💣',
  grenadier: '🧨',
  rifleman:       '🎯',
  ironclad:       '⚓',
  machine_gunner: '🔫',
  pre_dreadnought: '🚢',
  tank:       '🛡️',
  submarine:  '🌊',
  galley: '⛵',
  trireme: '🚢',
  transport: '🛶',
  carrack: '⛵',
  galleon: '🚢',
  steamship: '🚢',
  troop_transport: '🛳️',
  pirate_galley: '☠️',
  pirate_corsair: '🏴',
  pirate_frigate: '🏴',
  pirate_ironclad: '⚙️',
  pirate_fast_attack_craft: '💨',
  pirate_mothership: '📡',
  spy_scout: '🕵️',
  spy_informant: '🕵️',
  spy_agent: '🕵️',
  spy_operative: '🕵️',
  spy_hacker: '💻',
  scout_hound: '🐕',
  shadow_warden: '🦅',
  war_hound: '🐺',
  // S5 — trade unit
  caravan: '🐪',
  // Resource Accessibility MR 2b
  expedition: '🧭',
  beast_boar: '🐗',
  beast_wolf: '🐺',
  beast_basilisk: '🦎',
  beast_sea_serpent: '🐉',
  beast_wurm: '🪱',
  beast_roc: '🦅',
  beast_hydra: '🐍',
  beast_dragon: '🐲',
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
  return classifyOwner(unit.owner);
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
    ?? (role === 'barbarian' ? '#8b4513'
      : role === 'beast' ? '#7a1f2b'
      : role === 'pirate' ? '#7f1d1d'
      : role === 'rebel' ? '#6b3f2a'
      : '#888');
  return {
    role,
    roleMarker: role === 'minor' ? 'diamond'
      : role === 'barbarian' || role === 'rebel' || role === 'pirate' ? 'chevron'
      : null,
    color,
    fallbackIcon: FALLBACK_ICONS[unit.type] ?? '?',
    spriteOwnerId: role === 'pirate' ? 'pirates' : unit.owner,
    motion,
  };
}
