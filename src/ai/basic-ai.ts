import type { GameState, Unit, HexCoord, PersonalityTraits, SpyMissionType, City, UnitType } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { hexKey, wrappedHexDistance, hexDistance } from '@/systems/hex-utils';
import { getDetectionUnitTypeForCiv } from '@/systems/city-system';
import { foundCityInState } from '@/systems/city-founding-system';
import { canFoundCityAt } from '@/systems/city-territory-system';
import { getMovementRange, moveUnit, findPath, createUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import {
  canLoadUnitOntoTransport,
  loadUnitOntoTransport,
  getTransportCargo,
  getTransportCargoUsed,
  getTransportCapacity,
  getUnloadDestinations,
  unloadUnitFromTransport,
} from '@/systems/transport-system';
import { resolveCombat } from '@/systems/combat-system';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { buildUnitOccupancy } from '@/systems/unit-occupancy';
import { getAvailableTechs, startResearch } from '@/systems/tech-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { updateAndRefreshVisibility } from '@/systems/last-seen-presentation';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { hasMetCivilization, syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';

import { chooseProduction } from './ai-strategy';
import { evaluateDiplomacy, evaluateMinorCivDiplomacy, evaluateVassalage, evaluateEmbargoResponse, evaluateLeagueResponse } from './ai-diplomacy';
import {
  declareWar,
  enqueuePeaceRequest,
  proposeTreaty,
  modifyRelationship,
  offerVassalage,
  joinEmbargo,
  inviteToLeague,
  getAvailableActions,
  resolveOpponentKind,
} from '@/systems/diplomacy-system';
import {
  getAvailableMissions,
  embedSpy,
  attemptInfiltration,
  expelSpy,
  executeSpy,
  startInterrogation,
  missionRequiresPlacedSpy,
  startMission,
  isSpyUnitType,
  getSpyCaptureRelationshipPenalty,
} from '@/systems/espionage-system';
import { createRng } from '@/systems/map-generator';
import { appeaseFaction } from '@/systems/faction-system';
import {
  getEligibleLegendaryWonders,
  initializeLegendaryWonderProjectsForAllCities,
  loseLegendaryWonderRace,
  startLegendaryWonderBuild,
} from '@/systems/legendary-wonder-system';
import { BUILDINGS, getAvailableBuildings } from '@/systems/city-system';
import { getReservedNationalProjectKeys } from '@/systems/national-project-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { applyCampDestructionAtTarget } from '@/systems/barbarian-system';
import { BEAST_OWNER, isBeastUnit, canUnitAttackBeast } from '@/systems/beast-system';
import { applyDiplomaticReaction } from '@/systems/minor-civ-system';
import { getCivAvailableResources, canEstablishOutpost, performEstablishOutpost } from '@/systems/resource-acquisition-system';
import { canEstablishRoute, RESOURCE_DEFINITIONS } from '@/systems/trade-system';
import { establishQuestAwareRoute } from '@/systems/quest-aware-trade-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { performMinorCivFestival, performMinorCivGift } from '@/systems/minor-civ-actions';
import { getCapitalCity, getCapitalCityId } from '@/systems/capital-system';
import { classifyOwner, isAlwaysHostilePair } from '@/core/owner-kind';
import { getPirateWatersPresentation, type PirateFactionPresentation } from '@/systems/pirate-presentation';
import {
  assaultPirateEnclave,
  getEnclaveAssaultPreview,
  hirePirateFlotilla,
  payPirateTribute,
} from '@/systems/pirate-actions';
import { derivePirateBlockades } from '@/systems/pirate-behavior';
import { buildCombatPresentation } from '@/systems/viewer-event-presentation';
import {
  buildDiplomaticStrengthEstimates,
  buildMajorCivPerception,
  type MajorCivPerception,
} from './ai-perception';
import { processMajorCivStrategicTurn } from './ai-major-turn';
import {
  prepareMajorCivStrategicPlan,
  type PreparedMajorCivPlan,
} from './ai-prepared-turn';
import { isAIHostileOwner } from './ai-hostility';
import { hasAICombatRole } from './ai-unit-roles';
import { applyAIProduction } from './ai-production';
import { applyAIResearch } from './ai-research';
import { processAIResourceMarketplace } from './ai-resource-marketplace';

function addAlwaysHostileOwners(
  state: GameState,
  civId: string,
  owners: Set<string>,
  includeBeasts: boolean,
): void {
  for (const unit of Object.values(state.units)) {
    if (!includeBeasts && classifyOwner(unit.owner) === 'beast') continue;
    if (isAlwaysHostilePair(civId, unit.owner)) owners.add(unit.owner);
  }
}

function getPersonality(state: GameState, civType: string): PersonalityTraits {
  const def = resolveCivDefinition(state, civType);
  return def?.personality ?? {
    traits: [],
    warLikelihood: 0.5,
    diplomacyFocus: 0.5,
    expansionDrive: 0.5,
  };
}

function shouldAiStationDefensiveSpy(state: GameState, civId: string): boolean {
  const civ = state.civilizations[civId];
  const espState = state.espionage?.[civId];
  if (!civ || !espState) return false;

  const hasStage3Espionage = civ.techState.completed.includes('spy-networks') || civ.techState.completed.includes('sabotage');
  if (!hasStage3Espionage) return false;

  const capitalId = getCapitalCityId(state, civId);
  if (!capitalId) return false;

  return (espState.counterIntelligence[capitalId] ?? 0) === 0;
}

function hasStationedSpyIntel(state: GameState, civId: string, targetCivId: string, targetCityId: string): boolean {
  const espionageState = state.espionage?.[civId];
  if (!espionageState) {
    return false;
  }

  return Object.values(espionageState.spies).some(spy =>
    spy.status === 'stationed'
    && spy.targetCivId === targetCivId
    && spy.targetCityId === targetCityId,
  );
}

interface AbandonLegendaryWonderRaceResult {
  state: GameState;
  lostEvents: Array<{
    civId: string;
    cityId: string;
    wonderId: string;
    goldRefund: number;
    transferableProduction: number;
  }>;
}

function getAiLegendaryWonderInvestment(state: GameState, project: NonNullable<GameState['legendaryWonderProjects']>[string]): number {
  const city = state.cities[project.cityId];
  if (project.phase === 'building' && city?.productionQueue[0] === `legendary:${project.wonderId}`) {
    return city.productionProgress;
  }
  return project.investedProduction;
}

function abandonLostLegendaryWonderRace(state: GameState, civId: string): AbandonLegendaryWonderRaceResult {
  if (!state.legendaryWonderProjects) {
    return { state, lostEvents: [] };
  }

  let nextState = state;
  const lostEvents: AbandonLegendaryWonderRaceResult['lostEvents'] = [];

  for (const [projectKey] of Object.entries(state.legendaryWonderProjects)) {
    const project = nextState.legendaryWonderProjects?.[projectKey];
    if (!project) {
      continue;
    }
    if (project.ownerId !== civId || project.phase !== 'building') {
      continue;
    }

    const rivalProjects = Object.entries(nextState.legendaryWonderProjects ?? {}).filter(([, rivalProject]) =>
      rivalProject.wonderId === project.wonderId
      && rivalProject.ownerId !== civId
      && rivalProject.phase === 'building'
      && hasStationedSpyIntel(nextState, civId, rivalProject.ownerId, rivalProject.cityId),
    );

    const rivalLeader = rivalProjects
      .map(([, rivalProject]) => ({
        project: rivalProject,
        investedProduction: getAiLegendaryWonderInvestment(nextState, rivalProject),
      }))
      .sort((left, right) => right.investedProduction - left.investedProduction)[0];
    const projectInvestment = getAiLegendaryWonderInvestment(nextState, project);
    if (!rivalLeader || rivalLeader.investedProduction < projectInvestment + 100) {
      continue;
    }

    const city = nextState.cities[project.cityId];
    const currentQueue = city?.productionQueue ?? [];
    const compensation = loseLegendaryWonderRace(projectInvestment);
    const fallbackBuild = city ? chooseLegendaryWonderFallback(nextState, civId, city.id, personalitySafe(nextState, civId)) : 'warrior';
    const currentProjects = nextState.legendaryWonderProjects ?? {};

    nextState = {
      ...nextState,
      cities: city ? {
        ...nextState.cities,
        [city.id]: {
          ...city,
          productionQueue: [fallbackBuild, ...currentQueue.filter(item => item !== `legendary:${project.wonderId}`)],
          productionProgress: compensation.transferableProduction,
        },
      } : nextState.cities,
      civilizations: {
        ...nextState.civilizations,
        [civId]: {
          ...nextState.civilizations[civId],
          gold: nextState.civilizations[civId].gold + compensation.goldRefund,
        },
      },
      legendaryWonderProjects: {
        ...currentProjects,
        [projectKey]: {
          ...project,
          phase: 'lost_race',
          investedProduction: projectInvestment,
          transferableProduction: compensation.transferableProduction,
        },
      },
    };

    lostEvents.push({
      civId,
      cityId: project.cityId,
      wonderId: project.wonderId,
      goldRefund: compensation.goldRefund,
      transferableProduction: compensation.transferableProduction,
    });
  }

  return { state: nextState, lostEvents };
}

function personalitySafe(state: GameState, civId: string): PersonalityTraits {
  return getPersonality(state, state.civilizations[civId]?.civType ?? 'generic');
}

function pirateDistance(state: GameState, from: HexCoord, to: HexCoord): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(from, to, state.map.width)
    : hexDistance(from, to);
}

