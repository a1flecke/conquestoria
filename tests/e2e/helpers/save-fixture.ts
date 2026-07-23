import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { City, GameState } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import {
  initializeLegendaryWonderProjectsForCity,
  startLegendaryWonderBuild,
} from '@/systems/legendary-wonder-system';
import { normalizeLoadedState } from '@/storage/save-manager';

const FIXTURE_PATH = join(__dirname, '..', '..', 'fixtures', 'issue-365-crowded-map-save.json');
const BASE_FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as GameState;

export type ProductionScenario = 'building' | 'unit' | 'legendary';

export function createBaseFixture(): GameState {
  return structuredClone(BASE_FIXTURE);
}

export function findVisibleOwnedCity(state: GameState): City {
  const visibility = state.civilizations[state.currentPlayer]?.visibility;
  const city = Object.values(state.cities).find(candidate => (
    candidate.owner === state.currentPlayer
    && visibility !== undefined
    && getVisibility(visibility, candidate.position) === 'visible'
  ));
  if (!city) throw new Error('Fixture requires a visible city owned by currentPlayer.');
  return city;
}

function setValidatedQueueHead(state: GameState, city: City, itemId: 'granary' | 'warrior'): void {
  if (itemId === 'granary' && !BUILDINGS.granary) {
    throw new Error('Fixture requires the granary definition.');
  }
  if (itemId === 'warrior' && !TRAINABLE_UNITS.some(unit => unit.type === 'warrior')) {
    throw new Error('Fixture requires the warrior definition.');
  }
  state.cities[city.id] = { ...city, productionQueue: [itemId], productionProgress: 0 };
}

function configureStandingStones(initial: GameState, cityId: string): GameState {
  let state = structuredClone(initial);
  const civ = state.civilizations[state.currentPlayer];
  civ.techState.completed = [...new Set([
    ...civ.techState.completed,
    'animism',
    'mud-brick',
    'gathering',
  ])];
  if (!state.marketplace) throw new Error('Standing Stones fixture requires marketplace state.');
  state.marketplace = {
    ...state.marketplace,
    purchasedResources: [
      ...(state.marketplace.purchasedResources ?? []),
      { civId: state.currentPlayer, resource: 'stone', expiresOnTurn: state.turn + 10 },
    ],
  };
  const village = Object.values(state.tribalVillages ?? {})[0];
  if (!village) throw new Error('Standing Stones fixture requires an existing village.');
  state.legendaryWonderHistory ??= { destroyedStrongholds: [], discoveredSites: [] };
  state.legendaryWonderHistory.discoveredSites.push({
    civId: state.currentPlayer,
    siteId: village.id,
    siteType: 'tribal-village',
    position: village.position,
    turn: state.turn,
  });
  state = initializeLegendaryWonderProjectsForCity(state, state.currentPlayer, cityId);
  const ready = Object.values(state.legendaryWonderProjects ?? {}).find(project => (
    project.cityId === cityId && project.wonderId === 'standing-stones'
  ));
  if (ready?.phase !== 'ready_to_build') {
    throw new Error('Standing Stones fixture did not reach ready_to_build.');
  }
  state = startLegendaryWonderBuild(state, state.currentPlayer, cityId, 'standing-stones');
  const project = Object.values(state.legendaryWonderProjects ?? {}).find(candidate => (
    candidate.cityId === cityId && candidate.wonderId === 'standing-stones'
  ));
  if (project?.phase !== 'building' || state.cities[cityId]?.productionQueue[0] !== 'legendary:standing-stones') {
    throw new Error('Standing Stones fixture did not enter its canonical build state.');
  }
  return state;
}

export function createScenarioState(scenario: ProductionScenario): GameState {
  let state: GameState = normalizeLoadedState(createBaseFixture());
  state.opponentChallenge = 'standard';
  const city = findVisibleOwnedCity(state);
  if (scenario === 'building') setValidatedQueueHead(state, city, 'granary');
  if (scenario === 'unit') setValidatedQueueHead(state, city, 'warrior');
  if (scenario === 'legendary') state = configureStandingStones(state, city.id);
  return state;
}

export async function installAutosave(page: Page, state: GameState): Promise<void> {
  await page.addInitScript(serialized => {
    localStorage.setItem('conquestoria-autosave', serialized);
  }, JSON.stringify(state));
}
