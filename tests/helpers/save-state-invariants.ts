import type { GameState } from '@/core/types';

/**
 * #1006 — shared cross-system structural invariants asserted by the
 * save-compatibility matrix after every `migrate → process a turn → save →
 * reload`. A migration can produce a JSON-valid object that the turn pipeline
 * then chokes on or silently corrupts; these catch the concrete shapes.
 *
 * Scope is deliberately narrow — structural reciprocity that a migration or
 * one turn of processing could plausibly break, not full gameplay validation.
 * The dedicated invariant issues expand each into an exhaustive / property
 * suite: #995 (bilateral war), #997 (city + unit rosters), #1000 (cargo
 * reciprocity), #1001 (eliminated-civ entities). Keep those four the source of
 * truth for the *rules*; this file is the shared assertion the matrix runs.
 *
 * Every function throws an `Error` whose message names the civ / entity ids
 * involved so a matrix failure points straight at the offending version.
 */

class InvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantError';
  }
}

function majorCivIds(state: GameState): string[] {
  return Object.keys(state.civilizations);
}

/**
 * A city or unit is owned by a major civ (`state.civilizations`), a minor civ
 * (`state.minorCivs`, id like `mc-sparta`), or a non-roster actor
 * (`barbarian` / `pirate` / `beasts` / a crisis-force owner). Roster checks
 * apply to the first two; the third has no roster to be consistent with.
 */
type OwnerKind = 'civ' | 'minor' | 'other';
function ownerKind(state: GameState, ownerId: string): OwnerKind {
  if (state.civilizations[ownerId]) return 'civ';
  if (state.minorCivs?.[ownerId]) return 'minor';
  return 'other';
}

/**
 * Every `atWarWith` entry is reciprocal, dedup'd, references a real civ, and
 * is never self-directed. (#995)
 */
export function assertBilateralWar(state: GameState): void {
  const civIds = new Set(majorCivIds(state));
  const problems: string[] = [];

  for (const [civId, civ] of Object.entries(state.civilizations)) {
    const list = civ.diplomacy?.atWarWith ?? [];
    const seen = new Set<string>();
    for (const otherId of list) {
      if (seen.has(otherId)) {
        problems.push(`${civId}.diplomacy.atWarWith has duplicate entry "${otherId}"`);
        continue;
      }
      seen.add(otherId);

      if (otherId === civId) {
        problems.push(`${civId} is at war with itself ("${otherId}")`);
        continue;
      }
      if (!civIds.has(otherId)) {
        problems.push(`${civId} is at war with unknown civ "${otherId}"`);
        continue;
      }
      const reciprocal = state.civilizations[otherId].diplomacy?.atWarWith ?? [];
      if (!reciprocal.includes(civId)) {
        problems.push(`one-sided war: ${civId} lists "${otherId}" but ${otherId} does not list "${civId}"`);
      }
    }
  }

  if (problems.length > 0) throw new InvariantError(`bilateral-war invariant violated:\n  - ${problems.join('\n  - ')}`);
}

/**
 * `city.owner` lists `city.id` in its roster, and every rostered city id
 * exists and is owned by that civ. Applies to both major civs (`civ.cities`)
 * and minor civs (`minorCiv.cityId`, the single city a city-state holds).
 * (#997)
 */
