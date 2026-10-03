import type { EspionageCivState } from '@/core/types';
import { startMission } from '@/systems/espionage-system';

/**
 * Start a mission that the test expects to be legal and return the new state.
 * `startMission` returns a typed result (#1222); a test that only wants the started state asserts
 * `ok` here instead of unwrapping by hand at every call site.
 */
export function startMissionState(...args: Parameters<typeof startMission>): EspionageCivState {
  const result = startMission(...args);
  if (!result.ok) throw new Error(`startMission refused a command the test expected to be legal: ${result.reason}`);
  return result.state;
}
