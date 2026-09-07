/**
 * #1004 — the canonical definition of "simulation-equivalent state".
 *
 * Every determinism / save-reload / AI-reproducibility test in this repo
 * should compare states THROUGH this helper rather than inventing its own
 * `JSON.stringify(a) === JSON.stringify(b)` with an ad-hoc field carve-out.
 * One shared definition means a field that is legitimately per-playthrough
 * is excluded in exactly one place, with a written reason, and everything
 * else is compared — deeply, and by first-divergence path so a failure
 * tells you *where* two 10k-key states diverged instead of just "not equal".
 *
 * ── What "equivalent" means ────────────────────────────────────────────────
 * Two `GameState` values are simulation-equivalent when they are deep-equal
 * after removing the fields in `SIMULATION_EQUIVALENCE_EXCLUSIONS`. Nothing
 * else is stripped, normalised, rounded, or sorted. If a real determinism or
 * save/normalisation bug makes two states diverge on a field NOT in that
 * list, the fix is to investigate the divergence (see #1004's "save/load
 * normalization audit" section) — NOT to add the field here to get green.
 *
 * ── The exclusion list, and why each entry is on it ───────────────────────
 *
 *  • `playthroughId`
 *      Deliberately `Date.now()`-salted per-playthrough instance identity
 *      (`createPlaythroughId`, src/core/game-state.ts). It exists precisely
 *      so two games sharing a seed — and therefore a `gameId` — can still be
 *      told apart for save-slot grouping / autosave keys / notification
 *      caches. It is non-reproducible *by design*; comparing it would make
 *      every same-seed determinism assertion fail for a non-bug. `gameId`
 *      (the reproducible seed-derived root of every RNG stream) is NOT
 *      excluded and IS compared.
 *
 *  • `saveSchemaVersion`
 *      Persistence-layer metadata, not simulation state. An in-memory state
 *      straight out of `createNewGame` has no `saveSchemaVersion`; the same
 *      state after `serializeSaveFile` → load carries
 *      `CURRENT_SAVE_SCHEMA_VERSION` because `migrateSaveToCurrent` stamps
 *      it. That difference is the load path working correctly, not a
 *      simulation divergence. Tests that care (save/reload) assert
 *      `=== CURRENT_SAVE_SCHEMA_VERSION` separately and explicitly.
 *
 * Everything investigated and deliberately NOT excluded: `gameId` (compared —
 * it is the determinism root), `turn`/`era`, `idCounters` (entity-id
 * allocation IS simulation state — a divergence here is a real bug), AI
 * portfolios in `opponentAI` (persisted and must reconstruct identically),
 * `notificationLog`, `pendingDiplomacyRequests`, visibility/`lastSeen` caches
 * (rebuilt on load — a divergence means the pre-save state or the rebuild is
 * wrong, which is exactly what #1004 wants surfaced), territory frontiers,
 * and every world-actor / crisis / minor-civ / league container.
 */
export const SIMULATION_EQUIVALENCE_EXCLUSIONS = ['playthroughId', 'saveSchemaVersion'] as const;

export type SimulationEquivalenceExclusion = (typeof SIMULATION_EQUIVALENCE_EXCLUSIONS)[number];

/**
 * Deep-clone `state` and remove exactly the excluded top-level keys. The
 * input is never mutated. Accepts `unknown` so tests can pass trimmed
 * fixtures, not only full `GameState`s.
 */
export function stripForSimulationEquivalence<T>(state: T): T {
  const clone = structuredClone(state);
  if (clone && typeof clone === 'object' && !Array.isArray(clone)) {
    for (const key of SIMULATION_EQUIVALENCE_EXCLUSIONS) {
      delete (clone as Record<string, unknown>)[key];
    }
  }
  return clone;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function joinPath(base: string, segment: string | number): string {
  return base === '' ? String(segment) : `${base}.${segment}`;
}

/**
 * Walk two values in lockstep and return the dotted path of the FIRST place
 * they differ, or `null` if they are simulation-equivalent. Top-level
 * excluded keys are ignored. Arrays are order-significant (a `.length`
 * mismatch is reported before any element). Object key order is not.
 *
 * A key whose value is `undefined` is treated as absent: `JSON.stringify`
 * (which the real save path runs through) drops it, so `{ hasRoad: undefined }`
 * and `{}` are indistinguishable once a state has been saved and reloaded —
 * counting that as a divergence would flag a serialization artifact, not a
 * determinism bug.
 */
export function firstSimulationDivergence(a: unknown, b: unknown): string | null {
  return walk(stripForSimulationEquivalence(a), stripForSimulationEquivalence(b), '');
}

function walk(a: unknown, b: unknown, path: string): string | null {
  if (Object.is(a, b)) return null;

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray || bIsArray) {
    if (!aIsArray || !bIsArray) return path || '(root)';
    if (a.length !== b.length) return joinPath(path, 'length');
    for (let i = 0; i < a.length; i += 1) {
      const inner = walk(a[i], b[i], joinPath(path, i));
      if (inner) return inner;
    }
    return null;
  }

  const aIsRecord = isPlainRecord(a);
  const bIsRecord = isPlainRecord(b);
  if (aIsRecord || bIsRecord) {
    if (!aIsRecord || !bIsRecord) return path || '(root)';
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      // `undefined` value === absent (JSON drops it — see the doc comment above).
      const aHas = Object.prototype.hasOwnProperty.call(a, key) && a[key] !== undefined;
      const bHas = Object.prototype.hasOwnProperty.call(b, key) && b[key] !== undefined;
      if (aHas !== bHas) return joinPath(path, key);
      if (!aHas) continue;
      const inner = walk(a[key], b[key], joinPath(path, key));
      if (inner) return inner;
    }
    return null;
  }

  // Two different primitives (or NaN handled above by Object.is).
  return path || '(root)';
}

function preview(value: unknown): string {
  let text: string;
  try {
    text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) text = 'undefined';
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

function valueAtPath(root: unknown, path: string): unknown {
  if (path === '' || path === '(root)') return root;
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (segment === 'length' && Array.isArray(current)) return current.length;
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Assert two states are simulation-equivalent. On failure the message names
 * the divergent path, both values at that path, and the optional `label`
 * identifying which contract broke.
 */
export function assertSimulationEquivalent(a: unknown, b: unknown, label?: string): void {
  const path = firstSimulationDivergence(a, b);
  if (path === null) return;
  const where = label ? `${label}: ` : '';
  throw new Error(
    `${where}simulation state diverged at "${path}"\n` +
      `  a: ${preview(valueAtPath(stripForSimulationEquivalence(a), path))}\n` +
      `  b: ${preview(valueAtPath(stripForSimulationEquivalence(b), path))}`,
  );
}
