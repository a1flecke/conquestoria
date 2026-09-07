import type { GameState } from '@/core/types';

/**
 * #1023 — enumerate the *shape* of a persisted save: the set of field paths
 * that survive serialization, with entity-keyed records collapsed to `*`.
 *
 * `civilizations.ai-1.diplomacy.atWarWith` and
 * `civilizations.player.diplomacy.atWarWith` both become
 * `civilizations.*.diplomacy.atWarWith`, so the snapshot is a property of the
 * save *format*, not of one particular game. That is what makes it a usable
 * ratchet: it changes when a developer adds or removes a persisted field, and
 * not when a fixture happens to have one more city.
 *
 * Why this exists: #1006's coverage meta-test fires when
 * `CURRENT_SAVE_SCHEMA_VERSION` is bumped without a matrix case. It cannot see
 * the *opposite* failure — a persisted field added with no version bump at all,
 * defaulted quietly by a normalizer in the unconditional tail. That is the
 * exact substitution #1023 exists to prevent, and this is the half of the gate
 * that catches it.
 */

const MAX_DEPTH = 7;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Is this object a `Record<entityId, T>` rather than a fixed-shape struct?
 *
 * Heuristic, deliberately conservative: at least two entries, every value a
 * plain object, and all of those values sharing at least one key. A struct
 * like `settings` fails on "every value a plain object" (its values are
 * booleans and strings); `cities` / `units` / `map.tiles` / `civilizations`
 * all pass.
 */
function isEntityRecord(value: Record<string, unknown>): boolean {
  const values = Object.values(value);
  if (values.length < 2) return false;
  if (!values.every(isPlainObject)) return false;
  const keySets = values.map(entry => new Set(Object.keys(entry as Record<string, unknown>)));
  const [first, ...rest] = keySets;
  return [...first].some(key => rest.every(set => set.has(key)));
}

function walk(value: unknown, prefix: string, depth: number, out: Set<string>): void {
  if (depth > MAX_DEPTH) return;

  if (Array.isArray(value)) {
    // Union the shapes of every element so an optional field present on only
    // some entries still registers.
    for (const element of value) walk(element, `${prefix}[]`, depth + 1, out);
    return;
  }

  if (!isPlainObject(value)) return;

  if (isEntityRecord(value)) {
    for (const entry of Object.values(value)) walk(entry, `${prefix}.*`, depth + 1, out);
    return;
  }

  for (const key of Object.keys(value)) {
    if (value[key] === undefined) continue; // never survives serialization
    const path = prefix === '' ? key : `${prefix}.${key}`;
    out.add(path);
    walk(value[key], path, depth + 1, out);
  }
}

/** Sorted list of collapsed field paths present in a persisted save. */
export function persistedShape(state: GameState): string[] {
  const out = new Set<string>();
  walk(state as unknown as Record<string, unknown>, '', 0, out);
  return [...out].sort();
}

/**
 * Union the shapes of several saves — one fixture never exercises every
 * optional branch (a game with no crises has no `activeCrises.*` paths).
 */
export function unionPersistedShape(states: GameState[]): string[] {
  const out = new Set<string>();
  for (const state of states) for (const path of persistedShape(state)) out.add(path);
  return [...out].sort();
}