export function assertCityRosters(state: GameState): void {
  const problems: string[] = [];

  for (const [cityId, city] of Object.entries(state.cities)) {
    const kind = ownerKind(state, city.owner);
    if (kind === 'other') {
      problems.push(`city "${cityId}" owner "${city.owner}" is neither a civilization nor a minor civ`);
    } else if (kind === 'civ') {
      if (!state.civilizations[city.owner].cities.includes(cityId)) {
        problems.push(`city "${cityId}" is owned by ${city.owner} but not in that civ's roster`);
      }
    } else if (state.minorCivs[city.owner].cityId !== cityId) {
      problems.push(`city "${cityId}" is owned by minor civ ${city.owner} but that minor civ's cityId is "${state.minorCivs[city.owner].cityId}"`);
    }
  }

  for (const [civId, civ] of Object.entries(state.civilizations)) {
    for (const cityId of civ.cities) {
      const city = state.cities[cityId];
      if (!city) {
        problems.push(`${civId}'s roster names city "${cityId}" which does not exist`);
        continue;
      }
      if (city.owner !== civId) {
        problems.push(`${civId}'s roster names city "${cityId}" but its owner is "${city.owner}"`);
      }
    }
  }

  for (const [mcId, mc] of Object.entries(state.minorCivs ?? {})) {
    const city = state.cities[mc.cityId];
    if (!city) {
      // A destroyed city-state can legitimately have lost its city.
      if (!mc.isDestroyed) problems.push(`minor civ "${mcId}" names city "${mc.cityId}" which does not exist`);
      continue;
    }
    if (city.owner !== mcId && !mc.isDestroyed) {
      problems.push(`minor civ "${mcId}" names city "${mc.cityId}" but its owner is "${city.owner}"`);
    }
  }

  if (problems.length > 0) throw new InvariantError(`city-rosters invariant violated:\n  - ${problems.join('\n  - ')}`);
}

/**
 * Same contract as cities, for units, across major and minor civ rosters.
 * Units owned by non-roster actors (`barbarian` / `pirate` / `beasts` /
 * crisis owners) are skipped. (#997)
 */
export function assertUnitRosters(state: GameState): void {
  const problems: string[] = [];

  for (const [unitId, unit] of Object.entries(state.units)) {
    const kind = ownerKind(state, unit.owner);
    if (kind === 'other') continue;
    const roster = kind === 'civ' ? state.civilizations[unit.owner].units : state.minorCivs[unit.owner].units;
    if (!roster.includes(unitId)) {
      problems.push(`unit "${unitId}" is owned by ${unit.owner} but not in that owner's roster`);
    }
  }

  const rosters: Array<[string, string[]]> = [
    ...Object.entries(state.civilizations).map(([id, civ]) => [id, civ.units] as [string, string[]]),
    ...Object.entries(state.minorCivs ?? {}).map(([id, mc]) => [id, mc.units] as [string, string[]]),
  ];
  for (const [ownerId, roster] of rosters) {
    for (const unitId of roster) {
      const unit = state.units[unitId];
      if (!unit) {
        problems.push(`${ownerId}'s roster names unit "${unitId}" which does not exist`);
        continue;
      }
      if (unit.owner !== ownerId) {
        problems.push(`${ownerId}'s roster names unit "${unitId}" but its owner is "${unit.owner}"`);
      }
    }
  }

  if (problems.length > 0) throw new InvariantError(`unit-rosters invariant violated:\n  - ${problems.join('\n  - ')}`);
}

/**
 * `carrier.cargoUnitIds[i]` ⇔ `cargo.transportId === carrier.id`, both
 * directions, both endpoints existing. (#1000)
 */
export function assertCargoReciprocity(state: GameState): void {
  const problems: string[] = [];

  for (const [unitId, unit] of Object.entries(state.units)) {
    for (const cargoId of unit.cargoUnitIds ?? []) {
      const cargo = state.units[cargoId];
      if (!cargo) {
        problems.push(`carrier "${unitId}" lists cargo "${cargoId}" which does not exist`);
        continue;
      }
      if (cargo.transportId !== unitId) {
        problems.push(`carrier "${unitId}" lists cargo "${cargoId}" but that unit's transportId is "${cargo.transportId ?? 'unset'}" — does not point back`);
      }
    }

    if (unit.transportId !== undefined) {
      const carrier = state.units[unit.transportId];
      if (!carrier) {
        problems.push(`unit "${unitId}" rides transport "${unit.transportId}" which does not exist`);
        continue;
      }
      if (!(carrier.cargoUnitIds ?? []).includes(unitId)) {
        problems.push(`unit "${unitId}" rides transport "${unit.transportId}" but that carrier's cargoUnitIds does not list it`);
      }
    }
  }

  if (problems.length > 0) throw new InvariantError(`cargo-reciprocity invariant violated:\n  - ${problems.join('\n  - ')}`);
}

