import type { GeneralDefinition, GeneratedGeneralIdentity, HeroicAbilityId } from '@/core/types';
import { GENERAL_PROFILES } from '@/systems/great-general-profiles';

// #888: the identity types now live in core `types.ts` (GameState references
// them); re-exported here so existing `@/systems/great-general-definitions`
// importers are unaffected.
export type { GeneralDefinition, GeneratedGeneralIdentity } from '@/core/types';

// V1 command stats are deliberately uniform across every entry (contract
// §14: "V1 definitions may share identical values... that equality is data
// coincidence only"). MR4 is free to differentiate per-definition later
// without a schema change.
const V1_COMMAND_RANGE = 2;
const V1_COMMAND_CAPACITY = 3;
// #544 MR4 contract §17: "3 lifetime Command Charges... initial playtest
// target: ~10 owner turns" shared cooldown.
const V1_MAX_COMMAND_CHARGES = 3;
const V1_COOLDOWN_TURNS = 10;
const V1_ABILITY_IDS: HeroicAbilityId[] = ['rally', 'seize_the_moment', 'last_stand'];

/**
 * #888: the standard command profile every generated officer inherits
 * (Phase 9 — "mechanically ordinary"; unique mechanics are #885's scope).
 * Derived from the `V1_*` constants above so there is a single source of
 * truth — if MR4+ ever differentiates authored stats per-definition, revisit
 * whether generated officers should still track the V1 baseline.
 */
export const STANDARD_GENERAL_COMMAND_PROFILE: Pick<
  GeneralDefinition,
  'commandRange' | 'commandCapacity' | 'abilityIds' | 'maxCommandCharges' | 'cooldownTurns'
> = {
  commandRange: V1_COMMAND_RANGE,
  commandCapacity: V1_COMMAND_CAPACITY,
  abilityIds: [...V1_ABILITY_IDS],
  maxCommandCharges: V1_MAX_COMMAND_CHARGES,
  cooldownTurns: V1_COOLDOWN_TURNS,
};

/**
 * Seed roster (#544 MR3): one real/lore-appropriate commander per civ
 * currently in CIV_DEFINITIONS, plus a small universal fallback pool for
 * adjacent-era fallback and any future custom civ. Content governance per
 * contract §13: no Nazi figures (Germany intentionally uses Frederick the
 * Great, not a WWII-era figure); Genghis Khan explicitly allowed. Expanding
 * roster depth (more than one commander per civ, richer eras) is a pure
 * data change — deliberately deferred, see contract's issue E ("rich Great
 * General biographies").
 */
