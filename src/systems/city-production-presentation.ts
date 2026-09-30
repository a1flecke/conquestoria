import type { DroppedProductionItem } from '@/core/types';
import { BUILDINGS } from './city-building-catalog';
import { TRAINABLE_UNITS } from './city-unit-catalog';
import { getLegendaryWonderDisplayName, getLegendaryWonderQueueItemMetadata } from './legendary-wonder-production';

/**
 * Production presentation (#1008): icons, display names and dropped-item copy.
 *
 * This is the UI-facing surface that used to live in the simulation module
 * `city-system.ts`. Simulation rules must not own presentation; UI callers
 * should import these directly rather than through the `city-system` barrel.
 */
export const PRODUCTION_ICONS: Record<string, string> = {
  // Buildings
  granary: '🌾',
  herbalist: '🌿',
  aqueduct: '💧',
  workshop: '🔨',
  forge: '🔥',
  lumbermill: '🪵',
  'quarry-building': '⛏️',
  library: '📚',
  archive: '📜',
  observatory: '🔭',
  marketplace: '🏪',
  harbor: '⚓',
  dock: '🚢',
  barracks: '🪖',
  walls: '🧱',
  stable: '🐴',
  temple: '🛕',
  monument: '🗿',
  amphitheater: '🎭',
  shrine: '⛩️',
  forum: '📢',
  courthouse: '⚖️',
  'military-administration': '🛡️',
  regional_capital: '🏛️',
  safehouse: '🏠',
  'intelligence-agency': '🛡️',
  'security-bureau': '🔒',
  network_operations_center: '🖧',
  ai_safety_institute: '🛡️',
  drone_fabricator: '🛠️',
  electronic_warfare_array: '📶',
  civic_media_forum: '🗳️',
  vertical_farm: '🏙️',
  neural_rehabilitation_center: '🧠',
  ocean_robotics_yard: '⚓',
  circular_fabricator: '♻️',
  modular_arcology: '🏗️',
  carbon_capture_grid: '🌿',
  immersive_arts_lab: '🥽',
  national_ai_assurance_program: '🛡️',
  circular_manufacturing_network: '♻️',
  mars_robotics_initiative: '🚀',
  interstellar_launch_program: '🌌',
  // Units
  warrior: '⚔️',
  archer: '🏹',
  scout: '🔍',
  worker: '🪚',
  missionary: '🙏',
  settler: '🏕️',
  swordsman: '🗡️',
  pikeman: '🔱',
  musketeer: '🔫',
  galley: '⛵',
  trireme: '🚢',
  transport:        '⛴️',
  carrack:          '🚢',
  galleon:          '⛵',
  steamship:        '🛳️',
  troop_transport:  '🛥️',
  spy_scout: '👁️',
  spy_informant: '📡',
  spy_agent: '🕵️',
  spy_operative: '🎯',
  spy_intelligence_officer: '🗂️',
  spy_station_chief: '🧭',
  spy_hacker: '💻',
  scout_hound: '🐕',
  shadow_warden: '👤',
  war_hound: '🐺',
  beast_handler: '🐾',
  war_elephant: '🐘',
  // S4b — new unit icons
  axeman:      '🪓',
  spearman:    '🗼',
  horseman:    '🏇',
  chariot:     '🛞',
  cavalry:     '⚡',
  armored_car: '🚙',
  knight:      '♞',
  cuirassier:  '🛡️',
  crossbowman: '🪃',
  catapult:    '🪨',
  trebuchet:   '🏰',
  ballista:    '🔩',
  cannon:      '💣',
  artillery:   '💥',
  rocket_artillery: '🚀',
  grenadier:   '🧨',
  marine:      '⚓',
  rifleman:    '🎯',
  frigate:     '⛵',
  ironclad:    '⚓',
  // S4b — new building icons
  'bronze-workshop': '🔧',
  armory:            '⚔️',
  ranch:             '🐄',
  'cavalry-academy': '🎠',
  'iron-foundry':    '🏭',
  'war-academy':     '🏋️',
  'masonry-works':   '⛏️',
  'siege-workshop':  '🪚',
  // S5 — trade unit + buildings
  caravan:         '🐪',
  caravanserai:    '🏕️',
  // Trade Routes Overhaul (#553 MR2/4) — Land trade line successors to Caravan
  merchant_wagon:  '🛻',
  freight_convoy:  '🚛',
  // Trade Routes Overhaul (#553 MR1/4) — Naval Trader line
  naval_trader:     '⛴️',
  steamship_trader: '🛥️',
  cargo_freighter:  '📦',
  container_ship:   '🗃️',
  // Trade Routes Overhaul (#553 MR3/4) — Air trade line
  air_freighter:    '🛫',
  jet_freighter:    '🛬',
  global_air_cargo: '🌐',
  // Resource Accessibility MR 2b
  expedition:      '🧭',
  bank:            '🏦',
  stock_exchange:  '📈',
  // National Projects
  sacred_grove:         '🌳',
  tribal_muster_ground: '⚔️',
  communal_stores:      '🏚️',
  grand_bazaar:         '🪙',
  foundry_guild:        '⚒️',
  scribes_hall:         '📜',
  philosophers_circle:  '🏛️',
  road_corps:           '🛤️',
  iron_legion:          '🛡️',
  sacred_council:       '📿',
  imperial_archive:     '📚',
  praetorian_legion:    '⚔️',
  royal_mint:           '💰',
  royal_academy:        '🎓',
  artillery_corps_hq:   '💣',
  explorers_guild:      '🧭',
  // era 5 regular buildings
  guildhall:            '🏛️',
  university:           '🎓',
  art_gallery:          '🖼️',
  blast_furnace:        '🔩',
  distillery:           '🍶',
  monastery:            '⛪',
  // era 5 special buildings
  harbour_exchange:     '⚓',
  apothecary_house:     '🌿',
  // era 6 national projects
  military_academy:     '🎖️',
  grand_cipher_bureau:  '🔐',
  colonial_administration: '🗺️',
  // era 6 regular buildings
  natural_history_museum: '🦕',
  surgery_guild:        '⚕️',
  concert_hall:         '🎻',
  star_fort:            '⭐',
  bunker:               '🛡️',
  // era 7 regular buildings
  factory:              '🏭',
  steel_mill:           '⚙️',
  field_hospital:       '🏥',
  print_shop:           '📰',
  census_office:        '📋',
  // era 7 national projects
  national_railway:     '🚂',
  grand_arsenal:        '🔫',
  peoples_university:   '📖',
  // era 8 national projects
  world_fair:                  '🎪',
  national_archives_building:  '📚',
  imperial_general_staff:      '⚔️',
  // era 8 regular buildings
  steel_foundry:        '🏭',
  telephone_exchange:   '📞',
  labor_hall:           '✊',
  opera_house:          '🎭',
  bacteriology_lab:     '🔬',
  stock_exchange_tower: '🏢',
  sanatorium:           '🏥',
  power_station:        '⚡',
  exhibition_hall:      '🏛️',
  coastal_battery:      '💥',
  // era 8 units
  machine_gunner:  '🔫',
  pre_dreadnought: '🚢',
  battleship: '🚢',
  missile_cruiser: '🚢',
  infantry:   '🪖',
  mechanized_infantry: '🪖',
  paratrooper: '🪂',
  // era 9 buildings
  oil_refinery:         '🛢️',
  assembly_line:        '🏭',
  radio_station:        '📻',
  airfield:             '✈️',
  film_studio:          '🎬',
  national_insurance:   '🏥',
  hydroelectric_dam:    '⚡',
  research_institute:   '🔬',
  tank_depot:           '🛡️',
  anti_air_battery:     '🔫',
  air_force_command:    '🛫',
  // era 9 national projects
  mobilization_act:     '⚔️',
  state_broadcasting:   '📡',
  national_census:      '📊',
  // era 9 units
  tank:       '🛡️',
  main_battle_tank: '🛡️',
  anti_tank_gun: '🎯',
  mobile_aa: '🛡️',
  submarine:  '🌊',
  observation_balloon: '🎈',
  biplane:    '✈️',
  wwii_fighter: '🛩️',
  recon_aircraft: '🔭',
  jet_fighter: '🛩️',
  bomber:     '💣',
  carrier:    '🛳️',
  destroyer:  '🚤',
  naval_strike_aircraft: '💥',
  maritime_patrol_aircraft: '🔍',
  supercarrier: '🚢',
  // era 10 regular buildings
  nuclear_arsenal: '☢️',
  central_bank: '🏦',
  atomic_laboratory: '⚛️',
  radar_station: '📡',
  sam_site: '🛡️',
  un_delegation: '🕊️',
  rocket_program: '🚀',
  public_hospital: '🏥',
  chemical_plant: '🧪',
  nuclear_power_plant: '⚡',
  television_station: '📺',
  signals_bureau: '📻',
  // era 10 national projects
  manhattan_project: '💣',
  postwar_reconstruction: '🏗️',
  warhead: '☢️',
  space_program_initiative: '🚀',
  // era 11 regular buildings
  helicopter_base: '🚁',
  missile_silo: '🚀',
  semiconductor_fab: '💻',
  genetic_research_lab: '🔬',
  environmental_agency: '🌿',
  space_center: '🛸',
  agricultural_station: '🌾',
  transplant_hospital: '🏥',
  container_port: '🚢',
  research_network: '🌐',
  surveillance_agency: '🛰️',
  // era 11 national projects
  arms_control_treaty: '🕊️',
  green_revolution_program: '🌾',
  first_satellite_launch: '🛰️',
  strategic_air_command: '✈️',
  // era 11 units
  attack_helicopter: '🚁',
  missile_submarine: '🌊',
  combat_drone: '🛸',
  autonomous_frigate: '⚓',
  exosuit_infantry: '🦾',
  propagandist: '📣',
  drone_controller: '🎮',
  // Era 12 buildings
  automated_port: '⚓',
  biotech_lab: '🧬',
  broadcast_tower: '📺',
  cyber_defense_center: '🛡️',
  data_center: '🖥️',
  fintech_hub: '💳',
  gene_therapy_clinic: '🧪',
  precision_farm: '🌾',
  signals_hub: '📡',
  smart_grid: '⚡',
  stealth_airbase: '✈️',
  telemedicine_hub: '🏥',
  // Era 12 national projects
  planetary_data_grid: '🌐',
  global_logistics_network: '📦',
  orbital_fabrication_program: '🛰️',
  // Era 12 units
  cyber_unit: '🖥️',
  stealth_bomber: '🛩️',
};

