// #992: the authoritative world-race engine. Deliberately NOT a parallel
// project-tracking subsystem — "component" and "launch" stages are ordinary
// national projects (city-system.ts's `space_program_initiative` and
// `first_satellite_launch`); this file only adds the one thing the national
// project system doesn't already do on its own: deciding who wins when
// several civs can each complete the SAME globally-unique building, and
// standing the losers down (mirroring legendary-wonder-system.ts's own
// first-discoverer convention for an identical problem).
//
// Everything else is derived live from canonical state, never snapshotted
// here — see `ActiveWorldRace`'s own doc comment in core/types.ts for why.
import type { EventBus } from '@/core/event-bus';
import type { City, GameState, WorldRaceKind } from '@/core/types';
import { getWorldRaceDefinition, getAllWorldRaceKinds } from '@/systems/world-race-definitions';
import { getProductionCostForCivItem } from '@/systems/production-cost-context';

export interface WorldRaceLaunchStatus {
  queued: boolean;
  hostCityId?: string;
  hostCityName?: string;
  progress: number;
  cost: number;
}

function hasBuiltProject(state: GameState, civId: string, buildingId: string): boolean {
  return state.builtNationalProjects?.[`${civId}:${buildingId}`] !== undefined;
}

function livingCivIdsSorted(state: GameState): string[] {
  return Object.values(state.civilizations)
    .filter(civ => !civ.isEliminated)
    .map(civ => civ.id)
    .sort();
}

export function hasCompletedWorldRaceComponent(state: GameState, civId: string, kind: WorldRaceKind): boolean {
  return hasBuiltProject(state, civId, getWorldRaceDefinition(kind).componentBuildingId);
}

/** Reads the civ's OWN current launch-stage state directly off its real production queue — no
 * separate progress ledger exists to drift from it. Safe to call for any viewer's own civId. */
export function getWorldRaceLaunchStatus(state: GameState, civId: string, kind: WorldRaceKind): WorldRaceLaunchStatus {
  const definition = getWorldRaceDefinition(kind);
  const civ = state.civilizations[civId];
  if (!civ) return { queued: false, progress: 0, cost: 0 };

  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city || !city.productionQueue.includes(definition.launchBuildingId)) continue;
    const cost = getProductionCostForCivItem(state, civId, cityId, definition.launchBuildingId);
    const isHead = city.productionQueue[0] === definition.launchBuildingId;
    return {
      queued: true,
      hostCityId: cityId,
      hostCityName: city.name,
      progress: isHead ? city.productionProgress : 0,
      cost,
    };
  }
  return { queued: false, progress: 0, cost: getProductionCostForCivItem(state, civId, null, definition.launchBuildingId) };
}

export function isWorldRaceUnlocked(state: GameState, kind: WorldRaceKind): boolean {
  const techId = getWorldRaceDefinition(kind).unlockTechId;
  return Object.values(state.civilizations).some(civ => !civ.isEliminated && civ.techState.completed.includes(techId));
}

/** Builds the race-progress snapshot `gather_intel` attaches to its own report on the target
 * civ — see EspionageCivState.intelReports' doc comment: this is the SAME report, not a
 * separate race-specific channel. Only includes a race the target has actually entered. */
export function buildWorldRaceIntelSnapshot(
  state: GameState,
  targetCivId: string,
): Partial<Record<WorldRaceKind, { componentBuilt: boolean; launchQueued: boolean; launchProgress: number; launchCost: number }>> | undefined {
  let snapshot: Partial<Record<WorldRaceKind, { componentBuilt: boolean; launchQueued: boolean; launchProgress: number; launchCost: number }>> | undefined;
  for (const kind of getAllWorldRaceKinds()) {
    const componentBuilt = hasCompletedWorldRaceComponent(state, targetCivId, kind);
    const launch = getWorldRaceLaunchStatus(state, targetCivId, kind);
    if (!componentBuilt && !launch.queued) continue;
    snapshot = {
      ...snapshot,
      [kind]: {
        componentBuilt,
        launchQueued: launch.queued,
        launchProgress: launch.progress,
        launchCost: launch.cost,
      },
    };
  }
  return snapshot;
}

function anyLivingCivHasLaunchQueued(state: GameState, kind: WorldRaceKind): boolean {
  return livingCivIdsSorted(state).some(civId => getWorldRaceLaunchStatus(state, civId, kind).queued);
}

function refundAndDequeue(city: City, buildingId: string): { city: City; goldRefund: number } {
  const wasHead = city.productionQueue[0] === buildingId;
  const invested = wasHead ? city.productionProgress : 0;
  const goldRefund = Math.floor(invested / 2);
  return {
    city: {
      ...city,
      productionQueue: city.productionQueue.filter(item => item !== buildingId),
      productionProgress: wasHead ? 0 : city.productionProgress,
    },
    goldRefund,
  };
}

