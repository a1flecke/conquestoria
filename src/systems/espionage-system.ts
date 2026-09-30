/**
 * Compatibility barrel for the espionage domain (#1009).
 *
 * The former monolithic module is now split across cohesive siblings:
 *
 * - `espionage-catalog.ts`        mission/spy definitions, gates, durations
 * - `espionage-state.ts`          `EspionageCivState` factory + initialization
 * - `espionage-probability.ts`    success chance, modifier breakdown, infiltration
 * - `espionage-spy-lifecycle.ts`  create/embed/unembed/recall/promotion/infiltration
 * - `espionage-counterintel.ts`   sweeps, CI, capture/expel/execute, turning, diplomacy
 * - `espionage-missions.ts`       mission start + pure result resolution
 * - `espionage-interrogation.ts`  interrogation start/tick/resolve
 * - `espionage-turn.ts`           `processSpyTurn` + `processEspionageTurn`
 * - `espionage-presentation.ts`   viewer-facing read-only query surface (UI)
 *
 * Dependency direction (enforced by
 * `tests/app/architecture-boundaries.test.ts`):
 *
 *   catalog → probability → missions → turn
 *   catalog → state
 *   catalog/probability → spy-lifecycle → counterintel
 *   presentation re-exports catalog+probability only
 *
 * This module exists so the pre-split public surface stays importable by the
 * many existing callers (the espionage test suites in particular). It
 * re-exports only that public surface; new production code should import the
 * specific domain module, and `src/ui/**` should import
 * `espionage-presentation.ts` instead of reaching for the mutation modules.
 */
export { MISSION_BASE_SUCCESS, ESPIONAGE_TECH_MAX_SPIES, getAvailableMissions, getMissionDuration, missionRequiresPlacedSpy } from './espionage-catalog';

export { createEspionageCivState, initializeEspionage } from './espionage-state';

export {
  getEspionageModifierBreakdown,
  getInfiltrationSuccessChance,
  getSpySuccessChance,
} from './espionage-probability';
export type {
  EspionageModifierBreakdown,
  EspionageModifierBreakdownPart,
} from './espionage-probability';

export {
  attemptInfiltration,
  checkAndApplyPromotion,
  cleanupDeadSpyUnit,
  createSpyFromUnit,
  embedSpy,
  recallSpy,
  setDisguise,
  unembedSpy,
  verifyAgent,
} from './espionage-spy-lifecycle';
export type { InfiltrationResult } from './espionage-spy-lifecycle';

export {
  applyBuildingCI,
  attemptSweep,
  executeSpy,
  expelSpy,
  getSpyCaptureRelationshipPenalty,
  handleSpyCaptured,
  handleSpyExpelled,
  setCounterIntelligence,
  turnCapturedSpy,
} from './espionage-counterintel';

export { resolveMissionResult, startMission } from './espionage-missions';
export type { MissionResult } from './espionage-missions';

export { processInterrogation, startInterrogation } from './espionage-interrogation';

export { processEspionageTurn, processSpyTurn } from './espionage-turn';
export type { SpyTurnEvent } from './espionage-turn';

export { isSpyUnitType } from './spy-unit-types';
