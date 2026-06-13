export type OwnerKind = 'major' | 'minor' | 'barbarian' | 'rebel' | 'beast' | 'pirate';

export function classifyOwner(ownerId: string): OwnerKind {
  if (ownerId === 'pirate' || ownerId.startsWith('pirate-')) return 'pirate';
  if (ownerId.startsWith('mc-')) return 'minor';
  if (ownerId === 'barbarian') return 'barbarian';
  if (ownerId === 'rebels') return 'rebel';
  if (ownerId === 'beasts') return 'beast';
  return 'major';
}

export function isMajorCivOwner(ownerId: string): boolean {
  return classifyOwner(ownerId) === 'major';
}

export function isPirateOwner(ownerId: string): boolean {
  return classifyOwner(ownerId) === 'pirate';
}

export function canReceiveCivilizationCombatRewards(ownerId: string): boolean {
  return isMajorCivOwner(ownerId);
}

export function isAlwaysHostilePair(a: string, b: string): boolean {
  if (a === b) return false;
  const aKind = classifyOwner(a);
  const bKind = classifyOwner(b);
  if (aKind === 'pirate' || bKind === 'pirate') return aKind !== bKind;
  return aKind === 'barbarian' || bKind === 'barbarian'
    || aKind === 'rebel' || bKind === 'rebel'
    || aKind === 'beast' || bKind === 'beast';
}
