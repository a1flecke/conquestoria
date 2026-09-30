import type { GameState, HexCoord, HexTile, Unit } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { classifyOwner } from '@/core/owner-kind';
import { hexKey } from '@/systems/hex-utils';
import { hasTreatyBetween, isAtWar } from '@/systems/diplomacy-queries';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';

/**
 * Territorial access (#871): "may this mover enter territory owned by that polity?"
 *
 * This is the ONE answer to the diplomatic-permission half of movement legality. It is a
 * **peer** of the map-entity blocker (`unit-movement-legality.ts`), not a variant of it:
 * a foreign city or camp is a physical occupant of one tile; sovereignty is a standing
 * permission that covers every tile a polity owns, changes with treaties, and has its own
 * player-facing copy. Four questions stay separate and are never folded into one predicate:
 *
 *   1. terrain / domain legality   -- `unit-movement-cost.ts`
 *   2. occupancy / blocking        -- `unit-movement-legality.ts`
 *   3. territorial access          -- HERE
 *   4. special-action constraints  -- paradrop / unload / air-assault `can*` predicates
 *
 * `tile.owner` stays the sole sovereignty fact. Nothing here writes state, declares war, or
 * persists anything: access is derived from tile ownership + the treaty/war records on every
 * call, so it is save/reload-stable and hot-seat safe by construction.
 *
 * Deliberately **omniscient** (it reads real `tile.owner`), exactly like
 * `resolveUnitMoveIntent`. The viewer-scoped explanation is
 * `unit-movement-explainer.ts`'s job, and it re-resolves over a knowledge projection.
 *
 * `TerritorialRelation` is also the shared vocabulary #870 (logistics) reads: what a
 * relationship *supports* once entry is legal is that system's decision, not this one's.
 */

/**
 * How a mover's owner stands toward the owner of a tile.
 *
 * - `own`            the mover's own territory
 * - `unclaimed`      nobody's territory (`tile.owner === null`)
 * - `non-sovereign`  owned by something without a treaty relationship -- a city-state, a dead
 *                    civilization. Border access never applies (see the policy table below)
 * - `war`            the two are at war: military entry is the point of war
 * - `alliance`       alliance treaty
 * - `open-borders`   Open Borders treaty
 * - `vassalage`      overlord <-> vassal, either direction
 * - `closed`         a peaceful sovereign with no access agreement -- the only denied case
 *
 * A non-aggression pact and a defensive league grant NO access: they are promises not to
 * attack, not permission to be present.
 */
export type TerritorialRelation =
  | 'own'
  | 'unclaimed'
  | 'non-sovereign'
  | 'war'
  | 'alliance'
  | 'open-borders'
  | 'vassalage'
  | 'closed';

/** Does this relationship let a border-obeying mover stand on that territory? Only `closed` says no. */
export function relationGrantsPassage(relation: TerritorialRelation): boolean {
  return relation !== 'closed';
}

export function classifyTerritorialRelation(
  state: Pick<GameState, 'civilizations'>,
  moverOwnerId: string,
  tileOwnerId: string | null | undefined,
): TerritorialRelation {
  if (!tileOwnerId) return 'unclaimed';
  if (tileOwnerId === moverOwnerId) return 'own';
  const mover = state.civilizations[moverOwnerId];
  const owner = state.civilizations[tileOwnerId];
  // City-states, barbarians, dead civs: no diplomatic standing that could grant or refuse access.
  if (!mover || !owner || owner.isEliminated || classifyOwner(tileOwnerId) !== 'major') return 'non-sovereign';
  if ((mover.diplomacy && isAtWar(mover.diplomacy, tileOwnerId)) || (owner.diplomacy && isAtWar(owner.diplomacy, moverOwnerId))) return 'war';
  if (hasTreatyBetween(state, moverOwnerId, tileOwnerId, 'alliance')) return 'alliance';
  if (hasTreatyBetween(state, moverOwnerId, tileOwnerId, 'open_borders')) return 'open-borders';
  if (mover.diplomacy?.vassalage?.overlord === tileOwnerId || owner.diplomacy?.vassalage?.overlord === moverOwnerId) {
    return 'vassalage';
  }
  return 'closed';
}

/**
 * Mover categories for border obedience. Derived from typed unit metadata (owner kind, domain,
 * `UNIT_CLASS_BY_TYPE`), never from a hardcoded unit list, so a new `UnitType` is classified
 * the moment it has a class entry.
 */
export type BorderMoverCategory =
  | 'armed-land'
  | 'civilian'
  | 'recon'
  | 'covert'
  | 'naval'
  | 'air'
  | 'world-actor';

/**
 * The single obedience table (#871). `true` = the category is barred from `closed` territory.
 *
 * - `armed-land`: the point of a border -- a peaceful power does not host another's army.
 * - `civilian`: settlers, workers, missionaries, caravans, expeditions, Great Generals. Not a
 *   military presence; other rules already stop them founding/improving foreign land. Exempt
 *   so peaceful expansion and trade are not walled off in the eras before Open Borders exists.
 * - `recon`: scouts. Discovery is a core loop; contact is made by sight, not by treaty.
 * - `covert`: spies. Espionage moves them into foreign cities by design, through its own
 *   canonical paths.
 * - `naval` / `air`: deferred to #883 / #884 (operational logistics). Territorial waters are
 *   effectively unclaimed (`canClaimTile` skips ocean) and overflight has no ownership model.
 * - `world-actor`: barbarians, pirates, beasts, crisis forces, rebels AND city-state units have
 *   no treaty standing, so there is nothing to grant or refuse.
 */
