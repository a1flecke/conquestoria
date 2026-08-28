import type { GameState } from '@/core/types';
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';

/**
 * #545 MR7: entities whose real description/unlocks text makes an
 * ICBM/launch/capacity claim that becomes false once superweapons is off.
 * Off-mode text keeps only the real, still-true yield claim.
 *
 * Only entities that were actually verified (against the live BUILDINGS /
 * UNIT_DESCRIPTIONS definitions) to make a false claim when off belong here.
 * nuclear_arsenal, strategic_air_command, and arms_control_treaty were
 * checked and excluded -- their real text is already an honest flat-yield
 * description with no capacity/launch/deterrence claim beyond the yield
 * itself, so overriding them would just be needless duplication.
 */
const OFF_MODE_DESCRIPTIONS: Record<string, string> = {
  manhattan_project: 'One-time atomic weapons research program. Permanent effect, never fades.',
  missile_silo: 'Hardened underground command bunker. +4 production per turn.',
  missile_submarine: 'A submarine with an unused deep-strike payload bay. Standard submarine capabilities. Requires a coastal city to build.',
};

/**
 * Resolve an entity's display description, substituting the honest off-mode
 * fallback when superweapons is off and this entity is in the affected set.
 * `realDescription` is always the caller's normal (already-resolved) text --
 * this function never invents new copy for entities outside
 * OFF_MODE_DESCRIPTIONS.
 */
export function resolveSuperweaponContentDescription(
  entityId: string,
  realDescription: string,
  state: GameState,
): string {
  if (isSuperweaponsEnabled(state)) return realDescription;
  return OFF_MODE_DESCRIPTIONS[entityId] ?? realDescription;
}
