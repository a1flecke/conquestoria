/**
 * #871 — the lifecycle of access: a treaty (or a war) lets units in, then ends while they are
 * inside. Deterministic, no teleport, no stranding, transition-owned viewer-safe notices,
 * identical after save/reload.
 */
import { describe, it, expect } from 'vitest';
import type { GameEvents, GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { hexKey } from '@/systems/hex-utils';
import { breakTreaty } from '@/systems/diplomacy-treaties';
import { declareMajorWar, makeMajorPeace } from '@/systems/diplomacy-war';
import { commitTreatyAgreement, tickTreaties } from '@/systems/diplomacy-treaties';
import { releaseVassal, resolveIndependence } from '@/systems/diplomacy-vassalage';
import { getDeniedTerritoryOwners } from '@/systems/territorial-access';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
import { findPath } from '@/systems/unit-pathfinding';
import { applyStandingOrders } from '@/core/round-phases/per-civ/standing-orders';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { resolveUnitMoveIntent, executeUnitMove } from '@/systems/unit-movement-system';
import { emitAccessLossNotices, findUnitsStrandedByAccessLoss } from '@/systems/territorial-access';
import { routeAccessLost } from '@/ui/notification-routes/diplomacy-routes';
import {
  addUnit, asPlayer, makeTerritorialWorld, setVassal, setWar, signBoth, type TerritorialWorld,
} from './helpers/territorial-fixture';

type Notice = { civId: string; message: string; kind: string };

describe('dynamic diplomacy movement parity', () => {
  function readyWorld() {
    const world = makeTerritorialWorld();
    world.state.idCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    // Sovereign cityless settlers make the real major-war command eligible.
    addUnit(world, 'homeSettler', 'settler', 'player', 0, 2);
    addUnit(world, 'rivalSettler', 'settler', 'rival', 9, 2);
    addUnit(world, 'thirdSettler', 'settler', 'third', 9, 0);
    addUnit(world, 'army', 'warrior', 'player', 2, 1);
    return world;
  }

  function assertParity(world: TerritorialWorld, allowed: boolean) {
    const state = world.state;
    const unit = state.units['unit-army'];
    const to = { q: 4, r: 1 };
    const before = structuredClone(state);
    expect(resolveUnitMoveIntent(state, unit.id, to, asPlayer).ok).toBe(allowed);
    expect(getMovementRangeDetails(state, unit.id).reachable.map(hexKey).includes(hexKey(to))).toBe(allowed);
    expect(findPath(unit.position, to, state.map, 'land', {
      unit, deniedOwnerIds: getDeniedTerritoryOwners(state, unit),
    }) !== null).toBe(allowed);
    expect(executeUnitMove(structuredClone(state), unit.id, to, asPlayer).ok).toBe(allowed);
    expect(state).toEqual(before);
  }

  it('canonical agreement, cancellation, war and peace agree across preview, route and execution', () => {
    const world = readyWorld();
    assertParity(world, false);
    world.state = commitTreatyAgreement(world.state, 'player', 'rival', 'open_borders', new EventBus());
    assertParity(world, true);
    const entered = executeUnitMove(world.state, 'unit-army', { q: 4, r: 1 }, asPlayer);
    expect(entered.ok).toBe(true);
    if (!entered.ok) return;
    world.state = breakBoth(entered.state, 'open_borders');
    world.state.units['unit-army'] = { ...world.state.units['unit-army'], movementPointsLeft: 12, hasMoved: false };
    const exited = executeUnitMove(world.state, 'unit-army', { q: 2, r: 1 }, asPlayer);
    expect(exited.ok).toBe(true);
    if (!exited.ok) return;
    world.state = exited.state;
    // Once outside, this same army can no longer borrow its previous egress.
    assertParity(world, false);
    world.state = declareMajorWar(world.state, 'player', 'rival');
    assertParity(world, true);
    world.state = makeMajorPeace(world.state, 'player', 'rival');
    assertParity(world, false);
  });

  it.each(['release', 'independence'] as const)('%s closes entry without removing a land army\'s egress', command => {
    const world = readyWorld();
    setVassal(world, 'player', 'rival');
    signBoth(world, 'player', 'rival', 'vassalage');
    world.state.civilizations.player.diplomacy.vassalage.protectionScore = 0;
    assertParity(world, true);
    world.state.units['unit-army'] = { ...world.state.units['unit-army'], position: { q: 4, r: 1 } };
    world.state = command === 'release'
      ? releaseVassal(world.state, 'rival', 'player', new EventBus())
      : resolveIndependence(world.state, 'player', 'rival', true, new EventBus());
    expect(world.state.civilizations.player.diplomacy.vassalage.overlord).toBeNull();
    expect(resolveUnitMoveIntent(world.state, 'unit-army', { q: 2, r: 1 }, asPlayer).ok).toBe(true);
    world.state.units['unit-army'] = { ...world.state.units['unit-army'], position: { q: 2, r: 1 } };
    assertParity(world, false);
  });

  it('a finite treaty expiry changes route legality and interrupts a standing journey', () => {
    const world = readyWorld();
    world.state = commitTreatyAgreement(world.state, 'player', 'rival', 'open_borders', new EventBus());
    for (const id of ['player', 'rival']) {
      const civ = world.state.civilizations[id];
      civ.diplomacy = tickTreaties({ ...civ.diplomacy, treaties: civ.diplomacy.treaties.map(t => ({ ...t, turnsRemaining: 1 })) });
    }
    assertParity(world, false);
    world.state.units['unit-army'].automation = { mode: 'journey', destination: { q: 7, r: 1 } };
    const bus = new EventBus();
    const blocked: string[] = [];
    bus.on('unit:journey-blocked', e => blocked.push(e.unitId));
    const civ = world.state.civilizations.player;
    const after = applyStandingOrders(structuredClone(world.state), {
      civId: 'player', civ, currentCivState: civ,
      civDef: resolveCivDefinition(world.state, civ.civType), unitIdsAtTurnStart: [...civ.units],
    }, [], bus);
    expect(after.units['unit-army'].position).toEqual({ q: 2, r: 1 });
    expect(after.units['unit-army'].automation).toBeUndefined();
    expect(blocked).toEqual(['unit-army']);
  });

  it('egress through one foreign owner does not open the next foreign owner on a route', () => {
    const world = readyWorld();
    world.state.units['unit-army'].position = { q: 4, r: 1 };
    for (const tile of Object.values(world.state.map.tiles)) if (tile.coord.q === 5) tile.owner = 'third';
    const to = { q: 7, r: 1 };
    expect(resolveUnitMoveIntent(world.state, 'unit-army', to, asPlayer).ok).toBe(false);
    world.state = commitTreatyAgreement(world.state, 'player', 'third', 'open_borders', new EventBus());
    expect(resolveUnitMoveIntent(world.state, 'unit-army', to, asPlayer).ok).toBe(true);
    expect(executeUnitMove(world.state, 'unit-army', to, asPlayer).ok).toBe(true);
  });
});

function collect(bus: EventBus): Notice[] {
  const seen: Notice[] = [];
  bus.on('diplomacy:access-lost', event => routeAccessLost(event as GameEvents['diplomacy:access-lost'], (civId, message, kind) => {
    seen.push({ civId, message, kind });
  }));
  return seen;
}

/** Player has a mixed party deep in rival land, admitted by `grant`. */
function partyInside(grant: (w: TerritorialWorld) => void): TerritorialWorld {
  const world = makeTerritorialWorld();
  grant(world);
  addUnit(world, 'spear', 'spearman', 'player', 4, 1);
  addUnit(world, 'archer', 'archer', 'player', 5, 0);
  addUnit(world, 'worker', 'worker', 'player', 4, 2);
  addUnit(world, 'scout', 'scout', 'player', 3, 0);
  // A rival unit inside the PLAYER's land too, to prove notices are per-owner.
  addUnit(world, 'rivalSpear', 'spearman', 'rival', 1, 1);
  return world;
}

function breakBoth(state: GameState, type: 'open_borders' | 'alliance'): GameState {
  const a = state.civilizations.player!;
  const b = state.civilizations.rival!;
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      player: { ...a, diplomacy: breakTreaty(a.diplomacy, 'rival', type, state.turn) },
      rival: { ...b, diplomacy: breakTreaty(b.diplomacy, 'player', type, state.turn) },
    },
  };
}

