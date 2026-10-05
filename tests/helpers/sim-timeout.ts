/**
 * Wall-clock budget for a test that runs a multi-turn simulation (#608 and #1133 documented the recurring failure;
 * this is the shared answer).
 *
 * Why a factor and not a hand-picked number: a simulation test does a fixed, deterministic amount of work, but the
 * wall-clock it takes depends on the host. Measured on this repo: a quiet local solo run is the baseline, a loaded
 * multi-agent host or the four-shard CI runners are 2-4x slower (domination-ai-campaign: 17 s solo, 54 s on CI;
 * turn-manager-beasts' awaken search: 1.5 s solo, a 5 s default timeout hit under a durable run). Timeouts chosen as
 * "about 2x what I saw locally" therefore fail the first time the host is busy, which is how the same flake was fixed
 * three times by hand. Sizing from the solo duration with one documented factor makes the headroom explicit and the
 * same everywhere:
 *
 *   timeout = max(MIN, solo duration x SIM_SLOWDOWN_FACTOR)
 *
 * `SIM_SLOWDOWN_FACTOR` is 6: the worst observed slowdown (~3.3x) with ~1.8x margin. Pass the solo duration of the
 * WORST case the test can reach (for a bounded search loop, its full iteration cap), not the typical case.
 */
export const SIM_SLOWDOWN_FACTOR = 6;
export const SIM_TIMEOUT_MIN_MS = 15_000;

export function simTimeout(soloWorstCaseMs: number): number {
  return Math.max(SIM_TIMEOUT_MIN_MS, Math.ceil(soloWorstCaseMs * SIM_SLOWDOWN_FACTOR));
}
