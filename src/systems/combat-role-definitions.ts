import type {
  AIStrategicRole,
  CombatRole,
  TrainableUnitEntry,
  UnitDefinition,
  UnitRoleDefinition,
  UnitType,
} from '@/core/types';
import { getRequiredTechIds } from './production-prerequisites';

const role = (
  primaryRole: CombatRole,
  roleSummary: string,
  aiRoles: readonly AIStrategicRole[],
  options: Omit<UnitRoleDefinition, 'primaryRole' | 'roleSummary' | 'aiRoles'>,
): UnitRoleDefinition => ({ primaryRole, roleSummary, aiRoles, ...options });

const civilian = (
  roleSummary: string,
  aiRoles: readonly AIStrategicRole[],
  upgradeFamily: UnitRoleDefinition['upgradeFamily'] = 'civilian',
): UnitRoleDefinition => role('civilian', roleSummary, aiRoles, {
  counters: [], vulnerableTo: [], upgradeFamily,
});

export const UNIT_ROLE_DEFINITIONS = {
  warrior: role('frontline', 'Cheap early defender that holds ground and captures exposed positions.', ['frontline', 'capture'], { counters: ['civilian'], vulnerableTo: ['ranged', 'shock'], upgradeFamily: 'line-infantry' }),
  archer: role('ranged', 'Safe early ranged support that punishes slow frontline units.', ['ranged', 'capture'], { counters: ['frontline'], vulnerableTo: ['shock', 'pursuit'], upgradeFamily: 'ranged-infantry' }),
  scout: role('reconnaissance', 'Fast scout that reveals terrain and avoids prolonged fights.', ['recon'], { counters: [], vulnerableTo: ['frontline', 'ranged'], upgradeFamily: 'detection', terminalReason: 'Reconnaissance specialist with self-defense strength and no replacement chain.' }),
  worker: civilian('Builds improvements that grow the city and secure resources.', ['worker']),
  missionary: civilian('Spreads faith and supports cities without direct combat.', ['missionary']),
  settler: civilian('Founds a new city and must avoid enemy forces.', ['settlement']),
  swordsman: role('frontline', 'Armored frontline fighter that trades well in direct land combat.', ['frontline', 'capture'], { counters: ['frontline'], vulnerableTo: ['ranged', 'siege'], upgradeFamily: 'line-infantry' }),
  pikeman: role('anti-mounted', 'Polearm defender that stops charging mounted attackers.', ['frontline', 'capture'], { counters: ['shock'], vulnerableTo: ['ranged', 'siege'], upgradeFamily: 'line-infantry' }),
  musketeer: role('ranged', 'Gunpowder infantry that supports the line from a safe distance.', ['ranged', 'capture'], { counters: ['frontline'], vulnerableTo: ['shock', 'siege'], upgradeFamily: 'line-infantry' }),
  galley: role('escort', 'Early coastal escort that protects friendly waters and transports.', ['naval-combat', 'escort'], { counters: ['civilian'], vulnerableTo: ['capital-ship'], upgradeFamily: 'surface-warship' }),
  transport: civilian('Carries land units between coasts and cannot attack.', ['transport'], 'transport'),
  carrack: civilian('Carries more land units safely across coastal waters.', ['transport'], 'transport'),
  galleon: civilian('Carries a larger army across seas without fighting.', ['transport'], 'transport'),
  steamship: civilian('Reliable transport that carries a large expeditionary force.', ['transport'], 'transport'),
  troop_transport: civilian('Military transport that moves six land units across oceans.', ['transport'], 'transport'),
  trireme: role('escort', 'Coastal warship that escorts transports and contests nearby seas.', ['naval-combat', 'escort'], { counters: ['civilian'], vulnerableTo: ['capital-ship'], upgradeFamily: 'surface-warship' }),
  frigate: role('escort', 'Ranged escort that protects fleets and pressures coastal targets.', ['naval-combat', 'escort'], { counters: ['escort'], vulnerableTo: ['capital-ship'], upgradeFamily: 'surface-warship' }),
  axeman: role('frontline', 'Copper frontline fighter that wins early direct engagements.', ['frontline', 'capture'], { counters: ['frontline'], vulnerableTo: ['ranged', 'shock'], upgradeFamily: 'line-infantry' }),
  spearman: role('anti-mounted', 'Resource-free polearm defender that counters mounted charges.', ['frontline', 'capture'], { counters: ['shock'], vulnerableTo: ['ranged', 'siege'], upgradeFamily: 'line-infantry' }),
  horseman: role('shock', 'Fast mounted attacker that flanks exposed ranged units.', ['mobile', 'capture'], { counters: ['ranged', 'siege'], vulnerableTo: ['anti-mounted'], upgradeFamily: 'mounted' }),
  chariot: role('shock', 'Heavy early charger gains 20% on open ground but loses 15% in rough terrain.', ['mobile', 'capture'], { counters: ['ranged', 'siege'], vulnerableTo: ['anti-mounted'], upgradeFamily: 'mounted' }),
  cavalry: role('shock', 'Fast pursuit cavalry strikes weakened enemies before they recover.', ['mobile', 'capture'], { secondaryRoles: ['pursuit'], counters: ['ranged', 'siege'], vulnerableTo: ['anti-mounted'], upgradeFamily: 'mounted' }),
  armored_car: role('reconnaissance', 'Fast reconnaissance car pursues damaged foes but cannot hold enemies in place.', ['recon', 'mobile'], { secondaryRoles: ['pursuit'], counters: ['ranged', 'siege'], vulnerableTo: ['frontline'], upgradeFamily: 'mounted', domainTransitionReason: 'Succeeds into air assault and reconnaissance at a Helicopter Base.', publicFacts: ['+15% attack against targets below 60 HP', 'No zone of control'] }),
  knight: role('shock', 'Armored mounted attacker that overwhelms vulnerable land units.', ['mobile', 'capture'], { counters: ['ranged', 'siege'], vulnerableTo: ['anti-mounted'], upgradeFamily: 'mounted' }),
  cuirassier: role('shock', 'Armored cavalry breaks open ground but is slower than Cavalry.', ['mobile', 'capture'], { counters: ['ranged', 'siege'], vulnerableTo: ['anti-mounted'], upgradeFamily: 'mounted', publicFacts: ['+15% attack on open ground', 'Requires Horses and Iron'] }),
  marine: role('frontline', 'Coastal assault infantry that attacks effectively after landing.', ['frontline', 'capture'], { counters: ['ranged'], vulnerableTo: ['siege', 'shock'], upgradeFamily: 'line-infantry' }),
  crossbowman: role('ranged', 'Precise ranged unit that pressures armored frontline fighters.', ['ranged', 'capture'], { counters: ['frontline'], vulnerableTo: ['shock', 'pursuit'], upgradeFamily: 'ranged-infantry' }),
  catapult: role('siege', 'Slow bombard unit that damages cities and concentrated defenders.', ['siege', 'ranged'], { counters: ['frontline'], vulnerableTo: ['shock', 'pursuit'], upgradeFamily: 'siege' }),
  ballista: role('ranged', 'Long-range bolt thrower that punishes exposed unit formations.', ['ranged', 'capture'], { counters: ['frontline'], vulnerableTo: ['shock', 'pursuit'], upgradeFamily: 'siege' }),
  cannon: role('siege', 'Gunpowder bombard unit that breaks cities and fortified positions.', ['siege', 'ranged'], { counters: ['frontline'], vulnerableTo: ['shock', 'pursuit'], upgradeFamily: 'siege' }),
  grenadier: role('siege', 'Short-range specialist that cracks forts and entrenched defenders.', ['siege', 'ranged'], { counters: ['frontline'], vulnerableTo: ['shock', 'pursuit'], upgradeFamily: 'line-infantry' }),
  rifleman: role('ranged', 'Reliable line infantry that holds ground with ranged fire.', ['ranged', 'capture'], { counters: ['frontline'], vulnerableTo: ['shock', 'siege'], upgradeFamily: 'line-infantry' }),
  artillery: role('siege', 'Long-range siege apex that destroys cities from behind allies.', ['siege', 'ranged'], { counters: ['frontline'], vulnerableTo: ['shock', 'pursuit'], upgradeFamily: 'siege', terminalReason: 'Current siege apex; rocket artillery is future content.' }),
  ironclad: role('capital-ship', 'Armored warship that wins direct fights against older fleets.', ['naval-combat', 'escort'], { counters: ['escort'], vulnerableTo: ['capital-ship'], upgradeFamily: 'surface-warship' }),
  machine_gunner: role('ranged', 'Suppressive defender that holds territory against frontline troops.', ['ranged', 'capture'], { counters: ['frontline'], vulnerableTo: ['shock', 'siege'], upgradeFamily: 'line-infantry' }),
  infantry: role('frontline', 'Modern line infantry that captures ground and supports ranged attacks.', ['ranged', 'capture'], { counters: ['frontline'], vulnerableTo: ['shock', 'siege'], upgradeFamily: 'line-infantry' }),
  pre_dreadnought: role('capital-ship', 'Heavy surface warship that bombards fleets and coastal cities.', ['naval-combat', 'escort'], { counters: ['escort'], vulnerableTo: ['capital-ship'], upgradeFamily: 'surface-warship' }),
  tank: role('shock', 'Armored breakthrough unit that crushes exposed land defenders.', ['ranged', 'mobile', 'capture'], { counters: ['frontline', 'ranged'], vulnerableTo: ['anti-armor'], upgradeFamily: 'mounted', terminalReason: 'Current top-tier armor with no later roster replacement.' }),
  submarine: role('capital-ship', 'Stealthy naval hunter that threatens expensive surface warships.', ['naval-combat', 'escort'], { counters: ['capital-ship'], vulnerableTo: ['escort'], upgradeFamily: 'submarine', terminalReason: 'Current top-tier submarine with no later roster replacement.' }),
  observation_balloon: role('reconnaissance', 'Aerial scout that reveals distant terrain but cannot fight.', ['recon'], { counters: [], vulnerableTo: ['air-superiority'], upgradeFamily: 'detection', terminalReason: 'Air-recon specialist with self-defense strength and no replacement chain.' }),
  biplane: role('air-superiority', 'Early fighter that contests enemy aircraft and supports ground attacks.', ['air-combat', 'ranged'], { counters: ['reconnaissance'], vulnerableTo: ['ground-air-defense', 'air-superiority'], upgradeFamily: 'fighter' }),
  jet_fighter: role('air-superiority', 'Fast fighter that wins air battles and intercepts enemy bombers.', ['air-combat', 'ranged'], { counters: ['air-superiority', 'siege'], vulnerableTo: ['ground-air-defense'], upgradeFamily: 'fighter', terminalReason: 'Air-superiority apex; bombers are a separate upgrade family.' }),
  recon_aircraft: civilian('Unarmed aircraft that surveys an area from a friendly airbase.', ['recon'], 'detection'),
  bomber: role('siege', 'Long-range bomber that damages cities and distant enemy formations.', ['air-combat', 'ranged'], { counters: ['frontline', 'capital-ship'], vulnerableTo: ['air-superiority', 'ground-air-defense'], upgradeFamily: 'bomber' }),
  carrier: role('capital-ship', 'Mobile airbase that projects fighters and bombers across seas.', ['naval-combat', 'escort'], { counters: ['capital-ship'], vulnerableTo: ['capital-ship'], upgradeFamily: 'surface-warship', terminalReason: 'Current top-tier naval projection with no later roster replacement.' }),
  destroyer: role('escort', 'Fast surface escort that hunts submarines and protects fleets.', ['naval-combat', 'escort'], { counters: ['capital-ship'], vulnerableTo: ['capital-ship'], upgradeFamily: 'surface-warship' }),
  attack_helicopter: role('anti-armor', 'Mobile air attacker that punishes armored land formations.', ['air-combat', 'ranged'], { counters: ['shock'], vulnerableTo: ['ground-air-defense', 'air-superiority'], upgradeFamily: 'air-support' }),
  missile_submarine: role('capital-ship', 'Long-range deterrent submarine that threatens distant coastal targets.', ['naval-combat', 'escort'], { counters: ['capital-ship'], vulnerableTo: ['escort'], upgradeFamily: 'submarine', terminalReason: 'Newest naval deterrent with no later roster replacement.' }),
  cyber_unit: role('formation-support', 'Capturable saboteur that weakens nearby undefended enemy cities.', ['espionage'], { counters: ['civilian'], vulnerableTo: ['frontline', 'ranged'], upgradeFamily: 'espionage', terminalReason: 'Economic sabotage specialist with no later roster replacement.' }),
  stealth_bomber: role('siege', 'Stealth bomber that strikes distant cities while avoiding ordinary radar.', ['air-combat', 'ranged'], { counters: ['frontline', 'capital-ship'], vulnerableTo: ['air-superiority', 'ground-air-defense'], upgradeFamily: 'bomber', terminalReason: 'Current air-combat apex with no later roster replacement.' }),
  combat_drone: role('formation-support', 'Networked air support that is strongest in a valid formation.', ['air-combat', 'ranged'], { secondaryRoles: ['ranged'], counters: ['frontline'], vulnerableTo: ['ground-air-defense', 'air-superiority'], upgradeFamily: 'air-support', terminalReason: 'Era 13 coordinated air-support apex with no later successor.' }),
  autonomous_frigate: role('escort', 'Autonomous surface escort that supports fleets at long range.', ['naval-combat', 'escort'], { counters: ['escort'], vulnerableTo: ['capital-ship'], upgradeFamily: 'surface-warship', terminalReason: 'Era 13 surface-escort apex with no later successor.' }),
  exosuit_infantry: role('frontline', 'Advanced line infantry that holds ground below dedicated armor.', ['ranged', 'mobile', 'capture'], { counters: ['frontline'], vulnerableTo: ['shock', 'anti-armor'], upgradeFamily: 'line-infantry', terminalReason: 'Era 13 line-infantry apex; armor remains a separate family.' }),
  propagandist: civilian('Civic specialist that rallies allies and undermines enemy loyalty.', ['espionage']),
  drone_controller: role('formation-support', 'Support specialist that coordinates valid drone formations safely.', ['detection'], { counters: [], vulnerableTo: ['frontline', 'ranged'], upgradeFamily: 'civilian' }),
  spy_scout: civilian('Early spy that scouts and infiltrates rival cities.', ['espionage'], 'espionage'),
  spy_informant: civilian('Experienced spy that maintains intelligence operations in cities.', ['espionage'], 'espionage'),
  spy_agent: civilian('Field spy that sabotages, steals technology, and disrupts rivals.', ['espionage'], 'espionage'),
  spy_operative: civilian('Elite spy that performs high-stakes covert operations.', ['espionage'], 'espionage'),
  spy_hacker: role('formation-support', 'Cyber spy that conducts remote operations against rival infrastructure.', ['espionage'], { counters: [], vulnerableTo: ['frontline', 'ranged'], upgradeFamily: 'espionage', terminalReason: 'Terminal tier of the espionage chain with no later replacement.' }),
  scout_hound: role('detection', 'Detection scout that reveals disguised spies while patrolling territory.', ['detection', 'frontline'], { counters: ['formation-support'], vulnerableTo: ['ranged'], upgradeFamily: 'detection' }),
  shadow_warden: role('detection', 'Elite detection scout that reveals disguised spies more reliably.', ['detection', 'frontline'], { counters: ['formation-support'], vulnerableTo: ['ranged'], upgradeFamily: 'detection', terminalReason: 'Persian detection replacement with no separate successor chain.' }),
  war_hound: role('detection', 'Combat detection scout that catches spies and harasses exposed units.', ['detection', 'frontline', 'mobile', 'capture'], { counters: ['formation-support'], vulnerableTo: ['ranged'], upgradeFamily: 'detection' }),
  beast_handler: role('detection', 'Mobile detection support that reveals disguised spies while staying with the formation.', ['detection'], { secondaryRoles: ['formation-support'], counters: ['formation-support'], vulnerableTo: ['ranged'], upgradeFamily: 'detection' }),
  war_elephant: role('shock', 'A powerful charger that thrives in open ground but fears polearms and rough terrain.', ['mobile', 'capture'], { counters: ['ranged', 'siege'], vulnerableTo: ['anti-mounted'], upgradeFamily: 'mounted', terminalReason: 'Era 4 shock apex with no later roster replacement.', publicFacts: ['+20% attack on open ground', '−15% attack in forest, jungle, swamp, or hills', 'Reduces non-polearm return damage by 15%', 'Spearman and Pikeman gain +35% against this unit', 'Live Ivory reduces new city production cost by 15%'] }),
  caravan: civilian('Land trade unit that establishes a profitable route.', ['trade'], 'trade'),
  merchant_wagon: civilian('Improved land trader that carries a route farther and safer.', ['trade'], 'trade'),
  freight_convoy: civilian('Top-tier land trader that sustains valuable long routes.', ['trade'], 'trade'),
  naval_trader: civilian('Coastal trade unit that establishes profitable sea routes.', ['trade'], 'trade'),
  steamship_trader: civilian('Steam-powered trader that carries sea routes farther.', ['trade'], 'trade'),
  cargo_freighter: civilian('Large freighter that sustains valuable maritime trade routes.', ['trade'], 'trade'),
  container_ship: civilian('Top-tier container ship that sustains global sea trade.', ['trade'], 'trade'),
  air_freighter: civilian('Air trader that establishes routes across difficult terrain.', ['trade'], 'trade'),
  jet_freighter: civilian('Fast air trader that sustains long-distance trade routes.', ['trade'], 'trade'),
  global_air_cargo: civilian('Top-tier air trader that connects the entire empire.', ['trade'], 'trade'),
  expedition: civilian('Civilian explorer that establishes outposts on remote resources.', ['resource-expedition', 'recon']),
} as const satisfies Partial<Record<UnitType, UnitRoleDefinition>>;

