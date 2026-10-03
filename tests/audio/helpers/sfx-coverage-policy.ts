import type { UnitDefinition, UnitType } from '../../../src/core/types';
import type { SfxClass } from '../../../src/audio/sfx-catalog';
import { PIRATE_MOVEMENT_SFX } from '../../../src/audio/sfx-catalog';
import { UNIT_DEFINITIONS } from '../../../src/systems/unit-definitions';
import { getUnitRoleDefinition } from '../../../src/systems/combat-role-definitions';
import { BEAST_DEFINITIONS } from '../../../src/systems/beast-definitions';

/**
 * #612: which SfxClass values are mechanically relevant for a unit, derived from the live
 * UnitDefinition / role data — never from a unit name or a hand-kept roster. A future UnitType
 * enters the structural coverage test automatically.
 *
 * The contract mirrors what `SfxDirector` actually plays:
 *   attacker  -> ranged-loose ?? siege-fire ?? attack-swing
 *   defender  -> attack-impact ?? ranged-impact ?? siege-impact   (the *defender's* own catalog entry)
 *   removed   -> death
 * so `attackVoice` / `hitVoice` are any-of sets: one hit from the set satisfies the requirement.
 */
export interface UnitSfxRequirement {
  kind: 'noncombat' | 'melee' | 'ranged' | 'siege';
  /** Any-of. Empty = this unit never performs an attack, so no attack cue is required (or allowed to be demanded). */
  attackVoice: readonly SfxClass[];
  /** Any-of. Empty = no hit cue required. */
  hitVoice: readonly SfxClass[];
  death: boolean;
}

type PolicyDefinition = Pick<UnitDefinition, 'strength' | 'attackProfile'>;

const BEAST_UNIT_TYPES: ReadonlySet<string> = new Set(
  Object.values(BEAST_DEFINITIONS).map(beast => beast.unitType),
);
const PIRATE_UNIT_TYPES: ReadonlySet<string> = new Set(Object.keys(PIRATE_MOVEMENT_SFX));

/**
 * A role that declares it counters nothing is designed to avoid fights (scouts, spies, balloons,
 * hackers). Their small `strength` is self-defence, so no attack cue is demanded — exactly the
 * pre-#612 convention (death only). A unit with no role entry (beasts, pirates, crisis hosts)
 * is offensive whenever it has strength.
 */
function isSelfDefenceOnly(type: UnitType): boolean {
  const role = getUnitRoleDefinition(type);
  return role !== undefined && (role.primaryRole === 'civilian' || role.counters.length === 0);
}

export function getUnitSfxRequirement(
  type: UnitType,
  definitions: Record<string, PolicyDefinition> = UNIT_DEFINITIONS,
): UnitSfxRequirement {
  const definition = definitions[type];
  // Mirrors `getUnitAttackProfile` (attack-targeting.ts): no profile = default melee, adjacent, unit+city.
  const profile = definition.attackProfile ?? { kind: 'melee' as const, range: 1, targets: ['unit', 'city'] as const };
  const offensive = definition.strength > 0 && profile.targets.length > 0 && !isSelfDefenceOnly(type);
  if (!offensive) return { kind: 'noncombat', attackVoice: [], hitVoice: [], death: true };

  // Pirates ship their own fire/impact cues under the melee-named classes (pirate audio batch).
  if (PIRATE_UNIT_TYPES.has(type)) {
    return { kind: 'ranged', attackVoice: ['attack-swing'], hitVoice: ['attack-impact'], death: true };
  }
  // Legendary beasts roar when attacking and are deliberately silent when hit (sfx-catalog.ts comment).
  if (BEAST_UNIT_TYPES.has(type)) {
    return { kind: profile.kind === 'melee' ? 'melee' : 'ranged', attackVoice: ['attack-swing'], hitVoice: [], death: true };
  }

  switch (profile.kind) {
    case 'melee':
      return { kind: 'melee', attackVoice: ['attack-swing'], hitVoice: ['attack-impact'], death: true };
    case 'ranged':
      // 'siege-fire' is accepted for bolt throwers (Ballista is `ranged` but fires siege classes).
      return { kind: 'ranged', attackVoice: ['ranged-loose', 'siege-fire'], hitVoice: ['ranged-impact', 'siege-impact'], death: true };
    case 'siege':
    case 'bombard':
      return { kind: 'siege', attackVoice: ['siege-fire', 'ranged-loose'], hitVoice: ['siege-impact', 'ranged-impact'], death: true };
  }
}

export type SfxCatalogShape = Partial<Record<UnitType, Partial<Record<SfxClass, { file: string }>>>>;

export interface CoverageGap { unit: string; missing: 'attack voice' | 'hit voice' | 'death'; need: readonly SfxClass[] }

/** Pure: returns every unit whose catalog entry does not satisfy its derived requirement. */
export function findCoverageGaps(
  catalog: SfxCatalogShape,
  definitions: Record<string, PolicyDefinition> = UNIT_DEFINITIONS,
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  for (const type of Object.keys(definitions) as UnitType[]) {
    const need = getUnitSfxRequirement(type, definitions);
    const have = catalog[type] ?? {};
    const hasAny = (classes: readonly SfxClass[]) => classes.some(sfxClass => have[sfxClass] !== undefined);
    if (need.attackVoice.length > 0 && !hasAny(need.attackVoice)) gaps.push({ unit: type, missing: 'attack voice', need: need.attackVoice });
    if (need.hitVoice.length > 0 && !hasAny(need.hitVoice)) gaps.push({ unit: type, missing: 'hit voice', need: need.hitVoice });
    if (need.death && !have.death) gaps.push({ unit: type, missing: 'death', need: ['death'] });
  }
  return gaps;
}

