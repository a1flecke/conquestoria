import type { EspionageCivState, EspionageState, GameState } from '@/core/types';
import { ESPIONAGE_TECH_MAX_SPIES } from './espionage-catalog';

/**
 * Espionage state factory and initialization (#1009). Plain serializable
 * objects -- the record shape itself is defined in `@/core/types`.
 */
// --- State creation ---

export function createEspionageCivState(): EspionageCivState {
  return {
    spies: {},
    maxSpies: 0,
    counterIntelligence: {},
    detectedThreats: {},
    activeInterrogations: {},
    recentDetections: [],
    signalsIntelligence: {},
    troopObservations: {},
    intelReports: {},
    resourceReports: {},
    diplomacyReports: {},
  };
}

export function initializeEspionage(state: GameState): EspionageState {
  const espionage: EspionageState = {};
  for (const civId of Object.keys(state.civilizations)) {
    const civState = createEspionageCivState();
    // Calculate max spies based on completed espionage techs
    let maxSpies = 0;
    for (const [techId, spyCount] of Object.entries(ESPIONAGE_TECH_MAX_SPIES)) {
      if (state.civilizations[civId].techState.completed.includes(techId)) {
        maxSpies = Math.max(maxSpies, spyCount);
      }
    }
    civState.maxSpies = maxSpies;
    espionage[civId] = civState;
  }
  return espionage;
}
