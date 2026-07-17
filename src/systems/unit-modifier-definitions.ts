import type { UnitType } from '@/core/types';

export type UnitClass = 'melee' | 'ranged' | 'siege' | 'mounted' | 'gunpowder' | 'armor'
  | 'naval' | 'air' | 'recon' | 'spy' | 'civilian';

// Every UnitType must have a non-empty entry — TS's Record<UnitType, ...> makes this a
// compile-time completeness guarantee; tests/systems/unit-modifier-system.test.ts also
// asserts against UNIT_DEFINITIONS keys so a future UnitType addition fails loudly.
export const UNIT_CLASS_BY_TYPE: Record<UnitType, UnitClass[]> = {
  settler: ['civilian'],
  worker: ['civilian'],
  scout: ['recon'],
  warrior: ['melee'],
  archer: ['ranged'],
  swordsman: ['melee'],
  pikeman: ['melee'],
  musketeer: ['gunpowder'],
  galley: ['naval', 'melee'],
  trireme: ['naval', 'melee'],
  axeman: ['melee'],
  spearman: ['melee'],
  horseman: ['mounted'],
  cavalry: ['mounted'],
  knight: ['mounted', 'melee'],
  crossbowman: ['ranged'],
  catapult: ['siege'],
  ballista: ['siege', 'ranged'],
  cannon: ['siege', 'gunpowder'],
  artillery: ['siege', 'gunpowder'],
  grenadier: ['gunpowder'],
  rifleman: ['gunpowder'],
  frigate: ['naval', 'ranged'],
  ironclad: ['naval', 'gunpowder'],
  destroyer: ['naval', 'ranged'],
  machine_gunner: ['gunpowder'],
  infantry: ['gunpowder'],
  pre_dreadnought: ['naval', 'gunpowder'],
  observation_balloon: ['air', 'recon'],
  biplane: ['air'],
  recon_aircraft: ['air', 'recon'],
  jet_fighter: ['air'],
  bomber: ['air'],
  tank: ['armor'],
  submarine: ['naval'],
  carrier: ['naval'],
  attack_helicopter: ['air'],
  missile_submarine: ['naval'],
  spy_scout: ['spy'],
  spy_informant: ['spy'],
  spy_agent: ['spy'],
  spy_operative: ['spy'],
  spy_hacker: ['spy'],
  scout_hound: ['recon'],
  shadow_warden: ['recon'],
  war_hound: ['recon', 'melee'],
  caravan: ['civilian'],
  // Trade Routes Overhaul (#553 MR2/4) — Land trade line successors to Caravan.
  merchant_wagon: ['civilian'],
  freight_convoy: ['civilian'],
  expedition: ['civilian'],
  transport: ['naval', 'civilian'],
  carrack: ['naval', 'civilian'],
  galleon: ['naval', 'civilian'],
  steamship: ['naval', 'civilian'],
  troop_transport: ['naval', 'civilian'],
  // Trade Routes Overhaul (#553 MR1/4) — Naval Trader line
  naval_trader: ['naval', 'civilian'],
  steamship_trader: ['naval', 'civilian'],
  cargo_freighter: ['naval', 'civilian'],
  container_ship: ['naval', 'civilian'],
  // Trade Routes Overhaul (#553 MR3/4) — Air trade line. Civilian only (not 'air'
  // combat-style) — these units don't fight, matching the naval trade line's
  // civilian-first treatment.
  air_freighter: ['civilian'],
  jet_freighter: ['civilian'],
  global_air_cargo: ['civilian'],
  pirate_galley: ['naval', 'melee'],
  pirate_corsair: ['naval', 'melee'],
  pirate_frigate: ['naval', 'ranged'],
  pirate_ironclad: ['naval', 'gunpowder'],
  pirate_fast_attack_craft: ['naval', 'ranged'],
  pirate_mothership: ['naval', 'ranged'],
  beast_boar: ['melee'],
  beast_wolf: ['melee'],
  beast_basilisk: ['melee'],
  beast_sea_serpent: ['naval', 'melee'],
  beast_wurm: ['melee'],
  beast_roc: ['air', 'melee'],
  beast_hydra: ['melee'],
  beast_dragon: ['air', 'ranged'],
  cyber_unit: ['civilian'],
  stealth_bomber: ['air'],
};

export type ModifierEffect = 'combatStrength' | 'healing' | 'vision';
export type ModifierMode = 'flat' | 'multiplier';
export type ModifierWhen = 'attacking' | 'defending' | 'always';