function processRace(state: GameState, bus: EventBus, kind: WorldRaceKind): GameState {
  const definition = getWorldRaceDefinition(kind);
  const existing = state.worldRaces?.[kind];
  let race = existing ?? { kind };
  let changed = existing === undefined;
  let nextState = state;

  if (!race.announcedUnlocked && isWorldRaceUnlocked(state, kind)) {
    race = { ...race, announcedUnlocked: true };
    changed = true;
    bus.emit('worldrace:unlocked', { kind, turn: state.turn });
  }

  if (!race.announcedLaunchBegun && anyLivingCivHasLaunchQueued(state, kind)) {
    race = { ...race, announcedLaunchBegun: true };
    changed = true;
    bus.emit('worldrace:launch-begun', { kind, turn: state.turn });
  }

  if (!race.winnerCivId) {
    const winnerCivId = livingCivIdsSorted(state).find(civId => hasBuiltProject(state, civId, definition.launchBuildingId));
    if (winnerCivId) {
      const record = state.builtNationalProjects![`${winnerCivId}:${definition.launchBuildingId}`]!;
      race = { ...race, winnerCivId, completedTurn: state.turn };
      changed = true;

      const winnerCiv = nextState.civilizations[winnerCivId]!;
      nextState = {
        ...nextState,
        civilizations: {
          ...nextState.civilizations,
          [winnerCivId]: { ...winnerCiv, gold: winnerCiv.gold + definition.winnerReward.goldBonus },
        },
      };
      bus.emit('worldrace:completed', { kind, winnerCivId, hostCityId: record.cityId, turn: state.turn });
    }
  }

  if (race.winnerCivId) {
    let cities = nextState.cities;
    let builtNationalProjects = { ...(nextState.builtNationalProjects ?? {}) };

    function refundGold(civId: string, amount: number): void {
      if (amount <= 0) return;
      nextState = {
        ...nextState,
        civilizations: {
          ...nextState.civilizations,
          [civId]: { ...nextState.civilizations[civId]!, gold: nextState.civilizations[civId]!.gold + amount },
        },
      };
    }

    for (const civId of livingCivIdsSorted(nextState)) {
      if (civId === race.winnerCivId) continue;
      const civ = nextState.civilizations[civId];

      // Ordinary per-civ production completes before this per-round pass sees it (#992: two
      // civs can each independently finish the SAME globally-unique launch building in the
      // same round -- turn-manager.ts runs processWorldRacesTurn once per round, before that
      // round's processCity calls). A rival caught with the building already standing (not
      // merely still queued) must be stripped exactly like national-project-system.ts's own
      // normalizeNationalProjects strips an invalid completed record -- never left permanently
      // standing just because the queue-based cleanup below only sees in-progress entries.
      const builtKey = `${civId}:${definition.launchBuildingId}`;
      const builtRecord = builtNationalProjects[builtKey];
      if (builtRecord) {
        const builtCity = cities[builtRecord.cityId];
        if (builtCity?.buildings.includes(definition.launchBuildingId)) {
          const cost = getProductionCostForCivItem(nextState, civId, builtCity.id, definition.launchBuildingId);
          const goldRefund = Math.floor(cost / 2);
          cities = {
            ...cities,
            [builtCity.id]: { ...builtCity, buildings: builtCity.buildings.filter(id => id !== definition.launchBuildingId) },
          };
          delete builtNationalProjects[builtKey];
          refundGold(civId, goldRefund);
          bus.emit('worldrace:entry-mooted', { kind, civId, cityId: builtCity.id, goldRefund });
        }
      }

      for (const cityId of civ?.cities ?? []) {
        const city = cities[cityId];
        if (!city || !city.productionQueue.includes(definition.launchBuildingId)) continue;
        const { city: refundedCity, goldRefund } = refundAndDequeue(city, definition.launchBuildingId);
        cities = { ...cities, [cityId]: refundedCity };
        refundGold(civId, goldRefund);
        bus.emit('worldrace:entry-mooted', { kind, civId, cityId, goldRefund });
      }
    }
    nextState = { ...nextState, cities, builtNationalProjects };
  }

  if (!changed) return nextState;
  return {
    ...nextState,
    worldRaces: { ...nextState.worldRaces, [kind]: race },
  };
}

export function processWorldRacesTurn(state: GameState, bus: EventBus): GameState {
  let nextState = state;
  for (const kind of getAllWorldRaceKinds()) {
    nextState = processRace(nextState, bus, kind);
  }
  return nextState;
}