function isCombatWarship(unit: Unit): boolean {
  const definition = UNIT_DEFINITIONS[unit.type];
  return definition?.domain === 'naval' && definition.strength > 0 && definition.cargoCapacity === undefined;
}

function moveWarshipToward(state: GameState, civId: string, unit: Unit, target: HexCoord): GameState {
  const occupancy = buildUnitOccupancy(state.units);
  const hostileOwners = new Set<string>(['barbarian']);
  addAlwaysHostileOwners(state, civId, hostileOwners, false);
  const range = getMovementRange(
    unit,
    state.map,
    occupancy.unitIdsByHex,
    occupancy.ownersByUnitId,
    hostileOwners,
    { completedTechs: state.civilizations[civId]?.techState.completed ?? [] },
  );
  const best = range
    .map(coord => ({ coord, distance: pirateDistance(state, coord, target) }))
    .filter(candidate => candidate.distance < pirateDistance(state, unit.position, target))
    .sort((left, right) => left.distance - right.distance
      || left.coord.q - right.coord.q || left.coord.r - right.coord.r)[0];
  if (!best) return state;
  return {
    ...state,
    units: {
      ...state.units,
      [unit.id]: moveUnit(unit, best.coord, unit.movementPointsLeft),
    },
  };
}

function isFavorablePirateFight(attacker: Unit, defender: Unit): boolean {
  const attackerStrength = (UNIT_DEFINITIONS[attacker.type]?.strength ?? 0) * attacker.health / 100;
  const defenderStrength = (UNIT_DEFINITIONS[defender.type]?.strength ?? 0) * defender.health / 100;
  return attackerStrength >= defenderStrength * 1.15;
}

function activeBlockadeFactionIds(state: GameState, civId: string): Set<string> {
  return new Set(derivePirateBlockades(state)
    .filter(blockade => blockade.victimCivId === civId)
    .map(blockade => blockade.factionId));
}

function shouldAiAvoidPirateFaction(state: GameState, civId: string, factionId: string): boolean {
  return !isAIHostileOwner(state, civId, factionId);
}

function knownPirateResponseUnitIds(
  state: GameState,
  civId: string,
  factionPresentations: PirateFactionPresentation[],
): Set<string> {
  return new Set(factionPresentations
    .filter(faction => !shouldAiAvoidPirateFaction(state, civId, faction.factionId))
    .flatMap(faction => faction.observedUnitIds));
}

function choosePirateGoal(
  state: GameState,
  civId: string,
  factionPresentations: PirateFactionPresentation[],
  warship: Unit,
): HexCoord | null {
  const headquarters = factionPresentations
    .filter(faction => !shouldAiAvoidPirateFaction(state, civId, faction.factionId))
    .filter(faction => faction.headquarters?.current && faction.headquarters.kind === 'coastal-enclave')
    .filter(faction => !faction.observedUnitIds.some(unitId => {
      const ship = state.units[unitId];
      return Boolean(ship && pirateDistance(state, ship.position, faction.headquarters!.position) === 1);
    }))
    .map(faction => faction.headquarters!.position)
    .sort((left, right) => pirateDistance(state, warship.position, left) - pirateDistance(state, warship.position, right))[0];
  if (headquarters) return headquarters;

  const blockadeShip = factionPresentations
    .filter(faction => !shouldAiAvoidPirateFaction(state, civId, faction.factionId))
    .filter(faction => faction.behavior === 'blockading')
    .flatMap(faction => faction.observedUnitIds)
    .map(unitId => state.units[unitId])
    .filter((unit): unit is Unit => Boolean(unit))
    .sort((left, right) => pirateDistance(state, warship.position, left.position) - pirateDistance(state, warship.position, right.position))[0];
  if (blockadeShip) return blockadeShip.position;

  const loadedTransport = state.civilizations[civId]?.units
    .map(unitId => state.units[unitId])
    .filter((unit): unit is Unit => Boolean(unit?.cargoUnitIds?.length))
    .sort((left, right) => pirateDistance(state, warship.position, left.position) - pirateDistance(state, warship.position, right.position))[0];
  return loadedTransport?.position ?? null;
}

