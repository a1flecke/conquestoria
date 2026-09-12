import type { AirBaseRef, GameState } from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getTransportCapacity, getUnitCargoSize, isNavalTransportUnit } from '@/systems/transport-system';
import { getAirBaseCapacity, getAirBaseRoster } from '@/systems/air-operations-system';
import { assertEliminatedCivHasNoLiveEntities } from './eliminated-civ-areas';

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
 * reciprocity AND carrier/city air-base integrity — two separate representations,
 * see each function), #1001 (eliminated-civ entities). Keep those issues the
 * source of truth for the *rules*; this file is the shared assertion the matrix
 * runs.
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
 * The MAJOR-civ war invariant (#995): for every ordered pair of major civs,
 * `A.atWarWith ∋ B ⟺ B.atWarWith ∋ A`; no `atWarWith` array carries a
 * duplicate or a self-reference; a `classifyOwner === 'major'` id in an
 * `atWarWith` list is a live civ in the roster.
 *
 * A NON-major id (`mc-…` city-state, `barbarian`, …) is deliberately out of
 * scope — minor-civ war state legitimately rides the same array (see
 * `.claude/rules/game-systems.md#bilateral-diplomacy`), so it is only checked
 * for dedup / self-reference here, not reciprocity or roster membership.
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
      if (classifyOwner(otherId) !== 'major') continue; // minor-civ / barbarian war — not this invariant
      if (!civIds.has(otherId)) {
        problems.push(`${civId} is at war with unknown major civ "${otherId}"`);
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
 * Naval transport ↔ land-unit cargo is a **dual reference**: the transport's
 * `cargoUnitIds[]` manifest and each carried unit's `transportId` back-pointer
 * must agree, and every real path (`loadUnitOntoTransport` /
 * `unloadUnitFromTransport` / the combat & lifecycle cascades) keeps them in
 * lock-step. This asserts the full contract those helpers enforce (#1000):
 *
 *  - both directions of the link resolve and point back at each other;
 *  - only a naval transport hull (`isNavalTransportUnit`) carries a manifest;
 *  - a manifest entry is unique within its transport AND across all transports
 *    (one unit is never aboard two ships);
 *  - cargo is a land-domain unit owned by the same civ as the transport, and is
 *    not itself a transport (no cargo-carrying-cargo);
 *  - total `getUnitCargoSize` aboard never exceeds `getTransportCapacity`;
 *  - cargo sits on its transport's tile (cargo is not an occupying map unit — it
 *    tracks the hull).
 */
export function assertCargoReciprocity(state: GameState): void {
  const problems: string[] = [];
  const claimedBy = new Map<string, string>(); // cargoId -> first transport that listed it

  for (const [unitId, unit] of Object.entries(state.units)) {
    const manifest = unit.cargoUnitIds ?? [];
    if (manifest.length > 0 && !isNavalTransportUnit(unit)) {
      problems.push(`unit "${unitId}" (${unit.type}) carries a cargo manifest but is not a naval transport`);
    }

    const seen = new Set<string>();
    let loadUsed = 0;
    for (const cargoId of manifest) {
      if (seen.has(cargoId)) {
        problems.push(`transport "${unitId}" lists cargo "${cargoId}" more than once`);
        continue;
      }
      seen.add(cargoId);

      const firstClaim = claimedBy.get(cargoId);
      if (firstClaim && firstClaim !== unitId) {
        problems.push(`cargo "${cargoId}" is listed by two transports: "${firstClaim}" and "${unitId}"`);
      } else if (!firstClaim) {
        claimedBy.set(cargoId, unitId);
      }

      const cargo = state.units[cargoId];
      if (!cargo) {
        problems.push(`transport "${unitId}" lists cargo "${cargoId}" which does not exist`);
        continue;
      }
      if (cargo.transportId !== unitId) {
        problems.push(`transport "${unitId}" lists cargo "${cargoId}" but that unit's transportId is "${cargo.transportId ?? 'unset'}" — does not point back`);
      }
      if (cargo.owner !== unit.owner) {
        problems.push(`transport "${unitId}" (owner ${unit.owner}) carries cargo "${cargoId}" owned by ${cargo.owner}`);
      }
      if (!UNIT_DEFINITIONS[cargo.type]) {
        problems.push(`transport "${unitId}" carries cargo "${cargoId}" of unknown type "${cargo.type}"`);
        continue; // an unknown type has no domain or cargo size to check
      }
      if ((UNIT_DEFINITIONS[cargo.type].domain ?? 'land') !== 'land') {
        problems.push(`transport "${unitId}" carries non-land cargo "${cargoId}" (${cargo.type})`);
      }
      if (isNavalTransportUnit(cargo)) {
        problems.push(`transport "${unitId}" carries another transport "${cargoId}" as cargo`);
      }
      if (cargo.position.q !== unit.position.q || cargo.position.r !== unit.position.r) {
        problems.push(`cargo "${cargoId}" is at (${cargo.position.q},${cargo.position.r}) but its transport "${unitId}" is at (${unit.position.q},${unit.position.r})`);
      }
      loadUsed += getUnitCargoSize(cargo);
    }

    if (isNavalTransportUnit(unit)) {
      const capacity = getTransportCapacity(unit);
      if (loadUsed > capacity) {
        problems.push(`transport "${unitId}" carries ${loadUsed} cargo size over its capacity of ${capacity}`);
      }
    }

    if (unit.transportId !== undefined) {
      const transport = state.units[unit.transportId];
      if (!transport) {
        problems.push(`unit "${unitId}" rides transport "${unit.transportId}" which does not exist`);
        continue;
      }
      if (!(transport.cargoUnitIds ?? []).includes(unitId)) {
        problems.push(`unit "${unitId}" rides transport "${unit.transportId}" but that transport's cargoUnitIds does not list it`);
      }
    }
  }

  if (problems.length > 0) throw new InvariantError(`cargo-reciprocity invariant violated:\n  - ${problems.join('\n  - ')}`);
}

/**
 * Carrier- and city-based aircraft use a **single representation**: a based
 * aircraft carries an `airBase` ref and the roster is *derived* by
 * `getAirBaseRoster` scanning for it — there is no reciprocal list to keep in
 * sync, which is why this is a separate model from naval cargo above and #1000
 * deliberately does not unify them. What must still hold (#1000):
 *
 *  - the `airBase` host resolves — a live city, or a live unit whose definition
 *    declares `carrierDeckCapacity` (a carrier-family hull);
 *  - the aircraft and its base share an owner;
 *  - the aircraft sits on its base's tile (it tracks the host, same as cargo);
 *  - no base's derived roster exceeds `getAirBaseCapacity` for that base.
 *
 * The game removes an aircraft that loses its base (`resolveAirBaseLoss`), so a
 * dangling `airBase` is structurally impossible, not merely stale.
 */
export function assertAirBaseIntegrity(state: GameState): void {
  const problems: string[] = [];
  const seenBases = new Map<string, AirBaseRef>();
  const baseKey = (base: AirBaseRef): string => (base.kind === 'city' ? `city:${base.cityId}` : `carrier:${base.unitId}`);

  for (const [unitId, unit] of Object.entries(state.units)) {
    // Widened to admit hand-edited junk (`null`, a bare string, `{kind:'x'}`)
    // that the field type forbids but a corrupt save can still carry.
    const base = unit.airBase as AirBaseRef | null | undefined;
    if (base === undefined) continue; // not a based aircraft
    if (base === null || typeof base !== 'object' || (base.kind !== 'carrier' && base.kind !== 'city')) {
      problems.push(`aircraft "${unitId}" has a malformed air base value (${JSON.stringify(base)})`);
      continue;
    }

    if (base.kind === 'carrier') {
      const host = state.units[base.unitId];
      if (!host) {
        problems.push(`aircraft "${unitId}" is based on carrier "${base.unitId}" which does not exist`);
        continue;
      }
      if (UNIT_DEFINITIONS[host.type]?.carrierDeckCapacity == null) {
        problems.push(`aircraft "${unitId}" is based on unit "${base.unitId}" (${host.type}) which is not a carrier-capable hull`);
        continue; // not a valid base — skip capacity aggregation (getAirBaseCapacity would deref a maybe-missing def)
      }
      if (host.owner !== unit.owner) {
        problems.push(`aircraft "${unitId}" (owner ${unit.owner}) is based on carrier "${base.unitId}" owned by ${host.owner}`);
      }
      if (unit.position.q !== host.position.q || unit.position.r !== host.position.r) {
        problems.push(`aircraft "${unitId}" is at (${unit.position.q},${unit.position.r}) but its carrier "${base.unitId}" is at (${host.position.q},${host.position.r})`);
      }
    } else {
      // base.kind === 'city' (the guard above rejected every other shape)
      const city = state.cities[base.cityId];
      if (!city) {
        problems.push(`aircraft "${unitId}" is based at city "${base.cityId}" which does not exist`);
        continue;
      }
      if (city.owner !== unit.owner) {
        problems.push(`aircraft "${unitId}" (owner ${unit.owner}) is based at city "${base.cityId}" owned by ${city.owner}`);
      }
      if (unit.position.q !== city.position.q || unit.position.r !== city.position.r) {
        problems.push(`aircraft "${unitId}" is at (${unit.position.q},${unit.position.r}) but its base city "${base.cityId}" is at (${city.position.q},${city.position.r})`);
      }
    }

    seenBases.set(baseKey(base), base);
  }

  for (const base of seenBases.values()) {
    const roster = getAirBaseRoster(state, base).length;
    const capacity = getAirBaseCapacity(state, base);
    if (roster > capacity) {
      problems.push(`air base ${baseKey(base)} hosts ${roster} aircraft over its capacity of ${capacity}`);
    }
  }

  if (problems.length > 0) throw new InvariantError(`air-base-integrity invariant violated:\n  - ${problems.join('\n  - ')}`);
}

/**
 * Vassalage reciprocity (#1054, #1003): a depth-1 star, both directions
 * agree, no self-vassalage. `normalizeVassalage` (a `CORRUPTION_REPAIRS`
 * entry, `src/storage/vassalage-normalization.ts`) repairs exactly these
 * shapes on every *load* — but that is a save-corruption backstop, not a
 * live-bug catcher. #1054's actual bug (an overlord's peace not freeing its
 * vassals from the same war) was a live, in-session defect a load-time
 * repair could never have caught; this assert is the missing test-time
 * counterpart, the same role `assertBilateralWar` plays for war state.
 *
 * Deliberately narrower than `normalizeVassalage`'s full repair scope: this
 * checks only the graph shape (reciprocity, depth-1 star, dedup, live ids),
 * not whether a live `vassalage`-type treaty backs the relationship or
 * whether `protectionTimers` entries are individually legal — those are
 * load-time corruption-repair concerns, a different layer, the same way
 * `assertBilateralWar` does not re-check `diplomacy.events`.
 */
export function assertVassalageReciprocity(state: GameState): void {
  const civIds = new Set(majorCivIds(state));
  const problems: string[] = [];

  for (const [civId, civ] of Object.entries(state.civilizations)) {
    const overlord = civ.diplomacy?.vassalage?.overlord;
    if (overlord == null) continue;

    if (overlord === civId) {
      problems.push(`"${civId}" is its own overlord`);
      continue;
    }
    if (!civIds.has(overlord)) {
      problems.push(`"${civId}" claims overlord "${overlord}" which is an unknown civ "${overlord}"`);
      continue;
    }
    const overlordVassals = state.civilizations[overlord].diplomacy?.vassalage?.vassals ?? [];
    if (!overlordVassals.includes(civId)) {
      problems.push(`"${civId}" claims overlord "${overlord}" but "${overlord}" does not list "${civId}" as a vassal`);
    }
  }

  for (const [civId, civ] of Object.entries(state.civilizations)) {
    const vassals = civ.diplomacy?.vassalage?.vassals ?? [];
    const seen = new Set<string>();
    for (const vassalId of vassals) {
      if (seen.has(vassalId)) {
        problems.push(`"${civId}" lists duplicate vassal entry "${vassalId}"`);
        continue;
      }
      seen.add(vassalId);

      if (!civIds.has(vassalId)) {
        problems.push(`"${civId}" lists vassal "${vassalId}" which is an unknown civ "${vassalId}"`);
        continue;
      }
      const vassalOverlord = state.civilizations[vassalId].diplomacy?.vassalage?.overlord;
      if (vassalOverlord !== civId) {
        problems.push(`"${civId}" lists "${vassalId}" as a vassal but "${vassalId}" does not have "${civId}" as its overlord`);
        continue;
      }
      // Depth-1 star: an overlord has no overlord of its own, and a vassal
      // has no vassals of its own (see `.claude/rules/game-systems.md#1054`).
      const overlordOfOverlord = civ.diplomacy?.vassalage?.overlord;
      if (overlordOfOverlord != null) {
        problems.push(`"${civId}" is an overlord of "${vassalId}" but itself has an overlord ("${overlordOfOverlord}")`);
      }
      const vassalsOfVassal = state.civilizations[vassalId].diplomacy?.vassalage?.vassals ?? [];
      if (vassalsOfVassal.length > 0) {
        problems.push(`"${vassalId}" is a vassal of "${civId}" but itself has vassals: ${vassalsOfVassal.join(', ')}`);
      }
    }
  }

  if (problems.length > 0) throw new InvariantError(`vassalage-reciprocity invariant violated:\n  - ${problems.join('\n  - ')}`);
}

/**
 * Treaty reciprocity (#1003): `signTreaty` (`diplomacy-system.ts`) writes a
 * `Treaty` record onto exactly ONE side's `diplomacy.treaties` array — its
 * own comment says "Both sides must be signed for a complete treaty," i.e. a
 * correct caller calls it twice. That is the identical single-side-write
 * shape `declareWar`/`makePeace` had before #995, and this is the same
 * test-time backstop `assertBilateralWar` provides for war state: every
 * treaty a civ records must have a matching record on the other side (same
 * type), and no civ holds a duplicate same-type treaty with the same
 * partner (mirrors the vassalage assert's duplicate-vassal-entry check
 * above). Deliberately does not compare `turnsRemaining` between the two
 * sides — in normal play they stay numerically identical (`tickTreaties`
 * runs once per living civ inside the same unconditional per-turn loop, so
 * both copies decrement together), but asserting exact equality here would
 * couple this structural-reciprocity check to turn-processing order/timing
 * rather than to the shape that actually matters: a treaty existing on only
 * one side, or disagreeing on `type`, is the dangerous bug class this exists
 * to catch.
 */
export function assertTreatyReciprocity(state: GameState): void {
  const civIds = new Set(majorCivIds(state));
  const problems: string[] = [];

  for (const [civId, civ] of Object.entries(state.civilizations)) {
    const seen = new Set<string>();
    for (const treaty of civ.diplomacy?.treaties ?? []) {
      if (treaty.civA !== civId) {
        problems.push(`"${civId}" holds a treaty record whose civA is "${treaty.civA}", not itself`);
        continue;
      }
      if (treaty.civB === civId) {
        problems.push(`"${civId}" holds a treaty with itself`);
        continue;
      }
      if (!civIds.has(treaty.civB)) {
        problems.push(`"${civId}" holds a treaty with unknown civ "${treaty.civB}"`);
        continue;
      }

      const pairKey = `${treaty.type}:${treaty.civB}`;
      if (seen.has(pairKey)) {
        problems.push(`"${civId}" holds a duplicate ${treaty.type} treaty with "${treaty.civB}"`);
        continue;
      }
      seen.add(pairKey);

      const otherTreaties = state.civilizations[treaty.civB].diplomacy?.treaties ?? [];
      const hasMirror = otherTreaties.some(t => t.civA === treaty.civB && t.civB === civId && t.type === treaty.type);
      if (!hasMirror) {
        problems.push(`"${treaty.civB}" has no matching ${treaty.type} treaty back to "${civId}"`);
      }
    }
  }

  if (problems.length > 0) throw new InvariantError(`treaty-reciprocity invariant violated:\n  - ${problems.join('\n  - ')}`);
}

/**
 * An `isEliminated` civ holds no live entities and no active obligations
 * anywhere in `GameState` — not just no owned cities/units/wars, but nothing in
 * espionage, AI planning, crises, trade, the minor-civ layer, and so on. The
 * exhaustive rule and its declared per-area catalogue (`ELIMINATED_CIV_AREAS`,
 * a `Record<keyof GameState, …>` so a new field cannot dodge classification)
 * live in `./eliminated-civ-areas`; `eliminated-civ-invariant.test.ts` owns the
 * coverage meta-test and the allowed-historical-record classification. (#1001)
 */
export { assertEliminatedCivHasNoLiveEntities };
/** Back-compat alias — same check, older name used by existing tests + `SAVE_STATE_INVARIANTS`. */
export const assertNoEliminatedCivEntities = assertEliminatedCivHasNoLiveEntities;

export const SAVE_STATE_INVARIANTS: ReadonlyArray<{ name: string; check: (state: GameState) => void }> = [
  { name: 'bilateral-war', check: assertBilateralWar },
  { name: 'city-rosters', check: assertCityRosters },
  { name: 'unit-rosters', check: assertUnitRosters },
  { name: 'cargo-reciprocity', check: assertCargoReciprocity },
  { name: 'air-base-integrity', check: assertAirBaseIntegrity },
  { name: 'vassalage-reciprocity', check: assertVassalageReciprocity },
  { name: 'treaty-reciprocity', check: assertTreatyReciprocity },
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
