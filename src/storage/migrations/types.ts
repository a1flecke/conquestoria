import type { GameState } from '@/core/types';

/** A pure state->state pass. Every registry entry is one of these. */
export type SaveMigration = (state: GameState) => GameState;

/**
 * #1023 — save compatibility is three different mechanisms that were previously
 * indistinguishable at the call site. Each now has its own registry and its own
 * admission criterion, and an entry that belongs to two must say so explicitly.
 *
 * The failure this separation exists to prevent: a normalizer in the
 * unconditional tail silently papering over a migration that was never written.
 * The save loads, nothing throws, and the missing version step is invisible.
 * `tests/storage/save-persisted-shape-ratchet.test.ts` is the executable half of
 * that guard; these types are the declarative half.
 */

/** Marks an entry that is deliberately registered in two places. */
export interface DualRegistration {
  /** The schema step this same function also serves. */
  version: number;
  /** Why running it unconditionally as well is correct, not redundancy. */
  why: string;
}

/**
 * **Ordered versioned migration.**
 *
 * Admission criterion: *the persisted shape changed at schema N, and a save
 * written below N cannot be read correctly without this transformation.*
 *
 * Runs exactly once, in ascending order, only for `sourceVersion < N`. Never on
 * an already-current save. If a change can be handled by defaulting an optional
 * field that every reader already tolerates, it is compatibility normalization
 * instead and does NOT belong here.
 */
export interface OrderedMigration {
  version: number;
  id: string;
  /** Why this required a schema bump rather than normalization. */
  reason: string;
  apply: SaveMigration;
}

/**
 * **Compatibility normalization.**
 *
 * Admission criterion: *a safe default or an idempotent shape conversion for an
 * optional/additive field, where a save that predates the field is legal at
 * every schema version and every reader already tolerates its absence.*
 *
 * Runs unconditionally on every load. Adding an entry here INSTEAD of writing an
 * ordered migration, for a field readers actually require, is the substitution
 * #1023 exists to prevent — the persisted-shape ratchet will catch it.
 */
export interface CompatibilityNormalizer {
  id: string;
  /** Why old saves need no numbered migration for this field. */
  reason: string;
  apply: SaveMigration;
  alsoOrderedMigration?: DualRegistration;
}

/**
 * **Corruption repair / defensive sanitation.**
 *
 * Admission criterion: *drops or repairs structurally impossible data that the
 * game itself never writes — a hand-edited, truncated, or externally-produced
 * file.* This is a robustness concern, not a versioning one.
 *
 * Runs unconditionally on every load. A repair that actually fires on a save the
 * game wrote is a bug in the writer, not a reason to keep the repair.
 */
export interface CorruptionRepair {
  id: string;
  /** What malformed external input this defends against. */
  reason: string;
  apply: SaveMigration;
  alsoOrderedMigration?: DualRegistration;
}