export function applyPirateAiResponse(state: GameState, civId: string, bus: EventBus): GameState {
  const civ = state.civilizations[civId];
  const presentation = getPirateWatersPresentation(state, civId);
  if (!civ || !presentation.available) return state;
  let nextState = state;
  const blockadingFactionIds = activeBlockadeFactionIds(nextState, civId);

  for (const faction of presentation.factions) {
    if (blockadingFactionIds.has(faction.factionId) && faction.tributeQuote.available) {
      const tribute = payPirateTribute(nextState, faction.factionId, civId);
      if (tribute.success) nextState = tribute.state;
    }
  }

  const afterTribute = getPirateWatersPresentation(nextState, civId);
  for (const faction of afterTribute.factions) {
    const target = faction.contractTargets.find(candidate => civ.diplomacy.atWarWith.includes(candidate.civId));
    if (!target || nextState.civilizations[civId].gold < target.cost * 2) continue;
    const hired = hirePirateFlotilla(nextState, faction.factionId, civId, target.civId);
    if (hired.success) {
      nextState = hired.state;
      break;
    }
  }

  const currentPresentation = getPirateWatersPresentation(nextState, civId);
  const knownPirateUnitIds = knownPirateResponseUnitIds(nextState, civId, currentPresentation.factions);
  const warshipIds = nextState.civilizations[civId].units.filter(unitId => {
    const unit = nextState.units[unitId];
    return Boolean(unit && isCombatWarship(unit) && !unit.hasActed && unit.movementPointsLeft > 0);
  });

  for (const unitId of warshipIds) {
    let warship = nextState.units[unitId];
    if (!warship) continue;
    const adjacentPirate = [...knownPirateUnitIds]
      .map(pirateUnitId => nextState.units[pirateUnitId])
      .filter((unit): unit is Unit => Boolean(unit) && pirateDistance(nextState, warship.position, unit.position) === 1)
      .filter(unit => isFavorablePirateFight(warship, unit))
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    if (adjacentPirate) {
      const seed = Math.max(1, nextState.turn * 16807 + warship.id.length * 97 + adjacentPirate.id.length);
      const combat = resolveCombat(warship, adjacentPirate, nextState.map, seed, undefined, nextState.era);
      const combatPresentation = buildCombatPresentation(nextState, combat, warship, adjacentPirate);
      const applied = applyCombatOutcomeToState(nextState, combat, seed);
      nextState = applied.state;
      emitMinorCivQuestTransitions(bus, applied.questTransitions, nextState);
      bus.emit('combat:resolved', { result: combat, ...combatPresentation });
      for (const reward of applied.rewards) bus.emit('combat:reward-earned', { reward });
      continue;
    }

    const assaultFaction = currentPresentation.factions.find(faction =>
      !shouldAiAvoidPirateFaction(nextState, civId, faction.factionId)
      &&
      faction.headquarters?.current
      && faction.headquarters.kind === 'coastal-enclave'
      && getEnclaveAssaultPreview(nextState, faction.factionId, unitId).available,
    );
    if (assaultFaction) {
      const assault = assaultPirateEnclave(nextState, assaultFaction.factionId, unitId);
      if (assault.success) nextState = assault.state;
      continue;
    }

    warship = nextState.units[unitId];
    if (!warship) continue;
    const goal = choosePirateGoal(nextState, civId, currentPresentation.factions, warship);
    if (goal) nextState = moveWarshipToward(nextState, civId, warship, goal);
  }
  return nextState;
}

function chooseLegendaryWonderFallback(
  state: GameState,
  civId: string,
  cityId: string,
  personality: PersonalityTraits,
): string {
  const civilization = state.civilizations[civId];
  const city = state.cities[cityId];
  if (!civilization || !city) {
    return 'warrior';
  }

  // walls now grant ×1.25 city defense (combat-system getCityDefenseBreakdown)
  if (!city.buildings.includes('walls')) {
    return 'walls';
  }

  const civDef = resolveCivDefinition(state, civilization.civType ?? '');
  const yields = calculateProjectedCityYields(state, cityId, civDef?.bonusEffect);
  const civResources = getCivAvailableResources(state, civId);
  const builtNPKeys = getReservedNationalProjectKeys(state, civId);
  const availableBuildings = getAvailableBuildings(
    city,
    civilization.techState.completed,
    state.map,
    civResources,
    state.era,
    builtNPKeys,
    civId,
  ).map(building => building.id);
  const atWar = civilization.diplomacy.atWarWith.length > 0;

  if (yields.food <= city.population) {
    const foodChoice = ['granary', 'herbalist', 'aqueduct'].find(buildingId =>
      !city.buildings.includes(buildingId) && (availableBuildings.includes(buildingId) || buildingId === 'granary' || buildingId === 'herbalist'),
    );
    if (foodChoice) {
      return foodChoice;
    }
  }

  if (yields.production < 3) {
    const productionChoice = ['workshop', 'lumbermill', 'quarry-building', 'forge'].find(buildingId =>
      !city.buildings.includes(buildingId) && availableBuildings.includes(buildingId),
    );
    if (productionChoice) {
      return productionChoice;
    }
  }

  if (atWar) {
    const militaryChoice = ['barracks', 'stable', 'armory', 'war-academy'].find(buildingId =>
      !city.buildings.includes(buildingId) && (availableBuildings.includes(buildingId) || buildingId === 'barracks'),
    );
    if (militaryChoice) {
      return militaryChoice;
    }
  }

  if (availableBuildings.length > 0) {
    return chooseProduction(personality, availableBuildings, atWar, civilization.cities.length);
  }

  return Object.keys(BUILDINGS).find(buildingId => !city.buildings.includes(buildingId)) ?? 'warrior';
}

function scoreLegendaryWonderOpportunity(state: GameState, civId: string, cityId: string, wonderId: string): number {
  const definition = getLegendaryWonderDefinition(wonderId);
  const city = state.cities[cityId];
  const civ = state.civilizations[civId];
  if (!definition || !city || !civ) {
    return Number.NEGATIVE_INFINITY;
  }

  const costPenalty = Math.floor(definition.productionCost / 40);
  const cityBonus = definition.cityRequirement === 'river'
    ? 25
    : definition.cityRequirement === 'coastal'
      ? 20
      : 10;
  const rewardBonus = (definition.reward.civYieldBonus?.science ?? 0) * 8
    + (definition.reward.civYieldBonus?.production ?? 0) * 8
    + (definition.reward.civYieldBonus?.gold ?? 0) * 6
    + (definition.reward.cityYieldBonus?.production ?? 0) * 6
    + (definition.reward.cityYieldBonus?.food ?? 0) * 5;
  const techMomentum = civ.techState.completed.length;

  return 100 + cityBonus + rewardBonus + techMomentum - costPenalty;
}

interface ProcessAITurnInternalOptions {
  prepared?: PreparedMajorCivPlan;
}

export function canDeclareWarForPreparedPlan(
  state: GameState,
  prepared: PreparedMajorCivPlan,
  targetCivId: string,
): boolean {
  const plan = state.opponentAI?.majorCivs[prepared.civId]?.primaryPlan
    ?? prepared.portfolio.primaryPlan;
  if (
    !plan
    || !['capture', 'repel', 'raid'].includes(plan.objective)
    || !['advancing', 'attacking'].includes(plan.phase)
    || (state.opponentAI?.migrationGraceRoundsRemaining ?? 0) > 0
    || !prepared.perception.knownCivIds.includes(targetCivId)
  ) {
    return false;
  }
  const target = plan.target;
  if (target.kind === 'city') {
    return state.cities[target.id]?.owner === targetCivId
      && prepared.perception.knownCities.some(city =>
      city.id === target.id && city.owner === targetCivId);
  }
  if (target.kind === 'unit') {
    return state.units[target.id]?.owner === targetCivId
      && prepared.perception.units.some(unit =>
      unit.id === target.id && unit.owner === targetCivId);
  }
  return false;
}

