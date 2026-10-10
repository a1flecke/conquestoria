/**
 * Faction accent colours: the `mid` value of each of the six sprite archetype palettes
 * (design/conquestoria-sprites/lib/sprite-system.jsx PALETTE.factions).
 *
 * Serialized SVG sprites have this hex baked into their fills (scripts/serialize-sprites.mjs), and the overlay swaps it
 * for the owner's game colour. PNG sprites use it as the default tint when no civ colour is known. One table, two
 * consumers, so the two renderers cannot disagree about what "imperials" looks like.
 */
export const FACTION_SPRITE_ACCENT: Readonly<Record<string, string>> = {
  imperials: '#b53026',
  vikings:   '#1d4a8c',
  pharaohs:  '#d4a13c',
  hellenes:  '#2c8a5a',
  khanate:   '#7a3a14',
  shogunate: '#5b4a7a',
};

/** Tint used when neither a civ colour nor a known faction is available (e.g. a minor civ before its colour resolves). */
export const NEUTRAL_PNG_TINT = '#8a8a8a';
