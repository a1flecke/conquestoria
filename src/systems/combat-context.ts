import type { GameState, Unit } from '@/core/types';
import type { CombatContext } from './combat-system';
import { resolveCivDefinition } from './civ-registry';
import { hexKey, hexDistance, wrappedHexDistance } from './hex-utils';
import { isCityCoastal } from './city-system';
import { UNIT_DEFINITIONS } from './unit-system';
import { getActiveNationalProjectsForCiv } from './national-project-system';
import { getCombatModifier } from './unit-modifier-system';
import { getCombatAdjacentOccupiedTileCount } from './zone-of-control-system';

export interface CombatContextOptions {
  amphibiousAssault?: boolean;
}

function hasAdjacentShoreBombardment(state: GameState, owner: string, defender: Unit): boolean {
  return Object.values(state.units).some(unit => {
    if (unit.owner !== owner || unit.transportId) return false;
    const definition = UNIT_DEFINITIONS[unit.type];
    if (definition?.domain !== 'naval') return false;
    if (!['ranged', 'bombard'].includes(definition.attackProfile?.kind ?? '')) return false;
    const distance = state.map.wrapsHorizontally
      ? wrappedHexDistance(unit.position, defender.position, state.map.width)
      : hexDistance(unit.position, defender.position);
    return distance === 1;
  });
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
  const shoreSupport = options.amphibiousAssault && hasAdjacentShoreBombardment(state, attacker.owner, defender);
  const amphibiousParts = options.amphibiousAssault
    ? [
        { label: 'Landing -50%', kind: 'mult' as const },
        ...(shoreSupport ? [{ label: 'Shore bombardment +10%', kind: 'mult' as const }] : []),
      ]
    : [];

  return {
    attackerBonus: resolveCivDefinition(
      state,
      state.civilizations[attacker.owner]?.civType ?? '',
    )?.bonusEffect,
    defenderBonus: resolveCivDefinition(
      state,
      state.civilizations[defender.owner]?.civType ?? '',
    )?.bonusEffect,
    defenderCityHasAntiAir: Object.values(state.cities).some(city =>
      hexKey(city.position) === defenderKey
      && city.buildings.includes('anti_air_battery')),
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
      targetIsCoastalCity: defenderCity ? isCityCoastal(defenderCity, state.map) : false,
      opponentType: defender.type,
      opponentInFriendlyCity: defenderInFriendlyCity,
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
    attackerAmphibiousMultiplier: options.amphibiousAssault ? 0.5 * (shoreSupport ? 1.1 : 1) : undefined,
    attackerAmphibiousParts: amphibiousParts,
    attackerPositioningPart: flankingTiles > 0 ? { label: `Flanked +${flankingTiles * 10}%`, kind: 'mult' } : undefined,
    defenderPositioningPart: supportTiles > 0 ? { label: `Supported +${supportTiles * 10}%`, kind: 'mult' } : undefined,
  };
}