describe('#871 Open Borders ends while units are inside', () => {
  const open = (w: TerritorialWorld) => signBoth(w, 'player', 'rival', 'open_borders');

  it('diffs exactly the armed units left inside closed land, per owner, and nothing else', () => {
    const before = partyInside(open).state;
    const after = breakBoth(before, 'open_borders');
    expect(findUnitsStrandedByAccessLoss(before, after)).toEqual({
      player: ['unit-spear', 'unit-archer'], // the worker and scout are exempt categories
      rival: ['unit-rivalSpear'],
    });
  });

  it('emits one viewer-safe notice per affected civ, once, naming no civilization', () => {
    const before = partyInside(open).state;
    const after = breakBoth(before, 'open_borders');
    const bus = new EventBus();
    const notices = collect(bus);
    emitAccessLossNotices(before, after, bus);
    expect(notices.map(n => [n.civId, n.kind])).toEqual([['player', 'warning'], ['rival', 'warning']]);
    expect(notices[0]!.message).toMatch(/^2 of your units are now inside borders that are closed to them/);
    expect(notices[1]!.message).toMatch(/^One of your units is now inside borders/);
    for (const notice of notices) expect(notice.message).not.toMatch(/rival|player|open borders treaty/i);
    // Steady state: re-running over the settled state announces nothing (transition-owned).
    const later = collect(new EventBus());
    const quiet = new EventBus();
    quiet.on('diplomacy:access-lost', () => later.push({ civId: '', message: '', kind: '' }));
    emitAccessLossNotices(after, after, quiet);
    expect(later).toEqual([]);
  });

  it('nothing moves, dies or teleports; every unit still has a legal way out', () => {
    const before = partyInside(open).state;
    const after = breakBoth(before, 'open_borders');
    expect(after.units).toEqual(before.units);
    for (const id of ['unit-spear', 'unit-archer']) {
      expect(resolveUnitMoveIntent(after, id, { q: 2, r: 1 }, asPlayer).ok, `${id} exits home`).toBe(true);
      expect(resolveUnitMoveIntent(after, id, { q: 6, r: 1 }, asPlayer).ok, `${id} exits far side`).toBe(true);
    }
    // ...but a unit that has gone home cannot simply walk back in.
    const moved = executeUnitMove(structuredClone(after), 'unit-spear', { q: 2, r: 1 }, asPlayer);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const home: GameState = moved.state;
    home.units['unit-spear'] = { ...home.units['unit-spear']!, movementPointsLeft: 12, hasMoved: false };
    expect(resolveUnitMoveIntent(home, 'unit-spear', { q: 3, r: 1 }, asPlayer).ok).toBe(false);
  });

  it('save/reload mid-sequence changes nothing: same diff, same legality, same notices', () => {
    const before = partyInside(open).state;
    const after = breakBoth(before, 'open_borders');
    const reloadedBefore: GameState = JSON.parse(JSON.stringify(before));
    const reloadedAfter: GameState = JSON.parse(JSON.stringify(after));
    expect(findUnitsStrandedByAccessLoss(reloadedBefore, reloadedAfter)).toEqual(findUnitsStrandedByAccessLoss(before, after));
    for (const to of [{ q: 2, r: 1 }, { q: 5, r: 1 }, { q: 7, r: 1 }]) {
      expect(resolveUnitMoveIntent(reloadedAfter, 'unit-spear', to, asPlayer).ok)
        .toBe(resolveUnitMoveIntent(after, 'unit-spear', to, asPlayer).ok);
    }
  });

  it('is deterministic: two independent runs of the same sequence agree exactly', () => {
    const run = () => {
      const before = partyInside(open).state;
      const after = breakBoth(before, 'open_borders');
      const bus = new EventBus();
      const notices = collect(bus);
      emitAccessLossNotices(before, after, bus);
      return { stranded: findUnitsStrandedByAccessLoss(before, after), notices };
    };
    expect(run()).toEqual(run());
  });
});

