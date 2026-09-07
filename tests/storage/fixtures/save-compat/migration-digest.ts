import { createHash } from 'node:crypto';
import type { GameState } from '@/core/types';

/**
 * #1023 — a compact, diagnostic fingerprint of a migrated save.
 *
 * The refactor's hard constraint is behaviour preservation: a save that loads
 * today must load identically afterwards. Committing full migrated states for
 * every fixture would be ~1MB of snapshot; a single whole-state hash would be
 * 35 bytes but tell you nothing when it breaks. So this digests **each
 * top-level key separately** — a failure names the divergent subtree
 * (`civilizations`, `map`, `opponentAI`, …) instead of just "hash mismatch".
 *
 * Keys are sorted recursively before hashing: object insertion order is an
 * implementation detail a legitimate refactor may change (`{...state, foo}` vs
 * `{foo, ...state}`) without altering a single value. The semantic contract is
 * what is pinned; a pure key reorder is allowed and is called out in the PR.
 */

/** Recursively sort object keys so the digest is insertion-order independent. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    // `undefined` never survives JSON serialization, so it must not affect the digest.
    if (record[key] === undefined) continue;
    out[key] = canonicalize(record[key]);
  }
  return out;
}

function shortHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value) ?? null)).digest('hex').slice(0, 12);
}

export type MigrationDigest = Record<string, string>;

/**
 * Fields that cannot be pinned because they are deliberately not reproducible.
 *
 * `playthroughId` only — `createPlaythroughId` (src/core/game-state.ts) salts it
 * with `Date.now()` on purpose, so two builds of the same fixture differ. This
 * is the same field the project's canonical state comparator excludes
 * (`SIMULATION_EQUIVALENCE_EXCLUSIONS` in tests/helpers/deterministic-state.ts);
 * see the "Deterministic Simulation Contract" section of
 * .claude/rules/game-systems.md for why it is separate from `gameId`.
 *
 * `saveSchemaVersion` is deliberately NOT excluded here (unlike in the
 * simulation comparator): for a migration digest it is deterministic, and
 * "the chain stamped exactly CURRENT" is one of the things worth pinning.
 */
const UNPINNABLE_KEYS: ReadonlySet<string> = new Set(['playthroughId']);

/**
 * One short digest per top-level key of the migrated state, plus `__whole` for
 * the entire state (catches a key being added or removed outright).
 */
export function digestMigratedState(state: GameState): MigrationDigest {
  const source = state as unknown as Record<string, unknown>;
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (UNPINNABLE_KEYS.has(key) || source[key] === undefined) continue;
    record[key] = source[key];
  }

  const digest: MigrationDigest = { __whole: shortHash(record) };
  for (const key of Object.keys(record).sort()) {
    digest[key] = shortHash(record[key]);
  }
  return digest;
}

/** Human-readable diff of two digests: which top-level keys changed/appeared/vanished. */
export function describeDigestDrift(expected: MigrationDigest, actual: MigrationDigest): string[] {
  const drift: string[] = [];
  for (const key of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
    if (key === '__whole') continue;
    const before = expected[key];
    const after = actual[key];
    if (before === after) continue;
    if (before === undefined) drift.push(`+ ${key} (new top-level key)`);
    else if (after === undefined) drift.push(`- ${key} (top-level key vanished)`);
    else drift.push(`~ ${key} (${before} -> ${after})`);
  }
  return drift;
}
