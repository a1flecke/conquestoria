import type { ReligionBoon } from '@/core/types';

export const CONVERSION_THRESHOLD = 100;
export const OWN_CITY_ACCRUAL = 15;
export const FOREIGN_ADJACENT_ACCRUAL = 7;
export const FOREIGN_ADJACENT_CAP = 2;
export const TRADE_ROUTE_ACCRUAL = 5;
// Wired starting MR5 (#592) — occupied cities accrue toward the occupier's faith.
// Defined here now so MR5 doesn't need to touch this file's constant block.
export const OCCUPATION_ACCRUAL = 5;
export const FERVOR_MULTIPLIER = 1.25;
export const TITHES_CAP = 10;

// #592 MR5: missionary unit + active preach conversion.
export const MISSIONARY_COST = 16;
export const MISSIONARY_BASE_CHARGES = 2;
export const MISSIONARY_ZEAL_CHARGES = 3;
export const PREACH_POINTS = 50;
export const PREACH_OCCUPIED_DOUBLE = 100;
// A missionary that just preached needs to "rest" before preaching again — reflects the
// action itself plus recovery, same framing as a worker's multi-turn improvement build.
export const MISSIONARY_ACTION_COOLDOWN_TURNS = 3;
// Anti-flip-flop guard: once a city converts, it can't flip to a DIFFERENT rival religion
// again for this many turns. The city's own owner (at the moment of conversion) is always
// exempt, so preaching a just-flipped city back to its owner's faith is never blocked by
// this cooldown — see CityFaith.conversionCooldownExemptCivId.
export const CITY_CONVERSION_COOLDOWN_TURNS = 7;

// Invented, culture-flavored faith names — NEVER real-world religions (project
// convention, matches wonder/quest content rules). 2 candidates per civ id; seeded
// pick + player rename at founding.
export const NAME_CANDIDATES: Record<string, string[]> = {
  egypt: ['Cult of the River Dawn', 'Order of the Sundered Sky'],
  rome: ['Cult of the Eternal Hearth', 'Order of the Twelve Standards'],
  greece: ['Path of the Wine-Dark Sea', 'Circle of the First Light'],
  mongolia: ['Way of the Endless Steppe', 'Cult of the Sky Father'],
  babylon: ['Order of the Hanging Star', 'Cult of the River Reeds'],
  zulu: ['Path of the Rising Spear', 'Circle of the Great Kraal'],
  china: ['Way of the Jade Harmony', 'Order of the Silk Dawn'],
  persia: ['Cult of the Burning Garden', 'Order of the Golden Road'],
  england: ['Order of the White Cliff', 'Cult of the Grey Tide'],
  aztec: ['Path of the Fifth Sun', 'Cult of the Feathered Rain'],
  japan: ['Way of the Cherry Watch', 'Order of the Still Water'],
  india: ['Path of the Monsoon Bell', 'Circle of the Sacred Peacock'],
  france: ['Order of the Gilded Lily', 'Cult of the Northern Rose'],
  germany: ['Order of the Iron Oak', 'Cult of the Black Forest'],
  gondor: ['Order of the White Tree', 'Cult of the Sea-Kings'],
  rohan: ['Path of the Horse Lords', 'Circle of the Golden Hall'],
  russia: ['Cult of the Frozen Bell', 'Order of the Northern Bear'],
  ottoman: ['Order of the Crescent Watch', 'Path of the Red Tulip'],
  shire: ['Circle of the Green Hill', 'Order of the Second Breakfast'],
  isengard: ['Cult of the Broken Stone', 'Order of the Grinding Wheel'],
  spain: ['Order of the Golden Coast', 'Cult of the Iron Sun'],
  viking: ['Path of the Longship Star', 'Order of the Frost Raven'],
  prydain: ['Circle of the Cauldron Born', 'Order of the Grey King'],
  annuvin: ['Cult of the Hollow Crown', 'Order of the Undying Mist'],
  wakanda: ['Order of the Panther Star', 'Cult of the Vibrant Heart'],
  avalon: ['Order of the Lake Mist', 'Circle of the Once and Future'],
  lothlorien: ['Circle of the Golden Mallorn', 'Order of the Starlit Bough'],
  narnia: ['Circle of the Deep Magic', 'Order of the Eternal Snow'],
  atlantis: ['Cult of the Sunken Star', 'Order of the Tidal Throne'],
};

export const NEUTRAL_NAME_CANDIDATES: string[] = [
  'Order of the First Dawn',
  'Circle of the Wandering Star',
  'Path of the Quiet Flame',
];

export const BOON_DESCRIPTIONS: Record<ReligionBoon, string> = {
  serenity: '+1 happiness in every city that follows your faith.',
  tithes: `+1 gold per turn from every foreign city that follows your faith, up to +${TITHES_CAP} gold.`,
  // MR4-honest: only conversion speed. Territory/loyalty effects ship in MR6 (#593) —
  // do not add wording here until that MR actually implements them.
  fervor: 'Your faith spreads 25% faster.',
};