export const PRODUCTION_ICON_FALLBACK = '🏗️';

export function getProductionDisplayName(itemId: string): string {
  const legendaryName = getLegendaryWonderDisplayName(itemId);
  if (legendaryName) return legendaryName;

  const building = BUILDINGS[itemId];
  if (building) return building.name;

  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  return unit?.name ?? itemId;
}

export function describeDroppedProductionItem(item: DroppedProductionItem, cityName: string): string {
  const name = getProductionDisplayName(item.itemId);
  switch (item.reason) {
    case 'obsoleted':
      return `${name} removed from ${cityName}'s build queue — it's obsolete now that a newer technology is available.`;
    case 'resource-lost':
      return `${name} removed from ${cityName}'s build queue — you no longer control the required resource.`;
    case 'no-longer-available':
      return `${name} removed from ${cityName}'s build queue — it's no longer available to train.`;
    case 'build-window-expired':
      return `${name} removed from ${cityName}'s build queue — its national-project build window has closed.`;
    case 'already-built-elsewhere':
      return `${name} removed from ${cityName}'s build queue — you already completed it in another city.`;
    case 'coastal-access-lost':
      return `${name} removed from ${cityName}'s build queue — the city is no longer coastal.`;
    case 'training-building-missing':
      return `${name} removed from ${cityName}'s build queue — ${cityName} no longer has the building required to train it.`;
    case 'air-base-unavailable':
      return `${name} removed from ${cityName}'s build queue — it needs a compatible air base with an available slot.`;
  }
}

export function getProductionIconForItem(itemId: string): string {
  return getLegendaryWonderQueueItemMetadata(itemId)?.icon
    ?? PRODUCTION_ICONS[itemId]
    ?? PRODUCTION_ICON_FALLBACK;
}