export const BORDER_OBEDIENCE: Readonly<Record<BorderMoverCategory, boolean>> = {
  'armed-land': true,
  civilian: false,
  recon: false,
  covert: false,
  naval: false,
  air: false,
  'world-actor': false,
};

export function classifyBorderMover(unit: Pick<Unit, 'type' | 'owner'>): BorderMoverCategory {
  if (classifyOwner(unit.owner) !== 'major') return 'world-actor';
  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  const classes = UNIT_CLASS_BY_TYPE[unit.type] ?? [];
  // Domain and class are both typed metadata and can disagree (a land-domain 'air' unit exists);
  // either one marks a mover as outside the land-border model.
  if (domain === 'naval' || classes.includes('naval')) return 'naval';
  if (domain === 'air' || classes.includes('air')) return 'air';
  if (classes.includes('spy')) return 'covert';
  if (classes.includes('civilian')) return 'civilian';
  if (classes.includes('recon')) return 'recon';
  return 'armed-land';
}

const NOTHING_DENIED: ReadonlySet<string> = new Set<string>();

/**
 * The owners whose territory `unit` may not enter right now -- the fast lookup derived from the
 * canonical relation rule, computed ONCE per resolve/range/path call and then consulted in
 * constant time per tile (`isTileDeniedBy`). It is a projection of
 * `classifyTerritorialRelation`, never a parallel formula.
 *
 * **Egress rule (stateless, deterministic):** the owner of the tile the unit currently stands
 * on is never in the set. A unit caught inside a border by a treaty ending, a peace, or a
 * released vassal can therefore always walk on inside it and out again, but cannot re-enter
 * once it has left. No teleport, no persisted grace timer, no dead-locked unit -- and because
 * it reads only the current position and current relations, save/reload cannot change it.
 */
export function getDeniedTerritoryOwners(state: GameState, unit: Unit): ReadonlySet<string> {
  if (!BORDER_OBEDIENCE[classifyBorderMover(unit)]) return NOTHING_DENIED;
  const standingOn = state.map.tiles[hexKey(unit.position)]?.owner ?? null;
  let denied: Set<string> | undefined;
  for (const civId of Object.keys(state.civilizations)) {
    if (civId === unit.owner || civId === standingOn) continue;
    if (classifyTerritorialRelation(state, unit.owner, civId) !== 'closed') continue;
    (denied ??= new Set()).add(civId);
  }
  return denied ?? NOTHING_DENIED;
}

/** Constant-time per-tile lookup against a set from `getDeniedTerritoryOwners`. */
export function isTileDeniedBy(deniedOwnerIds: ReadonlySet<string>, tile: Pick<HexTile, 'owner'> | undefined): boolean {
  return deniedOwnerIds.size > 0 && Boolean(tile?.owner) && deniedOwnerIds.has(tile!.owner!);
}

/**
 * Units left standing inside a border that a transition just closed to them, by owner.
 * Pure `before -> after` diff over the two states: a transition-owned answer (a steady-state
 * scan would replay the same units every turn), derived from the canonical relation rule and
 * nothing persisted. Only border-obeying units that did not move can be stranded.
 */
export function findUnitsStrandedByAccessLoss(before: GameState, after: GameState): Record<string, string[]> {
  const stranded: Record<string, string[]> = {};
  for (const [unitId, unit] of Object.entries(after.units)) {
    const wasThere = before.units[unitId];
    if (!wasThere || wasThere.owner !== unit.owner || hexKey(wasThere.position) !== hexKey(unit.position)) continue;
    if (!BORDER_OBEDIENCE[classifyBorderMover(unit)]) continue;
    const owner = after.map.tiles[hexKey(unit.position)]?.owner;
    if (!owner || owner === unit.owner) continue;
    if (classifyTerritorialRelation(after, unit.owner, owner) !== 'closed') continue;
    if (classifyTerritorialRelation(before, unit.owner, owner) === 'closed') continue;
    (stranded[unit.owner] ??= []).push(unitId);
  }
  return stranded;
}

/** Emit one `diplomacy:access-lost` per affected civ (deterministic civ order). */
export function emitAccessLossNotices(before: GameState, after: GameState, bus: EventBus | undefined): void {
  if (!bus) return;
  const stranded = findUnitsStrandedByAccessLoss(before, after);
  for (const civId of Object.keys(stranded).sort()) {
    bus.emit('diplomacy:access-lost', { civId, unitCount: stranded[civId]!.length });
  }
}

export interface TerritorialAccessDenial {
  reason: 'closed-border';
  /** Omniscient: the real owner. Never shown to a player -- the explainer redacts it. */
  tileOwnerId: string;
}

/** Reason-carrying single-tile form, for `can*` predicates that need a typed denial. */
export function getTerritorialAccessDenial(
  state: GameState,
  unit: Unit,
  coord: HexCoord,
): TerritorialAccessDenial | null {
  const tile = state.map.tiles[hexKey(coord)];
  return isTileDeniedBy(getDeniedTerritoryOwners(state, unit), tile)
    ? { reason: 'closed-border', tileOwnerId: tile!.owner! }
    : null;
}

/**
 * Player-facing copy. Names no civilization, so a denial can never reveal who owns the land or
 * that an unmet civilization exists; the explainer additionally blanks ownership on tiles the
 * viewer has not explored.
 */
export const TERRITORIAL_ACCESS_MESSAGE =
  'That land belongs to another civilization and its borders are closed to your unit. Agree Open Borders or an alliance first.';
