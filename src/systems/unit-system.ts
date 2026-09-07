import type { UnitType, Unit, City, HexCoord, GameMap, GameState, CivBonusEffect, VisibilityState, IdCounters } from '@/core/types';
import { getZoneOfControlAt } from './zone-of-control-system';
import { isHostileOwnerTo } from './owner-hostility';
import { isPirateOwner } from '@/core/owner-kind';
import { hasAllianceTreaty } from './diplomacy-system';
import {
  hexKey,
  hexNeighbors,
  hexDistance,
  getWrappedHexNeighbors,
  wrappedHexDistance,
  wrapHexCoord,
} from './hex-utils';
import { isRiverBetween } from './river-system';
import { UNIT_DEFINITIONS } from './unit-definitions';

// #1010: the static unit catalog moved to unit-definitions.ts (a
// dependency-light leaf). Re-exported here so the ~200 files that import it
// from '@/systems/unit-system' keep working unchanged.
export { UNIT_DEFINITIONS } from './unit-definitions';

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

export function getMovementCost(terrain: string): number {
  const costs: Record<string, number> = {
    grassland: 1, plains: 1, desert: 1, tundra: 1,
    forest: 2, hills: 2, snow: 2,
    jungle: 2, swamp: 2, volcanic: 2,
    mountain: 4, ocean: Infinity, coast: Infinity,
  };
  return costs[terrain] ?? Infinity;
}