function processAITurnInternal(
  state: GameState,
  civId: string,
  bus: EventBus,
  options: ProcessAITurnInternalOptions = {},
): GameState {
  let preparedForTurn = options.prepared;
  let newState = initializeLegendaryWonderProjectsForAllCities(structuredClone(state));
  let civ = newState.civilizations[civId];
  if (!civ) return newState;

  const personality = getPersonality(newState, civ.civType ?? 'generic');
  const civDef = resolveCivDefinition(newState, civ.civType ?? '');
  const abandonment = abandonLostLegendaryWonderRace(newState, civId);
  newState = abandonment.state;
  civ = newState.civilizations[civId];
  for (const event of abandonment.lostEvents) {
    bus.emit('wonder:legendary-lost', event);
  }

  preparedForTurn ??= prepareMajorCivStrategicPlan(
    structuredClone(newState),
    civId,
  );

  // Strategic movement is plan-driven, while settlement remains a shared
  // administrative action using the canonical mutation helper.
  const settlers = civ.units
    .map(id => newState.units[id])
    .filter((unit): unit is Unit => unit?.type === 'settler');
  for (const settler of settlers) {
    if (
      !settler.hasActed
      && settler.movementPointsLeft > 0
      && canFoundCityAt(newState, settler.position)
    ) {
      newState = foundCityInState(newState, settler.id, bus).state;
      civ = newState.civilizations[civId];
    }
  }

  // Cargo handling is administrative rather than a competing strategic
  // chase path, so retain the canonical all-cargo load/unload behavior.
  const transportHostileOwners = new Set<string>([
    'barbarian',
    ...(newState.settings?.aiContestsBeasts === true ? [BEAST_OWNER] : []),
    ...(civ.diplomacy?.atWarWith ?? []),
  ]);
  addAlwaysHostileOwners(
    newState,
    civId,
    transportHostileOwners,
    newState.settings?.aiContestsBeasts === true,
  );
  for (const [minorCivId, minor] of Object.entries(newState.minorCivs)) {
    if (minor.diplomacy?.atWarWith?.includes(civId)) {
      transportHostileOwners.add(minorCivId);
    }
  }
  const idleTransports = civ.units
    .map(id => newState.units[id])
    .filter((unit): unit is Unit =>
      Boolean(unit)
      && UNIT_DEFINITIONS[unit.type]?.domain === 'naval'
      && UNIT_DEFINITIONS[unit.type]?.cargoCapacity !== undefined);
  for (const transport of idleTransports) {
    let unloaded = false;
    for (const cargo of getTransportCargo(newState, transport.id)) {
      const current = newState.units[cargo.id];
      if (!current || current.hasActed || current.movementPointsLeft <= 0) continue;
      const destination = getUnloadDestinations(newState, transport.id, current.id)
        .find(coord => {
          const owner = newState.map.tiles[hexKey(coord)]?.owner;
          return owner !== null && owner !== undefined && transportHostileOwners.has(owner);
        });
      if (!destination) continue;
      const result = unloadUnitFromTransport(newState, transport.id, current.id, destination);
      if (result.ok) {
        newState = result.state;
        civ = newState.civilizations[civId];
        unloaded = true;
      }
    }
    if (unloaded) continue;
    for (const candidate of civ.units
      .map(id => newState.units[id])
      .filter((unit): unit is Unit =>
        Boolean(unit)
        && !unit.transportId
        && !unit.hasActed
        && unit.movementPointsLeft > 0
        && (UNIT_DEFINITIONS[unit.type]?.domain ?? 'land') === 'land')) {
      if (getTransportCargoUsed(newState, transport.id)
        >= getTransportCapacity(newState.units[transport.id]!)) break;
      const check = canLoadUnitOntoTransport(newState, candidate.id, transport.id);
      if (!check.ok) continue;
      const result = loadUnitOntoTransport(newState, candidate.id, transport.id);
      if (result.ok) {
        newState = result.state;
        civ = newState.civilizations[civId];
      }
    }
  }

  newState = processMajorCivStrategicTurn(
    newState,
    preparedForTurn,
    bus,
  ).state;
  newState = processAIResourceMarketplace(newState, civId);
  civ = newState.civilizations[civId];
  const administrativePerception = preparedForTurn.perception;

  newState = applyPirateAiResponse(newState, civId, bus);
  civ = newState.civilizations[civId];
  const piratePresentation = getPirateWatersPresentation(newState, civId);
  const knownPirateUnitIds = knownPirateResponseUnitIds(newState, civId, piratePresentation.factions);

  // Pursue assigned economic chain steps before discretionary spending.
  for (const minorCivId of Object.keys(newState.minorCivs).sort()) {
    const quest = newState.minorCivs[minorCivId].activeQuests[civId];
    if (quest?.target.type === 'gift_gold') {
      const action = performMinorCivGift(newState, civId, minorCivId);
      if (action.ok) {
        newState = action.state;
        emitMinorCivQuestTransitions(bus, action.transitions, newState);
      }
    } else if (quest?.target.type === 'sponsor_festival') {
      const action = performMinorCivFestival(newState, civId, minorCivId);
      if (action.ok) {
        newState = action.state;
        emitMinorCivQuestTransitions(bus, action.transitions, newState);
      }
    }
  }
  civ = newState.civilizations[civId];

  // --- Handle caravan route establishment ---
  const idleCaravans = (civ.units ?? [])
    .map(id => newState.units[id])
    .filter((u): u is Unit => !!u && u.type === 'caravan' && !u.committedToRouteId);

  for (const caravan of idleCaravans) {
    // Try domestic cities first (own city), then foreign
    const ownCities = civ.cities.map(id => newState.cities[id]).filter((c): c is City => !!c);
    const knownForeignCityIds = new Set(
      administrativePerception.knownCities
        .filter(city => city.owner !== civId && city.position !== null)
        .map(city => city.id),
    );
    const foreignCities = Object.values(newState.cities).filter(city =>
      city.owner !== civId
      && (!knownForeignCityIds || knownForeignCityIds.has(city.id)));
    const assignedDestinationIds = new Set(Object.values(newState.minorCivs)
      .map(minorCiv => minorCiv.activeQuests[civId])
      .flatMap(quest => quest?.target.type === 'trade_route'
        ? [newState.minorCivs[quest.target.minorCivId]?.cityId]
        : [])
      .filter((cityId): cityId is string => Boolean(cityId)));
    const candidates = [...ownCities, ...foreignCities].sort((left, right) =>
      Number(assignedDestinationIds.has(right.id)) - Number(assignedDestinationIds.has(left.id)));
    for (const candidate of candidates) {
      const check = canEstablishRoute(newState, caravan, candidate.id);
      if (check.ok) {
        const resourceDiversity = getCivAvailableResources(newState, civId).size;
        const routeResult = establishQuestAwareRoute(newState, caravan.id, candidate.id, resourceDiversity);
        newState = routeResult.state;
        emitMinorCivQuestTransitions(bus, routeResult.questTransitions, newState);
        bus.emit('trade:route-created', { route: routeResult.route });
        civ = newState.civilizations[civId];
        break;
      }
    }
  }

  for (const expedition of civ.units
    .map(id => newState.units[id])
    .filter((unit): unit is Unit =>
      unit?.type === 'expedition' && !unit.hasActed && !unit.hasMoved)) {
    if (canEstablishOutpost(newState, expedition.id)) {
      newState = performEstablishOutpost(newState, expedition.id);
      civ = newState.civilizations[civId];
    }
  }

  // --- Handle expedition outpost establishment ---
  // --- Handle research (personality-driven) ---
  civ.techState.researchQueue ??= [];
  const research = applyAIResearch(
    newState,
    civId,
    preparedForTurn,
    personality,
  );
  newState = research.state;
  civ = newState.civilizations[civId];
  if (research.startedTechId) {
    bus.emit('tech:started', { civId, techId: research.startedTechId });
  }

  // --- Handle city production (personality-driven) ---
  for (const cityId of civ.cities) {
    const city = newState.cities[cityId];
    if (!city || city.unrestLevel === 0) continue;
    const appeaseResult = appeaseFaction(newState, cityId, civId);
    if (appeaseResult.success) {
      newState = appeaseResult.state;
    }
  }

  for (const cityId of civ.cities) {
    const city = newState.cities[cityId];
    if (!city || city.productionQueue.length > 0) continue;
    const activeWonderBuilds = Object.values(newState.cities).filter(candidate =>
      candidate.owner === civId && candidate.productionQueue[0]?.startsWith('legendary:'),
    ).length;
    if (activeWonderBuilds >= 2) continue;

    const wonderCandidates = getEligibleLegendaryWonders(newState, civId, cityId)
      .filter(wonderId =>
        Object.values(newState.legendaryWonderProjects ?? {}).some(project =>
          project.ownerId === civId
          && project.cityId === cityId
          && project.wonderId === wonderId
          && project.phase === 'ready_to_build',
        ),
      )
      .sort((left, right) =>
        scoreLegendaryWonderOpportunity(newState, civId, cityId, right)
        - scoreLegendaryWonderOpportunity(newState, civId, cityId, left),
      );

    if (wonderCandidates.length > 0) {
      newState = startLegendaryWonderBuild(newState, civId, cityId, wonderCandidates[0], bus);
    }
  }
  newState = applyAIProduction(
    newState,
    civId,
    preparedForTurn.forceDemands,
    personality,
  );
  civ = newState.civilizations[civId];

  // --- Handle diplomacy ---
  if (civ.diplomacy) {
    updateAndRefreshVisibility(newState, civId);
    for (const contact of syncCivilizationContactsFromVisibility(newState, civId)) {
      bus.emit('civilization:first-contact', contact);
    }
    civ = newState.civilizations[civId];
    const perception = administrativePerception;
    const {
      self: selfStrength,
      others: otherStrengths,
    } = buildDiplomaticStrengthEstimates(
      perception,
      resolveCivilizationEra(civ.techState.completed),
    );
    const diplomacyContext: Record<string, { hasMet: boolean; hasBorderPressure: boolean }> = {};
    for (const otherId of perception.knownCivIds) {
      const otherCities = perception.knownCities
        .filter(city => city.owner === otherId && city.position !== null);
      const ownCities = civ.cities
        .map(id => newState.cities[id])
        .filter((city): city is City => city !== undefined);
      const ownUnits = civ.units
        .map(id => newState.units[id])
        .filter((unit): unit is Unit => unit !== undefined);
      const otherUnits = perception.units
        .filter(unit => unit.owner === otherId && unit.position !== null);

      const hasBorderPressure = ownUnits.some(unit =>
        otherCities.some(city => {
          const distance = newState.map.wrapsHorizontally
            ? wrappedHexDistance(unit.position, city.position!, newState.map.width)
            : hexDistance(unit.position, city.position!);
          return distance <= 3;
        }),
      ) || otherUnits.some(unit =>
        ownCities.some(city => {
          const distance = newState.map.wrapsHorizontally
            ? wrappedHexDistance(unit.position!, city.position, newState.map.width)
            : hexDistance(unit.position!, city.position);
          return distance <= 3;
        }),
      );

      diplomacyContext[otherId] = {
        hasMet: hasMetCivilization(newState, civId, otherId),
        hasBorderPressure,
      };
    }

    let decisions = evaluateDiplomacy(
      personality,
      civ.diplomacy,
      civ.techState.completed,
      newState.era,
      otherStrengths,
      selfStrength,
      newState.turn,
      diplomacyContext,
    );
    {
      const plannedWarTarget = preparedForTurn.perception.knownCivIds
        .find(targetCivId =>
          canDeclareWarForPreparedPlan(
            newState,
            preparedForTurn,
            targetCivId,
          ));
      const openingRuleAllowsWar = plannedWarTarget
        ? newState.turn > 5
          || decisions.some(decision =>
            decision.action === 'declare_war'
            && decision.targetCiv === plannedWarTarget)
        : false;
      decisions = decisions.filter(decision =>
        decision.action !== 'declare_war');
      if (
        plannedWarTarget
        && openingRuleAllowsWar
        && getAvailableActions(
          civ.diplomacy,
          plannedWarTarget,
          civ.techState.completed,
          newState.era,
        ).includes('declare_war')
      ) {
        decisions.push({
          action: 'declare_war',
          targetCiv: plannedWarTarget,
        });
      }
    }

    for (const decision of decisions) {
      const currentDiplomacy = newState.civilizations[civId]?.diplomacy;
      if (!currentDiplomacy) {
        continue;
      }
      // Issue #435 guard: never write treaties or war records against an unmet
      // civ — those records count as contact evidence and mass-discover civs.
      if (!hasMetCivilization(newState, civId, decision.targetCiv)) {
        continue;
      }
      switch (decision.action) {
        case 'declare_war':
          if (!canDeclareWarForPreparedPlan(
            newState,
            preparedForTurn,
            decision.targetCiv,
          )) {
            break;
          }
          newState.civilizations[civId].diplomacy = declareWar(
            currentDiplomacy, decision.targetCiv, newState.turn,
          );
          if (newState.civilizations[decision.targetCiv]?.diplomacy) {
            newState.civilizations[decision.targetCiv].diplomacy = declareWar(
              newState.civilizations[decision.targetCiv].diplomacy, civId, newState.turn,
            );
          }
          bus.emit('diplomacy:war-declared', { attackerId: civId, defenderId: decision.targetCiv, opponentKind: resolveOpponentKind(decision.targetCiv) });
          break;
        case 'request_peace':
          newState = enqueuePeaceRequest(newState, civId, decision.targetCiv, bus);
          break;
        case 'non_aggression_pact':
        case 'trade_agreement':
        case 'open_borders':
        case 'alliance':
          newState.civilizations[civId].diplomacy = proposeTreaty(
            currentDiplomacy, civId, decision.targetCiv, decision.action,
            decision.action === 'non_aggression_pact' ? 10 : -1, newState.turn,
          );
          if (newState.civilizations[decision.targetCiv]?.diplomacy) {
            newState.civilizations[decision.targetCiv].diplomacy = proposeTreaty(
              newState.civilizations[decision.targetCiv].diplomacy, decision.targetCiv, civId, decision.action,
              decision.action === 'non_aggression_pact' ? 10 : -1, newState.turn,
            );
          }
          bus.emit('diplomacy:treaty-accepted', { civA: civId, civB: decision.targetCiv, treaty: decision.action });
          break;
      }
    }

    // AI vassalage: offer vassalage if very weak
    const currentCities = civ.cities.length;
    const currentMilitary = civ.units
      .map(unitId => newState.units[unitId])
      .filter((unit): unit is Unit => Boolean(unit) && !unit.transportId && hasAICombatRole(unit.type))
      .length;
    const vassalageDecision = evaluateVassalage(
      personality, civ.diplomacy, newState.era, selfStrength,
      currentCities, currentMilitary, otherStrengths,
    );
    if (vassalageDecision && vassalageDecision.action === 'offer_vassalage') {
      const overlordId = vassalageDecision.targetCiv;
      if (newState.civilizations[overlordId]?.diplomacy) {
        offerVassalage(civId, overlordId); // notification only — state mutation happens on accept
        bus.emit('diplomacy:vassalage-offered', { fromCivId: civId, toCivId: overlordId });
      }
    }

    // AI embargo: join embargoes proposed by allied civs
    if (newState.embargoes) {
      for (const embargo of newState.embargoes) {
        if (embargo.participants.includes(civId)) continue;
        const proposerId = embargo.participants[0];
        if (!proposerId) continue;
        const shouldJoin = evaluateEmbargoResponse(
          personality, civ.diplomacy.relationships, proposerId, embargo.targetCivId,
        );
        if (shouldJoin) {
          newState.embargoes = joinEmbargo(newState.embargoes, embargo.id, civId);
        }
      }
    }

    // AI league: accept league invitations
    if (newState.defensiveLeagues) {
      for (const league of newState.defensiveLeagues) {
        if (league.members.includes(civId)) continue;
        const shouldJoin = evaluateLeagueResponse(
          personality, civ.diplomacy.relationships, league.members,
        );
        if (shouldJoin) {
          newState.defensiveLeagues = inviteToLeague(newState.defensiveLeagues, league.id, civId);
          bus.emit('diplomacy:league-joined', { leagueId: league.id, civId });
        }
      }
    }
  }

  // --- Minor civ diplomacy ---
  if (newState.minorCivs) {
    const mcDecisions = evaluateMinorCivDiplomacy(
      personality, newState.minorCivs, civId, civ.gold,
    );
    for (const d of mcDecisions) {
      if (d.action === 'gift_gold') {
        const mc = newState.minorCivs[d.mcId];
        if (mc && civ.gold >= 25) {
          newState.civilizations[civId].gold -= 25;
          mc.diplomacy = modifyRelationship(mc.diplomacy, civId, 10);
        }
      }
    }
  }

  if (shouldAiStationDefensiveSpy(newState, civId)) {
    const capital = getCapitalCity(newState, civId);
    const espState = newState.espionage?.[civId];
    const idleSpy = espState ? Object.values(espState.spies).find(spy => spy.status === 'idle') : undefined;
    if (capital && idleSpy) {
      newState.espionage![civId] = embedSpy(
        newState.espionage![civId],
        idleSpy.id,
        capital.id,
        capital.position,
      );
      // Remove unit from map — embedded spy goes off-map
      delete newState.units[idleSpy.id];
      newState.civilizations[civId] = {
        ...newState.civilizations[civId],
        units: newState.civilizations[civId].units.filter(id => id !== idleSpy.id),
      };
    }
  }

  // AI spy movement, infiltration, and mission issuance for infiltrated spies
  if (newState.espionage?.[civId]) {
    const aiSpyRng = createRng(`ai-spy-${civId}-${newState.turn}`);

    // 1) Move idle spy units toward nearest enemy city
    const idleSpyUnits = (newState.civilizations[civId].units ?? [])
      .map(id => newState.units[id])
      .filter((u): u is Unit =>
        Boolean(u)
        && isSpyUnitType(u.type)
        && !u.hasActed
        && u.movementPointsLeft > 0);

    for (const spyUnit of idleSpyUnits) {
      const candidates = administrativePerception.knownCities
        .filter(city =>
          city.owner !== civId
          && city.position !== null
          && city.confidence !== 'rumored')
        .sort((a, b) => {
          const da = hexDistance(spyUnit.position, a.position!);
          const db = hexDistance(spyUnit.position, b.position!);
          if (da !== db) return da - db;
          return a.id.localeCompare(b.id);
        });
      if (candidates.length === 0) continue;
      const target = candidates[0];
      const targetPosition = target.position!;
      if (spyUnit.position.q === targetPosition.q && spyUnit.position.r === targetPosition.r) continue;
      const path = findPath(spyUnit.position, targetPosition, newState.map);
      if (!path || path.length < 2) continue;
      const next = path[1];
      const nextKey = `${next.q},${next.r}`;
      const occupied = Object.values(newState.units).some(
        u => u.id !== spyUnit.id && `${u.position.q},${u.position.r}` === nextKey,
      );
      if (occupied) continue;
      executeUnitMove(
        newState,
        spyUnit.id,
        next,
        {
          actor: 'ai',
          civId,
          bus,
          foreignCityEntryId: hexKey(next) === hexKey(targetPosition)
            ? target.id
            : undefined,
        },
      );
    }

    // 2) Attempt infiltration when a spy is on an enemy city tile
    const spyIdsThisTurn = (newState.civilizations[civId].units ?? []).filter(
      id => newState.units[id] && isSpyUnitType(newState.units[id].type),
    );
    for (const spyUnitId of spyIdsThisTurn) {
      const spyUnit = newState.units[spyUnitId];
      if (!spyUnit) continue;
      const cityHere = Object.values(newState.cities).find(
        c => c.owner !== civId &&
             c.position.q === spyUnit.position.q && c.position.r === spyUnit.position.r,
      );
      if (!cityHere) continue;
      const civEspNow = newState.espionage?.[civId];
      if (!civEspNow) continue;
      const spyRec = civEspNow.spies[spyUnitId];
      if (!spyRec || spyRec.status !== 'idle') continue;
      const alreadyInside = Object.values(civEspNow.spies).some(
        s => s.infiltrationCityId === cityHere.id &&
             (s.status === 'stationed' || s.status === 'on_mission' || s.status === 'cooldown'),
      );
      if (alreadyInside) continue;
      const cityCI = newState.espionage?.[cityHere.owner]?.counterIntelligence[cityHere.id] ?? 0;
      const infSeed = `ai-infiltrate-${spyUnitId}-${newState.turn}`;
      const result = attemptInfiltration(civEspNow, spyUnitId, spyUnit.type as UnitType, cityHere.id, cityHere.position, cityCI, infSeed);
      const spyAfterAttempt = result.civEsp.spies[spyUnitId];
      newState.espionage![civId] = {
        ...result.civEsp,
        spies: { ...result.civEsp.spies, [spyUnitId]: { ...spyAfterAttempt, targetCivId: cityHere.owner } },
      };
      if (result.removeUnitFromMap) {
        delete newState.units[spyUnitId];
        newState.civilizations[civId].units =
          (newState.civilizations[civId].units ?? []).filter(id => id !== spyUnitId);
        bus.emit('espionage:spy-infiltrated', { civId, spyId: spyUnitId, cityId: cityHere.id });
      } else if (result.caught) {
        delete newState.units[spyUnitId];
        newState.civilizations[civId].units =
          (newState.civilizations[civId].units ?? []).filter(id => id !== spyUnitId);
        bus.emit('espionage:spy-caught-infiltrating', {
          capturingCivId: cityHere.owner, spyOwner: civId, spyId: spyUnitId, cityId: cityHere.id,
        });
      } else {
        newState.units[spyUnitId] = { ...spyUnit, hasActed: true, movementPointsLeft: 0 };
      }
    }

    // 3) Stationed-inside (infiltrationCityId) spies issue missions
    const civEspForMission = newState.espionage?.[civId];
    if (civEspForMission) {
      const completedTechs = newState.civilizations[civId].techState.completed ?? [];
      const infiltrationMissions = getAvailableMissions(completedTechs).filter(m => m !== 'scout_area');
      if (infiltrationMissions.length > 0) {
        for (const spy of Object.values(civEspForMission.spies)) {
          if (spy.status !== 'stationed' || !spy.infiltrationCityId || spy.currentMission) continue;
          const city = newState.cities[spy.infiltrationCityId];
          if (!city) continue;
          const missionIdx = Math.floor(aiSpyRng() * infiltrationMissions.length);
          const missionType = infiltrationMissions[missionIdx];
          try {
            newState.espionage![civId] = startMission(
              newState.espionage![civId], spy.id, missionType, undefined, city.owner, city.id,
            );
            bus.emit('espionage:mission-started', { civId, spyId: spy.id, missionType });
          } catch { /* spy not eligible — skip */ }
        }
      }
    }
  }

  // Start missions for stationed spies without active missions
  const espState = newState.espionage?.[civId];
  if (espState) {
    for (const spy of Object.values(espState.spies)) {
      if (spy.currentMission) {
        continue;
      }
      const mission = chooseAiMission(newState, civId);
      if (!mission) {
        continue;
      }
      if (missionRequiresPlacedSpy(mission)) {
        if (spy.status === 'stationed' && spy.targetCivId) {
          newState.espionage![civId] = startMission(
            newState.espionage![civId],
            spy.id,
            mission,
            resolveCivDefinition(newState, civ.civType ?? '')?.bonusEffect,
          );
        }
        continue;
      }
      if (!['idle', 'stationed'].includes(spy.status)) {
        continue;
      }
      const target = spy.targetCivId && spy.targetCityId
        ? { civId: spy.targetCivId, cityId: spy.targetCityId }
        : chooseAiSpyTarget(
            newState,
            civId,
            administrativePerception,
          );
      if (target) {
        newState.espionage![civId] = startMission(
          newState.espionage![civId],
          spy.id,
          mission,
          resolveCivDefinition(newState, civ.civType ?? '')?.bonusEffect,
          target.civId,
          target.cityId,
        );
      }
    }
  }

  // AI capture verdicts: find enemy spies we (civId) captured
  // They live in other civs' spy lists with targetCivId === civId and status === 'captured'
  {
    const captureRng = createRng(`ai-capture-${civId}-${newState.turn}`);
    for (const [victimCivId, victimEsp] of Object.entries(newState.espionage ?? {})) {
      if (victimCivId === civId) continue;
      const capturedByMe = Object.values(victimEsp.spies).filter(
        s => s.status === 'captured' && s.targetCivId === civId,
      );
      for (const capturedSpy of capturedByMe) {
        const rel = civ.diplomacy.relationships[victimCivId] ?? 50;
        const atWar = civ.diplomacy.atWarWith.includes(victimCivId);
        let verdict: 'expel' | 'execute' | 'interrogate';
        if (atWar) {
          verdict = captureRng() < 0.5 ? 'execute' : 'interrogate';
        } else if (rel < 30) {
          verdict = captureRng() < 0.4 ? 'interrogate' : 'expel';
        } else {
          verdict = 'expel';
        }

        const distanceToCity = capturedSpy.infiltrationCityId ? 0 : 1;
        const relPenalty = getSpyCaptureRelationshipPenalty(distanceToCity);

        if (verdict === 'expel') {
          const updatedOwnerEsp = expelSpy(newState.espionage![victimCivId], capturedSpy.id, 15);
          const capital = getCapitalCity(newState, victimCivId);
          if (capital) {
            const newUnit = createUnit(capturedSpy.unitType, victimCivId, capital.position, newState.idCounters);
            newState = {
              ...newState,
              units: { ...newState.units, [newUnit.id]: newUnit },
              civilizations: {
                ...newState.civilizations,
                [victimCivId]: {
                  ...newState.civilizations[victimCivId],
                  units: [...newState.civilizations[victimCivId].units, newUnit.id],
                },
              },
            };
            const { [capturedSpy.id]: _old, ...rest } = updatedOwnerEsp.spies;
            newState = {
              ...newState,
              espionage: {
                ...newState.espionage,
                [victimCivId]: {
                  ...updatedOwnerEsp,
                  spies: { ...rest, [newUnit.id]: { ...updatedOwnerEsp.spies[capturedSpy.id]!, id: newUnit.id } },
                },
              },
            };
          } else {
            newState = { ...newState, espionage: { ...newState.espionage, [victimCivId]: updatedOwnerEsp } };
          }
          // Bilateral diplomacy: captor's view of victim AND victim's view of captor
          newState = {
            ...newState,
            civilizations: {
              ...newState.civilizations,
              [civId]: {
                ...newState.civilizations[civId],
                diplomacy: modifyRelationship(newState.civilizations[civId].diplomacy, victimCivId, relPenalty),
              },
              [victimCivId]: {
                ...newState.civilizations[victimCivId],
                diplomacy: modifyRelationship(newState.civilizations[victimCivId].diplomacy, civId, relPenalty),
              },
            },
          };
          bus.emit('espionage:spy-expelled', {
            civId: victimCivId, spyId: capturedSpy.id, fromCivId: civId,
          });
        } else if (verdict === 'execute') {
          newState = {
            ...newState,
            espionage: {
              ...newState.espionage,
              [victimCivId]: executeSpy(newState.espionage![victimCivId], capturedSpy.id),
            },
            // Bilateral diplomacy
            civilizations: {
              ...newState.civilizations,
              [civId]: {
                ...newState.civilizations[civId],
                diplomacy: modifyRelationship(newState.civilizations[civId].diplomacy, victimCivId, relPenalty * 2),
              },
              [victimCivId]: {
                ...newState.civilizations[victimCivId],
                diplomacy: modifyRelationship(newState.civilizations[victimCivId].diplomacy, civId, relPenalty * 2),
              },
            },
          };
          bus.emit('espionage:spy-executed', {
            executingCivId: civId, spyOwner: victimCivId, spyId: capturedSpy.id, spyName: capturedSpy.name,
          });
        } else {
          // Interrogate: set spy status to 'interrogated' on victim's espionage record
          const victimOwnerEsp = newState.espionage![victimCivId];
          newState = {
            ...newState,
            espionage: {
              ...newState.espionage,
              [civId]: startInterrogation(newState.espionage![civId], capturedSpy.id, victimCivId),
              [victimCivId]: {
                ...victimOwnerEsp,
                spies: {
                  ...victimOwnerEsp.spies,
                  [capturedSpy.id]: { ...capturedSpy, status: 'interrogated' as const },
                },
              },
            },
          };
        }
      }
    }
  }

  // Update AI visibility
  updateAndRefreshVisibility(newState, civId);
  for (const contact of syncCivilizationContactsFromVisibility(newState, civId)) {
    bus.emit('civilization:first-contact', contact);
  }

  return newState;
}

