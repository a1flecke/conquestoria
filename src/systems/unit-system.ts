import type { UnitType, Unit, HexCoord, GameState, CivBonusEffect, IdCounters } from '@/core/types';
import { getZoneOfControlAt } from './zone-of-control-system';
import { UNIT_DEFINITIONS } from './unit-definitions';

// ── #1010 barrel ────────────────────────────────────────────────────────────
// The unit catalog and the movement subsystem were extracted into cohesive
// modules; unit-system.ts keeps unit lifecycle + healing + player-facing copy
// and re-exports the rest so the ~200 files importing from
// '@/systems/unit-system' are unchanged. Explicit named re-exports (never
// `export *`) so the public surface is exactly the pre-split set — the four
// sibling-only helpers in unit-movement-cost.ts (terrainCostForParams,
// isPassableForParams, hasRoadMovementDiscount, isPassableForUnitInContext) are
// deliberately NOT re-exported.
export { UNIT_DEFINITIONS } from './unit-definitions';
export {
  getMovementCost,
  getMovementCostForUnit,
  canHullEnterOcean,
  getMovementCostForUnitInContext,
  getMovementStepCostFor,
  movementStepCostParamsForType,
  getMovementStepCost,
  type MovementStepCostParams,
  type UnitMovementContext,
} from './unit-movement-cost';
export {
  BLOCKING_MAP_ENTITY_MESSAGES,
  isBlockingCityFor,
  getBlockingMapEntityAt,
  getBlockingMapEntityKeys,
  type UnitMovementBlockerCode,
  type BlockingMapEntity,
} from './unit-movement-legality';
export { findPath, findPathToCity } from './unit-pathfinding';
export {
  getMovementBlockerReason,
  getMovementRange,
  getMovementRangeDetails,
  type MovementBlockerReason,
  type MovementRangeDetails,
} from './unit-movement-queries';

const VIKING_MOBILITY_UNITS = new Set<UnitType>(['scout', 'warrior', 'archer', 'swordsman']);

export function createUnit(
  type: UnitType,
  owner: string,
  position: HexCoord,
  counters: IdCounters,
  bonusEffect?: CivBonusEffect,
): Unit {
  const movementBonus =
    bonusEffect?.type === 'naval_raiding' && VIKING_MOBILITY_UNITS.has(type)
      ? bonusEffect.movementBonus
      : 0;
  const definition = UNIT_DEFINITIONS[type];
  return {
    id: `unit-${counters.nextUnitId++}`,
    type,
    owner,
    position: { ...position },
    movementPointsLeft: UNIT_DEFINITIONS[type].movementPoints + movementBonus,
    movementBonus: movementBonus || undefined,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    chargesRemaining: type === 'worker' ? 2 : undefined,
    isResting: false,
    cargoUnitIds: definition.cargoCapacity !== undefined ? [] : undefined,
  };
}

export function moveUnit(unit: Unit, to: HexCoord, cost: number): Unit {
  return {
    ...unit,
    position: { ...to },
    movementPointsLeft: Math.max(0, unit.movementPointsLeft - cost),
    hasMoved: true,
    isFortified: undefined,
  };
}

export function moveUnitWithZoneOfControl(
  state: Readonly<GameState>, unit: Unit, to: HexCoord, cost: number,
): { unit: Unit; stopped: boolean } {
  const moved = moveUnit(unit, to, cost);
  const stopped = getZoneOfControlAt(state, moved, to).limited;
  return { unit: stopped ? { ...moved, movementPointsLeft: 0 } : moved, stopped };
}

