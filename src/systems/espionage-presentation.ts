/**
 * Viewer-facing espionage read surface (#1009).
 *
 * The espionage UI may only ask these questions of the subsystem: which
 * missions exist for a completed-tech set, how long each takes, whether it
 * needs a placed spy, and what the success / infiltration odds are. This module
 * is the whitelist of that surface -- it re-exports the readable queries from
 * `espionage-catalog.ts` and `espionage-probability.ts` and nothing else.
 *
 * It deliberately exposes no mutation, no turn processing and no authoritative
 * hidden state. The viewer projection itself is the current player's own
 * `state.espionage[state.currentPlayer]` record, which the panel's view model
 * already reads viewer-scoped; no richer object is handed to the UI.
 *
 * `tests/app/architecture-boundaries.test.ts` asserts that files under
 * `src/ui/**` import this surface (or `spy-unit-types`) rather than the
 * mutation, mission, counterintelligence or turn modules.
 */
export {
  getAvailableMissions,
  getMissionDuration,
  missionRequiresPlacedSpy,
} from './espionage-catalog';
export {
  getEspionageModifierBreakdown,
  getInfiltrationSuccessChance,
  getSpySuccessChance,
} from './espionage-probability';
export type {
  EspionageModifierBreakdown,
  EspionageModifierBreakdownPart,
} from './espionage-probability';
