import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CivilizationEvents } from '@/core/types/events-civilization';
import type { DiplomacyEvents } from '@/core/types/events-diplomacy';
import type { SessionEvents } from '@/core/types/events-session';
import type { WorldEvents } from '@/core/types/events-world';
import type { GameEvents } from '@/core/types';
import { EventBus } from '@/core/event-bus';

/**
 * #1361 — `GameEvents` is composed from domain event families (`types/events-*.ts`) plus the residual keys whose
 * payloads still depend on entities that live in the barrel. The composition must not rename, drop, duplicate or
 * retype an event: the bus contract is unchanged.
 */
const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const FAMILY_FILES = ['events-diplomacy', 'events-civilization', 'events-world', 'events-session'] as const;

/** Event keys declared at the top level of every `interface X { 'a:b': … }` in a source text. */
function eventKeys(source: string): string[] {
  return [...source.matchAll(/^ {2}'([^']+)':/gm)].map(match => match[1]);
}
function barrelGameEventsBody(source: string): string {
  const start = source.indexOf('export interface GameEvents');
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end);
}

describe('GameEvents composition (#1361)', () => {
  const barrelKeys = eventKeys(barrelGameEventsBody(read('src/core/types.ts')));
  const familyKeys = FAMILY_FILES.flatMap(file => eventKeys(read(`src/core/types/${file}.ts`)));
  const all = [...barrelKeys, ...familyKeys];
  const pinned = read('tests/core/fixtures/game-event-keys.txt').trim().split('\n');

  it('every event key is declared exactly once across the families and the residual', () => {
    const seen = new Set<string>();
    const duplicates = all.filter(key => (seen.has(key) ? true : (seen.add(key), false)));
    expect(duplicates).toEqual([]);
  });

  it('the composed key set equals the pre-composition set (no event renamed, dropped or added)', () => {
    expect([...all].sort()).toEqual(pinned);
  });

  it('the families actually own events and the barrel residual shrank', () => {
    for (const file of FAMILY_FILES) expect(eventKeys(read(`src/core/types/${file}.ts`)).length, file).toBeGreaterThan(0);
    expect(barrelKeys.length).toBeLessThan(pinned.length / 2 + 20);
  });

  it('family modules import leaves, never the compatibility barrel', () => {
    for (const file of [...FAMILY_FILES, 'world'] as const) {
      expect(read(`src/core/types/${file}.ts`), file).not.toMatch(/from\s+'(?:@\/core\/types|\.\.\/types|\.\/\.\.\/types)'/);
    }
  });

  it('EventBus payload inference is unchanged (compile-time)', () => {
    // Each family key resolves through the aggregate to the very same payload type.
    type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
    const checks: [
      Same<GameEvents['diplomacy:war-declared'], DiplomacyEvents['diplomacy:war-declared']>,
      Same<GameEvents['pirate:faction-spawned'], WorldEvents['pirate:faction-spawned']>,
      Same<GameEvents['turn:start'], SessionEvents['turn:start']>,
      Same<GameEvents['supply:warning'], CivilizationEvents['supply:warning']>,
      Same<keyof DiplomacyEvents, Extract<keyof GameEvents, keyof DiplomacyEvents>>,
    ] = [true, true, true, true, true];
    expect(checks.every(Boolean)).toBe(true);

    const bus = new EventBus();
    const received: number[] = [];
    bus.on('turn:start', payload => received.push(payload.turn));
    bus.emit('turn:start', { turn: 7, playerId: 'p1' });
    expect(received).toEqual([7]);
  });
});
