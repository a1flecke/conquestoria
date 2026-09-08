export type OwnerKind = 'major' | 'minor' | 'barbarian' | 'rebel' | 'beast' | 'pirate' | 'crisis';

export const CRISIS_FORCE_OWNER = 'crisis-force';

export function classifyOwner(ownerId: string): OwnerKind {
  if (ownerId === 'pirate' || ownerId.startsWith('pirate-')) return 'pirate';
  if (ownerId.startsWith('mc-')) return 'minor';
  if (ownerId === 'barbarian') return 'barbarian';
  if (ownerId === 'rebels') return 'rebel';
  if (ownerId === 'beasts') return 'beast';
  if (ownerId === CRISIS_FORCE_OWNER) return 'crisis';
  return 'major';
}

export function isMajorCivOwner(ownerId: string): boolean {
  return classifyOwner(ownerId) === 'major';
}

/**
 * The subset of a civ's `diplomacy.atWarWith` that are wars with *major
 * civilizations* — the sense meant by "war weariness" unrest and the "at war
 * with N empires" guidance (#1041). Minor-civ (city-state) war state also rides
 * `atWarWith` (`setMinorCivWarState`, minor-civ coalitions), and
 * barbarians / pirates / rebels / beasts / crisis forces never belong there;
 * both are excluded here. De-duplicated so a repeated id cannot inflate a
 * player-facing count — structural dedup/bilateral enforcement is #995's remit,
 * this is only a read-side guard.
 */
export function majorCivWarOpponentIds(atWarWith: readonly string[] | undefined): string[] {
  return [...new Set(atWarWith ?? [])].filter(isMajorCivOwner);
}

export function isPirateOwner(ownerId: string): boolean {
  return classifyOwner(ownerId) === 'pirate';
}

export function isCrisisForceOwner(ownerId: string): boolean {
  return classifyOwner(ownerId) === 'crisis';
}

export function canReceiveCivilizationCombatRewards(ownerId: string): boolean {
  return isMajorCivOwner(ownerId);
}

export function canCaptureDefeatedUnits(ownerId: string): boolean {
  return isMajorCivOwner(ownerId);
}

export function isAlwaysHostilePair(a: string, b: string): boolean {
  if (a === b) return false;
  const aKind = classifyOwner(a);
  const bKind = classifyOwner(b);
  if (aKind === 'pirate' || bKind === 'pirate') return aKind !== bKind;
  if (aKind === 'crisis' || bKind === 'crisis') return true;
  return aKind === 'barbarian' || bKind === 'barbarian'
    || aKind === 'rebel' || bKind === 'rebel'
    || aKind === 'beast' || bKind === 'beast';
}
