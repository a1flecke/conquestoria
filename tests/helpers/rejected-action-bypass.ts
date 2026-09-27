/**
 * #999 — the inverse of #998's `assertPreviewExecutable`: an action the canonical legality
 * check REJECTS must not succeed through any alternate executor capable of producing the same
 * state change. #970 (closed) was exactly this bug — airborne landing and transport unload each
 * implemented their own arrival rule and could place a unit where ordinary movement already
 * refused to. This is the parameterized-executor-list shape #999's own issue body proposes: one
 * denied scenario, every executor in the family attempted against it, every one must refuse.
 */

export interface RejectedActionExecutorAttempt {
  /** Names the executor in a failure message — the function/module that could bypass the rule. */
  executor: string;
  /** Attempts the SAME denied action through this executor. Must report `ok: false` to pass. */
  attempt: () => { ok: boolean; reason?: string };
}

/**
 * Runs every named executor's attempt at one denied action, collecting every executor that
 * wrongly succeeded rather than stopping at the first — a family with two bypasses should not
 * hide the second behind the first.
 */
export function assertRejectedByEveryExecutor(
  familyLabel: string,
  attempts: ReadonlyArray<RejectedActionExecutorAttempt>,
): void {
  const bypassed: string[] = [];
  for (const { executor, attempt } of attempts) {
    const result = attempt();
    if (result.ok) {
      bypassed.push(executor);
    }
  }
  if (bypassed.length > 0) {
    throw new Error(
      `${familyLabel}: canonical legality rejected this action, but the following executor(s) let it succeed anyway: ${bypassed.join(', ')}`,
    );
  }
}
