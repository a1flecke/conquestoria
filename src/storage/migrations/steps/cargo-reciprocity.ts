import type { GameState, Unit } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getTransportCapacity, getUnitCargoSize, isNavalTransportUnit } from '@/systems/transport-system';

/**
 * #1000 — repairs structurally impossible transport/cargo and carrier-aircraft
 * links that the game itself never writes. The load/unload helpers
 * (`loadUnitOntoTransport` / `unloadUnitFromTransport`) and the rebase gate
 * (`rebaseAircraft` / `baseNewAirUnit`) keep both representations consistent on
 * every real path, so anything this pass changes came from a hand-edited,
 * truncated, or externally-produced file.
 *
 * The two representations are deliberately different and this repair keeps each
 * correct on its own terms — it never merges them:
 *
 *  - **Naval cargo is dual-reference.** `transport.cargoUnitIds[]` (the manifest)
 *    is authoritative; each carried unit's `transportId` back-pointer is rebuilt
 *    from it. A rejected entry (dangling, duplicated, wrong owner, wrong domain,
 *    over capacity, a transport listed as cargo, a unit on two ships) drops off
 *    the manifest and the unit becomes a free land unit at its own tile — always
 *    a valid state, so nothing is deleted. A one-sided `transportId` (no manifest
 *    lists it) is likewise just cleared.
 *
 *  - **Carrier / city air basing is a derived roster** (`getAirBaseRoster` scans
 *    for `airBase`; there is no reciprocal list). A based aircraft whose
 *    `airBase` names a missing host, a non-carrier hull, a host of a different
 *    owner, or a full carrier deck has nowhere to be — the game *deletes* such an
 *    aircraft (`resolveAirBaseLoss`: "cannot evacuate ⇒ destroyed";
 *    `migrateLegacyBasedAircraft`: "no base ⇒ removed"), so this repair removes
 *    it too and scrubs its owner roster (major civ *and* minor civ), rather than
 *    leaving a grounded aircraft the game has no other way to produce. An
 *    `airBase` value that is not even a well-formed `{kind}` object (a
 *    hand-edited `null`, a string, `{}`) is field corruption rather than a lost
 *    base, so it is normalised to `undefined` and the unit is kept. City-base
 *    *capacity* is not re-derived here (it depends on the host city's buildings
 *    and national projects — pulling the air-ops graph into the load path — and
 *    the runtime rebase gate already enforces it); the `assertAirBaseIntegrity`
 *    invariant checks it with the real helper.
 *
 * Cargo and based aircraft always track their host's tile, so a still-valid link
 * whose position drifted is snapped back (mirrors `syncTransportCargoPositions`
 * and `syncCarrierBasedAircraft`).
 *
 * No-op on any save the game wrote.
 */
