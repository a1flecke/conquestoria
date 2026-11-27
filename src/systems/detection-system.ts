// src/systems/detection-system.ts
import type { GameState, Unit } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { mapDistance } from './hex-utils';
import { createSimulationRng } from './simulation-rng';
import { isSpyUnitType } from './spy-unit-types';

export function getPassiveDetectionChance(cityPopulation: number): number {
  return Math.min(0.20, 0.033 + cityPopulation * 0.017);
}

export function processDetection(state: GameState, bus: EventBus): GameState {
  const rng = createSimulationRng(state, {
    domain: 'spy-detection',
    eventId: 'detection-turn',
  });
  let nextState = state;

  for (const [spyUnitId, spyUnit] of Object.entries(state.units)) {
    if (!isSpyUnitType(spyUnit.type)) continue;

    // Only idle (on-map, traveling) spies can be detected
    const spyRecord = state.espionage?.[spyUnit.owner]?.spies[spyUnitId];
    if (!spyRecord || spyRecord.status !== 'idle') continue;
    const detectedByCivIds = new Set<string>();
    const registerOnce = (detectingCivId: string, wasDisguised: boolean): void => {
      if (detectedByCivIds.has(detectingCivId)) return;
      detectedByCivIds.add(detectingCivId);
      nextState = registerDetection(nextState, detectingCivId, spyUnit, wasDisguised, bus);
    };

    // 1. Scout Hound detection
    for (const detectUnit of Object.values(state.units)) {
      if (detectUnit.owner === spyUnit.owner) continue;
      if (detectUnit.transportId) continue;
      const def = UNIT_DEFINITIONS[detectUnit.type];
      if (!def?.spyDetectionChance) continue;
      const dist = mapDistance(state.map, detectUnit.position, spyUnit.position);
      if (dist > def.visionRange) continue;
      if (rng() < def.spyDetectionChance) {
        registerOnce(detectUnit.owner, false);
      }
    }

    // 2. Passive baseline detection — a spy next to an enemy city (spies never enter one)
    for (const city of Object.values(state.cities)) {
      if (city.owner === spyUnit.owner) continue;
      if (mapDistance(state.map, city.position, spyUnit.position) > 1) continue;
      const chance = getPassiveDetectionChance(city.population);
      if (rng() < chance) {
        registerOnce(city.owner, spyRecord.disguiseAs != null);
      }
    }
  }

  return nextState;
}

function registerDetection(
  state: GameState,
  detectingCivId: string,
  spyUnit: Unit,
  wasDisguised: boolean,
  bus: EventBus,
): GameState {
  const civEsp = state.espionage?.[detectingCivId];
  if (!civEsp) return state;

  bus.emit('espionage:spy-detected-traveling', {
    detectingCivId,
    spyOwner: spyUnit.owner,
    spyUnitId: spyUnit.id,
    position: spyUnit.position,
    wasDisguised,
  });

  const detection = {
    position: { ...spyUnit.position },
    turn: state.turn,
    wasDisguised,
  };

  return {
    ...state,
    espionage: {
      ...state.espionage,
      [detectingCivId]: {
        ...civEsp,
        recentDetections: [...(civEsp.recentDetections ?? []), detection].slice(-20),
      },
    },
  };
}
