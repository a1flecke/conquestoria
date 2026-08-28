import type { GameState, HexCoord, Unit } from '@/core/types';
import type { CombatContext } from './combat-system';
import { resolveCivDefinition } from './civ-registry';
import { hexKey, hexDistance, wrappedHexDistance } from './hex-utils';
import { isCityCoastal } from './city-system';
import { UNIT_DEFINITIONS } from './unit-system';
import { getActiveNationalProjectsForCiv } from './national-project-system';
import { getCombatModifier } from './unit-modifier-system';
import { getCombatAdjacentOccupiedTileCount } from './zone-of-control-system';
import { getNetworkCombatCoordination } from './network-combat-coordination';
import { resolveAirDefenseCoverage } from './air-defense-system';
import { resolveCombinedArms } from './combined-arms-system';
import { resolveFortificationDefense } from './fortification-system';
import { resolveLandSupplyCombatPenalty } from './supply-combat';
import { resolveLastStandDefenseBonus } from './great-general-abilities';
import { getTacticalAdjacentCitadelDefense } from './legendary-wonder-tactical-effects';

export interface CombatContextOptions {
  amphibiousAssault?: boolean;
  isIntercepting?: boolean;
}

function hasAdjacentShoreBombardment(state: GameState, owner: string, target: HexCoord): boolean {
  return Object.values(state.units).some(unit => {
    if (unit.owner !== owner || unit.transportId) return false;
    const definition = UNIT_DEFINITIONS[unit.type];
    if (definition?.domain !== 'naval') return false;
    if (!['ranged', 'bombard'].includes(definition.attackProfile?.kind ?? '')) return false;
    const distance = state.map.wrapsHorizontally
      ? wrappedHexDistance(unit.position, target, state.map.width)
      : hexDistance(unit.position, target);
    return distance === 1;
  });
}

/** The shared landing multiplier used by combat and undefended-city assaults. */
export function getAmphibiousAssaultMultiplier(
  state: GameState,
  attacker: Unit,
  targetCoord: Unit['position'],
): number {
  const targetIsCoastalCity = Object.values(state.cities).some(city =>
    hexKey(city.position) === hexKey(targetCoord) && isCityCoastal(city, state.map),
  );
  const modifier = getCombatModifier(attacker.type, 'attacker', {
    completedTechs: state.civilizations[attacker.owner]?.techState.completed ?? [],
    activeNationalProjects: getActiveNationalProjectsForCiv(state, attacker.owner),
    fullHP: attacker.health >= 100,
    inFriendlyCity: false,
    amphibiousAssault: true,
    targetIsCoastalCity,
    opponentType: attacker.type,
  });
  const shoreSupport = hasAdjacentShoreBombardment(state, attacker.owner, targetCoord);
  return 0.5 * (shoreSupport ? 1.1 : 1) * modifier.mult;
}

