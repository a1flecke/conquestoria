import type { GameState, HexCoord, Unit, UnitType } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { isBeastConcealedFrom } from '@/systems/beast-system';
import { isForestConcealedUnit } from '@/systems/fog-of-war';

const SUBMARINE_TYPES: ReadonlySet<UnitType> = new Set(['submarine', 'missile_submarine']);

function distanceFor(state: GameState, a: HexCoord, b: HexCoord): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(a, b, state.map.width)
    : hexDistance(a, b);
}

/**
 * Naval/air units and cities (coastal_battery-gated) that could detect a concealed
 * submarine for `viewerCivId`. Land units are deliberately excluded -- there is no
 * real-world or in-game equipment/doctrine reason a land garrison would spot a
 * submerged submarine. See
 * docs/superpowers/specs/2026-08-18-issue-542-submarine-stealth-asw-design.md.
 * Shared by isSubmarineConcealedFrom and getSubmarineRevealState so both agree on
 * what counts as "actively tracked."
 */
function hasActiveDetectorInRange(state: GameState, unit: Unit, viewerCivId: string): boolean {
  // Scanned directly from state.units/state.cities (not civilizations[id].units/
  // .cities rosters) for the same robustness reason as isUnitConcealedFrom's own
  // viewerUnits below -- resilient to a roster that's momentarily out of sync, and
  // requires no civilizations entry to exist at all.
  const detectedByUnit = Object.values(state.units)
    .filter((candidate): candidate is Unit => candidate.owner === viewerCivId && !candidate.transportId)
    .some(candidate => {
      const domain = UNIT_DEFINITIONS[candidate.type].domain;
      if (domain !== 'naval' && domain !== 'air') return false;
      const range = UNIT_DEFINITIONS[candidate.type].detection?.concealedNavalRange ?? 1;
      return distanceFor(state, candidate.position, unit.position) <= range;
    });
  if (detectedByUnit) return true;

  return Object.values(state.cities)
    .filter((city): city is NonNullable<typeof city> => city.owner === viewerCivId)
    .some(city => {
      const range = cityDetectionRange(city.buildings);
      return range !== null && distanceFor(state, city.position, unit.position) <= range;
    });
}

const CITY_DETECTION_BASE_RANGE = 1;
const CITY_DETECTION_RADAR_RANGE = 2;

function cityDetectionRange(buildings: readonly string[]): number | null {
  if (!buildings.includes('coastal_battery')) return null;
  return buildings.includes('radar_station') ? CITY_DETECTION_RADAR_RANGE : CITY_DETECTION_BASE_RANGE;
}

/**
 * Submarine/missile-submarine concealment: hidden from an enemy civ unless a viewer
 * naval/air unit or an eligible viewer city is within its own detection range, OR the
 * submarine fired this turn (revealedThisTurn -- reveal-on-fire, a genuine GameState
 * fact visible to every civ with fog visibility of the tile, not a per-viewer overlay).
 */
export function isSubmarineConcealedFrom(
  state: GameState,
  unit: Unit,
  viewerCivId: string,
): boolean {
  if (!SUBMARINE_TYPES.has(unit.type)) return false;
  if (unit.owner === viewerCivId) return false;
  if (unit.revealedThisTurn) return false;
  return !hasActiveDetectorInRange(state, unit, viewerCivId);
}

/**
 * Distinguishes why a submarine is currently visible to `viewerCivId`, for UI badging:
 * 'tracked' (an active detector holds it) stays visible as long as the detector does;
 * 'spotted-momentarily' (visible only via revealedThisTurn) vanishes again next turn.
 * Returns null for the owner's own submarine or a genuinely concealed one.
 */
export function getSubmarineRevealState(
  state: GameState,
  unit: Unit,
  viewerCivId: string,
): 'tracked' | 'spotted-momentarily' | null {
  if (!SUBMARINE_TYPES.has(unit.type) || unit.owner === viewerCivId) return null;
  if (hasActiveDetectorInRange(state, unit, viewerCivId)) return 'tracked';
  return unit.revealedThisTurn ? 'spotted-momentarily' : null;
}

/**
 * Canonical concealment predicate. Every consumer (fog, renderer, targeting,
 * selection, AI perception, AI targeting, last-seen) must call this instead of
 * checking beast/forest/submarine concealment independently -- see
 * docs/superpowers/specs/2026-08-18-issue-542-submarine-stealth-asw-design.md
 * "Critical invariant: every consumer should agree."
 *
 * isSubmarineConcealedFrom derives its OWN, differently-filtered detector set
 * internally (naval/air units + eligible cities) -- it does not reuse the generic
 * `viewerUnits` array below, which is what isBeastConcealedFrom expects (any owned
 * unit, no domain filter).
 */
export function isUnitConcealedFrom(
  state: GameState,
  unit: Unit,
  viewerCivId: string,
): boolean {
  if (unit.owner === viewerCivId) return false;
  // Scanned directly from state.units (matching how most pre-migration call sites
  // built this list) rather than read from civilizations[id].units -- keeps this
  // resilient to a civ roster that's momentarily out of sync, and requires no
  // civilizations entry to exist at all for the beast-concealment sub-check.
  const viewerUnits = Object.values(state.units).filter(
    (u): u is Unit => u.owner === viewerCivId && !u.transportId,
  );
  return isBeastConcealedFrom(unit, state.map, viewerUnits)
    || isForestConcealedUnit(state, viewerCivId, unit)
    || isSubmarineConcealedFrom(state, unit, viewerCivId);
}
