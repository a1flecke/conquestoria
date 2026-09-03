import { describe, expect, it } from 'vitest';
import {
  PirateSpriteStateController,
  derivePirateSpriteMode,
} from '@/renderer/pirate-sprite-state';

describe('PirateSpriteStateController', () => {
  it('holds `attack` past a full 1.4s keyframe cycle, then expires both one-shots (#916)', () => {
    const controller = new PirateSpriteStateController();
    controller.apply({
      type: 'combat',
      attackerId: 'pirate-ship',
      defenderId: 'enemy',
      attackerSurvived: true,
      defenderSurvived: true,
    }, 1_000);

    // Attacker stays in `attack` well past the 1.4s v2 attack cycle so the
    // anticipation -> strike -> hold -> recover animation actually plays (#916).
    expect(controller.resolve('pirate-ship', { mode: 'raid', damage: 0, tier: 2, stage: 3 }, 2_400))
      .toMatchObject({ state: 'attack', mode: 'raid' });
    // `hurt` is a short 0.55s one-shot -- it does not linger as long as `attack`.
    expect(controller.resolve('enemy', { mode: 'patrol', damage: 2, tier: 1, stage: 2 }, 1_100))
      .toMatchObject({ state: 'hurt', damage: 2 });
    expect(controller.resolve('enemy', { mode: 'patrol', damage: 2, tier: 1, stage: 2 }, 1_800))
      .toEqual({ state: 'idle', mode: 'patrol', damage: 2, tier: 1, stage: 2 });
    expect(controller.resolve('pirate-ship', { mode: 'blockade', damage: 1, tier: 3, stage: 3 }, 2_600))
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
    // still animating well past a 1.4s cycle
    expect(controller.resolve('pirate-4', persistent, 1_900).state).toBe('attack');

    controller.apply({ type: 'hurt', entityId: 'pirate-4' }, 2_100);
    expect(controller.resolve('pirate-4', persistent, 2_200).state).toBe('hurt');
    expect(controller.resolve('pirate-4', persistent, 2_900).state).toBe('idle');
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

describe('resolveTransientState', () => {
  it('returns idle when there is no transient for the entity', () => {
    const controller = new PirateSpriteStateController();
    expect(controller.resolveTransientState('nobody', 0)).toBe('idle');
  });

  it('returns attack/hurt for a combat pair with no pirate-only persistent fields required', () => {
    const controller = new PirateSpriteStateController();
    controller.apply({
      type: 'combat',
      attackerId: 'rifleman-1',
      defenderId: 'musketeer-2',
      attackerSurvived: true,
      defenderSurvived: true,
    }, 1_000);

    expect(controller.resolveTransientState('rifleman-1', 1_100)).toBe('attack');
    expect(controller.resolveTransientState('musketeer-2', 1_100)).toBe('hurt');
  });

  it('expires back to idle and deletes the transient once its window passes', () => {
    const controller = new PirateSpriteStateController();
    controller.apply({
      type: 'combat',
      attackerId: 'rifleman-1',
      defenderId: 'musketeer-2',
      attackerSurvived: true,
      defenderSurvived: false,
    }, 1_000);

    // defender died -- death lasts DEATH_STATE_MS (1200ms), not HURT_STATE_MS (700ms)
    expect(controller.resolveTransientState('musketeer-2', 1_500)).toBe('death');
    expect(controller.resolveTransientState('musketeer-2', 2_300)).toBe('idle');
  });

  it('supports a work one-shot (e.g. a trade unit delivering goods) that expires back to idle', () => {
    const controller = new PirateSpriteStateController();
    controller.apply({ type: 'work', entityId: 'merchant-wagon-1' }, 1_000);

    expect(controller.resolveTransientState('merchant-wagon-1', 1_100)).toBe('work');
    expect(controller.resolveTransientState('merchant-wagon-1', 1_000 + 10_000)).toBe('idle');
  });
});
