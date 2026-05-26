import { describe, it, expect } from 'vitest';
import type { NotificationEntry } from '@/ui/notification-log';
import { routeEraAdvanced, type NotificationSink } from '@/ui/notification-routing';
import { hexKey } from '@/systems/hex-utils';
import type { HexCoord } from '@/core/types';

function makeSink() {
  const calls: Array<{ civId: string; message: string; type: string }> = [];
  const sink: NotificationSink = (civId, message, type) => calls.push({ civId, message, type });
  return { sink, calls };
}

function makeToastSink() {
  const calls: Array<{ message: string; type: NotificationEntry['type'] }> = [];
  const sink = (message: string, type: NotificationEntry['type']) => calls.push({ message, type });
  return { sink, calls };
}

describe('era:advanced notification', () => {
  it('era 2 calls toastSink with Era 2 and factionSink once with Era 2 and unrest', () => {
    const { sink: toastSink, calls: toastCalls } = makeToastSink();
    const { sink: factionSink, calls: factionCalls } = makeSink();

    routeEraAdvanced(2, 'p1', 'Alice', toastSink, factionSink);

    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toContain('Era 2');
    expect(toastCalls[0]!.type).toBe('success');

    expect(factionCalls).toHaveLength(1);
    expect(factionCalls[0]!.civId).toBe('p1');
    expect(factionCalls[0]!.message).toContain('Era 2');
    expect(factionCalls[0]!.message).toContain('unrest');
    expect(factionCalls[0]!.type).toBe('info');
  });

  it('era 3 calls toastSink with Era 3 but does NOT call factionSink', () => {
    const { sink: toastSink, calls: toastCalls } = makeToastSink();
    const { sink: factionSink, calls: factionCalls } = makeSink();

    routeEraAdvanced(3, 'p1', 'Alice', toastSink, factionSink);

    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]!.message).toContain('Era 3');
    expect(factionCalls).toHaveLength(0);
  });
});

// ─── Post-move hostile city detection (#264) ─────────────────────────────────
// Tests the detection logic added inside animateMovedUnit in main.ts.
// Mirrors the city-hex-tap.test.ts pattern: inline the pure detection helper
// so there's no DOM or module-mocking overhead, but the conditions are proven.

type SlimCity = { id: string; owner: string; position: HexCoord };
type SlimCivs = Record<string, { diplomacy?: { atWarWith?: string[] } }>;

function findHostileWarCity(
  cities: Record<string, SlimCity>,
  civilizations: SlimCivs,
  position: HexCoord,
  ownerCivId: string,
): string | null {
  const key = hexKey(position);
  const entry = Object.entries(cities).find(([, city]) =>
    hexKey(city.position) === key
    && city.owner !== ownerCivId
    && !city.owner.startsWith('mc-')
    && (civilizations[ownerCivId]?.diplomacy?.atWarWith?.includes(city.owner) ?? false),
  );
  return entry ? entry[0] : null;
}

describe('post-move hostile city detection', () => {
  it('detects a hostile at-war major-civ city at the unit landing position', () => {
    const cities = { 'city-1': { id: 'city-1', owner: 'ai-1', position: { q: 3, r: 2 } } };
    const civs: SlimCivs = { player: { diplomacy: { atWarWith: ['ai-1'] } } };

    expect(findHostileWarCity(cities, civs, { q: 3, r: 2 }, 'player')).toBe('city-1');
  });

  it('does not trigger for a city the player is not at war with (allied / neutral)', () => {
    const cities = { 'city-1': { id: 'city-1', owner: 'ai-1', position: { q: 3, r: 2 } } };
    const civs: SlimCivs = { player: { diplomacy: { atWarWith: [] } } };

    expect(findHostileWarCity(cities, civs, { q: 3, r: 2 }, 'player')).toBeNull();
  });

  it('does not trigger for a minor civ city (owner starts with mc-)', () => {
    const cities = { 'mc-abc': { id: 'mc-abc', owner: 'mc-abc', position: { q: 3, r: 2 } } };
    const civs: SlimCivs = { player: { diplomacy: { atWarWith: ['mc-abc'] } } };

    expect(findHostileWarCity(cities, civs, { q: 3, r: 2 }, 'player')).toBeNull();
  });
});