export function processAITurn(
  state: GameState,
  civId: string,
  bus: EventBus,
): GameState {
  return processAITurnInternal(state, civId, bus);
}

export function processPreparedAITurn(
  state: GameState,
  prepared: PreparedMajorCivPlan,
  bus: EventBus,
): { state: GameState } {
  return {
    state: processAITurnInternal(state, prepared.civId, bus, {
      prepared,
    }),
  };
}

// --- AI Espionage Decision Functions ---

export function shouldAiRecruitSpy(state: GameState, aiCivId: string): boolean {
  const civ = state.civilizations[aiCivId];
  if (!civ) return false;
  const hasEspTech = civ.techState.completed.some(t => t.startsWith('espionage-'));
  if (!hasEspTech) return false;
  const espState = state.espionage?.[aiCivId];
  if (!espState) return false;
  const activeSpies = Object.values(espState.spies).filter(s => s.status !== 'captured').length;
  return activeSpies < espState.maxSpies;
}

export function chooseAiSpyTarget(
  state: GameState,
  aiCivId: string,
  perception?: MajorCivPerception,
): { civId: string; cityId: string; position: HexCoord } | null {
  const aiDip = state.civilizations[aiCivId]?.diplomacy;
  if (!aiDip) return null;

  const targets: Array<{ civId: string; score: number }> = [];
  for (const [civId, relationship] of Object.entries(aiDip.relationships)) {
    if (civId === aiCivId) continue;
    const hasKnownCity = perception
      ? perception.knownCities.some(city =>
          city.owner === civId
          && city.position !== null
          && city.confidence !== 'rumored')
      : state.civilizations[civId]?.cities.some(cityId =>
          Boolean(state.cities[cityId]));
    if (!hasKnownCity) continue;
    let score = Math.abs(Math.min(0, relationship));
    if (aiDip.atWarWith.includes(civId)) score += 100;
    targets.push({ civId, score });
  }

  targets.sort((a, b) => b.score - a.score);
  if (targets.length === 0) return null;

  const bestCivId = targets[0].civId;
  const city = perception
    ? perception.knownCities
        .filter(candidate =>
          candidate.owner === bestCivId
          && candidate.position !== null
          && candidate.confidence !== 'rumored')
        .sort((left, right) =>
          (right.observedTurn ?? -1) - (left.observedTurn ?? -1)
          || left.id.localeCompare(right.id))[0]
    : getCapitalCity(state, bestCivId);
  if (!city) return null;

  return {
    civId: bestCivId,
    cityId: city.id,
    position: city.position!,
  };
}

