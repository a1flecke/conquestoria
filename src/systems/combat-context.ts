import type { GameState, HexCoord, Unit } from '@/core/types';
import type { CombatContext } from './combat-system';
import { resolveCivDefinition } from './civ-registry';
import { hexKey, hexDistance, wrappedHexDistance } from './hex-utils';
import { isCityCoastal } from './city-system';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { getActiveNationalProjectsForCiv } from './national-project-system';
import { getCombatModifier } from './unit-modifier-system';
import { getCombatAdjacentOccupiedTileCount } from './zone-of-control-system';
import { getObservedUnitForViewer } from './viewer-intel';
import { getNetworkCombatCoordination } from './network-combat-coordination';
import { resolveAirDefenseCoverage } from './air-defense-system';
import { resolveCombinedArms } from './combined-arms-system';
import { resolveFortificationDefense } from './fortification-system';
import { resolveLandSupplyCombatPenalty } from './supply-combat';
import { getNavalOperationsCombatPenalty } from './naval-endurance';
import { getAirReadinessCombatPenalty } from './air-readiness';
import { resolveLastStandDefenseBonus } from './great-general-abilities';
import { getTacticalAdjacentCitadelDefense } from './legendary-wonder-tactical-effects';

export interface CombatContextOptions {
  amphibiousAssault?: boolean;
  isIntercepting?: boolean;
  tacticalInterceptionMultiplier?: number;
}

function neutraliseSide(context: CombatContext, side: 'attacker' | 'defender'): CombatContext {
  const next: CombatContext = { ...context };
  const set = (key: string, value: unknown) => { (next as Record<string, unknown>)[key] = value; };
  const cap = side === 'attacker' ? 'attacker' : 'defender';
  // Owner-visibility fact sources: the state of a force the viewer cannot inspect.
  for (const source of ['CombinedArms', 'LandSupply', 'NavalOperations', 'AirReadiness']) {
    set(`${cap}${source}Multiplier`, 1);
    set(`${cap}${source}Fact`, undefined);
  }
  set(`${cap}NetworkStrengthBonus`, 0);
  const engine = side === 'attacker' ? context.attackerModifiers : context.defenderModifiers;
  if (engine) {
    // The engine's mult/flat are exactly the product/sum of its applied facts; keep the public ones.
    const publicApplied = (engine.facts ?? []).filter(fact => fact.sourceVisibility === 'public' && fact.outcome === 'applied');
    const rebuilt = {
      mult: publicApplied.filter(f => f.operation === 'multiplier').reduce((total, f) => total * f.value, 1),
      flat: publicApplied.filter(f => f.operation === 'flat').reduce((total, f) => total + f.value, 0),
      parts: [],
      facts: publicApplied,
    };
    set(`${cap}Modifiers`, rebuilt);
  }
  if (side === 'defender') {
    next.airDefenseCoverage = undefined;
    if (context.defenderCity) next.defenderCity = { ...context.defenderCity, defenderCompletedTechs: [] };
  }
  return next;
}

/** Build predictive combat numbers from the actor's own modifiers and observable enemy forces. */
export function buildObservedCombatContext(
  state: GameState, viewerId: string, attacker: Unit, defender: Unit, options?: CombatContextOptions,
): CombatContext {
  let context = buildCombatContextForDefender(state, attacker, defender, options);
  const observe = (unit: Unit) => getObservedUnitForViewer(state, viewerId, unit);
  if (attacker.owner !== viewerId) {
    const count = getCombatAdjacentOccupiedTileCount(state, attacker.owner, defender, attacker.id, observe);
    context = neutraliseSide(context, 'attacker');
    context.attackerPositioningMultiplier = 1 + count * 0.1;
    context.attackerPositioningPart = count ? { label: `Flanked +${count * 10}%`, kind: 'mult' } : undefined;
  }
  if (defender.owner !== viewerId) {
    const count = getCombatAdjacentOccupiedTileCount(state, defender.owner, defender, defender.id, observe);
    context = neutraliseSide(context, 'defender');
    context.defenderPositioningMultiplier = 1 + count * 0.1;
    context.defenderPositioningPart = count ? { label: `Supported +${count * 10}%`, kind: 'mult' } : undefined;
  }
  return context;
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
    ? (UNIT_DEFINITIONS[attacker.type].airOperation?.interceptionStrengthMultiplier ?? 1)
      * (options.tacticalInterceptionMultiplier ?? 1)
    : undefined;
  const attackerCombinedArms = resolveCombinedArms(state, attacker);
  const defenderCombinedArms = resolveCombinedArms(state, defender);
  const fortification = resolveFortificationDefense(state, defender, attacker);
  const attackerSupplyPenalty = resolveLandSupplyCombatPenalty(attacker);
  const defenderSupplyPenalty = resolveLandSupplyCombatPenalty(defender);
  const attackerNavalOps = getNavalOperationsCombatPenalty(attacker);
  const defenderNavalOps = getNavalOperationsCombatPenalty(defender);
  const attackerAirReadiness = getAirReadinessCombatPenalty(attacker);
  const defenderAirReadiness = getAirReadinessCombatPenalty(defender);
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
    attackerNavalOperationsMultiplier: attackerNavalOps.multiplier,
    attackerNavalOperationsFact: attackerNavalOps.label
      ? { key: 'naval-operations', label: attackerNavalOps.label, sourceVisibility: 'owner', operation: 'multiplier', value: attackerNavalOps.multiplier, outcome: 'applied' }
      : undefined,
    defenderNavalOperationsMultiplier: defenderNavalOps.multiplier,
    defenderNavalOperationsFact: defenderNavalOps.label
      ? { key: 'naval-operations', label: defenderNavalOps.label, sourceVisibility: 'owner', operation: 'multiplier', value: defenderNavalOps.multiplier, outcome: 'applied' }
      : undefined,
    attackerAirReadinessMultiplier: attackerAirReadiness.multiplier,
    attackerAirReadinessFact: attackerAirReadiness.label
      ? { key: 'air-readiness', label: attackerAirReadiness.label, sourceVisibility: 'owner', operation: 'multiplier', value: attackerAirReadiness.multiplier, outcome: 'applied' }
      : undefined,
    defenderAirReadinessMultiplier: defenderAirReadiness.multiplier,
    defenderAirReadinessFact: defenderAirReadiness.label
      ? { key: 'air-readiness', label: defenderAirReadiness.label, sourceVisibility: 'owner', operation: 'multiplier', value: defenderAirReadiness.multiplier, outcome: 'applied' }
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
