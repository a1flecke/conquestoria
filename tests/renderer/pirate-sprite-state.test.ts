import { describe, expect, it } from 'vitest';
import {
  PirateSpriteStateController,
  derivePirateSpriteMode,
} from '@/renderer/pirate-sprite-state';

describe('PirateSpriteStateController', () => {
  it('expires attack and hurt one-shots back to the current persistent mode', () => {
    const controller = new PirateSpriteStateController();
    controller.apply({
      type: 'combat',
      attackerId: 'pirate-ship',
      defenderId: 'enemy',
      attackerSurvived: true,
      defenderSurvived: true,
    }, 1_000);

    expect(controller.resolve('pirate-ship', { mode: 'raid', damage: 0, tier: 2, stage: 3 }, 1_100))
      .toMatchObject({ state: 'attack', mode: 'raid' });
    expect(controller.resolve('enemy', { mode: 'patrol', damage: 2, tier: 1, stage: 2 }, 1_100))
      .toMatchObject({ state: 'hurt', damage: 2 });
    expect(controller.resolve('pirate-ship', { mode: 'blockade', damage: 1, tier: 3, stage: 3 }, 1_500))
      .toEqual({ state: 'idle', mode: 'blockade', damage: 1, tier: 3, stage: 3 });
  });

  it('keeps death visible longer than a hit and then removes the transient entry', () => {
    const controller = new PirateSpriteStateController();
    controller.apply({ type: 'destroyed', entityId: 'pirate-ship' }, 2_000);

    expect(controller.resolve('pirate-ship', { mode: 'raid', damage: 3, tier: 2, stage: 4 }, 3_100).state)
      .toBe('death');
    expect(controller.resolve('pirate-ship', { mode: 'raid', damage: 3, tier: 2, stage: 4 }, 3_300).state)
      .toBe('idle');
  });

  it('supports explicit headquarters counterfire and damage one-shots', () => {
    const controller = new PirateSpriteStateController();
    const persistent = { mode: 'blockade' as const, damage: 2 as const, tier: 3 as const, stage: 4 as const };

    controller.apply({ type: 'attack', entityId: 'pirate-4' }, 500);
    expect(controller.resolve('pirate-4', persistent, 600).state).toBe('attack');

    controller.apply({ type: 'hurt', entityId: 'pirate-4' }, 700);
    expect(controller.resolve('pirate-4', persistent, 800).state).toBe('hurt');
    expect(controller.resolve('pirate-4', persistent, 1_200).state).toBe('idle');
  });

  it('keeps relocation active only for the explicit relocation sequence', () => {
    const controller = new PirateSpriteStateController();
    controller.apply({ type: 'relocation-started', entityId: 'pirate-2' }, 0);

    expect(controller.resolve('pirate-2', { mode: 'patrol', damage: 0, tier: 1, stage: 2 }, 50))
      .toMatchObject({ state: 'walk', mode: 'relocating' });

    controller.apply({ type: 'relocation-finished', entityId: 'pirate-2' }, 100);
    expect(controller.resolve('pirate-2', { mode: 'raid', damage: 0, tier: 2, stage: 2 }, 101))
      .toEqual({ state: 'idle', mode: 'raid', damage: 0, tier: 2, stage: 2 });
  });

  it('derives persistent mode from current faction state rather than stale events', () => {
    expect(derivePirateSpriteMode({ behavior: 'patrolling', headquarters: { kind: 'coastal-enclave' } })).toBe('patrol');
    expect(derivePirateSpriteMode({ behavior: 'raiding', headquarters: { kind: 'coastal-enclave' } })).toBe('raid');
    expect(derivePirateSpriteMode({
      behavior: 'patrolling',
      headquarters: { kind: 'deep-sea-flotilla', relocation: { planned: { resolvesOnRound: 8 } } },
    })).toBe('relocating');
    expect(derivePirateSpriteMode({ behavior: 'blockading', headquarters: { kind: 'coastal-enclave' } })).toBe('blockade');
  });
});
