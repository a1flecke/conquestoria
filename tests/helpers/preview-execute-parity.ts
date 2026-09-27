/**
 * #998 — a reusable preview⇒execute parity harness.
 *
 * The invariant: under UNCHANGED state, anything a preview/query layer offers as legal MUST be
 * accepted by the real executor. Several action families in this repo already prove this
 * per-family, in their own shape, because the two sides genuinely differ (a movement-range BFS
 * vs a single-destination resolver; a `CityAction[]` list vs three different executor modules;
 * a `can*`/`execute*` pair that already shares one function). This harness exists for the
 * families that had no such proof at all, and to give any *future* family a drop-in shape rather
 * than inventing another one-off sweep.
 *
 * Each `PreviewExecuteCase` is evaluated independently against the SAME frozen `state` its
 * `offered` list was read from — deliberately not threading one attempt's result into the next,
 * so that a genuine state change between preview and execution (a different unit moved, a
 * treasury was spent, a turn boundary passed) is never mistaken for a same-state disagreement. A
 * caller whose legality is intentionally time-dependent should not use this harness for that
 * offer.
 */

export interface PreviewExecuteCase<Option> {
  /** Identifies this attempt in a failure message — the action family plus enough context to reproduce it. */
  label: string;
  /** The options the preview/query layer currently declares legal, read once from the frozen state. */
  offered: Option[];
  /**
   * Attempts to execute one offered option against the SAME (unchanged) state. Returns whether
   * the real executor accepted it, and — on rejection — why, for a readable failure message.
   */
  attempt: (option: Option) => { ok: boolean; reason?: string };
  /** How to render one offered option in a failure message. Defaults to `JSON.stringify`. */
  describe?: (option: Option) => string;
}

/**
 * Runs every case's offered options through its own `attempt`, collecting every mismatch rather
 * than throwing on the first — one bad family shouldn't hide a second, same as
 * `assertSaveStateInvariants`' own aggregation.
 */
export function assertPreviewExecutable<Option>(cases: ReadonlyArray<PreviewExecuteCase<Option>>): void {
  const failures: string[] = [];
  for (const testCase of cases) {
    for (const option of testCase.offered) {
      const result = testCase.attempt(option);
      if (!result.ok) {
        const rendered = (testCase.describe ?? JSON.stringify)(option);
        failures.push(`${testCase.label}: offered ${rendered} but the executor refused it${result.reason ? ` (${result.reason})` : ''}`);
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`preview-execute parity violated:\n  - ${failures.join('\n  - ')}`);
  }
}
