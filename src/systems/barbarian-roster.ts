import type { BarbarianEligibility, UnitType } from '@/core/types';

const exclude = (reason: Extract<BarbarianEligibility, { status: 'excluded' }>['reason']) =>
  ({ status: 'excluded' as const, reason });

const eligible = (
  eraWindow: { min: number; max?: number },
  roleSlot: Extract<BarbarianEligibility, { status: 'eligible' }>['roleSlot'],
  rarity: Extract<BarbarianEligibility, { status: 'eligible' }>['rarity'],
  options: Omit<Extract<BarbarianEligibility, { status: 'eligible' }>, 'status' | 'eraWindow' | 'roleSlot' | 'rarity' | 'weight'> & { weight?: number } = {},
) => ({ status: 'eligible' as const, eraWindow, roleSlot, rarity, weight: options.weight ?? (rarity === 'common' ? 100 : rarity === 'uncommon' ? 50 : 25), ...options });

/**
 * Every trainable or special unit has an explicit ordinary-camp classification.
 * `Record<UnitType, ...>` makes a newly added unit fail compilation until it is
 * deliberately admitted or excluded.
 */
export const BARBARIAN_ELIGIBILITY_BY_UNIT = {
  settler: exclude('civilian'), worker: exclude('civilian'), scout: exclude('unsupported'), missionary: exclude('civilian'),
  warrior: eligible({ min: 1, max: 2 }, 'frontline', 'common'),
  archer: eligible({ min: 1, max: 2 }, 'ranged', 'common'),
  swordsman: eligible({ min: 3, max: 4 }, 'frontline', 'common'),
  pikeman: eligible({ min: 5, max: 7 }, 'frontline', 'common'),
  musketeer: eligible({ min: 5, max: 7 }, 'frontline', 'common'),
  galley: exclude('naval'), trireme: exclude('naval'),
  axeman: eligible({ min: 1, max: 2 }, 'frontline', 'common'),
  spearman: eligible({ min: 3, max: 4 }, 'frontline', 'common'),
  horseman: exclude('unsupported'),
  chariot: eligible({ min: 2, max: 4 }, 'mobile', 'common'),
  cavalry: eligible({ min: 6, max: 8 }, 'mobile', 'common', { excludesUnits: ['cuirassier'] }),
  armored_car: eligible({ min: 9, max: 11 }, 'mobile', 'common'),
  knight: exclude('unsupported'),
  cuirassier: eligible({ min: 6, max: 8 }, 'mobile', 'rare', { excludesUnits: ['cavalry'] }),
  crossbowman: eligible({ min: 3, max: 7 }, 'ranged', 'common'),
  catapult: exclude('unsupported'),
  trebuchet: eligible({ min: 4, max: 6 }, 'siege', 'uncommon', { maxPerCampBeforeEscalation: 1 }),
  ballista: exclude('unsupported'), cannon: exclude('unsupported'),
  grenadier: eligible({ min: 8, max: 9 }, 'ranged', 'common'),
  marine: exclude('unsupported'),
  rifleman: eligible({ min: 8, max: 11 }, 'frontline', 'common'),
  ironclad: exclude('naval'), frigate: exclude('naval'), destroyer: exclude('naval'),
  artillery: exclude('unsupported'), rocket_artillery: exclude('unsupported'),
  infantry: exclude('unsupported'),
  // Barbarian camps aren't state.cities and never have an Airfield, so a
  // barbarian-owned Paratrooper would be a permanently-unusable special
  // ability bolted onto a weaker-than-Infantry unit -- same reasoning as
  // plain Infantry's exclusion above, not a "modern unit" exclusion.
  paratrooper: exclude('unsupported'),
  mechanized_infantry: eligible({ min: 10 }, 'frontline', 'uncommon'),
  machine_gunner: eligible({ min: 10 }, 'ranged', 'common'),
  pre_dreadnought: exclude('naval'), battleship: exclude('naval'), missile_cruiser: exclude('naval'),
  observation_balloon: exclude('air'), biplane: exclude('air'), wwii_fighter: exclude('air'), jet_fighter: exclude('air'), bomber: exclude('air'), recon_aircraft: exclude('air'),
  tank: eligible({ min: 10 }, 'frontline', 'common'), main_battle_tank: exclude('unsupported'),
  anti_tank_gun: eligible({ min: 9 }, 'specialist', 'uncommon', { requiresObservation: 'armor' }),
  mobile_aa: eligible({ min: 10 }, 'anti-air', 'uncommon', { requiresObservation: 'air', maxPerCamp: 1 }),
  submarine: exclude('naval'), carrier: exclude('naval'), attack_helicopter: exclude('air'), missile_submarine: exclude('strategic-deterrence'),
  spy_scout: exclude('unsupported'), spy_informant: exclude('unsupported'), spy_agent: exclude('unsupported'), spy_operative: exclude('unsupported'), spy_intelligence_officer: exclude('unsupported'), spy_station_chief: exclude('unsupported'), spy_hacker: exclude('unsupported'),
  scout_hound: exclude('crisis'), shadow_warden: exclude('crisis'), war_hound: exclude('crisis'), beast_handler: exclude('unique'), war_elephant: exclude('unique'),
  caravan: exclude('civilian'), merchant_wagon: exclude('civilian'), freight_convoy: exclude('civilian'),
  naval_trader: exclude('civilian'), steamship_trader: exclude('civilian'), cargo_freighter: exclude('civilian'), container_ship: exclude('civilian'),
  air_freighter: exclude('civilian'), jet_freighter: exclude('civilian'), global_air_cargo: exclude('civilian'), expedition: exclude('civilian'),
  transport: exclude('naval'), carrack: exclude('naval'), galleon: exclude('naval'), steamship: exclude('naval'), troop_transport: exclude('naval'),
  pirate_galley: exclude('crisis'), pirate_corsair: exclude('crisis'), pirate_frigate: exclude('crisis'), pirate_ironclad: exclude('crisis'), pirate_fast_attack_craft: exclude('crisis'), pirate_mothership: exclude('crisis'),
  beast_boar: exclude('crisis'), beast_wolf: exclude('crisis'), beast_basilisk: exclude('crisis'), beast_sea_serpent: exclude('crisis'), beast_wurm: exclude('crisis'), beast_roc: exclude('crisis'), beast_hydra: exclude('crisis'), beast_dragon: exclude('crisis'), beast_stampede_herd: exclude('crisis'),
  cyber_unit: exclude('strategic-deterrence'), stealth_bomber: exclude('strategic-deterrence'), combat_drone: exclude('strategic-deterrence'), autonomous_frigate: exclude('strategic-deterrence'), exosuit_infantry: exclude('strategic-deterrence'), propagandist: exclude('strategic-deterrence'), drone_controller: exclude('strategic-deterrence'),
} satisfies Record<UnitType, BarbarianEligibility>;

export function getBarbarianEligibility(unitType: UnitType): BarbarianEligibility {
  return BARBARIAN_ELIGIBILITY_BY_UNIT[unitType];
}