export function getMovementCostForUnit(
  terrain: string,
  domain: 'land' | 'naval' | 'air',
  terrainCostOverrides?: Partial<Record<string, number>>,
): number {
  if (domain === 'air') return 1;
  if (domain === 'naval') {
    return (terrain === 'ocean' || terrain === 'coast') ? 1 : Infinity;
  }
  if (terrainCostOverrides && terrain in terrainCostOverrides) {
    return terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}

export type UnitMovementBlockerCode =
  | 'unknown-tile'
  | 'unexplored'
  | 'impassable-water'
  | 'impassable-terrain'
  | 'requires-ocean-hull'
  | 'occupied'
  | 'foreign-city'
  | 'barbarian-camp'
  | 'pirate-enclave'
  | 'unreachable'
  | 'insufficient-movement';

export interface UnitMovementContext {
  completedTechs?: string[];
}

export function canHullEnterOcean(unitType: UnitType): boolean {
  return UNIT_DEFINITIONS[unitType]?.waterAccess === 'ocean';
}

export function getMovementCostForUnitInContext(
  unit: Unit,
  terrain: string,
  context: UnitMovementContext = {},
): number {
  const definition = UNIT_DEFINITIONS[unit.type];
  const domain = definition?.domain ?? 'land';

  if (domain === 'air') return 1;

  if (domain === 'naval') {
    if (terrain !== 'ocean' && terrain !== 'coast') return Infinity;
    if (terrain === 'ocean' && !canHullEnterOcean(unit.type)) return Infinity;
    return 1;
  }

  if (definition?.terrainCostOverrides && terrain in definition.terrainCostOverrides) {
    return definition.terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}

/**
 * Everything the canonical movement-step cost model needs about a mover, with no
 * dependency on a live `Unit` record. This is the one shape that movement range,
 * pathfinding, route preview and the executor all cost against, so a caller that
 * only knows a `UnitType` (or just a domain) still optimises the *same* model the
 * executor consumes — see #1042, where road-blind `findPath` callers took a
 * shorter-but-more-expensive route because the fallback ignored `tile.hasRoad`.
 */
export interface MovementStepCostParams {
  /** Movement domain of the mover; drives the water/land/air branch. */
  domain: 'land' | 'naval' | 'air';
  /** Per-terrain cost overrides from the unit definition (land only). */
  terrainCostOverrides?: Partial<Record<string, number>>;
  /** Whether a naval hull may enter open `ocean` (vs `coast` only). */
  canEnterOcean?: boolean;
  /** Owning civ's completed techs — road discount, bridge-building, gps-navigation. */
  completedTechs?: string[];
  /** Owner id of the mover — only the gps-navigation "own territory" clause reads it. */
  owner?: string;
}

function terrainCostForParams(params: MovementStepCostParams, terrain: string): number {
  if (params.domain === 'air') return 1;
  if (params.domain === 'naval') {
    if (terrain !== 'ocean' && terrain !== 'coast') return Infinity;
    if (terrain === 'ocean' && !params.canEnterOcean) return Infinity;
    return 1;
  }
  if (params.terrainCostOverrides && terrain in params.terrainCostOverrides) {
    return params.terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}

function isPassableForParams(params: MovementStepCostParams, terrain: string): boolean {
  return terrainCostForParams(params, terrain) < Infinity;
}

/** True when a land mover with these techs pays the halved (0.5) road step cost. */
function hasRoadMovementDiscount(completedTechs: readonly string[]): boolean {
  return completedTechs.includes('military-logistics')
    || completedTechs.includes('railway-expansion');
}

/**
 * Canonical per-step movement cost, keyed off a `MovementStepCostParams` rather
 * than a `Unit`. `getMovementStepCost` below is the thin `Unit` adapter; both
 * return the identical number for the same terrain / road / river / tech inputs.
 */
export function getMovementStepCostFor(
  params: MovementStepCostParams,
  map: GameMap,
  from: HexCoord,
  to: HexCoord,
): number {
  const tile = map.tiles[hexKey(to)];
  if (!tile) return Infinity;

  const completedTechs = params.completedTechs ?? [];
  let terrainCost: number;

  if (params.domain === 'land' && tile.hasRoad) {
    // Roads cost 1 movement regardless of terrain; Military Logistics OR Railway
    // Expansion halves that to 0.5 — the two do not stack (see game-balance.md).
    terrainCost = hasRoadMovementDiscount(completedTechs) ? 0.5 : 1;
  } else {
    terrainCost = terrainCostForParams(params, tile.terrain);
    if (terrainCost === Infinity) return Infinity;

    if (
      params.domain === 'land'
      && params.owner !== undefined
      && tile.owner === params.owner
      && completedTechs.includes('gps-navigation')
    ) {
      terrainCost = 1;
    }
  }

  const crossesUnbridgedRiver = params.domain !== 'naval' && params.domain !== 'air'
    && !completedTechs.includes('bridge-building')
    && isRiverBetween(map, from, to);
  return terrainCost + (crossesUnbridgedRiver ? 1 : 0);
}

/** Build the canonical cost params from a `UnitType` (or a bare domain fallback). */
export function movementStepCostParamsForType(
  unitType: UnitType | undefined,
  domain: 'land' | 'naval' | 'air' = 'land',
  context: { completedTechs?: string[]; owner?: string } = {},
): MovementStepCostParams {
  const definition = unitType ? UNIT_DEFINITIONS[unitType] : undefined;
  return {
    domain: definition?.domain ?? domain,
    terrainCostOverrides: definition?.terrainCostOverrides,
    canEnterOcean: unitType ? canHullEnterOcean(unitType) : domain === 'naval',
    completedTechs: context.completedTechs,
    owner: context.owner,
  };
}

export function getMovementStepCost(
  unit: Unit,
  map: GameMap,
  from: HexCoord,
  to: HexCoord,
  context: UnitMovementContext = {},
): number {
  return getMovementStepCostFor(
    movementStepCostParamsForType(unit.type, 'land', {
      completedTechs: context.completedTechs,
      owner: unit.owner,
    }),
    map,
    from,
    to,
  );
}

function isPassableForUnitInContext(
  unit: Unit,
  terrain: string,
  context: UnitMovementContext = {},
): boolean {
  return getMovementCostForUnitInContext(unit, terrain, context) < Infinity;
}

export interface MovementBlockerReason {
  code:
    | 'unexplored'
    | 'unknown-tile'
    | 'impassable-water'
    | 'impassable-terrain'
    | 'requires-ocean-hull'
    | 'occupied'
    | 'foreign-city'
    | 'barbarian-camp'
    | 'pirate-enclave'
    | 'unreachable'
    | 'insufficient-movement';
  message: string;
}

export function getMovementBlockerReason(
  unit: Unit,
  to: HexCoord,
  map: GameMap,
  options: { visibilityState?: VisibilityState; completedTechs?: string[]; blockingEntity?: BlockingMapEntity | null } = {},
): MovementBlockerReason | null {
  if (options.visibilityState === 'unexplored') {
    return { code: 'unexplored', message: 'Too far away to spot.' };
  }

  const target = map.wrapsHorizontally ? wrapHexCoord(to, map.width) : to;
  const tile = map.tiles[hexKey(target)];
  if (!tile) {
    return { code: 'unknown-tile', message: 'Too far away to spot.' };
  }

  // A blocking map entity (e.g. a foreign, unallied city) takes priority over terrain --
  // the caller supplies it (via getBlockingMapEntityAt) rather than this function taking a
  // full GameState, matching its existing decoupled-from-state signature (#843).
  if (options.blockingEntity) {
    return {
      code: options.blockingEntity.reason,
      message: BLOCKING_MAP_ENTITY_MESSAGES[options.blockingEntity.reason],
    };
  }

  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  if (!isPassableForUnitInContext(unit, tile.terrain, { completedTechs: options.completedTechs })) {
    if (domain === 'naval' && tile.terrain === 'ocean' && !canHullEnterOcean(unit.type)) {
      return {
        code: 'requires-ocean-hull',
        message: "This ship can't survive the open sea — upgrade it to go further.",
      };
    }
    if (domain === 'naval') {
      return { code: 'impassable-terrain', message: 'Naval units cannot move on land.' };
    }
    if (tile.terrain === 'ocean' || tile.terrain === 'coast') {
      return { code: 'impassable-water', message: 'Land units cannot cross water yet.' };
    }
    return { code: 'impassable-terrain', message: 'This terrain cannot be entered.' };
  }

  const path = findPath(unit.position, target, map, domain, { unit, completedTechs: options.completedTechs });
  if (!path) {
    return { code: 'unreachable', message: 'No passable route to that tile.' };
  }

  const pathCost = path.slice(1).reduce(
    (total, coord, index) => total + getMovementStepCost(
      unit,
      map,
      path[index]!,
      coord,
      { completedTechs: options.completedTechs },
    ),
    0,
  );

  // Forced march: a unit can always move to an adjacent passable tile with ≥1 move remaining.
  const isAdjacentMove = path.length === 2;
  if (isAdjacentMove && unit.movementPointsLeft >= 1) {
    return null;
  }

  if (pathCost > unit.movementPointsLeft) {
    return { code: 'insufficient-movement', message: 'Not enough movement left this turn.' };
  }

  return null;
}

function normalizeOccupants(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export interface BlockingMapEntity {
  reason: 'foreign-city' | 'barbarian-camp' | 'pirate-enclave';
  entityId: string;
}

// A pirate faction's coastal-enclave headquarters anchors on a land tile (#965;
// pirate-factions design). Like a barbarian camp, an intact enclave blocks
// ordinary movement onto that anchor for everyone except the pirate faction that
// owns it -- a land unit cannot walk in, stack, or "capture" it. The enclave is
// resolved only by a naval assault from an adjacent sea tile
// (see getEnclaveAssaultPreview); it never transfers ownership to a civ.
function isBlockingPirateEnclaveFor(unit: Unit): boolean {
  return !isPirateOwner(unit.owner);
}

/** Land anchors of every intact pirate coastal-enclave headquarters. */
function pirateEnclaveAnchorEntries(state: GameState): Array<{ id: string; key: string }> {
  const factions = state.pirates?.factions;
  if (!factions) return [];
  const entries: Array<{ id: string; key: string }> = [];
  for (const faction of Object.values(factions)) {
    if (faction.headquarters.kind === 'coastal-enclave') {
      entries.push({ id: faction.id, key: hexKey(faction.headquarters.position) });
    }
  }
  return entries;
}

export function isBlockingCityFor(state: GameState, unit: Unit, city: City): boolean {
  return city.owner !== unit.owner && !hasAllianceTreaty(state, unit.owner, city.owner);
}

// Camps have no owner field -- they're always barbarian-hostile to every civ (#845), the same
// way `isAlwaysHostilePair` treats the 'barbarian' owner class elsewhere. The one exception is
// a barbarian-owned mover itself (e.g. a raider that spawned on/near its own camp), which must
// not be blocked from its own camp the same way a city never blocks its own owner.
function isBlockingCampFor(unit: Unit): boolean {
  return unit.owner !== 'barbarian';
}

/**
 * A foreign, unallied city -- or a barbarian camp -- blocks ordinary movement onto its tile
 * exactly like `validateUnitMove`'s rejection checks: this is the single source of truth both
 * that executor and the movement-range preview BFS (`getMovementRange`/
 * `getMovementRangeDetails`) consult, so the two layers can never drift out of sync the way
 * they did before this predicate existed (#843). Returns `null` when `coord` has no blocking
 * entity.
 */
export function getBlockingMapEntityAt(
  state: GameState,
  unit: Unit,
  coord: HexCoord,
): BlockingMapEntity | null {
  const key = hexKey(coord);
  const city = Object.values(state.cities).find(c => hexKey(c.position) === key);
  if (city && isBlockingCityFor(state, unit, city)) {
    return { reason: 'foreign-city', entityId: city.id };
  }
  const camp = Object.values(state.barbarianCamps ?? {}).find(c => hexKey(c.position) === key);
  if (camp && isBlockingCampFor(unit)) {
    return { reason: 'barbarian-camp', entityId: camp.id };
  }
  if (isBlockingPirateEnclaveFor(unit)) {
    const enclave = pirateEnclaveAnchorEntries(state).find(entry => entry.key === key);
    if (enclave) {
      return { reason: 'pirate-enclave', entityId: enclave.id };
    }
  }
  return null;
}

export const BLOCKING_MAP_ENTITY_MESSAGES: Record<BlockingMapEntity['reason'], string> = {
  'foreign-city': 'Move adjacent, then use the city assault action.',
  'barbarian-camp': 'Move adjacent, then attack to destroy the camp.',
  'pirate-enclave': 'This pirate stronghold can only be destroyed by a warship attacking from an adjacent sea tile.',
};

/**
 * Every hex `unit` cannot enter via ordinary movement due to a blocking map entity
 * (see `getBlockingMapEntityAt`). Callers that only have decomposed occupancy data
 * (not a full `GameState`) -- `getMovementRange`'s two live callers -- compute this set
 * once up front and pass it in, rather than threading `GameState` through the BFS.
 */
export function getBlockingMapEntityKeys(state: GameState, unit: Unit): Set<string> {
  const keys = new Set<string>();
  for (const city of Object.values(state.cities)) {
    if (isBlockingCityFor(state, unit, city)) {
      keys.add(hexKey(city.position));
    }
  }
  if (isBlockingCampFor(unit)) {
    for (const camp of Object.values(state.barbarianCamps ?? {})) {
      keys.add(hexKey(camp.position));
    }
  }
  if (isBlockingPirateEnclaveFor(unit)) {
    for (const { key } of pirateEnclaveAnchorEntries(state)) {
      keys.add(key);
    }
  }
  return keys;
}

export function getMovementRange(
  unit: Unit,
  map: GameMap,
  unitPositions: Record<string, string | string[]>,
  unitOwners?: Record<string, string>,
  hostileOwners?: Set<string>,
  options: UnitMovementContext = {},
  blockingKeys?: ReadonlySet<string>,
): HexCoord[] {
  const reachable: HexCoord[] = [];
  const visited = new Map<string, number>();
  const queue: Array<{ coord: HexCoord; remaining: number }> = [];

  const startKey = hexKey(unit.position);
  visited.set(startKey, unit.movementPointsLeft);
  queue.push({ coord: unit.position, remaining: unit.movementPointsLeft });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(current.coord, map.width)
      : hexNeighbors(current.coord);

    for (const neighbor of neighbors) {
      const key = hexKey(neighbor);
      const tile = map.tiles[key];
      if (!tile || !isPassableForUnitInContext(unit, tile.terrain, options)) continue;

      const cost = getMovementStepCost(unit, map, current.coord, neighbor, options);
      const remaining = current.remaining - cost;

      // Forced march: if this is a direct neighbor of the start position and the unit
      // has ≥1 movement remaining, allow entry even when the tile cost exceeds remaining points.
      const isFromStartPosition = hexKey(current.coord) === hexKey(unit.position);
      const forcedMarch = isFromStartPosition && current.remaining >= 1 && remaining < 0;

      if (remaining < 0 && !forcedMarch) continue;

      const effectiveRemaining = forcedMarch ? 0 : remaining;

      const occupants = normalizeOccupants(unitPositions[key]).filter(id => id !== unit.id);
      if (occupants.length > 0) {
        const isNeutralOccupant = (id: string) => {
          const owner = unitOwners?.[id];
          return Boolean(owner) && owner !== unit.owner
            && hostileOwners !== undefined && !hostileOwners.has(owner!);
        };
        const isHostileOccupant = (id: string) => {
          const owner = unitOwners?.[id];
          if (!owner || owner === unit.owner) return false;
          return hostileOwners !== undefined ? hostileOwners.has(owner) : true;
        };

        if (occupants.some(isNeutralOccupant)) continue;

        if (occupants.some(isHostileOccupant)) {
          const prevRemaining = visited.get(key) ?? -1;
          if (effectiveRemaining > prevRemaining) {
            visited.set(key, effectiveRemaining);
            reachable.push(neighbor);
          }
          continue;
        }
      }

      // A blocking map entity (e.g. a foreign, unallied city -- see
      // `getBlockingMapEntityAt`/`getBlockingMapEntityKeys`) is only ever reachable (for
      // adjacent tap-to-assault highlighting) when the unit is ALREADY directly adjacent to
      // it before this action, exactly like how Zone of Control already restricts a hostile
      // unit's own tile to direct-adjacency-only. Without the `isFromStartPosition` gate this
      // would be "reachable" from arbitrarily far away, which is the #843 bug.
      if (blockingKeys?.has(key)) {
        if (isFromStartPosition) {
          const prevRemaining = visited.get(key) ?? -1;
          if (effectiveRemaining > prevRemaining) {
            visited.set(key, effectiveRemaining);
            reachable.push(neighbor);
          }
        }
        continue;
      }

      const prevRemaining = visited.get(key) ?? -1;
      if (effectiveRemaining > prevRemaining) {
        visited.set(key, effectiveRemaining);
        reachable.push(neighbor);
        if (effectiveRemaining > 0) {
          queue.push({ coord: neighbor, remaining: effectiveRemaining });
        }
      }
    }
  }

  return reachable;
}

export interface MovementRangeDetails {
  reachable: HexCoord[];
  zocLimited: HexCoord[];
}

export function getMovementRangeDetails(
  state: Readonly<GameState>,
  unitId: string,
): MovementRangeDetails {
  const unit = state.units[unitId];
  if (!unit) return { reachable: [], zocLimited: [] };
  const unitPositions: Record<string, string | string[]> = {};
  const unitOwners: Record<string, string> = {};
  for (const candidate of Object.values(state.units)) {
    const key = hexKey(candidate.position);
    const existing = unitPositions[key];
    unitPositions[key] = existing ? [...(Array.isArray(existing) ? existing : [existing]), candidate.id] : candidate.id;
    unitOwners[candidate.id] = candidate.owner;
  }
  const hostileOwners = new Set(Object.values(state.units)
    .filter(candidate => isHostileOwnerTo(state, unit.owner, candidate.owner))
    .map(candidate => candidate.owner));
  const reachable: HexCoord[] = [];
  const zocLimited: HexCoord[] = [];
  const visited = new Map<string, number>();
  const queue: Array<{ coord: HexCoord; remaining: number }> = [];
  const startKey = hexKey(unit.position);
  visited.set(startKey, unit.movementPointsLeft);
  queue.push({ coord: unit.position, remaining: unit.movementPointsLeft });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = state.map.wrapsHorizontally
      ? getWrappedHexNeighbors(current.coord, state.map.width)
      : hexNeighbors(current.coord);
    for (const neighbor of neighbors) {
      const key = hexKey(neighbor);
      const tile = state.map.tiles[key];
      if (!tile || !isPassableForUnitInContext(unit, tile.terrain, {
        completedTechs: state.civilizations[unit.owner]?.techState.completed ?? [],
      })) continue;
      const cost = getMovementStepCost(unit, state.map, current.coord, neighbor, {
        completedTechs: state.civilizations[unit.owner]?.techState.completed ?? [],
      });
      const remaining = current.remaining - cost;
      const fromStart = hexKey(current.coord) === startKey;
      const forcedMarch = fromStart && current.remaining >= 1 && remaining < 0;
      if (remaining < 0 && !forcedMarch) continue;
      const effectiveRemaining = forcedMarch ? 0 : remaining;
      const occupants = normalizeOccupants(unitPositions[key]).filter(id => id !== unit.id);
      const neutralOccupant = occupants.some(id => {
        const owner = unitOwners[id];
        return Boolean(owner) && owner !== unit.owner && !hostileOwners.has(owner);
      });
      if (neutralOccupant) continue;
      const hostileOccupant = occupants.some(id => {
        const owner = unitOwners[id];
        return Boolean(owner) && owner !== unit.owner && hostileOwners.has(owner);
      });
      const blockingEntity = getBlockingMapEntityAt(state, unit, neighbor);
      // A blocking map entity's own tile is only ever "reachable" (for tap-to-assault) when
      // the unit is ALREADY directly adjacent to it before this action -- never via a
      // multi-hop approach. This matches how Zone of Control already prevents a hostile
      // unit's own tile from being added except from direct adjacency (any multi-hop
      // approach must first cross a ZOC-limited tile one hex short, which is terminal and
      // never enqueued). Cities/camps radiate no ZOC of their own, so without this explicit
      // fromStart gate they would be "reachable" from arbitrarily far away whenever movement
      // points allowed -- exactly the #843 bug (a distant city looked tap-able, but tapping
      // it while not yet adjacent produced a confusing rejection instead of a move).
      //
      // #965: a pirate coastal-enclave has NO land tap-action (it is razed only by
      // a warship from the sea), so unlike a city/camp its anchor is never a
      // reachable tap target -- exclude it even from direct adjacency so the tap
      // falls through to the plain "assault it by sea" explanation.
      if (blockingEntity && (!fromStart || blockingEntity.reason === 'pirate-enclave')) continue;
      const zoc = !hostileOccupant && !blockingEntity && getZoneOfControlAt(state, unit, neighbor).limited;
      const terminal = hostileOccupant || Boolean(blockingEntity) || zoc;
      const previous = visited.get(key) ?? -1;
      if (effectiveRemaining <= previous) continue;
      visited.set(key, effectiveRemaining);
      reachable.push(neighbor);
      if (zoc) zocLimited.push(neighbor);
      if (!terminal && effectiveRemaining > 0) {
        queue.push({ coord: neighbor, remaining: effectiveRemaining });
      }
    }
  }
  return { reachable, zocLimited };
}

/**
 * Cost-aware A* over the canonical movement-step cost model
 * (`getMovementStepCostFor`). Route selection minimises **movement points**, not
 * hex count, so a longer road detour that is cheaper in movement points wins
 * (#1042). Callers pass a `unit` (preferred) or a bare `unitType` so the same
 * road / terrain-override / tech model the executor consumes is optimised here;
 * a caller with neither still gets a road-aware `domain`-level cost.
 *
 * Heuristic: `minStepCost × hexDistance`. `minStepCost` is `0.5` when a
 * road-movement-discount tech is active (a road step can then cost 0.5) and `1`
 * otherwise — the smallest cost any single step can take. That keeps the
 * heuristic admissible *and* consistent (`h(n) − h(n′) ≤ minStepCost ≤
 * cost(n,n′)` for every edge), so the closed-set never locks in a worse path.
 *
 * Tie-break for equal `f`: prefer the higher `g` (closer to the goal → fewer
 * expansions), then the lexicographically smaller `hexKey`. This is independent
 * of `Set` iteration order, so equal-cost paths resolve identically across runs
 * and across a save/reload.
 */
export function findPath(
  from: HexCoord,
  to: HexCoord,
  map: GameMap,
  domain: 'land' | 'naval' | 'air' = 'land',
  options: UnitMovementContext & { unit?: Unit; unitType?: UnitType } = {},
): HexCoord[] | null {
  const toKey = hexKey(to);
  const toTile = map.tiles[toKey];
  if (!toTile) return null;

  const costParams = movementStepCostParamsForType(
    options.unit?.type ?? options.unitType,
    domain,
    { completedTechs: options.completedTechs, owner: options.unit?.owner },
  );
  if (!isPassableForParams(costParams, toTile.terrain)) return null;

  const minStepCost = costParams.domain === 'land'
    && hasRoadMovementDiscount(costParams.completedTechs ?? [])
    ? 0.5
    : 1;
  const EPS = 1e-9;

  const parents = new Map<string, string>();
  const gScore = new Map<string, number>();
  const openSet = new Set<string>();
  const closedSet = new Set<string>();
  const coords = new Map<string, HexCoord>();

  const startKey = hexKey(from);
  gScore.set(startKey, 0);
  openSet.add(startKey);
  coords.set(startKey, from);

  while (openSet.size > 0) {
    // Find the open node with lowest f, breaking ties deterministically.
    let currentKey = '';
    let lowestF = Infinity;
    let lowestG = Infinity;
    for (const key of openSet) {
      const coord = coords.get(key)!;
      const heuristic = map.wrapsHorizontally
        ? wrappedHexDistance(coord, to, map.width)
        : hexDistance(coord, to);
      const g = gScore.get(key) ?? Infinity;
      const f = g + minStepCost * heuristic;
      const better = f < lowestF - EPS
        || (Math.abs(f - lowestF) <= EPS && g > lowestG + EPS)
        || (Math.abs(f - lowestF) <= EPS && Math.abs(g - lowestG) <= EPS && (currentKey === '' || key < currentKey));
      if (better) {
        lowestF = f;
        lowestG = g;
        currentKey = key;
      }
    }

    // Reached destination — reconstruct path
    if (currentKey === toKey) {
      const path: HexCoord[] = [];
      let key: string | null = currentKey;
      while (key) {
        path.unshift(coords.get(key)!);
        key = parents.get(key) ?? null;
      }
      return path;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);
    const currentCoord = coords.get(currentKey)!;

    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(currentCoord, map.width)
      : hexNeighbors(currentCoord);
    for (const neighbor of neighbors) {
      const nKey = hexKey(neighbor);
      if (closedSet.has(nKey)) continue;

      const tile = map.tiles[nKey];
      if (!tile) continue;
      const stepCost = getMovementStepCostFor(costParams, map, currentCoord, neighbor);
      if (stepCost === Infinity) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost;
      if (tentativeG < (gScore.get(nKey) ?? Infinity) - EPS) {
        parents.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        coords.set(nKey, neighbor);
        openSet.add(nKey);
      }
    }
  }

  return null;
}

/**
 * Trade Routes Overhaul (#553 MR1/4). Cities are never founded on ocean/coast terrain
 * (see map-generator.ts's start-terrain filter) — they sit on land tiles that are merely
 * *adjacent* to water, matching `isCityCoastal`'s neighbor check in city-system.ts. Plain
 * `findPath(..., 'naval')` requires the destination tile itself to be ocean/coast, so it
 * can never reach a real coastal city's own tile. This wraps `findPath` so naval-domain
 * callers path to the nearest ocean/coast neighbor of the city (docking) and then treat
 * the city tile as one final step, while land/air callers behave exactly like `findPath`.
 *
 * `options` is forwarded verbatim to `findPath`, so a land caravan or unit routed
 * to a city optimises the same road / terrain / tech cost model as a plain
 * `findPath` call (#1042).
 */
export function findPathToCity(
  from: HexCoord,
  cityPosition: HexCoord,
  map: GameMap,
  domain: 'land' | 'naval' | 'air' = 'land',
  options: UnitMovementContext & { unit?: Unit; unitType?: UnitType } = {},
): HexCoord[] | null {
  const direct = findPath(from, cityPosition, map, domain, options);
  if (direct) return direct;
  if (domain !== 'naval') return null;

  const neighbors = map.wrapsHorizontally
    ? getWrappedHexNeighbors(cityPosition, map.width)
    : hexNeighbors(cityPosition);

  let best: HexCoord[] | null = null;
  for (const neighbor of neighbors) {
    const tile = map.tiles[hexKey(neighbor)];
    if (!tile || (tile.terrain !== 'ocean' && tile.terrain !== 'coast')) continue;
    const path = findPath(from, neighbor, map, 'naval', options);
    // Naval steps are uniform cost 1, so shortest hop count is also cheapest.
    if (path && (!best || path.length < best.length)) best = path;
  }
  return best ? [...best, cityPosition] : null;
}