export function getUnitRoleDefinition(type: UnitType): UnitRoleDefinition | undefined {
  return (UNIT_ROLE_DEFINITIONS as Partial<Record<UnitType, UnitRoleDefinition>>)[type];
}

export function getTerminalCombatUnitReasons(): Partial<Record<UnitType, string>> {
  return Object.fromEntries(Object.entries(UNIT_ROLE_DEFINITIONS)
    .flatMap(([type, definition]) => definition.terminalReason ? [[type, definition.terminalReason]] : [])) as Partial<Record<UnitType, string>>;
}

export function validateUnitRoleDefinitions(
  trainableUnits: readonly TrainableUnitEntry[],
  unitDefinitions: Record<UnitType, UnitDefinition>,
  reachableTechIds: ReadonlySet<string> = new Set(),
): string[] {
  const errors: string[] = [];
  const trainableTypes = new Set(trainableUnits.map(unit => unit.type));
  const visiting = new Set<UnitType>();
  const visited = new Set<UnitType>();

  for (const unit of trainableUnits) {
    const definition = getUnitRoleDefinition(unit.type);
    if (!definition) {
      errors.push(`${unit.type}: missing role definition`);
      continue;
    }
    if (!definition.roleSummary.trim() || definition.roleSummary.trim().split(/\s+/).length > 18) {
      errors.push(`${unit.type}: role summary must contain 1-18 words`);
    }
    if (!definition.aiRoles.length) errors.push(`${unit.type}: missing AI roles`);
    if (unitDefinitions[unit.type].strength > 0 && !unit.upgradesTo && !definition.terminalReason) {
      errors.push(`${unit.type}: combat unit needs an upgrade target or terminal reason`);
    }
    if (unit.upgradesTo && !trainableTypes.has(unit.upgradesTo)) {
      errors.push(`${unit.type}: upgrade target ${unit.upgradesTo} is not trainable`);
    }
    const target = unit.upgradesTo
      ? trainableUnits.find(candidate => candidate.type === unit.upgradesTo)
      : undefined;
    if (target && reachableTechIds.size > 0) {
      for (const techId of getRequiredTechIds(target)) {
        if (!reachableTechIds.has(techId)) {
          errors.push(`${unit.type}: target ${target.type} needs unreachable technology ${techId}`);
        }
      }
    }
    if (unit.upgradesTo
      && (unitDefinitions[unit.type].domain ?? 'land') !== (unitDefinitions[unit.upgradesTo].domain ?? 'land')
      && !definition.domainTransitionReason) {
      errors.push(`${unit.type}: cross-domain upgrade needs a documented transition`);
    }
  }

  const visit = (type: UnitType): void => {
    if (visiting.has(type)) {
      errors.push(`${type}: upgrade cycle detected`);
      return;
    }
    if (visited.has(type)) return;
    visited.add(type);
    const unit = trainableUnits.find(candidate => candidate.type === type);
    if (!unit?.upgradesTo || !trainableTypes.has(unit.upgradesTo)) return;
    visiting.add(type);
    visit(unit.upgradesTo);
    visiting.delete(type);
  };
  for (const unit of trainableUnits) visit(unit.type);
  return errors;
}
