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
import { makeMajorPeace } from '@/systems/diplomacy-war';
import { resolveUnitMoveIntent, executeUnitMove } from '@/systems/unit-movement-system';
import { emitAccessLossNotices, findUnitsStrandedByAccessLoss } from '@/systems/territorial-access';
import { routeAccessLost } from '@/ui/notification-routing';
import {
  addUnit, asPlayer, makeTerritorialWorld, setWar, signBoth, type TerritorialWorld,
} from './helpers/territorial-fixture';

type Notice = { civId: string; message: string; kind: string };

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