// Shared by the human attack flow (main.ts), every AI attack path
// (ai-major-turn.ts, ai-tactics.ts), and the combat preview so the
// three can never diverge in what defense modifiers a defender receives.
export function buildCombatContextForDefender(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  options: CombatContextOptions = {},
): CombatContext {
  const defenderKey = hexKey(defender.position);
  const defenderCity = Object.values(state.cities).find(
    city => hexKey(city.position) === defenderKey,
  );
  const attackerKey = hexKey(attacker.position);
  const attackerCity = Object.values(state.cities).find(
    city => hexKey(city.position) === attackerKey,
  );

  const attackerCompletedTechs = state.civilizations[attacker.owner]?.techState.completed ?? [];
  const defenderCompletedTechs = state.civilizations[defender.owner]?.techState.completed ?? [];
  const defenderInFriendlyCity = !!defenderCity && defenderCity.owner === defender.owner;
  const attackerInFriendlyCity = !!attackerCity && attackerCity.owner === attacker.owner;
  const flankingTiles = getCombatAdjacentOccupiedTileCount(state, attacker.owner, defender, attacker.id);
  const supportTiles = getCombatAdjacentOccupiedTileCount(state, defender.owner, defender, defender.id);
  const shoreSupport = options.amphibiousAssault && hasAdjacentShoreBombardment(state, attacker.owner, defender.position);
  const amphibiousParts = options.amphibiousAssault
    ? [
        { label: 'Landing -50%', kind: 'mult' as const },
        ...(shoreSupport ? [{ label: 'Shore bombardment +10%', kind: 'mult' as const }] : []),
      ]
    : [];
  const interceptionStrengthMultiplier = options.isIntercepting
    ? UNIT_DEFINITIONS[attacker.type].airOperation?.interceptionStrengthMultiplier
    : undefined;
  const attackerCombinedArms = resolveCombinedArms(state, attacker);
  const defenderCombinedArms = resolveCombinedArms(state, defender);
  const fortification = resolveFortificationDefense(state, defender, attacker);
  const attackerSupplyPenalty = resolveLandSupplyCombatPenalty(attacker);
  const defenderSupplyPenalty = resolveLandSupplyCombatPenalty(defender);
  const defenderLastStand = resolveLastStandDefenseBonus(defender, state.turn);
  const tacticalCitadel = getTacticalAdjacentCitadelDefense(state, defender);

  return {
    attackerBonus: resolveCivDefinition(
      state,
      state.civilizations[attacker.owner]?.civType ?? '',
    )?.bonusEffect,
    defenderBonus: resolveCivDefinition(
      state,
      state.civilizations[defender.owner]?.civType ?? '',
    )?.bonusEffect,
    airDefenseCoverage: resolveAirDefenseCoverage(state, defender, attacker.owner),
    defenderCity: defenderCity
      ? {
          cityBuildings: defenderCity.buildings,
          defenderCompletedTechs,
          attackerDomain: UNIT_DEFINITIONS[attacker.type]?.domain ?? 'land',
        }
      : undefined,
    attackerModifiers: getCombatModifier(attacker.type, 'attacker', {
      completedTechs: attackerCompletedTechs,
      activeNationalProjects: getActiveNationalProjectsForCiv(state, attacker.owner),
      fullHP: attacker.health >= 100,
      inFriendlyCity: attackerInFriendlyCity,
      amphibiousAssault: options.amphibiousAssault,
      targetIsCity: Boolean(defenderCity),
      targetIsCoastalCity: defenderCity ? isCityCoastal(defenderCity, state.map) : false,
      opponentType: defender.type,
      opponentHealth: defender.health,
      opponentInFriendlyCity: defenderInFriendlyCity,
      targetTerrain: state.map.tiles[defenderKey]?.terrain,
    }),
    defenderModifiers: getCombatModifier(defender.type, 'defender', {
      completedTechs: defenderCompletedTechs,
      activeNationalProjects: getActiveNationalProjectsForCiv(state, defender.owner),
      fullHP: defender.health >= 100,
      inFriendlyCity: defenderInFriendlyCity,
      opponentType: attacker.type,
    }),
    attackerPositioningMultiplier: 1 + flankingTiles * 0.1,
    defenderPositioningMultiplier: 1 + supportTiles * 0.1,
    attackerAmphibiousMultiplier: options.amphibiousAssault
      ? getAmphibiousAssaultMultiplier(state, attacker, defender.position)
      : undefined,
    attackerAmphibiousParts: amphibiousParts,
    attackerInterceptionStrengthMultiplier: interceptionStrengthMultiplier,
    attackerInterceptionPart: interceptionStrengthMultiplier && interceptionStrengthMultiplier !== 1
      ? { label: `Interception +${Math.round((interceptionStrengthMultiplier - 1) * 100)}%`, kind: 'mult' }
      : undefined,
    attackerInterceptionFact: interceptionStrengthMultiplier && interceptionStrengthMultiplier !== 1
      ? { key: 'fighter-interception', label: `Interception +${Math.round((interceptionStrengthMultiplier - 1) * 100)}%`, sourceVisibility: 'public', operation: 'multiplier', value: interceptionStrengthMultiplier, outcome: 'applied' }
      : undefined,
    attackerCombinedArmsMultiplier: attackerCombinedArms.multiplier,
    defenderCombinedArmsMultiplier: defenderCombinedArms.multiplier,
    attackerCombinedArmsFact: attackerCombinedArms.fact,
    defenderCombinedArmsFact: defenderCombinedArms.fact,
    defenderFortificationMultiplier: fortification.multiplier,
    defenderFortificationFact: fortification.label ? { key: 'fortification', label: fortification.label, sourceVisibility: 'public', operation: 'multiplier', value: fortification.multiplier, outcome: 'applied' } : undefined,
    defenderTacticalCitadelMultiplier: tacticalCitadel.multiplier,
    defenderTacticalCitadelFact: tacticalCitadel.label
      ? { key: 'legendary-citadel', label: tacticalCitadel.label, sourceVisibility: 'public', operation: 'multiplier', value: tacticalCitadel.multiplier, outcome: 'applied' }
      : undefined,
    attackerLandSupplyMultiplier: attackerSupplyPenalty.multiplier,
    attackerLandSupplyFact: attackerSupplyPenalty.label
      ? { key: 'land-supply', label: attackerSupplyPenalty.label, sourceVisibility: 'owner', operation: 'multiplier', value: attackerSupplyPenalty.multiplier, outcome: 'applied' }
      : undefined,
    defenderLandSupplyMultiplier: defenderSupplyPenalty.multiplier,
    defenderLandSupplyFact: defenderSupplyPenalty.label
      ? { key: 'land-supply', label: defenderSupplyPenalty.label, sourceVisibility: 'owner', operation: 'multiplier', value: defenderSupplyPenalty.multiplier, outcome: 'applied' }
      : undefined,
    // #544 MR4: 'public' (not 'owner' like land-supply) -- Last Stand's
    // defense bonus is a visible battlefield effect the attacker should see
    // forming up, same reasoning as fortification being public.
    defenderLastStandMultiplier: defenderLastStand.multiplier,
    defenderLastStandFact: defenderLastStand.label
      ? { key: 'last-stand', label: defenderLastStand.label, sourceVisibility: 'public', operation: 'multiplier', value: defenderLastStand.multiplier, outcome: 'applied' }
      : undefined,
    attackerPositioningPart: flankingTiles > 0 ? { label: `Flanked +${flankingTiles * 10}%`, kind: 'mult' } : undefined,
    defenderPositioningPart: supportTiles > 0 ? { label: `Supported +${supportTiles * 10}%`, kind: 'mult' } : undefined,
    attackerNetworkStrengthBonus: getNetworkCombatCoordination(state, attacker, 'attack').strengthBonus,
    defenderNetworkStrengthBonus: getNetworkCombatCoordination(state, defender, 'defense').strengthBonus,
  };
}
