import type { Building, TrainableUnitEntry, UnitType } from '@/core/types';
import { getTerminalCombatUnitReasons } from './combat-role-definitions';

/**
 * The static trainable-unit catalog plus the unit-type meta-lists that classify
 * it (#1008). Definitions only -- availability rules live in
 * `city-availability.ts` and pricing in `city-production-cost.ts`.
 */
export const TRAINABLE_UNITS: Array<TrainableUnitEntry & { pacing?: Building['pacing'] }> = [
  // warrior's role as cheap fallback ends once real militaries exist (era 2, Bronze Working).
  { type: 'warrior', name: 'Warrior', cost: 8, obsoletedByTech: 'bronze-working', upgradesTo: 'spearman', pacing: { band: 'starter', role: 'early-military', impact: 1, scope: 'military', snowball: 1, urgency: 1.2, situationality: 1, unlockBreadth: 1 } },
  { type: 'archer', name: 'Archer', cost: 35, techRequired: 'archery', obsoletedByTech: 'tactics', upgradesTo: 'crossbowman', pacing: { band: 'power-spike', role: 'ranged-breakpoint', impact: 1.15, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1, unlockBreadth: 1 } },
  { type: 'scout', name: 'Scout', cost: 6, pacing: { band: 'starter', role: 'early-exploration', impact: 1, scope: 'military', snowball: 1, urgency: 1.1, situationality: 1, unlockBreadth: 1 } },
  { type: 'worker', name: 'Worker', cost: 12 },
  { type: 'missionary', name: 'Missionary', cost: 16, trainedFromBuilding: 'temple' },
  { type: 'settler', name: 'Settler', cost: 24, pacing: { band: 'power-spike', role: 'expansion', impact: 1.25, scope: 'empire', snowball: 1.3, urgency: 1.05, situationality: 1, unlockBreadth: 1.2 } },
  { type: 'swordsman',    name: 'Swordsman',    cost: 50,  techRequired: 'bronze-working',   resourceRequired: ['iron'],   obsoletedByTech: 'rifled-infantry', upgradesTo: 'rifleman',        pacing: { band: 'power-spike', role: 'melee-breakpoint',       impact: 1.2,  scope: 'military', snowball: 1,   urgency: 1,    situationality: 1,    unlockBreadth: 1 } },
  { type: 'pikeman',      name: 'Pikeman',      cost: 70,  techRequired: 'fortification',    obsoletedByTech: 'rifled-infantry', upgradesTo: 'rifleman',                                        pacing: { band: 'power-spike', role: 'anti-cavalry-breakpoint', impact: 1.15, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1.05, unlockBreadth: 1 } },
  { type: 'musketeer',    name: 'Musketeer',    cost: 90,  techRequired: 'black-powder',   obsoletedByTech: 'rifled-infantry', upgradesTo: 'rifleman' },
  // galley's fighting line now upgrades into trireme (not the civilian carrack line).
  { type: 'galley',          name: 'Galley',          cost: 40,  techRequired: 'galleys',            coastalRequired: true, obsoletedByTech: 'triremes', upgradesTo: 'trireme' },
  { type: 'transport',       name: 'Transport',       cost: 45,  techRequired: 'galleys',            coastalRequired: true, obsoletedByTech: 'navigation', upgradesTo: 'carrack' },
  { type: 'carrack',         name: 'Carrack',         cost: 48,  techRequired: 'navigation',         coastalRequired: true, obsoletedByTech: 'triremes', upgradesTo: 'galleon' },
  { type: 'galleon',         name: 'Galleon',         cost: 80,  techRequired: 'triremes',           coastalRequired: true, obsoletedByTech: 'caravels', upgradesTo: 'steamship' },
  { type: 'steamship',       name: 'Steamship',       cost: 100, techRequired: 'caravels',           coastalRequired: true, obsoletedByTech: 'ironclad-warships', upgradesTo: 'troop_transport' },
  { type: 'troop_transport', name: 'Troop Transport', cost: 120, techRequired: 'amphibious-warfare', coastalRequired: true },
  // trireme now covers eras 3-5 and upgrades into the frigate (fighting line), not the civilian steamship.
  { type: 'trireme',         name: 'Trireme',         cost: 70,  techRequired: 'triremes',           coastalRequired: true, obsoletedByTech: 'frigate-construction', upgradesTo: 'frigate', pacing: { band: 'power-spike', role: 'naval-breakpoint', impact: 1.15, scope: 'military', snowball: 1, urgency: 1, situationality: 1.1, unlockBreadth: 1 } },
  { type: 'frigate',         name: 'Frigate',         cost: 140, techRequired: 'frigate-construction', coastalRequired: true, obsoletedByTech: 'ironclad-warships', upgradesTo: 'ironclad', pacing: { band: 'power-spike', role: 'naval-escort-breakpoint', impact: 1.3, scope: 'military', snowball: 1.2, urgency: 1.1, situationality: 1.3, unlockBreadth: 1 } },
  // S4b — melee
  { type: 'axeman',       name: 'Axeman',       cost: 22,  techRequired: 'stone-weapons',    resourceRequired: ['copper'],         obsoletedByTech: 'fortification', upgradesTo: 'pikeman', pacing: { band: 'power-spike', role: 'early-copper-melee',    impact: 1.1,  scope: 'military', snowball: 1,   urgency: 1.05, situationality: 1.1,  unlockBreadth: 1 } },
  { type: 'spearman',     name: 'Spearman',     cost: 54,  techRequired: 'bronze-working',                                        obsoletedByTech: 'fortification', upgradesTo: 'pikeman', pacing: { band: 'power-spike', role: 'ungated-era2-melee',    impact: 1.05, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1,    unlockBreadth: 1 } },
  { type: 'horseman',     name: 'Horseman',     cost: 55,  techRequired: 'horseback-riding', resourceRequired: ['horses'],           obsoletedByTech: 'tank-warfare', upgradesTo: 'tank',                       pacing: { band: 'power-spike', role: 'basic-cavalry',         impact: 1.15, scope: 'military', snowball: 1,   urgency: 1.05, situationality: 1.1,  unlockBreadth: 1 } },
  { type: 'chariot',      name: 'Chariot',      cost: 65,  techRequired: 'wheel', requiredTechs: ['horseback-riding'], resourceRequired: ['horses'], obsoletedByTech: 'iron-forging', upgradesTo: 'knight', pacing: { band: 'power-spike', role: 'ancient-heavy-mobile', impact: 1.2, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.2, unlockBreadth: 1 } },
  { type: 'cavalry',      name: 'Cavalry',      cost: 140, techRequired: 'rifle-tactics', requiredTechs: ['professional-army'], resourceRequired: ['horses'], obsoletedByTech: 'motorized-transport', upgradesTo: 'armored_car', pacing: { band: 'power-spike', role: 'heavy-cavalry', impact: 1.2, scope: 'military', snowball: 1.1, urgency: 1, situationality: 1.1, unlockBreadth: 1 } },
  { type: 'armored_car',  name: 'Armored Car',  cost: 168, techRequired: 'motorized-transport', obsoletedByTech: 'helicopter-warfare', upgradesTo: 'attack_helicopter', pacing: { band: 'power-spike', role: 'light-mobile-recon', impact: 1.2, scope: 'military', snowball: 1.05, urgency: 1, situationality: 1.25, unlockBreadth: 1 } },
  { type: 'knight',       name: 'Knight',       cost: 80,  techRequired: 'iron-forging',     resourceRequired: ['horses', 'iron'],   obsoletedByTech: 'rifle-tactics', upgradesTo: 'cuirassier',                  pacing: { band: 'power-spike', role: 'heavy-cavalry-apex',    impact: 1.25, scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.1,  unlockBreadth: 1 } },
  { type: 'cuirassier',   name: 'Cuirassier',   cost: 150, techRequired: 'rifle-tactics', requiredTechs: ['professional-army'], resourceRequired: ['horses', 'iron'], obsoletedByTech: 'tank-warfare', upgradesTo: 'tank', pacing: { band: 'power-spike', role: 'heavy-cavalry', impact: 1.2, scope: 'military', snowball: 1.1, urgency: 1, situationality: 1.1, unlockBreadth: 1 } },
  // S4b — ranged + siege
  { type: 'marine',       name: 'Marine',       cost: 125, techRequired: 'amphibious-warfare', coastalRequired: true, obsoletedByTech: 'mass-firepower', upgradesTo: 'machine_gunner' },
  { type: 'crossbowman',  name: 'Crossbowman',  cost: 75,  techRequired: 'tactics',          resourceRequired: ['copper'],  obsoletedByTech: 'rifled-infantry', upgradesTo: 'rifleman',        pacing: { band: 'power-spike', role: 'precision-ranged',      impact: 1.15, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1.05, unlockBreadth: 1 } },
  { type: 'catapult',     name: 'Catapult',     cost: 110, techRequired: 'siege-warfare',    resourceRequired: ['stone'],   obsoletedByTech: 'black-powder', upgradesTo: 'trebuchet',                   pacing: { band: 'power-spike', role: 'siege-bombardment',    impact: 1.2,  scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.2,  unlockBreadth: 1 } },
  // band: 'marquee' (not 'power-spike' like Catapult/Ballista) — the dual Siege Warfare +
  // Fortresses gate and 125 cost push its estimated build time past the power-spike window's
  // era-4 ceiling (11 turns at 10 production/turn); marquee's wider [10,16] window fits the
  // 13-turn estimate. See tests/systems/pacing-audit.test.ts.
  { type: 'trebuchet',    name: 'Trebuchet',    cost: 125, techRequired: 'siege-warfare', requiredTechs: ['fortresses'], obsoletedByTech: 'black-powder', upgradesTo: 'cannon',                   pacing: { band: 'marquee', role: 'city-siege-specialist', impact: 1.2, scope: 'military', snowball: 1.05, urgency: 1, situationality: 1.3, unlockBreadth: 1 } },
  { type: 'ballista',     name: 'Ballista',     cost: 100, techRequired: 'siege-warfare',    resourceRequired: ['iron'],    obsoletedByTech: 'black-powder', upgradesTo: 'cannon',                      pacing: { band: 'power-spike', role: 'anti-unit-siege',      impact: 1.15, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1.15, unlockBreadth: 1 } },
  { type: 'cannon',       name: 'Cannon',       cost: 120, techRequired: 'black-powder',                                      obsoletedByTech: 'mass-firepower', upgradesTo: 'artillery',    pacing: { band: 'power-spike', role: 'gunpowder-siege',      impact: 1.3,  scope: 'military', snowball: 1.2, urgency: 1.1,  situationality: 1.2,  unlockBreadth: 1 } },
  { type: 'grenadier',    name: 'Grenadier',    cost: 130, techRequired: 'grenade-warfare',  obsoletedByTech: 'mass-firepower', upgradesTo: 'machine_gunner',                                                    pacing: { band: 'power-spike', role: 'anti-fortification',   impact: 1.2,  scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.3,  unlockBreadth: 1 } },
  { type: 'rifleman',     name: 'Rifleman',     cost: 145, techRequired: 'rifled-infantry',  obsoletedByTech: 'mass-firepower', upgradesTo: 'machine_gunner',                                                     pacing: { band: 'power-spike', role: 'ranged-infantry',      impact: 1.3,  scope: 'military', snowball: 1.2, urgency: 1.1,  situationality: 1.2,  unlockBreadth: 1 } },
  { type: 'artillery',    name: 'Artillery',    cost: 190, techRequired: 'mass-firepower', obsoletedByTech: 'rocketry', upgradesTo: 'rocket_artillery', pacing: { band: 'power-spike', role: 'siege-apex',           impact: 1.4,  scope: 'military', snowball: 1.2, urgency: 1.1,  situationality: 1.3,  unlockBreadth: 1 } },
  { type: 'rocket_artillery', name: 'Rocket Artillery', cost: 260, techRequired: 'rocketry', pacing: { band: 'marquee', role: 'saturation-siege', impact: 1.5, scope: 'military', snowball: 1.2, urgency: 1.1, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'ironclad',     name: 'Ironclad',     cost: 160, techRequired: 'ironclad-warships', coastalRequired: true,         obsoletedByTech: 'naval-armor', upgradesTo: 'pre_dreadnought',       pacing: { band: 'power-spike', role: 'naval-superiority',    impact: 1.4,  scope: 'military', snowball: 1.3, urgency: 1.2,  situationality: 1.4,  unlockBreadth: 1 } },
  { type: 'machine_gunner', name: 'Machine Gunner', cost: 145, techRequired: 'mass-firepower',   obsoletedByTech: 'armored-tactics', upgradesTo: 'infantry',                             pacing: { band: 'power-spike', role: 'ranged-suppression',  impact: 1.35, scope: 'military', snowball: 1.2, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 } },
  { type: 'infantry',       name: 'Infantry',       cost: 195, techRequired: 'armored-tactics', obsoletedByTech: 'neural-prosthetics', upgradesTo: 'mechanized_infantry', pacing: { band: 'power-spike', role: 'modern-line-infantry', impact: 1.4,  scope: 'military', snowball: 1.3, urgency: 1.1,  situationality: 1.2,  unlockBreadth: 1 } },
  { type: 'mechanized_infantry', name: 'Mechanized Infantry', cost: 220, techRequired: 'armored-tactics', requiredTechs: ['motorized-transport'], trainedFromBuilding: 'tank_depot', obsoletedByTech: 'neural-prosthetics', upgradesTo: 'exosuit_infantry', pacing: { band: 'power-spike', role: 'mobile-line-infantry', impact: 1.45, scope: 'military', snowball: 1.3, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 } },
  { type: 'paratrooper', name: 'Paratrooper', cost: 210, techRequired: 'air-superiority', requiredTechs: ['armored-tactics'], pacing: { band: 'power-spike', role: 'airborne-repositioning', impact: 1.15, scope: 'military', snowball: 1.0, urgency: 1.0, situationality: 1.6, unlockBreadth: 1 } },
  { type: 'pre_dreadnought', name: 'Pre-Dreadnought', cost: 175, techRequired: 'naval-armor', coastalRequired: true, obsoletedByTech: 'dreadnought-construction', upgradesTo: 'battleship', pacing: { band: 'power-spike', role: 'naval-apex',           impact: 1.5,  scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'battleship', name: 'Battleship', cost: 240, techRequired: 'dreadnought-construction', coastalRequired: true, obsoletedWhenAllTechs: ['carrier-warfare', 'radar-systems', 'rocketry'], upgradesTo: 'missile_cruiser', pacing: { band: 'marquee', role: 'capital-ship-fire-support', impact: 1.6, scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.5, unlockBreadth: 1 } },
  { type: 'missile_cruiser', name: 'Missile Cruiser', cost: 285, techRequired: 'carrier-warfare', requiredTechs: ['radar-systems', 'rocketry'], coastalRequired: true, pacing: { band: 'marquee', role: 'fleet-air-defense', impact: 1.6, scope: 'military', snowball: 1.35, urgency: 1.15, situationality: 1.5, unlockBreadth: 1 } },
  { type: 'tank',      name: 'Tank',      cost: 185, techRequired: 'tank-warfare', obsoletedByTech: 'precision-engineering', upgradesTo: 'main_battle_tank',          pacing: { band: 'power-spike', role: 'armored-assault',     impact: 1.5,  scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  { type: 'main_battle_tank', name: 'Main Battle Tank', cost: 270, techRequired: 'precision-engineering', requiredTechs: ['armored-tactics'], pacing: { band: 'marquee', role: 'combined-arms-breakthrough', impact: 1.6, scope: 'military', snowball: 1.35, urgency: 1.15, situationality: 1.35, unlockBreadth: 1 } },
  { type: 'anti_tank_gun', name: 'Anti-Tank Gun', cost: 170, techRequired: 'tank-warfare', pacing: { band: 'power-spike', role: 'armor-counter', impact: 1.3, scope: 'military', snowball: 1.1, urgency: 1.1, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'mobile_aa', name: 'Mobile AA', cost: 175, techRequired: 'air-superiority', pacing: { band: 'power-spike', role: 'field-air-defense', impact: 1.25, scope: 'military', snowball: 1.05, urgency: 1.1, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'submarine', name: 'Submarine', cost: 180, techRequired: 'submarine-warfare', coastalRequired: true,                                                      pacing: { band: 'power-spike', role: 'naval-stealth',        impact: 1.5,  scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.5, unlockBreadth: 1 } },
  { type: 'observation_balloon', name: 'Observation Balloon', cost: 144,  techRequired: 'balloon-corps',   pacing: { band: 'power-spike', role: 'air-recon',  impact: 1.2, scope: 'military', snowball: 1.0, urgency: 1.0, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'biplane',             name: 'Biplane',             cost: 200, techRequired: 'aviation', trainedFromBuilding: 'airfield', obsoletedByTech: 'air-superiority', upgradesTo: 'wwii_fighter', pacing: { band: 'power-spike', role: 'air-strike', impact: 1.5, scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  { type: 'wwii_fighter',        name: 'World War II Fighter', cost: 240, techRequired: 'air-superiority', trainedFromBuilding: 'airfield', obsoletedByTech: 'jet-aviation', upgradesTo: 'jet_fighter', pacing: { band: 'marquee', role: 'air-superiority', impact: 1.55, scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  // jet_fighter is the terminal postwar fighter; the bomber (below) is the strike line,
  // not a fighter upgrade — researching stealth tech without a Stealth Airbase must not zero out
  // trainable air units.
  { type: 'jet_fighter',         name: 'Jet Fighter',         cost: 300, techRequired: 'jet-aviation',    trainedFromBuilding: 'airfield', pacing: { band: 'marquee',      role: 'air-apex',   impact: 1.6, scope: 'military', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  { type: 'recon_aircraft',      name: 'Recon Aircraft',      cost: 230, techRequired: 'jet-aviation',    trainedFromBuilding: 'airfield', pacing: { band: 'power-spike',  role: 'air-recon',  impact: 1.35, scope: 'military', snowball: 1.1, urgency: 1.1, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'bomber',              name: 'Bomber',              cost: 280, techRequired: 'nuclear-weapons', trainedFromBuilding: 'airfield', obsoletedByTech: 'stealth-technology', upgradesTo: 'stealth_bomber', pacing: { band: 'marquee', role: 'strategic-bombing', impact: 1.6, scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'carrier',             name: 'Carrier',             cost: 220, techRequired: 'carrier-warfare', coastalRequired: true, obsoletedByTech: 'ocean-robotics', upgradesTo: 'supercarrier', pacing: { band: 'power-spike', role: 'naval-projection', impact: 1.5, scope: 'military', snowball: 1.4, urgency: 1.1, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'destroyer',           name: 'Destroyer',           cost: 210, techRequired: 'carrier-warfare', coastalRequired: true, obsoletedByTech: 'ocean-robotics', upgradesTo: 'autonomous_frigate', pacing: { band: 'power-spike', role: 'naval-escort-apex', impact: 1.55, scope: 'military', snowball: 1.45, urgency: 1.2, situationality: 1.5, unlockBreadth: 1 } },
  { type: 'naval_strike_aircraft', name: 'Naval Strike Aircraft', cost: 235, techRequired: 'carrier-warfare', trainedFromBuilding: 'airfield', pacing: { band: 'power-spike', role: 'naval-strike', impact: 1.4, scope: 'military', snowball: 1.2, urgency: 1.15, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'maritime_patrol_aircraft', name: 'Maritime Patrol Aircraft', cost: 210, techRequired: 'radar-systems', requiredTechs: ['carrier-warfare'], trainedFromBuilding: 'airfield', pacing: { band: 'power-spike', role: 'maritime-patrol', impact: 1.3, scope: 'military', snowball: 1.05, urgency: 1.05, situationality: 1.45, unlockBreadth: 1 } },
  // Era 11 units
  { type: 'attack_helicopter', name: 'Attack Helicopter', cost: 230, techRequired: 'helicopter-warfare', trainedFromBuilding: 'helicopter_base', obsoletedByTech: 'autonomous-weapons-systems', upgradesTo: 'combat_drone', pacing: { band: 'marquee', role: 'air-assault', impact: 1.55, scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
  { type: 'missile_submarine', name: 'Missile Submarine', cost: 250, techRequired: 'nuclear-submarines', coastalRequired: true, resourceRequired: ['uranium'], pacing: { band: 'marquee', role: 'naval-deterrent', impact: 1.6, scope: 'military', snowball: 1.5, urgency: 1.2, situationality: 1.5, unlockBreadth: 1 } },
  // Era 12 units
  { type: 'cyber_unit', name: 'Cyber Unit', cost: 338, techRequired: 'cyber-warfare', pacing: { band: 'marquee', role: 'cyber-saboteur', impact: 1.4, scope: 'military', snowball: 1.2, urgency: 1.1, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'stealth_bomber', name: 'Stealth Bomber', cost: 360, techRequired: 'stealth-technology', trainedFromBuilding: 'stealth_airbase', pacing: { band: 'marquee', role: 'stealth-strike', impact: 1.7, scope: 'military', snowball: 1.5, urgency: 1.3, situationality: 1.5, unlockBreadth: 1 } },
  { type: 'combat_drone', name: 'Combat Drone', cost: 224, techRequired: 'autonomous-weapons-systems', trainedFromBuilding: 'drone_fabricator', pacing: { band: 'power-spike', role: 'coordinated-air-support', impact: 1.35, scope: 'military', snowball: 1.1, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 } },
  { type: 'autonomous_frigate', name: 'Autonomous Frigate', cost: 336, techRequired: 'ocean-robotics', coastalRequired: true, trainedFromBuilding: 'ocean_robotics_yard', pacing: { band: 'marquee', role: 'autonomous-naval', impact: 1.5, scope: 'military', snowball: 1.2, urgency: 1.15, situationality: 1.25, unlockBreadth: 1 } },
  { type: 'supercarrier', name: 'Supercarrier', cost: 340, techRequired: 'ocean-robotics', coastalRequired: true, pacing: { band: 'marquee', role: 'naval-projection-apex', impact: 1.65, scope: 'military', snowball: 1.5, urgency: 1.15, situationality: 1.4, unlockBreadth: 1 } },
  { type: 'exosuit_infantry', name: 'Exosuit Infantry', cost: 196, techRequired: 'neural-prosthetics', pacing: { band: 'core', role: 'advanced-line-infantry', impact: 1.3, scope: 'military', snowball: 1.1, urgency: 1.1, situationality: 1, unlockBreadth: 1 } },
  { type: 'propagandist', name: 'Propagandist', cost: 196, techRequired: 'synthetic-media-operations', pacing: { band: 'specialist', role: 'civic-pressure', impact: 1.15, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.2, unlockBreadth: 1 } },
  { type: 'drone_controller', name: 'Drone Controller', cost: 196, techRequired: 'autonomous-weapons-systems', trainedFromBuilding: 'drone_fabricator', pacing: { band: 'specialist', role: 'formation-coordination', impact: 1.15, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.2, unlockBreadth: 1 } },
  { type: 'spy_scout', name: 'Scout Agent', cost: 30, techRequired: 'espionage-scouting', obsoletedByTech: 'espionage-informants', upgradesTo: 'spy_informant', pacing: { band: 'power-spike', role: 'first-spy-unit', impact: 1.15, scope: 'military', snowball: 1.1, urgency: 1.1, situationality: 1.1, unlockBreadth: 1.1 } },
  { type: 'spy_informant', name: 'Informant', cost: 50, techRequired: 'espionage-informants', obsoletedByTech: 'spy-networks', upgradesTo: 'spy_agent', pacing: { band: 'power-spike', role: 'spy-capability-breakpoint', impact: 1.15, scope: 'military', snowball: 1.1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1.1 } },
  { type: 'spy_agent', name: 'Field Agent', cost: 70, techRequired: 'spy-networks', obsoletedByTech: 'cryptography', upgradesTo: 'spy_operative', pacing: { band: 'power-spike', role: 'spy-capability-breakpoint', impact: 1.2, scope: 'military', snowball: 1.1, urgency: 1, situationality: 1.1, unlockBreadth: 1.1 } },
  { type: 'spy_operative', name: 'Operative', cost: 90, techRequired: 'cryptography', obsoletedByTech: 'covert-operations', upgradesTo: 'spy_intelligence_officer' },
  { type: 'spy_intelligence_officer', name: 'Intelligence Officer', cost: 140, techRequired: 'covert-operations', obsoletedByTech: 'counterintelligence', upgradesTo: 'spy_station_chief' },
  { type: 'spy_station_chief', name: 'Station Chief', cost: 185, techRequired: 'counterintelligence', obsoletedByTech: 'cyber-warfare', upgradesTo: 'spy_hacker' },
  { type: 'spy_hacker', name: 'Cyber Operative', cost: 234, techRequired: 'cyber-warfare' },
  { type: 'scout_hound', name: 'Scout Hound', cost: 36, techRequired: 'lookouts', obsoletedByTech: 'horseback-riding', upgradesTo: 'beast_handler', pacing: { band: 'power-spike', role: 'spy-detection', impact: 1.15, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.15, unlockBreadth: 1 } },
  { type: 'shadow_warden', name: 'Shadow Warden', cost: 36, techRequired: 'lookouts', civTypeRequired: 'persia', replacesUnit: 'scout_hound', pacing: { band: 'power-spike', role: 'unique-spy-detection', impact: 1.2, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.15, unlockBreadth: 1 } },
  { type: 'war_hound', name: 'War Hound', cost: 32, techRequired: 'lookouts', civTypeRequired: 'rome', replacesUnit: 'scout_hound', obsoletedByTech: 'horseback-riding', upgradesTo: 'beast_handler', pacing: { band: 'power-spike', role: 'unique-spy-detection-combat', impact: 1.1, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1.1, unlockBreadth: 1 } },
  { type: 'beast_handler', name: 'Beast Handler Company', cost: 72, techRequired: 'horseback-riding', obsoletedByTech: 'tactics', upgradesTo: 'war_elephant', pacing: { band: 'marquee', role: 'detection-support', impact: 1.2, scope: 'military', snowball: 1, urgency: 1, situationality: 1.15, unlockBreadth: 1 } },
  { type: 'war_elephant', name: 'War Elephant Corps', cost: 110, techRequired: 'tactics', pacing: { band: 'power-spike', role: 'era-4-shock', impact: 1.5, scope: 'military', snowball: 1.15, urgency: 1.15, situationality: 1.15, unlockBreadth: 1 } },
  // S5 — trade unit
  // Trade Routes Overhaul (#553 MR2/4) — Caravan now upgrades into the land trade line.
  { type: 'caravan', name: 'Caravan', cost: 60, techRequired: 'trade-routes', obsoletedByTech: 'mercantilism', upgradesTo: 'merchant_wagon' },
  { type: 'merchant_wagon', name: 'Merchant Wagon', cost: 90, techRequired: 'mercantilism', obsoletedByTech: 'highway-network', upgradesTo: 'freight_convoy' },
  { type: 'freight_convoy', name: 'Freight Convoy', cost: 220, techRequired: 'highway-network' },
  // Trade Routes Overhaul (#553 MR1/4) — Naval Trader line, fixes naval trade routes
  // (previously impossible: canEstablishRoute hardcoded 'land' pathfinding).
  { type: 'naval_trader',     name: 'Naval Trader',     cost: 75,  techRequired: 'colonial-trade',     coastalRequired: true, obsoletedByTech: 'steam-navigation',    upgradesTo: 'steamship_trader' },
  { type: 'steamship_trader', name: 'Steamship Trader', cost: 120, techRequired: 'steam-navigation',   coastalRequired: true, obsoletedByTech: 'convoy-system',       upgradesTo: 'cargo_freighter' },
  { type: 'cargo_freighter',  name: 'Cargo Freighter',  cost: 170, techRequired: 'convoy-system',      coastalRequired: true, obsoletedByTech: 'container-shipping',  upgradesTo: 'container_ship' },
  { type: 'container_ship',   name: 'Container Ship',   cost: 260, techRequired: 'container-shipping', coastalRequired: true },
  // Trade Routes Overhaul (#553 MR3/4) — Air trade line. No coastalRequired (air units
  // aren't terrain-gated).
  { type: 'air_freighter',    name: 'Air Freighter',    cost: 150, techRequired: 'air-superiority', obsoletedByTech: 'jet-aviation',    upgradesTo: 'jet_freighter' },
  { type: 'jet_freighter',    name: 'Jet Freighter',    cost: 230, techRequired: 'jet-aviation',    obsoletedByTech: 'digital-economy', upgradesTo: 'global_air_cargo' },
  // cost 320 → 286: at 320 it took 13 production turns vs the era-12 unit target window
  // of 7-11 (pacing-audit.test.ts), tripping the outlier gate. 286 lands at the window's
  // upper bound (11 turns) rather than the audit's raw recommendedCost (234) — 234 would
  // have priced Global Air Cargo only 4 gold above Jet Freighter (230), an almost
  // nonexistent tier gap that undercuts the top-tier unit's "biggest investment" feel
  // (compare the land/naval trade lines' much larger tier-to-tier cost jumps). See
  // game-balance.md's Pacing Regression Prevention rule.
  { type: 'global_air_cargo', name: 'Global Air Cargo', cost: 286, techRequired: 'digital-economy' },
  // Resource Accessibility MR 2b — exploration unit
  { type: 'expedition', name: 'Expedition', cost: 18, techRequired: 'foraging' },
];

/**
 * Combat-capable units (UNIT_DEFINITIONS[type].strength > 0) intentionally left without
 * obsoletedByTech, with a reason each. Enforced by the completeness test in
 * tests/systems/city-system.test.ts — a new combat unit added to TRAINABLE_UNITS without
 * either obsoletedByTech or an entry here will fail that test.
 */
export const TERMINAL_COMBAT_UNITS = getTerminalCombatUnitReasons();

export const MELEE_RANGED_UNIT_TYPES: string[] = [
  'warrior', 'axeman', 'spearman', 'swordsman', 'pikeman', 'musketeer', 'archer', 'crossbowman',
];

// era-1/2 melee units eligible for the Tribal Muster Ground national-project discount.
export const ERA_1_2_MELEE_UNIT_TYPES: UnitType[] = ['warrior', 'axeman', 'spearman', 'swordsman'];
