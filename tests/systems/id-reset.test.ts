import { describe, it, expect, beforeEach } from 'vitest';
import { createUnit, resetUnitId } from '@/systems/unit-system';
import { foundCity, resetCityId } from '@/systems/city-system';
import { spawnBarbarianCamp, resetCampId } from '@/systems/barbarian-system';
import { _resetSpyIdCounter } from '@/systems/espionage-system';
import { generateMap } from '@/systems/map-generator';

describe('ID counter reset between games', () => {
  beforeEach(() => {
    // Reset all counters before each test
    resetUnitId();
    resetCityId();
    resetCampId();
    _resetSpyIdCounter();
  });

  it('resetUnitId resets counter to 1', () => {
    // Create some units to advance the counter
    const unit1 = createUnit('warrior', 'player', { q: 0, r: 0 });
    const unit2 = createUnit('warrior', 'player', { q: 1, r: 0 });

    expect(unit1.id).toBe('unit-1');
    expect(unit2.id).toBe('unit-2');

    // Reset and verify counter restarts
    resetUnitId();

    const fresh = createUnit('warrior', 'player', { q: 0, r: 0 });
    expect(fresh.id).toBe('unit-1');
  });

  it('resetCityId resets counter to 1', () => {
    const map = generateMap(30, 30, 'test-seed');

    // Create some cities to advance the counter
    const city1 = foundCity('player', { q: 5, r: 5 }, map);
    const city2 = foundCity('player', { q: 10, r: 10 }, map);

    expect(city1.id).toBe('city-1');
    expect(city2.id).toBe('city-2');

    // Reset and verify counter restarts
    resetCityId();

    const fresh = foundCity('player', { q: 15, r: 15 }, map);
    expect(fresh.id).toBe('city-1');
  });

  it('resetCampId resets counter to 1', () => {
    const map = generateMap(30, 30, 'test-seed');

    // Create camps using spawnBarbarianCamp
    const camp1 = spawnBarbarianCamp(map, [{ q: 0, r: 0 }], [], 12345);
    const camp2 = spawnBarbarianCamp(map, [{ q: 0, r: 0 }], camp1 ? [camp1] : [], 12346);

    expect(camp1?.id).toBe('camp-1');
    expect(camp2?.id).toBe('camp-2');

    // Reset and verify counter restarts
    resetCampId();

    const fresh = spawnBarbarianCamp(map, [{ q: 0, r: 0 }], [], 12347);
    expect(fresh?.id).toBe('camp-1');
  });

  it('_resetSpyIdCounter is a no-op (spies now use unit IDs)', () => {
    // Spy IDs are now derived from unit IDs — _resetSpyIdCounter is kept for
    // backward compatibility but no longer advances a counter.
    expect(() => _resetSpyIdCounter()).not.toThrow();
  });

  it('all non-spy counters can be reset together', () => {
    // Advance all counters
    createUnit('warrior', 'player', { q: 0, r: 0 });
    createUnit('warrior', 'player', { q: 1, r: 0 });

    const map = generateMap(30, 30, 'test-seed');
    foundCity('player', { q: 5, r: 5 }, map);
    foundCity('player', { q: 10, r: 10 }, map);

    const camp = spawnBarbarianCamp(map, [{ q: 0, r: 0 }], [], 12345);
    if (camp) spawnBarbarianCamp(map, [{ q: 0, r: 0 }], [camp], 12346);

    // Reset all
    resetUnitId();
    resetCityId();
    resetCampId();
    _resetSpyIdCounter();

    // Verify all are back at 1
    const freshUnit = createUnit('warrior', 'player', { q: 0, r: 0 });
    const freshCity = foundCity('player', { q: 5, r: 5 }, map);
    const freshCamp = spawnBarbarianCamp(map, [{ q: 0, r: 0 }], [], 12347);

    expect(freshUnit.id).toBe('unit-1');
    expect(freshCity.id).toBe('city-1');
    expect(freshCamp?.id).toBe('camp-1');
  });
});