/**
 * Files that several UnitTypes play. Sharing one file is only acceptable when it is a deliberate,
 * named family: every set of units that share a file must fit inside one family below. A new
 * accidental alias therefore fails `sfx-coverage.test.ts` until someone writes down why it is right.
 */
export const INTENTIONAL_SFX_FAMILIES: Record<string, { note: string; units: readonly UnitType[] }> = {
  'mounted-light': { note: 'Chariot reuses Horseman cues until #714 ships bespoke mounted audio.', units: ['horseman', 'chariot'] },
  'mounted-heavy': { note: 'Armored Car and Cuirassier reuse Knight cues; #715 / #714 own the bespoke audio.', units: ['knight', 'armored_car', 'cuirassier'] },
  'hound-and-beast-handler': { note: 'Beast-combat units share War Hound cues; #714 / #719 own bespoke audio.', units: ['war_hound', 'beast_handler', 'war_elephant', 'beast_stampede_herd', 'rogue_handler', 'rogue_elephant'] },
  'ancient-naval-gun': { note: 'Capital ships keep the ancient-ship cannon fallback; #717 owns Battleship / Missile Cruiser audio.', units: ['trireme', 'battleship', 'missile_cruiser'] },
  'classical-siege': { note: 'Trebuchet shares Catapult cues; #684 / #717 own bespoke siege audio.', units: ['catapult', 'trebuchet'] },
  'covert-operative-defeat': { note: 'Senior spies share the Operative defeat cue pending bespoke audio.', units: ['spy_operative', 'spy_intelligence_officer', 'spy_station_chief'] },
  'powered-infantry': { note: 'Mechanized Infantry shares Exosuit cues; #715 owns bespoke mechanized audio.', units: ['exosuit_infantry', 'mechanized_infantry'] },
  'musketeer-cues': { note: 'Mobile AA keeps its temporary Musketeer cues; #716 owns it.', units: ['musketeer', 'mobile_aa'] },
  'infantry-hit': { note: 'Rifle-era infantry share one strike-plus-grunt hit cue.', units: ['marine', 'rifleman', 'infantry', 'paratrooper', 'machine_gunner'] },
  'soldier-defeat': { note: 'Rifle-era foot soldiers share one body-fall defeat cue.', units: ['rifleman', 'infantry', 'marine', 'machine_gunner', 'paratrooper', 'grenadier'] },
  'civilian-defeat': { note: 'Unarmed humanoids without their own cue; #594 owns missionary preaching, #889 richer General audio.', units: ['missionary', 'great_general'] },
  'rifle-semi': { note: 'Semi-automatic rifle report for modern infantry.', units: ['infantry', 'marine', 'paratrooper'] },
  'machine-gun-burst': { note: 'Rapid-fire machine-gun burst (infantry gunner and WWI/WWII-era fighters).', units: ['machine_gunner', 'biplane', 'wwii_fighter'] },
  'autocannon-burst': { note: 'Aircraft autocannon / helicopter chain gun.', units: ['jet_fighter', 'attack_helicopter'] },
  'black-powder-cannon': { note: 'Smoothbore cannon report, shared by land Cannon and the sailing Frigate.', units: ['cannon', 'frigate'] },
  'shell-impact': {
    note: 'Generic artillery / gun shell strike for gun-armed land and surface units.',
    units: ['cannon', 'artillery', 'rocket_artillery', 'grenadier', 'tank', 'main_battle_tank', 'anti_tank_gun', 'frigate', 'ironclad', 'pre_dreadnought', 'destroyer', 'carrier', 'supercarrier'],
  },
  'heavy-blast': { note: 'Underwater blast when a submarine is hit.', units: ['submarine', 'missile_submarine'] },
  'high-velocity-gun': { note: 'Tank and anti-tank direct-fire gun.', units: ['tank', 'main_battle_tank', 'anti_tank_gun'] },
  'armour-and-gun-wreck': { note: 'Destroyed vehicles and guns.', units: ['artillery', 'rocket_artillery', 'tank', 'main_battle_tank', 'anti_tank_gun'] },
  'missile-launch': { note: 'Rocket / missile ignition: rocket artillery, missile submarine, naval strike aircraft.', units: ['rocket_artillery', 'missile_submarine', 'naval_strike_aircraft'] },
  'steel-naval-gun': { note: 'Quick-firing steel-hull naval gun.', units: ['ironclad', 'pre_dreadnought', 'destroyer', 'carrier', 'supercarrier'] },
  'iron-hull-defeat': { note: 'Early iron ships share one hull-loss cue.', units: ['ironclad', 'pre_dreadnought'] },
  'modern-hull-defeat': { note: 'Modern steel warships and submarines share one hull-loss cue.', units: ['destroyer', 'carrier', 'supercarrier', 'submarine', 'missile_submarine'] },
  'aircraft-hit': { note: 'Metal strike when any combat aircraft is hit.', units: ['biplane', 'wwii_fighter', 'jet_fighter', 'attack_helicopter', 'bomber', 'naval_strike_aircraft'] },
  'aircraft-loss': { note: 'Powered aircraft shot down.', units: ['biplane', 'wwii_fighter', 'jet_fighter', 'bomber', 'recon_aircraft', 'naval_strike_aircraft', 'maritime_patrol_aircraft', 'attack_helicopter'] },
};
