import type { GameState } from '@/core/types';
import { seededLcg } from './seeded-lcg';

export type SimulationRng = () => number;

/**
 * The fields a simulation domain key can carry. Not exported directly --
 * `SimulationDomainKey` below (via `RequireAtLeastOneIdentity`) is the real
 * public type, so a key naming only its `domain` can never be constructed.
 */
interface SimulationDomainKeyFields {
  /**
   * Subsystem + draw-kind tag, e.g. `'crisis-spawn'`, `'village-visit'`,
   * `'threat-pressure-response'`. A free string, not a closed union --
   * adding a new stochastic subsystem must never require editing this file.
   * Convention: kebab-case, one tag per meaningfully distinct *kind* of draw
   * within a subsystem (a system with two unrelated rolls, e.g. crisis spawn
   * vs. crisis effect resolution, uses two different domain tags even though
   * both live in `crisis-system.ts`) -- this is what makes two draws for the
   * same actor in the same turn independent streams rather than one shared
   * cursor accidentally advanced twice.
   */
  domain: string;
  /**
   * Full entity id of the primary actor -- `unit.id`, `civId`, `mc.id`.
   * Never a substring or character code of one: every normal unit id in this
   * codebase starts with `unit-`, so `unit.id.charCodeAt(0)` is `117` for
   * every unit in the game -- that exact collision is #983.
   */
  actorId?: string;
  /** Full entity id of a second party, when the draw is scoped to a pair (attacker/defender, civ/target, unit/village...). */
  targetId?: string;
  /** Any further domain-specific identity beyond actor/target -- a crisis id, a village id, a landmass id. */
  eventId?: string;
  /**
   * Required whenever `domain` can draw more than once for the same
   * (actor, target, event) tuple within a single turn -- otherwise those
   * draws alias onto the same stream and are not actually independent.
   * Not required when a domain's own state makes the tuple already unique
   * (e.g. a tribal village is deleted on visit, so `(turn, villageId,
   * unitId)` can only ever occur once) -- write that reasoning at the call
   * site rather than assuming it.
   */
  ordinal?: number;
}

/**
 * At least one of actorId/targetId/eventId/ordinal must be present. This is
 * the actual enforcement mechanism: `{ domain: 'x' }` alone is exactly the
 * "seed = f(turn) alone" shape that produced #983 and most of #982's
 * findings (`state.turn * 7919`, `newState.turn * 16807`, ...), and it is a
 * compile error here, not a subtle runtime collision.
 *
 * This does not (and structurally cannot, without a closed per-domain union
 * -- see the module doc above for why that tradeoff was rejected) guarantee
 * a *sufficient* key for every domain; a caller can still under-key by
 * supplying only `actorId` where `targetId` is also needed to disambiguate.
 * What it removes is the concrete failure mode already seen twice in this
 * codebase: a bare arithmetic seed with no structured identity at all.
 */
type RequireAtLeastOneIdentity<T, K extends keyof T> =
  Pick<T, Exclude<keyof T, K>> &
  { [P in K]-?: Required<Pick<T, P>> & Partial<Record<Exclude<K, P>, T[Exclude<K, P>]>> }[K];

export type SimulationDomainKey = RequireAtLeastOneIdentity<
  SimulationDomainKeyFields,
  'actorId' | 'targetId' | 'eventId' | 'ordinal'
>;

/**
 * Rolling string hash -> 32-bit int. Same `Math.imul(31, h) + charCode`
 * convention already used (independently, in three separate files) by
 * `game-state.ts`'s `hashSeed`, `crisis-system.ts`'s `hashString`, and
 * `minor-civ-system.ts`'s file-local `hashSeed` -- kept as its own copy here
 * rather than importing one of those, since none of them is a shared,
 * intentionally-public utility and this module must not depend on any
 * subsystem it may be used from.
 */
function hashToSeed(source: string): number {
  let h = 0;
  for (let i = 0; i < source.length; i++) {
    h = (Math.imul(31, h) + source.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * The one sanctioned way to obtain a deterministic simulation RNG stream.
 * See `.claude/rules/game-systems.md`'s Deterministic Simulation RNG section
 * for the full contract this exists to enforce, and #1021 for why.
 *
 * `gameId` and `turn` are read directly from `state` -- never accepted as
 * key fields -- so a caller cannot omit or mis-supply either. That is the
 * exact omission (`state.gameId` missing from the seed) present in every row
 * of #982's under-keyed-stream table.
 *
 * Deterministic, side-effect free, and reads only `state.gameId`/`state.turn`
 * -- it is safe to call from any actor's turn processing, including hot seat
 * and AI paths, and never mutates `state`.
 *
 * Out of scope, deliberately (see #1021's non-goals):
 * - `createPlaythroughId` (`src/core/game-state.ts`) -- intentionally
 *   `Date.now()`-salted per-playthrough identity, not simulation state.
 * - `src/audio/sfx.ts` -- UI/audio randomness, not simulation state.
 * - `src/systems/map-generator.ts` (and `river-system.ts`, which it calls)
 *   -- already correctly seeded from the campaign seed string; map
 *   generation happens once, before `gameId` derives from the same seed
 *   string, so keying it to `gameId` would be circular, not stronger.
 *
 * Known, accepted limitation: fields are joined with `:` and not escaped, so
 * two structurally different keys could in principle produce the same
 * source string if a field's value itself contained `:` (e.g. `actorId:
 * 'b:c'` vs. `targetId: 'c'` with `actorId: 'b'`). Every id-generation site
 * in this codebase (`unit-${n}`, `village-${n}`, `crisis-${turn}-${civId}`,
 * civ ids like `'player'`/`'ai-1'`, ...) is hyphen/underscore-based and never
 * contains a colon, so this cannot occur in practice today -- the same
 * assumption `deterministicCombatSeed` (`combat-system.ts`) already makes.
 * If a future id format can contain `:`, this join needs length-prefixing
 * or a safer delimiter.
 */
export function createSimulationRng(
  state: Pick<GameState, 'gameId' | 'turn'>,
  key: SimulationDomainKey,
): SimulationRng {
  const source = [
    'simulation',
    state.gameId ?? 'legacy',
    state.turn,
    key.domain,
    key.actorId ?? '',
    key.targetId ?? '',
    key.eventId ?? '',
    key.ordinal ?? '',
  ].join(':');
  return seededLcg(hashToSeed(source));
}