export function chooseAiMission(
  state: GameState,
  aiCivId: string,
): SpyMissionType | null {
  const civ = state.civilizations[aiCivId];
  if (!civ) return null;
  const available = getAvailableMissions(civ.techState.completed);
  if (available.length === 0) return null;

  const personality = getPersonality(state, civ.civType ?? 'generic');
  const traits = new Set(personality.traits);

  let preferredOrder: SpyMissionType[];
  const hasStage5 = available.includes('cyber_attack') || available.includes('misinformation_campaign');
  if (hasStage5 && (civ.civType === 'annuvin' || traits.has('aggressive'))) {
    preferredOrder = [
      'cyber_attack', 'misinformation_campaign', 'satellite_surveillance',
      'election_interference', 'steal_tech', 'sabotage_production',
      'arms_smuggling', 'incite_unrest', 'gather_intel', 'monitor_troops',
      'monitor_diplomacy', 'identify_resources', 'scout_area',
    ];
  } else if (traits.has('aggressive')) {
    preferredOrder = [
      'steal_tech', 'sabotage_production', 'arms_smuggling',
      'incite_unrest', 'gather_intel', 'monitor_troops',
      'monitor_diplomacy', 'identify_resources', 'scout_area',
    ];
  } else if (traits.has('diplomatic') || traits.has('trader')) {
    preferredOrder = [
      'forge_documents', 'incite_unrest', 'fund_rebels',
      'gather_intel', 'monitor_diplomacy', 'identify_resources',
      'monitor_troops', 'scout_area', 'steal_tech',
    ];
  } else {
    preferredOrder = [
      'gather_intel', 'monitor_diplomacy', 'identify_resources',
      'monitor_troops', 'scout_area', 'steal_tech',
      'sabotage_production', 'incite_unrest',
    ];
  }

  for (const mission of preferredOrder) {
    if (available.includes(mission)) return mission;
  }
  return available[0];
}

/**
 * Finds the nearest unowned resource tile that the civ has tech to exploit.
 * Used by the AI to direct Expedition movement.
 */
function findNearestResourceTile(
  state: GameState,
  unit: Unit,
  civId: string,
): HexCoord | null {
  const civ = state.civilizations[civId];
  if (!civ) return null;
  const completedTechs = new Set(civ.techState.completed);
  const resourceDefMap = new Map<string, typeof RESOURCE_DEFINITIONS[number]>(RESOURCE_DEFINITIONS.map(d => [d.id as string, d]));

  let best: { coord: HexCoord; dist: number } | null = null;
  for (const tile of Object.values(state.map.tiles)) {
    if (!tile.resource || tile.owner !== null || tile.improvement !== 'none') continue;
    const def = resourceDefMap.get(tile.resource);
    if (!def || !completedTechs.has(def.tech)) continue;

    const dist = state.map.wrapsHorizontally
      ? wrappedHexDistance(tile.coord, unit.position, state.map.width)
      : hexDistance(tile.coord, unit.position);

    if (!best || dist < best.dist) best = { coord: tile.coord, dist };
  }
  return best?.coord ?? null;
}