// inFriendlyTerritory / withinRangeOfFriendlyCity3 are only ever read by getHealingBonus;
// fullHP / inFriendlyCity / vsCoastalCity are only ever read by getCombatModifier.
export type ModifierCondition =
  | 'fullHP'
  | 'inFriendlyCity'
  | 'inFriendlyTerritory'
  | 'vsCoastalCity'
  | 'withinRangeOfFriendlyCity3';

export type ModifierSource =
  | { kind: 'tech'; id: string }
  | { kind: 'nationalProject'; id: string };

export interface UnitModifier {
  source: ModifierSource;
  effect: ModifierEffect;
  mode: ModifierMode;
  value: number;
  appliesTo?: UnitClass[];
  unitTypes?: UnitType[];
  // Restricts to a unit domain (land/naval/air) — used where the source text names a
  // domain ("all land combat") rather than a UnitClass.
  domain?: 'land' | 'naval' | 'air';
  when?: ModifierWhen;
  condition?: ModifierCondition;
  label: string;
}

const tech = (id: string): ModifierSource => ({ kind: 'tech', id });
const nationalProject = (id: string): ModifierSource => ({ kind: 'nationalProject', id });

export const UNIT_MODIFIERS: UnitModifier[] = [
  // --- Combat: techs ---
  { source: tech('tactics'), effect: 'combatStrength', mode: 'multiplier', value: 1.10, when: 'always', label: 'Tactics' },
  { source: tech('naval-gunnery'), effect: 'combatStrength', mode: 'flat', value: 5, appliesTo: ['naval'], when: 'always', label: 'Naval Gunnery' },
  { source: tech('precision-casting'), effect: 'combatStrength', mode: 'flat', value: 5, unitTypes: ['cannon'], when: 'always', label: 'Precision Casting' },
  { source: tech('steel-plate-armor'), effect: 'combatStrength', mode: 'flat', value: 3, appliesTo: ['melee'], when: 'defending', label: 'Steel Plate Armor' },
  { source: tech('tungsten-alloys'), effect: 'combatStrength', mode: 'flat', value: 2, when: 'always', label: 'Tungsten Alloys' },
  { source: tech('carbon-fiber'), effect: 'combatStrength', mode: 'flat', value: 2, when: 'always', label: 'Carbon Fibre' },
  // Nanomaterials: text updated (effect-text-only rule) to drop newUnitsOnly — applies to
  // all units, all the time; simpler, save-safe, balance-equivalent within an era.
  { source: tech('nanomaterials'), effect: 'combatStrength', mode: 'flat', value: 3, when: 'always', label: 'Nanomaterials' },
  { source: tech('transhumanism'), effect: 'combatStrength', mode: 'multiplier', value: 1.05, when: 'always', condition: 'fullHP', label: 'Transhumanism' },
  { source: tech('amphibious-assault'), effect: 'combatStrength', mode: 'flat', value: 3, appliesTo: ['naval'], when: 'attacking', condition: 'vsCoastalCity', label: 'Amphibious Assault' },
  { source: tech('armored-tactics'), effect: 'combatStrength', mode: 'flat', value: 5, unitTypes: ['tank'], when: 'always', label: 'Armored Tactics' },
  // Naval ranged/bombard hulls only — encoded as an explicit unitTypes list (per-row
  // authoring) instead of a runtime attackProfile check, since unitTypes overrides appliesTo.
  { source: tech('torpedo-warfare'), effect: 'combatStrength', mode: 'flat', value: 8, unitTypes: ['ironclad', 'pre_dreadnought', 'submarine', 'missile_submarine', 'carrier'], when: 'always', label: 'Torpedo Warfare' },
  { source: tech('stone-weapons'), effect: 'combatStrength', mode: 'flat', value: 2, unitTypes: ['warrior'], when: 'attacking', label: 'Stone Weapons' },

  // --- Combat: national projects ---
  { source: nationalProject('foundry_guild'), effect: 'combatStrength', mode: 'flat', value: 2, appliesTo: ['melee'], when: 'always', label: 'Foundry Guild' },
  { source: nationalProject('iron_legion'), effect: 'combatStrength', mode: 'flat', value: 2, domain: 'land', when: 'always', label: 'Iron Legion' },
  { source: nationalProject('praetorian_legion'), effect: 'combatStrength', mode: 'flat', value: 3, when: 'defending', condition: 'inFriendlyCity', label: 'Praetorian Legion' },
  // Migrated from the ad-hoc attackerHasAirForceCommand branch in combat-system.ts.
  { source: nationalProject('air_force_command'), effect: 'combatStrength', mode: 'flat', value: 4, domain: 'air', when: 'attacking', label: 'Air Force Command' },

  // --- Healing: techs ---
  { source: tech('advanced-anatomy'), effect: 'healing', mode: 'flat', value: 1, condition: 'inFriendlyTerritory', label: 'Advanced Anatomy' },
  { source: tech('surgical-school'), effect: 'healing', mode: 'flat', value: 2, condition: 'inFriendlyCity', label: 'Surgical School' },
  { source: tech('germ-theory'), effect: 'healing', mode: 'flat', value: 2, condition: 'inFriendlyTerritory', label: 'Germ Theory' },
  { source: tech('antiseptic-surgery'), effect: 'healing', mode: 'flat', value: 3, condition: 'inFriendlyCity', label: 'Antiseptic Surgery' },
  { source: tech('blood-transfusion'), effect: 'healing', mode: 'flat', value: 4, condition: 'inFriendlyCity', label: 'Blood Transfusion' },
  { source: tech('penicillin'), effect: 'healing', mode: 'flat', value: 3, condition: 'inFriendlyTerritory', label: 'Penicillin' },
  { source: tech('organ-transplantation'), effect: 'healing', mode: 'flat', value: 3, condition: 'inFriendlyCity', label: 'Organ Transplantation' },
  // Single multiplier, applied after all flat healing bonuses (see getHealingBonus).
  { source: tech('mindfulness-movement'), effect: 'healing', mode: 'multiplier', value: 1.5, condition: 'inFriendlyTerritory', label: 'Mindfulness Movement' },
  { source: tech('social-gospel'), effect: 'healing', mode: 'flat', value: 1, condition: 'inFriendlyCity', label: 'Social Gospel' },
  { source: nationalProject('sacred_grove'), effect: 'healing', mode: 'flat', value: 2, condition: 'inFriendlyTerritory', label: 'Sacred Grove' },
  // Requires a Telemedicine Hub city within range — text updated (effect-text-only rule)
  // to make the building meaningful instead of "any friendly city".
  { source: tech('telemedicine'), effect: 'healing', mode: 'flat', value: 1, condition: 'withinRangeOfFriendlyCity3', label: 'Telemedicine' },

  // --- Vision: techs ---
  { source: tech('pathfinding'), effect: 'vision', mode: 'flat', value: 1, appliesTo: ['recon'], label: 'Pathfinding' },
  { source: tech('optics'), effect: 'vision', mode: 'flat', value: 1, label: 'Optics' },
  { source: tech('exploration-tech'), effect: 'vision', mode: 'flat', value: 1, label: 'Exploration' },
  { source: tech('imperial-survey'), effect: 'vision', mode: 'flat', value: 1, appliesTo: ['recon'], label: 'Imperial Survey' },
  // Re-texted (effect-text-only rule): "50% more territory" → a concrete vision bonus.
  { source: tech('aerial-survey'), effect: 'vision', mode: 'flat', value: 1, appliesTo: ['air'], label: 'Aerial Survey' },
  { source: nationalProject('explorers_guild'), effect: 'vision', mode: 'flat', value: 1, appliesTo: ['recon'], label: "Explorers' Guild" },
];

