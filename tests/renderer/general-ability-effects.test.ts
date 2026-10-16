import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, Unit } from '@/core/types';
import { Camera } from '@/renderer/camera';
import {
  drawGeneralAbilityEffect,
  drawLastStandHoldMarkers,
  GENERAL_ABILITY_EFFECT_TYPES,
  isGeneralAbilityEffect,
  type GeneralAbilityEffectType,
} from '@/renderer/general-ability-effects';
import type { UnitMapPresentation } from '@/renderer/unit-map-presentation';

// #889: the Great General command effects are pure drawing. A recording context stands in for the canvas.

interface Call { readonly op: string; readonly args: readonly unknown[] }

function recordingContext(): { ctx: CanvasRenderingContext2D; calls: Call[]; styles: string[] } {
  const calls: Call[] = [];
  const styles: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => { calls.push({ op: prop, args }); };
    },
    set(_t, prop: string, value: unknown) {
      target[prop] = value;
      if (prop === 'strokeStyle' || prop === 'fillStyle') styles.push(String(value));
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, styles };
}

const style = { accent: '#123456', glow: '#abcdef' };
const drawCalls = (type: GeneralAbilityEffectType, progress = 0.4) => {
  const rec = recordingContext();
  drawGeneralAbilityEffect(rec.ctx, type, progress, 100, 100, 40, style);
  return rec;
};

describe('Great General command effects (#889)', () => {
  it('has a drawable effect for every type, at the start, middle and end of its life', () => {
    for (const type of GENERAL_ABILITY_EFFECT_TYPES) {
      for (const progress of [0, 0.5, 1]) {
        const { calls } = drawCalls(type, progress);
        expect(calls.length, `${type} at ${progress}`).toBeGreaterThan(0);
        expect(calls.filter(c => c.op === 'save')).toHaveLength(calls.filter(c => c.op === 'restore').length);
      }
      expect(isGeneralAbilityEffect(type)).toBe(true);
    }
    expect(isGeneralAbilityEffect('combat-flash')).toBe(false);
  });

  it('abilities differ in shape, not only in colour (readable without colour vision)', () => {
    const shape = (type: GeneralAbilityEffectType) => {
      const { calls } = drawCalls(type);
      return calls.map(c => c.op).filter(op => ['arc', 'lineTo', 'moveTo'].includes(op)).join(',');
    };
    const shapes = new Set(['general-rally', 'general-seize', 'general-last-stand', 'general-final-command'].map(t => shape(t as GeneralAbilityEffectType)));
    expect(shapes.size).toBe(4);
  });

  it('draws in the General\'s crest colours, except a Final Command which is gold', () => {
    expect(drawCalls('general-rally').styles).toContain('#123456');
    expect(drawCalls('general-seize').styles).toContain('#123456');
    const last = drawCalls('general-last-stand').styles;
    expect(last).toContain('#123456');
    expect(last).toContain('#abcdef');
    expect(drawCalls('general-final-command').styles).toContain('#f2c94c');
  });

  it('the reduced-motion variant is one steady ring that does not depend on progress', () => {
    const early = drawCalls('general-ability-static', 0.05);
    const late = drawCalls('general-ability-static', 0.95);
    expect(late.calls).toEqual(early.calls);
    expect(early.calls.filter(c => c.op === 'arc')).toHaveLength(1);
  });

  it('every moving effect fades out completely by the end of its life', () => {
    for (const type of ['general-rally', 'general-seize', 'general-final-command'] as const) {
      const rec = recordingContext();
      const alphas: number[] = [];
      const proxy = new Proxy(rec.ctx as unknown as Record<string, unknown>, {
        set(target, prop: string, value: unknown) {
          if (prop === 'globalAlpha') alphas.push(value as number);
          return Reflect.set(target, prop, value);
        },
      }) as unknown as CanvasRenderingContext2D;
      drawGeneralAbilityEffect(proxy, type, 1, 0, 0, 40, style);
      expect(Math.max(...alphas), type).toBeLessThanOrEqual(0.0001);
    }
  });
});

// --- the persistent hold marker --------------------------------------------------------------------------

function heldState(): GameState {
  const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'hold-marker-1' });
  const base = { type: 'warrior', owner: 'player', movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } as const;
  const held: Unit = { ...base, id: 'held', position: { q: 2, r: 2 }, lastStandHold: { formationId: 'f', defenseBonusMultiplier: 1.15, expiresTurn: state.turn + 1, generalDefinitionId: 'gen_hannibal' } } as Unit;
  const expired: Unit = { ...base, id: 'expired', position: { q: 3, r: 2 }, lastStandHold: { formationId: 'f', defenseBonusMultiplier: 1.15, expiresTurn: state.turn - 1, generalDefinitionId: 'gen_hannibal' } } as Unit;
  const plain: Unit = { ...base, id: 'plain', position: { q: 4, r: 2 } } as Unit;
  state.units = { ...state.units, held, expired, plain };
  return state;
}

function presentation(id: string, coord: { q: number; r: number }): UnitMapPresentation {
  return { coord, memberIds: [id], leadUnit: { id } as Unit, stackCount: 1, isSelected: false } as unknown as UnitMapPresentation;
}

describe('Last Stand hold marker (#889)', () => {
  const camera = new Camera();
  camera.setViewport(800, 600);
  camera.centerOn({ q: 3, r: 2 });

  it('marks a held stack and nothing else', () => {
    const state = heldState();
    const rec = recordingContext();
    drawLastStandHoldMarkers(rec.ctx, [presentation('held', { q: 2, r: 2 }), presentation('plain', { q: 4, r: 2 })], camera, state);
    expect(rec.calls.filter(c => c.op === 'stroke')).toHaveLength(1);
  });

  it('does not mark a hold that has expired', () => {
    const state = heldState();
    const rec = recordingContext();
    drawLastStandHoldMarkers(rec.ctx, [presentation('expired', { q: 3, r: 2 })], camera, state);
    expect(rec.calls).toHaveLength(0);
  });

  it('draws only the stacks it is given: a rival\'s hold the viewer cannot see is never passed in, so never drawn', () => {
    const state = heldState();
    const rec = recordingContext();
    drawLastStandHoldMarkers(rec.ctx, [], camera, state);
    expect(rec.calls).toHaveLength(0);
  });

  it('stops marking as soon as the survival save consumes the hold', () => {
    const state = heldState();
    const { lastStandHold: _consumed, ...rest } = state.units.held!;
    state.units.held = rest as Unit;
    const rec = recordingContext();
    drawLastStandHoldMarkers(rec.ctx, [presentation('held', { q: 2, r: 2 })], camera, state);
    expect(rec.calls).toHaveLength(0);
  });
});
