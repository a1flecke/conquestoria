/**
 * The canonical deterministic string-to-number hashes (#1234). Import-free on purpose: any layer (core, systems,
 * renderer) may depend on it without creating a cycle.
 *
 * This module is a CONSOLIDATION, not a design. Before #1234 about eighteen files each carried their own copy of one
 * of the loops below, and the copies are not interchangeable: they differ in start value, in whether the running
 * value is signed or unsigned, and in whether the string is walked by UTF-16 unit or by code point. A seed derived
 * from one variant lands somewhere else if a different variant is used, which would move every RNG stream, every
 * saved gameId and every deterministic combat roll that is keyed on it. So every function here reproduces exactly one
 * historical variant bit for bit, and `tests/systems/deterministic-hash.test.ts` pins each against a verbatim copy of
 * the old loop. **Never "normalise" one variant onto another, and never change one in place.** A genuinely new hash
 * is a new function with a new name and its own golden, and a change to simulation output needs its own issue.
 *
 * Do not hand-roll another copy: `tests/systems/deterministic-hash.test.ts` fails on a new string-hash loop outside
 * this file. New simulation randomness should still go through `createSimulationRng`
 * (`.claude/rules/game-systems.md`); that module's own seed hash is `rolling31Signed`.
 *
 * Naming: the suffix says how the string is walked. "UTF-16" variants read `charCodeAt(i)` for every UTF-16 code
 * unit; "ByCodePoint" / "CodePointLead" variants iterate code points and read only the first UTF-16 unit of each
 * (`charCodeAt(0)`), which differs from the plain walk for characters outside the Basic Multilingual Plane.
 * `Raw` returns the loop value untouched: an int32 (possibly negative) for any non-empty input, and the unmodified
 * start value for the empty string.
 */

export const FNV32_OFFSET_BASIS = 2166136261;
export const FNV32_PRIME = 16777619;
export const LEHMER_MULTIPLIER = 48271;
export const LEHMER_MODULUS = 2147483647;

/**
 * Java-style rolling hash, start 0: `h = imul(31, h) + unit | 0`, UTF-16 units, signed int32 result.
 * `game-state.ts` hashSeed (before its `Math.abs(h) || 1`), `map-generator.ts` createRng, `river-system.ts` (whose
 * `(hash << 5) - hash` is the same arithmetic modulo 2^32), and `simulation-rng.ts` hashToSeed.
 */
export function rolling31Signed(source: string): number {
  let h = 0;
  for (let i = 0; i < source.length; i++) {
    h = (Math.imul(31, h) + source.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Rolling hash, start **1**, unsigned: `value = (value * 31 + lead) >>> 0` over code points, `lead` being the first
 * UTF-16 unit of each. Not the same function as `rolling31Signed` (different start, unsigned, different walk).
 * `barbarian-system.ts` camp seeds.
 */
export function rolling31UnsignedByCodePoint(source: string): number {
  let value = 1;
  for (const character of source) {
    value = (value * 31 + character.charCodeAt(0)) >>> 0;
  }
  return value;
}

/**
 * 32-bit FNV-1a over UTF-16 units, as the loop leaves it: int32 for non-empty input, `FNV32_OFFSET_BASIS` for empty.
 * For callers that feed the value on into more signed arithmetic (`createPirateRng`).
 */
export function fnv1a32Raw(source: string): number {
  let hash = FNV32_OFFSET_BASIS;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, FNV32_PRIME);
  }
  return hash;
}

/** `fnv1a32Raw` as an unsigned 32-bit value. Combat seeds, roster/placement tie-breaks, crisis percents and ranks. */
export function fnv1a32(source: string): number {
  return fnv1a32Raw(source) >>> 0;
}

/**
 * 32-bit FNV-1a over **code points**, reading only each code point's first UTF-16 unit, as the loop leaves it.
 * Identical to `fnv1a32Raw` for any string without astral characters; different for one with them (a surrogate pair
 * contributes only its high surrogate). `pirate-actions.ts` deterministicRoll.
 */
export function fnv1a32CodePointLeadRaw(source: string): number {
  let hash = FNV32_OFFSET_BASIS;
  for (const character of source) {
    hash = Math.imul(hash ^ character.charCodeAt(0), FNV32_PRIME);
  }
  return hash;
}

/** `fnv1a32CodePointLeadRaw` as an unsigned 32-bit value. `air-operations-system.ts` base-loss rolls. */
export function fnv1a32CodePointLead(source: string): number {
  return fnv1a32CodePointLeadRaw(source) >>> 0;
}

/**
 * Lehmer (MINSTD, 48271 mod 2^31 - 1) fold of a string into a caller-supplied starting state, code points, first
 * UTF-16 unit of each: `state = (state * 48271 + lead) % 2147483647`. The caller decides the start (a turn-derived
 * value, an existing seed) and any further steps. `turn-manager.ts` deriveGeneralCandidateSeed and
 * `combat-reward-system.ts` seededRoll.
 */
export function lehmerFoldByCodePoint(initialState: number, source: string): number {
  let state = initialState;
  for (const character of source) {
    state = (state * LEHMER_MULTIPLIER + character.charCodeAt(0)) % LEHMER_MODULUS;
  }
  return state;
}

/**
 * djb2-style hash with an XOR step, start 5381, unsigned: `h = ((h << 5) + h) ^ unit`, UTF-16 units. A presentation
 * hash (sprite animation phase, building-icon variant); not used by simulation state.
 */
export function djb2XorUnsigned(source: string): number {
  let h = 5381;
  for (let i = 0; i < source.length; i++) {
    h = ((h << 5) + h) ^ source.charCodeAt(i);
  }
  return h >>> 0;
}