export interface ClassCounter {
  attackerTypes?: UnitType[];
  attackerClass?: UnitClass;
  defenderClass: UnitClass;
  multiplier: number;
  label: string;
  // Grenadier's "anti-fortification" bonus only counts a defender standing on a city tile.
  requiresDefenderInFriendlyCity?: boolean;
  // Commerce raiders only counter naval civilians (transports), not land civilians.
  requiresDefenderDomain?: 'land' | 'naval' | 'air';
  // Destroyer's sub-hunter identity narrows the broad 'naval' defenderClass down to submarines only.
  defenderTypes?: UnitType[];
}

export const CLASS_COUNTERS: ClassCounter[] = [
  { attackerTypes: ['spearman', 'pikeman'], defenderClass: 'mounted', multiplier: 1.5, label: 'Anti-cavalry' },
  { attackerTypes: ['grenadier'], defenderClass: 'melee', multiplier: 1.25, label: 'Anti-fortification', requiresDefenderInFriendlyCity: true },
  { attackerTypes: ['attack_helicopter'], defenderClass: 'armor', multiplier: 1.5, label: 'Anti-armor' },
  { attackerTypes: ['submarine', 'missile_submarine'], defenderClass: 'civilian', multiplier: 1.5, label: 'Commerce raider', requiresDefenderDomain: 'naval' },
  { attackerTypes: ['destroyer'], defenderClass: 'naval', defenderTypes: ['submarine', 'missile_submarine'], multiplier: 1.25, label: 'Anti-submarine' },
  { attackerTypes: ['jet_fighter', 'biplane'], defenderClass: 'air', defenderTypes: ['bomber'], multiplier: 1.5, label: 'Interceptor' },
];
