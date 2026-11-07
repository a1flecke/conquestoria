import { describe, expect, it } from 'vitest';
import { hexKey } from '@/systems/hex-utils';
import * as fixtures from './helpers/minor-civ-scenario-fixtures';
import type { MinorCivFixture } from './helpers/minor-civ-scenario-fixtures';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';

/**
 * #1648: every shared scenario fixture must be a legal game at construction. The allied fixture used
 * to start with a city-state garrison on a barbarian-camp tile (the no-illegal-blocking-occupancy
 * invariant), because game creation placed city-states without looking at the camps it had already
 * placed. Consumers that only assert "no NEW violations" hid that.
 */

type Builder = (seed: string) => MinorCivFixture;

// fixtureCoalitionMember has its own medium map; the rest are single-seed builders. All are valid worlds,
// none is an intentionally malformed negative fixture.
const BUILDERS: Array<[string, Builder]> = Object.entries(fixtures)
  .filter(([name]) => name.startsWith('fixture'))
  .map(([name, build]) => [name, build as Builder]);

// The exact seeds the two consumers use, so a regression names the real failing pair.
const CONSUMER_SEEDS = (name: string): string[] => [`mc-949-${name}`, `graduation-${name}`];
const SWEEP_SEEDS = Array.from({ length: 24 }, (_, i) => `fixture-legal-${i}`);

describe('minor-civ scenario fixtures are valid at creation (#1648)', () => {
  for (const [name, build] of BUILDERS) {
    it(`${name}: the whole shared invariant set holds before any turn runs`, () => {
      for (const seed of [...CONSUMER_SEEDS(name), ...SWEEP_SEEDS]) {
        const { state } = build(seed);
        expect(() => assertSaveStateInvariants(state, `${name} @ ${seed}`), `${name} @ ${seed}`).not.toThrow();
      }
    });
  }

  it('no unit of any owner starts on a barbarian-camp tile, and every camp is on a real tile', () => {
    for (const seed of SWEEP_SEEDS) {
      const { state } = fixtures.fixtureAlliedWithMajor(seed);
      const campKeys = new Set(Object.values(state.barbarianCamps).map(camp => hexKey(camp.position)));
      expect(campKeys.size, seed).toBe(Object.keys(state.barbarianCamps).length);
      for (const camp of Object.values(state.barbarianCamps)) {
        expect(state.map.tiles[hexKey(camp.position)], `${seed} ${camp.id}`).toBeDefined();
      }
      for (const unit of Object.values(state.units)) {
        expect(campKeys.has(hexKey(unit.position)), `${seed} ${unit.id}`).toBe(false);
      }
    }
  });

  it('the allied fixture is still a real allied city-state: garrisoned, owned, allied and friendly', () => {
    const { state, minorCivId } = fixtures.fixtureAlliedWithMajor('mc-949-allied city-state (major-civ ally)');
    const minorCiv = state.minorCivs[minorCivId]!;
    const city = state.cities[minorCiv.cityId]!;
    expect(city.owner).toBe(minorCivId);
    expect(minorCiv.definitionId).toBe('carthage');
    expect(minorCiv.diplomacy.relationships.player).toBe(65);
    expect(minorCiv.chainStatusByCiv.player?.status).toBe('allied');
    expect(minorCiv.units.length).toBeGreaterThan(0);
    for (const unitId of minorCiv.units) {
      const unit = state.units[unitId]!;
      expect(unit.owner).toBe(minorCivId);
      expect(hexKey(unit.position)).toBe(hexKey(city.position));
    }
    expect(Object.keys(state.barbarianCamps).length).toBeGreaterThan(0);
  });
});
