/**
 * Explicit era domain types (#1016 WorldAge + #1017 CivilizationEra).
 *
 * Conquestoria has two fundamentally different era concepts that were both
 * plain `number`, letting one flow where the other belonged:
 *
 * - {@link WorldAge} — global campaign/world progression: the era a majority
 *   of living civilizations has reached. Persisted as the plain number
 *   `GameState.era`; produced in typed form by `resolveWorldAge`.
 * - {@link CivilizationEra} — one major civilization's own technological
 *   progression. Produced in typed form by `resolveCivilizationEra`; never
 *   read from `GameState.era`.
 *
 * The two brands are introduced together on purpose: branding only one side
 * would still let a bare `number` satisfy the other. With both in place, a
 * World Age cannot be passed to a Civilization Era slot and vice versa, and a
 * plain number satisfies neither without crossing an explicit boundary below.
 *
 * Compile-time only. Both brands erase to `number` at runtime, so saves,
 * balance, AI decisions, and deterministic output are unchanged: no
 * `SAVE_VERSION` bump, no migration, no new persisted fields.
 *
 * Conversion into a brand happens only at justified semantic boundaries:
 * `resolveCivilizationEra` / `resolveWorldAge` (the trustworthy producers)
 * and the two `*FromNumber` constructors for already-stored numbers (a
 * persisted `state.era`, test fixtures, the documented minor-civ exception).
 * Do not add `as WorldAge` / `as CivilizationEra` casts at call sites — a
 * branded type developers routinely bypass is worse than the plain number it
 * replaced.
 *
 * Deliberately NOT branded here (see the inventory in the #1016/#1017 PR):
 * tech-definition eras, combat/neutral-pressure derived tiers, thresholds and
 * candidates, `homeEra` / `eraBuilt` snapshots, definition-keyed strength
 * tables, presentation bands, and slots that genuinely blend concepts (a
 * civ-or-World-Age fallback, a pressure tier standing in where no civ era
 * exists). Those stay plain `number` with a comment at the declaration.
 */
declare const worldAgeBrand: unique symbol;

/**
 * Global campaign/world progression (#1016). Only `resolveWorldAge` and
 * `worldAgeFromNumber` can produce one.
 */
export type WorldAge = number & { readonly [worldAgeBrand]: 'WorldAge' };

declare const civilizationEraBrand: unique symbol;

/**
 * One major civilization's own technology-derived era (#1017). Only
 * `resolveCivilizationEra` and `civilizationEraFromNumber` can produce one.
 */
export type CivilizationEra = number & { readonly [civilizationEraBrand]: 'CivilizationEra' };

function normalizeEraNumber(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

/**
 * Semantic boundary: an already-stored numeric World Age (a persisted
 * `GameState.era`, which stays a plain number on disk) becomes typed.
 * Normalizes like the production-cost era clamp so corrupt or legacy values
 * cannot smuggle a non-era into a World Age slot.
 */
export function worldAgeFromNumber(value: number): WorldAge {
  return normalizeEraNumber(value) as WorldAge;
}

/**
 * Semantic boundary: a numeric era becomes a typed CivilizationEra. For test
 * fixtures, definition-era constants used as "the acting civ's era", and the
 * single documented minor-civ exception (a local pressure tier standing in
 * where no `Civilization` record exists to derive an era from). Gameplay code
 * for a major civilization must use `resolveCivilizationEra` instead.
 */
export function civilizationEraFromNumber(value: number): CivilizationEra {
  return normalizeEraNumber(value) as CivilizationEra;
}