export function normalizeCargoReciprocity(state: GameState): GameState {
  const units = state.units;
  if (!units) return state;
  const patches = new Map<string, Partial<Unit>>();
  const removedUnitIds = new Set<string>();
  const patch = (id: string, fields: Partial<Unit>): void => {
    patches.set(id, { ...patches.get(id), ...fields });
  };
  const samePos = (a: Unit['position'], b: Unit['position']): boolean => a.q === b.q && a.r === b.r;

  // --- naval transport / cargo (dual-reference) ------------------------------
  // hostOf.get(cargoId) is the transport whose cleaned manifest lists it — the
  // single authoritative answer to "what, if anything, is this unit riding".
  const hostOf = new Map<string, string>();

  for (const [transportId, transport] of Object.entries(units)) {
    if (!Array.isArray(transport.cargoUnitIds)) continue;
    if (!isNavalTransportUnit(transport)) {
      // Only a naval transport hull may carry a manifest at all.
      patch(transportId, { cargoUnitIds: undefined });
      continue;
    }

    const capacity = getTransportCapacity(transport);
    const seen = new Set<string>();
    const kept: string[] = [];
    let used = 0;
    for (const cargoId of transport.cargoUnitIds) {
      if (typeof cargoId !== 'string' || cargoId === transportId || seen.has(cargoId)) continue;
      seen.add(cargoId);
      const cargo = units[cargoId];
      if (!cargo) continue;                                                      // dangling
      if (hostOf.has(cargoId)) continue;                                         // already aboard another ship
      if (!UNIT_DEFINITIONS[cargo.type]) continue;                               // unknown / garbage type — cannot validate or size it
      if (isNavalTransportUnit(cargo)) continue;                                 // a transport cannot be cargo
      if ((UNIT_DEFINITIONS[cargo.type].domain ?? 'land') !== 'land') continue;  // only land units ride
      if (cargo.owner !== transport.owner) continue;                            // owner mismatch
      const size = getUnitCargoSize(cargo);
      if (used + size > capacity) continue;                                     // drop any entry that would push the manifest over capacity
      used += size;
      kept.push(cargoId);
      hostOf.set(cargoId, transportId);
    }
    const original = transport.cargoUnitIds;
    if (kept.length !== original.length || kept.some((id, i) => id !== original[i])) {
      patch(transportId, { cargoUnitIds: kept });
    }
  }

  for (const [unitId, unit] of Object.entries(units)) {
    const host = hostOf.get(unitId);
    if (host) {
      if (unit.transportId !== host) patch(unitId, { transportId: host });
      const hostUnit = units[host];
      if (hostUnit && !samePos(unit.position, hostUnit.position)) {
        patch(unitId, { position: { ...hostUnit.position } });
      }
    } else if (unit.transportId !== undefined) {
      patch(unitId, { transportId: undefined }); // one-sided back-pointer
    }
  }

  // --- carrier / city air basing (derived roster) --------------------------
  const carrierDeckUsed = new Map<string, number>();
  const basedAircraftIds = Object.keys(units)
    .filter(id => units[id]!.airBase !== undefined)
    .sort(); // deterministic: the same excess aircraft is trimmed on every reload

  for (const unitId of basedAircraftIds) {
    const unit = units[unitId]!;
    const base = unit.airBase;

    if (base == null || typeof base !== 'object' || (base.kind !== 'carrier' && base.kind !== 'city')) {
      patch(unitId, { airBase: undefined }); // malformed value, not a lost base — normalise the field
      continue;
    }

    if (base.kind === 'carrier') {
      const host = units[base.unitId];
      const deckCapacity = host ? UNIT_DEFINITIONS[host.type]?.carrierDeckCapacity : undefined;
      if (!host || deckCapacity == null || host.owner !== unit.owner) {
        removedUnitIds.add(unitId);
        continue;
      }
      const used = carrierDeckUsed.get(base.unitId) ?? 0;
      if (used + 1 > deckCapacity) {
        removedUnitIds.add(unitId);
        continue;
      }
      carrierDeckUsed.set(base.unitId, used + 1);
      if (!samePos(unit.position, host.position)) patch(unitId, { position: { ...host.position } });
    } else {
      // base.kind === 'city' (the guard above rejected every other shape)
      const city = state.cities?.[base.cityId];
      if (!city || city.owner !== unit.owner) {
        removedUnitIds.add(unitId);
        continue;
      }
      if (!samePos(unit.position, city.position)) patch(unitId, { position: { ...city.position } });
    }
  }

  if (patches.size === 0 && removedUnitIds.size === 0) return state;

  const nextUnits: Record<string, Unit> = {};
  for (const [id, unit] of Object.entries(units)) {
    if (removedUnitIds.has(id)) continue;
    const p = patches.get(id);
    nextUnits[id] = p ? { ...unit, ...p } : unit;
  }

  if (removedUnitIds.size === 0) return { ...state, units: nextUnits };

  // A removed unit must leave its owner's roster too, whichever roster that is —
  // aircraft are major-civ-owned in every real save, but a hand-edit could park
  // one on a minor civ, and `assertUnitRosters` checks both.
  const scrub = <T extends { units: string[] }>(holder: T): T =>
    holder.units.some(id => removedUnitIds.has(id))
      ? { ...holder, units: holder.units.filter(id => !removedUnitIds.has(id)) }
      : holder;

  const civilizations = Object.fromEntries(
    Object.entries(state.civilizations).map(([civId, civ]) => [civId, scrub(civ)]),
  ) as GameState['civilizations'];

  const minorCivs = state.minorCivs
    ? (Object.fromEntries(
        Object.entries(state.minorCivs).map(([mcId, mc]) => [mcId, scrub(mc)]),
      ) as GameState['minorCivs'])
    : state.minorCivs;

  return { ...state, units: nextUnits, civilizations, minorCivs };
}