const GENERAL_ROSTER_BASE: GeneralDefinition[] = [
  // --- Historical civs ---
  { id: 'gen_ramesses', name: 'Ramesses II', civTypeEligibility: ['egypt'], era: 2, descriptor: 'Victor of Kadesh, builder-pharaoh of the New Kingdom.', portraitIcon: '☀️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_caesar', name: 'Julius Caesar', civTypeEligibility: ['rome'], era: 3, descriptor: 'Conqueror of Gaul, master of the forced march.', portraitIcon: '🦅', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_alexander', name: 'Alexander the Great', civTypeEligibility: ['greece'], era: 3, descriptor: 'Undefeated in battle, carried the phalanx to the edge of the known world.', portraitIcon: '⚔️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_genghis', name: 'Genghis Khan', civTypeEligibility: ['mongolia'], era: 4, descriptor: 'Unified the steppe, whose horse archers outran every army that faced them.', portraitIcon: '🏹', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_nebuchadnezzar', name: 'Nebuchadnezzar II', civTypeEligibility: ['babylon'], era: 2, descriptor: 'Builder of Babylon\'s walls, conqueror of Jerusalem.', portraitIcon: '🏛️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_shaka', name: 'Shaka Zulu', civTypeEligibility: ['zulu'], era: 5, descriptor: 'Reformed the impi with the short stabbing spear and the horned encirclement.', portraitIcon: '🛡️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_yuefei', name: 'Yue Fei', civTypeEligibility: ['china'], era: 4, descriptor: 'Song-dynasty general famed for discipline and unbroken loyalty.', portraitIcon: '🐉', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_cyrus', name: 'Cyrus the Great', civTypeEligibility: ['persia'], era: 2, descriptor: 'Founder of the Achaemenid Empire, first to rule "king of the four corners".', portraitIcon: '👑', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_wellington', name: 'Duke of Wellington', civTypeEligibility: ['england'], era: 6, descriptor: 'Broke Napoleon\'s army at Waterloo through unshakeable defensive lines.', portraitIcon: '🎖️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_cuauhtemoc', name: 'Cuauhtémoc', civTypeEligibility: ['aztec'], era: 4, descriptor: 'Last Aztec emperor, who fought Cortés to the walls of Tenochtitlan.', portraitIcon: '🦅', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_tokugawa', name: 'Tokugawa Ieyasu', civTypeEligibility: ['japan'], era: 5, descriptor: 'Won at Sekigahara and unified Japan under one shogunate.', portraitIcon: '⛩️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_chandragupta', name: 'Chandragupta Maurya', civTypeEligibility: ['india'], era: 2, descriptor: 'Founder of the Maurya Empire, first to unite most of the Indian subcontinent.', portraitIcon: '🐘', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_napoleon', name: 'Napoleon Bonaparte', civTypeEligibility: ['france'], era: 7, descriptor: 'Reshaped continental warfare with massed artillery and rapid maneuver.', portraitIcon: '🎩', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_frederick', name: 'Frederick the Great', civTypeEligibility: ['germany'], era: 6, descriptor: 'Prussian king whose oblique-order tactics won battles against far larger armies.', portraitIcon: '🦅', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_suvorov', name: 'Alexander Suvorov', civTypeEligibility: ['russia'], era: 7, descriptor: 'Never lost a battle in a forty-year career of relentless offense.', portraitIcon: '❄️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_mehmed', name: 'Mehmed the Conqueror', civTypeEligibility: ['ottoman'], era: 5, descriptor: 'Took Constantinople with siege engines no wall had ever survived.', portraitIcon: '🏰', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_elcid', name: 'El Cid', civTypeEligibility: ['spain'], era: 4, descriptor: 'Undefeated Castilian knight who fought for Christian and Muslim lords alike.', portraitIcon: '🗡️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_ragnar', name: 'Ragnar Lothbrok', civTypeEligibility: ['viking'], era: 3, descriptor: 'Legendary raider-chieftain whose longships struck three continents.', portraitIcon: '🪓', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },

  // --- Fantasy/lore civs (culturally coherent, fictional commanders — contract §13) ---
  { id: 'gen_boromir', name: 'Boromir, Captain of the White Tower', civTypeEligibility: ['gondor'], era: 5, descriptor: 'Steward\'s son and shield of Minas Tirith, first into every breach.', portraitIcon: '🛡️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_eomer', name: 'Éomer, Marshal of the Riddermark', civTypeEligibility: ['rohan'], era: 4, descriptor: 'Led the Rohirrim charge that broke the siege of the Pelennor.', portraitIcon: '🐎', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_merry', name: 'Meriadoc, Knight of the Mark', civTypeEligibility: ['shire'], era: 3, descriptor: 'A hobbit far from home who struck the killing blow no one expected.', portraitIcon: '🍂', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_ugluk', name: 'Uglúk, Uruk-hai War-captain', civTypeEligibility: ['isengard'], era: 5, descriptor: 'Bred for war, drove his company harder and faster than any rival scout.', portraitIcon: '⚙️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_gwydion', name: 'Gwydion, Prince of Don', civTypeEligibility: ['prydain'], era: 3, descriptor: 'Greatest warrior of the Sons of Don, veteran of a hundred border wars.', portraitIcon: '⚔️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_hornedking', name: 'The Horned King\'s Champion', civTypeEligibility: ['annuvin'], era: 4, descriptor: 'Commands the legions of Annuvin with cold, absolute discipline.', portraitIcon: '💀', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_okoye', name: 'Okoye, General of the Dora Milaje', civTypeEligibility: ['wakanda'], era: 6, descriptor: 'Commands Wakanda\'s finest with unmatched discipline and spear-craft.', portraitIcon: '🔱', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_lancelot', name: 'Sir Lancelot du Lac', civTypeEligibility: ['avalon'], era: 3, descriptor: 'Greatest knight of the Round Table, unmatched in single combat.', portraitIcon: '⚜️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_haldir', name: 'Haldir, Marchwarden of Lothlórien', civTypeEligibility: ['lothlorien'], era: 4, descriptor: 'Guards the golden wood\'s borders; his archers never miss twice.', portraitIcon: '🍃', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_oreius', name: 'General Oreius', civTypeEligibility: ['narnia'], era: 4, descriptor: 'Centaur commander of Narnia\'s armies, unmatched in open-field tactics.', portraitIcon: '🌟', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_thessaly', name: 'Admiral Thessaly of the Sunken Fleet', civTypeEligibility: ['atlantis'], era: 3, descriptor: 'Commands Atlantis\'s tide-legions with a mastery no surface fleet can match.', portraitIcon: '🌊', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },

  // --- Universal fallback pool: adjacent-era fallback and any future custom
  // civ with no dedicated roster of its own (contract §13). ---
  { id: 'gen_hannibal', name: 'Hannibal Barca', civTypeEligibility: [], era: 3, descriptor: 'Crossed the Alps with war elephants to strike at the heart of a rival empire.', portraitIcon: '🐘', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_universal_marshal', name: 'The Iron Marshal', civTypeEligibility: [], era: 1, descriptor: 'A commander of no fixed nation, forged by a hundred border skirmishes.', portraitIcon: '🛡️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_universal_warlord', name: 'The Grey Warlord', civTypeEligibility: [], era: 3, descriptor: 'Rose from the ranks through sheer tactical instinct.', portraitIcon: '⚔️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_universal_field_marshal', name: 'The Steel Field Marshal', civTypeEligibility: [], era: 6, descriptor: 'Modernized doctrine faster than any rival staff college.', portraitIcon: '🎖️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
  { id: 'gen_universal_commodore', name: 'The Storm Commodore', civTypeEligibility: [], era: 8, descriptor: 'Made a name commanding combined arms across an entire theater.', portraitIcon: '🌩️', commandRange: V1_COMMAND_RANGE, commandCapacity: V1_COMMAND_CAPACITY, abilityIds: V1_ABILITY_IDS, maxCommandCharges: V1_MAX_COMMAND_CHARGES, cooldownTurns: V1_COOLDOWN_TURNS },
];

/**
 * #886: the compact gameplay table above, enriched with the rich educational
 * `provenance` + `historicalProfile` / `loreProfile` content from
 * `great-general-profiles.ts`. The merge is the single source of truth: a
 * roster entry with no matching `GENERAL_PROFILES` key keeps `provenance`
 * undefined and fails `great-general-profiles.test.ts`, so nothing ships
 * content-less. Profiles are static definition data only — they never enter
 * `GameState` and grant no gameplay effect.
 */
export const GENERAL_DEFINITIONS: GeneralDefinition[] = GENERAL_ROSTER_BASE.map((base): GeneralDefinition => {
  const entry = GENERAL_PROFILES[base.id];
  if (!entry) return base;
  if (entry.provenance === 'historical' || entry.provenance === 'legendary') {
    return { ...base, provenance: entry.provenance, historicalProfile: entry.profile };
  }
  return { ...base, provenance: entry.provenance, loreProfile: entry.profile };
});

const AUTHORED_BY_ID: ReadonlyMap<string, GeneralDefinition> = new Map(
  GENERAL_DEFINITIONS.map(g => [g.id, g]),
);

/**
 * #888: the single canonical id -> `GeneralDefinition` resolver. Authored roster
 * always wins; a `'generated:'` id is looked up in the caller's persisted
 * `generatedGenerals` registry. Returns `undefined` for an unknown id — every
 * call site already has a safe degrade path for that (mirrors the pre-#888
 * inline `GENERAL_DEFINITIONS.find(...)` returning `undefined`), and a used
 * general is still excluded from re-draw by its id string in `generalHistory`
 * even if its registry record was dropped by save normalization.
 *
 * Every consumer that previously did `GENERAL_DEFINITIONS.find(g => g.id === X)`
 * must call this instead so generated officers resolve everywhere authored ones do.
 */
export function resolveGeneralDefinition(
  source: { generatedGenerals?: Record<string, GeneratedGeneralIdentity> } | null | undefined,
  generalId: string | undefined,
): GeneralDefinition | undefined {
  if (!generalId) return undefined;
  return AUTHORED_BY_ID.get(generalId) ?? source?.generatedGenerals?.[generalId];
}
