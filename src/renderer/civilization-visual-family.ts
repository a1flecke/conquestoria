/** Maps real CivDefinition.id values to the sprite palette used by map visuals. */
export const CIVTYPE_TO_FACTION: Record<string, string> = {
  egypt: 'pharaohs',
  greece: 'hellenes',
  rome: 'imperials',
  babylon: 'pharaohs',
  persia: 'pharaohs',
  spain: 'imperials',
  atlantis: 'imperials',
  england: 'vikings',
  germany: 'imperials',
  france: 'imperials',
  russia: 'imperials',
  viking: 'vikings',
  gondor: 'imperials',
  rohan: 'imperials',
  shire: 'imperials',
  prydain: 'imperials',
  annuvin: 'imperials',
  avalon: 'imperials',
  mongolia: 'khanate',
  china: 'khanate',
  japan: 'shogunate',
  india: 'khanate',
  ottoman: 'khanate',
  zulu: 'imperials',
  aztec: 'imperials',
  wakanda: 'imperials',
  lothlorien: 'hellenes',
  isengard: 'imperials',
  narnia: 'imperials',
};

export function civTypeToFaction(civType: string): string {
  return CIVTYPE_TO_FACTION[civType] ?? 'imperials';
}
