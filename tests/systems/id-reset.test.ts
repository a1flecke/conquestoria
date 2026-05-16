import { describe, it, expect, beforeEach } from 'vitest';
import { createUnit, resetUnitId, syncUnitIdCounter } from '@/systems/unit-system';
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

describe('syncUnitIdCounter — save/load ID collision prevention', () => {
  beforeEach(() => {
    resetUnitId();
  });

  it('createUnit collides with existing units when counter is not synced after load', () => {
    // Simulate a game session: create units (advances counter to 4)
    const existing1 = createUnit('warrior', 'player', { q: 0, r: 0 });
    const existing2 = createUnit('settler', 'player', { q: 1, r: 0 });
    const existing3 = createUnit('warrior', 'ai-1', { q: 5, r: 5 });
    expect(existing1.id).toBe('unit-1');
    expect(existing2.id).toBe('unit-2');
    expect(existing3.id).toBe('unit-3');

    // Simulate page reload: module re-imports reset counter to 1
    resetUnitId();

    // Without syncUnitIdCounter, the next createUnit reuses unit-1 — collision
    const colliding = createUnit('warrior', 'player', { q: 2, r: 0 });
    expect(colliding.id).toBe('unit-1'); // proves the counter restarted

    // The collision means unit-1 would silently overwrite the existing warrior
    const existingIds = new Set([existing1.id, existing2.id, existing3.id]);
    expect(existingIds.has(colliding.id)).toBe(true); // THIS IS THE BUG
  });

  it('syncUnitIdCounter advances counter past all existing unit IDs so new units never collide', () => {
    // Simulate existing save state: units created during prior session
    const existingUnits: Record<string, ReturnType<typeof createUnit>> = {};
    for (let i = 0; i < 5; i++) {
      const u = createUnit('warrior', 'player', { q: i, r: 0 });
      existingUnits[u.id] = u;
    }
    // existing IDs: unit-1 … unit-5, counter is now at 6

    // Simulate page reload
    resetUnitId();

    // Call syncUnitIdCounter with the loaded state's units — should fast-forward counter
    syncUnitIdCounter(existingUnits);

    // All new units must have IDs not present in the existing save
    const newUnit1 = createUnit('warrior', 'player', { q: 10, r: 0 });
    const newUnit2 = createUnit('settler', 'player', { q: 11, r: 0 });

    const existingIds = new Set(Object.keys(existingUnits));
    expect(existingIds.has(newUnit1.id)).toBe(false);
    expect(existingIds.has(newUnit2.id)).toBe(false);

    // And they must be sequentially after the highest existing ID
    expect(newUnit1.id).toBe('unit-6');
    expect(newUnit2.id).toBe('unit-7');
  });

  it('syncUnitIdCounter handles non-sequential and large IDs from long play sessions', () => {
    // Simulate a loaded game where the highest unit ID is unit-847
    // (gaps are fine — the counter just needs to exceed the max)
    const highIdUnit = { id: 'unit-847', type: 'warrior', owner: 'player', position: { q: 0, r: 0 } };
    const lowIdUnit  = { id: 'unit-3',   type: 'warrior', owner: 'player', position: { q: 1, r: 0 } };
    const loadedUnits = {
      'unit-847': highIdUnit,
      'unit-3':   lowIdUnit,
    } as Record<string, { id: string }>;

    syncUnitIdCounter(loadedUnits);

    const newUnit = createUnit('scout', 'player', { q: 5, r: 5 });
    expect(newUnit.id).toBe('unit-848');
    expect(Object.keys(loadedUnits).includes(newUnit.id)).toBe(false);
  });

  it('syncUnitIdCounter is a no-op on an empty units map', () => {
    syncUnitIdCounter({});
    const u = createUnit('warrior', 'player', { q: 0, r: 0 });
    expect(u.id).toBe('unit-1');
  });

  it('syncUnitIdCounter ignores unit IDs that do not match the unit-N pattern', () => {
    const alienUnits = {
      'barbarian-warrior-1': { id: 'barbarian-warrior-1' },
      'mc-unit-xyz':         { id: 'mc-unit-xyz' },
    } as Record<string, { id: string }>;

    syncUnitIdCounter(alienUnits);

    // Counter should remain at 1 — no numeric IDs found
    const u = createUnit('warrior', 'player', { q: 0, r: 0 });
    expect(u.id).toBe('unit-1');
  });
});