export function resetUnitTurn(unit: Unit): Unit {
  // revealedThisTurn (#542 reveal-on-fire), generalNoCommandThisTurn (#544
  // MR3: "operational next owner turn"), rallyProtectedThisRound (#544 MR4:
  // "prevent worsening again until next owner turn"), and
  // hasCapturedCityThisTurn (#544 MR4: "no chained captures in one turn")
  // must all clear here alongside skippedTurn/interceptedTurn -- this is the
  // one place every other per-owner-turn transient flag already resets.
  const {
    skippedTurn: _skippedTurn,
    interceptedTurn: _interceptedTurn,
    revealedThisTurn: _revealedThisTurn,
    generalNoCommandThisTurn: _generalNoCommandThisTurn,
    rallyProtectedThisRound: _rallyProtectedThisRound,
    hasCapturedCityThisTurn: _hasCapturedCityThisTurn,
    // #887 MR1: Seize's recording-only battle-influence marker is per-owner-turn,
    // like rallyProtectedThisRound above.
    seizeGrantedBy: _seizeGrantedBy,
    ...rest
  } = unit;
  // #544: severe overextension reduces movement by 1, never below 1 (contract §3.3/§29).
  const severeSupplyPenalty = unit.landSupply?.state === 'severe' ? 1 : 0;
  const base: Unit = {
    ...rest,
    movementPointsLeft: Math.max(
      1,
      UNIT_DEFINITIONS[unit.type].movementPoints + (unit.movementBonus ?? 0) - severeSupplyPenalty,
    ),
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
  if (base.workerTask) {
    return { ...base, movementPointsLeft: 0, hasActed: true };
  }
  return base;
}

// --- Healing constants ---
export const HEAL_PASSIVE = 5;    // HP/turn when idle (didn't move or act)
export const HEAL_RESTING = 15;   // HP/turn when player explicitly rests
export const HEAL_IN_CITY = 20;   // HP/turn when in a friendly city
export const HEAL_IN_TERRITORY = 10; // HP/turn when in friendly territory

export function canHeal(unit: Unit): boolean {
  return unit.health < 100;
}

export function healUnit(
  unit: Unit,
  inFriendlyCity: boolean,
  inFriendlyTerritory: boolean,
  bonus?: { flat: number; mult: number },
): Unit {
  if (unit.health >= 100) return unit;

  let healAmount: number;
  if (inFriendlyCity) {
    healAmount = HEAL_IN_CITY;
  } else if (unit.isResting) {
    healAmount = HEAL_RESTING;
  } else if (inFriendlyTerritory) {
    healAmount = HEAL_IN_TERRITORY;
  } else if (!unit.hasMoved && !unit.hasActed) {
    healAmount = HEAL_PASSIVE;
  } else {
    return unit; // moved or acted without resting — no heal
  }

  if (bonus) {
    // Flat tech/NP bonuses stack first; the single multiplier (mindfulness-movement) applies last.
    healAmount = Math.round((healAmount + bonus.flat) * bonus.mult);
  }

  return { ...unit, health: Math.min(100, unit.health + healAmount) };
}

export function restUnit(unit: Unit): Unit {
  return {
    ...unit,
    isResting: true,
    hasActed: true,   // resting uses the action for the turn
    movementPointsLeft: 0,
  };
}

export const UNIT_DESCRIPTIONS: Record<UnitType, string> = {
  settler: 'Civilian unit that can found new cities',
  worker: 'Civilian unit that builds tile improvements. Workers have 2 action charges by default and are used up after spending the last charge.',
  missionary: 'Civilian unit that spreads your faith. Preach in a city to push it toward your religion — preaching a city your own faith already lost brings it back fastest. Missionaries start with 2 charges (3 once Missionary Zeal is researched) and are used up after the last charge.',
  scout: 'Fast exploration unit with extended vision',
  warrior: 'Basic melee fighter — your first line of defense. Cheap fallback that fades out once real militaries exist; upgrades into the spearman.',
  archer: 'Ranged unit that attacks from a distance. Upgrades into the crossbowman once Tactics is researched and Copper is available.',
  swordsman: 'Stronger melee fighter, requires Bronze Working',
  pikeman: 'Anti-cavalry specialist, requires Fortification',
  musketeer: 'Gunpowder infantry, requires Black Powder. Weaker than the rifleman it upgrades into — the line-infantry role only really arrives with rifled muskets.',
  galley: 'Coastal vessel for exploration and early naval patrols. Cannot enter open ocean.',
  trireme: 'Warship with strong naval combat capabilities. Ocean-capable — can sail beyond the coast.',
  transport:        'Civilian ship that carries up to 2 land units between coasts. Cannot attack.',
  carrack:          'Successor to the Transport. Carries up to 3 land units across coasts and oceans.',
  galleon:          'Successor to the Carrack. Broader hull, carries up to 4 land units.',
  steamship:        'Steam-powered successor to the Galleon. Carries up to 5 land units reliably.',
  troop_transport:  'Military-grade vessel. Carries up to 6 land units across any ocean.',
  pirate_galley: 'An improvised oared raider that preys on early coastal traffic. Pirate-only and never city-trainable.',
  pirate_corsair: 'A swift lateen-rigged xebec built to overtake merchants and escape heavier patrols.',
  pirate_frigate: 'A captured broadside frigate refitted for long-range piracy while older corsairs remain in service.',
  pirate_ironclad: 'An armored steam raider combining industrial protection with the mobility of an outlaw fleet.',
  pirate_fast_attack_craft: 'A modern high-speed strike boat used by breakaway forces and mercenary flotillas.',
  pirate_mothership: 'A converted command vessel that supports modern pirate craft while coordinating older warships.',
  spy_scout: 'Lightly trained scout agent. Move to an enemy city and attempt to infiltrate. Era 1: infiltration and scouting resolve in one action.',
  spy_informant: 'Experienced informant. Infiltrates cities for multi-turn intelligence operations. Unlocks disguise.',
  spy_agent: 'Skilled field operative. Conducts sabotage, tech theft, and disruption missions.',
  spy_operative: 'Elite spy. Capable of high-stakes operations — assassination, forgery, arms smuggling.',
  spy_intelligence_officer: 'Senior field spy who runs covert operations against rival powers. Trained to sabotage, steal, and disrupt with greater success than an Operative.',
  spy_station_chief: 'Veteran spy commanding an intelligence network. Runs the most demanding covert operations with better odds than an Intelligence Officer.',
  spy_hacker: 'Cyber operative. Remote and digital warfare missions; hardest to detect.',
  scout_hound: 'Detection unit. Patrols territory and has a 35% chance per turn to reveal disguised or stealthed spy units within vision range.',
  shadow_warden: 'Elite detection unit. 50% chance per turn to reveal disguised spies within vision range. Favored by intelligence-focused civilizations.',
  war_hound: 'Combat-focused detection unit. Weaker spy detection (30%) but formidable in battle. Tears apart lightly-armored spy units.',
  beast_handler: 'Mobile detection support. Has a 35% chance per turn to reveal disguised or stealthed spies within vision range.',
  war_elephant: 'A powerful charger that thrives in open ground but fears polearms and rough terrain.',
  // S4b — new unit descriptions
  axeman:      'Early copper-armed warrior. Strong for the era but outpaced once iron is mastered.',
  spearman:    'Versatile polearm soldier effective against mounted units. No resources required.',
  horseman:    'Swift light cavalry for raids and flanking. Requires Horses.',
  chariot:     'A heavy mobile attacker that gains 20% strength on open ground but loses 15% in rough terrain. Requires Horses.',
  cavalry:     'Fast pursuit cavalry gains 15% strength against enemies below 60 HP. Requires Horses.',
  armored_car: 'Fast reconnaissance car pursues damaged foes but cannot hold enemies in place.',
  knight:      'The apex of mounted warfare — armored and devastating. Requires Horses and Iron.',
  cuirassier:  'Armored cavalry breaks open ground but is slower than Cavalry and vulnerable to polearms.',
  crossbowman: 'Precision-ranged unit with a longer reach than Archers. Requires Copper.',
  catapult:    'Slow but devastating siege engine that bombards units and cities. Requires Stone.',
  trebuchet:   'Slow siege engine that excels at breaking cities but is weaker against units.',
  ballista:    'Long-range bolt-thrower effective against massed units. Requires Iron.',
  cannon:      'Gunpowder siege weapon. High bombard damage against cities and fortifications at range 2. Slow movement. Upgrades into the artillery.',
  grenadier:   'Grenade-throwing infantry. Bombard range 1, strong vs fortifications and city walls. Good vs entrenched defenders.',
  marine:      'Coastal assault infantry. Ignores the landing penalty when attacking directly from a transport.',
  rifleman:        'Rifled-musket infantry. Accurate ranged unit, now the era\'s real line-infantry breakpoint — beats the musketeer it replaces. Excels at holding defensive positions.',
  artillery: 'Long-range siege gun. Bombard range 2 vs units and cities. Upgrades into Rocket Artillery.',
  rocket_artillery: 'Long-range rocket siege unit. Bombards one target and damages up to two nearby visible enemy soldiers.',
  frigate:         'Fast broadside warship. Ranged attack (range 2) vs units and cities. Requires Frigate Construction and a coastal city. Replaces the trireme; upgrades into the ironclad.',
  ironclad:        'Armored steam warship. Strongest naval unit of the industrial era. High strength, replaces frigate in fleet roles.',
  machine_gunner:  'Tripod-mounted machine gun crew. Suppressive fire from entrenched positions. High ranged strength; beats the rifleman it replaces. Upgrades into modern infantry.',
  infantry: 'Modern line infantry. Ranged attack (range 1) vs units and cities; beats the machine gunner it replaces. Upgrades into Mechanized Infantry.',
  mechanized_infantry: 'Mobile line infantry. Captures and holds ground faster than Infantry; upgrades into Exosuit Infantry.',
  paratrooper: 'Airborne infantry. Paradrops from a friendly Airfield city onto any visible tile within range, but lands with no movement and cannot act again that turn. Weaker in a stand-up fight than Infantry — its value is repositioning, not raw combat strength. Does not upgrade further.',
  pre_dreadnought: 'Armored steam battleship. Long-range guns (range 2), powerful vs coastal cities and fleets. Replaces the ironclad era of naval warfare.',
  battleship: 'Heavy naval fire support. Deals 20% more attack strength against cities and coastal targets; submarines counter it.',
  missile_cruiser: 'Fast capital fire support that protects nearby ships from aircraft. Requires Carrier Warfare, Radar Systems, and Rocketry; submarines counter it.',
  tank:       'Armored fighting vehicle. Breaks entrenched positions, high strength, range-1 attack. Upgrades into a Main Battle Tank.',
  main_battle_tank: 'Heavy breakthrough armor. Gains +10% combat strength beside one adjacent friendly Mechanized or Exosuit Infantry unit.',
  anti_tank_gun: 'Ranged anti-armor gun. Strong against armored vehicles but weaker against other targets.',
  mobile_aa: 'Mobile anti-aircraft support. Protects adjacent allies: +8 defense against air attacks; weak in direct combat.',
  submarine:  'Hidden naval raider. Concealed from enemies unless a naval or air unit gets adjacent, or a coastal city with a Coastal Battery (and Radar Station) spots it — firing also reveals it for the rest of that turn. Long-range torpedoes (range 2), high naval strength. Replaces pre-dreadnought surface-fleet dominance.',
  observation_balloon: 'Tethered hydrogen balloon used for aerial reconnaissance. Cannot attack. Provides unmatched long-range vision over enemy territory. Extremely fragile.',
  biplane:    'World War I fabric-and-wood fighter. An early aircraft that attacks nearby land and naval targets. Vulnerable to anti-air batteries.',
  wwii_fighter: 'World War II Fighter (WWII Fighter). A stronger carrier-capable fighter that protects nearby forces and attacks visible targets. It intercepts with 20% more strength, but has no bomber bombardment.',
  recon_aircraft: 'Modern unarmed reconnaissance aircraft. Launches temporary area surveys from an Airfield; it cannot strike or move as an ordinary map unit.',
  jet_fighter: 'Postwar jet fighter. Faster and stronger than World War II fighters; dominates air-to-air and ground-attack roles, with a bonus vs bombers. Air-superiority apex — the bomber is the strike line instead of a fighter upgrade.',
  bomber: 'Long-range strategic bomber. Bombard range 3 vs cities and units — the era\'s dedicated city-buster. Its defensive gunners can return weak fire when intercepted. Requires no special building, unlike its stealth successor. Upgrades into the stealth bomber.',
  carrier:     'Fleet carrier. Mobile base for up to 2 aircraft — Fighters, a Naval Strike Aircraft, or a Maritime Patrol Aircraft. Requires a coastal city to build. High vision range; strong naval strength. Upgrades into the Supercarrier.',
  destroyer:   'Submarine hunter. Reveals hidden submarines up to 2 hexes away — farther than an ordinary ship. Fast surface escort with ranged attack (range 2) vs units and cities; +25% strength attacking submarines and missile submarines. Requires Carrier Warfare and a coastal city. Upgrades into the Autonomous Frigate.',
  naval_strike_aircraft: 'Carrier aircraft built to attack ships. Hits naval targets hard, but has no special advantage against cities or land forces, and cannot intercept enemy aircraft — Fighters remain the fleet\'s air defense.',
  maritime_patrol_aircraft: 'Searches the sea for ships and hidden submarines. Its Patrol mission reveals a wide area for the rest of the turn, but costs the aircraft\'s own turn to fly — it finds enemies, it doesn\'t fight them.',
  supercarrier: 'A larger Carrier with room for a bigger air wing — enough deck space to run Fighters, Naval Strike Aircraft, and a Maritime Patrol Aircraft all at once.',
  attack_helicopter: 'Cold War attack helicopter. Combines close air support with anti-armour missiles; faster than jet fighters but more vulnerable to ground fire. Ranged air unit. Can also fly one Air Assault mission per turn from its Helicopter Base to reposition an eligible infantry unit — but cannot also attack that turn.',
  missile_submarine: 'Nuclear-powered ballistic missile submarine. Concealed the same way as a submarine — hidden until a naval/air unit gets close, a well-equipped coastal city spots it, or it fires. Once your empire has a warhead, this submarine can launch it at any discovered city you\'re at war with, within 4 hexes of its current position. Requires a coastal city to build.',
  combat_drone: 'Autonomous air-support unit. Its strongest results come from a valid network formation; fast but not a standalone replacement for a mixed force.',
  autonomous_frigate: 'Autonomous submarine hunter. Reveals hidden submarines up to 3 hexes away — the longest detection range of any ship. Long-range autonomous surface warship. Requires a coastal robotics yard and remains vulnerable to efficient mixed naval counters.',
  exosuit_infantry: 'Advanced line infantry with powered protection. Stronger than Mechanized Infantry and built for holding contested ground.',
  great_general: 'A noncombat commander earned through military achievement. Cannot fight directly but can share a tile with one escorting unit — if that escort is destroyed, the General is destroyed too.',
  propagandist: 'Capturable civic specialist. Uses visible Rally and Undermine actions instead of direct weapon attacks.',
  drone_controller: 'Capturable coordination specialist. Assigns valid drone formations through the Network panel; may safely Hold when no plan is needed.',
  // S5 — trade unit
  caravan:     'Trade unit. Establish a trade route to generate gold each turn. '
             + 'Once committed, cannot move or act until the route ends (8 round trips base). '
             + 'Cannot attack. Raidable by enemy units in transit. Upgrades into the '
             + 'Merchant Wagon once Mercantilism is researched.',
  merchant_wagon:  'Land trade unit. Establish a trade route to generate gold each turn. '
                 + 'Cannot attack. Upgrades from the Caravan; upgrades into the Freight '
                 + 'Convoy once Highway Network is researched.',
  freight_convoy:  'Land trade unit. Establish a trade route to generate gold each turn. '
                 + 'Cannot attack. Upgrades from the Merchant Wagon — current top tier of '
                 + 'the land trade line.',
  naval_trader:     'Naval trade unit. Establish a trade route across water to generate gold '
                   + 'each turn. Cannot attack. Upgrades into the Steamship Trader once Steam '
                   + 'Navigation is researched. Requires a coastal city to build.',
  steamship_trader: 'Naval trade unit. Establish a trade route across water to generate gold '
                   + 'each turn. Cannot attack. Upgrades from the Naval Trader; upgrades into '
                   + 'the Cargo Freighter once Convoy System is researched. Requires a coastal city.',
  cargo_freighter:  'Naval trade unit. Establish a trade route across water to generate gold '
                   + 'each turn. Cannot attack. Upgrades from the Steamship Trader; upgrades into '
                   + 'the Container Ship once Container Shipping is researched. Requires a coastal city.',
  container_ship:   'Naval trade unit. Establish a trade route across water to generate gold '
                   + 'each turn. Cannot attack. Upgrades from the Cargo Freighter — current top '
                   + 'tier of the naval trade line. Requires a coastal city.',
  air_freighter:    'Air trade unit. Establish a trade route to generate gold each turn, '
                   + 'ignoring terrain along the way. Cannot attack. Upgrades into the Jet '
                   + 'Freighter once Jet Aviation is researched.',
  jet_freighter:    'Air trade unit. Establish a trade route to generate gold each turn, '
                   + 'ignoring terrain along the way. Cannot attack. Upgrades from the Air '
                   + 'Freighter; upgrades into Global Air Cargo once Digital Economy is researched.',
  global_air_cargo: 'Air trade unit. Establish a trade route to generate gold each turn, '
                   + 'ignoring terrain along the way. Cannot attack. Upgrades from the Jet '
                   + 'Freighter — current top tier of the air trade line.',
  // Resource Accessibility MR 2b
  expedition:  'Civilian explorer. Crosses hills and mountains at full speed. '
             + 'When standing on a resource tile (outside city territory), use '
             + '"Establish Outpost" to plant a flag — the unit is consumed '
             + 'immediately and the outpost completes in 2 turns, granting the '
             + 'resource and charging 2 gold/turn upkeep. Requires Foraging tech.',
  beast_boar: 'A legendary boar of monstrous size. Territorial — it defends its forest den but never wanders far. Slay it to claim its hoard.',
  beast_wolf: 'One of the Dire Wolf Pack. Fast, relentless, and never alone — defeat the whole pack to claim their hoard.',
  beast_basilisk: 'The Emerald Basilisk lies hidden in the jungle until prey wanders close. Approach with overwhelming force.',
  beast_sea_serpent: 'A serpent of the deep ocean. It drags ships under within its hunting waters — only ships and ranged units can fight it.',
  beast_wurm: 'The Dune Wurm swims beneath the sand, invisible until you stand beside it. Bring ranged units and overwhelming force.',
  beast_roc: 'The Storm Roc nests on the high peaks and dives on anything that crosses its skies. It flies over terrain that would stop an army.',
  beast_hydra: 'The Swamp Hydra regrows flesh as fast as you can cut it — 10 health every turn. Strike hard and finish it in one assault.',
  beast_dragon: 'The Ancient Dragon, terror of the volcanic peaks. Its fire breath strikes from 2 hexes away. Slaying it is the deed of a lifetime — the hoard contains everything.',
  beast_stampede_herd: 'A frightened herd surges away from a threatened city. Screen it with forts and fortified soldiers, or defeat it before it tramples the countryside.',
  rogue_handler: 'A Rogue Handler commands nearby Rogue Elephants. Defeat the Handler to break the Host’s coordination.',
  rogue_elephant: 'A Rogue Elephant follows its Handler toward valuable improvements, forts, and weak city approaches. While commanded within 2 hexes, it gains +20% attack and defense.',
  cyber_unit: 'A non-combat economic saboteur. Drains −2 gold per turn from adjacent enemy cities lacking a Cyber Defense Center. Strength 0: capturable by any enemy unit that enters its hex (transferred to that civ, not destroyed). Gene Therapy does not apply.',
  stealth_bomber: 'A long-range strategic bomber invisible to standard radar. Cannot be targeted by ranged attacks unless an enemy Signals Hub is within 2 hexes of the bomber; when intercepted, stealth reduces the damage it takes instead of returning fire. Must be trained at a Stealth Airbase. Range 3, strength 52.',
};

export function getUnmovedUnits(
  units: Record<string, Unit>,
  civId: string,
): Unit[] {
  return Object.values(units).filter(u => u.owner === civId && isUnitAwaitingOrders(u));
}

export function isUnitAwaitingOrders(unit: Unit): boolean {
  return !unit.transportId
    && !unit.airBase
    && !unit.hasMoved
    && !unit.hasActed
    && !unit.skippedTurn
    && !unit.isFortified
    && !unit.committedToRouteId
    && !unit.workerTask;
}

