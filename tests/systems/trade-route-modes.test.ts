import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import {
  RESEARCH_EXCHANGE_REQUIRED_TECH,
  TRADE_ROUTE_MODES,
  getRouteModeId,
  getTradeRouteMode,
  getTradeRouteModeEligibility,
} from '@/systems/trade-route-modes';

/**
 * #1504 MR07: the definition-driven route-mode catalog.
 *
 * The catalog is data plus one requirement predicate per mode, so these tests assert the *shape* of
 * the set (which recipients exist, which requirements each mode names) rather than re-stating game
 * rules the catalog itself owns.
 */
function makeState(overrides: { treaty?: boolean; tech?: string[] } = {}): GameState {
  const { treaty = true, tech = [] } = overrides;
  const treaties = treaty ? [{ type: 'trade_agreement', civA: 'alpha', civB: 'beta', turnsRemaining: -1 }] : [];
  const diplomacy = (self: string, other: string) => ({
    relationships: { [other]: 10 }, treaties, events: [], atWarWith: [], treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
  });
  const civ = (id: string, other: string, cityId: string) => ({
    id, name: id, color: '#888', isHuman: id === 'alpha', civType: 'generic', gold: 0,
    cities: [cityId], units: [],
    techState: { completed: [...tech], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
    diplomacy: diplomacy(id, other), knownCivilizations: [], visibility: { tiles: {}, fogMap: {} },
  });

  return {
    turn: 10, era: 1, currentPlayer: 'alpha',
    map: { tiles: {}, width: 20, height: 20, wrapsHorizontally: false, rivers: [] },
    cities: {
      'alpha-city': { id: 'alpha-city', name: 'Alpha', owner: 'alpha', position: { q: 0, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [], productionProgress: 0, food: 0 },
      'beta-city': { id: 'beta-city', name: 'Beta', owner: 'beta', position: { q: 3, r: 0 }, ownedTiles: [], workedTiles: [], buildings: [], productionQueue: [], productionProgress: 0, food: 0 },
    },
    civilizations: { alpha: civ('alpha', 'beta', 'alpha-city'), beta: civ('beta', 'alpha', 'beta-city') },
    units: {}, minorCivs: {}, barbarianCamps: {}, marketplace: undefined,
    settings: { mapSize: 'small', opponentCount: 1, advisorsEnabled: {}, councilTalkLevel: 'normal' },
  } as unknown as GameState;
}

const context = (state: GameState, destinationCityId: string) =>
  ({ state, ownerCivId: 'alpha', destinationCityId });

describe('#1504 MR07 — the route-mode catalog', () => {
  it('declares each mode with a recipient and a player-facing description', () => {
    expect(TRADE_ROUTE_MODES.map(mode => mode.id))
      .toEqual(['commerce', 'domestic-food', 'domestic-production', 'research-exchange']);
    for (const mode of TRADE_ROUTE_MODES) {
      expect(mode.label.length, `${mode.id} label`).toBeGreaterThan(0);
      expect(mode.description.length, `${mode.id} description`).toBeGreaterThan(0);
    }
  });

  it('names the real recipient of each mode, and only commerce prices itself from the quote', () => {
    expect(getTradeRouteMode('commerce')?.recipient).toBe('owner-treasury');
    expect(getTradeRouteMode('commerce')?.amountPerRound).toBeNull();
    expect(getTradeRouteMode('domestic-food')?.recipient).toBe('destination-city-food');
    expect(getTradeRouteMode('domestic-production')?.recipient).toBe('destination-city-production');
    expect(getTradeRouteMode('research-exchange')?.recipient).toBe('owner-research');
    expect(getTradeRouteMode('research-exchange')?.requiredTech).toBe(RESEARCH_EXCHANGE_REQUIRED_TECH);
  });

  it('treats a route with no recorded mode as ordinary commerce (a pre-MR07 save)', () => {
    expect(getRouteModeId({})).toBe('commerce');
    expect(getRouteModeId({ mode: 'domestic-food' })).toBe('domestic-food');
  });

  it('allows commerce for any destination', () => {
    const state = makeState();
    expect(getTradeRouteModeEligibility(context(state, 'alpha-city'), 'commerce').ok).toBe(true);
    expect(getTradeRouteModeEligibility(context(state, 'beta-city'), 'commerce').ok).toBe(true);
  });

  it('requires one of the owner’s own cities for provisioning', () => {
    const state = makeState();
    expect(getTradeRouteModeEligibility(context(state, 'alpha-city'), 'domestic-food')).toEqual({ ok: true });
    expect(getTradeRouteModeEligibility(context(state, 'alpha-city'), 'domestic-production')).toEqual({ ok: true });
    expect(getTradeRouteModeEligibility(context(state, 'beta-city'), 'domestic-food'))
      .toEqual({ ok: false, reason: 'domestic-destination-required' });
    expect(getTradeRouteModeEligibility(context(state, 'beta-city'), 'domestic-production'))
      .toEqual({ ok: false, reason: 'domestic-destination-required' });
  });

  it('requires a foreign destination, a commercial right AND the technology for research exchange', () => {
    // Conjunctive: each half alone is insufficient.
    const withAgreementNoTech = makeState({ treaty: true, tech: [] });
    expect(getTradeRouteModeEligibility(context(withAgreementNoTech, 'beta-city'), 'research-exchange'))
      .toEqual({ ok: false, reason: 'requires-technology' });
    expect(getTradeRouteModeEligibility(context(withAgreementNoTech, 'alpha-city'), 'research-exchange'))
      .toEqual({ ok: false, reason: 'foreign-destination-required' });

    const withTechNoAgreement = makeState({ treaty: false, tech: [RESEARCH_EXCHANGE_REQUIRED_TECH] });
    expect(getTradeRouteModeEligibility(context(withTechNoAgreement, 'beta-city'), 'research-exchange'))
      .toEqual({ ok: false, reason: 'no-commercial-agreement' });

    const both = makeState({ treaty: true, tech: [RESEARCH_EXCHANGE_REQUIRED_TECH] });
    expect(getTradeRouteModeEligibility(context(both, 'beta-city'), 'research-exchange')).toEqual({ ok: true });
  });

  it('refuses research exchange with a civilization it is at war with, even with the technology', () => {
    const state = makeState({ tech: [RESEARCH_EXCHANGE_REQUIRED_TECH] });
    state.civilizations.alpha.diplomacy.atWarWith = ['beta'];
    expect(getTradeRouteModeEligibility(context(state, 'beta-city'), 'research-exchange'))
      .toEqual({ ok: false, reason: 'at-war' });
  });
});
