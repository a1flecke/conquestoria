import type { City, GameState, Unit } from '@/core/types';
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { canUnitOccupyCity } from '@/systems/city-capture-system';
import { calculateCityAssaultStrengths, getCityIntrinsicStrength } from '@/systems/city-siege-system';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { isHostileOwnerTo } from '@/systems/owner-hostility';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

/**
 * #966: the single source of truth for "what can this unit do to this city".
 *
 * Before this existed, a tap on a city tile could reach two different routes -- the
 * attack-target path (`executeAttack`) or the assault path
 * (`resolveSelectedUnitTapIntent` -> `beginPlayerCityAssault`) -- depending on whether the
 * city happened to land in `movementRange` or `attackRange`. Those two disagreed per unit
 * type: a Frigate saw the city in `attackRange` but not `movementRange` and its tap
 * produced a `move` the executor then rejected, while an Archer saw the reverse. That
 * divergence is the same defect class that produced #965 and #966, so highlights, the tap
 * preview, the executor and the AI all consult this one function instead.
 *
 * Denials are first-class: an action that is *nearly* legal comes back in `denied` with
 * player-facing copy, so the UI can never silently omit an option or burn a unit's turn on
 * a no-op.
 */
export type CityAction =
  | { kind: 'attack-defender'; defenderId: string; label: string }
  | { kind: 'bombard'; hpLoss: number; counterFire: number; label: string }
  | {
      kind: 'capture';
      winProbability: number;
      /** The attacker's side of the same roll, so the preview needs no second computation. */
      attackerStrength: number;
      /** Intrinsic defense ignoring damage -- what the city is worth at full HP. */
      defenseBefore: number;
      /** Defense the assault actually fights through, i.e. HP-scaled (#966). */
      defenseAfter: number;
      label: string;
    };

export interface CityInteraction {
  available: CityAction[];
  denied: { kind: CityAction['kind']; reason: string }[];
}

function distanceFor(state: GameState, from: { q: number; r: number }, to: { q: number; r: number }): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(from, to, state.map.width)
    : hexDistance(from, to);
}

/**
 * A minor civ (city-state) has no `Civilization` record and therefore no `techState`, so
 * `?? []` is what makes a city-state resolvable at all rather than a silent no-op.
 */
export function getCityDefenderTechs(state: GameState, city: City): string[] {
  return state.civilizations[city.owner]?.techState.completed ?? [];
}

export interface CityInteractionOptions {
  /**
   * Amphibious-assault multiplier, applied exactly as `calculateCityAssaultStrengths`
   * already applies it. Threaded through here rather than computed by the preview so the
   * odds the player is shown and the odds this resolver reports never diverge.
   */
  attackerMultiplier?: number;
}

export function resolveCityInteraction(
  state: GameState,
  unit: Unit,
  city: City,
  options: CityInteractionOptions = {},
): CityInteraction {
  const available: CityAction[] = [];
  const denied: { kind: CityAction['kind']; reason: string }[] = [];

  // Visibility is keyed to the ACTING unit's owner, never state.currentPlayer, so hot-seat
  // seats and the AI all get their own fog-correct answer from the same call.
  const legality = canUnitAttackTarget(state, unit, city.position, { viewerId: unit.owner });
  if (legality.ok && legality.targetType === 'unit') {
    const defender = state.units[legality.targetUnitId];
    if (defender) {
      available.push({
        kind: 'attack-defender',
        defenderId: legality.targetUnitId,
        label: `Attack the ${UNIT_DEFINITIONS[defender.type].name}`,
      });
    }
  }

  // Gates mirror `beginMajorCityAssault`'s own order, so a `capture` we offer here is one
  // that executor will actually accept.
  const captureDenial = resolveCaptureDenial(state, unit, city);
  if (captureDenial) {
    denied.push({ kind: 'capture', reason: captureDenial });
    return { available, denied };
  }

  const techs = getCityDefenderTechs(state, city);
  const strengths = calculateCityAssaultStrengths(unit, city, techs, state.map, {
    attackerMultiplier: options.attackerMultiplier,
  });
  available.push({
    kind: 'capture',
    winProbability: strengths.winProbability,
    attackerStrength: strengths.attackerStrength,
    defenseBefore: getCityIntrinsicStrength(city, techs, 'land'),
    defenseAfter: strengths.intrinsicStrength,
    label: `Capture the city — ${Math.round(strengths.winProbability * 100)}%`,
  });

  return { available, denied };
}

function resolveCaptureDenial(state: GameState, unit: Unit, city: City): string | null {
  if (!canUnitOccupyCity(unit)) return 'This unit cannot capture a city.';
  if (city.owner === unit.owner) return 'This city is already yours.';
  if (!isHostileOwnerTo(state, unit.owner, city.owner)) return 'You are not at war with this city.';

  // Action-state gates. beginMajorCityAssault rejects both of these
  // ('already-captured-city-this-turn' / 'illegal-movement'), so omitting them here would
  // let the UI offer a capture the executor refuses -- the exact divergence this resolver
  // exists to prevent.
  if (unit.hasCapturedCityThisTurn) return 'This unit has already captured a city this turn.';
  if (unit.hasActed || unit.movementPointsLeft <= 0) return 'This unit has already acted this turn.';

  if (distanceFor(state, unit.position, city.position) !== 1) return 'Move next to the city to capture it.';

  // Matches beginMajorCityAssault's `city-defended` check exactly: ANY unit standing on the
  // city tile blocks occupation, not only the owner's. A direct scan rather than
  // buildUnitOccupancy, because Phase 2 calls this per candidate tile while building
  // highlights and allocating a whole occupancy index each time would be wasteful.
  const cityKey = hexKey(city.position);
  for (const occupant of Object.values(state.units)) {
    if (occupant.id !== unit.id && hexKey(occupant.position) === cityKey) {
      return 'Defeat the defenders first.';
    }
  }
  return null;
}
