/**
 * Folds a ScenarioDefinition into a GameState by starting from the canonical
 * createNewGame/createHotSeatGame constructor, then applying each step
 * through the same system helpers gameplay uses. See
 * docs/superpowers/specs/2026-08-16-issue-846-scenario-infrastructure-design.md.
 */
import type { GameState, Unit } from '@/core/types';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { hexKey } from '@/systems/hex-utils';
import { updateVisibility } from '@/systems/fog-of-war';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { ScenarioError, type ScenarioDefinition, type ScenarioStep } from '@/testing/scenario-types';
import { applyUnitStep } from '@/testing/scenario-steps/unit-step';
import { applyCityStep } from '@/testing/scenario-steps/city-step';
import { applyCampStep } from '@/testing/scenario-steps/camp-step';
import { applyTechStep } from '@/testing/scenario-steps/tech-step';
import { applyDiplomacyStep } from '@/testing/scenario-steps/diplomacy-step';
import { applyGoldStep } from '@/testing/scenario-steps/gold-step';

function applyTerrainStep(state: GameState, step: Extract<ScenarioStep, { kind: 'terrain' }>): GameState {
  const key = hexKey(step.position);
  const tile = state.map.tiles[key];
  if (!tile) throw new ScenarioError(`Invalid coordinate ${key} in terrain step`);
  return { ...state, map: { ...state.map, tiles: { ...state.map.tiles, [key]: { ...tile, terrain: step.terrain } } } };
}

function applyStep(state: GameState, step: ScenarioStep): GameState {
  switch (step.kind) {
    case 'terrain': return applyTerrainStep(state, step);
    case 'unit': return applyUnitStep(state, step);
    case 'city': return applyCityStep(state, step);
    case 'camp': return applyCampStep(state, step);
    case 'tech': return applyTechStep(state, step);
    case 'diplomacy': return applyDiplomacyStep(state, step);
    case 'gold': return applyGoldStep(state, step);
  }
}

function refreshVisibilityAndContacts(state: GameState): GameState {
  for (const civId of Object.keys(state.civilizations)) {
    const civ = state.civilizations[civId];
    const civUnits = civ.units
      .map(unitId => state.units[unitId])
      .filter((unit): unit is Unit => unit != null);
    const cityPositions = Object.values(state.cities)
      .filter(city => city.owner === civId)
      .map(city => city.position);
    updateVisibility(civ.visibility, civUnits, state.map, cityPositions);
  }
  for (const civId of Object.keys(state.civilizations)) {
    refreshLastSeenPresentationsForCiv(state, civId);
    syncCivilizationContactsFromVisibility(state, civId);
  }
  return state;
}

export function buildScenario(definition: ScenarioDefinition): GameState {
  let state: GameState = definition.base.kind === 'solo'
    ? createNewGame({ ...definition.base.config, seed: definition.seed })
    : createHotSeatGame(definition.base.config, definition.seed);

  definition.steps.forEach((step, index) => {
    try {
      state = applyStep(state, step);
    } catch (error) {
      if (error instanceof ScenarioError) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new ScenarioError(`Scenario "${definition.name}" step ${index} (${step.kind}) failed: ${reason}`);
    }
  });

  return refreshVisibilityAndContacts(state);
}
