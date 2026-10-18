// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import type { CommercePermissionsState } from '@/core/types/commerce';
import {
  COMMERCE_PASSAGE_DENIAL_MESSAGES,
  createCommercePermissionsState,
  getCommercialPassagePermission,
  grantResourceExport,
  hasResourceExportGrant,
  hasRouteOnlyAllowance,
  pruneExpiredRouteAllowances,
  getResourceExportGrants,
  recordRouteOnlyAllowance,
  revokeResourceExport,
} from '@/systems/commerce-permissions';
import { commitTreatyAgreement, breakTreaty } from '@/systems/diplomacy-treaties';
import { enqueueTreatyProposal, getPendingTreatyProposalsFor } from '@/systems/diplomacy-requests';
import { migrateCommercePermissions } from '@/storage/migrations/steps/commerce-permissions';
import { EventBus } from '@/core/event-bus';

/**
 * Minimal state for the passenger-permission rules: two major civs with a metropolis each, one
 * minor city-state, and optional treaties / war / embargo. Only the fields the rules read are set.
 */
function makeState(overrides: {
  treaty?: 'trade_agreement' | 'open_borders';
  atWar?: boolean;
  embargoed?: boolean;
  majorCities?: boolean;
  minorRelationship?: number | null;
  minorAtWar?: boolean;
} = {}): GameState {
  const {
    treaty,
    atWar = false,
    embargoed = false,
    majorCities = true,
    minorRelationship = 0,
    minorAtWar = false,
  } = overrides;

  const treaties = treaty
    ? [{ type: treaty, civA: 'alpha', civB: 'beta', turnsRemaining: -1 }]
    : [];

  const diplomacy = (self: string, other: string, score: number) => ({
    relationships: { [other]: score },
    treaties: treaties.filter(t => t.civA === self || t.civB === self),
    events: [],
    atWarWith: atWar ? [other] : [],
    treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
  });

  const cities: Record<string, unknown> = {};
  if (majorCities) {
    cities['alpha-city'] = { id: 'alpha-city', owner: 'alpha', position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [] };
    cities['beta-city'] = { id: 'beta-city', owner: 'beta', position: { q: 3, r: 0 }, ownedTiles: [], workedTiles: [] };
  }
  cities['minor-city'] = { id: 'minor-city', owner: 'mc-sparta', position: { q: 6, r: 0 }, ownedTiles: [], workedTiles: [] };

  return {
    turn: 10,
    currentPlayer: 'alpha',
    cities,
    map: { tiles: {}, width: 20, height: 20, wrapsHorizontally: false, rivers: [] },
    minorCivs: minorRelationship === null ? {} : {
      'mc-sparta': {
        id: 'mc-sparta', definitionId: 'sparta', cityId: 'minor-city', units: [],
        diplomacy: { ...diplomacy('mc-sparta', 'alpha', minorRelationship), atWarWith: minorAtWar ? ['alpha'] : [] },
        activeQuests: {}, chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
        isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
      },
    },
    embargoes: embargoed
      ? [{ id: 'e1', targetCivId: 'beta', participants: ['alpha'], createdOnTurn: 1, turnsRemaining: 5 }]
      : [],
    civilizations: {
      alpha: {
        id: 'alpha', cities: majorCities ? ['alpha-city'] : [], units: [], gold: 100,
        diplomacy: diplomacy('alpha', 'beta', 10),
        knownCivilizations: ['beta'],
        visibility: { tiles: {}, fogMap: {} },
        techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
      },
      beta: {
        id: 'beta', cities: majorCities ? ['beta-city'] : [], units: [], gold: 100,
        diplomacy: diplomacy('beta', 'alpha', 10),
        knownCivilizations: ['alpha'],
        visibility: { tiles: {}, fogMap: {} },
        techState: { completed: ['trade-routes'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
      },
    },
  } as unknown as GameState;
}

describe('getCommercialPassagePermission', () => {
  it('allows a signed trade agreement between its parties', () => {
    expect(getCommercialPassagePermission(makeState({ treaty: 'trade_agreement' }), 'alpha', 'beta'))
      .toEqual({ allowed: true });
  });

  it('does not allow commerce over military open borders alone', () => {
    const decision = getCommercialPassagePermission(makeState({ treaty: 'open_borders' }), 'alpha', 'beta');
    expect(decision).toEqual({ allowed: false, reason: 'no-commercial-agreement' });
  });

  it('does not allow commerce between parties with no agreement', () => {
    expect(getCommercialPassagePermission(makeState(), 'alpha', 'beta'))
      .toEqual({ allowed: false, reason: 'no-commercial-agreement' });
  });

  it('denies commerce at war even when an agreement is recorded', () => {
    expect(getCommercialPassagePermission(makeState({ treaty: 'trade_agreement', atWar: true }), 'alpha', 'beta'))
      .toEqual({ allowed: false, reason: 'at-war' });
  });

  it('denies commerce through a live embargo between the parties', () => {
    expect(getCommercialPassagePermission(makeState({ treaty: 'trade_agreement', embargoed: true }), 'alpha', 'beta'))
      .toEqual({ allowed: false, reason: 'embargoed' });
  });

  it('denies commerce with a partner that no longer holds territory', () => {
    expect(getCommercialPassagePermission(makeState({ treaty: 'trade_agreement', majorCities: false }), 'alpha', 'beta'))
      .toEqual({ allowed: false, reason: 'partner-eliminated' });
  });

  it('always allows a civilization to trade with itself (domestic)', () => {
    expect(getCommercialPassagePermission(makeState(), 'alpha', 'alpha')).toEqual({ allowed: true });
  });

  it('allows a minor civilization its own contact and relationship model, with no major-civ treaty', () => {
    // No trade agreement exists anywhere in this state; a friendly city-state is still tradable.
    expect(getCommercialPassagePermission(makeState({ minorRelationship: 5 }), 'alpha', 'mc-sparta'))
      .toEqual({ allowed: true });
  });

  it('denies a hostile minor civilization and one that is at war', () => {
    expect(getCommercialPassagePermission(makeState({ minorRelationship: -1 }), 'alpha', 'mc-sparta'))
      .toEqual({ allowed: false, reason: 'minor-civ-unavailable' });
    expect(getCommercialPassagePermission(makeState({ minorRelationship: 5, minorAtWar: true }), 'alpha', 'mc-sparta'))
      .toEqual({ allowed: false, reason: 'at-war' });
  });

  it('publishes copy for every denial reason', () => {
    for (const reason of Object.keys(COMMERCE_PASSAGE_DENIAL_MESSAGES)) {
      expect(COMMERCE_PASSAGE_DENIAL_MESSAGES[reason as keyof typeof COMMERCE_PASSAGE_DENIAL_MESSAGES].length).toBeGreaterThan(0);
    }
  });

  it('is directional evidence only: an agreement with beta does not open commerce to a third party', () => {
    // alpha<->beta agreement must not open alpha<->gamma commerce for a third major civ.
    const state = makeState({ treaty: 'trade_agreement' });
    state.civilizations.gamma = { ...state.civilizations.beta, id: 'gamma' } as never;
    state.cities['gamma-city'] = {
      id: 'gamma-city', owner: 'gamma', position: { q: 9, r: 0 }, ownedTiles: [], workedTiles: [],
    } as never;

    expect(getCommercialPassagePermission(state, 'alpha', 'gamma'))
      .toEqual({ allowed: false, reason: 'no-commercial-agreement' });
  });
});

describe('directional strategic-resource export grants (data model only in MR02)', () => {
  it('defaults closed: nothing is exportable until granted', () => {
    const state = makeState();
    expect(hasResourceExportGrant(state, 'alpha', 'beta', 'iron')).toBe(false);
    expect(getResourceExportGrants(state, 'alpha')).toEqual([]);
  });

  it('grants and revokes one direction only', () => {
    const granted = grantResourceExport(makeState(), 'alpha', 'beta', 'iron');

    expect(hasResourceExportGrant(granted, 'alpha', 'beta', 'iron')).toBe(true);
    expect(getResourceExportGrants(granted, 'alpha')).toEqual([
      { grantorCivId: 'alpha', granteeCivId: 'beta', resource: 'iron' },
    ]);
    // The mirror direction is a separate grant nobody made.
    expect(hasResourceExportGrant(granted, 'beta', 'alpha', 'iron')).toBe(false);

    const revoked = revokeResourceExport(granted, 'alpha', 'beta', 'iron');
    expect(hasResourceExportGrant(revoked, 'alpha', 'beta', 'iron')).toBe(false);
  });

  it('is idempotent: granting or revoking twice changes nothing further', () => {
    const once = grantResourceExport(makeState(), 'alpha', 'beta', 'iron');
    const twice = grantResourceExport(once, 'alpha', 'beta', 'iron');
    expect(getResourceExportGrants(twice, 'alpha')).toHaveLength(1);
    expect(revokeResourceExport(once, 'beta', 'alpha', 'iron')).toBe(once);
  });

  it('ships a new-game default with no grants and no allowances', () => {
    const fresh: CommercePermissionsState = createCommercePermissionsState();
    expect(fresh).toEqual({ resourceExportGrants: [], routeAllowances: [] });
  });
});

describe('legacy route-only transition allowances', () => {
  it('records one allowance per route and reads it back', () => {
    const state = recordRouteOnlyAllowance(makeState(), 'route-1', 'alpha', 3);

    expect(hasRouteOnlyAllowance(state, 'route-1', 'alpha')).toBe(true);
    expect(state.commercePermissions?.routeAllowances).toEqual([
      { routeId: 'route-1', civId: 'alpha', grantedOnTurn: 10, expiresOnTurn: 13 },
    ]);
  });

  it('expires at the recorded boundary and is then pruned', () => {
    const state = recordRouteOnlyAllowance(makeState(), 'route-1', 'alpha', 3);

    // One turn before the boundary the allowance still covers the running route.
    const before = { ...state, turn: 12 };
    expect(hasRouteOnlyAllowance(before, 'route-1', 'alpha')).toBe(true);

    const expired = { ...state, turn: 13 };
    expect(hasRouteOnlyAllowance(expired, 'route-1', 'alpha')).toBe(false);
    expect(pruneExpiredRouteAllowances(expired).commercePermissions?.routeAllowances).toEqual([]);
  });

  it('never covers a different route id, so it cannot authorize a new assignment', () => {
    const state = recordRouteOnlyAllowance(makeState(), 'route-1', 'alpha', 3);
    expect(hasRouteOnlyAllowance(state, 'route-2', 'alpha')).toBe(false);
  });

  it('reload does not refresh the allowance: a serialized copy keeps the same expiry', () => {
    const state = recordRouteOnlyAllowance(makeState(), 'route-1', 'alpha', 3);
    const reloaded = JSON.parse(JSON.stringify(state)) as GameState;

    expect(reloaded.commercePermissions?.routeAllowances).toEqual(state.commercePermissions?.routeAllowances);
    expect(hasRouteOnlyAllowance({ ...reloaded, turn: 13 }, 'route-1', 'alpha')).toBe(false);
  });
});

describe('consent is recipient-owned (#1499 MR02 acceptance cases)', () => {
  it('an unanswered proposal grants nothing: no agreement, so no commerce', () => {
    const proposed = enqueueTreatyProposal(makeState(), 'alpha', 'beta', 'trade_agreement', -1);

    // The request is pending and neither side has the treaty yet.
    expect(getPendingTreatyProposalsFor(proposed, 'beta')).toHaveLength(1);
    expect(getCommercialPassagePermission(proposed, 'alpha', 'beta'))
      .toEqual({ allowed: false, reason: 'no-commercial-agreement' });
  });

  it('an AI proposal cannot force a human recipient to accept', () => {
    // beta is the human recipient; the AI only queues a request. Only beta's own commit signs it.
    const proposed = enqueueTreatyProposal(makeState(), 'alpha', 'beta', 'trade_agreement', -1);

    expect(proposed.civilizations.alpha.diplomacy.treaties).toEqual([]);
    expect(proposed.civilizations.beta.diplomacy.treaties).toEqual([]);
    expect(getCommercialPassagePermission(proposed, 'alpha', 'beta').allowed).toBe(false);
  });

  it('the recipient committing the agreement is what grants commerce', () => {
    const proposed = enqueueTreatyProposal(makeState(), 'alpha', 'beta', 'trade_agreement', -1);
    const signed = commitTreatyAgreement(proposed, 'alpha', 'beta', 'trade_agreement', new EventBus());

    expect(getCommercialPassagePermission(signed, 'alpha', 'beta')).toEqual({ allowed: true });
    // The pending request is consumed, not left behind.
    expect(getPendingTreatyProposalsFor(signed, 'beta')).toHaveLength(0);
  });

  it('hot seat: each recipient sees only the requests addressed to them', () => {
    const state = makeState();
    state.civilizations.gamma = { ...state.civilizations.beta, id: 'gamma' } as never;

    // beta and gamma each get their own trade-agreement offer from alpha.
    let next = enqueueTreatyProposal(state, 'alpha', 'beta', 'trade_agreement', -1);
    next = enqueueTreatyProposal(next, 'alpha', 'gamma', 'trade_agreement', -1);

    expect(getPendingTreatyProposalsFor(next, 'beta').map(r => r.toCivId)).toEqual(['beta']);
    expect(getPendingTreatyProposalsFor(next, 'gamma').map(r => r.toCivId)).toEqual(['gamma']);
    expect(getPendingTreatyProposalsFor(next, 'alpha')).toEqual([]);
  });

  it('revoking the agreement updates permission through the canonical treaty owner', () => {
    const signed = commitTreatyAgreement(
      enqueueTreatyProposal(makeState(), 'alpha', 'beta', 'trade_agreement', -1),
      'alpha', 'beta', 'trade_agreement', new EventBus(),
    );
    expect(getCommercialPassagePermission(signed, 'alpha', 'beta').allowed).toBe(true);

    const revoked: GameState = {
      ...signed,
      civilizations: {
        ...signed.civilizations,
        alpha: {
          ...signed.civilizations.alpha,
          diplomacy: breakTreaty(signed.civilizations.alpha.diplomacy, 'beta', 'trade_agreement', signed.turn),
        },
        beta: {
          ...signed.civilizations.beta,
          diplomacy: breakTreaty(signed.civilizations.beta.diplomacy, 'alpha', 'trade_agreement', signed.turn),
        },
      },
    };

    expect(getCommercialPassagePermission(revoked, 'alpha', 'beta'))
      .toEqual({ allowed: false, reason: 'no-commercial-agreement' });
  });
});

describe('migrateCommercePermissions (#1499 MR02, schema 33)', () => {
  function preMigrationState(): GameState {
    const state = makeState();
    return {
      ...state,
      commercePermissions: undefined,
      marketplace: {
        prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0,
        purchasedResources: [],
        tradeRoutes: [
          { id: 'route-1', fromCityId: 'alpha-city', toCityId: 'beta-city', goldPerTrip: 10, turnsPerTrip: 3, foreignCivId: 'beta' },
          { id: 'route-2', fromCityId: 'alpha-city', toCityId: 'alpha-city', goldPerTrip: 4, turnsPerTrip: 1 },
        ],
      },
    } as unknown as GameState;
  }

  it('records one allowance for each existing foreign route and none for a domestic one', () => {
    const migrated = migrateCommercePermissions(preMigrationState());

    expect(migrated.commercePermissions?.routeAllowances).toEqual([
      { routeId: 'route-1', civId: 'alpha', grantedOnTurn: 10, expiresOnTurn: 13 },
    ]);
  });

  it('reading the migrated save back does not refresh the allowance (no second grant)', () => {
    const migrated = migrateCommercePermissions(preMigrationState());
    // A reload at a later turn re-runs nothing for a save already at schema 33; running the step
    // again must also be a no-op rather than extending the boundary.
    const again = migrateCommercePermissions({ ...migrated, turn: 11 });

    expect(again.commercePermissions?.routeAllowances).toEqual(migrated.commercePermissions?.routeAllowances);
  });
});