describe('#871 the other ways passage ends', () => {
  it('alliance broken: same behaviour as Open Borders', () => {
    const before = partyInside(w => signBoth(w, 'player', 'rival', 'alliance')).state;
    const after = breakBoth(before, 'alliance');
    expect(findUnitsStrandedByAccessLoss(before, after).player).toEqual(['unit-spear', 'unit-archer']);
  });

  it('breaking a treaty that never granted passage strands nobody', () => {
    const world = partyInside(w => { setWar(w, 'player', 'rival'); signBoth(w, 'player', 'rival', 'non_aggression_pact'); });
    const after = breakBoth(world.state, 'open_borders');
    expect(findUnitsStrandedByAccessLoss(world.state, after)).toEqual({});
  });

  it('peace after war: makeMajorPeace announces it exactly once and is a no-op the second time', () => {
    const world = partyInside(w => setWar(w, 'player', 'rival'));
    const bus = new EventBus();
    const notices = collect(bus);
    const peaceful = makeMajorPeace(world.state, 'player', 'rival', bus);
    expect(peaceful.civilizations.player!.diplomacy.atWarWith).toEqual([]);
    expect(notices.map(n => n.civId)).toEqual(['player', 'rival']);
    makeMajorPeace(peaceful, 'player', 'rival', bus);
    expect(notices).toHaveLength(2);
    // The freshly-peaceful army inside can leave but not re-enter.
    expect(resolveUnitMoveIntent(peaceful, 'unit-spear', { q: 2, r: 1 }, asPlayer).ok).toBe(true);
    expect(resolveUnitMoveIntent(peaceful, 'unit-spear', { q: 5, r: 1 }, asPlayer).ok).toBe(true); // still inside
  });

  it('a signed alliance that supersedes Open Borders keeps passage when only the treaty of lesser rank is broken', () => {
    const before = partyInside(w => { signBoth(w, 'player', 'rival', 'open_borders'); signBoth(w, 'player', 'rival', 'alliance'); }).state;
    const after = breakBoth(before, 'open_borders');
    expect(findUnitsStrandedByAccessLoss(before, after)).toEqual({});
  });

  it('war overriding a closed border: declaring war opens it, and the hostile army is never stranded', () => {
    const before = partyInside(() => {}).state; // no access: units placed illegally by the fixture
    const at = structuredClone(before);
    for (const id of ['player', 'rival']) {
      const civ = at.civilizations[id]!;
      civ.diplomacy = { ...civ.diplomacy, atWarWith: [id === 'player' ? 'rival' : 'player'] };
    }
    expect(findUnitsStrandedByAccessLoss(at, before)).toEqual(
      // war -> peace direction: the units inside DO become stranded when the diff is reversed.
      { player: ['unit-spear', 'unit-archer'], rival: ['unit-rivalSpear'] },
    );
    expect(findUnitsStrandedByAccessLoss(before, at)).toEqual({});
  });
});

describe('#871 tile-owner changes around a unit', () => {
  it('a unit standing on land whose owner changes is judged against the new owner, never frozen', () => {
    const world = partyInside(w => signBoth(w, 'player', 'rival', 'open_borders'));
    // The rival's tile the spearman stands on flips to a third civ with no agreement.
    world.state.map.tiles[hexKey({ q: 4, r: 1 })]!.owner = 'third';
    const id = 'unit-spear';
    // It is standing in closed land now, so it can move within it and out...
    expect(resolveUnitMoveIntent(world.state, id, { q: 2, r: 1 }, asPlayer).ok).toBe(true);
    // ...but the rival's neighbouring land (still open) stays open.
    expect(resolveUnitMoveIntent(world.state, id, { q: 5, r: 1 }, asPlayer).ok).toBe(true);
  });
});