/**
 * An `isEliminated` civ holds no live entities and no active obligations:
 * no owned cities or units, no other civ at war with it, no treaty naming it,
 * and it is neither an overlord nor a vassal. (#1001)
 */
export function assertNoEliminatedCivEntities(state: GameState): void {
  const problems: string[] = [];
  const eliminated = new Set(
    Object.entries(state.civilizations).filter(([, civ]) => civ.isEliminated).map(([id]) => id),
  );
  if (eliminated.size === 0) return;

  for (const civId of eliminated) {
    const civ = state.civilizations[civId];

    const ownedCities = Object.values(state.cities).filter(city => city.owner === civId).map(city => city.id);
    const ownedUnits = Object.values(state.units).filter(unit => unit.owner === civId).map(unit => unit.id);
    if (ownedCities.length > 0) problems.push(`eliminated civ "${civId}" still owns cities: ${ownedCities.join(', ')}`);
    if (ownedUnits.length > 0) problems.push(`eliminated civ "${civId}" still owns units: ${ownedUnits.join(', ')}`);
    if (civ.cities.length > 0) problems.push(`eliminated civ "${civId}" still has a non-empty city roster`);
    if (civ.units.length > 0) problems.push(`eliminated civ "${civId}" still has a non-empty unit roster`);

    // The eliminated civ's own obligations, not just what others hold against it.
    if ((civ.diplomacy?.atWarWith ?? []).length > 0) {
      problems.push(`eliminated civ "${civId}" still lists active wars: ${civ.diplomacy.atWarWith.join(', ')}`);
    }
    if ((civ.diplomacy?.treaties ?? []).length > 0) {
      problems.push(`eliminated civ "${civId}" still holds ${civ.diplomacy.treaties.length} treaty record(s)`);
    }

    for (const [otherId, other] of Object.entries(state.civilizations)) {
      if (otherId === civId) continue;
      if ((other.diplomacy?.atWarWith ?? []).includes(civId)) {
        problems.push(`eliminated civ "${civId}" still has ${otherId} at war with it`);
      }
      for (const treaty of other.diplomacy?.treaties ?? []) {
        if (treaty.civA === civId || treaty.civB === civId) {
          problems.push(`eliminated civ "${civId}" is still party to a ${treaty.type} treaty with ${otherId}`);
        }
      }
      const vassalage = other.diplomacy?.vassalage;
      if (vassalage?.overlord === civId) problems.push(`eliminated civ "${civId}" is still overlord of ${otherId}`);
      if ((vassalage?.vassals ?? []).includes(civId)) problems.push(`eliminated civ "${civId}" is still a vassal of ${otherId}`);
    }
  }

  if (problems.length > 0) throw new InvariantError(`no-eliminated-civ-entities invariant violated:\n  - ${problems.join('\n  - ')}`);
}

export const SAVE_STATE_INVARIANTS: ReadonlyArray<{ name: string; check: (state: GameState) => void }> = [
  { name: 'bilateral-war', check: assertBilateralWar },
  { name: 'city-rosters', check: assertCityRosters },
  { name: 'unit-rosters', check: assertUnitRosters },
  { name: 'cargo-reciprocity', check: assertCargoReciprocity },
  { name: 'no-eliminated-civ-entities', check: assertNoEliminatedCivEntities },
];

/**
 * Run every registered invariant, collecting failures so one bad save reports
 * all of its problems in a single throw rather than only the first.
 */
export function assertSaveStateInvariants(state: GameState, context?: string): void {
  const failures: string[] = [];
  for (const invariant of SAVE_STATE_INVARIANTS) {
    try {
      invariant.check(state);
    } catch (error) {
      failures.push((error as Error).message);
    }
  }
  if (failures.length > 0) {
    const where = context ? ` (${context})` : '';
    throw new InvariantError(`save-state invariants violated${where}:\n\n${failures.join('\n\n')}`);
  }
}
