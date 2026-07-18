import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { foundReligion, chooseBoon } from '@/systems/religion-system';
import { makeReligionFixture } from './helpers/religion-fixture';

describe('#591 MR4 — foundReligion', () => {
  it('creates a religion, marks the building city as holy, and has the capital adopt it', () => {
    const { state, civId, capitalId, templeCity } = makeReligionFixture();
    const bus = new EventBus();
    const next = foundReligion(state, civId, templeCity, bus);
    const religionId = `religion-${civId}`;
    expect(next.religions![religionId]).toMatchObject({ ownerCivId: civId });
    expect(next.religions![religionId].boon).toBeUndefined();
    expect(next.cityFaith![templeCity]).toMatchObject({ religionId, isHolyCity: true });
    expect(next.cityFaith![capitalId]).toMatchObject({ religionId });
  });

  it('does not double-count the building city as both holy and capital when they are the same city', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const founded = foundReligion({ ...state, civilizations: { ...state.civilizations, [civId]: { ...state.civilizations[civId], cities: [templeCity] } } }, civId, templeCity, new EventBus());
    expect(founded.cityFaith![templeCity]).toMatchObject({ religionId: `religion-${civId}`, isHolyCity: true });
  });

  it('is a no-op if the civ already has a religion', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const bus = new EventBus();
    const founded = foundReligion(state, civId, templeCity, bus);
    const second = foundReligion(founded, civId, templeCity, bus);
    expect(second).toBe(founded);
  });

  it('picks a name from NAME_CANDIDATES deterministically by seed', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const a = foundReligion(state, civId, templeCity, new EventBus());
    const b = foundReligion(state, civId, templeCity, new EventBus());
    expect(a.religions![`religion-${civId}`].name).toBe(b.religions![`religion-${civId}`].name);
    expect(a.religions![`religion-${civId}`].name.length).toBeGreaterThan(0);
  });

  it('emits religion:founded exactly once', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('religion:founded', e => events.push(e));
    foundReligion(state, civId, templeCity, bus);
    expect(events).toHaveLength(1);
  });

  it('is a no-op for a nonexistent civ', () => {
    const { state, templeCity } = makeReligionFixture();
    const next = foundReligion(state, 'no-such-civ', templeCity, new EventBus());
    expect(next).toBe(state);
  });
});

describe('#591 MR4 — chooseBoon', () => {
  it('sets the boon on the owner\'s religion', () => {
    const { state, civId, templeCity } = makeReligionFixture();
    const founded = foundReligion(state, civId, templeCity, new EventBus());
    const next = chooseBoon(founded, `religion-${civId}`, 'serenity');
    expect(next.religions![`religion-${civId}`].boon).toBe('serenity');
  });

  it('is a no-op for a nonexistent religion id', () => {
    const { state } = makeReligionFixture();
    expect(chooseBoon(state, 'no-such-religion', 'tithes')).toBe(state);
  });
});
